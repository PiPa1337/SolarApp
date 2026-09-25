import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";

/**
 * Barrido A20 — Preview y CompareView (OWNER: features/Preview.tsx +
 * features/dashboard/CompareView.tsx).
 *
 * Contrato de 3 capas por control:
 * (1) click real -> efecto real (página renderizada, ancho del iframe,
 *     diálogo abierto con reporte), no visibilidad-only;
 * (2) auto-feedback del control (aria-pressed, valor del input, anuncio
 *     aria-live, conteo, disabled);
 * (3) contrato de datos (ruta -> renderPreviewHtml; zoom -> sessionStorage;
 *     compareIds -> buildCompareReport -> filas del diálogo).
 *
 * El servidor sirve una SNAPSHOT de apps/studio/dist: otros agentes del
 * barrido reconstruyen dist en paralelo y un build a mitad de carrera
 * entregaría un bundle inconsistente (app que arranca sin renderer de
 * preview). La copia se valida contra los assets referenciados por
 * index.html y se reintenta hasta obtener un snapshot completo.
 */

interface StudioSnapshotServer {
  server: Server;
  url: string;
  root: string;
}

function snapshotDist(): string {
  const sourceRoot = resolve("apps/studio/dist");
  const targetRoot = mkdtempSync(join(tmpdir(), "solara-a20-dist-"));
  const copyAll = (): void => {
    rmSync(targetRoot, { recursive: true, force: true });
    mkdirSync(targetRoot, { recursive: true });
    cpSync(sourceRoot, targetRoot, { recursive: true, dereference: true });
  };
  const references = (): string[] => {
    const html = readFileSync(join(sourceRoot, "index.html"), "utf8");
    return [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((match) => match[1] ?? "");
  };
  const complete = (): boolean => {
    if (
      readFileSync(join(sourceRoot, "index.html"), "utf8") !==
      readFileSync(join(targetRoot, "index.html"), "utf8")
    ) {
      return false;
    }
    return references().every((asset) => {
      const source = join(sourceRoot, asset);
      const target = join(targetRoot, asset);
      if (!existsSync(source) || !existsSync(target)) return false;
      return readFileSync(source).equals(readFileSync(target));
    });
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    copyAll();
    if (complete()) return targetRoot;
    void sleep(2_000);
  }
  throw new Error("No se pudo obtener un snapshot estable de apps/studio/dist.");
}

async function startSnapshotServer(): Promise<StudioSnapshotServer> {
  const root = snapshotDist();
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    // El launcher real siempre responde /__solara/session; el servidor de
    // pruebas emula el host no gestionado para que el editor no reciba un 404.
    if (requested === "/__solara/session") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ managed: false }));
      return;
    }
    const normalized = normalize(requested).replace(/^([/\\])+/, "");
    let file = resolve(join(root, normalized));
    if (!file.startsWith(root)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const contentTypes: Record<string, string> = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de Studio.");
  }
  return { server, url: `http://127.0.0.1:${address.port}`, root };
}

async function stopSnapshotServer(snapshot: StudioSnapshotServer): Promise<void> {
  await new Promise<void>((resolveClosing, reject) => {
    snapshot.server.close((error) => (error ? reject(error) : resolveClosing()));
  });
  rmSync(snapshot.root, { recursive: true, force: true });
}

let studioServer: StudioSnapshotServer;

test.beforeAll(async () => {
  studioServer = await startSnapshotServer();
});

test.afterAll(async () => {
  await stopSnapshotServer(studioServer);
});

test.setTimeout(120_000);

const HOME_TITLE = "Predeterminado | Vestite con lo que te representa";

async function resetIndexedDb(page: Page): Promise<void> {
  await page.goto(studioServer.url);
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
    timeout: 40_000,
  });
}

async function openDemoStore(page: Page): Promise<void> {
  await resetIndexedDb(page);
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 40_000,
  });
}

function previewFrame(page: Page, size = "desktop"): Locator {
  return page.locator(`iframe[title="Vista previa ${size}"]`);
}

/**
 * Estado del iframe leído desde el frame principal. Los callbacks de
 * expect.poll deben esperar el resultado con `await` antes de leer campos:
 * aplicar `?.campo` directo a la Promise devuelve siempre undefined.
 */
function previewIframeState(
  page: Page,
): Promise<{ srcdoc: string; zoom: string; width: number } | null> {
  return page.evaluate(() => {
    const frame = document.querySelector(".preview-stage iframe");
    if (!frame) return null;
    return {
      srcdoc: frame.getAttribute("srcdoc") ?? "",
      zoom: getComputedStyle(frame).zoom,
      width: frame.getBoundingClientRect().width,
    };
  });
}

async function expectPreviewTitle(page: Page, title: string): Promise<void> {
  await expect
    .poll(async () => (await previewIframeState(page))?.srcdoc ?? "", {
      timeout: 20_000,
      message: `El preview debería renderizar «${title}»`,
    })
    .toContain(`<title>${title}</title>`);
}

async function commitRoute(page: Page, route: string): Promise<void> {
  const routeInput = page.getByTestId("ui-preview-route");
  await routeInput.fill(route);
  await routeInput.press("Enter");
}

/** Vuelve al dashboard desde el editor con la tienda recién creada. */
async function createSecondStore(page: Page, name: string): Promise<void> {
  await createCleanStore(page, name);
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");
}

async function failPreviewRenderer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalPostMessage = Worker.prototype.postMessage;
    let previewFailurePending = true;
    Worker.prototype.postMessage = function (
      message: unknown,
      transferOrOptions?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (
        previewFailurePending &&
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "preview"
      ) {
        previewFailurePending = false;
        throw new Error("Fallo controlado del renderer de preview.");
      }
      return originalPostMessage.call(this, message, transferOrOptions as Transferable[]);
    };
  });
}

const compareCount = (page: Page) => page.locator(".dashboard-cosmic-comparebar__count");
const compareAction = (page: Page) => page.getByRole("button", { name: "Comparar", exact: true });

async function selectTwoForCompare(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Comparar tiendas" }).click();
  await expect(page.getByRole("checkbox", { name: "Comparar Predeterminado" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Comparar Tienda A20" })).toBeVisible();
  await expect(compareCount(page)).toHaveText("Elegí 2 tiendas para comparar");
  await expect(compareAction(page)).toBeDisabled();
  await page.getByRole("checkbox", { name: "Comparar Predeterminado" }).check();
  await expect(compareCount(page)).toHaveText("1 tienda seleccionada");
  await expect(compareAction(page)).toBeDisabled();
  await page.getByRole("checkbox", { name: "Comparar Tienda A20" }).check();
  await expect(compareCount(page)).toHaveText("2 tiendas seleccionadas");
  await expect(compareAction(page)).toBeEnabled();
}

function compareRow(page: Page, label: string): Locator {
  return page.getByTestId("ui-compare-dialog").locator(".compare-view__row", { hasText: label });
}

// ------------------------------------------------------------------ Preview

test("A20: preview — la ruta del selector cambia la página, el input y el anuncio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  await expectPreviewTitle(page, HOME_TITLE);

  const routeInput = page.getByTestId("ui-preview-route");
  const announce = page.getByTestId("ui-preview-route-announce");

  // V2 ya no publica la ruta de Contacto; el renderer responde como 404.
  await commitRoute(page, "/contacto/");
  await expectPreviewTitle(page, "Página no encontrada | Predeterminado");
  await expect(routeInput).toHaveValue("/contacto/");
  await expect(announce).toContainText("Vista previa: /contacto/");
  await expect(
    page.frameLocator('iframe[title="Vista previa desktop"]').locator("body"),
  ).toContainText("No encontramos esa página.");

  // Producto (primera del catálogo): título propio de la página de producto.
  await commitRoute(page, "/productos/remera-esencial-de-algodon/");
  await expectPreviewTitle(page, "Remera esencial de algodón | Predeterminado");
  await expect(announce).toContainText("Vista previa: /productos/remera-esencial-de-algodon/");
  await expect(
    page.frameLocator('iframe[title="Vista previa desktop"]').locator("body"),
  ).toContainText("Remera esencial de algodón", { timeout: 20_000 });

  // Categoría raíz y categoría de la muestra.
  await commitRoute(page, "/categorias/remeras/");
  await expectPreviewTitle(page, "Remeras | Predeterminado");

  // Volver al inicio restaura el título del home.
  await commitRoute(page, "/ruta-que-no-existe/");
  await expectPreviewTitle(page, "Página no encontrada | Predeterminado");
  await expect(
    page.frameLocator('iframe[title="Vista previa desktop"]').locator("body"),
  ).toContainText("No encontramos esa página.");

  await commitRoute(page, "/");
  await expectPreviewTitle(page, HOME_TITLE);
  await expect(announce).toContainText("Vista previa: /");

  // Contrato de datos: el datalist ofrece rutas que el renderer acepta.
  const contactoOption = page.locator('datalist option[value="/contacto/"]');
  await expect(contactoOption).toHaveCount(0);
});

test("A20: preview — la ruta confirma al perder foco y un valor vacío restaura la actual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const routeInput = page.getByTestId("ui-preview-route");
  const announce = page.getByTestId("ui-preview-route-announce");
  await routeInput.fill("/carrito/");
  await page.getByRole("button", { name: "75%" }).focus();

  await expect(routeInput).toHaveValue("/carrito/");
  await expect(announce).toContainText("Vista previa: /carrito/");
  await expectPreviewTitle(page, "Carrito | Predeterminado");

  await routeInput.fill("   ");
  await page.getByRole("button", { name: "100%" }).focus();

  await expect(routeInput).toHaveValue("/carrito/");
  await expect(announce).toContainText("Vista previa: /carrito/");
  await expectPreviewTitle(page, "Carrito | Predeterminado");
});

test("A20: preview - carrito conserva multiples lineas al cambiar de ruta", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-modo-sur-demo"));
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');
  await commitRoute(page, "/productos/remera-esencial-de-algodon/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText(
    "Remera esencial de algodón",
    { timeout: 20_000 },
  );
  await frame.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(frame.locator("[data-cart-count]").first()).toHaveText("1");

  await commitRoute(page, "/productos/remera-grafica-horizonte/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText("Remera gráfica Horizonte", {
    timeout: 20_000,
  });
  await frame.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(frame.locator("[data-cart-count]").first()).toHaveText("2");

  await commitRoute(page, "/carrito/");
  await expect(
    frame.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(2, {
    timeout: 20_000,
  });
});

test("A20: preview - persiste el carrito ante un cambio de ruta inmediato", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-modo-sur-demo"));
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');

  await commitRoute(page, "/productos/remera-esencial-de-algodon/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText(
    "Remera esencial de algodón",
    { timeout: 20_000 },
  );
  await frame.getByRole("button", { name: "Agregar al carrito" }).click();

  await commitRoute(page, "/productos/remera-grafica-horizonte/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText("Remera gráfica Horizonte", {
    timeout: 20_000,
  });
  await expect(frame.locator("[data-cart-count]").first()).toHaveText("1");
});

test("A20: preview - conserva el carrito aunque la segunda ruta se abra inmediatamente", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-modo-sur-demo"));
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');

  await commitRoute(page, "/productos/remera-esencial-de-algodon/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText("Remera esencial", {
    timeout: 20_000,
  });
  await frame.getByRole("button", { name: "Agregar al carrito" }).click();
  await commitRoute(page, "/productos/remera-grafica-horizonte/");

  await expect(frame.getByRole("heading", { level: 1 })).toContainText("Remera", {
    timeout: 20_000,
  });
  await expect(frame.locator("[data-cart-count]").first()).toHaveText("1");
});

test("A20: preview - una escritura tardía de una ruta anterior no pisa el carrito actual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-modo-sur-demo"));
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');

  await commitRoute(page, "/productos/remera-esencial-de-algodon/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText(
    "Remera esencial de algodón",
    { timeout: 20_000 },
  );
  const firstSession = await frame.locator("#solara-preview-cart").getAttribute("data-session");
  await frame.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(frame.locator("[data-cart-count]").first()).toHaveText("1");
  const firstCart = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("solara-cart:store-modo-sur-demo") ?? "[]"),
  );

  await commitRoute(page, "/productos/remera-grafica-horizonte/");
  await expect(frame.getByRole("heading", { level: 1 })).toContainText("Remera gráfica Horizonte", {
    timeout: 20_000,
  });
  const currentSession = await frame.locator("#solara-preview-cart").getAttribute("data-session");
  expect(currentSession).not.toBe(firstSession);
  await frame.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(frame.locator("[data-cart-count]").first()).toHaveText("2");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("solara-cart:store-modo-sur-demo") ?? "[]"),
      ),
    )
    .toHaveLength(2);

  const activeFrame = page.frames().find((candidate) => candidate !== page.mainFrame());
  expect(activeFrame?.parentFrame()).toBe(page.mainFrame());
  await activeFrame?.evaluate(
    ({ session, staleCart }) => {
      window.parent.postMessage(
        {
          type: "solara-preview-cart-write",
          key: "solara-cart:store-modo-sur-demo",
          value: JSON.stringify(staleCart),
          session,
        },
        "*",
      );
    },
    { session: firstSession, staleCart: firstCart },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const preservedCart = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("solara-cart:store-modo-sur-demo") ?? "[]"),
  );
  expect(preservedCart).toHaveLength(2);
});

test("A20: preview — zoom: escala del iframe, estado presionado y sesión", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "75%" }).click();
  await expect(page.getByRole("button", { name: "75%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => (await previewIframeState(page))?.zoom ?? "", { timeout: 10_000 })
    .toBe("0.75");
  expect(await page.evaluate(() => sessionStorage.getItem("solara-preview-zoom"))).toBe("75");

  await page.getByRole("button", { name: "50%" }).click();
  await expect(page.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await previewIframeState(page))?.zoom ?? "", { timeout: 10_000 })
    .toBe("0.5");
  expect(await page.evaluate(() => sessionStorage.getItem("solara-preview-zoom"))).toBe("50");

  await page.getByRole("button", { name: "100%" }).click();
  await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await previewIframeState(page))?.zoom ?? "", { timeout: 10_000 })
    .toBe("1");
  expect(await page.evaluate(() => sessionStorage.getItem("solara-preview-zoom"))).toBe("100");
});

test("A20: preview — tamaños: el iframe cambia de ancho, título y estado", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openDemoStore(page);

  // Escritorio: el iframe ocupa todo el ancho del stage.
  await expect
    .poll(async () => (await previewIframeState(page))?.width ?? 0, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1000);

  // Tablet: la transición termina en min(768px, 100%) — nunca ancho completo.
  await page.getByRole("button", { name: "Vista de tablet" }).click();
  await expect(page.getByRole("button", { name: "Vista de tablet" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Estado visual presionado (base.css .icon-button[aria-pressed="true"]).
  const tabletButton = page.getByRole("button", { name: "Vista de tablet" });
  const pressedBackground = await tabletButton.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  const idleBackground = await page
    .getByRole("button", { name: "Vista de escritorio" })
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(pressedBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(pressedBackground).not.toBe(idleBackground);
  await expect(previewFrame(page, "tablet")).toBeVisible();
  await expect
    .poll(async () => (await previewIframeState(page))?.width ?? 0, {
      timeout: 10_000,
      message: "El iframe de tablet debería medir 768 px",
    })
    .toBeLessThanOrEqual(790);

  // Móvil: min(390px, 100%).
  await page.getByRole("button", { name: "Vista móvil" }).click();
  await expect(page.getByRole("button", { name: "Vista móvil" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Vista de tablet" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(previewFrame(page, "mobile")).toBeVisible();
  await expect
    .poll(async () => (await previewIframeState(page))?.width ?? 0, {
      timeout: 10_000,
      message: "El iframe móvil debería medir 390 px",
    })
    .toBeLessThanOrEqual(420);

  // Volver a escritorio restaura el ancho completo.
  await page.getByRole("button", { name: "Vista de escritorio" }).click();
  await expect(page.getByRole("button", { name: "Vista de escritorio" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(previewFrame(page, "desktop")).toBeVisible();
  await expect
    .poll(async () => (await previewIframeState(page))?.width ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1000);
});

test("A20: preview — abrir el panel de edición desde la barra de preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const pane = page.locator("[data-studio-editor-pane]");
  await expect(pane).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Abrir panel de edición" }).click();
  await expect(pane).toHaveAttribute("aria-hidden", "false");
  await expect(pane).toHaveClass(/editor-pane--open/);
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();

  // El pane se cierra y el preview sigue operativo.
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  await expect(pane).toHaveAttribute("aria-hidden", "true");
  await expectPreviewTitle(page, HOME_TITLE);
});

test("A20: preview — la toolbar se puede operar con teclado", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const routeInput = page.getByTestId("ui-preview-route");
  await routeInput.focus();
  await routeInput.fill("/carrito/");
  await routeInput.press("Enter");
  await expect(page.getByTestId("ui-preview-route-announce")).toContainText(
    "Vista previa: /carrito/",
  );

  const zoom75 = page.getByRole("button", { name: "75%" });
  await zoom75.focus();
  await zoom75.press(" ");
  await expect(zoom75).toHaveAttribute("aria-pressed", "true");

  const tablet = page.getByRole("button", { name: "Vista de tablet" });
  await tablet.focus();
  await tablet.press("Enter");
  await expect(tablet).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('iframe[title="Vista previa tablet"]')).toBeVisible();
});

test("A20: preview — la carga del iframe anuncia el estado y se retira al terminar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const loadingObservation = page.evaluate(
    () =>
      new Promise<{ ariaLive: string | null; text: string } | null>((resolve) => {
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, 15_000);
        const observer = new MutationObserver(() => {
          const loading = document.querySelector<HTMLElement>('[data-testid="ui-preview-loading"]');
          if (!loading) return;
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve({ ariaLive: loading.getAttribute("aria-live"), text: loading.textContent ?? "" });
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }),
  );

  await commitRoute(page, "/carrito/");
  await expectPreviewTitle(page, "Carrito | Predeterminado");
  await expect(page.getByTestId("ui-preview-loading")).toHaveCount(0);

  await expect(await loadingObservation).toEqual({
    ariaLive: "polite",
    text: expect.stringContaining("Cargando vista previa"),
  });
});

test("A20: preview — el error del renderer ofrece recargar y recupera el iframe", async ({
  page,
}) => {
  await failPreviewRenderer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const error = page.locator(".preview-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText("La vista previa necesita atención");
  const reload = error.getByRole("button", { name: "Recargar vista previa", exact: true });
  await expect(reload).toBeEnabled();

  await reload.click();
  await expect(error).toHaveCount(0, { timeout: 30_000 });
  await expect(previewFrame(page)).toBeVisible({ timeout: 30_000 });
  await expectPreviewTitle(page, HOME_TITLE);
});

// --------------------------------------------------------------- Comparación

test("A20: comparación — selección, conteo, acción con 2 y reporte del diálogo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetIndexedDb(page);
  await createSecondStore(page, "Tienda A20");

  // Cambiar el fondo de Tienda A20 para que el reporte muestre diffs de tema.
  await page.locator(".dashboard-store-card").filter({ hasText: "Tienda A20" }).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await page.getByRole("tab", { name: "Tema de la tienda", exact: true }).click();
  await expect(page.getByTestId("ui-color-text-background")).toBeVisible();
  await page.getByTestId("ui-color-text-background").fill("#123456");
  await expect(page.locator(".save-indicator")).toContainText("Guardado", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  await selectTwoForCompare(page);
  await compareAction(page).click();

  const dialog = page.getByTestId("ui-compare-dialog");
  await expect(dialog).toBeVisible();

  // Efecto real: el reporte muestra ambos nombres y sus estados.
  await expect(dialog).toContainText("Predeterminado");
  await expect(dialog).toContainText("Tienda A20");
  await expect(dialog).toContainText("Sin sitio en disco");

  // Contrato de datos: conteos de Predeterminado (50 productos) vs la tienda
  // limpia vigente (5 productos placeholder).
  const productsRow = compareRow(page, "Productos activos");
  await expect(productsRow.locator("strong").nth(0)).toHaveText("50");
  await expect(productsRow.locator("strong").nth(1)).toHaveText("5");
  await expect(productsRow.locator(".compare-view__badge")).toHaveText("Difiere");
  const variantsRow = compareRow(page, "Variantes");
  await expect(variantsRow.locator("strong").nth(0)).toHaveText("60");
  await expect(variantsRow.locator("strong").nth(1)).toHaveText("5");
  const categoriesRow = compareRow(page, "Categorías");
  await expect(categoriesRow.locator("strong").nth(0)).toHaveText("14");

  // Tema: el fondo cambiado aparece con su valor y la insignia de diferencia.
  const backgroundRow = compareRow(page, "Color de fondo");
  await expect(backgroundRow.locator("strong").nth(0)).toHaveText("#f7f5f0");
  await expect(backgroundRow.locator("strong").nth(1)).toHaveText("#123456");
  await expect(backgroundRow.locator(".compare-view__badge")).toHaveText("Difiere");

  // Secciones: mismas secciones de plantilla, sin diffs de motion.
  await expect(dialog).toContainText("Misma estructura de secciones y mismo motion.");
});

test("A20: comparación — cerrar por Escape, X y Cerrar restaura el foco al botón", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetIndexedDb(page);
  await createSecondStore(page, "Tienda A20");
  await selectTwoForCompare(page);

  const actionButton = compareAction(page);

  // Escape cierra el diálogo y el foco vuelve al botón de acción.
  await actionButton.click();
  const dialog = page.getByTestId("ui-compare-dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(actionButton).toBeFocused();

  // La X cierra igual y restaura el foco.
  await actionButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar comparación" }).click();
  await expect(dialog).toBeHidden();
  await expect(actionButton).toBeFocused();

  // El botón Cerrar del pie cierra el diálogo y mantiene el modo de comparar.
  await actionButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Comparar Predeterminado" })).toBeVisible();
});

test("A20: comparación — quitar de comparar actualiza el conteo y deshabilita", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetIndexedDb(page);
  await createSecondStore(page, "Tienda A20");
  await selectTwoForCompare(page);

  // Quitar una: el conteo baja y la acción se deshabilita.
  await page.getByRole("checkbox", { name: "Comparar Tienda A20" }).uncheck();
  await expect(compareCount(page)).toHaveText("1 tienda seleccionada");
  await expect(compareAction(page)).toBeDisabled();

  // Quitar la segunda: vuelve al estado inicial del modo.
  await page.getByRole("checkbox", { name: "Comparar Predeterminado" }).uncheck();
  await expect(compareCount(page)).toHaveText("Elegí 2 tiendas para comparar");
  await expect(compareAction(page)).toBeDisabled();

  // Cancelar termina el modo: sin checkboxes ni conteo, y sin estado presionado.
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Comparar Predeterminado" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Comparar tiendas" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

// ------------------------------------------------------- rutas retiradas

test("A14: una ruta retirada (p. ej. /envios/) responde como no encontrada", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);
  await expectPreviewTitle(page, HOME_TITLE);

  // /envios/ fue retirada del catálogo V2: el preview debe conservar la ruta
  // solicitada y mostrar la página 404, sin volver al inicio silenciosamente.
  await commitRoute(page, "/envios/");
  await expectPreviewTitle(page, "Página no encontrada | Predeterminado");
});
