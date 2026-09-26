/**
 * ST-B1 + ST-B2 — Crashs del editor evitados por validación en la UI.
 * (a) Reubicar una categoría con hijos bajo otra raíz no llega al core
 * (schema ZodError dentro del updater de setHistory tumbaba la app entera).
 * (b) Un ajuste de precio menor a -100% no llega al core (mismo crash).
 * Ambos escenarios deben mostrar la UI inhabilitada o el error inline y la
 * app debe seguir montada (la barra de estado y los tabs siguen visibles).
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 240_000 : 180_000);

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

async function openDemoStore(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await openMutableScaleStore(page, "Tienda de categorías protegidas");
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
}

test("no permite reubicar una categoría con hijos bajo otra raíz y la app sigue viva", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  const tree = page.getByRole("region", { name: "Árbol de categorías" });
  await expect(tree).toBeVisible();

  const categorySelect = tree.getByRole("combobox", { name: "Categoría a reubicar" });
  await categorySelect.selectOption({ label: "Casa" });

  const parentSelect = tree.getByRole("combobox", { name: "Nuevo padre" });
  await expect(parentSelect).toBeEnabled();
  await expect(parentSelect.locator("option").filter({ hasText: "Cocina" })).toBeDisabled();

  const confirmButton = tree.getByRole("button", { name: "Reubicar categoría" });
  await expect(confirmButton).toBeDisabled();

  await expect(page.getByRole("tab", { name: "Catálogo", exact: true })).toBeVisible();
  await expect(page.getByTestId("ui-status-bar")).toBeVisible();
});

test("no aplica un ajuste porcentual menor a -100% y la app sigue viva", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStore(page);

  await page.getByRole("checkbox", { name: "Seleccionar productos de esta página" }).check();
  const bulk = page.getByRole("region", { name: "Acciones masivas" });
  await expect(bulk).toBeVisible();

  const kindSelect = bulk.getByRole("combobox", { name: "Ajuste" });
  await kindSelect.selectOption("percentage");
  const valueInput = bulk.getByRole("spinbutton", { name: "Valor %" });
  await valueInput.fill("-150");
  await bulk.getByRole("button", { name: "Ajustar precios" }).click();

  await expect(page.getByText(/no puede reducir el precio por debajo de cero/)).toBeVisible();
  await expect(page.getByTestId("ui-status-bar")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Catálogo", exact: true })).toBeVisible();
});
