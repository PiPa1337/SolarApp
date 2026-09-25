import { expect, test } from "@playwright/test";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { revealWholePage, startCatalogModernV2Server } from "./catalog-modern-v2-support";
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

test("V2 abre el menú móvil a pantalla completa aunque el header esté scrolleado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(serverUrl);

  const header = page.locator('[data-solara-module="catalog-header"]');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(844);
  await page.evaluate(() =>
    window.scrollTo({
      top: Math.max(1, document.documentElement.scrollHeight / 2),
      behavior: "instant",
    }),
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(header).toHaveAttribute("data-scrolled", "true");

  await page.locator("[data-catalog-menu-open]").click();
  const menu = page.locator("#catalog-mobile-menu");
  await expect(menu).toBeVisible();
  const menuMetrics = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(menuMetrics.height).toBeGreaterThan(800);
  expect(menuMetrics.width).toBeLessThanOrEqual(390);

  const panel = menu.locator(".catalog-mobile-menu__panel");
  const panelHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);
  expect(panelHeight).toBeGreaterThan(800);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("V2 abre el menu movil a pantalla completa en todo el rango mobil con foco visible", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
    { width: 600, height: 960 },
    { width: 755, height: 908 },
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

test("V2 limpia el estado modal del menu al entrar en desktop", async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 1024 });
  await page.goto(serverUrl);
  const opener = page.locator("[data-catalog-menu-open]");
  const menu = page.locator("#catalog-mobile-menu");
  await opener.click();
  await expect(menu).toHaveAttribute("aria-hidden", "false");

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(menu).toBeHidden();
  await expect(menu).toHaveAttribute("hidden", "");
  await expect(menu).toHaveAttribute("aria-hidden", "true");
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("html")).not.toHaveClass(/catalog-mobile-menu-open/);
  await expect(page.locator(".catalog-desktop-nav")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe(
    "hidden",
  );
});

test("V2 indica la ruta activa en la navegacion", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(new URL("/", serverUrl).toString());
  const activeDesktopLink = page.locator('.catalog-desktop-nav [aria-current="page"]');
  await expect(activeDesktopLink).toHaveText("Inicio");
  expect(
    await activeDesktopLink.evaluate((element) => getComputedStyle(element, "::after").transform),
  ).not.toBe("matrix(0, 0, 0, 1, 0, 0)");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/categorias/remeras/", serverUrl).toString());
  await page.locator("[data-catalog-menu-open]").click();
  await expect(
    page.locator('.catalog-mobile-categories > summary[aria-current="page"]'),
  ).toBeVisible();
});

test("V2 activa appear progresivo y compacta el header al hacer scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);

  const header = page.locator('[data-solara-module="catalog-header"]');
  const headerInner = header.locator(".catalog-header-inner");
  const products = page.locator('[data-solara-section="modo-section-new"]');
  const initialHeight = (await headerInner.boundingBox())?.height ?? 0;
  await expect(products).not.toHaveAttribute("data-motion-visible", "true");

  await products.evaluate((element) =>
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 160 }),
  );
  await expect(products).toHaveAttribute("data-motion-visible", "true");
  await expect(header).toHaveAttribute("data-scrolled", "true");
  await expect
    .poll(async () => (await headerInner.boundingBox())?.height ?? initialHeight)
    .toBeLessThan(initialHeight);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(products).toHaveAttribute("data-motion-visible", "true");
  await expect(products.locator("[data-motion-zone]")).toHaveCSS("animation-name", "none");
});

test("V2 mantiene todas las rutas sin overflow en tablet y laptop", async ({ page }) => {
  const routes = [
    "/",
    "/categorias/remeras/",
    "/productos/remera-esencial-de-algodon/",
    "/buscar/",
    "/carrito/",
    "/privacidad/",
    "/terminos/",
    "/404.html",
  ] as const;

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(new URL(route, serverUrl).toString());
      await expect(page.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const metrics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>("[data-solara-store]");
        const rootRect = root?.getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          rootLeft: rootRect?.left ?? -1,
          rootRight: rootRect?.right ?? Number.POSITIVE_INFINITY,
        };
      });
      expect(
        metrics.documentWidth,
        `${route} @ ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(viewport.width);
      expect(
        metrics.bodyWidth,
        `${route} body @ ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(viewport.width);
      expect(metrics.clientWidth).toBe(viewport.width);
      expect(metrics.rootLeft).toBeGreaterThanOrEqual(0);
      expect(metrics.rootRight).toBeLessThanOrEqual(viewport.width);
    }
  }
});

test("V2 conserva estabilidad visual y feedback inmediato", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state = window as Window & { __solaraLayoutShift?: number };
    state.__solaraLayoutShift = 0;
    // Solo medir shifts despues de que la pagina este lista (imagenes cargadas +
    // scroll de revelado). Los shifts previos son la entrada animada, no inestabilidad.
    state.__solaraMeasureFrom = Infinity;
    const observer = new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const shift = item as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput && shift.startTime >= (state.__solaraMeasureFrom ?? 0))
          state.__solaraLayoutShift = (state.__solaraLayoutShift ?? 0) + shift.value;
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
  });

  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  );
  await revealWholePage(page);
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
  );
  await page.waitForTimeout(750);
  // Marcar el inicio de la ventana de medicion: solo shifts posteriores al
  // revelado cuentan como inestabilidad real, no la entrada animada inicial.
  await page.evaluate(() => {
    const state = window as Window & { __solaraMeasureFrom?: number };
    state.__solaraMeasureFrom = performance.now();
  });
  const layoutShift = await page.evaluate(
    () => (window as Window & { __solaraLayoutShift?: number }).__solaraLayoutShift ?? 0,
  );
  expect(layoutShift).toBeLessThanOrEqual(0.05);

  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page
    .getByLabel(catalogModernV2Store.publicCopy.product.variant, { exact: true })
    .selectOption({ index: 1 });
  const responseMs = await page.getByRole("button", { name: "Agregar al carrito" }).evaluate(
    (button) =>
      new Promise<number>((resolve, reject) => {
        const drawer = document.querySelector<HTMLElement>(".catalog-cart-drawer");
        if (!drawer) {
          reject(new Error("No se encontró el drawer de carrito."));
          return;
        }
        const startedAt = performance.now();
        const observer = new MutationObserver(() => {
          if (drawer.dataset.open === "true") {
            observer.disconnect();
            resolve(performance.now() - startedAt);
          }
        });
        observer.observe(drawer, { attributes: true, attributeFilter: ["data-open"] });
        (button as HTMLButtonElement).click();
      }),
  );
  expect(responseMs).toBeLessThan(100);
  await expect(page.locator(".catalog-cart-drawer")).toHaveAttribute("data-open", "true");
});
