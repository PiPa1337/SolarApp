import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
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

test("importa una carpeta comercial con imagen y crea categorías faltantes", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 15_000,
  });
  await createCleanStore(page, "Tienda de importación");
  await page.getByRole("tab", { name: /Cat/ }).click();
  const catalogDescription = page.getByText(/^\d+ productos y \d+ variantes\.$/);
  const initialCatalogDescription = await catalogDescription.innerText();
  const initialCatalogCounts = initialCatalogDescription.match(
    /^(\d+) productos y (\d+) variantes\.$/,
  );
  if (!initialCatalogCounts)
    throw new Error(`Descripción de catálogo inesperada: ${initialCatalogDescription}`);
  const initialProductCount = Number(initialCatalogCounts[1]);
  const initialVariantCount = Number(initialCatalogCounts[2]);

  const csv = [
    "producto_id,variante_id,slug,titulo,descripcion,marca,estado,categorias,colecciones,etiquetas,imagenes,variante,sku,opciones,precio_centavos,precio_anterior_centavos,disponible,estado_stock,gtin,mpn,imagen_variante,creado_en,actualizado_en",
    ",,taza-nueva,Taza nueva,Taza para todos los días,,active,Cocina>Favoritos,,casa,imagenes/taza.png,Única,TAZA-001,,125000,,, ,,,imagenes/taza.png,,",
  ].join("\r\n");
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const packageDirectory = mkdtempSync(join(tmpdir(), "solara-catalog-package-"));
  const folderName = packageDirectory.split(/[\\/]/).pop() ?? "carpeta";
  try {
    mkdirSync(join(packageDirectory, "imagenes"), { recursive: true });
    writeFileSync(join(packageDirectory, "productos.csv"), csv, "utf8");
    writeFileSync(join(packageDirectory, "imagenes", "taza.png"), pixel);
    await page.locator('input[type="file"][webkitdirectory]').setInputFiles(packageDirectory);
    await expect(
      page.locator(".catalog-package-review").getByRole("heading", { name: folderName }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Productos nuevos").locator("..")).toContainText("1");
    await page.getByRole("button", { name: "Agregar y actualizar" }).click();
    await expect(catalogDescription).toHaveText(
      `${initialProductCount + 1} productos y ${initialVariantCount + 1} variantes.`,
      { timeout: 15_000 },
    );
    const categoryTree = page.getByRole("region", { name: /rbol de categor/ });
    const categoryList = categoryTree.getByRole("list", { name: /Categor/ });
    await expect(categoryList.getByText("Cocina", { exact: true })).toBeVisible();
    await expect(categoryList.getByText("Favoritos", { exact: true })).toBeVisible();
  } finally {
    rmSync(packageDirectory, { recursive: true, force: true });
  }
});
