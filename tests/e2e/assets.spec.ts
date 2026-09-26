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

test("procesa una imagen, muestra el lote y persiste el asset", async ({ page }) => {
  test.setTimeout(60_000);
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
    timeout: 10_000,
  });
  await createCleanStore(page, "Tienda de recursos");
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recursos", exact: true })).toBeVisible();
  // Scope a la grilla de recursos: .asset-item se reusa en previews SEO.
  const assetGrid = page.locator(".asset-grid").first();

  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator('input[type="file"][accept*="image/"]').setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: pixel,
  });

  await expect(page.locator("output").filter({ hasText: "1 imagen agregada" })).toBeVisible({
    timeout: 15_000,
  });
  // El nombre vive en input[value]: filtrar por atributo es determinista
  // (hasText no ve valores de inputs; un count() inicial es racheable).
  const uploadedItem = assetGrid
    .locator(".asset-item")
    .filter({ has: page.locator('input[value="pixel"]') });
  await expect(uploadedItem).toHaveCount(1);
  await expect(uploadedItem.locator("picture")).toHaveCount(1);
  await expect(uploadedItem.locator("picture source")).toHaveAttribute("srcset", /\s1w/);
  await uploadedItem.scrollIntoViewIfNeeded();
  await expect
    .poll(() => uploadedItem.locator("img").evaluate((image) => image.currentSrc))
    .toMatch(/^data:image\/(?:avif|webp)/);
  await expect(page.getByText(/^Guardado/, { exact: false })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Tienda de recursos" }).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(
    assetGrid.locator(".asset-item").filter({ has: page.locator('input[value="pixel"]') }),
  ).toHaveCount(1);
});
