import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(180_000);

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

test("P4-C2: crear una tienda desde el dashboard en pasos con validacion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(studioUrl, { waitUntil: "load" });
  await page.getByRole("heading", { name: "Tus tiendas" }).waitFor({ timeout: 30000 });

  const start = Date.now();
  await page.getByRole("button", { name: "Nueva tienda" }).click();
  const dialog = page.getByRole("dialog", { name: "Crear tienda" });
  await expect(dialog).toBeVisible();
  const focusOnOpen = await page.evaluate(() => document.activeElement?.tagName);
  console.log("P4-C2 foco inicial del diálogo:", focusOnOpen);
  expect(focusOnOpen).toBe("INPUT");

  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Escribí un nombre para continuar.")).toBeVisible();
  console.log("P4-C2 error de validación visible: true");

  await dialog.getByLabel("Nueva tienda").fill("Tienda del plan");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByLabel("Nombre visible de la marca")).toBeVisible();
  await dialog.getByLabel("Nombre visible de la marca").fill("Marca del plan");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByLabel("Email de contacto (opcional)")).toBeVisible();
  await dialog.getByLabel("Email de contacto (opcional)").fill("hola@plan.example");
  await dialog.getByLabel("WhatsApp (opcional)").fill("5491100000000");
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Crear tienda desde plantilla")).toBeVisible();
  await dialog.getByRole("button", { name: "Crear tienda desde plantilla" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 20000 });
  const elapsed = Date.now() - start;

  await expect(page.locator(".studio-shell")).toBeVisible({ timeout: 30_000 });
  const bodyText = await page.locator("body").innerText();
  console.log("P4-C2 tienda en el body:", bodyText.includes("Tienda del plan"));
  const editorOpened = await page.locator(".studio-shell").count();
  const nameInEditor = (await page.locator("body").innerText()).includes("Tienda del plan");
  console.log(
    "P4-C2 editor abierto:",
    editorOpened > 0,
    "| nombre visible:",
    nameInEditor,
    "| tiempo:",
    elapsed,
    "ms",
  );
  expect(editorOpened).toBeGreaterThan(0);
  expect(nameInEditor).toBe(true);
});
