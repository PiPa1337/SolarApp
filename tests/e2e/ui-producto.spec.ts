/**
 * F5 — Auditoría de controles 2026-08-10: regresión dura de los controles del
 * editor de producto verificados por la caza H4 (E1-E5): guardar persiste en
 * fila y preview, cancelar descarta, variantes agregan/quitan con persistencia,
 * disponibilidad y estado persisten, slug duplicado con error inline.
 */
import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

let server: Server;
let studioUrl: string;
type CatalogCounts = { products: number; variants: number };

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

async function openCatalog(page: Page) {
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
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await createCleanStore(page, "Tienda productos");
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
}

async function openCreateDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saveProduct(dialog: Locator, action: "draft" | "activate" | "edit") {
  const label =
    action === "activate"
      ? "Crear y activar"
      : action === "edit"
        ? "Guardar cambios"
        : "Guardar borrador";
  await dialog.getByRole("button", { name: label }).click();
  await expect(dialog).toBeHidden();
}

async function createDraftProduct(page: Page, title: string): Promise<void> {
  const dialog = await openCreateDialog(page);
  await dialog.getByRole("textbox", { name: "Título" }).fill(title);
  await saveProduct(dialog, "draft");
}

async function selectFirstProductImage(dialog: Locator): Promise<void> {
  const image = dialog.locator(".product-asset-option input[type=checkbox]").first();
  await expect(image).toBeVisible();
  await image.check();
}

async function readCatalogCounts(page: Page): Promise<CatalogCounts> {
  const summary = page
    .getByRole("heading", { name: "Catálogo", exact: true })
    .locator("xpath=..")
    .getByRole("paragraph");
  const text = await summary.textContent();
  const match = text?.match(/(\d+) productos y (\d+) variantes/);
  if (!match) throw new Error(`Resumen de catálogo inesperado: ${text ?? "(vacío)"}`);
  return { products: Number(match[1]), variants: Number(match[2]) };
}

/** Aísla la fila de un producto por su título exacto en la búsqueda. */
async function filterRow(page: Page, title: string): Promise<Locator> {
  await page.getByPlaceholder("Buscar por producto, marca o estado").fill(title);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  return rows.first();
}

async function openEditDialog(page: Page, title: string): Promise<Locator> {
  const row = await filterRow(page, title);
  await row.getByRole("button", { name: "Editar" }).click();
  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Fieldset del Field que envuelve un control nativo (patrón de Ui.tsx). */
function fieldOf(input: Locator): Locator {
  return input.locator("xpath=ancestor::fieldset[contains(@class, 'field')]");
}

test("guardar persiste el producto en la fila y en la vista previa", async ({ page }) => {
  test.setTimeout(90_000);
  await openCatalog(page);
  const before = await readCatalogCounts(page);
  const dialog = await openCreateDialog(page);

  await dialog.getByRole("textbox", { name: "Título" }).fill("Remera H4AUDIT");
  await dialog.getByRole("textbox", { name: "Marca" }).fill("Marca Aurora");
  await dialog.getByRole("textbox", { name: "SKU" }).fill("H4AUDIT-01");
  await dialog.getByRole("textbox", { name: "Descripción" }).fill("Producto de prueba para H4.");
  await dialog.getByRole("spinbutton", { name: "Precio en centavos" }).fill("42900");
  await selectFirstProductImage(dialog);
  await saveProduct(dialog, "activate");

  // La fila refleja el producto nuevo y el contador global se actualiza.
  await expect
    .poll(() => readCatalogCounts(page))
    .toEqual({
      products: before.products + 1,
      variants: before.variants + 1,
    });
  const row = await filterRow(page, "Remera H4AUDIT");
  await expect(row.getByRole("textbox", { name: "Nombre de Remera H4AUDIT" })).toBeVisible();

  // La vista previa muestra la ruta del producto nuevo con su título.
  const routeInput = page.getByTestId("ui-preview-route");
  await routeInput.fill("/productos/remera-h4audit/");
  await routeInput.press("Enter");
  const previewBody = page.frameLocator("iframe").locator("body");
  await expect(previewBody).toContainText("Remera H4AUDIT", { timeout: 20_000 });
});

test("cancelar descarta los cambios y conserva la fila original", async ({ page }) => {
  test.setTimeout(90_000);
  await openCatalog(page);
  const originalTitle = "Camisa Rayas Finas H4AUDIT";
  await createDraftProduct(page, originalTitle);
  const before = await readCatalogCounts(page);
  const dialog = await openEditDialog(page, originalTitle);

  const titleInput = dialog.getByRole("textbox", { name: "Título" });
  await titleInput.fill("Camisa Rayas Finas MODIFICADA");
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("textbox", { name: `Nombre de ${originalTitle}` })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nombre de Camisa Rayas Finas MODIFICADA" }),
  ).toHaveCount(0);
  await expect.poll(() => readCatalogCounts(page)).toEqual(before);
});

test("agregar y quitar variantes persiste al reabrir el editor", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const dialog = await openCreateDialog(page);

  await dialog.getByRole("textbox", { name: "Título" }).fill("Variantes H4AUDIT");
  await saveProduct(dialog, "draft");

  // Agregar una variante y guardar: al reabrir hay dos.
  let edit = await openEditDialog(page, "Variantes H4AUDIT");
  await edit.getByRole("button", { name: "Variantes", exact: true }).click();
  await expect(edit.locator(".variant-editor")).toHaveCount(1);
  await edit.getByRole("button", { name: "Agregar variante" }).click();
  await expect(edit.locator(".variant-editor")).toHaveCount(2);
  await saveProduct(edit, "edit");

  edit = await openEditDialog(page, "Variantes H4AUDIT");
  await edit.getByRole("button", { name: "Variantes", exact: true }).click();
  await expect(edit.locator(".variant-editor")).toHaveCount(2);

  // Quitar una variante y guardar: al reabrir queda una.
  const second = edit.locator(".variant-editor").nth(1);
  await second.getByRole("button", { name: /Eliminar/ }).click();
  const confirmDelete = page.getByTestId("ui-confirm-dialog");
  await expect(confirmDelete).toBeVisible();
  await confirmDelete.getByRole("button", { name: "Eliminar variante" }).click();
  await expect(edit.locator(".variant-editor")).toHaveCount(1);
  await saveProduct(edit, "edit");

  edit = await openEditDialog(page, "Variantes H4AUDIT");
  await edit.getByRole("button", { name: "Variantes", exact: true }).click();
  await expect(edit.locator(".variant-editor")).toHaveCount(1);
});

test("disponibilidad y estado persisten en la fila y al reabrir", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const dialog = await openCreateDialog(page);

  await dialog.getByRole("textbox", { name: "Título" }).fill("Disponibilidad H4AUDIT");
  await dialog.getByRole("button", { name: "Variantes", exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Disponible para vender" }).uncheck();
  await dialog.getByLabel("Estado").selectOption("hidden");
  await saveProduct(dialog, "draft");

  // La fila muestra el estado Oculto tras guardar.
  const row = await filterRow(page, "Disponibilidad H4AUDIT");
  await expect(row.locator(".status-label")).toHaveText("Oculto");

  // Al reabrir, la disponibilidad y el estado siguen como se guardaron.
  const edit = await openEditDialog(page, "Disponibilidad H4AUDIT");
  await edit.getByRole("button", { name: "Variantes", exact: true }).click();
  await expect(edit.getByRole("checkbox", { name: "Disponible para vender" })).not.toBeChecked();
  await expect(edit.getByLabel("Estado")).toHaveValue("hidden");
});

test("el slug duplicado muestra error inline y bloquea el guardado", async ({ page }) => {
  test.setTimeout(90_000);
  await openCatalog(page);
  await createDraftProduct(page, "Producto con slug ocupado");
  const before = await readCatalogCounts(page);
  const dialog = await openCreateDialog(page);

  // Título existente del fixture demo: el slug autogenerado ya está tomado.
  await dialog.getByRole("textbox", { name: "Título" }).fill("Producto con slug ocupado");
  const slugInput = dialog.getByRole("textbox", { name: "Slug" });
  await expect(slugInput).toHaveValue("producto-con-slug-ocupado");
  await expect(slugInput).toHaveAttribute("aria-invalid", "true");
  await expect(fieldOf(slugInput).getByTestId("ui-field-error")).toContainText(
    "Ya existe otro producto con este slug.",
  );

  // Guardar queda bloqueado: el diálogo permanece abierto.
  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeVisible();

  // Con un slug libre el guardado avanza y el catálogo crece a 51.
  await slugInput.fill("remera-esencial-h4audit");
  await expect(slugInput).not.toHaveAttribute("aria-invalid", "true");
  await saveProduct(dialog, "draft");
  await expect
    .poll(() => readCatalogCounts(page))
    .toEqual({
      products: before.products + 1,
      variants: before.variants + 1,
    });
  await page
    .getByPlaceholder("Buscar por producto, marca o estado")
    .fill("Producto con slug ocupado");
  await expect(page.locator("tbody tr")).toHaveCount(2);
});
