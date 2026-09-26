/** Atajos de guardado y de undo/redo en el shell del Studio. */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 90_000);

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

async function wipeIndexedDb(page: Page): Promise<void> {
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
}

async function openMutableDemoStore(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await wipeIndexedDb(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await openMutableScaleStore(page, "Tienda shell mutable");
}

/** Selecciona la sección Hero en el Constructor de la tienda demo. */
async function openHeroInspector(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Constructor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Constructor", exact: true })).toBeVisible();
  const hero = page.getByRole("listitem").filter({ hasText: "Hero audiovisual" });
  await hero.getByRole("button").first().click();
  await expect(page.getByRole("textbox", { name: "Título", exact: true })).toBeVisible();
}





test("Ctrl+S fuerza el guardado en modo navegador (H3-B4)", async ({ page }) => {
  await openMutableDemoStore(page);
  await openHeroInspector(page);

  const title = page.getByRole("textbox", { name: "Título", exact: true });
  await title.fill("Cambio para Ctrl+S");
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();

  await page.keyboard.press("Control+s");
  await expect(page.getByText(/^Guardado \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByText("Cambios pendientes", { exact: true })).toHaveCount(0);
});

test("Ctrl+Z deshace un cambio de catálogo y Ctrl+Shift+Z lo rehace (H3-B5)", async ({ page }) => {
  await openMutableDemoStore(page);
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();

  const statusTrigger = page.getByTestId("ui-status-edit-trigger").first();
  const initialLabel = (await statusTrigger.textContent())?.trim() ?? "";
  expect(initialLabel).not.toBe("");

  await statusTrigger.click();
  const statusSelect = page.getByTestId("ui-status-edit").first();
  const other = initialLabel === "Activo" ? "hidden" : "active";
  await statusSelect.selectOption(other);
  await expect(page.getByText("Cambios pendientes", { exact: true })).toBeVisible();
  await expect(statusTrigger).toContainText(initialLabel === "Activo" ? "Oculto" : "Activo");

  await page.keyboard.press("Control+z");
  await expect(statusTrigger).toContainText(initialLabel);

  await page.keyboard.press("Control+Shift+z");
  await expect(statusTrigger).toContainText(initialLabel === "Activo" ? "Oculto" : "Activo");
});
