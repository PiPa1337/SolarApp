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

test("V1 y V2 alinean las fotos de producto dentro de su media", async ({ page }, testInfo) => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
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
