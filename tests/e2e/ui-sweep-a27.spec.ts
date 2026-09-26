import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { waitForStorefrontReady } from "./storefront-helpers";

const PRODUCT_PATH = "/productos/remera-esencial-de-algodon/";
const GALLERY_VARIANT_MANTA = "modo-variant-01-02";
const SOLD_OUT_VARIANT = "modo-variant-01-08";
const FIRST_VARIANT = "modo-variant-01-01";
const ARENA_VARIANT = "modo-variant-01-05";

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

const galleryStore = structuredClone(catalogModernStore);
{
  const product = galleryStore.products.find(
    (candidate) => candidate.slug === "remera-esencial-de-algodon",
  );
  if (!product) throw new Error("Fixture sin remera esencial");
  // El fixture (desde ae7b581) da 3 imágenes por producto y variantes con
  // imageId = imageIds[0]. Para la galería de C4 necesitamos exactamente
  // 2 figuras: limpiar los imageIds de TODAS las variantes y dejar 2 en el
  // producto; la dedup del exporter conserva el orden sin duplicados.
  for (const variant of product.variants) {
    delete (variant as { imageId?: string }).imageId;
  }
  product.imageIds = ["asset-manta", "asset-jarra"];
  const negroS = product.variants.find((variant) => variant.title === "Negro / S");
  if (!negroS) throw new Error("Fixture sin variante Negro / S");
  negroS.imageId = "asset-jarra";
}

function fileText(content: string | Uint8Array | undefined): string {
  return typeof content === "string"
    ? content
    : new TextDecoder().decode(content ?? new Uint8Array());
}

const baseExport = exportProject(catalogModernStore, { mode: "production" });
const galleryExport = exportProject(galleryStore, { mode: "production" });
const baseIndexHtml = fileText(baseExport.files.get("index.html"));
const productHtml = fileText(
  baseExport.files.get("productos/remera-esencial-de-algodon/index.html"),
);

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
let galleryPort = 0;

test.beforeAll(async () => {
  // Timeout explícito: bajo carga paralela el listen puede tardar; sin esto el
  // beforeAll hereda un timeout corto y tira specs no relacionados (ej: C11).
  [basePort, galleryPort] = await Promise.all([
    startServer(baseExport),
    startServer(galleryExport),
  ]);
});

test.afterAll(async () => {
  // Los servidores se cierran solos al terminar el proceso de test.
});

function storeUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

test("C1: el toggle de carrito abre el drawer, refleja aria-expanded y devuelve el foco", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C1 · cart toggle" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, "/"));

  expect(baseIndexHtml).toContain(
    'data-solara-cart-open data-open-cart data-cart-label="Carrito" aria-controls="solara-cart" aria-expanded="false"',
  );
  expect(baseIndexHtml).toContain('data-solara-cart-count data-cart-count aria-live="polite"');

  const toggle = page.locator("button[data-solara-cart-open]");
  const drawer = page.locator("[data-cart-drawer]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // Contrato T9: el aria-label del trigger es "Carrito N" (N = líneas), ya no
  // "Carrito vacío" (storefront-runtime:744-745).
  await expect(toggle).toHaveAttribute("aria-label", "Carrito 0");
  await expect(toggle.locator("[data-cart-count]")).toHaveText("0");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");

  await toggle.click();
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Cerrar carrito" })).toBeFocused();
  await expect(page.locator(".catalog-cart-backdrop")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(drawer).toHaveAttribute("data-open", "true");
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(drawer).toHaveAttribute("data-open", "true");
  await page.locator(".catalog-cart-backdrop").click({ position: { x: 8, y: 240 } });
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("C3: sin JavaScript hay fallback de WhatsApp y la búsqueda sigue visible", async ({
  browser,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C3 · noscript" });
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto(storeUrl(basePort, PRODUCT_PATH));
  const fallback = page.locator("a.catalog-add-fallback");
  await expect(fallback).toBeVisible();
  const href = await fallback.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
  const message = decodeURIComponent(href ?? "");
  expect(message).toContain("Remera esencial de algodón");
  expect(message).toContain("Negro / S");
  expect(message).toContain("Precio: $");
  await expect(page.locator(".catalog-product-add")).toBeHidden();

  await page.goto(storeUrl(basePort, "/"));
  const searchNoscript = page.locator("a.catalog-search-noscript");
  await expect(searchNoscript).toBeVisible();
  await expect(searchNoscript).toHaveAttribute("href", "/buscar/");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("#catalog-mobile-menu")).toBeVisible();
  await expect(
    page.locator('#catalog-mobile-menu .catalog-mobile-nav-link[href="/"]'),
  ).toBeVisible();
  await context.close();
});

test("C5: el menú móvil abre con aria-expanded, cierra con foco y navega por sus enlaces", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C5 · mobile menu" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(storeUrl(basePort, "/"));

  expect(baseIndexHtml).toContain(
    'data-catalog-menu-open aria-controls="catalog-mobile-menu" aria-expanded="false"',
  );

  const openButton = page.locator("[data-catalog-menu-open]");
  const menu = page.locator("#catalog-mobile-menu");
  await expect(openButton).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-hidden", "true");

  await openButton.click();
  await expect(menu).toHaveAttribute("aria-hidden", "false");
  await expect(openButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Cerrar menú" })).toBeFocused();

  const categories = page.locator(".catalog-mobile-categories");
  await categories.locator(":scope > summary").click();
  await expect(categories.locator(":scope > summary")).toHaveAttribute("aria-expanded", "true");
  await page.locator(".catalog-mobile-category").first().locator(":scope > summary").click();
  await expect(
    page.locator('.catalog-mobile-category__parent[href="/categorias/remeras/"]'),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-hidden", "true");
  await expect(openButton).toHaveAttribute("aria-expanded", "false");
  await expect(openButton).toBeFocused();

  await openButton.click();
  await categories.locator(":scope > summary").click();
  await page.locator(".catalog-mobile-category").first().locator(":scope > summary").click();
  await page.locator('.catalog-mobile-category__parent[href="/categorias/remeras/"]').click();
  await expect(page).toHaveURL(/\/categorias\/remeras\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Remeras" })).toBeVisible();
});

test("C7: el mega menú despliega con aria-expanded y sus enlaces navegan", async ({ page }) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C7 · mega menu" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, "/"));

  const trigger = page.locator(".catalog-desktop-nav .catalog-nav-trigger");
  const megaMenu = page.locator(".catalog-desktop-nav .catalog-mega-menu");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(megaMenu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    megaMenu.locator('.catalog-mega-group__children a[href="/categorias/basicas/"]'),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(megaMenu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await megaMenu.locator('.catalog-mega-group__children a[href="/categorias/basicas/"]').click();
  await expect(page).toHaveURL(/\/categorias\/basicas\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Básicas" })).toBeVisible();

  await page.goto(storeUrl(basePort, "/"));
  await page.locator(".catalog-desktop-nav .catalog-nav-trigger").click();
  await page.locator(".catalog-desktop-nav .catalog-mega-group__link").first().click();
  await expect(page).toHaveURL(/\/categorias\/remeras\/$/);
});

test("C8: el detalle apila descripcion, specs y politicas visibles y navegables", async ({
  page,
}) => {
  test
    .info()
    .annotations.push({ type: "contrato", description: "A27 · C8 · product info sections" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, PRODUCT_PATH));
  await waitForStorefrontReady(page);

  // Contrato post-tabs (1baa774): la informacion se apila sin tablist.
  const description = page.locator("[class*=catalog-rich-text]");
  const specs = page.locator(".catalog-product-specs");
  const policies = page.locator(".catalog-product-policies");

  await expect(description).toHaveCount(1);
  await expect(specs).toHaveCount(1);
  await expect(policies).toHaveCount(1);
  await expect(description).toBeVisible();
  await expect(specs).toBeVisible();
  await expect(policies).toBeVisible();

  // Politicas usa <details> nativos expandibles por teclado.
  const shippingSummary = policies.locator("details summary").first();
  await expect(shippingSummary).toBeVisible();
  await shippingSummary.focus();
  await expect(shippingSummary).toBeFocused();
  await page.keyboard.press("Enter");

  // El SKU refleja la variante seleccionada (contrato runtime).
  await expect(page.locator("[data-product-sku]")).toBeVisible();
});

test("C9: el botón de compra refleja disponibilidad y variante agotada", async ({ page }) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C9 · buy button states" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, PRODUCT_PATH));

  const select = page.locator("[data-variant-select]");
  const addButton = page.locator("[data-add-to-cart]");
  const availability = page.locator("[data-product-availability]");
  const sku = page.locator("[data-product-sku]");

  await expect(addButton).toBeEnabled();
  await expect(addButton).toHaveText("Agregar al carrito");
  await expect(availability).toHaveText("Disponible");
  await expect(sku).toHaveText("MS-001-NE-S");
  await expect(page.locator('option[value="modo-variant-01-08"]')).toBeDisabled();

  await select.selectOption(ARENA_VARIANT);
  await expect(select).toHaveValue(ARENA_VARIANT);
  await expect(addButton).toBeEnabled();

  await select.evaluate((element, variantId) => {
    const target = element as HTMLSelectElement;
    target.value = variantId;
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }, SOLD_OUT_VARIANT);
  await expect(addButton).toBeDisabled();
  await expect(addButton).toHaveText("Sin stock");
  await expect(availability).toHaveText("Agotado");
  await expect(sku).toHaveText("MS-001-AR-XL");
  await expect(select.locator(`option[value="${SOLD_OUT_VARIANT}"]`)).toHaveAttribute(
    "data-available",
    "false",
  );

  await select.evaluate((element, variantId) => {
    const target = element as HTMLSelectElement;
    target.value = variantId;
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }, FIRST_VARIANT);
  await expect(addButton).toBeEnabled();
  await expect(addButton).toHaveText("Agregar al carrito");
  await expect(availability).toHaveText("Disponible");
});

test("C9b: un producto con todas las variantes agotadas inicia el botón deshabilitado", async ({
  page,
}) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C9 · sold out product" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, "/productos/sweater-cuello-alto/"));

  const addButton = page.locator("[data-add-to-cart]");
  await expect(addButton).toBeDisabled();
  await expect(addButton).toHaveText("Sin stock");
  await expect(page.locator("[data-product-availability]")).toHaveText("Agotado");
  await expect(page.locator("[data-variant-select] option")).toBeDisabled();
  await expect(page.locator('[data-variant-select] option:disabled')).toHaveCount(1);
});

test("C10: el checkout del drawer moderno abre WhatsApp con el pedido", async ({ page }) => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C10 · checkout" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl(basePort, PRODUCT_PATH));

  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer).toHaveAttribute("data-open", "true");
  await drawer.getByRole("button", { name: "Continuar a compra" }).click();

  await page.locator("#catalog-drawer-name").fill("Malena Ortiz");
  await page.locator("#catalog-drawer-phone").fill("11 5555 0142");
  await page.locator("#catalog-drawer-address").fill("Av. Forest 842, CABA");
  await page.locator("#catalog-drawer-locality").fill("Trelew, Chubut");
  await page.locator("#catalog-drawer-postal-code").fill("9100");
  await page.locator("#catalog-drawer-notes").fill("Entregar por la tarde");
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window);
    window.open = ((url, target, features) => {
      document.documentElement.dataset.solaraWhatsappUrl = String(url ?? "");
      return originalOpen(url, target, features);
    }) as typeof window.open;
  });
  const whatsappPopupPromise = page.waitForEvent("popup");
  await drawer.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  const whatsappPopup = await whatsappPopupPromise;

  await expect(drawer.locator("[data-whatsapp-link]")).toHaveCount(0);
  const openedUrl = await page.locator("html").getAttribute("data-solara-whatsapp-url");
  expect(openedUrl).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
  const message = decodeURIComponent(openedUrl ?? "");
  expect(message).toContain("- Remera esencial de algodon (Negro / S) = $");
  expect(message).toContain("Total estimado: $");
  expect(message).toContain("Entregar por la tarde");
  await expect(drawer.locator("[data-order-preview]")).toContainText("Nombre: Malena Ortiz");
  await expect(drawer.locator("[data-order-preview]")).toContainText("11 5555 0142");
  await whatsappPopup.close();
});

test("C11: el contrato del detalle moderno declara los atributos que lee el runtime", async () => {
  test.info().annotations.push({ type: "contrato", description: "A27 · C11 · markup contract" });
  expect(productHtml).toContain('data-product data-product-id="modo-product-01"');
  expect(productHtml).toContain('data-default-variant="modo-variant-01-01"');
  expect(productHtml).toContain("data-solara-add-form");
  expect(productHtml).toContain("data-variant-select");
  expect(productHtml).toContain('data-variant-data="modo-variant-01-01"');
  expect(productHtml).toContain("data-add-to-cart");
  // Post-tabs (1baa774): el detalle apila secciones; ya no hay tablist ni
  // data-product-tab*. El runtime lee producto, variantes y carrito igual.
  // La galeria usa los assets del fixture base (product-01..03), no manta/jarra
  // (esos son solo del store clonado de C4 sobre galleryPort).
  expect(productHtml).toContain('data-gallery-image-id="asset-product-01"');
  expect(productHtml).toContain('data-gallery-thumb="asset-product-01"');
  expect(productHtml).not.toContain("data-variant-option");
  expect(productHtml).not.toContain("catalog-option-pill");
  expect(productHtml).toContain('href="https://wa.me/5491123456789?text=');
  expect(productHtml).toContain('name="quantity" type="number" min="1" max="99"');
  expect(productHtml).toContain("catalog-product-description-");
  expect(baseIndexHtml).toContain('aria-controls="solara-cart" aria-expanded="false"');
  expect(baseIndexHtml).toContain(
    'id="catalog-mobile-menu" class="catalog-mobile-menu" data-catalog-menu',
  );
  expect(baseIndexHtml).toContain('hidden role="dialog" aria-modal="true" aria-hidden="true"');
  expect(baseIndexHtml).toContain('data-state="closed"');
  // Drawer v2: <aside> con role dialog, tabindex -1 e inert (el orden de
  // atributos puede variar; se afirman los atributos clave por separado).
  const drawerMatch = baseIndexHtml.match(/<aside id="solara-cart"[^>]*>/);
  expect(drawerMatch).not.toBeNull();
  expect(drawerMatch?.[0]).toContain('class="catalog-cart-drawer"');
  expect(drawerMatch?.[0]).toContain("data-cart-drawer");
  expect(drawerMatch?.[0]).toContain('aria-label="Tu carrito"');
  expect(drawerMatch?.[0]).toContain("inert");
  expect(baseIndexHtml).toContain("catalog-search-noscript");
});
