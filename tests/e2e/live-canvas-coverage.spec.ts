import type { FrameLocator, Page, Server } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { createProjectArchive } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import type { StoreProjectV1 } from "@solara/project-schema";
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

function previewFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[title^="Vista previa "]');
}

async function openCanvasStore(
  page: Page,
  name: string,
  options: { initialEmail?: string; fixture?: StoreProjectV1 } = {},
): Promise<FrameLocator> {
  await page.setViewportSize({ width: 1920, height: 912 });
  await page.goto(studioUrl);
  if (options.fixture) {
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 10_000,
    });
    const fixture = structuredClone(options.fixture);
    fixture.name = name;
    await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
    await page.getByLabel("Seleccionar tienda para importar").setInputFiles({
      name: "catalog-modern-v2.solara.json",
      mimeType: "application/json",
      buffer: Buffer.from(createProjectArchive(fixture), "utf8"),
    });
    await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Volver a tiendas" }).click();
    const importedStore = page.locator(".dashboard-store-card").filter({ hasText: name }).first();
    await importedStore.locator(".dashboard-store-card__button").click();
    await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
      timeout: 20_000,
    });
  } else {
    await createCleanStore(page, name);
  }
  if (options.initialEmail) {
    await page.getByRole("tab", { name: "Resumen", exact: true }).click();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(options.initialEmail);
  }
  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  const desktop = page.getByRole("button", { name: "Vista de escritorio" });
  await expect(desktop).toBeEnabled();
  await desktop.click();
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  const frame = page.frameLocator('iframe[title="Vista previa desktop"]');
  await expect(frame.locator("html[data-store-id]")).toBeVisible({ timeout: 30_000 });
  await frame.locator("html").evaluate(() => {
    const modeMessages: boolean[] = [];
    Object.assign(window, { __solaraCanvasModeMessages: modeMessages });
    window.addEventListener("message", (event) => {
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "solara-canvas-mode" &&
        typeof event.data.enabled === "boolean"
      ) {
        modeMessages.push(event.data.enabled);
      }
    });
  });
  const toggle = page.getByTestId("ui-canvas-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      frame.locator("html").evaluate(
        () =>
          (window as typeof window & { __solaraCanvasModeMessages?: boolean[] })
            .__solaraCanvasModeMessages?.at(-1) ?? false,
      ),
    )
    .toBe(true);
  return frame;
}

async function openTextDialog(
  page: Page,
  target: ReturnType<FrameLocator["locator"]>,
  label: string,
): Promise<ReturnType<Page["getByRole"]>> {
  await target.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest" }),
  );
  await target.evaluate(async (element) => {
    const module = element.closest("[data-solara-module]") ?? element;
    const finiteAnimations = module
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
      );
    await Promise.race([
      Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined))),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2_000)),
    ]);
  });
  await expect(target).toBeVisible({ timeout: 30_000 });
  await target.click();
  const dialog = page.getByRole("dialog", { name: `Editar ${label}` });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

async function applyText(dialog: ReturnType<Page["getByRole"]>, value: string): Promise<void> {
  await dialog.getByRole("textbox").fill(value);
  await dialog.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function applyDifferentAsset(dialog: ReturnType<Page["getByRole"]>): Promise<void> {
  const select = dialog.getByRole("combobox");
  const options = select.locator("option");
  const optionCount = await options.count();
  if (optionCount < 2) throw new Error("El selector de Canvas no tiene assets disponibles.");
  const assetId = await options.nth(optionCount - 1).getAttribute("value");
  if (!assetId) throw new Error("El selector de Canvas no tiene un asset seleccionable.");
  await select.selectOption(assetId);
  await dialog.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function goToRoute(page: Page, path: string): Promise<FrameLocator> {
  const route = page.getByTestId("ui-preview-route");
  await route.fill(path);
  await route.press("Enter");
  await expect(route).toHaveValue(path);
  await expect(page.getByTestId("ui-preview-route-announce")).toContainText(path);
  const toggle = page.getByTestId("ui-canvas-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const frame = previewFrame(page);
  await expect(frame.locator("html[data-store-id]")).toBeVisible({ timeout: 30_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  return frame;
}

test("N3.1 Canvas permite editar texto del contacto V2 del Home", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 contacto texto");
  const target = frame.locator('[data-canvas-edit="ce-home-section-contact-form-title"]');
  const dialog = await openTextDialog(page, target, "Título del formulario");
  await applyText(dialog, "Consultanos desde Canvas");
  await expect(target).toHaveText("Consultanos desde Canvas", { timeout: 20_000 });
});

test("N3.2 Canvas conserva el vínculo generado de un canal de contacto", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 contacto vínculo", {
    initialEmail: "inicial@example.com",
  });
  const target = frame.locator(
    '[data-canvas-edit^="ce-home-section-contact-channels-identity-email-identity-"]',
  );
  const dialog = await openTextDialog(page, target, "Email de contacto");
  await applyText(dialog, "canvas-contacto@example.com");
  await expect(
    frame.locator('.contact-channel-row[href="mailto:canvas-contacto@example.com"]'),
  ).toBeVisible({ timeout: 20_000 });
});

test("N3.3 Canvas edita el título de un producto desde una card", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 producto título");
  const target = frame.locator('[data-canvas-edit*="-product-title-product-"]').first();
  const dialog = await openTextDialog(page, target, "Título de producto");
  await applyText(dialog, "Producto editado en Canvas");
  await expect(target).toHaveText("Producto editado en Canvas", { timeout: 20_000 });
});

test("N3.4 Canvas cambia la imagen de producto desde una card", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 producto imagen");
  const target = frame.locator('[data-canvas-image*="-product-image-product-"]').first();
  const dialog = await openTextDialog(page, target, "Imagen de producto");
  await applyDifferentAsset(dialog);
  await expect(target).toBeVisible({ timeout: 20_000 });
});

test("N3.5 Canvas edita el título de una categoría", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 categoría título");
  const target = frame.locator('[data-canvas-edit*="-category-title-category-"]').first();
  const dialog = await openTextDialog(page, target, "Título de categoría");
  await applyText(dialog, "Categoría editada en Canvas");
  await expect(target).toHaveText("Categoría editada en Canvas", { timeout: 20_000 });
});

test("N3.6 Canvas cambia la imagen de una categoría", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 categoría imagen");
  const target = frame.locator('[data-canvas-image*="-category-image-category-"]').first();
  const dialog = await openTextDialog(page, target, "Imagen de categoría");
  await applyDifferentAsset(dialog);
  await expect(target).toBeVisible({ timeout: 20_000 });
});

test("N3.7 Canvas edita el título de una colección generada", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 colección título", {
    fixture: catalogModernV2Store,
  });
  const routed = await goToRoute(page, "/colecciones/recien-llegados/");
  const target = routed.locator(
    '[data-canvas-edit][data-canvas-entity-kind="collection"][data-canvas-field="title"]',
  );
  const dialog = await openTextDialog(page, target, "Título de colección");
  await applyText(dialog, "Colección editada en Canvas");
  await expect(target).toHaveText("Colección editada en Canvas", { timeout: 20_000 });
  await expect(frame.locator("html[data-store-id]")).toBeVisible();
});

test("N3.8 Canvas cambia la imagen de una colección generada", async ({ page }) => {
  test.setTimeout(90_000);
  await openCanvasStore(page, "N3 colección imagen", {
    fixture: catalogModernV2Store,
  });
  const frame = await goToRoute(page, "/colecciones/recien-llegados/");
  const target = frame.locator(
    '[data-canvas-image][data-canvas-entity-kind="collection"][data-canvas-field="imageId"]',
  );
  const dialog = await openTextDialog(page, target, "Imagen de colección");
  await applyDifferentAsset(dialog);
  await expect(target).toBeVisible({ timeout: 20_000 });
});

test("N3.9 Canvas edita descripción y precio entero en el PDP", async ({ page }) => {
  test.setTimeout(90_000);
  await openCanvasStore(page, "N3 PDP campos", {
    fixture: catalogModernV2Store,
  });
  const frame = await goToRoute(page, "/productos/remera-esencial-de-algodon/");
  const description = frame.locator('[data-canvas-edit*="-product-description-product-"]');
  const descriptionDialog = await openTextDialog(page, description, "Descripción del producto");
  await applyText(descriptionDialog, "Descripción actualizada desde Canvas");
  await expect(description).toHaveText("Descripción actualizada desde Canvas", {
    timeout: 20_000,
  });

  const price = frame.locator('[data-canvas-edit*="-product-price-product-"]');
  const priceDialog = await openTextDialog(page, price, "Precio del producto");
  await applyText(priceDialog, "3123450");
  await expect(frame.locator("[data-product-price]").first()).toContainText("31.234,50", {
    timeout: 20_000,
  });
});

test("N3.10 Canvas permite actualizar el alt de una imagen real", async ({ page }) => {
  test.setTimeout(90_000);
  await openCanvasStore(page, "N3 alt imagen", {
    fixture: catalogModernV2Store,
  });
  const frame = await goToRoute(page, "/productos/remera-esencial-de-algodon/");
  const target = frame.locator('[data-canvas-edit*="-asset-alt-asset-"]').first();
  const dialog = await openTextDialog(page, target, "Texto alternativo de imagen");
  await applyText(dialog, "Remera de algodón editada desde Canvas");
  await expect(target).toHaveAttribute("alt", "Remera de algodón editada desde Canvas", {
    timeout: 20_000,
  });
});

test("N3.11 Canvas actualiza un ítem de repeater con su itemId", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 repeater", {
    fixture: catalogModernV2Store,
  });
  const target = frame.locator('[data-canvas-edit*="-item-author"][data-canvas-item]').first();
  const dialog = await openTextDialog(page, target, "Nombre del testimonio");
  await applyText(dialog, "Cliente actualizado en Canvas");
  await expect(target).toHaveText("Cliente actualizado en Canvas", { timeout: 20_000 });
});

test("N3.12 cancelar y cambiar de ruta limpian la selección de Canvas", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openCanvasStore(page, "N3 cancelación");
  const target = frame.locator('[data-canvas-edit="ce-modo-section-hero-title"]');
  const before = await target.textContent();
  const dialog = await openTextDialog(page, target, "Título del hero");
  await dialog.getByRole("textbox").fill("Cambio descartado");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(target).toHaveText(before?.trim() ?? "", { timeout: 20_000 });

  const route = page.getByTestId("ui-preview-route");
  await target.click();
  await expect(page.getByRole("dialog", { name: "Editar Título del hero" })).toBeVisible();
  await route.fill("/categorias/remeras/");
  await route.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
  await expect(frame.locator("html[data-store-id]")).toBeVisible({ timeout: 30_000 });
});
