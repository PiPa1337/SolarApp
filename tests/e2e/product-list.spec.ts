import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject, renderPreviewHtml } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { buildModernBaseTemplateProject } from "@solara/project-schema/modern-base-template";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { FIXTURE_PRODUCT_FILES } from "./fixture-server";

const demo = buildModernBaseTemplateProject();
const noSearch = structuredClone(catalogModernV2Store);
noSearch.commerceTemplates.search.enabled = false;
const longNames = structuredClone(demo);
const longProduct = longNames.products[0];
if (!longProduct) throw new Error("Demo sin productos");
longProduct.title = `Árbol de estación & algodón ${"extraordinario".repeat(6)}`;
const projects = {
  demo,
  legacy: referenceStore,
  v2: noSearch,
  scale: catalogScaleStore,
  long: longNames,
};
const sites = new Map(
  Object.entries(projects).map(([key, project]) => [
    key,
    exportProject(project, { mode: "production" }).files,
  ]),
);
const servers: Server[] = [];
const urls = new Map<string, string>();

test.beforeAll(async () => {
  for (const [key, files] of sites) {
    const server = createServer((request, response) => {
      const requested = new URL(request.url ?? "/", "http://localhost").pathname.slice(1);
      const path = !requested
        ? "index.html"
        : requested.endsWith("/")
          ? `${requested}index.html`
          : requested;
      const content = files.get(path) ?? FIXTURE_PRODUCT_FILES.get(path);
      const mime = path.endsWith(".html")
        ? "text/html"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".js")
            ? "text/javascript"
            : "application/octet-stream";
      response.writeHead(content === undefined ? 404 : 200, {
        "Content-Type": `${mime}; charset=utf-8`,
      });
      response.end(content ?? "Not found");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor sin puerto");
    servers.push(server);
    urls.set(key, `http://127.0.0.1:${address.port}`);
  }
});

test.afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

for (const key of ["demo", "legacy", "v2", "scale"] as const) {
  test(`${key}: footer, listado completo y enlace al producto`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${urls.get(key)}/`);
    await page.locator("footer").getByRole("link", { name: "Listado de productos" }).click();
    await expect(page).toHaveURL(/\/listado\/$/);
    await expect(page.locator("[data-product-list-controls]")).toBeVisible();
    await expect(page.locator("[data-product-list-row] td").last()).toHaveCSS("text-align", "end");
    await expect(page.locator("[data-product-list-row] td").first()).toHaveCSS(
      "border-bottom-width",
      "1px",
    );
    await expect(page.getByRole("searchbox", { name: "Buscar en el listado" })).toHaveCSS(
      "min-height",
      "44px",
    );
    const active = projects[key].products.filter((product) => product.status === "active");
    await expect(page.locator("[data-product-list-row]")).toHaveCount(active.length);
    await page.locator("[data-product-list-row] a").first().click();
    await expect(page).toHaveURL(new RegExp(`/productos/${active[0]?.slug}/$`));
    expect(errors).toEqual([]);
  });

  test(`${key}: todos los productos y footer sin JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(`${urls.get(key)}/listado/`);
    await expect(page.locator("[data-product-list-row]")).toHaveCount(
      projects[key].products.filter((product) => product.status === "active").length,
    );
    await expect(page.locator("[data-product-list-controls]")).toBeHidden();
    await expect(
      page.locator("footer").getByRole("link", { name: "Listado de productos" }),
    ).toBeVisible();
    await context.close();
  });
}

test("filtra, equilibra columnas, comunica vacío y limpia con teclado", async ({ page }) => {
  await page.goto(`${urls.get("demo")}/listado/`);
  const search = page.getByRole("searchbox", { name: "Buscar en el listado" });
  await expect(search).toBeVisible();
  await page.getByLabel("Filtrar por categoría").selectOption({ label: "Hogar" });
  await expect(page.locator("[data-product-list-row]")).toHaveCount(6);
  for (const index of [0, 1])
    await expect(page.locator(`[data-product-list-body="${index}"] tr`)).toHaveCount(3);
  await search.fill("  PRODUCTO 01  ");
  await search.press("Enter");
  await expect(page.locator("[data-product-list-row]")).toHaveCount(1);
  await expect(page.locator("[data-product-list-column]").nth(1)).toBeHidden();
  await search.fill("producto inexistente");
  await expect(page.getByRole("status")).toHaveText("0 productos");
  await expect(page.locator("[data-product-list-empty]")).toBeVisible();
  const reset = page.getByRole("button", { name: "Limpiar filtros" });
  await reset.focus();
  await reset.press("Enter");
  await expect(search).toBeFocused();
  await expect(page.locator("[data-product-list-row]")).toHaveCount(33);
  await expect(page.locator("[data-product-list-empty]")).toBeHidden();
});

test("filtra categorías padre incluyendo descendientes", async ({ page }) => {
  await page.goto(`${urls.get("scale")}/listado/`);
  const child = catalogScaleStore.categories.find((category) => category.parentId);
  if (!child) throw new Error("Fixture sin jerarquía");
  await page.getByLabel("Filtrar por categoría").selectOption(child.parentId ?? "");
  const nested = catalogScaleStore.products.find(
    (product) => product.status === "active" && product.categoryIds.includes(child.id),
  );
  if (!nested) throw new Error("Fixture sin producto de subcategoría");
  await expect(
    page.locator("[data-product-list-row]").getByRole("link", { name: nested.title, exact: true }),
  ).toBeVisible();
});

test("Preview conserva las mismas filas y filtros", async ({ page }) => {
  await page.setContent(String(renderPreviewHtml(demo, "draft", "/listado/")));
  await expect(page.locator("[data-product-list-row]")).toHaveCount(33);
  await page.getByRole("searchbox", { name: "Buscar en el listado" }).fill("Producto 33");
  await expect(page.locator("[data-product-list-row]")).toHaveCount(1);
});

for (const width of [390, 767, 768, 1024, 1199, 1200, 1440]) {
  test(`responsive ${width}px: lectura y precios sin recortes`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${urls.get("demo")}/listado/`);
    await expect(page.locator("[data-product-list-controls]")).toBeVisible();
    const columns = await page.locator("[data-product-list-column]").evaluateAll((elements) =>
      elements.map((element) => ({
        x: element.getBoundingClientRect().x,
        y: element.getBoundingClientRect().y,
      })),
    );
    expect(columns[0]?.x === columns[1]?.x).toBe(width < 768);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if ([390, 1024, 1440].includes(width))
      await page.screenshot({ path: testInfo.outputPath(`listado-${width}.png`), fullPage: true });
    await page.goto(`${urls.get("long")}/listado/`);
    await page.getByRole("searchbox", { name: "Buscar en el listado" }).fill("arbol algodon");
    await expect(page.locator("[data-product-list-row]")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
