import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { waitForStorefrontReady } from "./storefront-helpers";

const exported = exportProject(catalogModernV2Store, { mode: "production" });
const exportedV1 = exportProject(catalogModernStore, { mode: "production" });
const noEmailProject = structuredClone(catalogModernV2Store);
const noEmailContact = noEmailProject.sections.find(
  (section) => section.moduleId === "contact-form",
);
if (!noEmailContact) throw new Error("La fixture V2 no tiene formulario para la prueba sin email.");
noEmailContact.settings = { ...noEmailContact.settings, showEmailButton: false };
const exportedNoEmail = exportProject(noEmailProject, { mode: "production" });
const mobileLogoProject = structuredClone(catalogModernV2Store);
mobileLogoProject.identity.logoAssetId = "asset-hero";
const mobileLogoHeader = mobileLogoProject.sections.find(
  (section) => section.moduleId === "catalog-header",
);
if (!mobileLogoHeader) throw new Error("La fixture V2 no tiene header para la prueba del logo móvil.");
mobileLogoHeader.motion = { ...mobileLogoHeader.motion, preset: "fade" };
const exportedMobileLogo = exportProject(mobileLogoProject, { mode: "production" });
const longTitleProject = structuredClone(catalogModernV2Store);
const longTitleHero = longTitleProject.sections.find(
  (section) => section.moduleId === "catalog-hero",
);
if (!longTitleHero) throw new Error("La fixture V2 no tiene hero para la prueba de wrapping.");
longTitleHero.settings = {
  ...longTitleHero.settings,
  title: "Descartables y packaging para tu negocio",
};
const exportedLongTitle = exportProject(longTitleProject, { mode: "production" });
const autoHeightProject = structuredClone(catalogModernV2Store);
const autoHeightHero = autoHeightProject.sections.find(
  (section) => section.moduleId === "catalog-hero",
);
if (!autoHeightHero)
  throw new Error("La fixture V2 no tiene hero para la prueba de altura automática.");
autoHeightHero.settings = {
  ...autoHeightHero.settings,
  title: "Descartables y packaging para tu negocio",
  body: "Bandejas, bolsas, potes, cajas y más para tu negocio. Trabajamos exclusivamente en Chubut, con atención personalizada y entregas rápidas en Trelew, Rawson, Dolavon, Gaiman y zonas cercanas. Esta descripción extensa verifica que el contenido completo del hero conserve su espacio y no dependa de una altura rígida del viewport.",
};
const exportedAutoHeight = exportProject(autoHeightProject, { mode: "production" });
const longProductProject = structuredClone(catalogModernV2Store);
const longProduct = longProductProject.products.find(
  (product) => product.slug === "remera-esencial-de-algodon",
);
if (!longProduct) throw new Error("La fixture V2 no tiene producto para la prueba de PDP.");
longProduct.title = "Bandeja 101 PP Gualco x 50 unidades con tapa transparente";
const exportedLongProduct = exportProject(longProductProject, { mode: "production" });
const longCategoryProject = structuredClone(catalogModernV2Store);
const longCategory = longCategoryProject.categories.find((category) => !category.parentId);
if (!longCategory)
  throw new Error("La fixture V2 no tiene categoría madre para la prueba de wrapping.");
longCategory.title = "Gastronomía y Descartables";
const exportedLongCategory = exportProject(longCategoryProject, { mode: "production" });
const longCategoryV1Project = structuredClone(catalogModernStore);
const longCategoryV1 = longCategoryV1Project.categories.find((category) => !category.parentId);
if (!longCategoryV1)
  throw new Error("La fixture V1 no tiene categoría madre para la prueba de wrapping.");
longCategoryV1.title = "Gastronomía y Descartables";
const exportedLongCategoryV1 = exportProject(longCategoryV1Project, { mode: "production" });
const responsiveGalleryProject = structuredClone(catalogModernV2Store);
const responsiveGalleryProduct = responsiveGalleryProject.products.find(
  (product) => product.slug === "remera-esencial-de-algodon",
);
if (!responsiveGalleryProduct)
  throw new Error("La fixture V2 no tiene producto para la prueba de picture en galería.");
responsiveGalleryProduct.imageIds = ["asset-hero", "asset-jarra", "asset-modo-camisa"];
responsiveGalleryProduct.variants = responsiveGalleryProduct.variants.map((variant) => ({
  ...variant,
  imageId: "asset-hero",
}));
const exportedResponsiveGallery = exportProject(responsiveGalleryProject, { mode: "production" });
const autoplayHeroProject = structuredClone(catalogModernV2Store);
const autoplayHero = autoplayHeroProject.sections.find(
  (section) => section.moduleId === "catalog-hero",
);
if (!autoplayHero) throw new Error("La fixture V2 no tiene hero para la prueba de autoplay.");
autoplayHero.settings = {
  ...autoplayHero.settings,
  mode: "carousel",
  autoplay: true,
  intervalMs: 3000,
  slides: [
    {
      id: "autoplay-slide-1",
      title: "Primera diapositiva",
      body: "Contenido inicial",
      actionLabel: "Ver primera",
      actionHref: "/buscar/",
      imageId: "asset-hero",
    },
    {
      id: "autoplay-slide-2",
      title: "Segunda diapositiva",
      body: "Contenido siguiente",
      actionLabel: "Ver segunda",
      actionHref: "/buscar/",
      imageId: "asset-jarra",
    },
  ],
};
const exportedAutoplayHero = exportProject(autoplayHeroProject, { mode: "production" });
const fixtureBrand = catalogModernV2Store.identity.brandName;
// Desde 9a22a95 los assets del fixture viajan embebidos como data URLs;
// solo los 12 productos quedan como archivos webp servibles en /fixtures/.
const fixtureFiles = new Map<string, Uint8Array>(
  Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return [
      `fixtures/modo-sur-product-${number}.webp`,
      readFileSync(resolve(`apps/studio/public/fixtures/modo-sur-product-${number}.webp`)),
    ] as const;
  }),
);

let server: Server;
let serverUrl: string;

async function revealWholePage(page: import("@playwright/test").Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 640) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(45);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

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
    const source = url.searchParams.has("noEmail")
      ? exportedNoEmail
      : url.searchParams.has("mobileLogo")
        ? exportedMobileLogo
        : url.searchParams.has("autoplayHero")
          ? exportedAutoplayHero
          : url.searchParams.has("responsiveGallery")
            ? exportedResponsiveGallery
            : url.searchParams.has("longCategory")
              ? exportedLongCategory
              : url.searchParams.has("longCategoryV1")
                ? exportedLongCategoryV1
                : url.searchParams.has("longProduct")
                  ? exportedLongProduct
                  : url.searchParams.has("longTitle")
                    ? exportedLongTitle
                    : url.searchParams.has("autoHeight")
                      ? exportedAutoHeight
                      : exported;
    const content =
      source.files.get(path) ??
      (path.startsWith("assets/")
        ? (exportedLongCategoryV1.files.get(path) ??
          exportedV1.files.get(path) ??
          exportedLongCategory.files.get(path) ??
          exportedLongProduct.files.get(path) ??
          exportedLongTitle.files.get(path) ??
          exportedResponsiveGallery.files.get(path) ??
          exportedAutoplayHero.files.get(path) ??
          exportedMobileLogo.files.get(path) ??
          exportedNoEmail.files.get(path) ??
          exported.files.get(path))
        : undefined) ??
      fixtureFiles.get(path);
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
            : extension === "png"
              ? "image/png"
              : extension === "webp"
                ? "image/webp"
                : "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(content);
  });

  await new Promise<void>((resolveListening) => {
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("El servidor V2 no tiene una dirección TCP.");
  }
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosing, reject) => {
    server.close((error) => (error ? reject(error) : resolveClosing()));
  });
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
  await page.waitForTimeout(1_600);

  const hero = page.locator('[data-solara-module="catalog-hero"]');
  const media = hero.locator("[data-hero-media]");
  const image = hero.locator(".catalog-hero-image");
  const backgroundImage = hero.locator(".catalog-hero-background-image");
  await expect(backgroundImage).toHaveCount(0);
  await expect.poll(() => media.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  const mediaTransform = await image.evaluate((element) => getComputedStyle(element).transform);
  await hero.locator(".catalog-hero-copy").hover();
  await page.waitForTimeout(600);
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
  await page.waitForTimeout(500);
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
    expect(metrics.productColumns).toBe(
      viewport.width >= 1200 ? 5 : 3,
    );
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

test("V2 muestra las 12 reseñas en una grilla sin scroll lateral y rotula el footer", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/", serverUrl).toString());

  const section = page.locator(".catalog-testimonials-section");
  const track = section.locator(".catalog-testimonials-track");
  await expect(section.locator(".catalog-testimonial")).toHaveCount(12);
  await expect(section.getByRole("group", { name: "Controles de testimonios" })).toHaveCount(0);
  await expect(track).toHaveAttribute("role", "region");
  expect(
    await track.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        columns: style.gridTemplateColumns.split(" ").length,
        overflowX: style.overflowX,
      };
    }),
  ).toEqual(expect.objectContaining({ columns: 1, overflowX: "visible" }));
  expect(await track.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await track.evaluate((element) => element.clientWidth),
  );

  await expect(
    page.locator(
      `.catalog-footer-inner nav[aria-label="${catalogModernV2Store.publicCopy.footer.explore}"] strong`,
    ),
  ).toHaveText(catalogModernV2Store.publicCopy.footer.explore);
  await expect(page.locator('.catalog-footer-inner nav[aria-label="Ayuda"] strong')).toHaveText(
    "Ayuda",
  );
  await expect(page.locator(".catalog-footer-inner address strong")).toHaveText("Contacto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.waitForTimeout(150);
  await revealWholePage(page);
  await page.screenshot({ path: testInfo.outputPath("home-390x844.png"), fullPage: true });

  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(new URL("/", serverUrl).toString());
  await expect(page.locator(".catalog-testimonials-section .catalog-testimonial")).toHaveCount(12);
  const desktopTrack = page.locator(".catalog-testimonials-track");
  expect(
    await desktopTrack.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        columns: style.gridTemplateColumns.split(" ").length,
        overflowX: style.overflowX,
      };
    }),
  ).toEqual(expect.objectContaining({ columns: 4, overflowX: "visible" }));
  expect(await desktopTrack.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await desktopTrack.evaluate((element) => element.clientWidth),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
  await page.waitForTimeout(150);
  await revealWholePage(page);
  await page.screenshot({ path: testInfo.outputPath("home-1920x968.png"), fullPage: true });
});

test("V2 conserva varias líneas del carrito al navegar entre páginas", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const firstProduct = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  await page.goto(firstProduct);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");

  await page.goto(new URL("/productos/remera-grafica-horizonte/", serverUrl).toString());
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("2");

  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(2);
  await expect(page.locator("[data-cart-count]").first()).toHaveText("2");
  await expect(page.locator("[data-cart-drawer] .solara-cart-line")).toHaveCount(2);
});

test("V2 mantiene el resumen sticky debajo del header y sin líneas de borde", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const cartLines = catalogModernV2Store.products
    .filter((product) => product.status === "active")
    .slice(0, 8)
    .map((product) => {
      const variant = product.variants.find((candidate) => candidate.available);
      if (!variant) throw new Error(`El producto ${product.id} no tiene una variante disponible.`);
      return {
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        unitPrice: variant.price,
        quantity: 1,
        available: true,
      };
    });
  await page.goto(new URL("/", serverUrl).toString());
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `solara-cart:${catalogModernV2Store.id}`,
    value: cartLines,
  });
  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(cartLines.length);

  await page.evaluate(() => window.scrollTo({ top: 520, behavior: "instant" }));
  await page.waitForTimeout(100);
  const stickyMetrics = await page.locator(".solara-cart-page-grid > aside").evaluate((element) => {
    const header = document.querySelector<HTMLElement>('[data-solara-module="catalog-header"]');
    const total = element.querySelector<HTMLElement>("p:nth-of-type(3)");
    const summaryRect = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      top: summaryRect.top,
      headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      borderTop: getComputedStyle(element).borderTopWidth,
      borderLeft: getComputedStyle(element).borderLeftWidth,
      totalBorderTop: total ? getComputedStyle(total).borderTopWidth : "missing",
    };
  });
  expect(stickyMetrics.position).toBe("sticky");
  expect(stickyMetrics.top).toBeGreaterThanOrEqual(stickyMetrics.headerBottom - 1);
  expect(stickyMetrics.borderTop).toBe("0px");
  expect(stickyMetrics.borderLeft).toBe("0px");
  expect(stickyMetrics.totalBorderTop).toBe("0px");
});

test("V2 acumula la misma variante sin reemplazarla al volver desde otra página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const productUrl = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  await page.goto(productUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");

  await page.goto(new URL("/", serverUrl).toString());
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.goto(productUrl);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("2");

  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(1);
  await expect(page.locator(".solara-cart-page [data-cart-quantity]").first()).toHaveValue("2");
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

test("V2 compacta el drawer cuando el carrito está vacío y no deja scroll en desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL("/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const drawer = page.locator(".catalog-cart-drawer");
  await page.locator("[data-solara-cart-open]").first().click();
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expect(drawer).toHaveAttribute("data-cart-empty", "true");
  await expect(drawer.getByRole("button", { name: "Seguir comprando" })).toHaveCount(0);
  await expect(drawer.locator(".catalog-cart-summary")).toBeHidden();
  await expect(drawer.locator(".catalog-checkout-form")).toBeHidden();
  await expect(drawer.locator(".catalog-drawer-footer")).toBeHidden();

  const scrollState = await drawer.evaluate((element) => {
    const scroll = element.querySelector<HTMLElement>(".catalog-cart-scroll");
    if (!scroll) throw new Error("No se encontró el área del carrito");
    return {
      drawerOverflowY: getComputedStyle(element).overflowY,
      scrollOverflowY: getComputedStyle(scroll).overflowY,
      drawerHeight: element.getBoundingClientRect().height,
      drawerScrollable: element.scrollHeight - element.clientHeight,
      scrollScrollable: scroll.scrollHeight - scroll.clientHeight,
    };
  });
  expect(scrollState.drawerOverflowY).toBe("hidden");
  expect(scrollState.scrollOverflowY).toBe("hidden");
  expect(scrollState.drawerHeight).toBeLessThan(900);
  expect(scrollState.drawerScrollable).toBeLessThanOrEqual(1);
  expect(scrollState.scrollScrollable).toBeLessThanOrEqual(1);
});

test("V2 conserva el carrito cuando la navegación ocurre inmediatamente después de agregar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const firstProduct = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  await page.goto(firstProduct);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-catalog-modern-v2"));
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();

  await page.goto(new URL("/productos/remera-grafica-horizonte/", serverUrl).toString());
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();

  await page.goto(new URL("/carrito/", serverUrl).toString());
  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(2);
});

test("V2 recupera el carrito antes de agregar desde una página restaurada", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const firstProduct = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  const secondProduct = new URL("/productos/remera-grafica-horizonte/", serverUrl).toString();

  await page.goto(firstProduct);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-catalog-modern-v2"));
  await page.reload();
  await page.goto(secondProduct);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Remera esencial de algodón");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();

  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Remera gráfica Horizonte");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto(new URL("/carrito/", serverUrl).toString());

  await expect(
    page.locator(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
  ).toHaveCount(2);
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

test("V2 conserva el carrito al navegar con enlaces del storefront", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const firstProduct = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  await page.goto(firstProduct);
  await page.evaluate(() => localStorage.removeItem("solara-cart:store-catalog-modern-v2"));
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await expect(page.getByRole("button", { name: "Cerrar carrito" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar carrito" }).click();

  await page.locator('a[href="/"]').first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");

  await page.locator('a[href="/productos/remera-grafica-horizonte/"]').first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Remera gráfica Horizonte");
  await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator("[data-cart-count]").first()).toHaveText("2");
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

test("V2 compone el checkout del drawer sin overflow en desktop y movil", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  const productUrl = new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString();
  await page.goto(productUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.locator(".catalog-cart-drawer [data-cart-checkout-next]").click();
  const form = page.locator(".catalog-cart-drawer [data-checkout-form]");
  await expect(form).toBeVisible();
  await form.locator("#catalog-drawer-name").fill("Ana Prueba");
  await form.locator("#catalog-drawer-phone").fill("5491112345678");
  await form.locator("#catalog-drawer-address").fill("Calle de prueba 123");
  await form.locator("#catalog-drawer-locality").fill("Trelew, Chubut");
  await form.locator("#catalog-drawer-postal-code").fill("9100");
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window);
    window.open = ((url, target, features) => {
      document.documentElement.dataset.solaraWhatsappUrl = String(url ?? "");
      return originalOpen(url, target, features);
    }) as typeof window.open;
  });
  const whatsappPopupPromise = page.waitForEvent("popup");
  await page.locator(".catalog-cart-drawer .catalog-drawer-footer button[type='submit']").click();
  const whatsappPopup = await whatsappPopupPromise;
  await expect(form.locator("[data-order-preview]")).toContainText("Remera esencial");
  await expect(form.locator("[data-order-preview]")).toContainText(
    "Localidad / Provincia: Trelew, Chubut",
  );
  await expect(form.locator("[data-order-preview]")).toContainText("Código postal: 9100");
  await expect(form.locator("[data-whatsapp-link]")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-solara-whatsapp-url",
    /^https:\/\/wa\.me\//,
  );
  await whatsappPopup.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(productUrl);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.locator(".catalog-cart-drawer")).toHaveAttribute("data-open", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const mobileDrawer = page.locator(".catalog-cart-drawer");
  await mobileDrawer.locator("[data-cart-checkout-next]").click();
  // F-01: el submit del segundo paso vive en un footer fijo y debe quedar
  // visible; si el formulario excede, scrollea sólo su panel intermedio.
  const submit = mobileDrawer.locator(".catalog-drawer-footer button[type='submit']");
  await expect(submit).toBeInViewport();
  await expect(submit).toHaveText(/Continuar por WhatsApp/);
  const drawerScroll = await mobileDrawer.evaluate((element) => ({
    drawerScrollable: element.scrollHeight - element.clientHeight,
    scrollAreaExists: Boolean(element.querySelector<HTMLElement>(".catalog-cart-scroll")),
  }));
  expect(drawerScroll.scrollAreaExists).toBe(true);
  expect(drawerScroll.drawerScrollable).toBeLessThanOrEqual(1);
});

test("V2 mantiene equilibrados el resumen y las líneas del carrito en desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 968 });
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await page.goto(new URL("/carrito/", serverUrl).toString());

  const metrics = await page.locator(".solara-cart-page-grid").evaluate((element) => {
    const style = getComputedStyle(element);
    const summary = element.querySelector<HTMLElement>(":scope > aside")?.getBoundingClientRect();
    return {
      columnGap: Number.parseFloat(style.columnGap),
      summaryWidth: summary?.width ?? 0,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(metrics.columnGap).toBeLessThanOrEqual(80);
  expect(metrics.summaryWidth).toBeLessThanOrEqual(384);
  expect(metrics.documentWidth).toBeLessThanOrEqual(1920);
});

test("V2 conserva el carrito dentro del viewport intermedio", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await page.goto(new URL("/carrito/", serverUrl).toString());

  const cartMetrics = await page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    };
    return {
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      grid: rectOf(".solara-cart-page-grid"),
      line: rectOf(".solara-cart-page-grid [data-cart-lines] .solara-cart-line"),
      summary: rectOf(".solara-cart-page-grid > aside"),
      button: rectOf(
        ".solara-cart-page-grid > aside [data-cart-cta]:not([hidden]) .solara-primary-action",
      ),
    };
  });
  expect(cartMetrics.documentWidth).toBeLessThanOrEqual(1024);
  expect(cartMetrics.bodyWidth).toBeLessThanOrEqual(1024);
  expect(cartMetrics.grid?.right ?? 0).toBeLessThanOrEqual(1024);
  expect(cartMetrics.line?.width ?? 0).toBeGreaterThan(0);
  expect(cartMetrics.summary?.width ?? 0).toBeGreaterThanOrEqual(300);
  expect(cartMetrics.button?.height ?? 0).toBeGreaterThanOrEqual(44);
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
    window.scrollTo({ top: Math.max(1, document.documentElement.scrollHeight / 2), behavior: "instant" }),
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

test("V2 conserva contenido y el fallback del producto sin JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL("/productos/remera-esencial-de-algodon/", serverUrl).toString());
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Remera esencial de algodón");
  await expect(page.locator("a.catalog-add-fallback")).toBeVisible();
  await expect(page.locator(".catalog-product-add")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto(serverUrl);
  await expect(page.locator("#catalog-mobile-menu")).toBeVisible();
  await expect(page.locator(".catalog-product-card").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
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

test("V2 no publica las rutas independientes retiradas", async ({ page }) => {
  for (const route of ["/compra/", "/envios/", "/devoluciones/"]) {
    const response = await page.goto(new URL(route, serverUrl).toString());
    expect(response?.status(), route).toBe(404);
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
  await page.waitForTimeout(1200);
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
  await page.waitForTimeout(1600);
  const card = page.locator(".catalog-product-card").first();
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

test("V2 footer: copyright con año y nombre + Hecho con ❤️ en solara.com.ar", async ({ page }) => {
  await page.goto(serverUrl);
  const footer = page.locator('[data-solara-module="catalog-footer"]');
  await expect(footer).toBeVisible();
  const small = footer.locator("small");
  await expect(small).toContainText("Todos los derechos reservados");
  await expect(small).toContainText(String(new Date().getFullYear()));
  await expect(small).toContainText(fixtureBrand);
  const made = footer.locator(".catalog-footer-made a");
  await expect(made).toHaveText("Hecho con ❤️ en solara.com.ar");
  await expect(made).toHaveAttribute("href", "https://solara.com.ar");
  const consumerRights = footer.locator(".solara-consumer-rights");
  await expect(consumerRights).toHaveCount(1);
  await expect(consumerRights.locator("a")).toHaveAttribute(
    "href",
    "https://www.argentina.gob.ar/defensa-del-consumidor",
  );
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

test("V2 footer: Explorar conserva sus rutas, agrega carrito y lista todas las categorías públicas", async ({
  page,
}, testInfo) => {
  const publicCategories = catalogModernV2Store.categories.filter(
    (category) => category.status !== "hidden",
  );

  for (const viewport of [
    { width: 1920, height: 968, label: "desktop" },
    { width: 1024, height: 768, label: "tablet" },
    { width: 390, height: 844, label: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(serverUrl);
    const footer = page.locator('[data-solara-module="catalog-footer"]');
    const explore = footer.locator(".catalog-footer-nav--explore");
    const categories = footer.locator(".catalog-footer-nav--categories");

    await expect(explore.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(
      explore.getByRole("link", { name: "Buscar productos", exact: true }),
    ).toHaveAttribute("href", "/buscar/");
    const cartLink = explore.locator("a[data-open-cart]");
    await expect(cartLink).toHaveText("Carrito");
    await expect(cartLink).toHaveAttribute("href", "/carrito/");
    await expect(cartLink).toHaveAttribute("data-open-cart", "");
    await expect(categories.locator('a[href^="/categorias/"]')).toHaveCount(
      publicCategories.length,
    );
    for (const category of publicCategories) {
      await expect(
        categories.getByRole("link", { name: category.title, exact: true }),
      ).toHaveAttribute("href", `/categorias/${category.slug}/`);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      viewport.label,
    ).toBeLessThanOrEqual(viewport.width);

    await revealWholePage(page);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.screenshot({
      path: testInfo.outputPath(
        `footer-${viewport.label}-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });

    await footer.scrollIntoViewIfNeeded();
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

  const surface = async (locator: typeof searchButton) =>
    locator.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        background: styles.backgroundColor,
        border: styles.borderTopColor,
        color: styles.color,
        transform: styles.transform,
        shadow: styles.boxShadow,
      };
    });

  const searchRest = await surface(searchButton);
  const footerRest = await surface(footerButton);
  expect(searchRest).toMatchObject({
    background: footerRest.background,
    border: footerRest.border,
    color: footerRest.color,
  });

  await searchButton.hover();
  await page.waitForTimeout(240);
  const searchHover = await surface(searchButton);
  await footerButton.hover();
  await page.waitForTimeout(240);
  const footerHover = await surface(footerButton);
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

  const surface = async (locator: typeof cartButton) =>
    locator.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        background: styles.backgroundColor,
        border: styles.borderTopColor,
        color: styles.color,
        transform: styles.transform,
        shadow: styles.boxShadow,
      };
    });

  expect(await surface(cartButton)).toEqual(await surface(footerButton));
  await cartButton.hover();
  await page.waitForTimeout(240);
  const cartHover = await surface(cartButton);
  await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await footerButton.hover();
  await page.waitForTimeout(240);
  const footerHover = await surface(footerButton);
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
  const surface = async (locator: typeof productButton) =>
    locator.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        background: styles.backgroundColor,
        border: styles.borderTopColor,
        color: styles.color,
        transform: styles.transform,
        shadow: styles.boxShadow,
      };
    });

  await expect(productButton).toBeVisible();
  expect(await surface(productButton)).toEqual(await surface(footerButton));

  await productButton.hover();
  await page.waitForTimeout(240);
  const productHover = await surface(productButton);
  await footerButton.hover();
  await page.waitForTimeout(240);
  const footerHover = await surface(footerButton);

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
