import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { createCleanStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

/**
 * F10 — Regresión de controles de Tema y SEO (hallazgo H8-B1).
 * Presets con paleta real en el preview, reset a los valores de apertura,
 * rechazo de hex inválido con error inline, y persistencia del título SEO.
 */

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
  await resetStudioIndexedDb(page, studioUrl);
  await createCleanStore(page, name);
}





test("el título SEO persiste al cambiar de pestaña (H8-01)", async ({ page }) => {
  await setupCleanStore(page, "Tienda SEO");
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();

  const title = page.getByLabel("Título SEO");
  await title.fill("Título SEO auditoría F10");
  await expect(page.getByText("24/70 caracteres")).toBeVisible();

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByLabel("Título SEO")).toHaveValue("Título SEO auditoría F10");
});
