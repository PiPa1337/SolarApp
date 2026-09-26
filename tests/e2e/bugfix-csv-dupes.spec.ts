/**
 * F1 — Reemplazar catálogo con duplicados no tumba la app.
 * Un CSV con slugs o variantes repetidas se rechaza con errores por fila
 * (sin dispatch, sin recarga del ErrorBoundary) y el catálogo queda intacto.
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { openStudioDashboard } from "./studio-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 60_000);

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

async function openDemoCatalog(page: import("@playwright/test").Page) {
  await openStudioDashboard(page, studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolveDelete, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolveDelete());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await openStudioDashboard(page, studioUrl);
  await page.locator(".dashboard-store-card__button").first().click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
}

const commercialHeader =
  "producto_id,variante_id,slug,titulo,descripcion,marca,estado,categorias,colecciones,etiquetas,imagenes,variante,sku,opciones,precio_centavos,precio_anterior_centavos,disponible,estado_stock,gtin,mpn,imagen_variante,creado_en,actualizado_en";

const fecha = "2026-08-07T10:00:00.000Z";

function fila(productoId: string, varianteId: string, slug: string, marca: string): string[] {
  return [
    productoId,
    varianteId,
    slug,
    "Taza repetida",
    "",
    marca,
    "active",
    "",
    "",
    "",
    "",
    "Única",
    `${slug}-sku`,
    "",
    "125000",
    "",
    "true",
    "in_stock",
    "",
    "",
    "",
    fecha,
    fecha,
  ];
}

test("slugs duplicados: errores por fila, catálogo intacto y app viva", async ({ page }) => {
  await openDemoCatalog(page);
  const csv = [
    commercialHeader,
    fila("p-1", "v-1", "taza-repetida", "Marca A").join(","),
    fila("p-2", "v-2", "taza-repetida", "Marca B").join(","),
  ].join("\r\n");
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: "catalogo-slugs-duplicados.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  const errors = page.getByTestId("ui-csv-errors");
  await expect(errors).toBeVisible();
  await expect(page.getByTestId("ui-csv-error")).toHaveCount(2);
  await expect(errors.getByText(/Fila 2/)).toBeVisible();
  await expect(errors.getByText(/Fila 3/)).toBeVisible();
  await expect(errors.getByText(/taza-repetida/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Reemplazar catálogo" })).toHaveCount(0);
  await expect(page.getByText("33 productos y 41 variantes.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Algo salió mal" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
});

test("variantes duplicadas dentro de un producto: errores por fila sin recargar", async ({
  page,
}) => {
  await openDemoCatalog(page);
  const csv = [
    commercialHeader,
    fila("p-3", "v-3", "taza-variante-dup", "Marca C").join(","),
    fila("p-3", "v-3", "taza-variante-dup", "Marca C").join(","),
  ].join("\r\n");
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: "catalogo-variantes-duplicadas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  const errors = page.getByTestId("ui-csv-errors");
  await expect(errors).toBeVisible();
  await expect(page.getByTestId("ui-csv-error")).toHaveCount(2);
  await expect(errors.getByText(/Fila 2/)).toBeVisible();
  await expect(errors.getByText(/Fila 3/)).toBeVisible();
  await expect(errors.getByText(/v-3/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Reemplazar catálogo" })).toHaveCount(0);
  await expect(page.getByText("33 productos y 41 variantes.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Algo salió mal" })).toHaveCount(0);
});
