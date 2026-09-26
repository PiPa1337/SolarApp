import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { waitForStorefrontReady } from "./storefront-helpers";

test.setTimeout(120_000);

const exported = {
  v1: exportProject(catalogModernStore, { mode: "production" }),
  v2: exportProject(catalogModernV2Store, { mode: "production" }),
};

const boundaryViewports = [
  { name: "mobile-max", width: 767, height: 844, mode: "mobile" },
  { name: "tablet-min", width: 768, height: 900, mode: "tablet" },
  { name: "tablet-max", width: 1199, height: 900, mode: "tablet" },
  { name: "desktop-min", width: 1200, height: 900, mode: "desktop" },
] as const;

const visualViewports = [
  { name: "mobile-checkpoint", width: 390, height: 844, mode: "mobile" },
  { name: "tablet-checkpoint", width: 1024, height: 900, mode: "tablet" },
  { name: "desktop-checkpoint", width: 1440, height: 900, mode: "desktop" },
] as const;

let server: Server;
let serverUrl: string;

function routePath(pathname: string): string {
  const clean = pathname.replace(/^\/+/, "");
  return clean === "" ? "index.html" : clean.endsWith("/") ? `${clean}index.html` : clean;
}

function contentType(path: string): string {
  const extension = path.split(".").pop();
  if (extension === "html") return "text/html; charset=utf-8";
  if (extension === "css") return "text/css; charset=utf-8";
  if (extension === "js") return "text/javascript; charset=utf-8";
  if (extension === "webp") return "image/webp";
  if (extension === "png") return "image/png";
  return "application/octet-stream";
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const referer = request.headers.referer ? new URL(request.headers.referer) : null;
    const family =
      url.searchParams.get("family") === "v1" || referer?.searchParams.get("family") === "v1"
        ? "v1"
        : "v2";
    const path = routePath(url.pathname);
    const content = exported[family].files.get(path);
    if (content === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType(path),
    });
    response.end(content);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor responsive sin puerto TCP.");
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

async function open(page: import("@playwright/test").Page, family: "v1" | "v2", path = "/") {
  await page.goto(`${serverUrl}${path}${path.includes("?") ? "&" : "?"}family=${family}`);
  await waitForStorefrontReady(page);
}

async function metrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const mode = width <= 767 ? "mobile" : width <= 1199 ? "tablet" : "desktop";
    const grid = document.querySelector<HTMLElement>(".catalog-product-grid");
    const hero = document.querySelector<HTMLElement>(".catalog-hero-inner");
    const heroMedia = document.querySelector<HTMLElement>(".catalog-hero-media");
    const heroImage = document.querySelector<HTMLElement>(".catalog-hero-image");
    const heroCopy = document.querySelector<HTMLElement>(".catalog-hero-copy");
    const heroTitle = document.querySelector<HTMLElement>(".catalog-hero-title");
    const heroModule = document.querySelector<HTMLElement>('[data-solara-module="catalog-hero"]');
    const describe = (element: HTMLElement | null) =>
      element
        ? {
            rect: Math.round(element.getBoundingClientRect().width),
            scrollWidth: element.scrollWidth,
            display: getComputedStyle(element).display,
            minWidth: getComputedStyle(element).minWidth,
            width: getComputedStyle(element).width,
            opacity: getComputedStyle(element).opacity,
            color: getComputedStyle(element).color,
          }
        : null;
    return {
      mode,
      width,
      documentWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      hero: describe(hero),
      heroMedia: describe(heroMedia),
      heroImage: describe(heroImage),
      heroCopy: describe(heroCopy),
      heroTitle: heroTitle?.textContent?.trim() ?? "",
      heroModuleAttributes: heroModule
        ? Array.from(heroModule.attributes).map(({ name, value }) => `${name}=${value}`)
        : [],
      motionReady: document.documentElement.dataset.motionReady ?? "",
      overflowers: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: element.className,
            id: element.id,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((element) => element.left < -1 || element.right > width + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 8),
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
      heroHeight: hero?.getBoundingClientRect().height ?? 0,
      mobileMenu: Boolean(
        document.querySelector<HTMLElement>(".catalog-mobile-menu-button") &&
          getComputedStyle(document.querySelector<HTMLElement>(".catalog-mobile-menu-button")!).display !== "none",
      ),
    };
  });
}

test("captura evidencia en los límites exactos y checkpoints responsive", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const visionDirectory = testInfo.outputPath("responsive-breakpoints-vision");
  mkdirSync(visionDirectory, { recursive: true });
  const evidence = [];
  const viewports = [...boundaryViewports, ...visualViewports];

  for (const family of ["v1", "v2"] as const) {
    const familyDirectory = `${visionDirectory}/${family}`;
    mkdirSync(familyDirectory, { recursive: true });
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await open(page, family);
      const current = await metrics(page);
      expect(current.documentWidth, `${family} ${viewport.name}: no overflow horizontal`).toBeLessThanOrEqual(
        current.clientWidth + 1,
      );
      expect(current.mode, `${family} ${viewport.name}: modo responsive`).toBe(viewport.mode);
      evidence.push({ family, viewport, metrics: current });

      await page.screenshot({
        fullPage: false,
        path: `${familyDirectory}/home-${viewport.name}-${viewport.width}x${viewport.height}.png`,
      });
    }
  }

  writeFileSync(
    testInfo.outputPath("responsive-breakpoints-vision.json"),
    `${JSON.stringify({ contract: { mobileMax: 767, tabletMax: 1199, desktopMin: 1200 }, evidence }, null, 2)}\n`,
    "utf8",
  );
});

test("mantiene overflow y composición en V1/V2 para las rutas críticas", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const category = catalogModernV2Store.categories.find((item) => !item.parentId);
  const product = catalogModernV2Store.products.find((item) => item.status === "active");
  if (!category || !product) throw new Error("Fixture sin categoría o producto activo.");
  const routes = [
    "/",
    `/categorias/${category.slug}/`,
    `/productos/${product.slug}/`,
    "/carrito/",
  ];

  for (const family of ["v1", "v2"] as const) {
    const viewport = visualViewports[0];
    if (!viewport) throw new Error("Falta el checkpoint móvil responsive.");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of routes) {
      await open(page, family, path);
      const current = await metrics(page);
      expect(
        current.documentWidth,
        `${family} ${path} ${viewport.width}: no overflow horizontal ${JSON.stringify(current)}`,
      ).toBeLessThanOrEqual(current.clientWidth + 1);
      expect(current.mode, `${family} ${path} ${viewport.width}: modo responsive`).toBe(viewport.mode);
    }
  }
});
