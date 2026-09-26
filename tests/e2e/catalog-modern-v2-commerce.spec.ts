import { expect, test } from "@playwright/test";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { revealWholePage, startCatalogModernV2Server } from "./catalog-modern-v2-support";

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
test("V2 ordena categoría y filtros como rail editorial y sheet móvil", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(new URL("/categorias/remeras/", serverUrl).toString());

  const layout = page.locator(".catalog-category-layout");
  const filters = page.locator(".catalog-category-filters");
  const grid = page.locator(".catalog-category-results .catalog-product-grid");
  const categoryImage = page.locator(".solara-category-hero img");
  await expect(layout).toBeVisible();
  await expect(filters.locator(".catalog-filter-groups")).toBeVisible();
  await expect(filters.locator("details + .catalog-filter-groups")).toHaveCount(1);
  const toolbar = page.locator(".catalog-category-results .solara-category-toolbar");
  await expect(toolbar).toHaveCSS("border-top-width", "0px");
  await expect(toolbar).toHaveCSS("border-bottom-width", "0px");
  await expect(filters).toHaveCSS("border-top-width", "0px");
  await expect(filters).toHaveCSS("border-bottom-width", "0px");
  const filterFieldsets = filters.locator(".catalog-filter-groups fieldset");
  await expect(filterFieldsets).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(filterFieldsets.nth(index)).toHaveCSS("border-bottom-width", "0px");
  }
  await expect(filters.locator("select").first()).toHaveCSS("border-top-width", "1px");
  await expect(filters.locator("input[type=number]").first()).toHaveCSS("border-top-width", "1px");
  expect(
    await categoryImage.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    }),
  ).toBeCloseTo(5 / 3, 1);
  await expect(categoryImage).toHaveCSS("object-fit", "cover");
  expect(await layout.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).toMatch(
    /^2[4-9]\dpx /,
  );
  // La grilla de categorías topea en 4 columnas sobre su contenedor de 1320px
  // (auto-fit min(100% / 5, 20rem); el rail la deja más angosta que la home).
  expect(
    await grid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(4);
  const categoryGridMetrics = await grid.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const resultsRect = element
      .closest<HTMLElement>(".catalog-category-results")
      ?.getBoundingClientRect();
    const cardRects = Array.from(element.querySelectorAll<HTMLElement>(".catalog-product-card"))
      .slice(0, 4)
      .map((card) => card.getBoundingClientRect());
    const firstCardRect = cardRects[0];
    const lastCardRect = cardRects[cardRects.length - 1];
    return {
      gridWidth: gridRect.width,
      cardWidth: firstCardRect?.width ?? 0,
      leftGap: gridRect.left - (resultsRect?.left ?? gridRect.left),
      rightGap: (resultsRect?.right ?? gridRect.right) - gridRect.right,
      firstCardGap: firstCardRect ? firstCardRect.left - gridRect.left : 0,
      lastCardGap: lastCardRect ? gridRect.right - lastCardRect.right : 0,
      resultsWidth: resultsRect?.width ?? 0,
    };
  });
  expect(categoryGridMetrics.gridWidth).toBeGreaterThan(categoryGridMetrics.resultsWidth * 0.98);
  expect(categoryGridMetrics.gridWidth).toBeLessThanOrEqual(categoryGridMetrics.resultsWidth + 1);
  expect(categoryGridMetrics.leftGap).toBeLessThanOrEqual(1);
  expect(categoryGridMetrics.rightGap).toBeLessThanOrEqual(1);
  expect(categoryGridMetrics.firstCardGap).toBeLessThanOrEqual(1);
  expect(categoryGridMetrics.lastCardGap).toBeLessThanOrEqual(1);
  // 4 columnas distribuidas dentro del contenedor de resultados.
  expect(categoryGridMetrics.cardWidth).toBeGreaterThan(295);
  expect(categoryGridMetrics.cardWidth * 4).toBeLessThanOrEqual(categoryGridMetrics.gridWidth);
  expect(await grid.locator(".catalog-product-card-image").first().getAttribute("sizes")).toBe(
    "(max-width: 767px) calc((100vw - 2.2rem) / 2), (max-width: 1199px) min(22vw, 11.5rem), min(20vw, 13rem)",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  await revealWholePage(page);
  await page.screenshot({ path: testInfo.outputPath("category-1920x968.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/categorias/remeras/", serverUrl).toString());
  const mobileLayout = await layout.evaluate((element) => {
    const toolbar = element.querySelector<HTMLElement>(".solara-category-toolbar");
    const rect = element.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      width: rect.width,
      toolbarWidth: toolbarRect?.width ?? 0,
      toolbarScrollWidth: toolbar?.scrollWidth ?? 0,
    };
  });
  expect(mobileLayout.columns).toBe(1);
  expect(mobileLayout.width).toBeLessThanOrEqual(390);
  expect(mobileLayout.toolbarWidth).toBeGreaterThan(300);
  expect(mobileLayout.toolbarScrollWidth).toBeLessThanOrEqual(mobileLayout.toolbarWidth);
  await expect(layout.locator(".solara-category-toolbar span")).toBeVisible();
  const mobileSort = layout.locator(".solara-category-toolbar select");
  await expect(mobileSort).toBeVisible();
  expect((await mobileSort.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(filters.locator(".catalog-filter-groups")).toBeHidden();
  await expect(filters.locator("details")).not.toHaveAttribute("open", "");
  await filters.locator("summary").click();
  await expect(filters.locator("details")).toHaveAttribute("open", "");
  await expect(filters.locator(".catalog-filter-groups")).toBeVisible();
  await expect(filters.locator("details > summary .catalog-filter-disclosure")).toBeVisible();
  const mobileFilter = await filters.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      position: style.position,
      bottom: Math.round(innerHeight - rect.bottom),
      width: rect.width,
    };
  });
  expect(mobileFilter.position).toBe("fixed");
  expect(mobileFilter.bottom).toBe(0);
  expect(mobileFilter.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("filters-390x844.png"), fullPage: false });
});

test("V2 presenta PDP editorial y carrito lateral o inferior según viewport", async ({
  page,
}, testInfo) => {
  const productUrl = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(productUrl);

  const detail = page.locator(".catalog-product-detail-inner");
  const info = page.locator(".catalog-product-info");
  await expect(detail).toBeVisible();
  expect(await detail.evaluate((element) => getComputedStyle(element).gridTemplateColumns)).toMatch(
    /^\d+(\.\d+)?px \d+(\.\d+)?px$/,
  );
  expect(await info.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  const desktopBalance = await detail.evaluate((element) => {
    const gallery = element.querySelector<HTMLElement>(".catalog-product-gallery");
    const productInfo = element.querySelector<HTMLElement>(".catalog-product-info");
    return {
      galleryWidth: gallery?.getBoundingClientRect().width ?? 0,
      infoWidth: productInfo?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(desktopBalance.galleryWidth / desktopBalance.infoWidth).toBeLessThan(1.6);
  const galleryRatio = await page.locator(".catalog-product-gallery-main").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(galleryRatio).toBeCloseTo(1, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  await page.screenshot({ path: testInfo.outputPath("product-1920x968.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(productUrl);
  const mobileDetail = page.locator(".catalog-product-detail-inner");
  const mobileInfo = page.locator(".catalog-product-info");
  const mobileProductMetrics = await mobileDetail.evaluate((element) => {
    const detailRect = element.getBoundingClientRect();
    const gallery = element.querySelector<HTMLElement>(".catalog-product-gallery-main");
    const galleryRect = gallery?.getBoundingClientRect();
    const galleryMedia = gallery?.querySelector<HTMLElement>(".catalog-product-gallery-image");
    const productInfo = element.querySelector<HTMLElement>(".catalog-product-info");
    const title = productInfo?.querySelector<HTMLElement>("h1");
    const action = element.querySelector<HTMLElement>(".catalog-product-add");
    return {
      layout: getComputedStyle(element).display,
      detailLeft: detailRect.left,
      detailRight: innerWidth - detailRect.right,
      galleryWidth: galleryRect?.width ?? 0,
      galleryHeight: galleryRect?.height ?? 0,
      galleryObjectFit: galleryMedia ? getComputedStyle(galleryMedia).objectFit : "",
      infoWidth: productInfo?.getBoundingClientRect().width ?? 0,
      titleWidth: title?.getBoundingClientRect().width ?? 0,
      actionBottom: action?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mobileProductMetrics.layout).toBe("flex");
  expect(mobileProductMetrics.detailLeft).toBeGreaterThanOrEqual(11);
  expect(mobileProductMetrics.detailRight).toBeGreaterThanOrEqual(11);
  expect(mobileProductMetrics.galleryWidth / mobileProductMetrics.galleryHeight).toBeCloseTo(1, 1);
  expect(mobileProductMetrics.galleryHeight).toBeLessThanOrEqual(520);
  expect(mobileProductMetrics.galleryObjectFit).toBe("cover");
  expect(mobileProductMetrics.titleWidth / mobileProductMetrics.infoWidth).toBeGreaterThanOrEqual(
    0.98,
  );
  expect(mobileProductMetrics.actionBottom).toBeGreaterThan(0);
  expect(mobileProductMetrics.documentWidth).toBeLessThanOrEqual(390);
  await expect(mobileInfo.getByRole("button", { name: "Agregar al carrito" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("product-390x844.png"), fullPage: true });

  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(productUrl);

  await page
    .getByLabel(catalogModernV2Store.publicCopy.product.variant, { exact: true })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  const drawer = page.locator(".catalog-cart-drawer");
  await expect(drawer).toHaveAttribute("data-open", "true");
  expect(Math.round((await drawer.boundingBox())?.width ?? 0)).toBe(520);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  const drawerBounds = await drawer.evaluate((element) => {
    const drawerRect = element.getBoundingClientRect();
    const targets = [
      element.querySelector("header button"),
      element.querySelector(".solara-cart-line > span:last-child"),
      ...element.querySelectorAll(".catalog-cart-summary strong"),
    ].filter((target): target is Element => target !== null);
    return {
      left: drawerRect.left,
      right: drawerRect.right,
      targets: targets.map((target) => {
        const rect = target.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    };
  });
  expect(drawerBounds.targets.length).toBeGreaterThanOrEqual(5);
  expect(
    drawerBounds.targets.every(
      (target) => target.left >= drawerBounds.left && target.right <= drawerBounds.right,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cart-1920x968.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  const drawerMetrics = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: Math.round(rect.width), bottom: Math.round(innerHeight - rect.bottom) };
  });
  expect(drawerMetrics).toEqual({ width: 390, bottom: 0 });
  const expectCompactSummary = async () => {
    const metrics = await drawer.locator(".catalog-cart-summary").evaluate((summary) => {
      const summaryRect = summary.getBoundingClientRect();
      const rows = summary.querySelectorAll<HTMLElement>(":scope > p");
      const deliveryValue = rows[1]?.querySelector("strong")?.getBoundingClientRect();
      const totalStyle = rows[2] ? getComputedStyle(rows[2]) : null;
      const footer = summary
        .closest(".catalog-cart-drawer")
        ?.querySelector<HTMLElement>(".catalog-drawer-footer");
      return {
        leftGap: Math.abs((rows[0]?.getBoundingClientRect().left ?? 0) - summaryRect.left),
        rightGap: Math.abs(summaryRect.right - (deliveryValue?.right ?? 0)),
        summaryBorder: getComputedStyle(summary).borderTopWidth,
        totalBorder: totalStyle?.borderTopWidth,
        footerBorder: footer ? getComputedStyle(footer).borderTopWidth : null,
      };
    });
    expect(metrics.leftGap).toBeLessThanOrEqual(1);
    expect(metrics.rightGap).toBeLessThanOrEqual(1);
    expect(metrics).toEqual(
      expect.objectContaining({ summaryBorder: "0px", totalBorder: "0px", footerBorder: "0px" }),
    );
  };
  await expectCompactSummary();
  await page.screenshot({ path: testInfo.outputPath("cart-390x844.png"), fullPage: false });

  await page.setViewportSize({ width: 700, height: 900 });
  await expectCompactSummary();
  await page.screenshot({ path: testInfo.outputPath("cart-700x900.png"), fullPage: false });
});

test("V2 ofrece una salida útil cuando el carrito está vacío", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const cartAction = page.locator("[data-cart-cta]:visible");
  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(cartAction).toHaveText("Explorar categorías");
  await expect(cartAction).toHaveAttribute("href", "/categorias/remeras/");

  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(cartAction).toHaveText("Escribinos para coordinar");
  await expect(cartAction).toHaveAttribute("href", "/#contact-form");
});

test("V2 recupera el carrito desde el respaldo si la clave primaria está dañada", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const productUrl = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  const cartKey = "solara-cart:store-catalog-modern-v2";
  await page.goto(productUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.evaluate((key) => localStorage.setItem(key, "{ carrito dañado"), cartKey);

  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(1);
});

test("V2 conserva un vaciado intencional sin recuperar la copia anterior", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const productUrl = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  const cartKey = "solara-cart:store-catalog-modern-v2";
  await page.goto(productUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.locator("[data-cart-remove]").first().click();

  await expect(page.locator("[data-cart-count]").first()).toHaveText("0");
  await expect(
    page.evaluate(
      (key) => ({
        primary: localStorage.getItem(key),
        backup: localStorage.getItem(`${key}:backup`),
      }),
      cartKey,
    ),
  ).resolves.toEqual({ primary: "[]", backup: "[]" });

  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(page.locator("[data-cart-count]").first()).toHaveText("0");
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(0);
});

test("V2 conserva todas las líneas y ofrece contacto desde el carrito", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const firstProduct = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  const secondProduct = new URL("/productos/remera-grafica-horizonte/", serverUrl).toString();

  await page.goto(firstProduct);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-catalog-modern-v2"));
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.getByRole("button", { name: "Cerrar carrito" }).click();

  await page.goto(secondProduct);
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("2");
  await page.getByRole("button", { name: "Cerrar carrito" }).click();

  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(2);
  const cartAction = page.locator("[data-cart-cta]:visible");
  await expect(cartAction).toHaveText("Escribinos para coordinar");
  await expect(cartAction).toHaveAttribute("href", "/#contact-form");
});
