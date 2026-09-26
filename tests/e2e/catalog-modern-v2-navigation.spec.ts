import { expect, test } from "@playwright/test";
import { startCatalogModernV2Server } from "./catalog-modern-v2-support";
import { waitForStorefrontReady } from "./storefront-helpers";

let serverUrl: string;
let stopServer: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  const server = await startCatalogModernV2Server();
  serverUrl = server.serverUrl;
  stopServer = server.stop;
});

test.afterAll(async () => {
  await stopServer?.();
});
test("V2 conserva nombres accesibles, foco visible y navegacion por teclado", async ({ page }) => {
  const routes = [
    "/",
    "/categorias/remeras/",
    "/productos/remera-esencial-de-algodon/",
    "/carrito/",
  ];

  for (const route of routes) {
    await page.goto(new URL(route, serverUrl).toString());
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // La auditoria lee TODO el DOM: esperar la senal del runtime evita leer
    // un arbol a medio hidratar (politica de estabilidad E2E).
    await waitForStorefrontReady(page);
    const audit = await page.evaluate(() => {
      const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      const unnamed = [
        ...document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary"),
      ]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            !element.closest("[inert]") &&
            !(element instanceof HTMLInputElement && element.type === "hidden")
          );
        })
        .filter((element) => {
          const explicitName =
            element.getAttribute("aria-label")?.trim() ||
            element.getAttribute("title")?.trim() ||
            element.textContent?.trim();
          const labelledInput =
            (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement) &&
            element.labels &&
            element.labels.length > 0;
          return !explicitName && !labelledInput;
        })
        .map((element) => `${element.tagName.toLowerCase()}#${element.id}`);
      return { duplicateIds: [...new Set(duplicateIds)], unnamed };
    });
    expect(audit).toEqual({ duplicateIds: [], unnamed: [] });
  }

  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForStorefrontReady(page);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.getByRole("button", { name: "Continuar a compra" }).click();
  const checkoutName = page.locator("#catalog-drawer-name");
  // El segundo paso enfoca "Volver" por JS. Tab reproduce la navegación real
  // por teclado y activa :focus-visible sobre el primer campo del formulario.
  await expect(checkoutName).toBeVisible();
  await expect(page.locator("[data-cart-review-back]")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(checkoutName).toBeFocused();
  expect(
    await checkoutName.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
    }),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(serverUrl);
  const openMenu = page.getByRole("button", { name: "Abrir menú" });
  await openMenu.focus();
  await page.keyboard.press("Enter");
  const mobileMenu = page.locator("#catalog-mobile-menu");
  await expect(mobileMenu).toBeVisible();
  const openMenuMetrics = await mobileMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(openMenuMetrics.height).toBeGreaterThan(800);
  expect(openMenuMetrics.width).toBeLessThanOrEqual(390);
  expect(openMenuMetrics.scrollWidth).toBeLessThanOrEqual(openMenuMetrics.clientWidth);
  await expect(page.getByRole("button", { name: "Cerrar menú" })).toBeFocused();
  await mobileMenu.locator(".catalog-mobile-categories > summary").click();
  await mobileMenu.locator(".catalog-mobile-category > summary").first().click();
  expect(
    await mobileMenu.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThan(800);
  await page.keyboard.press("Escape");
  await expect(page.locator("#catalog-mobile-menu")).toBeHidden();
  await expect(openMenu).toBeFocused();
});

test("V2 abre el menu movil a pantalla completa de extremo a extremo con foco visible", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 600, height: 960 },
    { width: 767, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    await page.locator("[data-catalog-menu-open]").click();

    const menu = page.locator("#catalog-mobile-menu");
    const panel = menu.locator(".catalog-mobile-menu__panel");
    const close = menu.locator(".catalog-mobile-menu__close");
    await expect
      .poll(
        async () => panel.evaluate((element) => element.getBoundingClientRect().left),
        `${viewport.width}px`,
      )
      .toBe(0);
    const metrics = await menu.evaluate((element) => {
      const panelElement = element.querySelector<HTMLElement>(".catalog-mobile-menu__panel");
      const closeElement = element.querySelector<HTMLElement>(".catalog-mobile-menu__close");
      const logoElement = element.querySelector<HTMLElement>(".catalog-mobile-brand img");
      if (!panelElement || !closeElement) throw new Error("Falta la estructura del menu movil.");
      const panelRect = panelElement.getBoundingClientRect();
      const closeRect = closeElement.getBoundingClientRect();
      const logoRect = logoElement?.getBoundingClientRect();
      return {
        panelWidth: panelRect.width,
        panelHeight: panelRect.height,
        panelLeft: panelRect.left,
        panelTop: panelRect.top,
        closeWidth: closeRect.width,
        closeHeight: closeRect.height,
        logoWidth: logoRect?.width ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        transitionDuration: getComputedStyle(panelElement).transitionDuration,
      };
    });

    expect(metrics.closeWidth, `${viewport.width}px`).toBeGreaterThanOrEqual(44);
    expect(metrics.closeHeight, `${viewport.width}px`).toBeGreaterThanOrEqual(44);
    expect(metrics.logoWidth, `${viewport.width}px`).toBeLessThanOrEqual(224);
    expect(metrics.documentWidth, `${viewport.width}px`).toBeLessThanOrEqual(viewport.width);
    expect(metrics.transitionDuration, `${viewport.width}px`).not.toBe("0s");
    expect(metrics.panelWidth, `${viewport.width}px`).toBe(viewport.width);
    expect(metrics.panelHeight, `${viewport.width}px`).toBeGreaterThanOrEqual(viewport.height);
    expect(metrics.panelLeft, `${viewport.width}px`).toBe(0);
    expect(metrics.panelTop, `${viewport.width}px`).toBe(0);

    const searchField = menu.locator(".catalog-mobile-search__field");
    const restingFocusSurface = await searchField.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { border: styles.borderTopColor, shadow: styles.boxShadow };
    });
    await menu.locator("#catalog-mobile-search-input").focus();
    const focusedSurface = await searchField.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { border: styles.borderTopColor, shadow: styles.boxShadow };
    });
    expect(focusedSurface).not.toEqual(restingFocusSurface);

    await menu.locator(".catalog-mobile-categories > summary").click();
    await close.click();
    await expect(menu).toBeHidden();
    await page.locator("[data-catalog-menu-open]").click();
    await expect(menu.locator(".catalog-mobile-categories")).not.toHaveAttribute("open", "");

    // El panel cubre todo el viewport: el cierre siempre pasa por el botón.
    await close.click();
    await expect(menu).toBeHidden();
    await expect(page.locator("[data-catalog-menu-open]")).toBeFocused();
    await expect(panel).toBeHidden();
  }
});
