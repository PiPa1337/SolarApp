import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
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

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

// PNG 2x2 teal: contenido distinto del pixel 1x1 para que el hash cambie al reemplazar.
const PIXEL_TEAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAASSURBVBhXY2BoaPgPxhBGw38AQfQH/dpeE7AAAAAASUVORK5CYII=",
  "base64",
);

const IMAGE_INPUT = 'input[type="file"][accept*="image/"]';

async function openAssetsTab(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
}

async function replaceSelectedAsset(
  page: import("@playwright/test").Page,
  fileName: string,
): Promise<void> {
  await page.getByTestId("ui-asset-replace").click();
  await page.locator(IMAGE_INPUT).setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: PIXEL_TEAL_PNG,
  });
  await expect(page.getByTestId("ui-asset-detail")).toContainText("2 × 2", {
    timeout: 15_000,
  });
}

test("subir y reemplazar un asset conserva su nombre en la grilla y el detalle", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolveDelete, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolveDelete());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await createCleanStore(page, "Tienda de recursos F7");
  await openAssetsTab(page);

  await page.locator(IMAGE_INPUT).setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PIXEL_PNG,
  });
  await expect(page.locator("output").filter({ hasText: "1 imagen agregada" })).toBeVisible({
    timeout: 15_000,
  });

  const assetItem = page.locator(".asset-item").filter({
    has: page.locator('input[value="pixel"]'),
  });
  await expect(assetItem).toBeVisible();
  await assetItem.getByTestId("ui-asset-detail-open").click();
  const detail = page.getByTestId("ui-asset-detail");
  await expect(detail).toBeVisible();

  await replaceSelectedAsset(page, "pixel-teal.png");

  // El archivo cambió (2x2) pero el nombre editado por el usuario se conserva.
  await expect(detail).toContainText("2 × 2");
  await expect(detail.getByRole("heading")).toHaveText("pixel");
  await expect(assetItem.locator("input").first()).toHaveValue("pixel");
});

test("reemplazar un asset en uso conserva usos y el guard de borrado lo bloquea", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await openMutableScaleStore(page, "Tienda de recursos mutable");
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
  await openAssetsTab(page);

  // catalogScaleStore usa asset-hero en el hero y lo nombra "Mesa de referencia".
  const heroAsset = page.locator(".asset-item").filter({
    has: page.locator('input[value="Mesa de referencia"]'),
  });
  await expect(heroAsset).toBeVisible();
  await heroAsset.getByTestId("ui-asset-detail-open").click();
  const detail = page.getByTestId("ui-asset-detail");
  await expect(detail).toBeVisible();

  await replaceSelectedAsset(page, "pixel-teal.png");

  await expect(detail).toContainText("2 × 2");
  await expect(detail.getByRole("heading")).toHaveText("Mesa de referencia");
  await expect(heroAsset.locator("input").first()).toHaveValue("Mesa de referencia");

  // El ID se conserva: los usos del hero siguen vivos y el borrado queda bloqueado.
  await expect(
    detail.getByTestId("ui-asset-use").filter({ hasText: "Sección hero" }),
  ).toBeVisible();
  await expect(page.getByTestId("ui-asset-delete")).toBeDisabled();
  await expect(page.getByTestId("ui-asset-delete")).toHaveAttribute(
    "title",
    "Sólo se puede eliminar una imagen que no esté en uso",
  );
});
