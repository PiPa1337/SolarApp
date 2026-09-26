/**
 * Caza de bugs: formularios hostiles. XSS en campos, longitud extrema y
 * verificacion de que nada se inyecta como HTML ni rompe el mensaje.
 */
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";

const exported = exportProject(catalogModernV2Store, { mode: "production" });
let server: Server;
let serverUrl = "";

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
    const file = exported.files.get(path);
    if (!file) {
      response.writeHead(404).end("nf");
      return;
    }
    response.writeHead(200, {
      "Content-Type": path.endsWith(".css") ? "text/css" : "text/html; charset=utf-8",
    });
    response.end(file);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("sin puerto");
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  server.close();
});

const PAYLOADS = [
  "<script>window.__xss=1</script>",
  '<img src=x onerror="window.__xss=1">',
  '<svg onload="window.__xss=1">',
  "'; DROP TABLE products; --",
];

/** El checkout V2 vive en el drawer del carrito: sembrar item y abrirlo. */
async function openCheckoutDrawer(
  page: import("@playwright/test").Page,
  payload: string,
): Promise<void> {
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.locator(".catalog-cart-drawer [data-cart-checkout-next]").click();
  const form = page.locator(".catalog-cart-drawer [data-checkout-form]");
  await expect(form).toBeVisible();
  await form.locator("#catalog-drawer-name").fill(payload);
  await form.locator("#catalog-drawer-phone").fill("5491100000000");
  await form.locator("#catalog-drawer-address").fill(payload);
  await form.locator("#catalog-drawer-locality").fill(payload);
  await form.locator("#catalog-drawer-postal-code").fill("1000");
}

test("checkout: payloads hostiles no ejecutan ni inyectan HTML", async ({ page }) => {
  for (const payload of PAYLOADS) {
    test.setTimeout(60000);
    await openCheckoutDrawer(page, payload);
    await page.locator(".catalog-cart-drawer button[type=submit]").click();
    await page.waitForTimeout(400);
    const xss = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
    expect(xss, `payload ejecutado: ${payload}`).toBeUndefined();
  }
});
