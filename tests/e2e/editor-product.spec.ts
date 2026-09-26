import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
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

async function openProductEditor(page: Page): Promise<Locator> {
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
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Fieldset del Field que envuelve un control nativo (patrón de Ui.tsx). */
function fieldOf(input: Locator): Locator {
  return input.locator("xpath=ancestor::fieldset[contains(@class, 'field')]");
}

test("el editor de producto ofrece subir una imagen nueva", async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openProductEditor(page);
  await expect(dialog.getByRole("button", { name: "Subir imagen nueva" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("valida slug duplicado, precio inválido y opciones repetidas con errores inline", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const dialog = await openProductEditor(page);

  const titleInput = dialog.getByRole("textbox", { name: "Título" });
  const slugInput = dialog.getByRole("textbox", { name: "Slug" });
  const slugField = fieldOf(slugInput);

  const existingTitle = await page
    .locator('tbody input[aria-label^="Nombre de "]')
    .first()
    .inputValue();
  await titleInput.fill(existingTitle);
  await expect(slugInput).not.toHaveValue("");
  await expect(slugInput).toHaveAttribute("aria-invalid", "true");
  await expect(slugField.getByTestId("ui-field-error")).toContainText(
    "Ya existe otro producto con este slug.",
  );

  await slugInput.fill("e2e-slug-disponible");
  await expect(slugInput).not.toHaveAttribute("aria-invalid", "true");
  await expect(slugField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(slugField.getByText("Disponible", { exact: true })).toBeVisible();

  const priceInput = dialog.getByRole("spinbutton", { name: "Precio en centavos" });
  const priceField = fieldOf(priceInput);
  await priceInput.fill("12.5");
  await expect(priceInput).toHaveAttribute("aria-invalid", "true");
  await expect(priceField.getByTestId("ui-field-error")).toContainText("entero en centavos");

  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeVisible();
  await expect(slugField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(priceField.getByTestId("ui-field-error")).toHaveCount(1);

  const optionsInput = dialog.getByRole("textbox", { name: "Opciones" });
  const optionsField = fieldOf(optionsInput);
  await optionsInput.fill("Color=Azul, Color=Rojo");
  await expect(optionsField.getByTestId("ui-field-error")).toContainText("está repetida");

  await optionsInput.fill("Color=Azul");
  await expect(optionsField.getByTestId("ui-field-error")).toHaveCount(0);

  await priceInput.fill("12500");
  await expect(priceField.getByTestId("ui-field-error")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeHidden();
});

test("duplica, reordena y elimina variantes sin bajar del mínimo", async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openProductEditor(page);
  await dialog.getByRole("textbox", { name: "Título" }).fill("Set Mate");

  await dialog.getByRole("button", { name: "Agregar variante" }).click();
  let variants = dialog.locator(".variant-editor");
  await expect(variants).toHaveCount(2);
  await variants.nth(1).getByRole("textbox", { name: "Nombre" }).fill("Arena");

  await variants.nth(1).getByRole("button", { name: "Duplicar Arena" }).click();
  variants = dialog.locator(".variant-editor");
  await expect(variants).toHaveCount(3);
  await expect(variants.nth(2).getByRole("textbox", { name: "Nombre" })).toHaveValue("Arena copia");

  await variants.nth(2).getByRole("button", { name: "Subir Arena copia" }).click();
  await variants.nth(1).getByRole("button", { name: "Subir Arena copia" }).click();
  variants = dialog.locator(".variant-editor");
  await expect(variants.nth(0).getByRole("textbox", { name: "Nombre" })).toHaveValue("Arena copia");

  await variants.nth(0).getByRole("button", { name: "Eliminar Arena copia" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Eliminar variante" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(variants).toHaveCount(3);
  await variants.nth(0).getByRole("button", { name: "Eliminar Arena copia" }).click();
  await deleteDialog.getByRole("button", { name: "Eliminar variante", exact: true }).click();
  variants = dialog.locator(".variant-editor");
  await expect(variants).toHaveCount(2);

  await variants.nth(0).getByRole("button", { name: "Eliminar Única" }).click();
  await page
    .getByRole("dialog", { name: "Eliminar variante" })
    .getByRole("button", { name: "Eliminar variante", exact: true })
    .click();
  variants = dialog.locator(".variant-editor");
  await expect(variants).toHaveCount(1);
  await expect(variants.nth(0).getByRole("button", { name: "Eliminar Arena" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeHidden();
});

test("la mini-preview refleja en vivo título, precio mínimo y estado", async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openProductEditor(page);
  await expect(dialog.getByRole("button", { name: "Subir imagen nueva" })).toBeVisible();
  const preview = dialog.getByTestId("ui-product-mini-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Nuevo producto");

  await dialog.getByRole("textbox", { name: "Título" }).fill("Vaso Cerámico");
  await dialog.getByLabel("Estado").selectOption("archived");
  await expect(preview).toContainText("Vaso Cerámico");
  await expect(preview).toContainText("Archivado");

  await dialog.getByRole("button", { name: "Variantes", exact: true }).click();
  await expect(preview).toContainText("Desde $0");

  await dialog.getByRole("spinbutton", { name: "Precio en centavos" }).fill("15000");
  await dialog.getByRole("button", { name: "Agregar variante" }).click();
  const variants = dialog.locator(".variant-editor");
  await variants.nth(1).getByRole("spinbutton", { name: "Precio en centavos" }).fill("12000");
  await expect(preview).toContainText("Desde $12.000");

  await dialog.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(dialog).toBeHidden();
});

test("avisa al salir con cambios sin guardar y cierra directo en modo limpio", async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openProductEditor(page);

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  const dirtyDialog = page.locator("dialog.product-dialog");
  await expect(dirtyDialog).toBeVisible();
  await dirtyDialog.getByRole("textbox", { name: "Título" }).fill("Cambio sin guardar");

  // T4.12: la salida con cambios pasa por el diálogo unificado (ya no hay
  // window.confirm nativo); confirmar cierra el editor.
  await dirtyDialog.getByRole("button", { name: "Cancelar" }).click();
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("cambios sin guardar");
  await confirm.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(dirtyDialog).toBeHidden();

  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  const escapeDialog = page.locator("dialog.product-dialog");
  await expect(escapeDialog).toBeVisible();
  await escapeDialog.getByRole("textbox", { name: "Título" }).fill("Escape con cambios");

  // Escape abre el diálogo unificado; Escape de nuevo lo cancela y conserva el
  // editor abierto; una confirmación explícita cierra el editor.
  await escapeDialog.press("Escape");
  const escapeConfirm = page.getByTestId("ui-confirm-dialog");
  await expect(escapeConfirm).toBeVisible();
  await escapeConfirm.press("Escape");
  await expect(escapeConfirm).toBeHidden();
  await expect(escapeDialog).toBeVisible();

  await escapeDialog.press("Escape");
  await expect(page.getByTestId("ui-confirm-dialog")).toBeVisible();
  await page
    .getByTestId("ui-confirm-dialog")
    .getByRole("button", { name: "Salir sin guardar" })
    .click();
  await expect(escapeDialog).toBeHidden();
});

test("navega entre pasos con flechas, Home y End manteniendo el foco", async ({ page }) => {
  test.setTimeout(60_000);
  const dialog = await openProductEditor(page);

  await dialog.getByRole("button", { name: "Datos", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  const imagenes = dialog.getByRole("button", { name: "Imágenes", exact: true });
  await expect(imagenes).toHaveAttribute("aria-current", "step");
  await expect(imagenes).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const variantes = dialog.getByRole("button", { name: "Variantes", exact: true });
  await expect(variantes).toHaveAttribute("aria-current", "step");

  await page.keyboard.press("ArrowLeft");
  const organizacion = dialog.getByRole("button", { name: "Organización", exact: true });
  await expect(organizacion).toHaveAttribute("aria-current", "step");

  await page.keyboard.press("Home");
  const datos = dialog.getByRole("button", { name: "Datos", exact: true });
  await expect(datos).toHaveAttribute("aria-current", "step");

  await page.keyboard.press("End");
  await expect(variantes).toHaveAttribute("aria-current", "step");
});
