import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

/**
 * Barrido A23: DashboardToolbar (búsqueda, estado, orden, vista) y
 * DuplicateDialog (prefill, confirmar, cancelar, Escape) con el contrato de
 * 3 capas: efecto real, auto-feedback y contrato de datos.
 */

let studioServer: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const studio = await startStudioServer();
  studioServer = studio.server;
  studioUrl = studio.url;
});

test.afterAll(async () => {
  await stopStudioServer(studioServer);
});

test.setTimeout(120_000);

async function openDashboard(page: Page) {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
}

async function selectStore(page: Page, name: string) {
  const card = page.locator(".dashboard-store-card").filter({ hasText: name }).first();
  await card.locator(".dashboard-store-card__button").click();
  return page.getByRole("region", { name: `Tienda seleccionada: ${name}` });
}

async function openDuplicateDialog(page: Page) {
  const detail = await selectStore(page, "Predeterminado");
  await detail.getByRole("button", { name: "Duplicar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(dialog).toBeVisible();
  return { detail, dialog };
}

const storeCount = (page: Page) => page.locator(".dashboard-cosmic-count");
const firstCardName = (page: Page) =>
  page.locator(".dashboard-store-card").first().locator(".dashboard-store-card__button strong");

test("la búsqueda filtra tarjetas, actualiza el contador y limpiar devuelve el foco al campo", async ({
  page,
}) => {
  await openDashboard(page);
  const search = page.getByRole("searchbox", { name: "Buscar tienda" });
  const clear = page.getByRole("button", { name: "Limpiar búsqueda" });

  await expect(storeCount(page)).toHaveText("1 visibles");
  await expect(clear).toHaveCount(0);

  await search.fill("inexistente");
  await expect(storeCount(page)).toHaveText("0 visibles");
  await expect(page.getByTestId("ui-empty-state")).toContainText("No hay coincidencias");
  await expect(clear).toBeVisible();

  await clear.click();
  await expect(storeCount(page)).toHaveText("1 visibles");
  await expect(search).toHaveValue("");
  await expect(clear).toHaveCount(0);
  await expect(search).toBeFocused();

  await search.fill("Predeterminado");
  await expect(storeCount(page)).toHaveText("1 visibles");
  await expect(
    page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }),
  ).toHaveCount(1);
  await expect(clear).toBeVisible();
});

test("el filtro de estado aplica a archivadas, activas y todas con feedback en el contador", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta copia");
  const status = page.locator(".dashboard-cosmic-toolbar").getByRole("combobox").nth(0);

  await status.selectOption("archived");
  await expect(storeCount(page)).toHaveText("0 visibles");
  await expect(page.getByTestId("ui-empty-state")).toBeVisible();

  await status.selectOption("all");
  await expect(storeCount(page)).toHaveText("2 visibles");

  await status.selectOption("active");
  await expect(storeCount(page)).toHaveText("2 visibles");

  const detail = await selectStore(page, "Zeta copia");
  await detail.getByRole("button", { name: "Archivar" }).click();
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(storeCount(page)).toHaveText("1 visibles");

  await status.selectOption("archived");
  await expect(storeCount(page)).toHaveText("1 visibles");
  const archivedCard = page.locator(".dashboard-store-card").filter({ hasText: "Zeta copia" });
  await expect(archivedCard).toBeVisible();
  await expect(archivedCard.locator(".dashboard-store-card__status")).toHaveText("Archivada");

  await status.selectOption("active");
  await expect(storeCount(page)).toHaveText("1 visibles");
  await expect(
    page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }),
  ).toHaveCount(1);

  await status.selectOption("all");
  await expect(storeCount(page)).toHaveText("2 visibles");
});

test("el orden cambia el primer proyecto y persiste en localStorage tras recargar", async ({
  page,
}) => {
  await openDashboard(page);
  await duplicateAs(page, "Zeta copia");
  const sort = page.locator(".dashboard-cosmic-toolbar").getByRole("combobox").nth(1);

  await sort.selectOption("name");
  await expect(sort).toHaveValue("name");
  await expect(firstCardName(page)).toHaveText("Predeterminado");

  await sort.selectOption("updated");
  await expect(firstCardName(page)).toHaveText("Zeta copia");

  await sort.selectOption("products");
  await expect(firstCardName(page)).toHaveText("Predeterminado");
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-sort"))).toBe(
    "products",
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await expect(sort).toHaveValue("products");
  await expect(firstCardName(page)).toHaveText("Predeterminado");
});

test("la vista alterna grilla/lista con estado presionado y persiste tras recargar", async ({
  page,
}) => {
  await openDashboard(page);
  const gridButton = page.getByRole("button", { name: "Vista en grilla" });
  const listButton = page.getByRole("button", { name: "Vista en lista" });
  const results = page.locator(".dashboard-cosmic-results");

  await expect(gridButton).toHaveAttribute("aria-pressed", "true");
  await expect(listButton).toHaveAttribute("aria-pressed", "false");
  await expect(results).toHaveClass(/dashboard-cosmic-results--grid/);

  await listButton.click();
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(gridButton).toHaveAttribute("aria-pressed", "false");
  await expect(results).toHaveClass(/dashboard-cosmic-results--list/);
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-view"))).toBe(
    "list",
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await expect(listButton).toHaveAttribute("aria-pressed", "true");
  await expect(results).toHaveClass(/dashboard-cosmic-results--list/);

  await gridButton.click();
  await expect(gridButton).toHaveAttribute("aria-pressed", "true");
  await expect(results).toHaveClass(/dashboard-cosmic-results--grid/);
});

test("el diálogo precarga el nombre sugerido, enfoca el campo y confirma con Enter", async ({
  page,
}) => {
  await openDashboard(page);
  const { dialog } = await openDuplicateDialog(page);
  const nameInput = page.getByTestId("ui-duplicate-name");
  const originalButton = page
    .locator(".dashboard-store-card")
    .filter({ hasText: "Predeterminado" })
    .first()
    .locator(".dashboard-store-card__button");

  await expect(nameInput).toHaveAttribute("aria-labelledby", /.+/);
  await expect(nameInput).toHaveValue("Predeterminado (copia)");
  await expect(nameInput).toBeFocused();
  const originalId = await originalButton.getAttribute("data-store-card-id");
  expect(originalId).toMatch(/\S+/);

  await nameInput.fill("Copia Enter");
  await nameInput.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(storeCount(page)).toHaveText("2 visibles");
  const copyCard = page.locator(".dashboard-store-card").filter({ hasText: "Copia Enter" });
  await expect(copyCard).toBeVisible();
  await expect(copyCard.locator(".dashboard-store-card__button")).not.toHaveAttribute(
    "data-store-card-id",
    originalId ?? "",
  );
  await expect(page.getByTestId("ui-toast")).toContainText("Tienda duplicada.");
});

test("Escape cierra el diálogo sin duplicar y devuelve el foco al botón que lo abrió", async ({
  page,
}) => {
  await openDashboard(page);
  const { detail, dialog } = await openDuplicateDialog(page);
  const duplicateButton = detail.getByRole("button", { name: "Duplicar", exact: true });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(storeCount(page)).toHaveText("1 visibles");
  await expect(duplicateButton).toBeFocused();

  await duplicateButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(storeCount(page)).toHaveText("1 visibles");
  await expect(duplicateButton).toBeFocused();
});

test("Cancelar y la X cierran el diálogo con foco restaurado y nombre sugerido fresco", async ({
  page,
}) => {
  await openDashboard(page);
  const { detail, dialog } = await openDuplicateDialog(page);
  const duplicateButton = detail.getByRole("button", { name: "Duplicar", exact: true });
  const nameInput = page.getByTestId("ui-duplicate-name");

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(duplicateButton).toBeFocused();

  await duplicateButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar duplicado" }).click();
  await expect(dialog).toBeHidden();
  await expect(duplicateButton).toBeFocused();

  await duplicateButton.click();
  await expect(dialog).toBeVisible();
  await expect(nameInput).toHaveValue("Predeterminado (copia)");
  await page.keyboard.press("Escape");
  await expect(duplicateButton).toBeFocused();
});

test("el nombre vacío usa el sugerido y el campo limita a 60 caracteres", async ({ page }) => {
  await openDashboard(page);
  const { dialog } = await openDuplicateDialog(page);
  const nameInput = page.getByTestId("ui-duplicate-name");

  await expect(nameInput).toHaveAttribute("maxlength", "60");

  await nameInput.fill("");
  await dialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(storeCount(page)).toHaveText("2 visibles");
  await expect(
    page.locator(".dashboard-store-card").getByText("Predeterminado (copia)"),
  ).toBeVisible();

  await page
    .locator(".dashboard-store-card")
    .filter({ hasText: "Predeterminado (copia)" })
    .first()
    .locator(".dashboard-store-card__button")
    .click();
  await page
    .getByRole("region", { name: "Tienda seleccionada: Predeterminado (copia)" })
    .getByRole("button", { name: "Duplicar", exact: true })
    .click();
  await expect(page.getByTestId("ui-duplicate-name")).toHaveValue("Predeterminado (copia) (copia)");
  await page
    .getByRole("dialog", { name: "Duplicar tienda" })
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
});

async function duplicateAs(page: Page, name: string) {
  const { dialog } = await openDuplicateDialog(page);
  await page.getByTestId("ui-duplicate-name").fill(name);
  await dialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(storeCount(page)).toHaveText("2 visibles");
}
