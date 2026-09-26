/**
 * Barrido A28 (2026-08-10) — Storefront LEGACY: carrito / variantes / checkout.
 * OWNER de `packages/modules/src/definitions.ts`. Se verifica contra el sitio
 * EXPORTADO de `catalogScaleStore` (patrón de scale-store.spec.ts), más dos
 * proyectos derivados deterministas para los casos que la fixture de escala no
 * cubre: variante agotada en PRIMERA posición y galería con dos imágenes.
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
function galleryProject() {
  const project = structuredClone(catalogScaleStore);
  const product = project.products.find((candidate) => candidate.id === "scale-product-50");
  if (!product) throw new Error("Fixture sin producto 50");
  product.imageIds = ["asset-jarra", "asset-manta"];
  const natural = product.variants.find((variant) => variant.title === "Natural");
  const musgo = product.variants.find((variant) => variant.title === "Musgo");
  if (!natural || !musgo) throw new Error("Fixture sin variantes de producto 50");
  natural.available = true;
  musgo.available = true;
  natural.imageId = "asset-jarra";
  musgo.imageId = "asset-manta";
  return project;
}

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
const galleryExport = exportProject(galleryProject(), { mode: "production" });
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
let galleryPort = 0;
let soldOutPort = 0;

test.beforeAll(async () => {
  [basePort, galleryPort, soldOutPort] = await Promise.all([
    startServer(baseExport),
    startServer(galleryExport),
    startServer(soldOutExport),
  ]);
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

test("C1: el toggle de carrito legacy declara aria-expanded, abre el drawer y cierra por 3 vías", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C1 · cart toggle" });
  await clearCart(page);
  const homeHtml = String(baseExport.files.get("index.html"));
  expect(homeHtml).toContain(
    'data-solara-cart-open data-open-cart data-cart-label="Carrito" aria-controls="solara-cart" aria-expanded="false"',
  );

  const trigger = page.locator("[data-solara-cart-open]").first();
  const drawer = page.locator("[data-cart-drawer]");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // Contrato T9: el aria-label del trigger es "Carrito N" (N = líneas), ya no
  // "Carrito vacío" (storefront-runtime:744-745).
  await expect(trigger).toHaveAttribute("aria-label", "Carrito 0");
  await expect(trigger.locator("[data-cart-count]")).toHaveText("0");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(drawer).toHaveAttribute("inert", "");

  await trigger.click();
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(drawer).not.toHaveAttribute("inert", "");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Cerrar carrito" })).toBeFocused();
  const backdrop = page.locator("[data-solara-cart-close].solara-cart-backdrop");
  await expect(backdrop).not.toHaveAttribute("hidden", "");

  await page.keyboard.press("Escape");
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await backdrop.click({ position: { x: 8, y: 240 } });
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

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

test("C3: sin JavaScript el detalle legacy ofrece el fallback de WhatsApp y oculta el botón", async ({
  browser,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C3 · noscript" });
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(storeUrl(basePort, PRODUCT_PATH));
  const fallback = page.locator("a.solara-add-fallback");
  await expect(fallback).toBeVisible();
  const href = await fallback.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
  const message = decodeURIComponent(href ?? "");
  expect(message).toContain("Producto: Pieza de escala 10");
  expect(message).toContain("Variante: Natural");
  expect(message).toContain("Precio: $");
  await expect(page.locator("[data-add-to-cart]")).toBeHidden();

  await page.goto(storeUrl(basePort, "/"));
  const searchTrigger = page.locator("a.solara-search-trigger");
  await expect(searchTrigger).toBeVisible();
  await expect(searchTrigger).toHaveAttribute("href", "/buscar/");
  await expect(page.locator("[data-solara-cart-open]")).toHaveAttribute("aria-expanded", "false");
  await context.close();
});

test("C4: la cantidad respeta los límites 1–99 en el detalle y dentro del drawer", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C4 · quantity limits" });
  await clearCart(page);
  await page.goto(storeUrl(basePort, PRODUCT_PATH));

  const quantity = page.locator('input[name="quantity"]');
  await expect(quantity).toHaveAttribute("type", "number");
  await expect(quantity).toHaveAttribute("min", "1");
  await expect(quantity).toHaveAttribute("max", "99");

  await quantity.fill("150");
  const catalogReconciled = page.waitForResponse((response) =>
    response.url().endsWith("/catalog-index.json"),
  );
  await quantity.press("Enter");
  await catalogReconciled;
  const drawer = page.locator("[data-cart-drawer]");
  const drawerQuantity = drawer.locator("[data-cart-quantity]").first();
  await expect(drawerQuantity).toHaveValue("99");
  await expect(page.locator("[data-cart-count]").first()).toHaveText("99");
  expect(((await storedCart(page)) as Array<Record<string, unknown>>)[0]?.quantity).toBe(99);

  await drawerQuantity.fill("0");
  await drawerQuantity.blur();
  await expect(drawerQuantity).toHaveValue("1");
  await drawerQuantity.fill("");
  await drawerQuantity.blur();
  await expect(drawerQuantity).toHaveValue("1");
  await drawerQuantity.fill("-2");
  await drawerQuantity.blur();
  await expect(drawerQuantity).toHaveValue("1");

  await drawerQuantity.fill("7");
  await drawerQuantity.blur();
  await expect(drawerQuantity).toHaveValue("7");
  await expect(page.locator("[data-cart-count]").first()).toHaveText("7");
  expect(((await storedCart(page)) as Array<Record<string, unknown>>)[0]?.quantity).toBe(7);
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

test("C6: las miniaturas de galería legacy intercambian la figura activa y sincronizan con la variante", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C6 · gallery thumbs" });
  await page.goto(storeUrl(galleryPort, "/productos/pieza-escala-50/"));

  const figures = page.locator("[data-gallery-image-id]");
  const thumbs = page.locator("[data-gallery-thumb]");
  await expect(figures).toHaveCount(2);
  await expect(thumbs).toHaveCount(2);
  await expect(figures.nth(0)).toHaveAttribute("data-gallery-active", "true");
  await expect(figures.nth(1)).toHaveAttribute("data-gallery-active", "false");
  await expect(thumbs.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "false");

  await thumbs.nth(1).click();
  await expect(figures.nth(0)).toHaveAttribute("data-gallery-active", "false");
  await expect(figures.nth(1)).toHaveAttribute("data-gallery-active", "true");
  await expect(thumbs.nth(0)).toHaveAttribute("aria-current", "false");
  await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "true");

  const select = page.locator("[data-variant-select]");
  await select.selectOption("scale-variant-50-b");
  await expect(figures.nth(1)).toHaveAttribute("data-gallery-active", "true");
  await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(page.locator("[data-product] [data-product-price]")).toHaveText("$ 25.000,00");

  await select.selectOption("scale-variant-50-a");
  await expect(figures.nth(0)).toHaveAttribute("data-gallery-active", "true");
  await expect(thumbs.nth(0)).toHaveAttribute("aria-current", "true");

  await thumbs.nth(1).click();
  await expect(figures.nth(1)).toHaveAttribute("data-gallery-active", "true");
});

test("C7: los desplegables de políticas del detalle legacy abren y cierran con estado nativo", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C7 · product disclosure" });
  await page.goto(storeUrl(basePort, PRODUCT_PATH));

  const shipping = page.locator(".solara-product-policies details").first();
  const shippingSummary = shipping.locator(":scope > summary");
  await expect(shippingSummary).toHaveText("Envíos");
  const shippingBody = shipping.locator(":scope > p");
  await expect(shippingBody).toBeHidden();
  await expect(shipping).not.toHaveAttribute("open", "");

  await shippingSummary.click();
  await expect(shipping).toHaveAttribute("open", "");
  await expect(shippingBody).toBeVisible();
  await expect(shippingBody).toContainText("Coordinamos el envío y su costo");

  await shippingSummary.click();
  await expect(shipping).not.toHaveAttribute("open", "");
  await expect(shippingBody).toBeHidden();

  const returns = page.locator(".solara-product-policies details").nth(1);
  await returns.locator(":scope > summary").click();
  await expect(returns).toHaveAttribute("open", "");
  await expect(returns.locator(":scope > p")).toContainText("La pieza debe conservar su embalaje");
});

test("C8: el form de búsqueda legacy envía la ruta y pinta resultados reales", async ({ page }) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C8 · search form" });
  await page.goto(storeUrl(basePort, "/buscar/"));

  const form = page.locator(".solara-search-form");
  await expect(form).toHaveAttribute("role", "search");
  await expect(form).toHaveAttribute("action", "/buscar/");
  await expect(form).toHaveAttribute("method", "get");
  const input = page.locator("#solara-search-input");
  await expect(input).toHaveAttribute("name", "q");

  await input.fill("Casa");
  await form.getByRole("button", { name: "Buscar" }).click();
  await expect(page).toHaveURL(/\/buscar\/\?q=Casa$/);
  await expect(page.locator("[data-search-results]")).toContainText("Pieza de escala 01", {
    timeout: 15_000,
  });

  await page.locator("a.solara-search-trigger").click();
  await expect(page).toHaveURL(/\/buscar\/$/);
  await expect(page.locator("#solara-search-input")).toHaveValue("");
});

test("C9: la toolbar de categoría legacy filtra por etiqueta/precio y ordena con conteo", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C9 · category toolbar" });
  await page.goto(storeUrl(basePort, "/categorias/casa/"));

  const toolbar = page.locator("[data-category-toolbar]");
  const resultCount = toolbar.locator("[data-category-result-count]");
  const grid = page.locator("[data-category-grid]");
  const cards = grid.locator("[data-product-card]");
  await expect(resultCount).toHaveText("28 productos");

  const filterDetails = toolbar.locator("details");
  await expect(filterDetails).not.toHaveAttribute("open", "");
  await filterDetails.locator(":scope > summary").click();
  await expect(filterDetails).toHaveAttribute("open", "");
  await expect(toolbar.locator("[data-category-tag]")).toBeVisible();
  await expect(toolbar.locator("[data-category-available]")).toBeVisible();
  await expect(toolbar.locator("[data-category-min-price]")).toBeVisible();
  await expect(toolbar.locator("[data-category-max-price]")).toBeVisible();

  await toolbar.locator("[data-category-tag]").selectOption("casa");
  await expect(resultCount).toHaveText("12 de 28 productos");
  await expect(grid.locator("[data-product-card]:visible")).toHaveCount(12);

  await toolbar.locator("[data-category-tag]").selectOption("");
  await toolbar.locator("[data-category-min-price]").fill("15000");
  await expect(resultCount).toHaveText("13 de 28 productos");
  await expect(grid.locator("[data-product-card]:visible")).toHaveCount(13);

  await toolbar.locator("[data-category-min-price]").fill("");
  await toolbar.locator("[data-category-sort]").selectOption("price-desc");
  await expect(cards.first()).toContainText("Pieza de escala 24");
  await toolbar.locator("[data-category-sort]").selectOption("price-asc");
  await expect(cards.first()).toContainText("Pieza de escala 01");
  await toolbar.locator("[data-category-sort]").selectOption("name");
  await expect(cards.first()).toContainText("Pieza de escala 01");
  await expect(resultCount).toHaveText("24 de 28 productos");
});

test("C11: el contrato de markup legacy declara los atributos que lee el runtime", async () => {
  test.info().annotations.push({ type: "contrato", description: "A28 · C11 · markup contract" });
  const productHtml = String(baseExport.files.get("productos/pieza-escala-10/index.html"));
  expect(productHtml).toContain('data-product data-product-id="scale-product-10"');
  expect(productHtml).toContain('data-default-variant="scale-variant-10-a"');
  expect(productHtml).toContain("data-solara-add-form");
  expect(productHtml).toContain("data-variant-select");
  expect(productHtml).toContain('data-variant-data="scale-variant-10-a"');
  expect(productHtml).toContain("data-add-to-cart");
  expect(productHtml).toContain('name="quantity" type="number" min="1" max="99"');
  expect(productHtml).toContain('data-gallery-thumb="asset-manta"');
  expect(productHtml).toContain(
    '<a class="solara-add-fallback" href="https://wa.me/5491123456789?text=',
  );

  const categoryHtml = String(baseExport.files.get("categorias/casa/index.html"));
  expect(categoryHtml).toContain('class="solara-category-toolbar" data-category-toolbar');
  expect(categoryHtml).toContain("data-category-result-count");
  expect(categoryHtml).toContain("data-category-available");
  expect(categoryHtml).toContain("data-category-tag");
  expect(categoryHtml).toContain("data-category-min-price");
  expect(categoryHtml).toContain("data-category-max-price");
  expect(categoryHtml).toContain("data-category-sort");
  expect(categoryHtml).toContain('rel="next" href="/categorias/casa/pagina/2/"');

  const searchHtml = String(baseExport.files.get("buscar/index.html"));
  expect(searchHtml).toContain(
    '<form class="solara-search-form" role="search" action="/buscar/" method="get">',
  );
  expect(searchHtml).toContain('name="q" type="search"');
});
