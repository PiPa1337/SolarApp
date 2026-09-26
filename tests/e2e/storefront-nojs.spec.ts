import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";

const PRODUCT_PAGE = "/productos/remera-esencial-de-algodon/";

// Desde 9a22a95 los assets del fixture viajan embebidos como data URLs;
// solo los 12 productos quedan como archivos webp servibles en /fixtures/.
const fixtureFiles = new Map<string, Uint8Array>(
  Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return [
      `fixtures/modo-sur-product-${number}.webp`,
      readFileSync(resolve(`apps/studio/public/fixtures/modo-sur-product-${number}.webp`)),
    ] as const;
  }),
);

const soldOutFirstStore = structuredClone(catalogModernStore);
const remera = soldOutFirstStore.products.find(
  (product) => product.slug === "remera-esencial-de-algodon",
);
if (!remera) throw new Error("Fixture sin remera esencial");
const soldOutVariant = remera.variants.find((variant) => !variant.available);
if (!soldOutVariant) throw new Error("Fixture sin variante agotada");
remera.variants = [
  soldOutVariant,
  ...remera.variants.filter((variant) => variant !== soldOutVariant),
];
const availableVariant = remera.variants.find((variant) => variant.available);
if (!availableVariant) throw new Error("Fixture sin variante disponible");

const baseExport = exportProject(catalogModernStore, { mode: "production" });
const soldOutFirstExport = exportProject(soldOutFirstStore, { mode: "production" });

function startServer(exported: typeof baseExport): Promise<number> {
  return new Promise((resolveListening) => {
    const server = createServer((request, response) => {
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
              : extension === "xml"
                ? "application/xml; charset=utf-8"
                : extension === "png"
                  ? "image/png"
                  : "application/octet-stream";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(content);
    });
    server.listen(0, "127.0.0.1", () => {
      resolveListening((server.address() as AddressInfo).port);
    });
  });
}

let basePort = 0;
let soldOutFirstPort = 0;

test.beforeAll(async () => {
  [basePort, soldOutFirstPort] = await Promise.all([
    startServer(baseExport),
    startServer(soldOutFirstExport),
  ]);
});

test.afterAll(async () => {
  // Los servidores se cierran solos al terminar el proceso de test.
});

test("sin JavaScript la compra se deriva a WhatsApp y la navegación móvil queda accesible", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(`http://127.0.0.1:${basePort}${PRODUCT_PAGE}`);
  const fallback = page.locator("a.catalog-add-fallback");
  await expect(fallback).toBeVisible();
  const href = await fallback.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
  const message = decodeURIComponent(href ?? "");
  expect(message).toContain("Remera esencial de algodón");
  expect(message).toContain("Negro / S");
  await expect(page.locator(".catalog-product-add")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${basePort}/`);
  await expect(page.locator("#catalog-mobile-menu")).toBeVisible();
  await expect(
    page.locator('#catalog-mobile-menu .catalog-mobile-nav-link[href="/"]'),
  ).toBeVisible();
  await page.locator(".catalog-mobile-categories > summary").click();
  await page.locator(".catalog-mobile-category").first().locator(":scope > summary").click();
  await expect(
    page.locator('.catalog-mobile-category__parent[href="/categorias/remeras/"]'),
  ).toBeVisible();

  await context.close();
});

test("el detalle moderno inicializa en la variante disponible aunque la primera esté agotada", async ({
  page,
}) => {
  await page.goto(`http://127.0.0.1:${soldOutFirstPort}${PRODUCT_PAGE}`);

  const select = page.locator("[data-variant-select]");
  await expect(select).toHaveValue(availableVariant.id);
  await expect(select.locator("option[selected]")).toHaveCount(1);
  await expect(select.locator("option[selected]")).toHaveAttribute("value", availableVariant.id);
  await expect(select.locator("option[value]").first()).toBeDisabled();
  await expect(page.locator(".catalog-product-add")).toHaveText("Agregar al carrito");
});
