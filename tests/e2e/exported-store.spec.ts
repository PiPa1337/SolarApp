import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { referenceStore } from "@solara/project-schema/fixture";

const exported = exportProject(referenceStore, { mode: "production" });

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

test("selecciona una variante, agrega al carrito y abre WhatsApp", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console.error: ${message.text()}`);
  });

  await page.goto(storeUrl("/productos/manta-bruma/"));
  await page.getByLabel("Variante", { exact: true }).selectOption("variant-manta-piedra");
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();

  await expect(page.locator("[data-cart-count]").first()).toHaveText("2");
  await expect(page.locator("[data-solara-cart-open]").first()).toHaveAttribute(
    "aria-label",
    "Carrito 2",
  );
  await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("aria-hidden", "false");
  await page.getByLabel("Nombre").fill("Malena Ortiz");
  await page.getByLabel(/Telefono|Tel/).fill("11 5555 0142");
  await page.getByLabel(/Direccion|Direcci/).fill("Av. Forest 842, CABA");
  await page.getByLabel(/Localidad|Provincia/).fill("Trelew, Chubut");
  await page.getByLabel(/Codigo postal|Código postal/).fill("9100");
  await page.getByLabel(/Notas/).fill("Entregar por la tarde");
  await page.evaluate(() => {
    window.open = ((url) => {
      document.documentElement.dataset.solaraWhatsappUrl = String(url ?? "");
      return { opener: null } as WindowProxy;
    }) as typeof window.open;
  });
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();

  await expect(page.locator("[data-whatsapp-link]")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-solara-whatsapp-url",
    /https:\/\/wa\.me\/5491123456789\?text=/,
  );
  const openedUrl = await page.locator("html").getAttribute("data-solara-whatsapp-url");
  expect(openedUrl).toContain("https://wa.me/5491123456789?text=");
  expect(decodeURIComponent(openedUrl ?? "")).toContain("2x Manta Bruma (Piedra)");
  expect(runtimeErrors).toEqual([]);
});

test("descubre productos siguiendo enlaces sin JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(storeUrl("/"));

  const productLink = page.locator('a[href="/productos/manta-bruma/"]').first();
  await expect(productLink).toBeVisible();
  await productLink.click();
  await expect(page).toHaveURL(/\/productos\/manta-bruma\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Manta Bruma" })).toBeVisible();
  await context.close();
});

test("mantiene composicion y ancho estable en desktop y movil", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl("/"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Una casa con materia y calma." }),
  ).toBeVisible();
  for (const section of await page.locator("[data-motion-root]").all()) {
    await section.scrollIntoViewIfNeeded();
  }
  await page.locator('[data-solara-module="editorial-header"]').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await page.screenshot({ path: "test-results/storefront-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await page.screenshot({ path: "test-results/storefront-mobile.png", fullPage: true });
});

test("mantiene el contenido visible con movimiento reducido y activa inView", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(storeUrl("/"));
  const hero = page.locator('[data-solara-module="hero-media"]');
  await expect(hero).toHaveAttribute("data-motion-intensity", "0.5");
  await expect(hero).toHaveAttribute("data-motion-entry", "0.25");
  await hero.scrollIntoViewIfNeeded();
  await expect(hero).toHaveAttribute("data-motion-visible", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(hero).toHaveAttribute("data-motion-visible", "true");
  expect(
    await page
      .locator('[data-solara-module="hero-media"] [data-motion-zone]')
      .first()
      .evaluate((element) => {
        return getComputedStyle(element).opacity;
      }),
  ).toBe("1");
});
