import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { exportProductsCsv, generatePerformanceFixture } from "@solara/core";
import { startStudioServer, stopStudioServer } from "./studio-server";

const performanceCsv = exportProductsCsv(generatePerformanceFixture(1_000).products);
const selectionCsv = exportProductsCsv(generatePerformanceFixture(120).products);
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

async function uploadCsv(page: import("@playwright/test").Page, csv: string, name: string) {
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function clickDom(locator: import("@playwright/test").Locator) {
  await locator.evaluate((element: HTMLElement) => element.click());
}

test("importa y pagina 1.000 productos", async ({ page }) => {
  test.setTimeout(150_000);
  await openCatalog(page);
  await uploadCsv(page, performanceCsv, "catalogo-1000.csv");
  await clickDom(page.getByRole("button", { name: "Reemplazar catálogo" }));
  await expect(page.getByText("1000 productos y 2000 variantes.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("tbody tr")).toHaveCount(50);

  expect(await page.locator("tbody tr").count()).toBeLessThanOrEqual(100);
});

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

test("previsualiza, cancela y edita en masa entre páginas", async ({ page }) => {
  test.setTimeout(90_000);
  await openCatalog(page);
  await uploadCsv(page, selectionCsv, "catalogo-120.csv");

  const review = page.locator(".import-review");
  await expect(review.getByText("120", { exact: true })).toBeVisible();
  await expect(review).toContainText("Nuevos");
  await clickDom(page.getByRole("button", { name: "Cancelar" }));
  // La tienda derivada arranca con la misma base neutral: 33 productos y 41 variantes.
  await expect(page.getByText("33 productos y 41 variantes.")).toBeVisible();

  await uploadCsv(page, selectionCsv, "catalogo-120.csv");
  await clickDom(page.getByRole("button", { name: "Reemplazar catálogo" }));
  await expect(page.getByText("120 productos y 240 variantes.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("tbody tr")).toHaveCount(50);

  await clickDom(page.getByTestId("select-filtered-products"));
  await expect(page.getByText("120 seleccionados")).toBeVisible();
  // T4.3: la paginación nativa se reemplazó por el componente Pagination
  // compartido (T1.3), que no expone el testid anterior.
  await clickDom(page.getByRole("button", { name: "Siguiente", exact: true }));
  await expect(page.getByText("120 seleccionados")).toBeVisible();
  await expect(page.locator('thead input[type="checkbox"]')).toBeChecked();

  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("archived");
  await clickDom(page.getByTestId("apply-bulk-status"));
  await expect(page.locator("tbody .status-label", { hasText: "Archivado" }).first()).toBeVisible();
  await clickDom(page.getByRole("button", { name: "Deshacer" }));
  await expect(page.locator("tbody .status-label", { hasText: "Activo" }).first()).toBeVisible();
  await clickDom(page.getByRole("button", { name: "Rehacer" }));
  await expect(page.locator("tbody .status-label", { hasText: "Archivado" }).first()).toBeVisible();
});
