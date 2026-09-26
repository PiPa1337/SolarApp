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

test("la categoría moderna mantiene filtros, densidad y pie comercial", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl("/categorias/remeras/"));

  await expect(page.locator(".catalog-category-page")).toBeVisible();
  await expect(page.locator(".catalog-category-filters")).toBeVisible();
  await expect(page.locator('[data-solara-module="catalog-testimonials"]')).toHaveCount(0);
  await expect(page.locator('[data-solara-module="catalog-newsletter-cta"]')).toBeVisible();
  const desktopGrid = page.locator(".catalog-category-results .catalog-product-grid");
  expect(await desktopGrid.count()).toBe(1);
  await expect(desktopGrid.locator(".catalog-product-card")).toHaveCount(7);
  expect(
    await desktopGrid
      .locator("img")
      .evaluateAll((images) => images.every((image) => image.naturalWidth > 0)),
  ).toBe(true);
  expect(
    await desktopGrid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(3);
  const tagFilter = page.locator("[data-category-tag]");
  expect(await tagFilter.count()).toBe(1);
  await tagFilter.selectOption("nuevo");
  await expect(
    page.locator(".catalog-category-results .catalog-product-card:not([hidden])"),
  ).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(storeUrl("/categorias/remeras/"));
  await expect(page.locator(".catalog-category-filters summary")).toBeVisible();
  const mobileGrid = page.locator(".catalog-category-results .catalog-product-grid");
  expect(
    await mobileGrid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});

test("la navegación, el detalle moderno y las variantes siguen siendo rastreables", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(storeUrl("/"));
  const catalogTrigger = page.locator(".catalog-desktop-nav .catalog-nav-trigger");
  await expect(catalogTrigger).toHaveText("Categorías");
  await catalogTrigger.click();
  const megaMenu = page.locator(".catalog-desktop-nav .catalog-mega-menu");
  await expect(megaMenu).toBeVisible();
  await expect(catalogTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(megaMenu.locator(".catalog-mega-group")).toHaveCount(8);
  await expect(
    megaMenu.locator(".catalog-mega-group").filter({ hasText: "Remeras" }),
  ).toContainText("Básicas");
  await expect(
    megaMenu.locator(".catalog-mega-group").filter({ hasText: "Pantalones" }),
  ).toContainText("Jeans");
  expect(
    await megaMenu
      .locator(".catalog-mega-group__link")
      .first()
      .evaluate((element) => getComputedStyle(element, "::after").display),
  ).toBe("none");
  expect(
    await page.locator(".catalog-header-inner").evaluate((element) => {
      const style = getComputedStyle(element);
      return style.userSelect || style.getPropertyValue("-webkit-user-select");
    }),
  ).toBe("none");
  expect(
    await catalogTrigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.userSelect || style.getPropertyValue("-webkit-user-select");
    }),
  ).toBe("none");
  expect(
    await megaMenu
      .locator(".catalog-mega-menu__groups")
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
  ).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await page.keyboard.press("Escape");
  await expect(megaMenu).toBeHidden();
  await expect(catalogTrigger).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(storeUrl("/"));
  await page.locator(".catalog-desktop-nav .catalog-nav-trigger").click();
  expect(
    await page
      .locator(".catalog-desktop-nav .catalog-mega-menu__groups")
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
  ).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(storeUrl("/"));
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.locator("#catalog-mobile-menu")).toBeVisible();
  await expect(page.locator("#catalog-mobile-menu")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#catalog-mobile-search-input")).toBeVisible();
  const mobileCategories = page.locator(".catalog-mobile-categories");
  await expect(mobileCategories).not.toHaveAttribute("open", "");
  await expect(mobileCategories.locator(":scope > summary")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator(".catalog-mobile-category__children").first()).toBeHidden();
  await mobileCategories.locator(":scope > summary").click();
  await expect(mobileCategories.locator(":scope > summary")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.locator(".catalog-mobile-category").first().locator(":scope > summary").click();
  await expect(page.locator(".catalog-mobile-category__children a").first()).toHaveAttribute(
    "href",
    "/categorias/remeras/",
  );
  await expect(page.locator('#catalog-mobile-menu a[href="/categorias/remeras/"]')).toBeVisible();
  await page.getByRole("button", { name: "Cerrar menú" }).click();
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeFocused();

  await page.goto(storeUrl("/productos/remera-esencial-de-algodon/"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Remera esencial de algodón" }),
  ).toBeVisible();
  await expect(page.getByLabel("Variante")).toBeVisible();
  await expect(page.locator(".catalog-product-reviews")).toHaveCount(0);
  await expect(page.locator(".catalog-review")).toHaveCount(0);
  await expect(page.getByText("Lo que dicen quienes compraron")).toHaveCount(0);
  await expect(page.locator(".catalog-product-specs")).toBeVisible();
  await expect(page.locator(".catalog-product-policies")).toBeVisible();
  await page.getByLabel("Variante").selectOption({ index: 1 });
  await expect(page.locator(".catalog-product-info [data-product-price]")).toBeVisible();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await expect(page.locator("[data-cart-subtotal]").first()).toBeVisible();
  await expect(page.locator("[data-cart-drawer]")).toContainText("Entrega");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});
