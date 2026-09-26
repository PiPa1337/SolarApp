import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { referenceStore } from "@solara/project-schema/fixture";

const edgeStore = (() => {
  const store = structuredClone(referenceStore);
  store.products = store.products.map((product, index) =>
    index === 0 ? { ...product, categoryIds: [], price: 0 } : product,
  );
  // Recalcular los índices derivados (contrato del schema: productIds de
  // categorías y colecciones son derivados de los categoryIds de productos).
  const activeIds = new Set(
    store.products.filter((product) => product.status === "active").map((product) => product.id),
  );
  store.categories = store.categories.map((category) => ({
    ...category,
    productIds: store.products
      .filter((product) => product.categoryIds.includes(category.id) && activeIds.has(product.id))
      .map((product) => product.id),
  }));
  store.collections = store.collections.map((collection) => ({
    ...collection,
    productIds: collection.productIds.filter((id) => activeIds.has(id)),
  }));
  store.categories = [
    ...store.categories,
    {
      id: "category-vacia",
      title: "Categoría vacía",
      slug: "categoria-vacia",
      description: "Todavía sin productos.",
      productIds: [],
    },
  ];
  return store;
})();

let server: Server;
let serverUrl: string;

test.beforeAll(async () => {
  const exported = exportProject(edgeStore, { mode: "production" });
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path = requested === "" || requested.endsWith("/") ? `${requested}index.html` : requested;
    const content = exported.files.get(path);
    if (content === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(Buffer.from(content));
  });
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sin puerto.");
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});

test("F2-E1: la categoría sin productos genera página con estado vacío", async ({ page }) => {
  const response = await page.goto(`${serverUrl}/categorias/categoria-vacia/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Categoría vacía" })).toBeVisible();
  const grid = page.locator("[data-category-grid]");
  const emptyVisible = await page
    .getByText("No hay productos para mostrar.")
    .isVisible()
    .catch(() => false);
  console.log(
    "F2-E1 estado vacío visible:",
    emptyVisible,
    "| grid cards:",
    await grid.locator("[data-product-card]").count(),
  );
  expect(emptyVisible).toBe(true);
});

test("F2-E2: el producto sin categoría tiene página y figura en el catálogo", async ({ page }) => {
  const firstProduct = edgeStore.products[0];
  const response = await page.goto(`${serverUrl}/productos/${firstProduct.slug}/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(firstProduct.title);

  await page.goto(`${serverUrl}/`);
  const home = await page.content();
  const listed = home.includes(firstProduct.slug);
  console.log("F2-E2 producto sin categoría listado en home:", listed);
  expect(listed).toBe(true);
});
