/**
 * Barrido A28 (2026-08-10) — Storefront LEGACY: carrito / variantes / checkout.
 * OWNER de `packages/modules/src/definitions.ts`. Se verifica contra el sitio
 * EXPORTADO de `catalogScaleStore` (patrón de scale-store.spec.ts) y un proyecto
 * derivado para comprobar una variante agotada en PRIMERA posición.
 *
 * Contrato de 3 capas por control: (1) click real → efecto en estado/datos,
 * (2) auto-feedback del control (aria-expanded / aria-current / data-open /
 * disabled / detalles nativos / conteo), (3) contrato de datos (payload del
 * formulario → línea del carrito en localStorage, opción del select, mensaje
 * wa.me).
 *
 * Los comportamientos interactivos viven en el runtime (A29): si un control
 * falla por comportamiento del runtime queda cubierto como regresión de A29.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import { type ExportResult, exportProject } from "@solara/exporter";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";

import { FIXTURE_PRODUCT_FILES } from "./fixture-server";

const FIXTURE_FILES = FIXTURE_PRODUCT_FILES;
function soldOutFirstProject() {
  const project = structuredClone(catalogScaleStore);
  const product = project.products.find((candidate) => candidate.id === "scale-product-10");
  if (!product) throw new Error("Fixture sin producto 10");
  const natural = product.variants.find((variant) => variant.title === "Natural");
  const musgo = product.variants.find((variant) => variant.title === "Musgo");
  if (!natural || !musgo) throw new Error("Fixture sin variantes de producto 10");
  natural.available = false;
  natural.stockStatus = "out_of_stock" as const;
  musgo.available = true;
  musgo.stockStatus = "in_stock" as const;
  musgo.imageId = "asset-jarra";
  return project;
}

const baseExport = exportProject(catalogScaleStore, { mode: "production" });
const soldOutExport = exportProject(soldOutFirstProject(), { mode: "production" });

function startServer(exported: ExportResult): Promise<number> {
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
      const content = exported.files.get(path) ?? FIXTURE_FILES.get(path);
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
    server.listen(0, "127.0.0.1", () => {
      resolveListening((server.address() as AddressInfo).port);
    });
  });
}

let basePort = 0;
let soldOutPort = 0;

test.beforeAll(async () => {
  [basePort, soldOutPort] = await Promise.all([startServer(baseExport), startServer(soldOutExport)]);
});

function storeUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

const STORAGE_KEY = "solara-cart:store-casa-luma-scale";
const PRODUCT_PATH = "/productos/pieza-escala-10/";

async function clearCart(page: Page) {
  await page.goto(storeUrl(basePort, "/"));
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
}

function storedCart(page: Page) {
  return page.evaluate(
    (key) => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
    [STORAGE_KEY] as const,
  );
}

test("C2: agregar al carrito legacy crea la línea, actualiza conteo/totales y prepara WhatsApp", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C2 · add-to-cart" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await clearCart(page);
  await page.goto(storeUrl(basePort, PRODUCT_PATH));

  const addButton = page.getByRole("button", { name: "Agregar al carrito" });
  await expect(addButton).toBeEnabled();
  await page.locator('input[name="quantity"]').fill("2");
  await addButton.click();

  const drawer = page.locator("[data-cart-drawer]");
  const trigger = page.locator("[data-solara-cart-open]").first();
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(trigger.locator("[data-cart-count]")).toHaveText("2");
  await expect(trigger).toHaveAttribute("aria-label", "Carrito 2");
  const line = drawer.locator(".solara-cart-line").first();
  await expect(line).toContainText("Pieza de escala 10");
  await expect(line).toContainText("Natural");
  await expect(drawer.locator("[data-cart-total]")).toHaveText("$ 29.000,00");
  await expect(line).toContainText("$ 29.000,00");

  await page.keyboard.press("Escape");
  await page.locator('input[name="quantity"]').fill("1");
  await addButton.click();
  await expect(trigger.locator("[data-cart-count]")).toHaveText("3");
  await expect(drawer.locator("[data-cart-total]")).toHaveText("$ 43.500,00");

  const stored = (await storedCart(page)) as Array<Record<string, unknown>>;
  expect(stored).toHaveLength(1);
  expect(stored[0]).toEqual(
    expect.objectContaining({
      productId: "scale-product-10",
      variantId: "scale-variant-10-a",
      sku: "CL-SCL-010-A",
      unitPrice: 1450000,
      quantity: 3,
      available: true,
    }),
  );

  await drawer.getByLabel("Nombre").fill("Malena Ortiz");
  await drawer.getByLabel("Teléfono").fill("11 5555 0142");
  await drawer.getByLabel("Dirección o punto de entrega").fill("Av. Forest 842, CABA");
  await drawer.getByLabel("Localidad / Provincia").fill("Trelew, Chubut");
  await drawer.getByLabel("Código postal").fill("9100");
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window);
    window.open = ((url, target, features) => {
      document.documentElement.dataset.solaraWhatsappUrl = String(url ?? "");
      return originalOpen(url, target, features);
    }) as typeof window.open;
  });
  const whatsappPopupPromise = page.waitForEvent("popup");
  await drawer.locator('button[type="submit"]').click();
  const whatsappPopup = await whatsappPopupPromise;
  await expect(drawer.locator("[data-whatsapp-link]")).toHaveCount(0);
  const openedUrl = await page.locator("html").getAttribute("data-solara-whatsapp-url");
  expect(openedUrl).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
  const message = decodeURIComponent(openedUrl ?? "").replace(/[\u202F\u00A0]/g, " ");
  expect(message).toContain("3x Pieza de escala 10 (Natural)");
  expect(message).not.toContain("[CL-SCL-010-A]");
  expect(message).toContain("Total estimado: $ 43.500,00");
  await whatsappPopup.close();

  await page.reload();
  await page.locator("[data-solara-cart-open]").first().click();
  const reloadedDrawer = page.locator("[data-cart-drawer]");
  await expect(reloadedDrawer.locator(".solara-cart-line")).toHaveCount(1);
  await expect(reloadedDrawer.locator("[data-cart-quantity]").first()).toHaveValue("3");
  await reloadedDrawer.locator("[data-cart-remove]").first().click();
  await expect(reloadedDrawer.locator(".solara-cart-line")).toHaveCount(0);
  await expect(trigger.locator("[data-cart-count]")).toHaveText("0");
  await expect(reloadedDrawer).toContainText("Tu carrito está vacío");
});

test("C5: con la primera variante agotada el select inicia en la primera DISPONIBLE", async ({
  page,
}) => {
  test
    .info()
    .annotations.push({ type: "contrato", description: "A28 · C5 · sold-out-first variant" });
  await page.goto(storeUrl(soldOutPort, PRODUCT_PATH));

  const select = page.locator("[data-variant-select]");
  await expect(select).toHaveValue("scale-variant-10-b");
  await expect(
    page.locator('[data-variant-select] option[value="scale-variant-10-a"]'),
  ).toBeDisabled();
  await expect(
    page.locator('[data-variant-select] option[value="scale-variant-10-a"]'),
  ).not.toHaveAttribute("selected", "");
  await expect(
    page.locator('[data-variant-select] option[value="scale-variant-10-b"]'),
  ).toHaveAttribute("selected", "");

  await expect(page.locator("[data-product]")).toHaveAttribute(
    "data-default-variant",
    "scale-variant-10-b",
  );
  await expect(page.locator("[data-product] [data-product-price]")).toHaveText("$ 15.000,00");
  await expect(page.locator("[data-product] [data-product-sku]")).toHaveText("CL-SCL-010-B");
  await expect(page.locator("[data-product] [data-product-availability]")).toHaveText("Disponible");
  const addButton = page.getByRole("button", { name: "Agregar al carrito" });
  await expect(addButton).toBeEnabled();

  const firstFigure = page.locator('[data-gallery-image-id="asset-manta"]');
  const secondFigure = page.locator('[data-gallery-image-id="asset-jarra"]');
  await expect(firstFigure).toHaveAttribute("data-gallery-active", "false");
  await expect(secondFigure).toHaveAttribute("data-gallery-active", "true");

  await addButton.click();
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer.locator(".solara-cart-line")).toContainText("Musgo");
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  const stored = (await storedCart(page)) as Array<Record<string, unknown>>;
  expect(stored[0]).toEqual(
    expect.objectContaining({ variantId: "scale-variant-10-b", unitPrice: 1500000 }),
  );
});
