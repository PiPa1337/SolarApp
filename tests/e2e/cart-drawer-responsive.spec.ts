import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";

import { FIXTURE_PRODUCT_FILES } from "./fixture-server";
import { waitForStorefrontReady } from "./storefront-helpers";

const exported = exportProject(catalogModernV2Store, { mode: "production" });
const cartLines = catalogModernV2Store.products
  .filter((product) => product.status === "active")
  .slice(0, 12)
  .map((product, index) => {
    const variant = product.variants.find((candidate) => candidate.available);
    if (!variant) throw new Error(`Producto sin variante disponible: ${product.id}`);
    return {
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      variantTitle: variant.title,
      sku: variant.sku,
      unitPrice: variant.price,
      quantity: [1, 99, 4, 12, 2, 25, 3, 48, 6, 10, 75, 8][index] ?? 1,
      available: true,
    };
  });

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
    const content = exported.files.get(path) ?? FIXTURE_PRODUCT_FILES.get(path);
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
              : extension === "png"
                ? "image/png"
                : "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(content);
  });
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Servidor sin puerto TCP.");
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosing, reject) => {
    server.close((error) => (error ? reject(error) : resolveClosing()));
  });
});

async function openPopulatedCart(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `solara-cart:${catalogModernV2Store.id}`,
    value: cartLines,
  });
  await page.goto(serverUrl);
  await waitForStorefrontReady(page);
  await page.locator("button[data-solara-cart-open]").first().click();
  await expect(page.locator(".catalog-cart-drawer")).toHaveAttribute("data-open", "true");
  await expect(page.locator(".catalog-cart-items .solara-cart-line")).toHaveCount(cartLines.length);
}

test("separa revisión y checkout sin cambiar el submit de WhatsApp", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPopulatedCart(page);

  const drawer = page.locator(".catalog-cart-drawer");
  const review = drawer.locator("[data-cart-review-panel]");
  const checkout = drawer.locator("[data-cart-checkout-panel]");
  const next = drawer.locator("[data-cart-checkout-next]");
  const submit = drawer.locator("[data-cart-checkout-submit]");

  await expect(drawer).toHaveAttribute("data-cart-step", "review");
  await expect(review).toBeVisible();
  await expect(checkout).toBeHidden();
  await expect(next).toBeVisible();
  await expect(submit).toBeHidden();
  await expect(drawer.locator("[data-order-verification-warning]")).toBeHidden();

  await next.click();
  await expect(drawer).toHaveAttribute("data-cart-step", "checkout");
  await expect(review).toBeHidden();
  await expect(checkout).toBeVisible();
  await expect(submit).toBeVisible();
  await expect(submit).toHaveAttribute("type", "submit");
  await expect(submit).toHaveAttribute("form", "catalog-drawer-checkout");
  await expect(drawer.locator("[data-cart-review-back]")).toBeFocused();

  await drawer.locator("[data-cart-review-back]").click();
  await expect(drawer).toHaveAttribute("data-cart-step", "review");
  await expect(next).toBeFocused();
});

test("mantiene el borde y el foco de los inputs dentro del panel de checkout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPopulatedCart(page);

  const drawer = page.locator(".catalog-cart-drawer");
  await drawer.locator("[data-cart-checkout-next]").click();
  const panel = drawer.locator("[data-cart-checkout-panel]");
  const firstInput = panel.locator("input").first();
  await firstInput.focus();

  const metrics = await panel.evaluate((element) => {
    const input = element.querySelector<HTMLInputElement>("input");
    if (!input) return null;
    const panelRect = element.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return {
      leftInset: inputRect.left - panelRect.left,
      rightInset: panelRect.right - inputRect.right,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics?.leftInset).toBeGreaterThanOrEqual(6);
  expect(metrics?.rightInset).toBeGreaterThanOrEqual(6);
});

test("mantiene el drawer lateral hasta 600px y usa pantalla completa debajo", async ({ page }) => {
  for (const [width, expectedWidth] of [
    [600, 520],
    [599, 599],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await openPopulatedCart(page);
    await page.waitForTimeout(500);
    const box = await page.locator(".catalog-cart-drawer").boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(expectedWidth);
    expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(width);
  }
});
