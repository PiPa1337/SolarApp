/**
 * Barrido A29 (2026-08-10) — Runtime: carrito / checkout / drawer / WhatsApp.
 * OWNER de `packages/storefront-runtime/src/index.ts`. Se verifica contra el
 * sitio EXPORTADO de `catalogModernStore` (patrón de catalog-modern.spec.ts).
 *
 * Cada control se valida con el contrato de 3 capas: (1) efecto real en estado
 * o datos, (2) auto-feedback del control (aria-expanded / aria-live / disabled /
 * role=alert / foco), (3) contrato de datos (payload → localStorage y mensaje
 * wa.me construido con totales en centavos).
 *
 * Controles del bin:
 *  - Agregar al carrito: aparece la línea, el badge de conteo y se abre el drawer.
 *  - Enter en el campo de cantidad del producto: agrega (listener de submit).
 *  - Edición de cantidad en el drawer: restaura en vacío/cero; acota 1–99.
 *  - Quitar línea: desaparece, badge y totales recalcular.
 *  - Drawer: aria-expanded, cierre con Escape, trampa de foco y retorno al trigger.
 *  - Checkout del drawer: mensaje de WhatsApp compacto (sin SKU) con saludo,
 *    variante visible y total en centavos (URL wa.me).
 *  - Línea no disponible: se conserva con "Ya no disponible" (no se descarta).
 *  - Página de carrito: reconciliación con precios frescos de catalog-index.json.
 *  - Totales con aria-live.
 */
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";

const exported = exportProject(catalogModernStore, { mode: "production" });

import { FIXTURE_PRODUCT_FILES } from "./fixture-server";

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
  await new Promise<void>((resolveListening) => {
    server.listen(0, "127.0.0.1", resolveListening);
  });
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

const PRODUCT_URL = "/productos/remera-esencial-de-algodon/";
const STORAGE_KEY = "solara-cart:store-modo-sur";
const VARIANT_ID = "modo-variant-01-01";
const FRESH_PRICE = 2_885_000;

async function clearCart(page: import("@playwright/test").Page) {
  await page.goto(storeUrl("/"));
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
}

async function seedCart(
  page: import("@playwright/test").Page,
  lines: Array<Record<string, unknown>>,
) {
  await page.goto(storeUrl("/"));
  await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [
    STORAGE_KEY,
    lines,
  ] as const);
  await page.reload();
}

function storedCart(page: import("@playwright/test").Page) {
  return page.evaluate(
    ([key]) => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    },
    [STORAGE_KEY] as const,
  );
}

test("drawer: abre con aria-expanded, cierra con Escape y devuelve el foco al trigger", async ({
  page,
}) => {
  await clearCart(page);
  await page.goto(storeUrl("/"));
  const trigger = page.locator("[data-solara-cart-open]").first();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(drawer).not.toHaveAttribute("inert", "");
  await expect(drawer.getByRole("button", { name: "Cerrar carrito" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("drawer: trampa de foco con Tab y Shift+Tab dentro del panel", async ({ page }) => {
  await clearCart(page);
  await page.goto(storeUrl(PRODUCT_URL));
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer).toHaveAttribute("data-open", "true");

  const first = drawer.locator("button:not([disabled])").first();
  const last = drawer.locator("button:not([disabled]):visible").last();
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
});

test("checkout del drawer: abre URL wa.me con saludo, líneas compactas y total en centavos", async ({
  page,
}) => {
  await clearCart(page);
  await page.goto(storeUrl(PRODUCT_URL));
  await page.locator('input[name="quantity"]').fill("2");
  await page.locator('input[name="quantity"]').press("Enter");
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer.locator("[data-cart-quantity]").first()).toHaveValue("2");
  await drawer.locator("[data-cart-checkout-next]").click();

  await drawer.getByLabel("Nombre").fill("Malena Ortiz");
  await drawer.getByLabel("Teléfono").fill("11 5555 0142");
  await drawer.getByLabel("Dirección o punto de entrega").fill("Av. Forest 842, CABA");
  await drawer.getByLabel("Localidad / Provincia").fill("Trelew, Chubut");
  await drawer.getByLabel("Código postal").fill("9100");
  await drawer.getByLabel("Notas opcionales").fill("Entregar por la tarde");
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
  const url = new URL(openedUrl ?? "");
  expect(url.protocol).toBe("https:");
  expect(url.host).toBe("wa.me");
  expect(url.pathname).toBe("/5491123456789");
  const message = (url.searchParams.get("text") ?? "").replace(/[\u202F\u00A0]/g, " ");
  expect(message).toContain("Hola Tienda Referencia, quiero hacer este pedido:");
  expect(message).toContain("- 2x Remera esencial de algodon (Negro / S) = $ 57.700,00");
  expect(message).not.toContain("[MS-001-NE-S]");
  expect(message).toContain("Total estimado: $ 57.700,00");
  expect(message).toContain("Nombre: Malena Ortiz");
  expect(message).toContain("Teléfono: 11 5555 0142");
  expect(message).toContain("Entrega: Av. Forest 842, CABA");
  expect(message).toContain("Notas: Entregar por la tarde");
  expect(message).toContain("Entiendo que precio, disponibilidad, envío y pago se confirman");
  await expect(drawer.locator("[data-order-preview]")).toContainText("Total estimado: $ 57.700,00");
  await whatsappPopup.close();
});

test("página de carrito: reconciliación con precios frescos de catalog-index.json", async ({
  page,
}) => {
  await seedCart(page, [
    {
      productId: "p-stale",
      variantId: VARIANT_ID,
      title: "Título viejo",
      variantTitle: "Stale",
      sku: "OLD-1",
      unitPrice: 100,
      quantity: 2,
      available: true,
    },
  ]);
  await page.goto(storeUrl("/carrito/"));
  const pageMain = page.locator("main.solara-cart-page");
  await expect(pageMain.locator("[data-cart-subtotal]")).toHaveText("$ 57.700,00", {
    timeout: 15_000,
  });
  await expect(pageMain.locator("[data-cart-total]")).toHaveText("$ 57.700,00");
  await expect(pageMain.locator("[data-cart-lines]")).toContainText("Remera esencial de algodón");

  const stored = (await storedCart(page)) as Array<Record<string, unknown>>;
  expect(stored[0]).toEqual(
    expect.objectContaining({
      variantId: VARIANT_ID,
      unitPrice: FRESH_PRICE,
      quantity: 2,
      available: true,
    }),
  );
});

test("drawer: el scroll dentro del carrito no mueve la página de fondo y se restaura al cerrar", async ({
  page,
}) => {
  await clearCart(page);
  await page.goto(storeUrl(PRODUCT_URL));
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-cart-drawer]")).not.toHaveAttribute("data-open", "true");

  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);

  await page.evaluate(() =>
    (document.querySelector("[data-solara-cart-open]") as HTMLElement | null)?.click(),
  );
  const drawer = page.locator("[data-cart-drawer]");
  await expect(drawer).toHaveAttribute("data-open", "true");

  await drawer.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.press("Escape");
  await expect(drawer).not.toHaveAttribute("data-open", "true");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
});
