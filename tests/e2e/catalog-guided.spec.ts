import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
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

async function setupCleanStore(page: Page, name: string): Promise<void> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () => reject(new Error("La base quedó bloqueada.")));
      }),
  );
  await page.reload();
  await createCleanStore(page, name);
}

test("abre la base limpia en Preparar y ofrece edición manual por pasos", async ({ page }) => {
  await setupCleanStore(page, "Tienda guiada");

  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();
  await expect(page.getByText(/ de .* requisitos listos/)).toBeVisible();

  const progress = page.getByTestId("ui-guided-progress");
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", /^\d+$/);

  const firstRequirement = page.getByTestId("ui-guided-requirement").first();
  await expect(firstRequirement).toHaveAttribute("data-requirement-status", "placeholder");
  await expect(page.getByTestId("ui-guided-done")).toBeVisible();

  const nextButton = page.getByTestId("ui-guided-next");
  await expect(nextButton).toBeVisible();
  await nextButton.click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agregar producto" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pasos del producto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imágenes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Imágenes", exact: true }).click();
  await expect(page.getByText("Imágenes y videos")).toBeVisible();
});
