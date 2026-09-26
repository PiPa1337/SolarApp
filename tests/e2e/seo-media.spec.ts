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

test("SEO transforma favicon y portada manteniendo la paridad del preview", async ({ page }) => {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await createCleanStore(page, "Tienda SEO media");
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();

  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const faviconInput = page.getByTestId("ui-seo-favicon").locator('input[type="file"]');
  const coverInput = page.getByTestId("ui-seo-cover").locator('input[type="file"]');

  await faviconInput.setInputFiles({ name: "marca.png", mimeType: "image/png", buffer: pixel });
  await expect(page.getByTestId("ui-seo-favicon")).toContainText("ICO 16–256 px", {
    timeout: 15_000,
  });

  await coverInput.setInputFiles({ name: "portada.png", mimeType: "image/png", buffer: pixel });
  await expect(page.getByTestId("ui-seo-cover")).toBeVisible();
  await expect(page.locator(".seo-media-status")).toContainText("1200 × 630", {
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Cerrar panel de edición" }).click();
  const desktop = page.getByRole("button", { name: "Vista de escritorio" });
  await expect(desktop).toBeEnabled();
  await desktop.click();
  await expect(desktop).toHaveAttribute("aria-pressed", "true");
  const preview = page.frameLocator('iframe[title="Vista previa desktop"]');
  await expect(preview.locator('link[rel="icon"]')).toHaveAttribute("type", "image/x-icon", {
    timeout: 15_000,
  });
  await expect(preview.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
  await expect(preview.locator('meta[property="og:image"]')).toHaveCount(1);
});
