import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { openStudioDashboard } from "./studio-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

/**
 * T2.6-T2.9 — Acciones del dashboard: archivar con deshacer, duplicar con
 * diálogo y progreso, comparación de dos tiendas y respaldo masivo.
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

async function openDemoDetail(page: Page) {
  await openStudioDashboard(page, studioUrl);
  const card = page.locator(".dashboard-store-card").filter({ hasText: "Predeterminado" }).first();
  await card.locator(".dashboard-store-card__button").click();
  return page.getByRole("region", { name: "Tienda seleccionada: Predeterminado" });
}

async function openMutableDetail(page: Page) {
  const baseDetail = await openDemoDetail(page);
  await baseDetail.getByRole("button", { name: "Duplicar", exact: true }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(duplicateDialog).toBeVisible();
  await duplicateDialog.getByTestId("ui-duplicate-name").fill("Tienda archivable QA");
  await duplicateDialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(duplicateDialog).toBeHidden();
  await page
    .locator(".dashboard-store-card")
    .filter({ hasText: "Tienda archivable QA" })
    .first()
    .locator(".dashboard-store-card__button")
    .click();
  return page.getByRole("region", { name: "Tienda seleccionada: Tienda archivable QA" });
}

test("archivar confirma, muestra deshacer y restaura la tienda", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const detail = await openMutableDetail(page);

  // T4.12: el archivo de tienda confirma con el diálogo unificado (ya no hay
  // window.confirm nativo).
  await detail.getByRole("button", { name: "Archivar" }).click();
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(confirm).toBeHidden();
  // Predeterminado permanece protegido; la copia mutable archivada deja una
  // tienda activa visible.
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("1 visibles");

  const toast = page.getByTestId("ui-toast").filter({ hasText: "archivada" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Deshacer");
  await toast.getByRole("button", { name: "Deshacer" }).click();

  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");
  // A12: restaurar confirma con un toast propio (asimetría con archivar resuelta).
  await expect(page.getByTestId("ui-toast").filter({ hasText: "restaurada" })).toContainText(
    "restaurada",
  );
  await expect(
    page
      .locator(".dashboard-store-card")
      .filter({ hasText: "Tienda archivable QA" })
      .first()
      .locator(".dashboard-store-card__status"),
  ).toHaveCount(0);
});

test("eliminar abre el diálogo de seguridad con espera de 30 segundos", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const detail = await openMutableDetail(page);

  await detail.getByRole("button", { name: "Eliminar tienda" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminar tienda" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Cuidado, estás por borrar la tienda");
  await expect(dialog).toContainText("Tienda archivable QA");
  // La espera de seguridad bloquea la doble confirmación secuencial.
  await expect(dialog).toContainText("Podrás confirmar en");
  await expect(dialog.getByRole("button", { name: "Entiendo el riesgo" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Eliminar definitivamente" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  // Cancelar no borra: la tienda sigue visible.
  await expect(
    page.locator(".dashboard-store-card").filter({ hasText: "Tienda archivable QA" }).first(),
  ).toBeVisible();
});

test("eliminar confirma dos veces y quita la tienda del dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const detail = await openMutableDetail(page);
  await page.clock.install();

  await detail.getByRole("button", { name: "Eliminar tienda" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminar tienda" });
  await page.clock.runFor(30_000);
  await dialog.getByRole("button", { name: "Entiendo el riesgo" }).click();
  await expect(dialog.getByRole("button", { name: "Riesgo aceptado" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Eliminar definitivamente" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.locator(".dashboard-store-card").filter({ hasText: "Tienda archivable QA" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("ui-toast").filter({ hasText: "eliminada" })).toBeVisible();
});

test("duplicar pasa por el diálogo y aplica el nombre elegido", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const detail = await openDemoDetail(page);

  await detail.getByRole("button", { name: "Duplicar" }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(dialog).toBeVisible();
  const descriptionId = await dialog.getAttribute("aria-describedby");
  expect(descriptionId).toMatch(/\S+/);
  await expect(dialog.locator(".dashboard-cosmic-dialog__summary")).toHaveAttribute(
    "id",
    descriptionId ?? "missing-description",
  );
  const nameInput = page.getByTestId("ui-duplicate-name");
  await expect(nameInput).toHaveValue("Predeterminado (copia)");

  await nameInput.fill("Copia de prueba");
  await dialog.getByRole("button", { name: "Duplicar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");
  await expect(page.locator(".dashboard-store-card").getByText("Copia de prueba")).toBeVisible();
  await expect(page.getByTestId("ui-toast")).toContainText("Tienda duplicada");
});

test("duplicar falla sin cerrar el diálogo ni anunciar éxito", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: () => {
        throw new Error("UUID no disponible (simulación de fallo)");
      },
    });
  });
  const detail = await openDemoDetail(page);

  await detail.getByRole("button", { name: "Duplicar" }).click();
  const dialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(dialog).toContainText("UUID no disponible");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("ui-toast")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("el modo comparar exige dos tiendas y muestra los diffs de secciones y motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const detail = await openDemoDetail(page);

  // Con una sola tienda demo, el modo comparar necesita una segunda: se
  // duplica Predeterminado y se comparan las dos (idénticas).
  await detail.getByRole("button", { name: "Duplicar" }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "Duplicar tienda" });
  await expect(duplicateDialog).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "Duplicar" }).click();
  await expect(duplicateDialog).toBeHidden();
  await page
    .locator(".dashboard-store-card")
    .first()
    .locator(".dashboard-store-card__button")
    .click();

  const toggle = page.getByRole("button", { name: "Comparar tiendas", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Elegí 2 tiendas para comparar")).toBeVisible();

  const compareAction = page.getByRole("button", { name: "Comparar", exact: true });
  await expect(compareAction).toBeDisabled();

  const checkboxes = page.getByTestId("ui-card-compare");
  await expect(checkboxes).toHaveCount(2);
  await page
    .locator(".dashboard-store-card")
    .filter({ has: page.getByText("Predeterminado", { exact: true }) })
    .getByTestId("ui-card-compare")
    .check();
  await expect(compareAction).toBeDisabled();
  await page
    .locator(".dashboard-store-card")
    .filter({ has: page.getByText("Predeterminado (copia)", { exact: true }) })
    .getByTestId("ui-card-compare")
    .check();
  await expect(compareAction).toBeEnabled();

  await compareAction.click();
  const dialog = page.getByRole("dialog", { name: "Comparar tiendas" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Predeterminado", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("Predeterminado (copia)", { exact: true }).first()).toBeVisible();

  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(compareAction).toBeFocused();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("ui-card-compare")).toHaveCount(0);
});

test("respaldar todo está deshabilitado en modo navegador con un aviso", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudioDashboard(page, studioUrl);

  const bulk = page.getByRole("button", { name: "Respaldar todo" });
  await expect(bulk).toBeDisabled();
  await expect(bulk).toHaveAttribute(
    "title",
    /modo navegador los respaldos se descargan por tienda/i,
  );
});
