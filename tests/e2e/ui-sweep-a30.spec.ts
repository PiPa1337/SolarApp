/**
 * Barrido A30 (2026-08-10) — interacción del diálogo de búsqueda moderno.
 * Los resultados, filtros, ranking y paginación se cubren en los tests de
 * paquete y en `search-catalog.spec.ts`.
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

const modernExport = exportProject(catalogModernStore, { mode: "production" });

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

let modernServer: Server;
let modernUrl: string;

test.beforeAll(async () => {
  const modern = await serve(modernExport.files);
  modernServer = modern.server;
  modernUrl = modern.url;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosing, reject) => {
    modernServer.close((error) => (error ? reject(error) : resolveClosing()));
  });
});

function modernUrlFor(path: string): string {
  return new URL(path, modernUrl).toString();
}

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
