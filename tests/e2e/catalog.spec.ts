import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProductsCsv, generatePerformanceFixture } from "@solara/core";
import { startStudioServer, stopStudioServer } from "./studio-server";

const selectionCsv = exportProductsCsv(generatePerformanceFixture(60).products);
const importErrorCsv = [
  "producto_id,variante_id,slug,titulo,descripcion,marca,estado,categorias,colecciones,etiquetas,imagenes,variante,sku,opciones,precio_centavos,precio_anterior_centavos,disponible,estado_stock,gtin,mpn,imagen_variante,creado_en,actualizado_en",
  ",,taza-rota,Taza rota,,Marca A,active,,,casa,,Única,,,abc,,true,in_stock,,,,2026-08-07T10:00:00.000Z,2026-08-07T10:00:00.000Z",
  ",,taza-mal-opcion,Taza con opción inválida,,Marca B,active,,,casa,,Única,,Color,12500,,true,in_stock,,,,2026-08-07T10:00:00.000Z,2026-08-07T10:00:00.000Z",
  ",,taza-buena,Taza buena,,Marca C,active,,,casa,,Única,TAZA-001,,125000,,true,in_stock,,,,2026-08-07T10:00:00.000Z,2026-08-07T10:00:00.000Z",
].join("\r\n");
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

async function openCatalog(page: import("@playwright/test").Page) {
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
  // La plantilla base es de solo lectura: el flujo de catálogo debe trabajar
  // sobre una tienda derivada para no mutar Predeterminado.
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  await page.getByLabel("Nueva tienda").fill("Tienda de catálogo");
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Crear tienda desde plantilla", exact: true }).click();
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo", exact: true })).toBeVisible();
}

async function uploadCsv(
  page: import("@playwright/test").Page,
  csv: string,
  name: string,
  checkProgress = false,
) {
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  if (checkProgress) {
    const importButton = page.getByTestId("ui-csv-import");
    await expect(importButton).toBeDisabled();
    await expect(importButton).toContainText("Procesando");
    await expect(page.getByTestId("ui-catalog-progress")).toContainText("Procesando CSV");
  }
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function clickDom(locator: import("@playwright/test").Locator) {
  await locator.evaluate((element: HTMLElement) => element.click());
}

test("edita variantes y conserva el último cambio al volver, recargar y reabrir", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openCatalog(page);
  await page.getByRole("button", { name: "Agregar producto" }).first().click();

  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Título" }).fill("Lámpara Horizonte");
  await dialog.getByRole("textbox", { name: "Slug" }).fill("lampara-horizonte");
  await dialog.getByRole("textbox", { name: "Marca" }).fill("Marca Aurora");
  await dialog.getByRole("textbox", { name: "Descripción" }).fill("Luz puntual de lectura.");
  await dialog.getByRole("textbox", { name: "SKU" }).fill("LUZ-HOR-01");
  await dialog.getByRole("textbox", { name: "Opciones" }).fill("Color=Grafito");
  await dialog.getByRole("spinbutton", { name: "Precio en centavos" }).fill("125000");
  await dialog.getByRole("button", { name: "Agregar variante" }).click();

  const variants = dialog.locator(".variant-editor");
  await expect(variants).toHaveCount(2);
  await variants.nth(1).getByRole("textbox", { name: "Nombre" }).fill("Arena");
  await variants.nth(1).getByRole("textbox", { name: "SKU" }).fill("LUZ-HOR-02");
  await variants.nth(1).getByRole("textbox", { name: "Opciones" }).fill("Color=Arena");
  await variants.nth(1).getByRole("spinbutton", { name: "Precio en centavos" }).fill("129000");
  await dialog.getByRole("button", { name: /Guardar borrador|Crear producto/ }).click();

  await page.getByPlaceholder("Buscar por producto, marca o estado").fill("Lámpara Horizonte");
  await expect(page.getByLabel("Nombre de Lámpara Horizonte")).toBeVisible();
  await page.getByLabel("Seleccionar Lámpara Horizonte").check();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("archived");
  await page.getByRole("button", { name: "Aplicar estado" }).click();
  await expect(page.locator("tbody .status-label", { hasText: "Archivado" })).toBeVisible();

  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Tienda de catálogo/ }).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await page.getByPlaceholder("Buscar por producto, marca o estado").fill("Lámpara Horizonte");
  await expect(page.getByLabel("Nombre de Lámpara Horizonte")).toBeVisible();
  await expect(page.locator("tbody .status-label", { hasText: "Archivado" })).toBeVisible();

  // El filtro tiene debounce de 300 ms: esperar que la tabla se reduzca antes
  // de interactuar con la única fila visible.
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("cell", { name: /Lámpara Horizonte/ })
    .getByRole("button", { name: "Editar" })
    .click();
  await expect(page.getByRole("dialog").locator(".variant-editor")).toHaveCount(2);
});

test("importa CSV: errores, progreso, cancelación y edición masiva entre páginas", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openCatalog(page);

  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name: "catalogo-con-errores.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(importErrorCsv, "utf8"),
  });
  const errors = page.getByTestId("ui-csv-errors");
  await expect(errors).toBeVisible();
  await expect(page.getByTestId("ui-csv-error")).toHaveCount(2);
  await expect(errors.getByText(/Fila 2/)).toBeVisible();
  await expect(errors.getByText(/precio_centavos/)).toBeVisible();
  await expect(errors.getByText(/Fila 3/)).toBeVisible();
  await expect(errors.getByText(/opciones/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reemplazar catálogo" })).toHaveCount(0);
  await expect(page.getByText("33 productos y 41 variantes.")).toBeVisible();

  await uploadCsv(page, selectionCsv, "catalogo-60.csv");

  const review = page.locator(".import-review");
  await expect(review.getByText("60", { exact: true })).toBeVisible();
  await expect(review).toContainText("Nuevos");
  await clickDom(page.getByRole("button", { name: "Cancelar" }));
  // La tienda derivada arranca con la misma base neutral: 33 productos y 41 variantes.
  await expect(page.getByText("33 productos y 41 variantes.")).toBeVisible();

  await uploadCsv(page, selectionCsv, "catalogo-60.csv", true);
  await clickDom(page.getByRole("button", { name: "Reemplazar catálogo" }));
  await expect(page.getByText("60 productos y 120 variantes.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("tbody tr")).toHaveCount(50);

  await clickDom(page.getByTestId("select-filtered-products"));
  await expect(page.getByText("60 seleccionados")).toBeVisible();
  // T4.3: la paginación nativa se reemplazó por el componente Pagination
  // compartido (T1.3), que no expone el testid anterior.
  await clickDom(page.getByRole("button", { name: "Siguiente", exact: true }));
  await expect(page.getByText("60 seleccionados")).toBeVisible();
  await expect(page.locator('thead input[type="checkbox"]')).toBeChecked();

  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("archived");
  await clickDom(page.getByTestId("apply-bulk-status"));
  await expect(page.locator("tbody .status-label", { hasText: "Archivado" }).first()).toBeVisible();
  await clickDom(page.getByRole("button", { name: "Deshacer" }));
  await expect(page.locator("tbody .status-label", { hasText: "Activo" }).first()).toBeVisible();
  await clickDom(page.getByRole("button", { name: "Rehacer" }));
  await expect(page.locator("tbody .status-label", { hasText: "Archivado" }).first()).toBeVisible();
});
