import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";

const exported = exportProject(catalogModernV2Store, { mode: "production" });
export const exportedV1 = exportProject(catalogModernStore, { mode: "production" });
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
if (!mobileLogoHeader)
  throw new Error("La fixture V2 no tiene header para la prueba del logo móvil.");
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

export async function revealWholePage(page: import("@playwright/test").Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 640) {
    await page.evaluate(
      (top) =>
        new Promise<void>((resolveFrames) => {
          window.scrollTo({ top, behavior: "instant" });
          requestAnimationFrame(() => requestAnimationFrame(() => resolveFrames()));
        }),
      y,
    );
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

export async function readActionSurface(locator: import("@playwright/test").Locator) {
  return locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      background: styles.backgroundColor,
      border: styles.borderTopColor,
      color: styles.color,
      transform: styles.transform,
      shadow: styles.boxShadow,
    };
  });
}

export async function hoverAndReadSettledSurface(locator: import("@playwright/test").Locator) {
  const rest = await readActionSurface(locator);
  await locator.hover();
  await expect.poll(() => readActionSurface(locator)).not.toEqual(rest);
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === "running"),
      ),
    )
    .toBe(false);
  return readActionSurface(locator);
}

export async function startCatalogModernV2Server(): Promise<{
  serverUrl: string;
  stop: () => Promise<void>;
}> {
  const server: Server = createServer((request, response) => {
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
  const serverUrl = `http://127.0.0.1:${address.port}`;
  return {
    serverUrl,
    stop: () =>
      new Promise<void>((resolveClosing, reject) => {
        server.close((error) => (error ? reject(error) : resolveClosing()));
      }),
  };
}
