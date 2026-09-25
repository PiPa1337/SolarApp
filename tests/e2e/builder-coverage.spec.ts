import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";

/**
 * Verificación integral del Constructor → sitio: cada módulo publicado debe
 * renderizar su `data-solara-module` en la página correcta del sitio
 * exportado. En V2, Contacto se publica dentro de Home y las páginas
 * independientes quedan archivadas sin HTML público.
 */

const exported = exportProject(catalogModernV2Store, { mode: "production" });

const HOME_MODULES = [
  "catalog-announcement",
  "catalog-header",
  "catalog-hero",
  "catalog-brand-strip",
  "catalog-product-grid",
  "catalog-category-bento",
  "catalog-testimonials",
  "catalog-newsletter-cta",
  "contact-form",
  "contact-channels",
  "catalog-footer",
];

let server: Server;
let serverUrl: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path = requested === "" || requested.endsWith("/") ? `${requested}index.html` : requested;
    const content = exported.files.get(path);
    if (content === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(Buffer.from(content));
  });
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto.");
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});

async function htmlOf(page: import("@playwright/test").Page, path: string): Promise<string> {
  const response = await page.goto(`${serverUrl}${path}`);
  expect(response?.status()).toBe(200);
  return page.content();
}

test("V2-B1: todas las secciones de Home del Constructor están en el sitio", async ({ page }) => {
  const html = await htmlOf(page, "/");
  const missing = HOME_MODULES.filter((id) => !html.includes(`data-solara-module="${id}"`));
  console.log("V2-B1 home faltantes:", JSON.stringify(missing));
  expect(missing).toEqual([]);
});

test("V2-B2: las páginas independientes quedan fuera del export y del header", async ({ page }) => {
  const standalone = await page.goto(`${serverUrl}/nosotros/`);
  expect(standalone?.status()).toBe(404);
  const contact = await page.goto(`${serverUrl}/contacto/`);
  expect(contact?.status()).toBe(404);
  const home = await htmlOf(page, "/");
  expect(home).toContain('class="solara-home-contact"');
  expect(home).not.toContain('href="/nosotros/"');
  expect(home).not.toContain('href="/contacto/"');
});

test("V2-B4: la página de producto incluye el detalle del Constructor", async ({ page }) => {
  const product = catalogModernV2Store.products.find((item) => item.status === "active");
  expect(product?.slug).toMatch(/\S+/);
  const html = await htmlOf(page, `/productos/${product?.slug}/`);
  expect(html).toContain('data-solara-module="catalog-product-detail"');
  expect(html).toContain('data-solara-module="catalog-header"');
  expect(html).toContain('data-solara-module="catalog-footer"');
  console.log("V2-B4 producto con detalle, header y footer");
});
