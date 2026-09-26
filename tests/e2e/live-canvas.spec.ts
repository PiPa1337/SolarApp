import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
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

async function openCleanStore(page: import("@playwright/test").Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 912 });
  await page.goto(studioUrl);
  await createCleanStore(page, "Canvas verificable");
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  const desktop = page.getByRole("button", { name: "Vista de escritorio" });
  await expect(desktop).toBeEnabled();
  await desktop.click();
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');
  await expect(frame.locator("html[data-store-id]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ui-canvas-toggle")).toBeVisible();
}

test("Ctrl+clic selecciona un binding, edita texto y conserva undo/redo", async ({ page }) => {
  test.setTimeout(60_000);
  await openCleanStore(page);
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');
  const title = frame.locator('[data-canvas-edit="ce-modo-section-hero-title"]');
  await expect(title).toBeVisible({ timeout: 20_000 });
  const initialTitle = (await title.textContent())?.trim() ?? "";
  expect(initialTitle).not.toBe("");
  // El header V2 es sticky; centrar el binding evita que el scroll automático
  // de Playwright lo deje debajo de la navegación antes del Ctrl+clic.
  await title.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));

  await title.click({ modifiers: ["Control"], force: true });

  const popover = page.getByRole("dialog", { name: "Editar Título del hero" });
  await expect(popover).toBeVisible();
  await expect(popover.getByRole("textbox")).toHaveValue(initialTitle);
  await popover.getByRole("textbox").fill("Título escrito desde Canvas");
  await popover.getByRole("button", { name: "Aplicar" }).click();

  await expect(frame.locator('[data-solara-module="catalog-hero"] h1')).toContainText(
    "Título escrito desde Canvas",
    { timeout: 20_000 },
  );
  await expect(page.getByRole("button", { name: "Deshacer" })).toBeEnabled();
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(frame.locator('[data-solara-module="catalog-hero"] h1')).toContainText(initialTitle, {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Rehacer" }).click();
  await expect(frame.locator('[data-solara-module="catalog-hero"] h1')).toContainText(
    "Título escrito desde Canvas",
    { timeout: 20_000 },
  );
});

test("Ctrl+clic permite editar título y descripción de los beneficios del hero", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openCleanStore(page);
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');
  const title = frame
    .locator('[data-canvas-edit*="-benefit-title"][data-canvas-item]:visible')
    .first();
  await expect(title).toHaveText("Envíos a todo el país", { timeout: 20_000 });
  await title.click({ modifiers: ["Control"] });

  const titlePopover = page.getByRole("dialog", { name: "Editar Título del beneficio" });
  await expect(titlePopover).toBeVisible();
  await expect(titlePopover.getByRole("textbox")).toHaveValue("Envíos a todo el país");
  await titlePopover.getByRole("textbox").fill("Envíos nacionales");
  await titlePopover.getByRole("button", { name: "Aplicar" }).click();
  await expect(title).toHaveText("Envíos nacionales", { timeout: 20_000 });

  const description = frame
    .locator('[data-canvas-edit*="-benefit-text"][data-canvas-item]:visible')
    .first();
  await description.click({ modifiers: ["Control"] });
  const descriptionPopover = page.getByRole("dialog", {
    name: "Editar Descripción del beneficio",
  });
  await expect(descriptionPopover).toBeVisible();
  await expect(descriptionPopover.getByRole("textbox")).toHaveValue(
    "Coordinamos la entrega por WhatsApp",
  );
  await descriptionPopover.getByRole("textbox").fill("Entregamos en todo el país");
  await descriptionPopover.getByRole("button", { name: "Aplicar" }).click();
  await expect(description).toHaveText("Entregamos en todo el país", { timeout: 20_000 });
});

test("el modo accesible permite seleccionar y subir una imagen desde Canvas", async ({ page }) => {
  test.setTimeout(60_000);
  await openCleanStore(page);
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');
  const toggle = page.getByTestId("ui-canvas-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const image = frame.locator('[data-canvas-image="ce-modo-section-hero-posterAssetId"]');
  await expect(image).toBeVisible({ timeout: 20_000 });
  await image.click();
  const popover = page.getByRole("dialog", { name: "Editar Imagen principal del hero" });
  await expect(popover).toBeVisible();
  await expect(popover.getByRole("combobox")).toBeVisible();
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await popover.locator('input[type="file"]').setInputFiles({
    name: "canvas-pixel.png",
    mimeType: "image/png",
    buffer: pixel,
  });
  await expect(popover).toBeHidden({ timeout: 20_000 });
  await expect(frame.locator('[data-solara-module="catalog-hero"] img')).toHaveCount(1);
});
