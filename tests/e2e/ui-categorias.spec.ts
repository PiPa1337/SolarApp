/**
 * Regresión de los controles del árbol de categorías (H4): expandir/colapsar,
 * reubicar válido y los destinos bloqueados (raíz con hijos no puede ser hija
 * de otra raíz — fix de la ronda de crashs).
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
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

async function openCatalog(page: Page) {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Categorías ordenadas" })).toBeVisible();
}

test("el árbol de categorías colapsa y expande raíces", async ({ page }) => {
  await openCatalog(page);

  // Por defecto las raíces con hijos están expandidas (botón "Contraer").
  const collapse = page.getByRole("button", { name: /^Contraer / }).first();
  await expect(collapse).toBeVisible();
  const title = (await collapse.getAttribute("aria-label"))?.replace(/^Contraer /, "") ?? "";
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();

  const expandAgain = page.getByRole("button", { name: `Expandir ${title}` });
  await expect(expandAgain).toBeVisible();
  await expect(expandAgain).toHaveAttribute("aria-expanded", "false");
  await expandAgain.focus();
  await expect(expandAgain).toBeFocused();
  await page.keyboard.press("Enter");

  const collapseAgain = page.getByRole("button", { name: `Contraer ${title}` });
  await expect(collapseAgain).toBeVisible();
  await expect(collapseAgain).toHaveAttribute("aria-expanded", "true");
  await collapseAgain.focus();
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: `Expandir ${title}` })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("reubicar una categoría hoja cambia su padre y se confirma", async ({ page }) => {
  await openCatalog(page);

  const moveSelect = page.getByLabel("Categoría a reubicar");
  const parentSelect = page.getByLabel("Nuevo padre");
  const moveButton = page.getByRole("button", { name: "Reubicar categoría" });
  const options = moveSelect.locator("option");

  // Buscar la primera categoría sin hijos (botón habilitado = hoja).
  let moved = false;
  for (let index = 1; index < (await options.count()); index += 1) {
    await moveSelect.selectOption({ index });
    if (await moveButton.isEnabled()) {
      moved = true;
      break;
    }
  }
  expect(moved).toBe(true);

  await expect(parentSelect).toBeEnabled();
  await parentSelect.selectOption({ index: 0 }); // "Sin padre (raíz)"
  await moveButton.click();
  await expect(page.getByRole("dialog", { name: "Reubicar categoría" })).toBeVisible();
  await page.getByRole("button", { name: "Reubicar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Reubicar categoría" })).toBeHidden();
});

test("cancelar la reubicación conserva selección, foco y descripción del diálogo", async ({
  page,
}) => {
  await openCatalog(page);

  const moveSelect = page.getByLabel("Categoría a reubicar");
  const parentSelect = page.getByLabel("Nuevo padre");
  const moveButton = page.getByRole("button", { name: "Reubicar categoría" });
  const options = moveSelect.locator("option");

  let moved = false;
  for (let index = 1; index < (await options.count()); index += 1) {
    await moveSelect.selectOption({ index });
    if (await moveButton.isEnabled()) {
      moved = true;
      break;
    }
  }
  expect(moved).toBe(true);

  const selectedCategory = await moveSelect.inputValue();
  await parentSelect.selectOption({ index: 0 });
  await moveButton.click();

  const dialog = page.getByRole("dialog", { name: "Reubicar categoría" });
  await expect(dialog).toBeVisible();
  const descriptionId = await dialog.getAttribute("aria-describedby");
  expect(descriptionId).toMatch(/\S+/);
  await expect(dialog.locator(".confirm-dialog__body")).toHaveAttribute(
    "id",
    descriptionId ?? "missing-description",
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(moveButton).toBeFocused();
  await expect(moveSelect).toHaveValue(selectedCategory);
  await expect(parentSelect).toHaveValue("");
});

test("una raíz con hijos no puede reubicarse bajo otra raíz (bloqueo)", async ({ page }) => {
  await openCatalog(page);

  const moveSelect = page.getByLabel("Categoría a reubicar");
  const parentSelect = page.getByLabel("Nuevo padre");
  const moveButton = page.getByRole("button", { name: "Reubicar categoría" });
  const options = moveSelect.locator("option");

  // Buscar la primera categoría CON hijos (botón deshabilitado).
  let blocked = false;
  for (let index = 1; index < (await options.count()); index += 1) {
    await moveSelect.selectOption({ index });
    if (!(await moveButton.isEnabled())) {
      blocked = true;
      break;
    }
  }
  expect(blocked).toBe(true);

  // El selector de padre está habilitado pero TODAS sus opciones raíz están
  // deshabilitadas (debe permanecer como raíz).
  await expect(parentSelect).toBeEnabled();
  const blockedOptions = await parentSelect.locator("option:disabled").count();
  expect(blockedOptions).toBeGreaterThan(0);
  await expect(moveButton).toBeDisabled();
});
