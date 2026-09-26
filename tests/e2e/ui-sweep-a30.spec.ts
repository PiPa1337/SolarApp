/**
 * Barrido A30 (2026-08-10) — Runtime público: búsqueda, filtros y orden.
 * OWNER de `packages/storefront-runtime/src/search.ts`. `index.ts` (búsqueda)
 * es READ-ONLY de A29: sus casos quedan cubiertos como regresiones de A29.
 *
 * Se verifica contra el sitio EXPORTADO (production) de `catalogScaleStore`
 * (búsqueda + categoría legacy con paginación) y de `catalogModernStore`
 * (diálogo de búsqueda y filtros modernos), patrón de catalog-modern.spec.ts.
 *
 * Contrato de 3 capas por control: (1) efecto real en estado/datos (cards
 * visibles/ordenadas, resultados renderizados, URL), (2) auto-feedback del
 * control (aria-expanded del diálogo, aria-live de resultados, conteo "X de Y",
 * estado vacío visible, foco), (3) contrato de datos (payload de la tarjeta
 * `data-product-*` → handler del runtime; `q` → search-index.json → ranking).
 *
 * Regresiones de A29 (index.ts): guard por término de 1 carácter, aria-live del
 * conteo de categoría y prefill/teclado del input visible en /buscar/ moderno.
 */
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";

const modernExport = exportProject(catalogModernStore, { mode: "production" });
const scaleExport = exportProject(catalogScaleStore, { mode: "production" });

import { FIXTURE_PRODUCT_FILES } from "./fixture-server";

const fixtureFiles = FIXTURE_PRODUCT_FILES;
function serve(files: Map<string, Uint8Array>) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path =
      requested === ""
        ? "index.html"
        : requested.endsWith("/")
          ? `${requested}index.html`
          : requested;
    const content = files.get(path) ?? fixtureFiles.get(path);
    if (content === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const extension = path.split(".").pop();
    const contentType =
      extension === "html"
        ? "text/html; charset=utf-8"
        : extension === "css"
          ? "text/css; charset=utf-8"
          : extension === "js"
            ? "text/javascript; charset=utf-8"
            : extension === "json"
              ? "application/json; charset=utf-8"
              : extension === "xml"
                ? "application/xml; charset=utf-8"
                : extension === "png"
                  ? "image/png"
                  : "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(content);
  });
  return new Promise<{ server: Server; url: string }>((resolveListening) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Sin direccion TCP");
      }
      resolveListening({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

let scaleServer: Server;
let scaleUrl: string;
let modernServer: Server;
let modernUrl: string;

test.beforeAll(async () => {
  const scale = await serve(scaleExport.files);
  const modern = await serve(modernExport.files);
  scaleServer = scale.server;
  scaleUrl = scale.url;
  modernServer = modern.server;
  modernUrl = modern.url;
});

test.afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolveClosing, reject) => {
      scaleServer.close((error) => (error ? reject(error) : resolveClosing()));
    }),
    new Promise<void>((resolveClosing, reject) => {
      modernServer.close((error) => (error ? reject(error) : resolveClosing()));
    }),
  ]);
});

function scaleUrlFor(path: string): string {
  return new URL(path, scaleUrl).toString();
}

function modernUrlFor(path: string): string {
  return new URL(path, modernUrl).toString();
}

async function openScaleFilters(page: import("@playwright/test").Page) {
  const disclosure = page
    .locator("details", { has: page.locator("summary", { hasText: /Filtr/ }) })
    .locator("summary");
  if (await disclosure.count()) await disclosure.click();
}

test("búsqueda: casos borde — vacío, whitespace, término corto y sin resultados", async ({
  page,
}) => {
  await page.goto(scaleUrlFor("/buscar/"));
  const results = page.locator("[data-search-results]");
  const resultCount = page.locator("[data-category-result-count]");
  await expect(results).toHaveAttribute("aria-live", "polite");
  // Sin query: catálogo completo paginado client-side (50 productos, 24/página).
  await expect(results.locator(".solara-search-result")).toHaveCount(50, { timeout: 15_000 });
  await expect(resultCount).toContainText("50 de 50");

  await page.goto(scaleUrlFor("/buscar/?q=%20%20"));
  await expect(results).toContainText("Escribí al menos 2 caracteres para buscar.");

  await page.goto(scaleUrlFor("/buscar/?q=a"));
  await expect(results).toContainText("Escribí al menos 2 caracteres para buscar.");

  await page.goto(scaleUrlFor("/buscar/?q=zzzqqq"));
  await expect(results).toContainText("No encontramos productos para esa búsqueda.");
});

test("búsqueda: matching real sin tildes y conteo exacto por categoría", async ({ page }) => {
  await page.goto(scaleUrlFor("/buscar/?q=bano"));
  const results = page.locator("[data-search-results] .solara-search-result");
  await expect(results).toHaveCount(2, { timeout: 15_000 });
  await expect(results.first()).toContainText("Pieza de escala 41");
  await expect(results.last()).toContainText("Pieza de escala 48");

  await page.goto(scaleUrlFor("/buscar/?q=organizacion"));
  await expect(page.locator("[data-search-results] .solara-search-result")).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(page.locator("[data-search-results]")).toContainText("Pieza de escala 47");
});

test("búsqueda: cap de 48 con aviso honesto y robots noindex", async ({ page }) => {
  await page.goto(scaleUrlFor("/buscar/?q=escala"));
  await expect(page.locator("[data-search-results] .solara-search-result")).toHaveCount(48, {
    timeout: 15_000,
  });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,follow");
});

test("búsqueda: tipear en el input filtra (Enter navega con q y prefill)", async ({ page }) => {
  await page.goto(scaleUrlFor("/buscar/?q=escala"));
  const input = page.locator("#solara-search-input");
  await expect(input).toHaveValue("escala");
  await input.fill("bano");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/buscar\/\?q=bano$/);
  await expect(page.locator("[data-search-results]")).toContainText("Pieza de escala 41", {
    timeout: 15_000,
  });
  await expect(page.locator("[data-search-results]")).toContainText("Pieza de escala 48", {
    timeout: 15_000,
  });
});

test("búsqueda: navegación con teclado sobre los resultados", async ({ page }) => {
  await page.goto(scaleUrlFor("/buscar/?q=escala"));
  await expect(page.locator("[data-search-results] .solara-search-result").first()).toBeVisible({
    timeout: 15_000,
  });
  const input = page.locator("#solara-search-input");
  const links = page.locator("[data-search-results] .solara-search-result a");
  await input.focus();
  await input.press("ArrowDown");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toBeFocused();
});

test("búsqueda: ranking real — marca pesa sobre categoría", async ({ page }) => {
  await page.goto(scaleUrlFor("/buscar/?q=Csa"));
  const first = page.locator("[data-search-results] .solara-search-result").first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  await expect(first).toContainText("Pieza de escala 02");
  await expect(first).toContainText("Tienda Referencia");
});

test("búsqueda: consulta sin coincidencias usa el copy público de vacío", async ({ page }) => {
  await page.goto(scaleUrlFor("/buscar/?q=caxza"));
  await expect(page.locator("[data-search-results]")).toContainText(
    "No encontramos productos para esa búsqueda.",
    { timeout: 15_000 },
  );
  await expect(page.locator("[data-search-results] a")).toHaveCount(0);
});

test("búsqueda: términos de 1 carácter cortan el query con el guard por término (fix A29)", async ({
  page,
}) => {
  await page.goto(scaleUrlFor("/buscar/?q=w%20z"));
  await expect(page.locator("[data-search-results]")).toContainText(
    "Escribí al menos 2 caracteres para buscar.",
    { timeout: 15_000 },
  );
});

test("búsqueda no-JS: el form de /buscar/ navega con GET", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(scaleUrlFor("/buscar/"));
  const form = page.locator(".solara-search-form");
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("action", "/buscar/");
  await expect(form).toHaveAttribute("method", "get");
  await page.locator("#solara-search-input").fill("escala");
  await page.locator(".solara-search-form button[type='submit']").click();
  await expect(page).toHaveURL(/\/buscar\/\?q=escala$/);
  await expect(page.locator("[data-category-result-count]")).toHaveText("Elegí una búsqueda");
  await context.close();
});

test("búsqueda principal: Enter envía el término del input visible", async ({ page }) => {
  await page.goto(modernUrlFor("/buscar/"));
  const input = page.locator("main #solara-search-input");

  await input.click();
  await input.pressSequentially("quilted");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/buscar\/\?q=quilted$/);
  await expect(page.locator("[data-search-results]")).toContainText("Campera quilted");
});

test("categoría: filtro por etiqueta aplica y el conteo es honesto", async ({ page }) => {
  await page.goto(scaleUrlFor("/categorias/casa/"));
  const grid = page.locator("[data-category-grid]");
  const count = page.locator("[data-category-result-count]");
  await expect(count).toHaveText("28 productos");
  await expect(grid.locator("[data-product-card]")).toHaveCount(24);

  await openScaleFilters(page);
  const tag = page.locator("[data-category-tag]");
  await tag.selectOption("casa");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(12);
  await expect(count).toHaveText("12 de 28 productos");

  await tag.selectOption("");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(24);
  await expect(count).toHaveText("24 de 28 productos");
});

test("moderno: filtro por opción de variante (select) filtra por opción", async ({ page }) => {
  await page.goto(modernUrlFor("/categorias/remeras/"));
  const grid = page.locator("[data-category-grid]");
  const talle = page.locator('[data-category-option][data-category-option-key="Talle"]');
  await expect(talle).toBeVisible();
  await talle.selectOption("Único");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(6);
  await expect(page.locator("[data-category-result-count]")).toHaveText("6 de 7 productos");

  await talle.selectOption("");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(7);
  await expect(page.locator("[data-category-result-count]")).toHaveText("7 de 7 productos");
});

test("categoría: precio min/max — límites exactos y estado vacío visible", async ({ page }) => {
  await page.goto(scaleUrlFor("/categorias/casa/"));
  const grid = page.locator("[data-category-grid]");
  await openScaleFilters(page);
  const min = page.locator("[data-category-min-price]");
  const max = page.locator("[data-category-max-price]");

  await max.fill("13000");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(4);
  await expect(page.locator("[data-category-result-count]")).toHaveText("4 de 28 productos");

  await max.fill("");
  await min.fill("13000");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(21);

  await max.fill("13000");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(1);
  await expect(grid.locator("[data-product-card]:not([hidden])").first()).toHaveAttribute(
    "data-product-title",
    "Pieza de escala 04",
  );

  await min.fill("200000");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(0);
  await expect(page.locator(".solara-empty-state")).toBeVisible();
  await expect(page.locator(".solara-empty-state")).toHaveText(
    "No hay productos que coincidan con estos filtros.",
  );
  await expect(page.locator("[data-category-result-count]")).toHaveText("0 de 28 productos");
});

test("categoría: orden por precio reordena de verdad (asc y desc)", async ({ page }) => {
  await page.goto(scaleUrlFor("/categorias/casa/"));
  const grid = page.locator("[data-category-grid]");
  const sort = page.locator("[data-category-sort]");
  const firstCard = () => grid.locator("[data-product-card]").first();

  await sort.selectOption("price-asc");
  await expect(firstCard()).toHaveAttribute("data-product-title", "Pieza de escala 01");
  await expect(grid.locator("[data-product-card]").last()).toHaveAttribute(
    "data-product-title",
    "Pieza de escala 24",
  );

  await sort.selectOption("price-desc");
  await expect(firstCard()).toHaveAttribute("data-product-title", "Pieza de escala 24");
  await expect(grid.locator("[data-product-card]").last()).toHaveAttribute(
    "data-product-title",
    "Pieza de escala 01",
  );

  await sort.selectOption("name");
  await expect(firstCard()).toHaveAttribute("data-product-title", "Pieza de escala 01");
});

test("categoría: combo de filtros + orden combina límites y reordena", async ({ page }) => {
  await page.goto(scaleUrlFor("/categorias/casa/"));
  const grid = page.locator("[data-category-grid]");
  await openScaleFilters(page);
  await page.locator("[data-category-tag]").selectOption("casa");
  await page.locator("[data-category-min-price]").fill("15000");
  await page.locator("[data-category-sort]").selectOption("price-asc");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(7);
  await expect(grid.locator("[data-product-card]:not([hidden])").first()).toHaveAttribute(
    "data-product-title",
    "Pieza de escala 12",
  );
  await expect(page.locator("[data-category-result-count]")).toHaveText("7 de 28 productos");
});

test("categoría: paginación prev/next con conteo honesto en página 2", async ({ page }) => {
  await page.goto(scaleUrlFor("/categorias/casa/"));
  const pagination = page.locator(".solara-pagination");
  await expect(pagination).toContainText("Página 1 de 2");
  await expect(page.getByRole("link", { name: "Anterior" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    "/categorias/casa/pagina/2/",
  );

  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/\/categorias\/casa\/pagina\/2\/$/);
  await expect(page.locator("[data-category-grid] [data-product-card]")).toHaveCount(4);
  await expect(pagination).toContainText("Página 2 de 2");
  await expect(page.getByRole("link", { name: "Siguiente" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Anterior" })).toHaveAttribute(
    "href",
    "/categorias/casa/",
  );
  await expect(page.locator("[data-category-result-count]")).toHaveAttribute(
    "data-category-total",
    "28",
  );

  await openScaleFilters(page);
  await page.locator("[data-category-tag]").selectOption("casa");
  await expect(page.locator("[data-category-grid] [data-product-card]:not([hidden])")).toHaveCount(
    2,
  );
  await expect(page.locator("[data-category-result-count]")).toHaveText("2 de 28 productos");

  await page.getByRole("link", { name: "Anterior" }).click();
  await expect(page).toHaveURL(/\/categorias\/casa\/$/);
  await expect(page.locator("[data-category-grid] [data-product-card]")).toHaveCount(24);
});

test("moderno: diálogo de búsqueda — abre con aria-expanded, tipear y Enter navega", async ({
  page,
}) => {
  await page.goto(modernUrlFor("/"));
  const trigger = page.locator("[data-catalog-search-open]").first();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const dialog = page.locator("#catalog-search-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  await page.locator("#catalog-search-input").fill("remera");
  await page.locator("#catalog-search-input").press("Enter");
  await expect(page).toHaveURL(/\/buscar\/\?q=remera$/);
  const results = page.locator("[data-search-results] .solara-search-result");
  await expect(results).toHaveCount(10, { timeout: 15_000 });
  await expect(results.first()).toContainText("Remera básica Crudo");
  await expect(page.locator("[data-search-results]")).toContainText("Remera esencial de algodón");
  await expect(page.locator("[data-search-results]")).toContainText("Remera esencial Negra");
});

test("moderno: diálogo cierra con Escape, devuelve el foco y conserva el link no-JS", async ({
  page,
}) => {
  await page.goto(modernUrlFor("/"));
  const trigger = page.locator("[data-catalog-search-open]").first();
  await trigger.click();
  const dialog = page.locator("#catalog-search-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog).toHaveAttribute("aria-labelledby", "catalog-search-title");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  const noscriptSearch = await page
    .locator("header noscript")
    .first()
    .evaluate((element) => element.textContent ?? "");
  expect(noscriptSearch).toContain("/buscar/");
});

test("moderno: página /buscar/ — resultados y sugerencia con link", async ({ page }) => {
  await page.goto(modernUrlFor("/buscar/?q=quilted"));
  await expect(page.locator("[data-search-results]")).toContainText("Campera quilted", {
    timeout: 15_000,
  });

  await page.goto(modernUrlFor("/buscar/?q=grixk"));
  await expect(page.locator("[data-search-results]")).toContainText("¿Quisiste decir gris?", {
    timeout: 15_000,
  });
  const link = page.locator("[data-search-results] a[href='/buscar/?q=gris']").first();
  await expect(link).toBeVisible();
  await expect(page.locator("[data-search-results]")).toHaveAttribute("aria-live", "polite");
});

test("moderno: categoría con filtros — etiqueta aplica y orden real", async ({ page }) => {
  await page.goto(modernUrlFor("/categorias/remeras/"));
  const grid = page.locator("[data-category-grid]");
  const count = page.locator("[data-category-result-count]");
  await expect(count).toHaveText("7 productos");
  await expect(grid.locator("[data-product-card]")).toHaveCount(7);

  await page.locator("[data-category-tag]").selectOption("diario");
  await expect(grid.locator("[data-product-card]:not([hidden])")).toHaveCount(4);
  await expect(count).toHaveText("4 de 7 productos");

  await page.locator("[data-category-sort]").selectOption("price-asc");
  await expect(grid.locator("[data-product-card]").first()).toHaveAttribute(
    "data-product-title",
    "Remera esencial de algodón",
  );
});
