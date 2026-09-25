/**
 * Barrido A5 (2026-08-10) — AUDIT del paso Variantes de ProductEditor.tsx.
 * El propietario del archivo es A4 (OWNER); este spec NO lo edita: verifica el
 * contrato de 3 capas (efecto real, auto-feedback, datos) para agregar,
 * duplicar, eliminar, opciones, precio/SKU, stock, disponibilidad, reorden y
 * campos secundarios de variante. Los cambios de ProductEditor.tsx quedan
 * registrados como regresiones del owner A4.
 *
 * Capa de datos: el receptor es el reducer del catálogo (product.create /
 * product.update con changes.variants) y la persistencia Dexie valida el
 * proyecto completo con StoreProjectV1Schema; se lee el producto guardado
 * desde IndexedDB para verificar el contrato tal como lo aceptó el dominio.
 */
import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

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

interface PersistedVariant {
  id: string;
  sku: string;
  title: string;
  optionValues: Record<string, string>;
  price: number;
  compareAtPrice?: number;
  available: boolean;
  stockStatus: string;
  gtin?: string;
  mpn?: string;
  imageId?: string;
}

/** Variantes del producto persistido en IndexedDB (receptor del contrato). */
async function readPersistedVariants(
  page: Page,
  productTitle: string,
): Promise<PersistedVariant[] | null> {
  return page.evaluate(async (title) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("solara-commerce-studio");
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    try {
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .getAll();
        request.addEventListener("success", () => resolve(request.result as unknown[]));
        request.addEventListener("error", () => reject(request.error));
      });
      for (const record of records) {
        const project = (record as { project?: { products?: unknown[] } }).project;
        const product = (project?.products ?? []).find(
          (candidate) => (candidate as { title?: string }).title === title,
        );
        if (product) {
          return (product as { variants?: PersistedVariant[] }).variants ?? null;
        }
      }
      return null;
    } finally {
      database.close();
    }
  }, productTitle);
}

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
  await openMutableScaleStore(page, "Tienda escala A05");
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
}

async function openCreateDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
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

async function variantsStep(dialog: Locator): Promise<Locator> {
  const step = dialog.getByRole("button", { name: "Variantes", exact: true });
  await step.click();
  await expect(step).toHaveAttribute("aria-current", "step");
  return dialog.locator(".variant-editor");
}

async function saveProduct(dialog: Locator, create: boolean) {
  await dialog
    .getByRole("button", { name: create ? "Guardar borrador" : "Guardar cambios" })
    .click();
  await expect(dialog).toBeHidden();
}

/** Fieldset del Field que envuelve un control nativo (patrón de Ui.tsx). */
function fieldOf(input: Locator): Locator {
  return input.locator("xpath=ancestor::fieldset[contains(@class, 'field')]");
}

/** Título de producto con variantes del fixture demo (8 variantes). */
const DEMO_VARIANTS_TITLE = "Remera esencial de algodón";

test("A05: agregar variante muestra fila nueva con id válido y contrato del schema", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const title = "A05 Agregar Variante";
  const dialog = await openCreateDialog(page);
  await dialog.getByRole("textbox", { name: "Título" }).fill(title);
  await saveProduct(dialog, true);

  const edit = await openEditDialog(page, title);
  let rows = await variantsStep(edit);
  await expect(rows).toHaveCount(1);

  // Auto-feedback de borde: con una sola variante, subir/bajar/eliminar están
  // deshabilitados en la fila única.
  const only = rows.first();
  await expect(only.getByRole("button", { name: /^Subir (?!imagen)/ })).toBeDisabled();
  await expect(only.getByRole("button", { name: /^Bajar/ })).toBeDisabled();
  await expect(only.getByRole("button", { name: /^Eliminar/ })).toBeDisabled();

  // Efecto real: el click agrega una fila con nombre por defecto.
  await edit.getByRole("button", { name: "Agregar variante" }).click();
  rows = edit.locator(".variant-editor");
  await expect(rows).toHaveCount(2);
  const added = rows.nth(1);
  await expect(added.locator("header strong")).toHaveText("Variante 2");
  await expect(added.getByRole("textbox", { name: "Nombre" })).toHaveValue("Nueva variante");
  await expect(added.getByRole("button", { name: /^Subir (?!imagen)/ })).toBeEnabled();
  await expect(added.getByRole("button", { name: /^Bajar/ })).toBeDisabled();
  await expect(added.getByRole("button", { name: /^Eliminar/ })).toBeEnabled();
  await expect(rows.nth(0).getByRole("button", { name: /^Eliminar/ })).toBeEnabled();

  await saveProduct(edit, false);

  // Contrato de datos: el schema aceptó una variante nueva con id válido.
  await expect.poll(() => readPersistedVariants(page, title), { timeout: 10_000 }).toHaveLength(2);
  const persisted = await readPersistedVariants(page, title);
  expect(persisted).not.toBeNull();
  const variants = persisted as PersistedVariant[];
  const ids = variants.map((variant) => variant.id);
  expect(new Set(ids).size).toBe(2);
  expect(ids.every((id) => id.startsWith("variant-"))).toBe(true);
  expect(variants[1]).toMatchObject({
    title: "Nueva variante",
    sku: "",
    price: 0,
    available: true,
    stockStatus: "in_stock",
    optionValues: {},
  });

  const reopened = await openEditDialog(page, title);
  await variantsStep(reopened);
  await expect(reopened.locator(".variant-editor")).toHaveCount(2);
});

test("A05: duplicar variante conserva SKU, opciones y precios con id nuevo", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const edit = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  let rows = await variantsStep(edit);
  await expect(rows).toHaveCount(8);

  const first = rows.nth(0);
  const sku = await first.getByRole("textbox", { name: "SKU" }).inputValue();
  const price = await first.getByRole("spinbutton", { name: "Precio en centavos" }).inputValue();
  await expect(first.getByRole("button", { name: /^Subir (?!imagen)/ })).toBeDisabled();

  await first.getByRole("button", { name: "Duplicar Negro / S" }).click();
  rows = edit.locator(".variant-editor");
  await expect(rows).toHaveCount(9);

  // Auto-feedback: la copia aparece al final con sufijo " copia" y sus campos.
  const copy = rows.nth(8);
  await expect(copy.locator("header strong")).toHaveText("Variante 9");
  await expect(copy.getByRole("textbox", { name: "Nombre" })).toHaveValue("Negro / S copia");
  await expect(copy.getByRole("textbox", { name: "SKU" })).toHaveValue(sku);
  await expect(copy.getByRole("spinbutton", { name: "Precio en centavos" })).toHaveValue(price);
  await expect(copy.getByRole("textbox", { name: "Opciones" })).toHaveValue("Color=Negro, Talle=S");

  await saveProduct(edit, false);

  // Contrato de datos: SKU/precios/opciones conservados y id nuevo distinto.
  await expect
    .poll(() => readPersistedVariants(page, DEMO_VARIANTS_TITLE), { timeout: 10_000 })
    .toHaveLength(9);
  const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
  expect(persisted).not.toBeNull();
  const variants = persisted as PersistedVariant[];
  const ids = variants.map((variant) => variant.id);
  expect(new Set(ids).size).toBe(9);
  const duplicated = variants[8];
  expect(duplicated?.id).toMatch(/^variant-/);
  expect(duplicated).toMatchObject({
    title: "Negro / S copia",
    sku,
    optionValues: { Color: "Negro", Talle: "S" },
    price: variants[0]?.price,
    compareAtPrice: variants[0]?.compareAtPrice,
    available: variants[0]?.available,
    stockStatus: variants[0]?.stockStatus,
  });
});

test("A05: eliminar variante la quita de la edición y persiste el recorte", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const edit = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  let rows = await variantsStep(edit);
  await expect(rows).toHaveCount(8);

  const last = rows.nth(7);
  await expect(last.locator("header strong")).toHaveText("Variante 8");
  await expect(last.getByRole("textbox", { name: "Nombre" })).toHaveValue("Arena / XL");

  await last.getByRole("button", { name: "Eliminar Arena / XL" }).click();
  const deleteDialog = edit.getByRole("dialog", { name: "Eliminar variante" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.locator(".confirm-dialog__body")).toContainText("Arena / XL");
  await deleteDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(edit.locator(".variant-editor")).toHaveCount(8);
  await last.getByRole("button", { name: "Eliminar Arena / XL" }).click();
  await edit
    .getByRole("dialog", { name: "Eliminar variante" })
    .getByRole("button", { name: "Eliminar variante", exact: true })
    .click();
  rows = edit.locator(".variant-editor");
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(6).locator("header strong")).toHaveText("Variante 7");
  await expect(rows.nth(6).getByRole("textbox", { name: "Nombre" })).toHaveValue("Arena / L");
  await expect(edit.locator(".variant-editor").filter({ hasText: "Arena / XL" })).toHaveCount(0);

  await saveProduct(edit, false);

  await expect
    .poll(() => readPersistedVariants(page, DEMO_VARIANTS_TITLE), { timeout: 10_000 })
    .toHaveLength(7);
  const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
  expect(persisted).not.toBeNull();
  const variants = persisted as PersistedVariant[];
  expect(variants.some((variant) => variant.title === "Arena / XL")).toBe(false);

  const reopened = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  await variantsStep(reopened);
  await expect(reopened.locator(".variant-editor")).toHaveCount(7);
});

test("A05: opciones de variante persisten y validan con feedback inline", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const edit = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const rows = await variantsStep(edit);

  const optionsInput = rows.nth(0).getByRole("textbox", { name: "Opciones" });
  await expect(optionsInput).toHaveValue("Color=Negro, Talle=S");

  // Opción sin "=": error inline y guardado bloqueado.
  await optionsInput.fill("Color=Azul, Talle");
  await expect(optionsInput).toHaveAttribute("aria-invalid", "true");
  await expect(fieldOf(optionsInput).getByTestId("ui-field-error")).toContainText(
    'La opción "Talle" debe usar el formato Nombre=Valor.',
  );
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(edit).toBeVisible();

  // Nombre de opción repetido: rama distinta de validación.
  await optionsInput.fill("Color=Negro, Color=Azul, Talle=M");
  await expect(fieldOf(optionsInput).getByTestId("ui-field-error")).toContainText(
    'La opción "Color" está repetida.',
  );

  // Valor válido: el error desaparece y el guardado avanza.
  await optionsInput.fill("Color=Azul, Talle=M");
  await expect(optionsInput).not.toHaveAttribute("aria-invalid", "true");
  await saveProduct(edit, false);

  // El número de variantes no cambia: el poll espera el valor editado (el
  // autosave tiene debounce de 550 ms, leer antes devolvería el snapshot viejo).
  await expect
    .poll(
      async () => {
        const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
        return persisted?.[0]?.optionValues;
      },
      { timeout: 10_000 },
    )
    .toEqual({ Color: "Azul", Talle: "M" });
  const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
  expect(persisted).not.toBeNull();
  expect(persisted).toHaveLength(8);

  const reopened = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const reopenedRows = await variantsStep(reopened);
  await expect(reopenedRows.nth(0).getByRole("textbox", { name: "Opciones" })).toHaveValue(
    "Color=Azul, Talle=M",
  );
});

test("A05: precio y SKU persisten y el precio entero valida con feedback", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const title = "A05 Precio Variante";
  const dialog = await openCreateDialog(page);
  await dialog.getByRole("textbox", { name: "Título" }).fill(title);
  await variantsStep(dialog);

  const priceInput = dialog.getByRole("spinbutton", { name: "Precio en centavos" });
  const skuInput = dialog.getByRole("textbox", { name: "SKU" });
  const preview = dialog.getByTestId("ui-product-mini-preview");

  // Auto-feedback de la vista previa: "Desde" sigue el precio mínimo.
  await expect(preview.getByText(/^Desde /)).toHaveText("Desde $0");

  // Precio no entero: error inline y guardado bloqueado.
  await priceInput.fill("42.5");
  await expect(priceInput).toHaveAttribute("aria-invalid", "true");
  await expect(fieldOf(priceInput).getByTestId("ui-field-error")).toContainText(
    "El precio debe ser un número entero en centavos, mayor o igual a 0.",
  );
  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeVisible();

  await priceInput.fill("42900");
  await expect(priceInput).not.toHaveAttribute("aria-invalid", "true");
  await expect(preview.getByText(/^Desde /)).toHaveText("Desde $42.900");
  await skuInput.fill("A05-SKU-01");
  await saveProduct(dialog, true);

  await expect.poll(() => readPersistedVariants(page, title), { timeout: 10_000 }).toHaveLength(1);
  const persisted = await readPersistedVariants(page, title);
  expect(persisted).not.toBeNull();
  expect((persisted as PersistedVariant[])[0]).toMatchObject({
    price: 42900,
    sku: "A05-SKU-01",
  });

  const reopened = await openEditDialog(page, title);
  await variantsStep(reopened);
  await expect(reopened.getByRole("spinbutton", { name: "Precio en centavos" })).toHaveValue(
    "42900",
  );
  await expect(reopened.getByRole("textbox", { name: "SKU" })).toHaveValue("A05-SKU-01");
});

test("A05: stock y disponibilidad de variante persisten", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const edit = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const rows = await variantsStep(edit);

  const stockSelect = rows.nth(0).getByLabel("Stock");
  await expect(stockSelect).toHaveValue("in_stock");
  await stockSelect.selectOption("preorder");
  await expect(stockSelect).toHaveValue("preorder");

  const available = rows.nth(0).getByRole("checkbox", { name: "Disponible para vender" });
  await expect(available).toBeChecked();
  await available.uncheck();
  await expect(available).not.toBeChecked();

  await saveProduct(edit, false);

  await expect
    .poll(
      async () => {
        const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
        const first = persisted?.[0];
        return first === undefined
          ? undefined
          : { stockStatus: first.stockStatus, available: first.available };
      },
      { timeout: 10_000 },
    )
    .toEqual({ stockStatus: "preorder", available: false });
  const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
  expect(persisted).not.toBeNull();
  expect(persisted).toHaveLength(8);
  expect((persisted as PersistedVariant[])[0]).toMatchObject({
    stockStatus: "preorder",
    available: false,
  });

  const reopened = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const reopenedRows = await variantsStep(reopened);
  await expect(reopenedRows.nth(0).getByLabel("Stock")).toHaveValue("preorder");
  await expect(
    reopenedRows.nth(0).getByRole("checkbox", { name: "Disponible para vender" }),
  ).not.toBeChecked();
});

test("A05: reordenar variantes intercambia filas y persiste el orden", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const edit = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  let rows = await variantsStep(edit);
  await expect(rows).toHaveCount(8);

  const nameOf = (row: Locator) => row.getByRole("textbox", { name: "Nombre" });
  await expect(nameOf(rows.nth(0))).toHaveValue("Negro / S");
  await expect(nameOf(rows.nth(1))).toHaveValue("Negro / M");

  // Efecto real: "Bajar" desplaza la fila y el índice del encabezado se ajusta.
  await rows.nth(0).getByRole("button", { name: "Bajar Negro / S" }).click();
  rows = edit.locator(".variant-editor");
  await expect(nameOf(rows.nth(0))).toHaveValue("Negro / M");
  await expect(nameOf(rows.nth(1))).toHaveValue("Negro / S");
  await expect(rows.nth(0).locator("header strong")).toHaveText("Variante 1");
  await expect(rows.nth(1).locator("header strong")).toHaveText("Variante 2");

  // "Subir" en la fila 1 restaura el orden original (tras el primer bajar, la
  // fila 0 es "Negro / M" y su Subir queda deshabilitado: feedback de estado).
  await rows.nth(1).getByRole("button", { name: "Subir Negro / S" }).click();
  rows = edit.locator(".variant-editor");
  await expect(nameOf(rows.nth(0))).toHaveValue("Negro / S");
  await expect(nameOf(rows.nth(1))).toHaveValue("Negro / M");
  await expect(rows.nth(0).getByRole("button", { name: /^Subir (?!imagen)/ })).toBeDisabled();
  await expect(rows.nth(1).getByRole("button", { name: /^Subir (?!imagen)/ })).toBeEnabled();

  // Borde: primera fila no sube y última no baja.
  await expect(rows.nth(0).getByRole("button", { name: /^Subir (?!imagen)/ })).toBeDisabled();
  await expect(rows.nth(7).getByRole("button", { name: /^Bajar/ })).toBeDisabled();

  await rows.nth(0).getByRole("button", { name: "Bajar Negro / S" }).click();
  await saveProduct(edit, false);

  // El número de variantes no cambia: el poll espera el orden editado (el
  // autosave tiene debounce de 550 ms, leer antes devolvería el orden viejo).
  await expect
    .poll(
      async () => {
        const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
        return persisted?.map((variant) => variant.title);
      },
      { timeout: 10_000 },
    )
    .toEqual([
      "Negro / M",
      "Negro / S",
      "Negro / L",
      "Negro / XL",
      "Arena / S",
      "Arena / M",
      "Arena / L",
      "Arena / XL",
    ]);
  const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
  expect(persisted).not.toBeNull();
  const variants = persisted as PersistedVariant[];
  expect(variants).toHaveLength(8);
  expect(variants[0]?.title).toBe("Negro / M");
  expect(variants[1]?.title).toBe("Negro / S");
  expect(variants[0]?.optionValues).toEqual({ Color: "Negro", Talle: "M" });
  expect(variants[1]?.optionValues).toEqual({ Color: "Negro", Talle: "S" });

  const reopened = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const reopenedRows = await variantsStep(reopened);
  await expect(reopenedRows.nth(0).getByRole("textbox", { name: "Nombre" })).toHaveValue(
    "Negro / M",
  );
});

test("A05: precio anterior, GTIN, MPN e imagen de variante persisten", async ({ page }) => {
  test.setTimeout(120_000);
  await openCatalog(page);
  const edit = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const rows = await variantsStep(edit);
  const first = rows.nth(0);

  const compareAt = first.getByRole("spinbutton", { name: "Precio anterior en centavos" });
  await compareAt.fill("-1.5");
  await expect(compareAt).toHaveAttribute("aria-invalid", "true");
  await expect(fieldOf(compareAt).getByTestId("ui-field-error")).toContainText(
    "El precio anterior debe ser un número entero en centavos, mayor o igual a 0.",
  );
  await edit.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(edit).toBeVisible();
  await expect(fieldOf(compareAt).getByTestId("ui-field-error")).toBeVisible();

  await compareAt.fill("5000000");
  await expect(compareAt).not.toHaveAttribute("aria-invalid", "true");
  await expect(compareAt).toHaveValue("5000000");

  const gtin = first.getByRole("textbox", { name: "GTIN" });
  await gtin.fill("07771234567890");
  await expect(gtin).toHaveValue("07771234567890");

  const mpn = first.getByRole("textbox", { name: "MPN" });
  await mpn.fill("MPN-A05-01");
  await expect(mpn).toHaveValue("MPN-A05-01");

  const imageSelect = first.getByLabel("Imagen de variante");
  await expect(imageSelect).not.toHaveValue("");
  await imageSelect.selectOption({ value: "" });
  await expect(imageSelect).toHaveValue("");

  await saveProduct(edit, false);

  // El número de variantes no cambia: el poll espera los valores editados (el
  // autosave tiene debounce de 550 ms, leer antes devolvería el snapshot viejo).
  await expect
    .poll(
      async () => {
        const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
        const first = persisted?.[0];
        if (first === undefined) return undefined;
        return {
          compareAtPrice: first.compareAtPrice,
          gtin: first.gtin,
          mpn: first.mpn,
          imageId: first.imageId,
        };
      },
      { timeout: 10_000 },
    )
    .toEqual({
      compareAtPrice: 5000000,
      gtin: "07771234567890",
      mpn: "MPN-A05-01",
      imageId: undefined,
    });
  const persisted = await readPersistedVariants(page, DEMO_VARIANTS_TITLE);
  expect(persisted).not.toBeNull();
  expect(persisted).toHaveLength(8);
  expect((persisted as PersistedVariant[])[0]).toMatchObject({
    compareAtPrice: 5000000,
    gtin: "07771234567890",
    mpn: "MPN-A05-01",
  });
  expect((persisted as PersistedVariant[])[0]?.imageId).toBeUndefined();

  const reopened = await openEditDialog(page, DEMO_VARIANTS_TITLE);
  const reopenedRows = await variantsStep(reopened);
  const reopenedFirst = reopenedRows.nth(0);
  await expect(
    reopenedFirst.getByRole("spinbutton", { name: "Precio anterior en centavos" }),
  ).toHaveValue("5000000");
  await expect(reopenedFirst.getByRole("textbox", { name: "GTIN" })).toHaveValue("07771234567890");
  await expect(reopenedFirst.getByRole("textbox", { name: "MPN" })).toHaveValue("MPN-A05-01");
  await expect(reopenedFirst.getByLabel("Imagen de variante")).toHaveValue("");
});
