/**
 * Barrido A22 — CatalogToolbar + Ui (owner de
 * `apps/studio/src/features/catalog/CatalogToolbar.tsx` y
 * `apps/studio/src/components/Ui.tsx`). Contrato de 3 capas por control:
 * (1) click → efecto real en filas/estado, (2) auto-feedback del control
 * (aria-expanded, aria-pressed, valor del campo, checked, disabled),
 * (3) payload del handler → receptor (estado de Catalog → @tanstack/react-table).
 *
 * Fixture determinista: la demo "Predeterminado" (seed demo) aporta productos,
 * marcas cíclicas y categorías con conteos conocidos. El total del catálogo se
 * deriva del proyecto persistido para no congelar una cantidad histórica.
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(120_000);

let server: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

interface CatalogFacts {
  productCount: number;
  firstTitle: string;
  secondTitle: string;
  categoryId: string;
  categoryCount: number;
  categoryProductTitle: string;
}

async function readDemoCatalogFacts(page: Page): Promise<CatalogFacts> {
  return page.evaluate(
    (projectId) =>
      new Promise<CatalogFacts>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const all = db.transaction("projects").objectStore("projects").getAll();
          all.addEventListener("success", () => {
            const records = all.result as Array<{
              project: {
                id: string;
                products?: Array<{ title: string; categoryIds: string[] }>;
                categories?: Array<{ id: string; parentId?: string }>;
              };
            }>;
            const record = records.find((item) => item.project.id === projectId);
            if (!record) {
              reject(new Error(`No se encontró el proyecto ${projectId} en IndexedDB.`));
              return;
            }
            const products = record.project.products ?? [];
            const categories = record.project.categories ?? [];
            const uniqueTitles = products
              .map((product) => product.title)
              .filter(
                (title, _index, titles) =>
                  titles.filter((candidate) => candidate === title).length === 1,
              );
            const firstTitle = uniqueTitles[0] ?? products[0]?.title ?? "";
            const secondTitle = uniqueTitles[1] ?? products[1]?.title ?? firstTitle;
            const categoryFacts = categories
              .map((category) => {
                const scope = new Set([category.id]);
                let changed = true;
                while (changed) {
                  changed = false;
                  for (const candidate of categories) {
                    if (
                      candidate.parentId &&
                      scope.has(candidate.parentId) &&
                      !scope.has(candidate.id)
                    ) {
                      scope.add(candidate.id);
                      changed = true;
                    }
                  }
                }
                const matches = products.filter((product) =>
                  product.categoryIds.some((id) => scope.has(id)),
                );
                return { id: category.id, matches };
              })
              .sort((left, right) => right.matches.length - left.matches.length)[0];
            if (!categoryFacts || categoryFacts.matches.length === 0) {
              reject(
                new Error("La demo no tiene una categoría con productos para probar el filtro."),
              );
              return;
            }
            resolve({
              productCount: products.length,
              firstTitle,
              secondTitle,
              categoryId: categoryFacts.id,
              categoryCount: categoryFacts.matches.length,
              categoryProductTitle: categoryFacts.matches[0]?.title ?? "",
            });
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
    "store-modo-sur-demo",
  );
}

async function openCatalog(page: Page): Promise<CatalogFacts> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolveDelete, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolveDelete());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await enterCatalogFromCurrentState(page);
  const facts = await readDemoCatalogFacts(page);
  expect(facts.productCount).toBeGreaterThan(0);
  expect(facts.firstTitle).toMatch(/\S/);
  expect(facts.secondTitle).toMatch(/\S/);
  await expect(rows(page)).toHaveCount(Math.min(50, facts.productCount));
  return facts;
}

async function enterCatalogFromCurrentState(page: Page): Promise<void> {
  const dashboard = page.getByRole("heading", { name: "Tus tiendas" });
  const studioNav = page.getByRole("navigation", { name: "Áreas de la tienda" });
  await expect
    .poll(async () => (await dashboard.count()) + (await studioNav.count()), { timeout: 20_000 })
    .toBeGreaterThan(0);
  if (await dashboard.isVisible()) {
    await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
    await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
    await expect(studioNav).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
}

const rows = (page: Page) =>
  page.locator("tbody tr").filter({ hasNot: page.locator("td.table-empty") });
const searchBox = (page: Page) => page.getByRole("textbox", { name: "Buscar productos" });
const categoryFilter = (page: Page) => page.getByLabel("Filtrar categoría");
const columnsToggle = (page: Page) => page.getByTestId("ui-columns-toggle");
const columnsPopover = (page: Page) => page.getByTestId("ui-columns-popover");
const columnToggle = (page: Page, id: string) => page.getByTestId(`ui-column-toggle-${id}`);
const paginationSummary = (page: Page) => page.locator(".ui-pagination__summary");
const pageSizeSelect = (page: Page) => page.getByLabel("Filas por página");
const currentPage = (page: Page) => page.locator('.ui-pagination__page[aria-current="page"]');
const emptyMessage = (page: Page) => page.locator(".table-empty");
const titleOf = (page: Page, index: number) =>
  rows(page).nth(index).locator('input[aria-label^="Nombre de "]').inputValue();

test.describe("A22 — Búsqueda del toolbar", () => {
  test("el texto filtra de verdad, el campo lo refleja y vuelve a la página 1", async ({
    page,
  }) => {
    const facts = await openCatalog(page);
    const { productCount } = facts;
    expect(productCount).toBeGreaterThan(25);

    await pageSizeSelect(page).selectOption("25");
    await expect(rows(page)).toHaveCount(25);
    await page.locator(".ui-pagination__page", { hasText: "2" }).click();
    await expect(paginationSummary(page)).toHaveText(
      `26–${Math.min(50, productCount)} de ${productCount}`,
    );
    await expect(currentPage(page)).toHaveText("2");

    await searchBox(page).fill(facts.firstTitle);
    await expect(searchBox(page)).toHaveValue(facts.firstTitle);
    await expect(rows(page)).toHaveCount(1);
    await expect(paginationSummary(page)).toHaveText("1–1 de 1");
    await expect(currentPage(page)).toHaveText("1");
    await expect(page.locator(".ui-pagination__page")).toHaveCount(1);

    await searchBox(page).fill(facts.secondTitle);
    await expect(searchBox(page)).toHaveValue(facts.secondTitle);
    await expect.poll(() => titleOf(page, 0)).toBe(facts.secondTitle);
    await expect(rows(page)).toHaveCount(1);

    await searchBox(page).fill("Inexistente-ZZZ");
    await expect(rows(page)).toHaveCount(0);
    await expect(emptyMessage(page)).toContainText("No hay productos que coincidan");
    await expect(paginationSummary(page)).toHaveText("0 resultados");

    await searchBox(page).fill("");
    await expect(rows(page)).toHaveCount(25);
    await expect(searchBox(page)).toHaveValue("");
    await expect(paginationSummary(page)).toHaveText(`1–25 de ${productCount}`);
  });
});

test.describe("A22 — Filtro de categoría", () => {
  test("el select filtra por categoría, refleja el valor y combina con la búsqueda", async ({
    page,
  }) => {
    const facts = await openCatalog(page);
    const { productCount } = facts;

    await categoryFilter(page).selectOption(facts.categoryId);
    await expect(categoryFilter(page)).toHaveValue(facts.categoryId);
    await expect(rows(page)).toHaveCount(facts.categoryCount);
    await expect(paginationSummary(page)).toHaveText(
      `1–${facts.categoryCount} de ${facts.categoryCount}`,
    );

    await searchBox(page).fill(facts.categoryProductTitle);
    await expect(rows(page)).toHaveCount(1);

    await searchBox(page).fill("");
    await categoryFilter(page).selectOption("");
    await expect(rows(page)).toHaveCount(Math.min(50, productCount));
    await expect(categoryFilter(page)).toHaveValue("");
  });
});

test.describe("A22 — Toggle de columnas", () => {
  test("aria-expanded, tabla de verdad del popover y persistencia", async ({ page }) => {
    const { productCount } = await openCatalog(page);
    const stockHeader = page.locator("th", { hasText: "Stock" });

    await expect(columnsToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(columnsToggle(page)).not.toHaveAttribute("aria-controls");
    await expect(columnsPopover(page)).toHaveCount(0);
    await expect(stockHeader).toHaveCount(1);

    await columnsToggle(page).click();
    await expect(columnsToggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(columnsPopover(page)).toBeVisible();
    await expect(columnsPopover(page).locator('input[type="checkbox"]')).toHaveCount(8);
    await expect(columnToggle(page, "stock")).toBeChecked();
    const popoverId = await columnsPopover(page).getAttribute("id");
    expect(popoverId, "popover con id").toMatch(/\S+/);
    await expect(columnsToggle(page)).toHaveAttribute("aria-controls", popoverId ?? "");

    await columnToggle(page, "stock").uncheck();
    await expect(stockHeader).toHaveCount(0);
    await expect(rows(page)).toHaveCount(Math.min(50, productCount));

    await columnToggle(page, "stock").check();
    await expect(stockHeader).toHaveCount(1);

    await columnToggle(page, "stock").uncheck();
    await columnsToggle(page).click();
    await expect(columnsToggle(page)).toHaveAttribute("aria-expanded", "false");

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("solara-catalog-columns:store-modo-sur-demo") ?? "{}"),
    );
    expect(stored.stock).toBe(false);

    await page.reload();
    await enterCatalogFromCurrentState(page);
    await expect(stockHeader).toHaveCount(0);
  });

  test("Escape cierra el popover y devuelve el foco al botón; el click fuera cierra", async ({
    page,
  }) => {
    await openCatalog(page);

    await columnsToggle(page).click();
    await expect(columnsPopover(page)).toBeVisible();
    await columnToggle(page, "price").focus();
    await page.keyboard.press("Escape");
    await expect(columnsPopover(page)).toHaveCount(0);
    await expect(columnsToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(columnsToggle(page)).toBeFocused();

    await columnsToggle(page).click();
    await expect(columnsPopover(page)).toBeVisible();
    await searchBox(page).click();
    await expect(columnsPopover(page)).toHaveCount(0);
    await expect(columnsToggle(page)).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("A22 — Toggle de vista (estados presionados)", () => {
  test("lista/tarjetas: aria-pressed, layout real y persistencia", async ({ page }) => {
    const { productCount } = await openCatalog(page);
    const listButton = page.getByRole("button", { name: "Lista", exact: true });
    const cardsButton = page.getByRole("button", { name: "Tarjetas", exact: true });

    await expect(listButton).toHaveAttribute("aria-pressed", "true");
    await expect(cardsButton).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".table-shell")).toBeVisible();
    await expect(page.getByTestId("ui-catalog-cards")).toHaveCount(0);

    await cardsButton.click();
    await expect(cardsButton).toHaveAttribute("aria-pressed", "true");
    await expect(listButton).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("ui-catalog-cards")).toBeVisible();
    await expect(page.getByTestId("ui-catalog-card")).toHaveCount(productCount);
    await expect(page.locator(".table-shell")).toHaveCount(0);
    await expect(
      await page.evaluate(() => localStorage.getItem("solara-catalog-view:store-modo-sur-demo")),
    ).toBe("cards");

    await listButton.click();
    await expect(listButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".table-shell")).toBeVisible();
    await expect(rows(page)).toHaveCount(Math.min(50, productCount));
  });
});

test.describe("A22 — Selección desde el toolbar", () => {
  test("seleccionar filtrados marca sólo los visibles y limpiar restaura el conteo", async ({
    page,
  }) => {
    const facts = await openCatalog(page);
    expect(facts.categoryCount).toBeGreaterThan(1);
    await categoryFilter(page).selectOption(facts.categoryId);
    await expect(rows(page)).toHaveCount(facts.categoryCount);

    await page.getByTestId("select-filtered-products").click();
    await expect(
      page.getByText(`${facts.categoryCount} seleccionados`, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(
      facts.categoryCount,
    );
    await expect(page.locator('tbody tr[data-selected="true"]')).toHaveCount(facts.categoryCount);

    await page.getByRole("button", { name: "Limpiar", exact: true }).click();
    await expect(page.getByText("0 seleccionados", { exact: true })).toBeVisible();
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(0);
  });

  test("el botón de seleccionar filtrados usa el singular con un solo resultado", async ({
    page,
  }) => {
    const facts = await openCatalog(page);
    await searchBox(page).fill(facts.firstTitle);
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId("select-filtered-products")).toContainText(
      "Seleccionar 1 filtrado",
    );
  });
});

test.describe("A22 — Paginación del toolbar", () => {
  test("tamaño 25: navegación con página actual marcada y botones coherentes", async ({ page }) => {
    const { productCount } = await openCatalog(page);
    expect(productCount).toBeGreaterThan(25);

    await pageSizeSelect(page).selectOption("25");
    await expect(rows(page)).toHaveCount(25);
    await expect(paginationSummary(page)).toHaveText(`1–25 de ${productCount}`);
    await expect(currentPage(page)).toHaveText("1");
    await expect(page.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeEnabled();

    const lastPage = Math.ceil(productCount / 25);
    const lastStart = (lastPage - 1) * 25 + 1;
    await page.locator(".ui-pagination__page", { hasText: String(lastPage) }).click();
    await expect(paginationSummary(page)).toHaveText(
      `${lastStart}–${productCount} de ${productCount}`,
    );
    await expect(currentPage(page)).toHaveText(String(lastPage));
    await expect(page.getByRole("button", { name: "Anterior" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });
});

test.describe("A22 — Primitivas Ui en uso real", () => {
  test("Field asocia el label con aria-labelledby y muestra el error con aria-describedby", async ({
    page,
  }) => {
    await openCatalog(page);
    await rows(page).nth(0).getByRole("button", { name: "Editar" }).click();
    const dialog = page.locator("dialog.product-dialog");
    await expect(dialog).toBeVisible();

    const titleInput = dialog.getByRole("textbox", { name: "Título" });
    const titleField = titleInput.locator("xpath=ancestor::fieldset[1]");
    const labelledBy = await titleInput.getAttribute("aria-labelledby");
    expect(labelledBy, "aria-labelledby presente").toMatch(/\S+/);
    await expect(dialog.locator(`#${labelledBy}`)).toHaveText("Título");

    await titleInput.fill("");
    const fieldError = titleField.getByTestId("ui-field-error");
    await expect(fieldError).toContainText("Escribí un título");
    const describedBy = await titleInput.getAttribute("aria-describedby");
    expect(describedBy, "aria-describedby presente con error").toMatch(/\S+/);
    await expect(dialog.locator(`#${describedBy}`)).toHaveText(/Escribí un título/);
    await expect(titleInput).toHaveAttribute("aria-invalid", "true");
    await expect(titleField).toHaveAttribute("aria-invalid", "true");

    await titleInput.fill("Remera esencial de algodón");
    await expect(titleField.getByTestId("ui-field-error")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    const confirmClose = page.getByRole("dialog", { name: "Salir sin guardar" });
    await expect(confirmClose).toBeVisible();
    await confirmClose.getByRole("button", { name: "Salir sin guardar", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("IconButton expone label como aria-label y title", async ({ page }) => {
    await openCatalog(page);
    await rows(page).nth(0).getByRole("button", { name: "Editar" }).click();
    const dialog = page.locator("dialog.product-dialog");
    await expect(dialog).toBeVisible();

    const close = page
      .getByRole("region", { name: "Panel de edición" })
      .getByRole("button", { name: "Cerrar editor" });
    await expect(close).toHaveAttribute("aria-label", "Cerrar editor");
    await expect(close).toHaveAttribute("title", "Cerrar editor");
    await expect(close).toHaveAttribute("type", "button");

    await close.click();
    await expect(dialog).toBeHidden();
  });

  test("Button disabled: la paginación deshabilita Anterior/Siguiente en los extremos", async ({
    page,
  }) => {
    await openCatalog(page);
    await expect(page.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  test("EmptyState en catálogo vacío con acción y InlineError con role=alert", async ({ page }) => {
    // Las tiendas creadas desde el wizard reciben placeholders de catálogo;
    // la variante verdaderamente vacía se cubre en la galería canónica de Ui.
    await page.route("**/__studio/components", (route) =>
      route.fulfill({ path: "apps/studio/dist/index.html" }),
    );
    await page.goto(`${studioUrl}/__studio/components`);
    await expect(page.getByRole("heading", { name: "Galería de componentes" })).toBeVisible();

    const empty = page.getByTestId("ui-empty-state").filter({ hasText: "El catálogo está vacío" });
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("button", { name: "Agregar producto" })).toBeVisible();

    await page.unroute("**/__studio/components");
    await page.goto(studioUrl);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
    await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crear tienda" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Continuar", exact: true }).click();

    const inlineError = page.getByTestId("ui-inline-error");
    await expect(inlineError).toBeVisible();
    await expect(inlineError).toHaveAttribute("role", "alert");
    await expect(inlineError).toContainText("Escribí un nombre");

    await page.getByLabel("Nueva tienda").fill("Tienda A22 OK");
    await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(inlineError).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
