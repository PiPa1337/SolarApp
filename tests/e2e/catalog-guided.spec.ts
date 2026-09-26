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

test("Preparar conserva una sola columna y un CTA legible en móvil", async ({ page }) => {
  await setupCleanStore(page, "Tienda guiada móvil");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Preparar", exact: true }).click();

  const overview = page.locator(".guided-overview");
  await expect
    .poll(() =>
      overview.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(1);

  const nextButton = page.getByTestId("ui-guided-next");
  await expect(nextButton).toBeVisible();
  await expect(nextButton).toContainText(/^Siguiente:/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= 390))
    .toBe(true);
});

test("el progreso de Preparar sube al completar un requisito (T4.1)", async ({ page }) => {
  await setupCleanStore(page, "Tienda con progreso");

  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  const progress = page.getByTestId("ui-guided-progress");
  await expect(progress).toBeVisible();
  const progressCopy = page.locator(".guided-progress__copy > strong");
  const readReadyCount = async () => {
    const text = (await progressCopy.textContent()) ?? "";
    return Number(text.match(/^(\d+)/)?.[1] ?? -1);
  };
  const initialReadyCount = await readReadyCount();

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await page.getByLabel("Descripción", { exact: true }).fill("Descripción de la marca de prueba");

  await page.getByRole("tab", { name: "Preparar", exact: true }).click();
  await expect
    .poll(readReadyCount, {
      timeout: 10_000,
    })
    .toBeGreaterThan(initialReadyCount);

  const pendingDescription = page.locator(
    '[data-requirement-id="identity.description"][data-requirement-status="missing"]',
  );
  await expect(pendingDescription).toHaveCount(0);
  await expect(
    page.locator('[data-requirement-id="identity.description"][data-requirement-status="ready"]'),
  ).toHaveCount(1);
});

test("el formulario de Resumen valida en vivo con errores inline (T4.2)", async ({ page }) => {
  await setupCleanStore(page, "Tienda validación");

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();

  const phoneInput = page.getByLabel("Número internacional");
  await phoneInput.fill("1234");
  const phoneError = page.getByText("Usá entre 8 y 15 dígitos con código de país y área.");
  await expect(phoneError).toBeVisible();
  await expect(phoneInput).toHaveAttribute("aria-invalid", "true");
  await expect(phoneInput).toHaveAttribute("aria-describedby", /.+/);
  const phoneDescriptionIds =
    (await phoneInput.getAttribute("aria-describedby"))?.split(/\s+/).filter(Boolean) ?? [];
  expect(phoneDescriptionIds.length).toBeGreaterThan(0);
  const phoneDescriptions = await page
    .locator("[id]")
    .evaluateAll(
      (elements, ids) =>
        elements
          .filter((element) => (ids as string[]).includes(element.id))
          .map((element) => element.textContent?.trim() ?? ""),
      phoneDescriptionIds,
    );
  expect(phoneDescriptions.join(" ")).toMatch(/8 y 15 dígitos/);

  const urlInput = page.getByLabel("URL pública");
  await urlInput.fill("no-es-una-url");
  await expect(page.getByText("Ingresá una URL válida con http(s).")).toBeVisible();
  await expect(urlInput).toHaveAttribute("aria-describedby", /.+/);

  const nameInput = page.getByLabel("Nombre de la tienda");
  await nameInput.fill("");
  await expect(page.getByText("Completá el nombre de la tienda.")).toBeVisible();
  await expect(nameInput).toHaveAttribute("aria-describedby", /.+/);

  const indicator = page.getByTestId("ui-save-indicator");
  await expect(indicator).toContainText("Sin guardar");
  await expect(indicator).toContainText("Cambios guardados", { timeout: 5_000 });

  const whatsappToggle = page.getByRole("button", { name: /Pedido por WhatsApp/ });
  await whatsappToggle.click();
  await expect(whatsappToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: /Pedido por WhatsApp/ })).toBeHidden();
  await whatsappToggle.click();
  await expect(whatsappToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: /Pedido por WhatsApp/ })).toBeVisible();
});
