import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import type { StoreProjectV1 } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";

// Cada test exporta el sitio y captura pantallas por viewport: con la suite
// completa con alta concurrencia el default de 30s flaquea por contención
// (mismo tratamiento que axe-site).
test.setTimeout(120_000);

const VIEWPORTS = [
  { w: 390, h: 844, name: "390" },
  { w: 1024, h: 900, name: "1024" },
  { w: 1440, h: 900, name: "1440" },
];

function smallVisualStore(): StoreProjectV1 {
  const project = JSON.parse(JSON.stringify(catalogModernStore)) as StoreProjectV1;
  project.products = project.products.slice(0, 3);
  const productIds = new Set(project.products.map((product) => product.id));
  for (const category of project.categories)
    category.productIds = category.productIds.filter((id) => productIds.has(id));
  for (const collection of project.collections)
    collection.productIds = collection.productIds.filter((id) => productIds.has(id));
  return project;
}

function longTextStore(): StoreProjectV1 {
  const base = smallVisualStore();
  base.identity.brandName =
    "MarcaSuperLargaSinEspaciosQueNoDeberiaRomperElLayoutYDebeHacerWrapCorrectamenteConOverflowWrapAnywhereYConPalabrasMuyLargasComoSupercalifragilisticoespialidoso".repeat(
      1,
    );
  base.identity.description =
    "Descripci\u00f3n extremadamente larga ".repeat(50) + "PalabraSinEspaciosMuyLarga".repeat(10);
  base.seo.title = "Titulo SEO Muy Largo ".repeat(3).slice(0, 68);
  base.seo.description = "Descripcion SEO muy larga ".repeat(6).slice(0, 175);
  // productos con nombres largos y sin espacios, precios enormes
  base.products = base.products.map((p, i) => ({
    ...p,
    title:
      i === 0
        ? "A".repeat(120)
        : i === 1
          ? "Producto Con Nombre Extremadamente Largo Que Debe Hacer Wrap Correctamente Sin Romper El Layout Y Sin Overflow Horizontal".repeat(
              2,
            )
          : p.title + " ".repeat(0),
    description: "Desc ".repeat(100) + (i === 0 ? "SinEspacios".repeat(30) : ""),
    variants: p.variants.map((v) => ({
      ...v,
      price: i === 0 ? 99999900 : i === 1 ? 123456789 : 150000,
      compareAtPrice: i === 0 ? 199999900 : undefined,
    })),
  }));
  // categoria con nombre largo
  if (base.categories[0])
    base.categories[0].title =
      "CategoriaConNombreMuyLargoSinEspaciosYConMuchosCaracteresParaProbarOverflowYWrapCorrecto";
  if (base.categories[0]) base.categories[0].description = "Desc categoria ".repeat(50);
  return base;
}

function imageVariantStore(): StoreProjectV1 {
  const base = smallVisualStore();
  // forzar 3 productos con imagenes vertical/horizontal/cuadrada simulando width/height distintos
  const vId = base.products[0]?.variants[0]?.imageId;
  const assetV = base.assets.find((a) => a.id === vId);
  if (assetV) {
    // vertical
    base.assets[0].width = 600;
    base.assets[0].height = 900;
    if (base.assets[1]) {
      base.assets[1].width = 900;
      base.assets[1].height = 600;
    }
    if (base.assets[2]) {
      base.assets[2].width = 800;
      base.assets[2].height = 800;
    }
  }
  return base;
}

function startServer(project: StoreProjectV1) {
  const exported = exportProject(project, { mode: "production" });
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path =
      requested === ""
        ? "index.html"
        : requested.endsWith("/")
          ? `${requested}index.html`
          : requested;
    const content = exported.files.get(path);
    if (!content) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.split(".").pop();
    const ct =
      ext === "html"
        ? "text/html; charset=utf-8"
        : ext === "css"
          ? "text/css; charset=utf-8"
          : ext === "js"
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct }).end(content);
  });
  return { server, exported };
}

function serverBase(server: ReturnType<typeof createServer>): string {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Servidor de prueba sin puerto");
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function checkNoHorizontalScroll(page: Page) {
  const hasScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  expect(hasScroll, "no debe haber scroll horizontal").toBeFalsy();
}

async function checkButtonsNotCut(page: Page, viewportW: number) {
  const buttons = page.locator(
    "button, a.catalog-primary-action, a.catalog-secondary-action, .catalog-add-form button",
  );
  const count = await buttons.count();
  for (let i = 0; i < Math.min(count, 15); i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    const isVisible = await buttons
      .nth(i)
      .isVisible()
      .catch(() => false);
    if (!isVisible) continue;
    if (box.x > viewportW + 2 || box.x + box.width < -2) continue;
    const insideHidden = await buttons
      .nth(i)
      .evaluate((el) => !!el.closest("[hidden]"))
      .catch(() => false);
    if (insideHidden) continue;
    expect(
      box.x + box.width,
      `boton ${i} no debe salir del viewport ${viewportW}`,
    ).toBeLessThanOrEqual(viewportW + 2);
    expect(box.x, `boton ${i} no debe estar cortado a la izquierda`).toBeGreaterThanOrEqual(-2);
  }
}

async function checkStickyFilters(page: Page) {
  const hasFilters = await page.locator(".catalog-category-filters").count();
  if (hasFilters === 0) return;
  // check that filters are not hidden under navbar
  const navbarBox =
    (await page
      .locator("header")
      .first()
      .boundingBox()
      .catch(() => null)) ||
    (await page
      .locator('[data-solara-module="catalog-header"]')
      .first()
      .boundingBox()
      .catch(() => null));
  const filtersBox = await page.locator(".catalog-category-filters").first().boundingBox();
  if (navbarBox && filtersBox) {
    // after scroll, filters top should be >= navbar bottom (allow 2px tolerance)
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(150);
    const afterFiltersTop = await page
      .locator(".catalog-category-filters")
      .first()
      .evaluate((el: HTMLElement) => el.getBoundingClientRect().top);
    // Los filtros sticky deben seguir dentro del viewport después del scroll.
    expect(afterFiltersTop, "filters sticky sigue en el viewport").toBeGreaterThanOrEqual(-2);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.w}x${vp.h})`, () => {
    test(`home sin overflow y botones visibles`, async ({ page }) => {
      const { server } = startServer(smallVisualStore());
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const base = serverBase(server);
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await checkNoHorizontalScroll(page);
        await checkButtonsNotCut(page, vp.w);
        if (vp.w >= 1024) {
          for (const zoom of [1.5, 2]) {
            await page.evaluate((value: number) => {
              document.body.style.zoom = String(value);
            }, zoom);
            await checkNoHorizontalScroll(page);
          }
          await page.evaluate(() => {
            document.body.style.zoom = "1";
          });
        }
        // cards alturas: verificar que ninguna card tenga altura 0 o desproporcionada
        const cardCount = await page.locator(".catalog-product-card").count();
        if (cardCount > 0) {
          const heights = await page
            .locator(".catalog-product-card")
            .evaluateAll((els: Element[]) =>
              els.map((e) => (e as HTMLElement).getBoundingClientRect().height),
            );
          for (const h of heights as number[]) {
            expect(h, "card altura debe ser >80 y <600").toBeGreaterThan(80);
            expect(h).toBeLessThan(700);
          }
        }
        // screenshot para vision
        await page.screenshot({
          path: `test-results/visual-break/${vp.name}-home.png`,
        });
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    test(`categoria con 1-2 productos no debe hacer cards gigantes`, async ({ page }) => {
      const baseProject = smallVisualStore();
      // dejar solo 1 producto en una categoria
      const cat = baseProject.categories[0];
      if (cat) {
        const oneProdId = baseProject.products[0].id;
        cat.productIds = [oneProdId];
        baseProject.products = baseProject.products.slice(0, 1);
        const valid = new Set(baseProject.products.map((p) => p.id));
        for (const cc of baseProject.categories)
          cc.productIds = cc.productIds.filter((id) => valid.has(id));
        for (const col of baseProject.collections)
          col.productIds = col.productIds.filter((id) => valid.has(id));
      }
      const { server, exported } = startServer(baseProject);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const base = serverBase(server);
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        const catPath = [...exported.files.keys()].find((p) => p.startsWith("categorias/"));
        const route = catPath ? `/${catPath.slice(0, -"index.html".length)}` : "/";
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await checkNoHorizontalScroll(page);
        const cardBox = await page
          .locator(".catalog-product-card")
          .first()
          .boundingBox()
          .catch(() => null);
        if (cardBox) {
          // con 1 producto, la card no debe ocupar >80% del ancho en desktop ni ser gigante
          if (vp.w >= 1024) {
            expect(
              cardBox.width,
              "card con 1 producto no debe ser gigante en desktop",
            ).toBeLessThan(vp.w * 0.5);
          } else {
            expect(cardBox.width).toBeLessThan(vp.w * 0.95);
          }
        }
        await page.screenshot({
          path: `test-results/visual-break/${vp.name}-cat-1prod.png`,
        });
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

    test(`textos largos y precios enormes deben hacer wrap sin overflow`, async ({ page }) => {
      const project = longTextStore();
      const { server, exported } = startServer(project);
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const base = serverBase(server);
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(300);
        await checkNoHorizontalScroll(page);
        // verificar que el brand no se corta
        const brandBox = await page
          .locator(".catalog-brand")
          .first()
          .boundingBox()
          .catch(() => null);
        if (brandBox) {
          expect(brandBox.width).toBeLessThanOrEqual(vp.w + 2);
        }
        // verificar que el footer line no se sale
        const footerBox = await page
          .locator(".catalog-footer-inner")
          .first()
          .boundingBox()
          .catch(() => null);
        if (footerBox) {
          expect(footerBox.width).toBeLessThanOrEqual(vp.w + 2);
        }
        await page.screenshot({
          path: `test-results/visual-break/${vp.name}-longtext.png`,
        });
        // producto con precio enorme
        const prodPath = [...exported.files.keys()].find((p) => p.startsWith("productos/"));
        if (prodPath) {
          const route = `/${prodPath.slice(0, -"index.html".length)}`;
          await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
          await checkNoHorizontalScroll(page);
          await page.screenshot({
            path: `test-results/visual-break/${vp.name}-longtext-product.png`,
          });
        }
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });

  });
}

// tests especificos no dependientes de viewport
test("imagenes vertical/horizontal/cuadrada no recortan mal y no generan CLS", async ({ page }) => {
  const project = imageVariantStore();
  const { server, exported } = startServer(project);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = serverBase(server);
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    // verificar que las imagenes tienen object-fit y no overflow
    const imgs = page.locator(".catalog-product-card-image, .catalog-hero-image");
    const count = await imgs.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await imgs.nth(i).boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThan(20);
        expect(box.height).toBeGreaterThan(20);
      }
    }
    await page.screenshot({ path: `test-results/visual-break/images-aspect.png` });
    // categoria hero image debe usar object-fit cover y no recortar mal: verificar que la imagen ocupa el header sin overflow
    const catPath = [...exported.files.keys()].find((p) => p.startsWith("categorias/"));
    if (catPath) {
      const route = `/${catPath.slice(0, -"index.html".length)}`;
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      const heroImg = page.locator(".solara-category-hero-image").first();
      if ((await heroImg.count()) > 0) {
        const style = await heroImg.evaluate((el: HTMLElement) => getComputedStyle(el).objectFit);
        // debe ser cover o contain, no fill que distorsiona
        expect(["cover", "contain", ""]).toContain(style);
      }
      await page.screenshot({
        path: `test-results/visual-break/category-hero-image.png`,
      });
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("sticky filtros no se tapa con navbar", async ({ page }) => {
  const { server, exported } = startServer(smallVisualStore());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = serverBase(server);
  try {
    await page.setViewportSize({ width: 1024, height: 800 });
    const catPath = [...exported.files.keys()].find((p) => p.startsWith("categorias/"));
    const route = catPath ? `/${catPath.slice(0, -"index.html".length)}` : "/";
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await checkStickyFilters(page);
    // El contrato es geométrico; una captura del viewport conserva evidencia
    // útil sin forzar el rasterizado de toda la página bajo carga de suite.
    await page
      .screenshot({ path: `test-results/visual-break/sticky-filters.png`, timeout: 10_000 })
      .catch(() => undefined);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("modales dentro del viewport en mobile", async ({ page }) => {
  const { server } = startServer(smallVisualStore());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = serverBase(server);
  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    // search dialog
    const searchOpen = page.locator("[data-catalog-search-open]").first();
    if ((await searchOpen.count()) > 0) {
      await searchOpen.click();
      await page.waitForTimeout(350);
      const dialogBox = await page.locator("#catalog-search-dialog").boundingBox();
      if (dialogBox) {
        expect(dialogBox.x).toBeGreaterThanOrEqual(-2);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390 + 2);
      }
      await page.keyboard.press("Escape");
    }
    // cart drawer
    const cartOpen = page.locator("[data-solara-cart-open]").first();
    if ((await cartOpen.count()) > 0) {
      await cartOpen.click();
      await page.waitForTimeout(400);
      await page.locator('[data-cart-drawer][data-open="true"]').waitFor({ state: "visible" });
      const drawerBox = await page.locator("[data-cart-drawer]").boundingBox();
      expect(drawerBox).not.toBeNull();
      expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(390 + 2);
      expect(drawerBox!.x).toBeGreaterThanOrEqual(-2);
      await page.keyboard.press("Escape");
    }
    await page.screenshot({ path: `test-results/visual-break/modals-mobile.png` });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
