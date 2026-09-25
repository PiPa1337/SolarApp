import { expect, test } from "@playwright/test";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import {
  exportedV1,
  hoverAndReadSettledSurface,
  readActionSurface,
  revealWholePage,
  startCatalogModernV2Server,
} from "./catalog-modern-v2-support";

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
test("V2 presenta resultados de búsqueda en grilla editorial", async ({ page }, testInfo) => {
  const searchUrl = new URL("/buscar/?q=remera", serverUrl).toString();
  for (const viewport of [
    { width: 1920, height: 968, columns: 6 },
    { width: 1024, height: 768, columns: 3 },
    { width: 390, height: 844, columns: 2 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(searchUrl);
    const results = page.locator(".solara-search-results-grid");
    await expect(results).toBeVisible();
    await expect(results.locator(".solara-search-result").first()).toBeVisible();
    await expect(page.locator("[data-search-result-count]").first()).toContainText("productos");
    await expect(results.locator("img").first()).toHaveAttribute(
      "sizes",
      "(max-width: 767px) 46vw, (max-width: 1199px) 18rem, 13rem",
    );
    await expect(results.locator("img").first()).toHaveCSS("object-fit", "cover");
    const imageMetrics = await results
      .locator("img")
      .first()
      .evaluate((element) => {
        const imageRect = element.getBoundingClientRect();
        const cardRect = element
          .closest<HTMLElement>(".solara-search-result")
          ?.getBoundingClientRect();
        return {
          imageWidth: imageRect.width,
          imageHeight: imageRect.height,
          cardWidth: cardRect?.width ?? 0,
        };
      });
    expect(imageMetrics.imageWidth).toBeGreaterThan(imageMetrics.cardWidth * 0.98);
    expect(imageMetrics.imageHeight).toBeCloseTo(imageMetrics.imageWidth, 0);
    if (viewport.width >= 1024) {
      const resultsMetrics = await results.evaluate((element) => {
        const gridRect = element.getBoundingClientRect();
        const cardRect = element
          .querySelector<HTMLElement>(".solara-search-result")
          ?.getBoundingClientRect();
        return {
          gridWidth: gridRect.width,
          cardWidth: cardRect?.width ?? 0,
        };
      });
      if (viewport.width === 1920) {
        expect(resultsMetrics.gridWidth).toBeGreaterThan(1290);
        expect(resultsMetrics.gridWidth).toBeLessThanOrEqual(1320);
        expect(resultsMetrics.cardWidth).toBeGreaterThan(195);
        expect(resultsMetrics.cardWidth).toBeLessThan(215);
      } else {
        expect(resultsMetrics.gridWidth).toBeGreaterThan(640);
        expect(resultsMetrics.gridWidth).toBeLessThanOrEqual(720);
        expect(resultsMetrics.cardWidth).toBeGreaterThan(200);
        expect(resultsMetrics.cardWidth).toBeLessThan(240);
      }
    }
    expect(
      await results.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(viewport.columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.screenshot({
      path: testInfo.outputPath(`search-results-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});

test("V2 no agrega una caja visual alrededor del título de categoría", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(new URL("/categorias/remeras/", serverUrl).toString());
  await expect(page.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible();
  const glass = page.locator(".solara-category-title-glass");
  await expect(glass).toBeVisible();
  await expect(glass).toHaveText("Remeras");
  const styles = await glass.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      padding: style.padding,
      background: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      borderWidth: style.borderWidth,
      borderStyle: style.borderStyle,
    };
  });
  expect(styles.display).toBe("inline");
  expect(styles.padding).toBe("0px");
  expect(styles.background).toBe("rgba(0, 0, 0, 0)");
  expect(styles.backdropFilter).toBe("none");
  expect(styles.borderWidth).toBe("0px");
  expect(styles.borderStyle).toBe("none");
});

test("V2 anima 'Ver todo el catálogo' como 'Ver todos'", async ({ page }) => {
  await page.goto(serverUrl);
  const bentoAll = page.locator(".catalog-category-bento-all").first();
  await bentoAll.scrollIntoViewIfNeeded();
  const rest = await bentoAll.evaluate((element) => getComputedStyle(element, "::after").transform);
  await bentoAll.hover();
  await expect
    .poll(() => bentoAll.evaluate((element) => getComputedStyle(element, "::after").transform))
    .not.toBe(rest);
});

test("V2 anima reseñas y deja estático el CTA de novedades", async ({ page }) => {
  await page.goto(serverUrl);
  await revealWholePage(page);
  const testimonialHeader = page.locator(
    '[data-solara-module="catalog-testimonials"] .catalog-testimonials-section > header',
  );
  await expect(testimonialHeader).toBeVisible();
  expect(
    await testimonialHeader.evaluate((element) => getComputedStyle(element).animationName),
  ).not.toBe("none");
  const testimonial = page.locator(".catalog-testimonial").first();
  expect(await testimonial.evaluate((element) => getComputedStyle(element).animationName)).not.toBe(
    "none",
  );
  const newsletterText = page.locator(
    '[data-solara-module="catalog-newsletter-cta"] .catalog-newsletter-inner > div',
  );
  await expect(newsletterText).toBeVisible();
  expect(await newsletterText.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "none",
  );
  const newsletterCard = page.locator(
    '[data-solara-module="catalog-newsletter-cta"] .catalog-newsletter-inner',
  );
  expect(await newsletterCard.evaluate((element) => getComputedStyle(element).animationName)).toBe(
    "none",
  );
  const newsletterAction = page.locator(
    '[data-solara-module="catalog-newsletter-cta"] .catalog-newsletter-action',
  );
  await expect(newsletterAction).toBeVisible();
  expect(
    await newsletterAction.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});

test("V2 deja visible la card de novedades con movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(serverUrl);
  const newsletterCard = page.locator(
    '[data-solara-module="catalog-newsletter-cta"] .catalog-newsletter-inner',
  );
  await expect(newsletterCard).toBeVisible();
  await expect
    .poll(() =>
      newsletterCard.evaluate((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transform: style.transform };
      }),
    )
    .toEqual({ opacity: "1", transform: "none" });
});

test("V2 cards: línea glow con puntito en la imagen al hover", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);
  const card = page.locator(".catalog-product-card").first();
  await expect(card).toBeVisible();
  await expect
    .poll(() =>
      card.evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === "running"),
      ),
    )
    .toBe(false);
  const media = card.locator(".catalog-product-media");
  const restTransform = await media.evaluate(
    (element) => getComputedStyle(element, "::before").transform,
  );
  await card.hover();
  await expect
    .poll(() => media.evaluate((element) => getComputedStyle(element, "::before").transform))
    .not.toBe(restTransform);

  const bento = page.locator(".catalog-category-bento-item").first();
  await bento.scrollIntoViewIfNeeded();
  const bentoMedia = bento.locator(".catalog-category-bento-media");
  const bentoRest = await bentoMedia.evaluate(
    (element) => getComputedStyle(element, "::before").transform,
  );
  await bento.hover();
  await expect
    .poll(() => bentoMedia.evaluate((element) => getComputedStyle(element, "::before").transform))
    .not.toBe(bentoRest);
});

test("V2 footer mantiene el botón de arrepentimiento dentro de su geometría", async ({ page }) => {
  await page.goto(serverUrl);
  const footer = page.locator('[data-solara-module="catalog-footer"]');
  await expect(footer).toBeVisible();
  const consumerRights = footer.locator(".solara-consumer-rights");
  await expect(consumerRights).toHaveCount(1);
  await expect(consumerRights).toHaveCSS("position", "static");
  const footerBounds = await footer.boundingBox();
  const consumerRightsBounds = await consumerRights.boundingBox();
  if (!footerBounds || !consumerRightsBounds) {
    throw new Error("No se pudo medir el footer o el botón de arrepentimiento.");
  }
  expect(consumerRightsBounds.y).toBeGreaterThanOrEqual(footerBounds.y);
  expect(consumerRightsBounds.y + consumerRightsBounds.height).toBeLessThanOrEqual(
    footerBounds.y + footerBounds.height,
  );
});

test("V2 footer: Contacto no tiene separador ni sangría lateral", async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 968 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    const contact = page.locator('[data-solara-module="catalog-footer"] .catalog-footer-contact');
    await expect(contact).toHaveCSS("border-left-width", "0px");
    await expect(contact).toHaveCSS("padding-left", "0px");
  }
});

test("V2 footer conserva composición responsive y abre el carrito", async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 1920, height: 968, label: "desktop" },
    { width: 1024, height: 768, label: "tablet" },
    { width: 390, height: 844, label: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    const footer = page.locator('[data-solara-module="catalog-footer"]');
    const cartLink = footer.locator("a[data-open-cart]");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      viewport.label,
    ).toBeLessThanOrEqual(viewport.width);

    await footer.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await footer.screenshot({
      path: testInfo.outputPath(
        `footer-${viewport.label}-${viewport.width}x${viewport.height}.png`,
      ),
    });

    await cartLink.click();
    await expect(page.locator("[data-cart-drawer]")).toHaveAttribute("data-open", "true");
    await page
      .locator("[data-cart-drawer] [data-close-cart]:not(.catalog-cart-backdrop)")
      .first()
      .click();
    await expect(page.locator("[data-cart-drawer]")).not.toHaveAttribute("data-open", "true");
  }
});

test("V2 mantiene rutas secundarias legibles y sin overflow", async ({ page }, testInfo) => {
  const routes = [
    ["buscar", "/buscar/"],
    ["carrito", "/carrito/"],
    ["privacidad", "/privacidad/"],
    ["terminos", "/terminos/"],
    ["404", "/404.html"],
  ] as const;

  for (const viewport of [
    { width: 1920, height: 968, label: "desktop" },
    { width: 390, height: 844, label: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    for (const [name, route] of routes) {
      await page.goto(new URL(route, serverUrl).toString());
      await expect(page.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${name} ${viewport.label}`,
      ).toBeLessThanOrEqual(viewport.width);
      if (["privacidad", "terminos"].includes(name)) {
        const policyPage = page.locator(".solara-policy-page");
        const legal = policyPage.locator(".solara-legal-article");
        if ((await legal.count()) > 0) {
          await expect(legal).toBeVisible();
          await expect(policyPage.getByRole("heading", { level: 2 })).not.toHaveCount(0);
        } else {
          await expect(policyPage.locator(".solara-story-grid")).toBeVisible();
          await expect(policyPage.getByRole("heading", { level: 2 })).toHaveCount(2);
        }
      }
      if (name === "404") {
        await expect(page.locator(".solara-error-code")).toHaveAttribute("aria-hidden", "true");
        await expect(page.getByRole("link", { name: "Volver al inicio" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Ver categorías" })).toBeVisible();
        if (viewport.width === 1920) {
          const errorHero = await page.locator(".solara-error-hero").boundingBox();
          expect(errorHero?.height ?? 0).toBeLessThanOrEqual(520);
        }
      }
      if (name !== "buscar" && name !== "carrito") {
        await page.evaluate(() => {
          for (const animation of document.getAnimations()) animation.finish();
        });
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${viewport.width}x${viewport.height}.png`),
          fullPage: true,
        });
      }
    }
    await page.goto(new URL("/buscar/", serverUrl).toString());
    const searchTitle = page.getByRole("heading", { level: 1, name: "Buscar productos" });
    const searchHelp = page
      .locator("#solara-main")
      .getByText(catalogModernV2Store.publicCopy.search.queryLabel, { exact: true });
    const [titleBox, helpBox] = await Promise.all([
      searchTitle.boundingBox(),
      searchHelp.boundingBox(),
    ]);
    expect(titleBox).not.toBeNull();
    expect(helpBox).not.toBeNull();
    expect(
      (helpBox?.y ?? 0) - ((titleBox?.y ?? 0) + (titleBox?.height ?? 0)),
    ).toBeGreaterThanOrEqual(8);
    const searchForm = page.locator(".solara-search-form");
    const searchInputBox = await searchForm
      .getByRole("searchbox", { name: "Buscar productos" })
      .boundingBox();
    const searchButtonBox = await searchForm.getByRole("button", { name: "Buscar" }).boundingBox();
    expect(searchInputBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(searchButtonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    if (viewport.label === "desktop") {
      expect(searchInputBox?.width ?? 0).toBeGreaterThanOrEqual(720);
      expect(searchButtonBox?.y).toBe(searchInputBox?.y);
    } else {
      // El contenedor V2 aporta su propio inset (1.5rem) sobre el padding del
      // container (1rem por lado): el input llena 390 - 24 - 32 = 334px.
      expect(searchInputBox?.width ?? 0).toBeGreaterThanOrEqual(330);
      expect(searchButtonBox?.width ?? 0).toBeGreaterThanOrEqual(330);
      expect(searchButtonBox?.y ?? 0).toBeGreaterThan((searchInputBox?.y ?? 0) + 44);
    }
    await page.screenshot({
      path: testInfo.outputPath(`search-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });

    await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page
      .getByLabel(catalogModernV2Store.publicCopy.product.variant, { exact: true })
      .selectOption({ index: 1 });
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await page.getByRole("button", { name: "Cerrar carrito" }).click();
    await page.goto(new URL("/carrito/", serverUrl).toString());
    await expect(
      page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
    ).toHaveCount(1);
    const cartSummary = page.locator(".solara-cart-page-grid > aside");
    const cartSummaryBox = await cartSummary.boundingBox();
    const summaryAmount = cartSummary.locator("strong").first();
    const summaryTypography = await summaryAmount.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { family: styles.fontFamily, size: Number.parseFloat(styles.fontSize) };
    });
    expect(summaryTypography.family.toLowerCase()).not.toContain("georgia");
    expect(summaryTypography.size).toBeLessThanOrEqual(24);
    if (viewport.label === "desktop") {
      expect(cartSummaryBox?.width ?? 0).toBeGreaterThanOrEqual(360);
    } else {
      // Mismo inset V2 que el input de búsqueda: 390 - 24 - 32 = 334px.
      expect(cartSummaryBox?.width ?? 0).toBeGreaterThanOrEqual(330);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({
      path: testInfo.outputPath(`cart-page-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});

test("V2 mantiene el 404 detrás del título y alinea sus acciones", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 844 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(new URL("/404.html", serverUrl).toString());
    const metrics = await page.locator(".solara-error-hero").evaluate((hero) => {
      const copy = hero.querySelector<HTMLElement>(".solara-error-copy");
      const code = hero.querySelector<HTMLElement>(".solara-error-code");
      const actions = hero.querySelector<HTMLElement>(".solara-error-actions");
      const buttonBoxes = Array.from(
        hero.querySelectorAll<HTMLElement>(".solara-error-actions > *"),
        (element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            top: box.top,
            width: box.width,
          };
        },
      );
      const codeBox = code?.getBoundingClientRect();
      const actionsBox = actions?.getBoundingClientRect();
      return {
        copyZIndex: copy ? Number.parseInt(getComputedStyle(copy).zIndex, 10) : -1,
        codeZIndex: code ? Number.parseInt(getComputedStyle(code).zIndex, 10) : -1,
        codePointerEvents: code ? getComputedStyle(code).pointerEvents : "missing",
        codeTop: codeBox?.top ?? 0,
        actionsBottom: actionsBox?.bottom ?? 0,
        actionsDisplay: actions ? getComputedStyle(actions).display : "missing",
        buttonBoxes,
      };
    });
    expect(metrics.copyZIndex).toBeGreaterThan(metrics.codeZIndex);
    expect(metrics.codePointerEvents).toBe("none");
    expect(metrics.buttonBoxes).toHaveLength(2);
    if (viewport.width < 1200) {
      expect(metrics.actionsDisplay).toBe("grid");
      expect(
        Math.abs(metrics.buttonBoxes[0].width - metrics.buttonBoxes[1].width),
      ).toBeLessThanOrEqual(1);
      expect(metrics.buttonBoxes[0].left).toBe(metrics.buttonBoxes[1].left);
      expect(metrics.codeTop).toBeGreaterThanOrEqual(metrics.actionsBottom);
    } else {
      expect(metrics.actionsDisplay).toBe("flex");
      expect(metrics.buttonBoxes[0].top).toBe(metrics.buttonBoxes[1].top);
    }
  }
});

test("V2 búsqueda: todos los controles son cuadrados en desktop, tablet y mobile", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1920, height: 968, label: "desktop" },
    { width: 1024, height: 768, label: "tablet" },
    { width: 390, height: 844, label: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(new URL("/buscar/", serverUrl).toString());

    const searchForm = page.locator(".solara-search-form");
    await expect(searchForm).toBeVisible();
    const pageSearchRadii = await searchForm.evaluate((form) => {
      const input = form.querySelector<HTMLElement>("input");
      const submit = form.querySelector<HTMLElement>("button[type='submit']");
      if (!input || !submit) throw new Error("Faltan controles en el formulario de búsqueda.");
      return {
        input: getComputedStyle(input).borderRadius,
        submit: getComputedStyle(submit).borderRadius,
      };
    });
    expect(pageSearchRadii, viewport.label).toEqual({ input: "0px", submit: "0px" });

    await page.goto(serverUrl);
    await page.locator("[data-catalog-search-open]").first().click();
    const dialog = page.locator("#catalog-search-dialog");
    await expect(dialog).toBeVisible();
    const dialogRadii = await dialog.evaluate((root) => {
      const radiusOf = (selector: string): string => {
        const element = root.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Falta ${selector} en el diálogo de búsqueda.`);
        return getComputedStyle(element).borderRadius;
      };
      return {
        dialog: getComputedStyle(root).borderRadius,
        close: radiusOf("[data-catalog-search-close]"),
        input: radiusOf(".catalog-search-dialog-controls input"),
        submit: radiusOf(".catalog-search-dialog-controls button[type='submit']"),
      };
    });
    expect(dialogRadii, viewport.label).toEqual({
      dialog: "0px",
      close: "0px",
      input: "0px",
      submit: "0px",
    });

    await page.screenshot({
      path: testInfo.outputPath(
        `search-square-${viewport.label}-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
    await page.locator("[data-catalog-search-close]").click();

    if (viewport.width <= 767) {
      await page.locator("[data-catalog-menu-open]").click();
      const mobileSearch = page.locator(".catalog-mobile-search__field");
      await expect(mobileSearch).toBeVisible();
      const mobileSearchRadii = await mobileSearch.evaluate((field) => {
        const submit = field.querySelector<HTMLElement>("button");
        if (!submit) throw new Error("Falta el botón del buscador móvil.");
        return {
          field: getComputedStyle(field).borderRadius,
          submit: getComputedStyle(submit).borderRadius,
        };
      });
      expect(mobileSearchRadii, viewport.label).toEqual({ field: "0px", submit: "0px" });
      await page.locator("[data-catalog-menu-close]").click();
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      viewport.label,
    ).toBeLessThanOrEqual(viewport.width);
  }
});

test("V2 búsqueda comparte el hover temático del CTA del footer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL("/buscar/", serverUrl).toString());

  const searchButton = page.locator(".solara-search-form button[type='submit']");
  const footerButton = page.locator(".catalog-footer-whatsapp");
  await expect(searchButton).toBeVisible();
  await expect(footerButton).toBeVisible();

  const searchRest = await readActionSurface(searchButton);
  const footerRest = await readActionSurface(footerButton);
  expect(searchRest).toMatchObject({
    background: footerRest.background,
    border: footerRest.border,
    color: footerRest.color,
  });

  const searchHover = await hoverAndReadSettledSurface(searchButton);
  const footerHover = await hoverAndReadSettledSurface(footerButton);
  expect(searchHover).toEqual(footerHover);
  expect(searchHover.background).not.toBe(searchRest.background);
  expect(searchHover.color).not.toBe(searchRest.color);
});

test("V2 carrito comparte el tratamiento visual del CTA de WhatsApp del footer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();

  const cartButton = page.getByRole("button", { name: "Continuar a compra" });
  const footerButton = page.locator(".catalog-footer-whatsapp");
  await expect(cartButton).toBeVisible();

  expect(await readActionSurface(cartButton)).toEqual(await readActionSurface(footerButton));
  const cartHover = await hoverAndReadSettledSurface(cartButton);
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  const footerHover = await hoverAndReadSettledSurface(footerButton);
  expect(cartHover).toMatchObject({
    background: footerHover.background,
    border: footerHover.border,
    color: footerHover.color,
  });
});

test("V2 producto comparte el hover visual del CTA de WhatsApp del footer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());

  const productButton = page.getByRole("button", { name: "Agregar al carrito" });
  const footerButton = page.locator(".catalog-footer-whatsapp");
  await expect(productButton).toBeVisible();
  expect(await readActionSurface(productButton)).toEqual(await readActionSurface(footerButton));

  const productHover = await hoverAndReadSettledSurface(productButton);
  const footerHover = await hoverAndReadSettledSurface(footerButton);

  expect(productHover).toEqual(footerHover);
  expect(productHover.background).not.toBe("rgba(0, 0, 0, 0)");
});

test("V2 CTA de Contacto vuelve al formulario de Inicio desde una página interna", async ({
  page,
}) => {
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  const contactAction = page.locator(
    '[data-solara-module="catalog-newsletter-cta"] .catalog-newsletter-action',
  );

  await expect(contactAction).toHaveAttribute("href", "/#contact-form");
  await contactAction.click();
  await expect(page).toHaveURL(new URL("/#contact-form", serverUrl).toString());
  await expect(page.locator("#contact-form")).toBeVisible();
});

test("V1 y V2 conservan contenido y aislamiento en capturas equivalentes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const v1HtmlFile = exportedV1.files.get("index.html");
  const v1CssFile = [...exportedV1.files.entries()].find(([path]) => path.endsWith(".css"))?.[1];
  if (!v1HtmlFile) throw new Error("La exportación V1 no generó index.html.");
  if (!v1CssFile) throw new Error("La exportación V1 no generó styles.css.");
  const v1Html = (
    typeof v1HtmlFile === "string" ? v1HtmlFile : new TextDecoder().decode(v1HtmlFile)
  ).replace(
    "</head>",
    `<base href="${serverUrl}/"><style>${typeof v1CssFile === "string" ? v1CssFile : new TextDecoder().decode(v1CssFile)}</style></head>`,
  );
  await page.setContent(v1Html, { waitUntil: "networkidle" });
  await expect(page.locator('[data-design-family="catalog-modern-v1"]')).toBeVisible();
  await expect(page.locator(".cm.v2")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vestite con lo que te representa.",
  );
  await expect(page.locator(".catalog-hero-inner")).toHaveCSS("display", "grid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  await revealWholePage(page);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
  await page.screenshot({
    path: testInfo.outputPath("comparison-v1-1920x968.png"),
    fullPage: true,
  });

  await page.goto(serverUrl);
  await expect(page.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vestite con lo que te representa.",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  await revealWholePage(page);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
  await page.screenshot({
    path: testInfo.outputPath("comparison-v2-1920x968.png"),
    fullPage: true,
  });
});
