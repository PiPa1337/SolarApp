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
