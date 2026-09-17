/**
 * Barrido A12 — Dashboard: cards, biblioteca y salud (OWNER de
 * `apps/studio/src/features/Dashboard.tsx`).
 *
 * Contrato de 3 capas por control:
 *  (1) click real → efecto en las cards, el detalle o la navegación
 *      (no aserciones "visible-only");
 *  (2) auto-feedback: aria-pressed de pin/vista/comparar, conteo con
 *      aria-live, checked de los checkboxes, grupo "Fijadas", is-selected
 *      de la card, disabled/title coherentes;
 *  (3) datos: persistencia en localStorage/IndexedDB y payload del handler
 *      → receptor (selectCard → writeStoredSelectedId; togglePin →
 *      writePinnedIds; panel "Abrir tienda" → Studio con el proyecto;
 *      modo de cobro de variantes → cálculo mensual del detalle).
 *
 * Cubre el bin A12: búsqueda (filtra cards y renumera), filtro de estado,
 * orden (reordena de verdad), vista grilla/lista (layout + estado
 * presionado), pin (marca visible y persiste), checkboxes de comparar
 * (selección marcada + barra con conteo), botón Abrir tienda del detalle
 * (abre el editor), chips de salud (seleccionan y persisten) y acciones de la
 * biblioteca (Comparar tiendas, Respaldar todo en modo navegador).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(120_000);

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

async function openDashboard(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () => reject(new Error("La base quedó bloqueada.")));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
}

const visibleCount = (page: Page) => page.locator(".dashboard-cosmic-count");

function card(page: Page, name: string): Locator {
  return page.locator(".dashboard-store-card").filter({ hasText: name }).first();
}

const cardName = (page: Page, index: number): Locator =>
  page.locator(".dashboard-store-card").nth(index).locator(".dashboard-store-card__button strong");

const cardIndex = (page: Page, index: number): Locator =>
  page.locator(".dashboard-store-card").nth(index).locator(".dashboard-store-card__index");

async function selectCardByName(page: Page, name: string): Promise<void> {
  await card(page, name).locator(".dashboard-store-card__button").click();
}

function detailPanel(page: Page, name?: string): Locator {
  return page.getByRole("region", {
    name: name ? `Tienda seleccionada: ${name}` : "Tienda seleccionada",
  });
}

async function duplicateAs(page: Page, name: string): Promise<void> {
  await selectCardByName(page, "Predeterminado");
  await detailPanel(page, "Predeterminado")
    .getByRole("button", { name: "Duplicar", exact: true })
    .click();
  await page.getByTestId("ui-duplicate-name").fill(name);
  await page
    .getByRole("dialog", { name: "Duplicar tienda" })
    .getByRole("button", { name: "Duplicar", exact: true })
    .click();
  await expect(visibleCount(page)).toHaveText("2 visibles");
}

const toolbarCombobox = (page: Page, index: number): Locator =>
  page.locator(".dashboard-cosmic-toolbar").getByRole("combobox").nth(index);

async function waitForServer(url: string): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(url)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10_000, intervals: [100, 250, 500] },
    )
    .toBe(200);
}

async function startManagedServer(): Promise<{ process: ChildProcess; url: string; root: string }> {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-a12-managed-"));
  // Rango propio (5700-5849): evita colisiones con a13 (5400-5549) y a21 (5400-5699).
  const port = 5700 + Math.floor(Math.random() * 150);
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
  await waitForServer(url);
  return { process: serverProcess, url, root: applicationRoot };
}

async function stopManagedServer(process: ChildProcess, root: string): Promise<void> {
  if (process.exitCode === null) process.kill();
  rmSync(root, { recursive: true, force: true });
}

/**
 * Marca la tienda Predeterminado como desactualizada en IndexedDB (el mismo
 * receptor que lee `listProjectsWithRecovery` en modo navegador) para que el
 * bloque de salud renderice sus chips.
 */
async function seedOutdatedDemo(page: Page): Promise<void> {
  const seeded = await page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const transaction = db.transaction("projects", "readwrite");
          const store = transaction.objectStore("projects");
          const all = store.getAll();
          all.addEventListener("success", () => {
            const records = all.result as Array<Record<string, unknown>>;
            const record = records.find((item) => item.id === "store-modo-sur-demo");
            if (!record) {
              resolve(false);
              return;
            }
            store.put({ ...record, diskSiteStatus: "site-outdated" });
            resolve(true);
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
  );
  expect(seeded).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
}

test("la búsqueda filtra las cards, renumera los índices y actualiza el conteo de visibles", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta");
  const search = page.getByRole("searchbox", { name: "Buscar tienda" });

  await expect(visibleCount(page)).toHaveText("2 visibles");
  await expect(cardIndex(page, 0)).toHaveText("1");
  await expect(cardIndex(page, 1)).toHaveText("2");

  await search.fill("Zeta");
  await expect(visibleCount(page)).toHaveText("1 visibles");
  await expect(page.locator(".dashboard-store-card")).toHaveCount(1);
  await expect(cardName(page, 0)).toHaveText("Zeta");
  await expect(cardIndex(page, 0)).toHaveText("1");

  await search.fill("Predeterminado");
  await expect(visibleCount(page)).toHaveText("1 visibles");
  await expect(cardName(page, 0)).toContainText("Predeterminado");

  await search.fill("tienda inexistente");
  await expect(visibleCount(page)).toHaveText("0 visibles");
  await expect(page.getByTestId("ui-empty-state")).toContainText("No hay coincidencias");

  await search.fill("");
  await expect(visibleCount(page)).toHaveText("2 visibles");
  await expect(page.locator(".dashboard-store-card")).toHaveCount(2);
});

test("el filtro de estado cambia las cards y la selección se sincroniza con la lista visible", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta");
  const status = toolbarCombobox(page, 0);

  await selectCardByName(page, "Zeta");
  await expect(detailPanel(page, "Zeta")).toBeVisible();

  await status.selectOption("archived");
  await expect(visibleCount(page)).toHaveText("0 visibles");
  await expect(page.getByTestId("ui-empty-state")).toBeVisible();
  // La selección se conserva cuando el filtro la oculta (F2-H3): el detalle
  // sigue mostrando la tienda elegida en vez de quedar en blanco.
  await expect(detailPanel(page, "Zeta")).toBeVisible();

  await status.selectOption("all");
  await expect(visibleCount(page)).toHaveText("2 visibles");
  await expect(detailPanel(page, "Zeta")).toBeVisible();

  await selectCardByName(page, "Zeta");
  await detailPanel(page, "Zeta").getByRole("button", { name: "Archivar" }).click();
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(
    page.locator("[data-testid='ui-toast']").filter({ hasText: "Deshacer" }),
  ).toBeVisible();

  await status.selectOption("archived");
  await expect(visibleCount(page)).toHaveText("1 visibles");
  await expect(card(page, "Zeta").locator(".dashboard-store-card__status")).toHaveText("Archivada");
  await expect(detailPanel(page, "Zeta")).toBeVisible();

  await status.selectOption("active");
  await expect(visibleCount(page)).toHaveText("1 visibles");
  await expect(
    card(page, "Predeterminado").locator(".dashboard-store-card__status.is-active"),
  ).toHaveText("Activa");
  await expect(detailPanel(page, "Zeta")).toBeVisible();
});

test("el orden reordena las cards de verdad y actualiza el índice visible", async ({ page }) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta");
  const sort = toolbarCombobox(page, 1);

  await sort.selectOption("updated");
  await expect(cardName(page, 0)).toHaveText("Zeta");
  await expect(cardIndex(page, 0)).toHaveText("1");
  await expect(cardIndex(page, 1)).toHaveText("2");

  await sort.selectOption("name");
  await expect(cardName(page, 0)).toHaveText("Predeterminado");
  await expect(cardName(page, 1)).toHaveText("Zeta");

  await sort.selectOption("products");
  await expect(cardName(page, 0)).toHaveText("Predeterminado");

  await sort.selectOption("updated");
  await expect(cardName(page, 0)).toHaveText("Zeta");
});

test("la vista grilla/lista cambia el layout, marca el estado presionado y persiste", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta");
  const gridButton = page.getByRole("button", { name: "Vista en grilla" });
  const listButton = page.getByRole("button", { name: "Vista en lista" });
  const results = page.locator(".dashboard-cosmic-results");
  const grid = page.locator(".dashboard-cosmic-store-grid").first();

  await expect(gridButton).toHaveAttribute("aria-pressed", "true");
  await expect(listButton).toHaveAttribute("aria-pressed", "false");
  await expect(results).toHaveClass(/dashboard-cosmic-results--grid/);
  await expect
    .poll(() =>
      grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    )
    .toBeGreaterThan(1);

  await listButton.click();
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(gridButton).toHaveAttribute("aria-pressed", "false");
  await expect(results).toHaveClass(/dashboard-cosmic-results--list/);
  await expect
    .poll(() =>
      grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    )
    .toBe(1);
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-view"))).toBe(
    "list",
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(results).toHaveClass(/dashboard-cosmic-results--list/);

  await gridButton.click();
  await expect(results).toHaveClass(/dashboard-cosmic-results--grid/);
});

test("fijar marca la card con aria-pressed, la agrupa en Fijadas y persiste tras recargar", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta");
  await selectCardByName(page, "Zeta");
  const zetaPin = detailPanel(page, "Zeta").getByTestId("ui-detail-pin");
  const zetaId = await card(page, "Zeta")
    .locator(".dashboard-store-card__button")
    .getAttribute("data-store-card-id");
  expect(zetaId).toBeTruthy();

  await zetaPin.click();
  await expect(zetaPin).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Fijadas" })).toBeVisible();
  await expect(
    page
      .locator(".dashboard-cosmic-group")
      .filter({ hasText: "Fijadas" })
      .locator(".dashboard-store-card"),
  ).toHaveCount(1);
  await expect(page.locator(".dashboard-store-card").first().locator("strong")).toHaveText("Zeta");
  await expect(
    await page.evaluate(() => localStorage.getItem("solara-dashboard-pinned")),
  ).toContain(zetaId as string);

  await expect(detailPanel(page, "Zeta")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(detailPanel(page, "Zeta").getByTestId("ui-detail-pin")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Fijadas" })).toBeVisible();

  await detailPanel(page, "Zeta").getByTestId("ui-detail-pin").click();
  await expect(page.getByRole("heading", { name: "Fijadas" })).toHaveCount(0);
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-pinned"))).toBe(
    "[]",
  );
});

test("el modo comparar marca los checkboxes y la barra actualiza el conteo y el botón", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta");
  const toggle = page.getByRole("button", { name: "Comparar tiendas", exact: true });

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Elegí 2 tiendas para comparar")).toBeVisible();

  const checkboxes = page.getByTestId("ui-card-compare");
  await expect(checkboxes).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Comparar", exact: true })).toBeDisabled();

  await checkboxes.nth(0).check();
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(page.getByText("1 tienda seleccionada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar", exact: true })).toBeDisabled();

  await checkboxes.nth(1).check();
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(page.getByText("2 tiendas seleccionadas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar", exact: true })).toBeEnabled();

  await checkboxes.nth(0).uncheck();
  await expect(page.getByText("1 tienda seleccionada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(checkboxes).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("el botón Abrir tienda del detalle abre el editor con el proyecto", async ({ page }) => {
  await openDashboard(page);
  await selectCardByName(page, "Predeterminado");
  await detailPanel(page, "Predeterminado")
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
});

test("el modo de cobro de variantes alterna el cálculo y su estado visual", async ({ page }) => {
  await openDashboard(page);
  await page.evaluate(() => localStorage.removeItem("solara-store-variant-billing"));
  await selectCardByName(page, "Predeterminado");

  const panel = detailPanel(page, "Predeterminado");
  const toggle = panel.getByTestId("ui-variant-billing-toggle");
  const facts = panel.locator(".dashboard-store-detail__facts dd");
  const monthly = facts.nth(4);
  const chargingFact = await facts.nth(2).textContent();
  const chargingCost = await monthly.textContent();

  await expect(toggle).toHaveText("Cobrando variantes");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveClass(/is-charging/);
  await expect(toggle.locator("svg")).toHaveCount(1);
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toMatch(/123,\s*217,\s*138/);

  await toggle.click();

  await expect(toggle).toHaveText("No cobrando Variantes");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveClass(/is-not-charging/);
  await expect(facts.nth(2)).not.toHaveText(chargingFact ?? "");
  await expect(monthly).not.toHaveText(chargingCost ?? "");
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toMatch(/231,\s*190,\s*98/);

  await toggle.click();
  await expect(toggle).toHaveText("Cobrando variantes");
  await expect(monthly).toHaveText(chargingCost ?? "");
});

test("los chips de salud seleccionan la tienda, persisten y enfocan la card", async ({ page }) => {
  await openDashboard(page);
  await seedOutdatedDemo(page);

  const chip = page.getByTestId("ui-health-chip");
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText("Predeterminado");

  await detailPanel(page, "Predeterminado").getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(detailPanel(page)).toContainText("Seleccioná una tienda");

  await chip.click();
  const cardButton = card(page, "Predeterminado").locator(".dashboard-store-card__button");
  await expect(detailPanel(page, "Predeterminado")).toBeVisible();
  await expect(cardButton).toHaveAttribute("aria-pressed", "true");
  await expect(cardButton).toBeFocused();
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-selected"))).toBe(
    "store-modo-sur-demo",
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    card(page, "Predeterminado").locator(".dashboard-store-card__button"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(detailPanel(page, "Predeterminado")).toBeVisible();
});

test("el chip de salud con filtros que ocultan la tienda la muestra, la selecciona y limpia los filtros", async ({
  page,
}) => {
  await openDashboard(page);
  await seedOutdatedDemo(page);
  const search = page.getByRole("searchbox", { name: "Buscar tienda" });
  const status = toolbarCombobox(page, 0);

  await search.fill("texto que no coincide");
  await expect(visibleCount(page)).toHaveText("0 visibles");
  await page.getByTestId("ui-health-chip").click();
  await expect(search).toHaveValue("");
  await expect(visibleCount(page)).toHaveText("1 visibles");
  await expect(detailPanel(page, "Predeterminado")).toBeVisible();
  await expect(
    card(page, "Predeterminado").locator(".dashboard-store-card__button"),
  ).toHaveAttribute("aria-pressed", "true");

  await status.selectOption("archived");
  await expect(visibleCount(page)).toHaveText("0 visibles");
  await page.getByTestId("ui-health-chip").click();
  await expect(status).toHaveValue("active");
  await expect(visibleCount(page)).toHaveText("1 visibles");
  await expect(detailPanel(page, "Predeterminado")).toBeVisible();
  await expect(
    card(page, "Predeterminado").locator(".dashboard-store-card__button"),
  ).toHaveAttribute("aria-pressed", "true");
});

test("las acciones de la biblioteca reflejan su estado en modo navegador", async ({ page }) => {
  await openDashboard(page);
  const bulk = page.getByRole("button", { name: "Respaldar todo" });
  await expect(bulk).toBeDisabled();
  await expect(bulk).toHaveAttribute(
    "title",
    /modo navegador los respaldos se descargan por tienda/i,
  );
  await expect(page.getByRole("button", { name: "Comparar tiendas", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("A12: la X de creación se deshabilita mientras la tienda se crea", async ({ page }) => {
  test.setTimeout(240_000);
  const managed = await startManagedServer();
  try {
    await page.goto(managed.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Respaldar todo" })).toBeEnabled({
      timeout: 15_000,
    });

    // Demorar el inicio de la transacción de guardado hace observable el
    // estado «Creando» (la creación local es demasiado rápida para capturarla).
    await page.route("**/__solara/storage/projects", async (route) => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_500));
      await route.continue();
    });

    await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crear tienda" });
    await expect(dialog).toBeVisible();
    await page.getByLabel("Nueva tienda").fill("Tienda A12 X");
    for (let step = 1; step <= 3; step += 1) {
      await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
    }
    const closeCreation = page.getByRole("button", { name: "Cerrar creación" });
    // El nombre cambia a «Creando» durante la transacción: el locator por regex
    // resuelve en ambos estados.
    const submit = dialog.getByRole("button", { name: /Crear tienda desde plantilla|Creando/ });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText("Creando");
    // Auto-feedback: la X queda deshabilitada mientras `creatingProject`;
    // closeCreate cortaría en silencio y dejaría el diálogo a medias.
    await expect(closeCreation).toBeDisabled();
    // Al terminar la transacción la creación navega igual al editor.
    await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await stopManagedServer(managed.process, managed.root);
  }
});

test("A12: duplicar con éxito devuelve el foco a la card de origen", async ({ page }) => {
  await openDashboard(page);
  await duplicateAs(page, "Copia A12");
  // El camino de cancelar ya restauraba el foco; el de éxito ahora también:
  // la card de origen queda enfocada y su detalle seleccionado.
  const sourceCard = page.locator('[data-store-card-id="store-modo-sur-demo"]');
  await expect(sourceCard).toBeFocused();
  await expect(page.getByTestId("ui-toast")).toContainText("Tienda duplicada");
  await expect(detailPanel(page, "Predeterminado")).toBeVisible();
});

test("A12: restaurar muestra toast de confirmación y devuelve el foco a la card", async ({
  page,
}) => {
  await openDashboard(page);
  const storeName = "Tienda restaurable A12";
  await duplicateAs(page, storeName);
  await selectCardByName(page, storeName);
  await detailPanel(page, storeName).getByRole("button", { name: "Archivar", exact: true }).click();
  await page.getByTestId("ui-confirm-dialog").getByTestId("ui-confirm-accept").click();
  const archivedToast = page.getByTestId("ui-toast").filter({ hasText: "archivada" });
  await expect(archivedToast).toContainText("archivada");

  // Con el filtro «Todas» la card restaurada sigue visible: la restauración
  // debe dejarla seleccionada y enfocada (simetría con el foco de archivar).
  const status = toolbarCombobox(page, 0);
  await status.selectOption("all");
  await expect(visibleCount(page)).toHaveText("2 visibles");
  await selectCardByName(page, storeName);
  await expect(detailPanel(page, storeName)).toBeVisible();

  await detailPanel(page, storeName)
    .getByRole("button", { name: "Restaurar", exact: true })
    .click();
  const restoredCard = card(page, storeName).locator(".dashboard-store-card__button");
  const restoredToast = page.locator("[data-testid='ui-toast']").filter({ hasText: "restaurada" });
  await expect(restoredToast).toBeVisible();
  await expect(restoredToast).not.toContainText("Deshacer");
  await expect(restoredCard).toHaveAttribute("aria-pressed", "true");
  await expect(restoredCard).toBeFocused();
  await expect(card(page, storeName).locator(".dashboard-store-card__status")).toHaveText("Activa");
  await expect(detailPanel(page, storeName)).toBeVisible();
  await expect(
    detailPanel(page, storeName).getByRole("button", { name: "Archivar", exact: true }),
  ).toBeVisible();
});
