import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { FIXTURE_PRODUCT_FILES } from "./fixture-server";

const exported = exportProject(catalogScaleStore, { mode: "production" });
const fixtureFiles = FIXTURE_PRODUCT_FILES;
let server: Server;
let serverUrl: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path =
      requested === ""
        ? "index.html"
        : requested.endsWith("/")
          ? `${requested}index.html`
          : requested;
    const content = exported.files.get(path) ?? fixtureFiles.get(path);
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
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("El servidor de pruebas no tiene una dirección TCP.");
  }
  serverUrl = `http://127.0.0.1:${address.port}`;
});

function storeUrl(path: string): string {
  return new URL(path, serverUrl).toString();
}

test.afterAll(async () => {
  await new Promise<void>((resolveClosing, reject) => {
    server.close((error) => (error ? reject(error) : resolveClosing()));
  });
});

test("la home de escala conserva sus enlaces de producto sin JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(storeUrl("/"));
  await expect(
    page.locator('[data-solara-module="compact-product-grid"] [data-product-card]'),
  ).toHaveCount(12);
  await expect(
    page.locator('[data-solara-module="compact-product-grid"] a[href^="/productos/"]'),
  ).toHaveCount(24);
  await context.close();
});

test("navega nueve raíces y las subcategorías de Casa y Cocina", async ({ page }) => {
  await page.goto(storeUrl("/"));
  await page.locator(".solara-desktop-nav .solara-nav-dropdown > summary").click();
  await expect(page.getByRole("link", { name: "Casa", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cocina", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Textiles", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cerámica", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Textiles", exact: true }).click();
  await expect(page).toHaveURL(/\/categorias\/textiles\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Textiles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Casa", exact: true })).toBeVisible();
});

test("agrega descendientes, pagina Casa y expone el producto 50", async ({ page }) => {
  await page.goto(storeUrl("/categorias/casa/"));
  await expect(page.locator("[data-category-result-count]")).toHaveText("28 productos");
  await expect(page.getByRole("heading", { level: 2, name: "Explorar Casa" })).toBeVisible();
  await page.goto(storeUrl("/categorias/casa/pagina/2/"));
  await expect(page.getByRole("link", { name: "Anterior" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Pieza de escala 28");
  await page.goto(storeUrl("/productos/pieza-escala-50/"));
  await expect(page.getByRole("heading", { level: 1, name: "Pieza de escala 50" })).toBeVisible();
});
