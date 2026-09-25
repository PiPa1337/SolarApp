/**
 * Barrido A14 — Studio: tabs, paneles, foco y tema del shell (OWNER:
 * `apps/studio/src/features/Studio.tsx`).
 *
 * Contrato de 3 capas por control: (1) click/tecla → efecto real en estado o
 * datos, (2) auto-feedback del control (aria-selected / aria-pressed /
 * aria-hidden / clase coherente con la lógica), (3) contrato de datos
 * (payload → receptor: pestaña → panel con data-tab, pane → localStorage,
 * tema → atributo `data-studio-theme` en <html> + localStorage).
 *
 * Cobertura: tabs (cambio de panel, aria-selected, roving tabindex, puntos
 * sucios), pane abrir/cerrar (clase, aria-hidden, foco restaurado, persistencia
 * y Ctrl+\), modo foco (cambio visual + foco restaurado + Escape y Ctrl+Shift+F),
 * tema del shell (dark-only, sin toggle),
 * breadcrumb volver y teclado de tabs
 * (flechas con wrap, Home/End).
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 180_000 : 120_000);

const FAKE_START = new Date("2026-08-10T08:00:00");

const DEMO_STORE_ID = "store-modo-sur-demo";

let server: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

async function wipeIndexedDb(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePromise, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolvePromise());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
}

async function openDemoStore(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await wipeIndexedDb(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator(`[data-store-card-id="${DEMO_STORE_ID}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
}

async function openMutableDemoStore(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await wipeIndexedDb(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await openMutableScaleStore(page, "Tienda A14 mutable");
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10_000 });
}

/** Selecciona la sección Hero en el Constructor de la tienda demo. */
async function openHeroInspector(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Constructor", exact: true })).toBeVisible();
  const hero = page.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  await hero.getByRole("button").first().click();
  await expect(page.getByRole("textbox", { name: "Título", exact: true })).toBeVisible();
}

const pane = (page: Page): Locator => page.locator("[data-studio-editor-pane]");

// La pestaña sucia anuncia el estado pendiente en su nombre accesible
// ("Resumen cambios sin revisar"), así que el matcher tolera el sufijo.
const tabByName = (page: Page, name: string): Locator =>
  page.getByRole("tab", { name: new RegExp(`^${name}(\\s.*)?$`, "i") });

/** Instala un probe que registra si el indicador llegó a estado "saving". */
async function installSavingProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as Window & {
      __solaraA14Probe?: { savingClass: boolean; savingText: boolean; spinner: boolean };
    };
    win.__solaraA14Probe = { savingClass: false, savingText: false, spinner: false };
    const indicator = document.querySelector(".save-indicator");
    if (!(indicator instanceof Element)) return;
    const update = () => {
      if (!win.__solaraA14Probe) return;
      if (indicator.classList.contains("save-indicator--saving")) {
        win.__solaraA14Probe.savingClass = true;
      }
      if (indicator.textContent?.includes("Guardando\u2026")) {
        win.__solaraA14Probe.savingText = true;
      }
      if (indicator.querySelector(".save-spinner") !== null) {
        win.__solaraA14Probe.spinner = true;
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(indicator, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
      characterData: true,
    });
    update();
  });
}

function readProbe(
  page: Page,
): Promise<{ savingClass: boolean; savingText: boolean; spinner: boolean }> {
  return page.evaluate(() => {
    const probe = (
      window as Window & {
        __solaraA14Probe?: { savingClass: boolean; savingText: boolean; spinner: boolean };
      }
    ).__solaraA14Probe;
    return {
      savingClass: probe?.savingClass ?? false,
      savingText: probe?.savingText ?? false,
      spinner: probe?.spinner ?? false,
    };
  });
}

/** Arranca el servidor gestionado (loopback con token) contra el dist actual. */
async function startManagedServer(portRange = 5700): Promise<{
  url: string;
  root: string;
  process: ChildProcess;
}> {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-a14-managed-"));
  // Rangos por test para que los servidores gestionados no colisionen entre
  // workers en paralelo (a15 usa 4300-4499, a21 5400-5699, a14 5700+).
  const port = portRange + Math.floor(Math.random() * 180);
  const token = randomBytes(24).toString("base64url");
  const url = `http://127.0.0.1:${port}`;
  const serverProcess: ChildProcess = spawn(
    process.execPath,
    [
      resolve("packages/exporter/scripts/serve.mjs"),
      resolve("apps/studio/dist"),
      String(port),
      token,
      applicationRoot,
    ],
    { cwd: resolve("."), stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${url}/__solara/session`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15_000, intervals: [100, 250, 500] },
    )
    .toBe(200);
  return { url, root: applicationRoot, process: serverProcess };
}

async function stopManagedServer(managed: { root: string; process: ChildProcess }): Promise<void> {
  if (managed.process.exitCode === null) managed.process.kill();
  rmSync(managed.root, { recursive: true, force: true });
}

async function openDemoStoreManaged(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 120_000,
  });
  const cards = page.locator(".dashboard-store-card");
  if ((await cards.count()) === 0) {
    // El servidor gestionado arranca con un projects/ temporal vacío. El
    // objetivo de estos casos es la persistencia/conflicto, no la fixture
    // protegida de escala, así que crear una tienda mutable evita depender de
    // un ID que sólo existe en IndexedDB del modo no gestionado.
    await createCleanStore(page, "Tienda A14 gestionada");
    return;
  }
  await cards.first().locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 120_000,
  });
}

test("A14.1 tabs — el click cambia el panel, aria-selected, roving tabindex y el contrato de datos del pane", async ({
  page,
}) => {
  await openDemoStore(page);

  // Estado inicial: Preparar activa, las demás inactivas, roving tabindex y
  // el pane arranca cerrado (se abre al elegir una pestaña).
  await expect(tabByName(page, "Preparar")).toHaveAttribute("aria-selected", "true");
  await expect(tabByName(page, "Preparar")).toHaveAttribute("tabindex", "0");
  for (const name of [
    "Resumen",
    "Catálogo",
    "Constructor",
    "Tema de la tienda",
    "Recursos",
    "SEO",
    "Exportar",
  ]) {
    await expect(tabByName(page, name)).toHaveAttribute("aria-selected", "false");
    await expect(tabByName(page, name)).toHaveAttribute("tabindex", "-1");
  }
  await expect(pane(page)).toHaveClass(/editor-pane--closed/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "true");

  // Click en Catálogo: efecto real (panel nuevo) y auto-feedback coherente.
  await tabByName(page, "Catálogo").click();
  await expect(tabByName(page, "Catálogo")).toHaveAttribute("aria-selected", "true");
  await expect(tabByName(page, "Preparar")).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
  await expect(pane(page)).toHaveAttribute("data-tab", "catalog");
  await expect(pane(page)).toHaveClass(/editor-pane--open/);
  await expect(tabByName(page, "Catálogo")).toBeFocused();

  // Contrato de datos: la tab activa declara aria-controls = id del tabpanel y
  // el tabpanel declara aria-labelledby = id de la tab activa.
  const paneId = await pane(page).getAttribute("id");
  expect(paneId).toMatch(/\S+/);
  await expect(tabByName(page, "Catálogo")).toHaveAttribute("aria-controls", String(paneId));
  await expect(pane(page)).toHaveAttribute("aria-labelledby", "studio-tab-catalog");
  await expect(pane(page)).toHaveAttribute("role", "tabpanel");
  await expect(pane(page)).toHaveAttribute("aria-hidden", "false");
});

test("A14.2 tabs — los puntos sucios aparecen con el cambio, se limpian al visitar y al guardar", async ({
  page,
}) => {
  await page.clock.install({ time: FAKE_START });
  await openMutableDemoStore(page);
  // Precarga las pestañas que el escenario visitará después antes de pausar
  // el reloj; así el lazy loading no queda esperando un timer artificial.
  await page.getByRole("tab", { name: /Resumen/ }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Constructor", exact: true })).toBeVisible();
  await openHeroInspector(page);
  const clockNow = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(clockNow + 5_000);

  // Sin cambios: ningún punto.
  await expect(page.getByTestId("ui-tab-dirty")).toHaveCount(0);

  // Un único cambio marca las 7 pestañas ajenas (la activa está visitada).
  const title = page.getByRole("textbox", { name: "Título", exact: true });
  await title.fill("Cambio único A14");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ui-tab-dirty")).toHaveCount(7);
  await expect(tabByName(page, "Resumen").getByTestId("ui-tab-dirty")).toBeVisible();
  await expect(tabByName(page, "Catálogo").getByTestId("ui-tab-dirty")).toBeVisible();
  await expect(tabByName(page, "Constructor").getByTestId("ui-tab-dirty")).toHaveCount(0);

  // Visitar una pestaña limpia su punto; el guardado limpia el resto.
  await tabByName(page, "Resumen").click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await expect(page.getByTestId("ui-tab-dirty")).toHaveCount(6);
  await expect(tabByName(page, "Resumen").getByTestId("ui-tab-dirty")).toHaveCount(0);

  // El reloj falso se reanuda sólo después de medir los estados transitorios;
  // así no adelantamos las animaciones del shell al usar pauseAt.
  await page.clock.resume();
  await expect(page.getByText(/^Guardado \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByTestId("ui-tab-dirty")).toHaveCount(0);
});

test("A14.3 pane — cerrar/abrir con efecto real, persistencia y foco restaurado al tab", async ({
  page,
}) => {
  await openDemoStore(page);
  await tabByName(page, "Catálogo").click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
  await expect(pane(page)).toHaveClass(/editor-pane--open/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "false");

  // Cerrar con la X: el pane se oculta y el foco vuelve al tab activo
  // (el contenido del pane deja de ser interactivo y no queda foco perdido).
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  await expect(pane(page)).toHaveClass(/editor-pane--closed/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "true");
  await expect(pane(page)).toBeHidden();
  await expect(tabByName(page, "Catálogo")).toBeFocused();
  let stored = await page.evaluate(() =>
    localStorage.getItem("solara-editor-pane:store-modo-sur-demo"),
  );
  expect(stored).toBe("closed");

  // Reabrir desde la toolbar: el panel vuelve y el feedback cambia.
  await page.getByRole("button", { name: "Abrir panel de edición" }).click();
  await expect(pane(page)).toHaveClass(/editor-pane--open/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "false");
  await expect(pane(page)).toBeVisible();
  stored = await page.evaluate(() =>
    localStorage.getItem("solara-editor-pane:store-modo-sur-demo"),
  );
  expect(stored).toBe("open");

  // Cualquier pestaña reabre el panel cerrado (H3-B3), para que el control
  // seleccionado y su tabpanel visible nunca queden desincronizados.
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  await expect(pane(page)).toHaveClass(/editor-pane--closed/);
  await tabByName(page, "Resumen").click();
  await expect(tabByName(page, "Resumen")).toHaveAttribute("aria-selected", "true");
  await expect(pane(page)).toHaveAttribute("data-tab", "overview");
  await expect(pane(page)).toHaveClass(/editor-pane--open/);
  await expect(pane(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await expect(pane(page)).toHaveAttribute("data-tab", "overview");
});

test("A14.4 pane — Ctrl+\\ cierra con el foco dentro del panel y lo devuelve al tab", async ({
  page,
}) => {
  await openMutableDemoStore(page);
  await openHeroInspector(page);
  const title = page.getByRole("textbox", { name: "Título", exact: true });
  await title.focus();
  await expect(title).toBeFocused();

  await page.keyboard.press("Control+\\");
  await expect(pane(page)).toHaveClass(/editor-pane--closed/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "true");
  await expect(tabByName(page, "Constructor")).toBeFocused();

  // Ctrl+\ vuelve a abrirlo.
  await page.keyboard.press("Control+\\");
  await expect(pane(page)).toHaveClass(/editor-pane--open/);
  await expect(pane(page)).toHaveAttribute("aria-hidden", "false");
  await expect(title).toBeVisible();
});

test("A14.5 pane — la persistencia del estado cerrado sobrevive a la recarga", async ({ page }) => {
  await openDemoStore(page);
  await tabByName(page, "Catálogo").click();
  await expect(pane(page)).toHaveClass(/editor-pane--open/);
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  await expect(pane(page)).toHaveClass(/editor-pane--closed/);

  // Recarga completa: el Studio vuelve a montarse con el pane cerrado.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await page.locator(`[data-store-card-id="${DEMO_STORE_ID}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await expect(pane(page)).toHaveClass(/editor-pane--closed/);
  await expect(pane(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Abrir panel de edición" })).toBeVisible();
});

test("A14.6 modo foco — cambio visual del shell, foco restaurado y salida con Escape/atajo", async ({
  page,
}) => {
  await openDemoStore(page);
  const toggle = page.getByTestId("ui-focus-toggle");
  const shell = page.locator(".studio-shell");
  const preview = page.locator('iframe[title="Vista previa desktop"]');
  await expect(preview).toBeVisible();

  // Entrar: el shell oculta chrome (topbar, nav, statusbar), deja el preview y
  // el foco va al botón flotante de salida.
  await toggle.click();
  await expect(shell).toHaveAttribute("data-studio-focus", "true");
  await expect(page.locator(".studio-topbar")).toBeHidden();
  await expect(page.locator(".studio-nav")).toBeHidden();
  await expect(page.getByTestId("ui-status-bar")).toBeHidden();
  await expect(preview).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const exit = page.getByTestId("ui-focus-exit");
  await expect(exit).toBeVisible();
  await expect(exit).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Salir del modo foco", exact: true }),
  ).toBeVisible();

  // Escape sale y devuelve el foco al toggle.
  await page.keyboard.press("Escape");
  await expect(shell).not.toHaveAttribute("data-studio-focus", "true");
  await expect(page.locator(".studio-topbar")).toBeVisible();
  await expect(exit).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // Ctrl+Shift+F entra de nuevo y el botón flotante queda enfocado.
  await page.keyboard.press("Control+Shift+f");
  await expect(shell).toHaveAttribute("data-studio-focus", "true");
  await expect(page.getByTestId("ui-focus-exit")).toBeFocused();

  // El botón flotante sale y restaura el foco al toggle.
  await page.getByTestId("ui-focus-exit").click();
  await expect(shell).not.toHaveAttribute("data-studio-focus", "true");
  await expect(toggle).toBeFocused();
});

test("A14.7 tema — el shell permanece oscuro aunque el sistema sea claro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(studioUrl);
  await wipeIndexedDb(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  const root = page.locator("html");

  // El shell no sigue la preferencia del sistema: su contrato es dark-only.
  await expect(root).toHaveAttribute("data-studio-theme", "dark");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe("rgb(8, 9, 10)");

  await page.locator(`[data-store-card-id="${DEMO_STORE_ID}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await expect(root).toHaveAttribute("data-studio-theme", "dark");
  await expect(page.getByTestId("ui-theme-toggle")).toHaveCount(0);
});

test("A14.8 tema — el shell sigue oscuro con preferencia del sistema oscura", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openDemoStore(page);
  const root = page.locator("html");

  // El sistema oscuro coincide, pero no hay un control de alternancia.
  await expect(root).toHaveAttribute("data-studio-theme", "dark");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe("rgb(8, 9, 10)");
  await expect(page.getByTestId("ui-theme-toggle")).toHaveCount(0);
});

test("A14.9 breadcrumb — volver al dashboard con la flecha y con el enlace Tiendas", async ({
  page,
}) => {
  await openDemoStore(page);

  // Enlace «Tiendas» del breadcrumb: vuelve al dashboard.
  await page.getByRole("button", { name: "Tiendas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  // La flecha «Volver a tiendas» de la topbar hace lo mismo desde el editor.
  await page.locator(`[data-store-card-id="${DEMO_STORE_ID}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toHaveCount(0);
});

test("A14.10 teclado de tabs — flechas con wrap, Home y End mueven foco y selección", async ({
  page,
}) => {
  await openDemoStore(page);
  const tablist = page.getByRole("tablist", { name: "Áreas de la tienda" });

  const preparar = tabByName(page, "Preparar");
  await preparar.focus();
  await expect(preparar).toBeFocused();

  // ArrowDown: mueve y selecciona la siguiente (comportamiento cableado).
  await page.keyboard.press("ArrowDown");
  await expect(tabByName(page, "Resumen")).toBeFocused();
  await expect(tabByName(page, "Resumen")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await expect(preparar).toHaveAttribute("aria-selected", "false");
  await expect(preparar).toHaveAttribute("tabindex", "-1");

  await page.keyboard.press("ArrowDown");
  await expect(tabByName(page, "Catálogo")).toBeFocused();
  await expect(tabByName(page, "Catálogo")).toHaveAttribute("aria-selected", "true");

  // ArrowUp: retrocede.
  await page.keyboard.press("ArrowUp");
  await expect(tabByName(page, "Resumen")).toBeFocused();
  await expect(tabByName(page, "Resumen")).toHaveAttribute("aria-selected", "true");

  // Home / End: primero y último.
  await page.keyboard.press("Home");
  await expect(tabByName(page, "Preparar")).toBeFocused();
  await expect(tabByName(page, "Preparar")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();

  await page.keyboard.press("End");
  await expect(tabByName(page, "Exportar")).toBeFocused();
  await expect(tabByName(page, "Exportar")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Exportar", exact: true })).toBeVisible();

  // Izquierda desde el último retrocede en la lista (sin wrap en el borde).
  await page.keyboard.press("ArrowLeft");
  await expect(tabByName(page, "SEO")).toBeFocused();
  await expect(tabByName(page, "SEO")).toHaveAttribute("aria-selected", "true");

  // El wrap está cableado sólo en el primer elemento: izquierda en Preparar
  // va al último y derecha en Exportar vuelve al primero.
  await page.keyboard.press("Home");
  await expect(tabByName(page, "Preparar")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tabByName(page, "Exportar")).toBeFocused();
  await expect(tabByName(page, "Exportar")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tabByName(page, "Preparar")).toBeFocused();
  await expect(tabByName(page, "Preparar")).toHaveAttribute("aria-selected", "true");
  await expect(tablist.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
});

// -------------------------------------------------- regresiones del barrido (A14)
// Regresión de A15/A20/A21 en Studio.tsx: el error de guardado
// anuncia el fallo y Reintentar queda accesible, el error de validación vive
// en la barra de estado, las rutas fuera de la muestra renderizan su página y
// el diálogo de conflicto restaura el foco al botón Guardar.

test("A14.11 error de guardado — el indicador anuncia el fallo y Reintentar es accesible (A15)", async ({
  page,
}) => {
  // Sabotea las escrituras a IndexedDB (sólo la store de proyectos) después
  // del arranque: el autosave falla de forma real y el shell entra en error.
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: [unknown, unknown?]) {
      const win = window as Window & { __solaraA14BlockWrites?: boolean };
      if (win.__solaraA14BlockWrites && this.name === "projects") {
        throw new Error("Escritura bloqueada por el probe A14.");
      }
      return originalPut.apply(this, args);
    };
  });
  await openMutableDemoStore(page);
  await openHeroInspector(page);

  const indicator = page.locator("output.save-indicator");
  await expect(indicator).toHaveClass(/save-indicator--saved/);

  await page.evaluate(() => {
    (window as Window & { __solaraA14BlockWrites?: boolean }).__solaraA14BlockWrites = true;
  });

  const title = page.getByRole("textbox", { name: "Título", exact: true });
  await title.fill("Cambio que falla A14");
  await expect(indicator).toHaveClass(/save-indicator--error/, { timeout: 15_000 });
  // El indicador (aria-live) anuncia el fallo; el botón Reintentar queda en
  // el DOM del topbar, visible, habilitado y enfocable por teclado.
  await expect(indicator).toContainText("Error al guardar");

  const retry = page.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await retry.focus();
  await expect(retry).toBeFocused();

  // No queda tapado por el iframe del preview: el centro del botón es el
  // elemento superior en ese punto (el click real lo alcanza).
  const hitTest = await retry.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      ok: top === element || element.contains(top),
      top:
        top instanceof Element
          ? { tag: top.tagName, className: top.className, text: top.textContent?.trim() }
          : null,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  });
  expect(hitTest.ok, JSON.stringify(hitTest)).toBe(true);

  // Reintentar dispara un intento real: Guardando… y vuelta al error.
  await installSavingProbe(page);
  await retry.click();
  await expect
    .poll(() => readProbe(page), { timeout: 15_000 })
    .toMatchObject({ savingClass: true, savingText: true, spinner: true });
  await expect(indicator).toHaveClass(/save-indicator--error/, { timeout: 15_000 });
});

test("A14.12 preview — una ruta retirada muestra la página no encontrada", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const routeInput = page.getByTestId("ui-preview-route");
  await routeInput.fill("/envios/");
  await routeInput.press("Enter");

  // /envios/ fue retirada del catálogo V2: el srcdoc debe conservar la ruta
  // solicitada y mostrar la página 404, sin heredar contenido de otra ruta.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const frame = document.querySelector(".preview-stage iframe");
          return frame?.getAttribute("srcdoc") ?? "";
        }),
      { timeout: 20_000 },
    )
    .toContain("<title>Página no encontrada | Predeterminado</title>");
  await expect(routeInput).toHaveValue("/envios/");
  await expect(page.getByTestId("ui-preview-route-announce")).toContainText(
    "Vista previa: /envios/",
  );
});

test("A14.13 guardado gestionado — el error de validación se muestra en la barra de estado (A15)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const managed = await startManagedServer(5700);
  try {
    await openDemoStoreManaged(page, managed.url);

    // El commit a disco falla: el shell recibe el mensaje en validationError.
    await page.route("**/__solara/storage/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Error de prueba A14" }),
      }),
    );

    await page.getByRole("tab", { name: "Resumen", exact: true }).click();
    const nameInput = page.getByLabel("Nombre de la tienda");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("A14 fallo de disco");
    await page.locator("[data-studio-save]").click();

    // El mensaje de validación vive en la statusbar (no queda tapado por el
    // preview como el bloque desbordado del topbar).
    await expect(page.getByTestId("ui-status-bar")).toContainText("Error de prueba A14", {
      timeout: 90_000,
    });
    await expect(page.locator("output.save-indicator")).toHaveClass(/save-indicator--error/);
  } finally {
    await stopManagedServer(managed);
  }
});

test("A14.14 conflicto — Escape conserva el borrador y restaura el foco al botón Guardar (A21)", async ({
  context,
  page,
}) => {
  test.setTimeout(300_000);
  const managed = await startManagedServer(5900);
  try {
    const pageB = await context.newPage();
    for (const target of [page, pageB]) {
      await openDemoStoreManaged(target, managed.url);
      await target.getByRole("tab", { name: "Resumen", exact: true }).click();
      await expect(target.getByLabel("Nombre de la tienda")).toBeVisible();
    }

    await page.getByLabel("Nombre de la tienda").fill("Guardado por pestaña A");
    await page.locator("[data-studio-save]").click();
    await expect(page.locator("output.save-indicator")).toHaveClass(
      /save-indicator--(?:saved|site-outdated)/,
      { timeout: 90_000 },
    );

    await pageB.getByLabel("Nombre de la tienda").fill("Borrador de la pestaña B");
    await pageB.locator("[data-studio-save]").click();
    const dialog = pageB.getByTestId("ui-conflict-dialog");
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    await expect(pageB.getByTestId("ui-conflict-keep")).toBeFocused();

    // Escape equivale a Conservar: el botón Guardar quedó desenfocado durante
    // el guardado (disabled) y el restauro debe recuperarlo, no caer en body.
    await pageB.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(pageB.getByTestId("ui-studio-notice")).toContainText("Borrador conservado");
    await expect(pageB.locator("[data-studio-save]")).toBeFocused();
    await expect(pageB.locator("[data-studio-save]")).toBeEnabled();

    // El indicador conserva el error y Reintentar vuelve a abrir el conflicto.
    await expect(pageB.locator("output.save-indicator")).toHaveClass(/save-indicator--error/);
    await pageB.getByRole("button", { name: "Reintentar" }).click();
    await expect(dialog).toBeVisible({ timeout: 90_000 });
  } finally {
    await stopManagedServer(managed);
  }
});

test("A14: el punto sucio no se anuncia a lectores de pantalla (span aria-hidden con title)", async ({
  page,
}) => {
  await openMutableDemoStore(page);
  await openHeroInspector(page);

  const title = page.getByRole("textbox", { name: "Título", exact: true });
  await title.fill("Cambio único A14");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  // La pestaña con cambios debe exponer el estado pendiente en su nombre
  // accesible; hoy el punto es aria-hidden y sólo lleva title.
  await expect(tabByName(page, "Resumen")).toHaveAccessibleName(/cambios sin revisar/i);
});
