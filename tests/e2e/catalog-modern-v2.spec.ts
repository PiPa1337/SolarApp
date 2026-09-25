import { expect, test } from "@playwright/test";
import {
  exportedV1,
  revealWholePage,
  startCatalogModernV2Server,
} from "./catalog-modern-v2-support";
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
test("V2 compone el fold editorial y la grilla sin overflow en 1920x968", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);

  const root = page.locator('[data-design-family="catalog-modern-v2"]');
  await expect(root).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".catalog-hero-media img")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  expect(
    await page.locator(".catalog-hero-copy h1").evaluate((element) => ({
      overflowWrap: getComputedStyle(element).overflowWrap,
      wordBreak: getComputedStyle(element).wordBreak,
    })),
  ).toEqual({ overflowWrap: "anywhere", wordBreak: "normal" });
  expect(
    await page.locator(".catalog-hero-copy h1").evaluate((element) => {
      const words: { word: string; rects: number }[] = [];
      for (const inner of element.querySelectorAll<HTMLElement>("[data-hero-line-inner]")) {
        const node = inner.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        const lineWords = text.match(/\S+/g) ?? [];
        let offset = 0;
        for (const word of lineWords) {
          const start = text.indexOf(word, offset);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word.length);
          offset = start + word.length;
          words.push({ word, rects: range.getClientRects().length });
        }
      }
      return words;
    }),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ word: "representa.", rects: 1 })]));

  const heroMetrics = await page.locator(".catalog-hero-inner").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const title = element.querySelector("h1")?.getBoundingClientRect();
    const actions = element.querySelector(".catalog-hero-actions")?.getBoundingClientRect();
    const media = element.querySelector(".catalog-hero-media")?.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom,
      titleInside: Boolean(title && title.left >= rect.left && title.right <= rect.right),
      titleBeforeMedia: Boolean(title && media && title.right <= media.left),
      actionsInViewport: Boolean(actions && actions.bottom <= window.innerHeight),
      mediaShare: media ? media.width / rect.width : 0,
      mediaAspect: media ? Number(((media.width / media.height) * 100).toFixed(2)) : 0,
    };
  });
  expect(heroMetrics.width).toBeGreaterThan(1700);
  expect(heroMetrics.height).toBeGreaterThan(0);
  expect(heroMetrics.bottom).toBeLessThanOrEqual(969);
  expect(heroMetrics.titleInside).toBe(true);
  expect(heroMetrics.titleBeforeMedia).toBe(true);
  expect(heroMetrics.actionsInViewport).toBe(true);
  expect(heroMetrics.mediaShare).toBeGreaterThan(0.2);
  expect(heroMetrics.mediaShare).toBeLessThan(0.45);
  expect(heroMetrics.mediaAspect).toBeGreaterThan(50);
  expect(heroMetrics.mediaAspect).toBeLessThan(59);

  await expect
    .poll(
      () =>
        page
          .locator('[data-solara-module="catalog-hero"]')
          .evaluate((element) => getComputedStyle(element).opacity),
      { timeout: 5_000 },
    )
    .toBe("1");

  // Coreografía de entrada del hero V2: tras ~1.4s las líneas, la regla, el
  // cuerpo, las acciones, los beneficios y el media quedan en estado final.
  await expect
    .poll(
      () =>
        page
          .locator("[data-hero-benefit]")
          .nth(2)
          .evaluate((element) => getComputedStyle(element).opacity),
      { timeout: 5_000 },
    )
    .toBe("1");
  const heroFinal = await page.evaluate(() => {
    const identity = ["none", "matrix(1, 0, 0, 1, 0, 0)"];
    const title = document.querySelector(".catalog-hero-title");
    const lines = [...document.querySelectorAll<HTMLElement>("[data-hero-line-inner]")];
    const rule = document.querySelector(".catalog-hero-rule");
    const media = document.querySelector("[data-hero-media]");
    const benefits = [
      ...document.querySelectorAll<HTMLElement>(".catalog-hero-benefits--copy [data-hero-benefit]"),
    ];
    const body = document.querySelector(".catalog-hero-reveal--body");
    const actions = document.querySelector(".catalog-hero-reveal--actions");
    const mediaClip = media ? getComputedStyle(media).clipPath : "";
    const clipPercentages =
      mediaClip === "none" ? [] : [...mediaClip.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
    return {
      titleOpacity: title ? getComputedStyle(title).opacity : "",
      linesFinal: lines.every((line) => identity.includes(getComputedStyle(line).transform)),
      ruleFinal: rule ? identity.includes(getComputedStyle(rule).transform) : false,
      bodyOpacity: body ? getComputedStyle(body).opacity : "",
      actionsOpacity: actions ? getComputedStyle(actions).opacity : "",
      benefitOpacities: benefits.map((benefit) => getComputedStyle(benefit).opacity),
      mediaVisible:
        Boolean(media) &&
        getComputedStyle(media).opacity === "1" &&
        (mediaClip === "none" || clipPercentages.length === 0 || Math.max(...clipPercentages) <= 1),
    };
  });
  expect(heroFinal.titleOpacity).toBe("1");
  expect(heroFinal.linesFinal).toBe(true);
  expect(heroFinal.ruleFinal).toBe(true);
  expect(heroFinal.bodyOpacity).toBe("1");
  expect(heroFinal.actionsOpacity).toBe("1");
  expect(heroFinal.benefitOpacities).toEqual(["1", "1", "1"]);
  expect(heroFinal.mediaVisible).toBe(true);

  expect(await page.locator("[data-hero-background]").count()).toBe(0);
  await expect(page.locator(".catalog-hero-line-inner").first()).toHaveCSS("text-shadow", "none");

  // Los beneficios del hero van en una caja con blur de fondo sobre la imagen.
  const benefitsBox = await page
    .locator(".catalog-hero-benefits--copy")
    .evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(benefitsBox).not.toBe("none");

  const heroCollision = await page.evaluate(() => {
    const header = document
      .querySelector('[data-solara-module="catalog-header"]')
      ?.getBoundingClientRect();
    const hero = document.querySelector(".catalog-hero-inner")?.getBoundingClientRect();
    const strip = document
      .querySelector('[data-solara-module="catalog-brand-strip"] .catalog-brand-strip-inner')
      ?.getBoundingClientRect();
    return {
      headerBottom: header?.bottom ?? 0,
      heroTop: hero?.top ?? 0,
      heroBottom: hero?.bottom ?? 0,
      stripTop: strip?.top ?? 0,
    };
  });
  expect(Math.abs(heroCollision.heroTop - heroCollision.headerBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(heroCollision.stripTop - heroCollision.heroBottom)).toBeLessThanOrEqual(1);

  const bento = page.locator(".catalog-category-bento-grid");
  await expect(bento.locator(".catalog-category-bento-item")).toHaveCount(8);
  await expect(bento).not.toContainText("Básicas");
  await expect(bento.locator(".catalog-category-bento-item--wide")).not.toHaveCount(0);
  await expect(bento.locator(".catalog-category-bento-item--tall")).not.toHaveCount(0);
  await expect(bento.locator(".catalog-category-bento-item--compact")).not.toHaveCount(0);

  const grid = page.locator(".catalog-product-grid").first();
  // La grilla V2 topea en 5 columnas (min(100% / 5, 20rem)): 5 es el máximo
  // editorial en desktop y las cards crecen con la columna.
  expect(
    await grid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(5);
  const gridMetrics = await grid.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const cardRect = element
      .querySelector<HTMLElement>(".catalog-product-card")
      ?.getBoundingClientRect();
    return { gridWidth: gridRect.width, cardWidth: cardRect?.width ?? 0 };
  });
  expect(gridMetrics.gridWidth).toBeGreaterThan(1700);
  expect(gridMetrics.gridWidth).toBeLessThanOrEqual(1760);
  // 5 columnas sobre 1760px con gap 1.6rem: card ≈ 331px.
  expect(gridMetrics.cardWidth).toBeGreaterThan(320);
  expect(gridMetrics.cardWidth).toBeLessThan(345);
  const sectionPadding = await page
    .locator(".catalog-product-grid-section")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        top: Number.parseFloat(style.paddingTop),
        bottom: Number.parseFloat(style.paddingBottom),
      };
    });
  expect(sectionPadding.top).toBeLessThanOrEqual(140);
  expect(sectionPadding.bottom).toBeLessThanOrEqual(140);
  const firstMedia = grid.locator(".catalog-product-media").first();
  const mediaRatio = await firstMedia.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(mediaRatio).toBeCloseTo(1, 1);

  const image = firstMedia.locator("img");
  await expect(image).toHaveAttribute(
    "sizes",
    "(max-width: 767px) calc((100vw - 2.2rem) / 2), (max-width: 1199px) min(22vw, 11.5rem), min(20vw, 13rem)",
  );
  const initialTransform = await image.evaluate((element) => getComputedStyle(element).transform);
  await firstMedia.hover();
  await expect
    .poll(() => image.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialTransform);

  await revealWholePage(page);
  await expect(page.locator(".catalog-product-card").last()).toHaveCSS("opacity", "1");
  await expect
    .poll(() =>
      page
        .locator(".catalog-product-grid")
        .first()
        .locator(".catalog-product-card-image")
        .evaluateAll(
          (images) =>
            images.filter(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ).length,
        ),
    )
    .toBe(12);
  await page.screenshot({ path: testInfo.outputPath("home-1920x968.png"), fullPage: true });
});

test("V2 conserva el encuadre 9:16 y llena la media del hero", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const viewports = [
    { width: 1920, height: 968 },
    { width: 1024, height: 768 },
    { width: 768, height: 823 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    await waitForStorefrontReady(page);
    const metrics = await page.evaluate(() => {
      const media = document.querySelector<HTMLElement>("[data-hero-media]");
      const picture = media?.querySelector<HTMLElement>(":scope > picture");
      const image = media?.querySelector<HTMLImageElement>("img");
      if (!media || !image) return null;
      const mediaRect = media.getBoundingClientRect();
      const content = picture ?? image;
      const contentRect = content.getBoundingClientRect();
      const pictureRect = picture?.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      return {
        media: { width: mediaRect.width, height: mediaRect.height },
        picture: pictureRect ? { width: pictureRect.width, height: pictureRect.height } : null,
        image: { width: imageRect.width, height: imageRect.height },
        content: { width: contentRect.width, height: contentRect.height },
        natural: { width: image.naturalWidth, height: image.naturalHeight },
        currentSrc: image.currentSrc,
        objectFit: getComputedStyle(image).objectFit,
        position: getComputedStyle(media).position,
      };
    });
    if (!metrics) throw new Error(`No se pudo medir el hero en ${viewport.width}px.`);
    expect(metrics.media.width / metrics.media.height).toBeCloseTo(9 / 16, 2);
    expect(Math.abs(metrics.content.width - metrics.media.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.content.height - metrics.media.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.image.width - metrics.content.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.image.height - metrics.content.height)).toBeLessThanOrEqual(1);
    expect(metrics.objectFit).toBe("cover");
    if (viewport.width < 1024) {
      expect(metrics.currentSrc).toContain("fixture-modo-sur-hero.webp");
      expect(metrics.currentSrc).not.toContain("-768.webp");
    }
    await page.screenshot({
      path: testInfo.outputPath(`hero-media-${viewport.width}.png`),
      fullPage: false,
    });
  }
});

test("V2 refuerza el copy del hero en mobile sin alterar el CTA", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(serverUrl);
  await waitForStorefrontReady(page);

  const colors = await page.locator(".catalog-hero-editorial").evaluate((hero) => {
    const title = hero.querySelector<HTMLElement>(".catalog-hero-title");
    const body = hero.querySelector<HTMLElement>(".catalog-hero-body");
    const action = hero.querySelector<HTMLElement>(".catalog-hero-actions .catalog-primary-action");
    if (!title || !body || !action) return null;
    return {
      titleColor: getComputedStyle(title).color,
      bodyColor: getComputedStyle(body).color,
      actionColor: getComputedStyle(action).color,
    };
  });

  expect(colors).not.toBeNull();
  expect(colors?.bodyColor).toBe(colors?.titleColor);
  expect(colors?.actionColor).toBe("rgb(255, 255, 255)");
});

test("V2 mantiene espacio para descendentes en títulos largos del hero", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1760, height: 810 },
    { width: 1024, height: 768 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${serverUrl}/?longTitle=1`);
    await waitForStorefrontReady(page);
    await expect(page.locator('[data-solara-module="catalog-hero"]')).toHaveCSS("opacity", "1");
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>(".catalog-hero-inner");
      const title = document.querySelector<HTMLElement>(".catalog-hero-title");
      const body = document.querySelector<HTMLElement>(".catalog-hero-body");
      if (!hero || !title || !body) return null;
      const heroRect = hero.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const style = getComputedStyle(title);
      const fontSize = Number.parseFloat(style.fontSize);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        documentWidth: document.documentElement.scrollWidth,
        titleBottom: titleRect.bottom,
        heroBottom: heroRect.bottom,
        bodyTop: bodyRect.top,
        titleOverflow: style.overflow,
        lineHeightRatio: lineHeight / fontSize,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(metrics?.titleBottom).toBeLessThanOrEqual((metrics?.heroBottom ?? 0) + 1);
    expect(metrics?.bodyTop).toBeGreaterThanOrEqual((metrics?.titleBottom ?? 0) - 1);
    expect(metrics?.titleOverflow).toBe("visible");
    expect(metrics?.lineHeightRatio).toBeGreaterThanOrEqual(1.14);
    await revealWholePage(page);
    await expect(page.locator("[data-hero-benefit]").nth(2)).toHaveCSS("opacity", "1");
    await page.screenshot({ path: testInfo.outputPath(`hero-line-height-${viewport.width}.png`) });
  }
});

test("V2 adapta automáticamente la altura del hero a un copy extenso en desktop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1920, height: 920 });
  await page.goto(`${serverUrl}/?autoHeight=1`);
  await waitForStorefrontReady(page);

  const metrics = await page.locator(".catalog-hero-inner").evaluate((element) => {
    const hero = element.getBoundingClientRect();
    const copy = element.querySelector<HTMLElement>(".catalog-hero-copy");
    const body = element.querySelector<HTMLElement>(".catalog-hero-body");
    const media = element.querySelector<HTMLElement>("[data-hero-media]");
    const benefitDescriptions = [
      ...element.querySelectorAll<HTMLElement>(".catalog-hero-benefits--copy small"),
    ];
    const copyRect = copy?.getBoundingClientRect();
    const mediaRect = media?.getBoundingClientRect();
    return {
      heroHeight: hero.height,
      copyBottom: copyRect?.bottom ?? Number.POSITIVE_INFINITY,
      heroBottom: hero.bottom,
      copyScrollHeight: copy?.scrollHeight ?? 0,
      copyClientHeight: copy?.clientHeight ?? 0,
      bodyBottom: body?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      mediaRatio: mediaRect ? mediaRect.height / mediaRect.width : 0,
      mediaBottom: mediaRect?.bottom ?? Number.POSITIVE_INFINITY,
      benefitDescriptionsBottom: benefitDescriptions.reduce(
        (bottom, description) => Math.max(bottom, description.getBoundingClientRect().bottom),
        0,
      ),
      viewportBottom: window.innerHeight,
    };
  });

  expect(metrics.copyBottom).toBeLessThanOrEqual(metrics.heroBottom + 1);
  expect(metrics.bodyBottom).toBeLessThanOrEqual(metrics.heroBottom + 1);
  expect(metrics.copyScrollHeight - metrics.copyClientHeight).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.mediaRatio - 16 / 9)).toBeLessThanOrEqual(0.01);
  expect(metrics.mediaBottom).toBeLessThanOrEqual(metrics.viewportBottom + 1);
  expect(metrics.benefitDescriptionsBottom).toBeLessThanOrEqual(metrics.viewportBottom + 1);
  expect(metrics.heroBottom).toBeLessThanOrEqual(metrics.viewportBottom + 1);
});

test("V2 mantiene compactos los h1 largos de categorías en todos los tamaños", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1760, height: 810 },
    { width: 1024, height: 768 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${serverUrl}/categorias/remeras/?longCategory=1`);
    const hero = page.locator(".solara-category-hero");
    const title = hero.locator("h1");
    const description = hero.locator(".solara-category-hero-copy > p");
    await expect(title).toHaveText("Gastronomía y Descartables");

    const metrics = await title.evaluate((element) => {
      const heroElement = element.closest<HTMLElement>(".solara-category-hero");
      const copyElement = heroElement?.querySelector<HTMLElement>(
        ":scope > .solara-category-hero-copy",
      );
      const descriptionElement = copyElement?.querySelector<HTMLElement>(":scope > p");
      const mediaElement = heroElement
        ? [...heroElement.children].find((child) => child.matches("img, picture"))
        : undefined;
      if (
        !heroElement ||
        !copyElement ||
        !descriptionElement ||
        !(mediaElement instanceof HTMLElement)
      )
        return null;
      const titleRect = element.getBoundingClientRect();
      const copyRect = copyElement.getBoundingClientRect();
      const descriptionRect = descriptionElement.getBoundingClientRect();
      const mediaRect = mediaElement.getBoundingClientRect();
      const heroRect = heroElement.getBoundingClientRect();
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      const lineHeight = Number.parseFloat(style.lineHeight);
      return {
        fontSize,
        lineHeightRatio: lineHeight / fontSize,
        titleHeight: titleRect.height,
        titleBottom: titleRect.bottom,
        copyTop: copyRect.top,
        copyBottom: copyRect.bottom,
        descriptionTop: descriptionRect.top,
        mediaTop: mediaRect.top,
        heroHeight: heroRect.height,
        overflowWrap: style.overflowWrap,
        maxWidth: style.maxWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics).not.toBeNull();
    if (!metrics) throw new Error("No se pudieron medir los h1 de categoría.");
    const maxFontSize = viewport.width >= 1200 ? 80 : viewport.width >= 768 ? 56 : 42;
    expect(metrics.fontSize).toBeLessThanOrEqual(maxFontSize);
    expect(metrics.lineHeightRatio).toBeGreaterThanOrEqual(1.04);
    expect(metrics.titleHeight).toBeLessThanOrEqual(viewport.width <= 767 ? 190 : 210);
    expect(metrics.titleBottom).toBeLessThanOrEqual(metrics.descriptionTop + 1);
    expect(metrics.descriptionTop - metrics.titleBottom).toBeGreaterThanOrEqual(8);
    expect(metrics.descriptionTop - metrics.titleBottom).toBeLessThanOrEqual(24);
    if (viewport.width >= 768) {
      expect(Math.abs(metrics.mediaTop - metrics.copyTop)).toBeLessThanOrEqual(2);
      expect(metrics.heroHeight).toBeLessThan(480);
    } else {
      expect(metrics.mediaTop).toBeGreaterThanOrEqual(metrics.copyBottom - 1);
    }
    expect(metrics.overflowWrap).toBe("break-word");
    expect(metrics.maxWidth).not.toBe("10ch");
    expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
    await expect(description).toBeVisible();
    await hero.screenshot({ path: testInfo.outputPath(`category-title-${viewport.width}.png`) });
  }
});

test("V1 mantiene compactos los h1 largos de categorías en todos los tamaños", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1760, height: 810 },
    { width: 1024, height: 768 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${serverUrl}/categorias/remeras/?longCategoryV1=1`);
    const hero = page.locator(".solara-category-hero");
    const title = hero.locator("h1");
    await expect(title).toHaveText("Gastronomía y Descartables");

    const metrics = await title.evaluate((element) => {
      const hero = element.closest<HTMLElement>(".solara-category-hero");
      const copy = hero?.querySelector<HTMLElement>(":scope > .solara-category-hero-copy");
      const description = copy?.querySelector<HTMLElement>(":scope > p");
      const media = hero
        ? [...hero.children].find((child) => child.matches("img, picture"))
        : undefined;
      const visualAnchor = element.querySelector<HTMLElement>(".solara-category-title-glass");
      if (!hero || !copy || !description || !(media instanceof HTMLElement) || !visualAnchor)
        return null;
      const titleRect = element.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      const descriptionRect = description.getBoundingClientRect();
      const mediaRect = media.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visualStyle = getComputedStyle(visualAnchor);
      const fontSize = Number.parseFloat(style.fontSize);
      return {
        fontSize,
        titleHeight: titleRect.height,
        titleBottom: titleRect.bottom,
        copyTop: copyRect.top,
        copyBottom: copyRect.bottom,
        descriptionTop: descriptionRect.top,
        mediaTop: mediaRect.top,
        heroHeight: heroRect.height,
        overflowWrap: style.overflowWrap,
        visualDisplay: visualStyle.display,
        visualPadding: visualStyle.padding,
        visualBackground: visualStyle.backgroundColor,
        visualBackdropFilter: visualStyle.backdropFilter,
        visualBorderWidth: visualStyle.borderWidth,
        visualBorderStyle: visualStyle.borderStyle,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics).not.toBeNull();
    if (!metrics) throw new Error("No se pudieron medir los h1 de categoría V1.");
    const maxFontSize = viewport.width >= 1200 ? 80 : viewport.width >= 768 ? 56 : 42;
    expect(metrics.fontSize).toBeLessThanOrEqual(maxFontSize);
    expect(metrics.titleHeight).toBeLessThanOrEqual(viewport.width <= 767 ? 190 : 210);
    expect(metrics.titleBottom).toBeLessThanOrEqual(metrics.descriptionTop + 1);
    expect(metrics.descriptionTop - metrics.titleBottom).toBeGreaterThanOrEqual(8);
    expect(metrics.descriptionTop - metrics.titleBottom).toBeLessThanOrEqual(24);
    if (viewport.width >= 768) {
      expect(Math.abs(metrics.mediaTop - metrics.copyTop)).toBeLessThanOrEqual(2);
      expect(metrics.heroHeight).toBeLessThan(430);
    } else {
      expect(metrics.mediaTop).toBeGreaterThanOrEqual(metrics.copyBottom - 1);
    }
    expect(metrics.visualDisplay).toBe("inline");
    expect(metrics.visualPadding).toBe("0px");
    expect(metrics.visualBackground).toBe("rgba(0, 0, 0, 0)");
    expect(metrics.visualBackdropFilter).toBe("none");
    expect(metrics.visualBorderWidth).toBe("0px");
    expect(metrics.visualBorderStyle).toBe("none");
    expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
    await hero.screenshot({ path: testInfo.outputPath(`category-title-v1-${viewport.width}.png`) });
  }
});

test("V2 separa la foto cuadrada del nombre, contador y flecha de categoría", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1760, height: 810 },
    { width: 1024, height: 768 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);

    const item = page.locator(".catalog-category-bento-item").first();
    const media = item.locator(".catalog-category-bento-media");
    const copy = item.locator(".catalog-category-bento-copy");
    const label = copy.locator(".catalog-category-bento-label");
    const title = label.locator(".catalog-category-bento-title");
    const count = copy.locator(".catalog-category-bento-count");
    const arrow = copy.locator(".catalog-category-bento-arrow");
    await expect(media).toBeVisible();
    await expect(copy).toBeVisible();
    await expect(count).toContainText(/\d+ productos?/);
    await expect(arrow).toBeVisible();
    await title.evaluate((element) => {
      element.textContent = "Gastronomía y Descartables";
    });

    const metrics = await copy.evaluate((element) => {
      const itemElement = element.closest<HTMLElement>(".catalog-category-bento-item");
      const mediaElement = itemElement?.querySelector<HTMLElement>(".catalog-category-bento-media");
      const titleElement = element.querySelector<HTMLElement>(".catalog-category-bento-title");
      if (!itemElement || !mediaElement || !titleElement) return null;
      const copyRect = element.getBoundingClientRect();
      const mediaRect = mediaElement.getBoundingClientRect();
      const itemRect = itemElement.getBoundingClientRect();
      const titleRect = titleElement.getBoundingClientRect();
      return {
        mediaRatio: mediaRect.width / mediaRect.height,
        mediaBottom: mediaRect.bottom,
        copyTop: copyRect.top,
        copyRight: copyRect.right,
        itemRight: itemRect.right,
        titleContained: titleRect.bottom <= copyRect.bottom + 1,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.mediaRatio).toBeCloseTo(1, 2);
    expect(metrics?.copyTop).toBeGreaterThanOrEqual((metrics?.mediaBottom ?? 0) - 1);
    expect(metrics?.copyRight).toBeLessThanOrEqual((metrics?.itemRight ?? 0) + 1);
    expect(metrics?.titleContained).toBe(true);
    expect(metrics?.documentWidth).toBeLessThanOrEqual(viewport.width);

    await item.screenshot({ path: testInfo.outputPath(`category-card-${viewport.width}.png`) });
  }
});

test("V1 y V2 alinean las fotos de producto dentro de su media", async ({ page }, testInfo) => {
  const viewports = [
    { width: 1760, height: 810 },
    { width: 1024, height: 768 },
    { width: 320, height: 844 },
  ];
  const measureImage = async () => {
    const image = page.locator(".catalog-product-card-image").first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).complete))
      .toBe(true);
    return image.evaluate((element) => {
      const media = element.closest<HTMLElement>(".catalog-product-media");
      const wrapper = element.parentElement;
      if (!media || !wrapper) return null;
      const mediaRect = media.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const imageRect = element.getBoundingClientRect();
      const mediaStyle = getComputedStyle(media);
      return {
        mediaWidth: mediaRect.width,
        mediaHeight: mediaRect.height,
        wrapperWidth: wrapperRect.width,
        wrapperHeight: wrapperRect.height,
        imageWidth: imageRect.width,
        imageHeight: imageRect.height,
        mediaBorderWidth:
          Number.parseFloat(mediaStyle.borderLeftWidth) +
          Number.parseFloat(mediaStyle.borderRightWidth),
        mediaBorderHeight:
          Number.parseFloat(mediaStyle.borderTopWidth) +
          Number.parseFloat(mediaStyle.borderBottomWidth),
        wrapperDisplay: getComputedStyle(wrapper).display,
        objectFit: getComputedStyle(element).objectFit,
        objectPosition: getComputedStyle(element).objectPosition,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
  };
  const useNonSquareImage = async () => {
    const image = page.locator(".catalog-product-card-image").first();
    await image.evaluate((element) => {
      element.parentElement?.querySelectorAll("source").forEach((source) => {
        source.remove();
      });
      element.removeAttribute("width");
      element.removeAttribute("height");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#fff"/><rect x="210" y="130" width="780" height="540" rx="44" fill="#e87917"/></svg>`;
      element.setAttribute("src", `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  };

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    await useNonSquareImage();
    const metrics = await measureImage();
    expect(metrics).not.toBeNull();
    expect(metrics?.wrapperDisplay).toBe("block");
    expect(metrics?.wrapperWidth).toBeCloseTo(metrics?.mediaWidth ?? 0, 0);
    expect(metrics?.wrapperHeight).toBeCloseTo(metrics?.mediaHeight ?? 0, 0);
    expect(
      Math.abs(
        (metrics?.imageWidth ?? 0) -
          ((metrics?.mediaWidth ?? 0) - (metrics?.mediaBorderWidth ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (metrics?.imageHeight ?? 0) -
          ((metrics?.mediaHeight ?? 0) - (metrics?.mediaBorderHeight ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(metrics?.objectFit).toBe("cover");
    expect(metrics?.objectPosition).toBe("50% 50%");
    expect(metrics?.documentWidth).toBeLessThanOrEqual(viewport.width);
    await page
      .locator(".catalog-product-card")
      .first()
      .screenshot({
        path: testInfo.outputPath(`product-card-v2-${viewport.width}.png`),
      });
  }

  const v1HtmlFile = exportedV1.files.get("index.html");
  const v1CssFile = [...exportedV1.files.entries()].find(([path]) => path.endsWith(".css"))?.[1];
  if (!v1HtmlFile || !v1CssFile)
    throw new Error("La exportación V1 no generó los archivos necesarios.");
  const v1Html = (
    typeof v1HtmlFile === "string" ? v1HtmlFile : new TextDecoder().decode(v1HtmlFile)
  ).replace(
    "</head>",
    `<base href="${serverUrl}/"><style>${typeof v1CssFile === "string" ? v1CssFile : new TextDecoder().decode(v1CssFile)}</style></head>`,
  );
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.setContent(v1Html, { waitUntil: "networkidle" });
    await useNonSquareImage();
    const metrics = await measureImage();
    expect(metrics).not.toBeNull();
    expect(metrics?.wrapperDisplay).toBe("block");
    expect(metrics?.wrapperWidth).toBeCloseTo(metrics?.mediaWidth ?? 0, 0);
    expect(metrics?.wrapperHeight).toBeCloseTo(metrics?.mediaHeight ?? 0, 0);
    expect(
      Math.abs(
        (metrics?.imageWidth ?? 0) -
          ((metrics?.mediaWidth ?? 0) - (metrics?.mediaBorderWidth ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (metrics?.imageHeight ?? 0) -
          ((metrics?.mediaHeight ?? 0) - (metrics?.mediaBorderHeight ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(metrics?.objectFit).toBe("cover");
    expect(metrics?.objectPosition).toBe("50% 50%");
    expect(metrics?.documentWidth).toBeLessThanOrEqual(viewport.width);
    await page
      .locator(".catalog-product-card")
      .first()
      .screenshot({
        path: testInfo.outputPath(`product-card-v1-${viewport.width}.png`),
      });
  }
});

test("V2 conserva visibles los bordes externos de las cards en cualquier grilla", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1760, height: 810 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    await waitForStorefrontReady(page);

    const metrics = await page
      .locator(".catalog-product-grid")
      .first()
      .evaluate((element) => {
        const gridRect = element.getBoundingClientRect();
        const media = Array.from(element.querySelectorAll<HTMLElement>(".catalog-product-media"));
        return {
          gridLeft: gridRect.left,
          gridRight: gridRect.right,
          items: media.map((item) => {
            const rect = item.getBoundingClientRect();
            const style = getComputedStyle(item);
            return {
              left: rect.left,
              right: rect.right,
              borderLeft: style.borderLeftWidth,
              borderRight: style.borderRightWidth,
              boxShadow: style.boxShadow,
            };
          }),
          documentWidth: document.documentElement.scrollWidth,
        };
      });

    expect(metrics.items.length).toBeGreaterThan(0);
    expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
    for (const item of metrics.items) {
      expect(item.left).toBeGreaterThanOrEqual(metrics.gridLeft - 0.1);
      expect(item.right).toBeLessThanOrEqual(metrics.gridRight + 0.1);
      expect(item.borderLeft).not.toBe("0px");
      expect(item.borderRight).not.toBe("0px");
      expect(item.boxShadow).toBe("none");
    }
  }
});

test("V2 mantiene visible el logo entre el menú móvil y las acciones", async ({ page }) => {
  for (const scenario of [
    { width: 320, path: "/" },
    { width: 390, path: "/productos/remera-esencial-de-algodon/" },
  ]) {
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const url = new URL(scenario.path, serverUrl);
    url.searchParams.set("mobileLogo", "1");
    await page.goto(url.toString());

    const metrics = await page.evaluate(() => {
      const motionRoot = document.querySelector<HTMLElement>(
        '[data-solara-module="catalog-header"]',
      );
      const button = document.querySelector<HTMLElement>(".catalog-mobile-menu-button");
      const brand = document.querySelector<HTMLElement>(".catalog-brand");
      const logo = brand?.querySelector<HTMLImageElement>("img.solara-logo");
      const actions = document.querySelector<HTMLElement>(".catalog-header-actions");
      const header = document.querySelector<HTMLElement>(".catalog-header-inner");
      if (!motionRoot || !button || !brand || !logo || !actions || !header) return null;

      // Reproduce el frame frágil: motion listo mientras el logo aún no fue marcado como cargado.
      document.documentElement.dataset.motionReady = "true";
      motionRoot.dataset.motionPreset = "fade";
      delete logo.dataset.solaraLoaded;
      delete logo.dataset.solaraBroken;

      const buttonRect = button.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const logoStyle = getComputedStyle(logo);
      return {
        buttonRight: buttonRect.right,
        brandLeft: brandRect.left,
        brandRight: brandRect.right,
        logoWidth: logoRect.width,
        logoHeight: logoRect.height,
        logoLeft: logoRect.left,
        logoRight: logoRect.right,
        logoOpacity: logoStyle.opacity,
        logoVisibility: logoStyle.visibility,
        actionsLeft: actionsRect.left,
        headerRight: header.getBoundingClientRect().right,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.brandLeft).toBeGreaterThanOrEqual((metrics?.buttonRight ?? 0) - 0.5);
    expect(metrics?.logoWidth ?? 0).toBeGreaterThan(0);
    expect(metrics?.logoHeight ?? 0).toBeGreaterThan(0);
    expect(metrics?.logoOpacity).toBe("1");
    expect(metrics?.logoVisibility).toBe("visible");
    expect(metrics?.logoLeft).toBeGreaterThanOrEqual((metrics?.brandLeft ?? 0) - 0.5);
    expect(metrics?.logoRight).toBeLessThanOrEqual((metrics?.brandRight ?? 0) + 0.5);
    expect(metrics?.actionsLeft).toBeGreaterThanOrEqual((metrics?.brandRight ?? 0) - 0.5);
    expect(metrics?.headerRight).toBeLessThanOrEqual(scenario.width);
    expect(metrics?.documentWidth).toBeLessThanOrEqual(scenario.width);
  }
});

test("V2 no deja el mega menú cerrado fuera del layout", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(serverUrl);

  const metrics = await page.locator(".catalog-nav-menu").evaluate((menu) => {
    const mega = menu.querySelector<HTMLElement>(".catalog-mega-menu");
    return {
      open: menu.hasAttribute("open"),
      display: mega ? getComputedStyle(mega).display : "missing",
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  expect(metrics.open).toBe(false);
  expect(metrics.display).toBe("none");
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.clientWidth);
});

test("V2 muestra el acceso a todos los productos sin divisor estático", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(serverUrl);

  const menu = page.locator(".catalog-nav-menu");
  await menu.locator(":scope > summary").click();
  const allProducts = menu.locator(".catalog-mega-menu__all");
  await expect(allProducts).toBeVisible();

  const styles = await allProducts.evaluate((element) => {
    const style = getComputedStyle(element);
    const hoverUnderline = getComputedStyle(element, "::after");
    return {
      textDecorationLine: style.textDecorationLine,
      borderTopStyle: style.borderTopStyle,
      hoverUnderlineDisplay: hoverUnderline.display,
      hoverUnderlineHeight: hoverUnderline.height,
    };
  });

  expect(styles.textDecorationLine).toBe("none");
  expect(styles.borderTopStyle).toBe("none");
  expect(styles.hoverUnderlineDisplay).toBe("block");
  expect(styles.hoverUnderlineHeight).toBe("1px");
});

test("V2 usa el ancho completo en colecciones y mantiene cards cuadradas", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(new URL("/colecciones/recien-llegados/", serverUrl).toString());

  const grid = page.locator(".catalog-product-grid").first();
  await expect(grid).toBeVisible();
  const metrics = await grid.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const card = element
      .querySelector<HTMLElement>(".catalog-product-card")
      ?.getBoundingClientRect();
    const media = element
      .querySelector<HTMLElement>(".catalog-product-media")
      ?.getBoundingClientRect();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      width: gridRect.width,
      cardWidth: card?.width ?? 0,
      mediaRatio: media ? media.width / media.height : 0,
    };
  });
  // La grilla V2 topea en 5 columnas también en colecciones (mismo auto-fit cap).
  expect(metrics.columns).toBe(5);
  expect(metrics.width).toBeGreaterThan(1700);
  expect(metrics.width).toBeLessThanOrEqual(1760);
  expect(metrics.cardWidth).toBeGreaterThan(320);
  expect(metrics.cardWidth).toBeLessThan(345);
  expect(metrics.mediaRatio).toBeCloseTo(1, 1);
});

test("V2 ajusta las imágenes, muestra 8 recomendaciones y mantiene una galería PDP usable", async ({
  page,
}) => {
  const productUrl = new URL(
    "/productos/remera-esencial-de-algodon/?responsiveGallery",
    serverUrl,
  ).toString();
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(productUrl);

  const detail = page.locator('[data-solara-module="catalog-product-detail"]');
  const detailMetrics = await detail.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      width: rect.width,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(detailMetrics.left).toBeGreaterThanOrEqual(79);
  expect(detailMetrics.right).toBeGreaterThanOrEqual(79);
  expect(detailMetrics.scrollWidth).toBeLessThanOrEqual(1920);

  const figures = page.locator(".catalog-product-gallery-main figure");
  const thumbs = page.locator(".catalog-product-gallery-thumbs button");
  await expect(figures).toHaveCount(3);
  await expect(thumbs).toHaveCount(3);
  const expectGalleryPictureAlignment = async () => {
    const pictureAlignment = await page.locator(".catalog-product-gallery").evaluate((gallery) => {
      const measure = (frame: HTMLElement | null) => {
        const picture = frame
          ? (Array.from(frame.children).find((child) => child.tagName === "PICTURE") as
              | HTMLElement
              | undefined)
          : undefined;
        if (!frame || !picture) return null;
        const pictureRect = picture.getBoundingClientRect();
        return {
          widthDelta: Math.abs(frame.clientWidth - pictureRect.width),
          heightDelta: Math.abs(frame.clientHeight - pictureRect.height),
        };
      };
      return {
        main: measure(
          gallery.querySelector<HTMLElement>(
            ".catalog-product-gallery-main figure[data-gallery-active=true]",
          ),
        ),
        thumb: measure(
          gallery.querySelector<HTMLElement>(".catalog-product-gallery-thumbs button"),
        ),
      };
    });
    expect(pictureAlignment.main?.widthDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(1);
    expect(pictureAlignment.main?.heightDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(1);
    expect(pictureAlignment.thumb?.widthDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(1);
    expect(pictureAlignment.thumb?.heightDelta ?? Number.POSITIVE_INFINITY).toBeLessThan(1);
  };
  await expectGalleryPictureAlignment();
  expect(
    await figures.evaluateAll(
      (elements) =>
        elements.filter((element) => getComputedStyle(element).display !== "none").length,
    ),
  ).toBe(1);
  await expect(figures.first().locator("img")).toHaveCSS("object-fit", "cover");
  await expect(thumbs.first().locator("img")).toHaveCSS("object-fit", "cover");
  await expect(figures.first().locator("img")).toHaveAttribute(
    "sizes",
    "(max-width: 767px) 92vw, (max-width: 1199px) 94vw, 60vw",
  );
  await thumbs.nth(1).click();
  await expect(figures.nth(1)).toHaveAttribute("data-gallery-active", "true");
  await expect(thumbs.nth(1)).toHaveAttribute("aria-current", "true");
  const relatedImages = page.locator(".solara-related-products .catalog-product-card-image");
  await expect(relatedImages).toHaveCount(8);
  await expect(relatedImages.first()).toHaveCSS("object-fit", "cover");
  const relatedGrid = page.locator(".solara-related-products .catalog-product-grid");
  const relatedGridMetrics = await relatedGrid.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const cardRect = element
      .querySelector<HTMLElement>(".catalog-product-card")
      ?.getBoundingClientRect();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      gridWidth: gridRect.width,
      cardWidth: cardRect?.width ?? 0,
    };
  });
  // El auto-fit puede resolver 4 o 5 tracks según el ancho efectivo y el gap;
  // ambas variantes mantienen la grilla editorial usable.
  expect(relatedGridMetrics.columns).toBeGreaterThanOrEqual(4);
  expect(relatedGridMetrics.gridWidth).toBeGreaterThan(1600);
  expect(relatedGridMetrics.gridWidth).toBeLessThanOrEqual(1760);
  expect(relatedGridMetrics.cardWidth).toBeGreaterThan(300);
  expect(relatedGridMetrics.cardWidth).toBeLessThan(450);
  await expect
    .poll(() =>
      relatedImages.evaluateAll(
        (images) => images.filter((image) => image.complete && image.naturalWidth > 0).length,
      ),
    )
    .toBe(8);

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(productUrl);
    await expectGalleryPictureAlignment();
    const intermediateMetrics = await page
      .locator(".catalog-product-detail-inner")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const info = element
          .querySelector<HTMLElement>(".catalog-product-info")
          ?.getBoundingClientRect();
        const button = element
          .querySelector<HTMLElement>(".catalog-product-add")
          ?.getBoundingClientRect();
        return {
          columns: style.gridTemplateColumns.split(" ").length,
          infoWidth: info?.width ?? 0,
          buttonBottom: button?.bottom ?? 0,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          sectionBottom: rect.bottom,
        };
      });
    expect(intermediateMetrics.columns).toBe(2);
    expect(intermediateMetrics.infoWidth).toBeGreaterThan(0);
    expect(intermediateMetrics.buttonBottom).toBeLessThanOrEqual(intermediateMetrics.sectionBottom);
    expect(intermediateMetrics.documentWidth).toBeLessThanOrEqual(
      intermediateMetrics.viewportWidth,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(productUrl);
  await expectGalleryPictureAlignment();
  const mobileDetail = page.locator('[data-solara-module="catalog-product-detail"]');
  const mobileMetrics = await mobileDetail.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const inner = element.querySelector<HTMLElement>(".catalog-product-detail-inner");
    return {
      left: rect.left,
      right: window.innerWidth - rect.right,
      layout: inner ? getComputedStyle(inner).display : "",
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mobileMetrics.left).toBeGreaterThanOrEqual(11);
  expect(mobileMetrics.right).toBeGreaterThanOrEqual(11);
  expect(mobileMetrics.layout).toBe("flex");
  expect(mobileMetrics.scrollWidth).toBeLessThanOrEqual(390);
  await expect(mobileDetail.locator(".catalog-product-gallery-thumbs button")).toHaveCount(3);
  await expect(page.locator(".solara-related-products .catalog-product-card-image")).toHaveCount(8);
});

test("V2 mantiene feedback equivalente para hover y teclado en cards y bento", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);

  const productCard = page.locator(".catalog-product-card").first();
  const productLink = productCard.locator(".catalog-product-media");
  const initialProductTransform = await productCard.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await productLink.focus();
  await expect
    .poll(() => productCard.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialProductTransform);
  const hoverFeedback = await productCard.evaluate((element) => ({
    card: getComputedStyle(element).boxShadow,
    media: getComputedStyle(
      element.querySelector<HTMLElement>(".catalog-product-media") ?? element,
    ),
  }));
  expect(hoverFeedback.card).toBe("none");
  expect(hoverFeedback.media.boxShadow).toBe("none");
  expect(hoverFeedback.media.borderLeftWidth).not.toBe("0px");
  expect(hoverFeedback.media.borderRightWidth).not.toBe("0px");

  const bentoItem = page.locator(".catalog-category-bento-item").first();
  const bentoImage = bentoItem.locator("img");
  await bentoItem.scrollIntoViewIfNeeded();
  const initialBentoTransform = await bentoItem.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await bentoItem.focus();
  await expect
    .poll(() => bentoItem.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(initialBentoTransform);
  await expect
    .poll(() => bentoImage.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe("none");

  const viewAll = page.locator(".catalog-view-all").first();
  await viewAll.focus();
  await expect(viewAll).toBeFocused();
  await expect(viewAll).toHaveCSS("text-decoration-line", "none");
});

test("V2 hero: la foto no hace zoom al hover y el CTA conserva cortina sin mover texto ni icono", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);
  await page.locator('[data-solara-module="catalog-hero"]').waitFor({ state: "visible" });

  const hero = page.locator('[data-solara-module="catalog-hero"]');
  const media = hero.locator("[data-hero-media]");
  const image = hero.locator(".catalog-hero-image");
  const backgroundImage = hero.locator(".catalog-hero-background-image");
  await expect(backgroundImage).toHaveCount(0);
  await expect.poll(() => media.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  const mediaTransform = await image.evaluate((element) => getComputedStyle(element).transform);
  await hero.locator(".catalog-hero-copy").hover();
  await page.evaluate(
    () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())),
  );
  await expect
    .poll(() =>
      image.evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === "running"),
      ),
    )
    .toBe(false);
  expect(await image.evaluate((element) => getComputedStyle(element).transform)).toBe(
    mediaTransform,
  );
  expect(await media.evaluate((element) => getComputedStyle(element).transform)).toBe("none");

  const action = hero.locator(".catalog-hero-actions .catalog-primary-action");
  const label = hero.locator(".catalog-hero-cta-label");
  const icon = hero.locator(".catalog-hero-cta-icon");
  const actionTransform = await action.evaluate((element) => getComputedStyle(element).transform);
  const labelTransform = await label.evaluate((element) => getComputedStyle(element).transform);
  const iconTransform = await icon.evaluate((element) => getComputedStyle(element).transform);
  const curtainRest = await action.evaluate(
    (element) => getComputedStyle(element, "::before").transform,
  );
  await action.hover();
  await expect
    .poll(() => action.evaluate((element) => getComputedStyle(element, "::before").transform))
    .not.toBe(curtainRest);
  await expect
    .poll(() =>
      action.evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === "running"),
      ),
    )
    .toBe(false);
  expect(await action.evaluate((element) => getComputedStyle(element).transform)).toBe(
    actionTransform,
  );
  expect(await label.evaluate((element) => getComputedStyle(element).transform)).toBe(
    labelTransform,
  );
  expect(await icon.evaluate((element) => getComputedStyle(element).transform)).toBe(iconTransform);
});

test("V2 mantiene CTA, dos columnas y reduced motion en 390x844", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(serverUrl);

  const primaryAction = page.locator(".catalog-hero-actions .catalog-primary-action");
  await expect(primaryAction).toBeVisible();
  expect((await primaryAction.boundingBox())?.y).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(
    await page
      .locator(".catalog-product-grid")
      .first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
  ).toBe(2);
  const mobileBento = page.locator(".catalog-category-bento-grid");
  const mobileBentoMetrics = await mobileBento.evaluate((element) => {
    const gridRect = element.getBoundingClientRect();
    const items = [...element.querySelectorAll<HTMLElement>(".catalog-category-bento-item")];
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      count: items.length,
      gridLeft: gridRect.left,
      gridWidth: gridRect.width,
      maxRight: Math.max(...items.map((item) => item.getBoundingClientRect().right)),
      wideColumns: getComputedStyle(
        items.find((item) => item.classList.contains("catalog-category-bento-item--wide")) ??
          items[0],
      ).gridColumn,
      tallRows: getComputedStyle(
        items.find((item) => item.classList.contains("catalog-category-bento-item--tall")) ??
          items[0],
      ).gridRow,
    };
  });
  expect(mobileBentoMetrics.columns).toBe(2);
  expect(mobileBentoMetrics.count).toBe(8);
  expect(mobileBentoMetrics.maxRight).toBeLessThanOrEqual(
    mobileBentoMetrics.gridLeft + mobileBentoMetrics.gridWidth + 1,
  );
  expect(mobileBentoMetrics.wideColumns).toBe("span 1");
  expect(mobileBentoMetrics.tallRows).toBe("span 1");
  const mobileHeroEditorial = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>(".catalog-hero-editorial .catalog-hero-inner");
    const media = document.querySelector<HTMLElement>(".catalog-hero-editorial [data-hero-media]");
    const band = document.querySelector<HTMLElement>(".catalog-hero-benefits--band");
    const copy = document.querySelector<HTMLElement>(".catalog-hero-editorial .catalog-hero-copy");
    if (!hero || !media || !band || !copy) return null;
    const heroRect = hero.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    const bandRect = band.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    return {
      mediaFillsHero:
        Math.abs(mediaRect.left - heroRect.left) < 1 &&
        Math.abs(mediaRect.right - heroRect.right) < 1 &&
        mediaRect.top <= heroRect.top,
      bandBelowMedia: bandRect.top >= mediaRect.bottom - 1,
      copyInsideHero: copyRect.top >= heroRect.top && copyRect.bottom <= heroRect.bottom + 1,
      bandVisible: getComputedStyle(band).display !== "none",
      backgroundPresent: Boolean(document.querySelector("[data-hero-background]")),
    };
  });
  expect(mobileHeroEditorial).toEqual({
    mediaFillsHero: true,
    bandBelowMedia: true,
    copyInsideHero: true,
    bandVisible: true,
    backgroundPresent: false,
  });
  expect(
    await page.locator(".catalog-hero-copy h1").evaluate((element) => {
      const words: { word: string; rects: number }[] = [];
      for (const inner of element.querySelectorAll<HTMLElement>("[data-hero-line-inner]")) {
        const node = inner.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        const lineWords = text.match(/\S+/g) ?? [];
        let offset = 0;
        for (const word of lineWords) {
          const start = text.indexOf(word, offset);
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + word.length);
          offset = start + word.length;
          words.push({ word, rects: range.getClientRects().length });
        }
      }
      return words;
    }),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ word: "representa.", rects: 1 })]));

  await revealWholePage(page);
  await expect(page.locator(".catalog-product-card").last()).toHaveCSS("opacity", "1");
  await expect
    .poll(() =>
      page
        .locator(".catalog-product-grid")
        .first()
        .locator(".catalog-product-card-image")
        .evaluateAll(
          (images) =>
            images.filter(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ).length,
        ),
    )
    .toBe(12);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator('[data-design-family="catalog-modern-v2"]')).toBeVisible();
  expect(
    await page
      .locator('[data-solara-module="catalog-hero"]')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  // Con reduced motion el hero queda visible al instante, sin coreografía:
  // líneas sin transform, regla sin escala, beneficios opacos y media sin
  // máscara de entrada.
  const reducedHero = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>("[data-hero-line-inner]");
    const rule = document.querySelector<HTMLElement>(".catalog-hero-rule");
    const media = document.querySelector<HTMLElement>("[data-hero-media]");
    const benefits = [
      ...document.querySelectorAll<HTMLElement>(".catalog-hero-benefits--copy [data-hero-benefit]"),
    ];
    return {
      lineTransform: line ? getComputedStyle(line).transform : "",
      lineAnimation: line ? getComputedStyle(line).animationName : "",
      ruleTransform: rule ? getComputedStyle(rule).transform : "",
      benefitOpacities: benefits.map((benefit) => getComputedStyle(benefit).opacity),
      mediaClip: media ? getComputedStyle(media).clipPath : "",
      mediaAnimation: media ? getComputedStyle(media).animationName : "",
    };
  });
  expect(reducedHero.lineTransform).toBe("none");
  expect(reducedHero.lineAnimation).toBe("none");
  expect(reducedHero.ruleTransform).toBe("none");
  expect(reducedHero.benefitOpacities).toEqual(["1", "1", "1"]);
  expect(reducedHero.mediaClip).toBe("none");
  expect(reducedHero.mediaAnimation).toBe("none");
  expect(
    await page
      .locator(".catalog-product-card-image")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");

  await page.screenshot({ path: testInfo.outputPath("home-390x844.png"), fullPage: true });
});

test("V2 hero carousel avanza con autoplay y se detiene con reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${serverUrl}/?autoplayHero=1`);
  const slides = page.locator("[data-catalog-hero-slide-panel]");
  await expect(slides.nth(0)).toBeVisible();
  await expect(slides.nth(1)).toBeHidden();
  await page.waitForTimeout(3200);
  await expect(slides.nth(0)).toBeHidden();
  await expect(slides.nth(1)).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(slides.nth(0)).toBeVisible();
  await expect(slides.nth(1)).toBeHidden();
  await page.waitForTimeout(3200);
  await expect(slides.nth(0)).toBeVisible();
  await expect(slides.nth(1)).toBeHidden();
});

test("V2 mantiene un ritmo responsive en la banda de beneficios", async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 320, height: 844 },
    { width: 390, height: 844 },
    { width: 768, height: 823 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);

    const band = page.locator(".catalog-hero-benefits--band");
    await expect(band).toBeVisible();
    const metrics = await band.evaluate((element) => {
      const style = getComputedStyle(element);
      const items = [...element.querySelectorAll<HTMLElement>("[data-hero-benefit]")];
      const rects = items.map((item) => item.getBoundingClientRect());
      return {
        display: style.display,
        columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
        rowGap: Number.parseFloat(style.rowGap),
        marginTop: Number.parseFloat(style.marginTop),
        marginBottom: Number.parseFloat(style.marginBottom),
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
        left: element.getBoundingClientRect().left,
        right: Math.max(...rects.map((rect) => rect.right)),
        borderLeftWidths: items.map((item) => getComputedStyle(item).borderLeftWidth),
        itemBorderTopWidths: items.map((item) => getComputedStyle(item).borderTopWidth),
        itemGridColumns: items[0] ? getComputedStyle(items[0]).gridTemplateColumns : "",
        iconWidth: items[0]
          ? getComputedStyle(
              items[0].querySelector<HTMLElement>(".catalog-hero-benefit-icon") as HTMLElement,
            ).width
          : "",
        iconBorderRadius: items[0]
          ? getComputedStyle(
              items[0].querySelector<HTMLElement>(".catalog-hero-benefit-icon") as HTMLElement,
            ).borderRadius
          : "",
        iconRadiusVariable: style.getPropertyValue("--catalog-hero-benefit-icon-radius").trim(),
        hasButton: Boolean(element.querySelector("button")),
      };
    });

    expect(metrics.display).toBe("grid");
    expect(metrics.columns).toBe(viewport.width < 768 ? 1 : 3);
    expect(metrics.rowGap).toBeGreaterThanOrEqual(10);
    expect(metrics.marginTop).toBeLessThanOrEqual(16);
    expect(metrics.marginBottom).toBeLessThanOrEqual(28);
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(viewport.width);
    if (viewport.width < 768) {
      expect(metrics.borderLeftWidths).toEqual(["0px", "0px", "0px"]);
      expect(metrics.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(metrics.borderTopWidth).toBe("0px");
      expect(metrics.borderBottomWidth).toBe("0px");
      expect(metrics.itemBorderTopWidths).toEqual(["0px", "0px", "0px"]);
      expect(metrics.itemGridColumns.startsWith("36px ")).toBe(true);
      expect(metrics.iconWidth).toBe("36px");
      expect(metrics.iconBorderRadius).toBe("8px");
      expect(metrics.iconRadiusVariable).toBe("8px");
      expect(metrics.hasButton).toBe(false);
    }

    await band.screenshot({ path: testInfo.outputPath(`hero-benefits-${viewport.width}.png`) });
  }
});

test("V2 Home muestra Contacto como módulos responsive y replica el CTA del hero", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(serverUrl);

  const contact = page.locator(".solara-home-contact");
  const form = contact.locator('[data-solara-module="contact-form"]');
  const channels = contact.locator('[data-solara-module="contact-channels"]');
  await expect(contact).toHaveCount(1);
  await expect(form).toContainText("Escribinos");
  await expect(channels).toContainText("Nuestros canales");
  await expect(form.locator("[data-solara-contact-form]")).toBeVisible();

  const desktopMetrics = await contact.evaluate((element) => {
    const formRoot = element.querySelector<HTMLElement>('[data-solara-module="contact-form"]');
    const channelsRoot = element.querySelector<HTMLElement>(
      '[data-solara-module="contact-channels"]',
    );
    const heroButton = document.querySelector<HTMLElement>(
      '[data-solara-module="catalog-hero"] .catalog-primary-action',
    );
    const contactButton = formRoot?.querySelector<HTMLElement>(
      ".contact-form-actions .catalog-primary-action",
    );
    const emailButton = formRoot?.querySelector<HTMLElement>(
      '.contact-form-actions [data-contact-channel="email"]',
    );
    const whatsappButton = formRoot?.querySelector<HTMLElement>(
      '.contact-form-actions [data-contact-channel="whatsapp"]',
    );
    if (
      !formRoot ||
      !channelsRoot ||
      !heroButton ||
      !contactButton ||
      !emailButton ||
      !whatsappButton
    )
      return null;
    const formRect = formRoot.getBoundingClientRect();
    const channelsRect = channelsRoot.getBoundingClientRect();
    const heroStyle = getComputedStyle(heroButton);
    const contactStyle = getComputedStyle(contactButton);
    const emailStyle = getComputedStyle(emailButton);
    const whatsappStyle = getComputedStyle(whatsappButton);
    const themeProbe = document.createElement("span");
    themeProbe.style.backgroundColor = "var(--catalog-ink)";
    themeProbe.style.color = "var(--catalog-paper)";
    element.append(themeProbe);
    const themeProbeStyle = getComputedStyle(themeProbe);
    const themeInk = themeProbeStyle.backgroundColor;
    const themePaper = themeProbeStyle.color;
    themeProbe.remove();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      sameRow: Math.abs(formRect.top - channelsRect.top) < 1,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      sameButtonBackground: heroStyle.backgroundColor === emailStyle.backgroundColor,
      whatsappUsesThemeInk:
        whatsappStyle.backgroundColor === themeInk && whatsappStyle.color === themePaper,
      whatsappHasAlternateBackground:
        whatsappStyle.backgroundColor !== emailStyle.backgroundColor &&
        whatsappStyle.backgroundColor !== contactStyle.backgroundColor,
      sameButtonRadius: heroStyle.borderRadius === contactStyle.borderRadius,
      sameButtonHeight: heroStyle.minHeight === contactStyle.minHeight,
    };
  });
  expect(desktopMetrics).toEqual({
    columns: 2,
    sameRow: true,
    noOverflow: true,
    sameButtonBackground: true,
    whatsappUsesThemeInk: true,
    whatsappHasAlternateBackground: true,
    sameButtonRadius: true,
    sameButtonHeight: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileMetrics = await contact.evaluate((element) => {
    const formButtons = [
      ...element.querySelectorAll<HTMLElement>(
        '[data-solara-module="contact-form"] .contact-form-actions .catalog-primary-action',
      ),
    ];
    const channelsRoot = element.querySelector<HTMLElement>(
      '[data-solara-module="contact-channels"]',
    );
    const formRoot = element.querySelector<HTMLElement>('[data-solara-module="contact-form"]');
    if (formButtons.length !== 2 || !channelsRoot || !formRoot) return null;
    const formWidth = formRoot.getBoundingClientRect().width;
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
      formWidth,
      channelsWidth: channelsRoot.getBoundingClientRect().width,
      buttonWidths: formButtons.map((button) => button.getBoundingClientRect().width),
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(mobileMetrics?.columns).toBe(1);
  expect(mobileMetrics?.formWidth).toBe(mobileMetrics?.channelsWidth);
  expect(mobileMetrics?.buttonWidths).toEqual([mobileMetrics?.formWidth, mobileMetrics?.formWidth]);
  expect(mobileMetrics?.noOverflow).toBe(true);
});

test("V2 Formulario mobile elimina el espacio de estado cuando no hay email", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${serverUrl}?noEmail`);

  const form = page.locator('[data-solara-module="contact-form"]');
  await expect(form).toBeVisible();
  const metrics = await form.evaluate((root) => {
    const actions = root.querySelector<HTMLElement>(".contact-form-actions");
    const emailButton = root.querySelector('[data-contact-channel="email"]');
    const whatsappButton = root.querySelector<HTMLElement>('[data-contact-channel="whatsapp"]');
    const status = root.querySelector<HTMLElement>(".contact-form-status");
    if (!actions || !whatsappButton || !status) return null;
    const actionsStyle = getComputedStyle(actions);
    const statusStyle = getComputedStyle(status);
    return {
      emailCount: emailButton ? 1 : 0,
      buttonCount: actions.querySelectorAll(".catalog-primary-action").length,
      display: actionsStyle.display,
      flexDirection: actionsStyle.flexDirection,
      actionHeight: actions.getBoundingClientRect().height,
      buttonHeight: whatsappButton.getBoundingClientRect().height,
      statusDisplay: statusStyle.display,
      statusHeight: status.getBoundingClientRect().height,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics?.emailCount).toBe(0);
  expect(metrics?.buttonCount).toBe(1);
  expect(metrics?.display).toBe("flex");
  expect(metrics?.flexDirection).toBe("column");
  expect(metrics?.actionHeight).toBe(metrics?.buttonHeight);
  expect(metrics?.statusDisplay).toBe("none");
  expect(metrics?.statusHeight).toBe(0);
  expect(metrics?.noOverflow).toBe(true);

  await form.screenshot({ path: testInfo.outputPath("contact-no-email-mobile.png") });
});

test("V2 Canales de contacto no usa separadores y respira en mobile", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 823 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);

    const channels = page.locator('[data-solara-module="contact-channels"]');
    await expect(channels).toHaveCount(1);
    const metrics = await channels.evaluate((root) => {
      const section = root.querySelector<HTMLElement>(".contact-channels");
      const list = root.querySelector<HTMLElement>(".contact-channel-list");
      const rows = [...root.querySelectorAll<HTMLElement>(".contact-channel-row")];
      if (!section || !list) return null;
      const sectionStyle = getComputedStyle(section);
      return {
        rowCount: rows.length,
        rowBorders: rows.flatMap((row) => {
          const style = getComputedStyle(row);
          return [style.borderTopWidth, style.borderBottomWidth];
        }),
        sectionBorderTop: sectionStyle.borderTopWidth,
        sectionBorderBottom: sectionStyle.borderBottomWidth,
        listBorders: [
          getComputedStyle(list).borderTopWidth,
          getComputedStyle(list).borderBottomWidth,
        ],
        rowGap: Number.parseFloat(getComputedStyle(list).rowGap) || 0,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(metrics).not.toBeNull();
    expect(metrics?.rowCount).toBe(5);
    expect(metrics?.rowBorders).toEqual([
      "0px",
      "0px",
      "0px",
      "0px",
      "0px",
      "0px",
      "0px",
      "0px",
      "0px",
      "0px",
    ]);
    expect(metrics?.sectionBorderTop).toBe("0px");
    expect(metrics?.rowGap).toBeGreaterThanOrEqual(viewport.width < 768 ? 10 : 0);
    expect(metrics?.noOverflow).toBe(true);

    await channels.screenshot({
      path: testInfo.outputPath(`contact-channels-${viewport.width}.png`),
    });
  }
});

test("V2 audita composición en viewports intermedios", async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 768, height: 823 },
    { width: 820, height: 900 },
    { width: 899, height: 900 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>(".catalog-hero-inner");
      const grid = document.querySelector<HTMLElement>(".catalog-product-grid");
      const card = grid?.querySelector<HTMLElement>(".catalog-product-card");
      const action = document.querySelector<HTMLElement>(".catalog-hero-actions");
      const nav = document.querySelector<HTMLElement>(".catalog-desktop-nav");
      const media = document.querySelector<HTMLElement>(".catalog-hero-media");
      const benefitsBand = document.querySelector<HTMLElement>(".catalog-hero-benefits--band");
      const titleLine = document.querySelector<HTMLElement>(".catalog-hero-line-inner");
      const body = document.querySelector<HTMLElement>(".catalog-hero-body");
      const copy = document.querySelector<HTMLElement>(".catalog-hero-copy");
      return {
        documentWidth: document.documentElement.scrollWidth,
        heroWidth: hero?.getBoundingClientRect().width ?? 0,
        heroActionsBottom: action?.getBoundingClientRect().bottom ?? 0,
        productColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
        productCardWidth: card?.getBoundingClientRect().width ?? 0,
        navHeight: nav?.getBoundingClientRect().height ?? 0,
        heroDisplay: hero ? getComputedStyle(hero).display : "",
        heroFlexDirection: hero ? getComputedStyle(hero).flexDirection : "",
        mediaPosition: media ? getComputedStyle(media).position : "",
        benefitsBandDisplay: benefitsBand ? getComputedStyle(benefitsBand).display : "",
        titleTextShadow: titleLine ? getComputedStyle(titleLine).textShadow : "",
        bodyTextShadow: body ? getComputedStyle(body).textShadow : "",
        copyColor: copy ? getComputedStyle(copy).color : "",
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(metrics.heroWidth).toBeLessThanOrEqual(viewport.width);
    expect(metrics.heroActionsBottom).toBeLessThanOrEqual(viewport.height);
    // Desktop queda en 5 columnas (tope editorial); Mobile y Tablet conservan
    // tres columnas para que el modo no cambie dentro de Tablet.
    expect(metrics.productColumns).toBe(viewport.width >= 1200 ? 5 : 3);
    expect(metrics.productCardWidth).toBeGreaterThan(155);
    expect(metrics.navHeight).toBeLessThanOrEqual(44);
    // Las sombras del hero se retiraron por decisión de diseño documentada en
    // CHANGELOG (Hero V2 sin fondo ancho ni sombras, 2026-08-25); el contrato
    // pasa a exigir que NO haya text-shadow.
    expect(metrics.titleTextShadow).toBe("none");
    expect(metrics.bodyTextShadow).toBe("none");
    if (viewport.width < 1200) {
      expect(metrics.heroDisplay).toBe("grid");
      expect(metrics.mediaPosition).toBe("relative");
      expect(metrics.benefitsBandDisplay).toBe("grid");
      // La portada vertical ocupa un carril propio para no convertirse en un
      // recorte cuadrado; el copy conserva la tinta del tema fuera de la foto.
      expect(metrics.copyColor).not.toBe("rgb(247, 245, 240)");
    }
    await expect
      .poll(
        () =>
          page
            .locator(".catalog-hero-title")
            .evaluate((element) => getComputedStyle(element).opacity),
        { timeout: 5_000 },
      )
      .toBe("1");
    await page.screenshot({
      path: testInfo.outputPath(`home-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });
  }
});

test("V2 suaviza los breakpoints críticos del hero y las grillas", async ({ page }) => {
  const heroHeights: Record<number, number> = {};
  for (const viewport of [
    { width: 767, height: 1024 },
    { width: 768, height: 1024 },
    { width: 899, height: 900 },
    { width: 900, height: 900 },
    { width: 1023, height: 900 },
    { width: 1024, height: 900 },
    { width: 1199, height: 900 },
    { width: 1200, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(new URL("/?longTitle", serverUrl).toString());
    await waitForStorefrontReady(page);

    const heroMetrics = await page.locator(".catalog-hero-inner").evaluate((element) => {
      const action = element.querySelector<HTMLElement>(".catalog-primary-action");
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        actionBottom: action?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(heroMetrics.height).toBeLessThanOrEqual(viewport.height);
    expect(heroMetrics.actionBottom).toBeLessThanOrEqual(viewport.height);
    expect(heroMetrics.documentWidth).toBeLessThanOrEqual(viewport.width);
    heroHeights[viewport.width] = heroMetrics.height;

    if (viewport.width >= 768 && viewport.width < 1200) {
      await expect(page.locator(".catalog-hero-benefits--band")).toBeVisible();
      await expect(page.locator(".catalog-hero-benefits--copy")).toBeHidden();
    } else if (viewport.width >= 1200) {
      await expect(page.locator(".catalog-hero-benefits--band")).toBeHidden();
      await expect(page.locator(".catalog-hero-benefits--copy")).toBeVisible();
    }
  }

  expect(Math.abs(heroHeights[767] - heroHeights[768])).toBeLessThanOrEqual(140);
  expect(Math.abs(heroHeights[899] - heroHeights[900])).toBeLessThanOrEqual(24);
  expect(Math.abs(heroHeights[1023] - heroHeights[1024])).toBeLessThanOrEqual(2);
  expect(Math.abs(heroHeights[1199] - heroHeights[1200])).toBeLessThanOrEqual(90);

  for (const [width, expectedColumns] of [
    [1200, 4],
    [1199, 3],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(serverUrl);
    expect(
      await page
        .locator(".catalog-category-bento-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    ).toBe(expectedColumns);
  }

  for (const [width, expectedColumns] of [
    [361, 2],
    [360, 2],
    [320, 2],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(serverUrl);
    const gridMetrics = await page
      .locator(".catalog-product-grid")
      .first()
      .evaluate((element) => {
        const firstCard = element.querySelector<HTMLElement>(".catalog-product-card");
        return {
          columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
          cardWidth: firstCard?.getBoundingClientRect().width ?? 0,
          documentWidth: document.documentElement.scrollWidth,
        };
      });
    expect(gridMetrics.columns).toBe(expectedColumns);
    expect(gridMetrics.cardWidth).toBeGreaterThan(145);
    expect(gridMetrics.documentWidth).toBeLessThanOrEqual(width);
  }

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(serverUrl);
  const categoryLabelMetrics = await page
    .locator(".catalog-category-bento-title")
    .first()
    .evaluate((element) => {
      element.textContent = "Gastronomía y Descartables";
      const label = element.parentElement;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()];
      const textBottom = Math.max(...rects.map((rect) => rect.bottom));
      const labelBottom = label?.getBoundingClientRect().bottom ?? 0;
      return {
        readable: Boolean(label && textBottom <= labelBottom + 1),
        lines: rects.length,
      };
    });
  expect(categoryLabelMetrics).toEqual(
    expect.objectContaining({ readable: true, lines: expect.any(Number) }),
  );
});

test("V2 mantiene la compra en flujo en una PDP móvil con título largo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    new URL("/productos/remera-esencial-de-algodon/?longProduct", serverUrl).toString(),
  );
  await waitForStorefrontReady(page);

  const metrics = await page.locator(".catalog-product-detail-inner").evaluate((element) => {
    const gallery = element.querySelector<HTMLElement>(".catalog-product-gallery-main");
    const action = element.querySelector<HTMLElement>(".catalog-product-add");
    const form = element.querySelector<HTMLElement>(".catalog-add-form");
    const actionRect = action?.getBoundingClientRect();
    return {
      galleryHeight: gallery?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
      actionPosition: action ? getComputedStyle(action).position : "none",
      actionTop: actionRect?.top ?? Number.POSITIVE_INFINITY,
      formBottom: form?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      actionWidth: actionRect?.width ?? 0,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(metrics.galleryHeight).toBeLessThanOrEqual(metrics.documentWidth);
  expect(metrics.actionPosition).toBe("static");
  expect(metrics.actionTop).toBeLessThan(metrics.formBottom);
  expect(metrics.actionWidth).toBeGreaterThanOrEqual(300);
  expect(metrics.documentWidth).toBeLessThanOrEqual(390);
});
