import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 60_000 : 30_000);

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

async function openBuilder(page: Page) {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await createCleanStore(page, "Tienda builder");
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  const unlock = page.getByRole("button", { name: "Desbloquear", exact: true });
  if (await unlock.count()) await unlock.click();
}

async function confirmSectionDeletion(page: Page, section: Locator) {
  await section.getByRole("button", { name: "Eliminar sección" }).click();
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-describedby", /.+/);
  await expect(dialog.locator(".confirm-dialog__body")).toContainText("deshacerlo");
  await dialog.getByRole("button", { name: "Eliminar sección", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("edita el hero moderno, actualiza el preview y persiste tras recargar", async ({ page }) => {
  await openBuilder(page);
  const hero = page.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  await hero.getByRole("button").first().click();

  const title = page
    .getByRole("complementary", { name: "Inspector de sección" })
    .getByRole("textbox", { name: "Título", exact: true })
    .first();
  await title.fill("Una portada persistente");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  await expect(
    page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"] h1'),
  ).toHaveText("Una portada persistente", { timeout: 15_000 });
  await expect(page.getByText(/^Guardado/, { exact: false })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await page.getByRole("button", { name: /Tienda builder/ }).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor" }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Hero de catálogo" })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Inspector de sección" })
      .getByRole("textbox", { name: "Título", exact: true })
      .first(),
  ).toHaveValue("Una portada persistente");
  await expect(
    page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"] h1'),
  ).toHaveText("Una portada persistente", { timeout: 15_000 });
});

test("edita slides modernos con el inspector generado por metadata", async ({ page }) => {
  await openBuilder(page);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Hero de catálogo" })
    .getByRole("button")
    .first()
    .click();

  const slides = page.getByRole("group", { name: "Slides" });
  const addItem = slides.getByRole("button", { name: "Agregar elemento" });
  await addItem.click();
  await addItem.click();
  await expect(slides.locator(".repeater-editor__item")).toHaveCount(2);
  await expect(
    slides.locator(".repeater-editor__item").nth(0).getByRole("button", { name: "Bajar elemento" }),
  ).toHaveAttribute("aria-description", "Slides 1 de 2");
  await expect(
    slides
      .locator(".repeater-editor__item")
      .nth(1)
      .getByRole("button", { name: "Eliminar elemento" }),
  ).toHaveAttribute("aria-description", "Slides 2 de 2");
  await slides.locator(".repeater-editor__item").nth(0).getByRole("textbox").nth(0).fill("Primero");
  await slides.locator(".repeater-editor__item").nth(1).getByRole("textbox").nth(0).fill("Segundo");
  await slides
    .locator(".repeater-editor__item")
    .nth(0)
    .getByRole("button", { name: "Bajar elemento" })
    .click();
  await expect(
    slides.locator(".repeater-editor__item").nth(0).getByRole("textbox").nth(0),
  ).toHaveValue("Segundo");
  await slides
    .locator(".repeater-editor__item")
    .nth(0)
    .getByRole("button", { name: "Eliminar elemento" })
    .click();
  const repeaterDialog = page.getByTestId("ui-confirm-dialog");
  await expect(repeaterDialog).toBeVisible();
  await expect(repeaterDialog.locator(".confirm-dialog__body")).toContainText("Segundo");
  await repeaterDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(slides.locator(".repeater-editor__item")).toHaveCount(2);
  await slides
    .locator(".repeater-editor__item")
    .nth(0)
    .getByRole("button", { name: "Eliminar elemento" })
    .click();
  await page
    .getByTestId("ui-confirm-dialog")
    .getByRole("button", { name: "Eliminar elemento", exact: true })
    .click();
  await expect(slides.locator(".repeater-editor__item")).toHaveCount(1);
});

test("los repetidores completan duplicado, límites, error asociado y foco tras borrar", async ({
  page,
}) => {
  await openBuilder(page);
  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  await page
    .getByTestId("ui-module-picker")
    .getByRole("button", { name: /Testimonios/ })
    .click();

  const repeater = page.getByRole("group", { name: "Testimonios" });
  const items = repeater.locator(".repeater-editor__item");
  const addItem = repeater.getByRole("button", { name: "Agregar elemento" });
  await addItem.click();
  await addItem.click();
  await expect(items).toHaveCount(2);

  await items.nth(0).getByRole("textbox", { name: "Nombre" }).fill("Primero");
  await items.nth(0).getByRole("button", { name: "Duplicar elemento" }).click();
  await expect(items).toHaveCount(3);
  await expect(items.nth(1).getByRole("textbox", { name: "Nombre" })).toHaveValue("Primero");
  await items.nth(1).getByRole("textbox", { name: "Nombre" }).fill("Duplicado");
  await expect(items.nth(0).getByRole("textbox", { name: "Nombre" })).toHaveValue("Primero");

  for (let index = 3; index < 12; index += 1) await addItem.click();
  await expect(items).toHaveCount(12);
  await expect(addItem).toBeDisabled();
  await expect(items.nth(0).getByRole("button", { name: "Duplicar elemento" })).toBeDisabled();

  const firstDelete = items.nth(0).getByRole("button", { name: "Eliminar elemento" });
  await firstDelete.click();
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(firstDelete).toBeFocused();
  await firstDelete.click();
  await dialog.getByRole("button", { name: "Eliminar elemento", exact: true }).click();
  await expect(items).toHaveCount(11);
  await expect(items.nth(0).getByRole("button", { name: "Eliminar elemento" })).toBeFocused();

  const firstName = items.nth(0).getByRole("textbox", { name: "Nombre" });
  await firstName.fill("");
  await expect(repeater).toHaveAttribute("aria-invalid", "true");
  const itemField = items.nth(0).getByRole("group", { name: "Nombre" });
  const fieldError = itemField.getByTestId("ui-field-error");
  await expect(fieldError).toBeVisible();
  await expect(firstName).toHaveAttribute("aria-invalid", "true");
  const fieldDescribedBy = await firstName.getAttribute("aria-describedby");
  expect(fieldDescribedBy).toContain(await fieldError.getAttribute("id"));
  const groupDescribedBy = await repeater.getAttribute("aria-describedby");
  expect(groupDescribedBy).toMatch(/\S+/);
  await expect(repeater.locator(`[id="${groupDescribedBy}"]`)).toBeVisible();
  await firstName.fill("Corregido");
  await expect(itemField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(repeater.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(repeater).not.toHaveAttribute("aria-invalid");
});

test("agrega, ordena, duplica, oculta, deshace y elimina secciones modernas", async ({ page }) => {
  test.setTimeout(60_000);
  await openBuilder(page);
  const sections = page.getByRole("list", { name: "Secciones de la tienda" });
  const initialCount = await sections.getByRole("listitem").count();
  const initialBrandCount = await sections
    .getByRole("listitem")
    .filter({ hasText: "Franja de marcas" })
    .count();

  await page.getByLabel("Tipo de sección").selectOption("content");
  await page.getByRole("button", { name: "Agregar sección" }).click();
  const picker = page.getByTestId("ui-module-picker");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: /Franja de marcas/ }).click();
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: "Volver a Constructor" }).click();
  await expect(sections.getByRole("listitem")).toHaveCount(initialCount + 1);
  const added = sections.getByRole("listitem").last();
  await expect(added).toContainText("Franja de marcas");
  await added.getByRole("button", { name: "Mover arriba" }).click();

  const selectedAdded = sections
    .getByRole("listitem")
    .filter({ hasText: "Franja de marcas" })
    .last();
  await selectedAdded.getByRole("button", { name: "Duplicar sección" }).click();
  await page.getByRole("button", { name: "Volver a Constructor" }).click();
  await expect(sections.getByRole("listitem").filter({ hasText: "Franja de marcas" })).toHaveCount(
    initialBrandCount + 2,
  );
  const duplicate = sections.getByRole("listitem").filter({ hasText: "Franja de marcas" }).last();
  const duplicateDelete = duplicate.getByRole("button", { name: "Eliminar sección" });
  await duplicateDelete.click();
  const confirmation = page.getByTestId("ui-confirm-dialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator(".confirm-dialog__body")).toContainText("Franja de marcas");
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(duplicateDelete).toBeFocused();
  await confirmSectionDeletion(page, duplicate);
  await expect(sections.getByRole("listitem").filter({ hasText: "Franja de marcas" })).toHaveCount(
    initialBrandCount + 1,
  );

  const hero = sections.getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  const heroTitle = page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"] h1');
  const initialHeroTitle = await heroTitle.textContent();
  expect(initialHeroTitle).toMatch(/\S+/);
  await hero.getByRole("button", { name: "Ocultar sección" }).click();
  await expect(
    page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"]'),
  ).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(heroTitle).toHaveText(initialHeroTitle ?? "", { timeout: 15_000 });
  await page.getByRole("button", { name: "Rehacer" }).click();
  await expect(
    page.frameLocator("iframe").locator('[data-solara-module="catalog-hero"]'),
  ).toHaveCount(0, { timeout: 15_000 });

  await confirmSectionDeletion(
    page,
    sections.getByRole("listitem").filter({ hasText: "Franja de marcas" }).last(),
  );
  await expect(sections.getByRole("listitem")).toHaveCount(initialCount);
});
