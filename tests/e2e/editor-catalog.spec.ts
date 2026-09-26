/**
 * T4.3/T4.4 — Tabla del catálogo: orden por columnas, columnas configurables
 * persistidas, edición inline de precio y estado, atajos de teclado, barras
 * fijas y vista de tarjetas.
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { openMutableScaleStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

let server: Server;
let studioUrl: string;
const SCALE_STORE_NAME = "Tienda escala editor";

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

async function openCatalog(page: Page) {
  await resetStudioIndexedDb(page, studioUrl);
  await openMutableScaleStore(page, SCALE_STORE_NAME);
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
}

async function reopenCatalog(page: Page) {
  await page
    .locator(".dashboard-store-card")
    .filter({ hasText: SCALE_STORE_NAME })
    .first()
    .locator(".dashboard-store-card__button")
    .click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
}

async function blurFocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
}



test("edita el precio inline, rechaza valores inválidos y persiste tras recargar", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openCatalog(page);
  const priceInput = page.getByTestId("ui-price-edit").first();
  const original = Number(await priceInput.inputValue());
  const next = String(original + 137);

  await priceInput.fill(next);
  await priceInput.press("Enter");
  await expect(page.getByTestId("ui-price-edit").first()).toHaveValue(next);

  await page.getByTestId("ui-price-edit").first().fill("-7");
  await page.getByTestId("ui-price-edit").first().press("Enter");
  await expect(page.getByTestId("ui-price-error")).toBeVisible();
  await page.getByTestId("ui-price-edit").first().press("Escape");
  await expect(page.getByTestId("ui-price-edit").first()).toHaveValue(next);

  // El autosave debouncea 550 ms; recargar dentro de esa ventana pierde el
  // snapshot pendiente (beforeunload sólo avisa y la escritura IndexedDB no
  // sobrevive el teardown). Se espera a que el indicador confirme el guardado
  // antes de recargar para ejercitar la persistencia, no la carrera del timer.
  await expect(page.locator(".save-indicator")).toHaveClass(/save-indicator--saved/, {
    timeout: 15_000,
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await reopenCatalog(page);
  await expect(page.getByTestId("ui-price-edit").first()).toHaveValue(next);
});




test("los atajos editan, duplican y archivan la selección sin tocar formularios", async ({
  page,
}) => {
  await openCatalog(page);
  const rows = page.locator("tbody tr");
  let targetIndex = 0;
  const rowCount = await rows.count();
  for (let index = 0; index < rowCount; index += 1) {
    const label = (await rows.nth(index).locator(".status-label").textContent()) ?? "";
    if (label.trim() !== "Archivado") {
      targetIndex = index;
      break;
    }
  }
  await rows.nth(targetIndex).getByRole("checkbox").check();
  await blurFocus(page);

  const pagination = page.getByTestId("ui-pagination");
  const totalBefore = Number((await pagination.innerText()).match(/de (\d+)/)?.[1] ?? 0);
  await page.keyboard.press("e");
  const dialog = page.locator("dialog.product-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();

  await page.keyboard.press("d");
  await expect(pagination).toContainText(`de ${totalBefore + 1}`);

  // T4.12: archivar por Supr pasa por el diálogo de confirmación unificado.
  await page.keyboard.press("Delete");
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(rows.nth(targetIndex).locator(".status-label")).toHaveText("Archivado");

  await page.getByPlaceholder("Buscar por producto, marca o estado").fill("e");
  await page.keyboard.press("e");
  await expect(page.locator("dialog.product-dialog")).toHaveCount(0);
  await page.getByPlaceholder("Buscar por producto, marca o estado").fill("");
});




test("R3-P5-B5: el paginado del catálogo respeta el tamaño elegido", async ({ page }) => {
  await openCatalog(page);

  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const pagination = page.getByTestId("ui-pagination");
  const totalItems = Number((await pagination.innerText()).match(/de (\d+)/)?.[1] ?? 0);
  const sizeSelect = page.getByRole("combobox", { name: "Filas por página" });
  await sizeSelect.selectOption("25");
  await expect(pagination).toContainText(`1–25 de ${totalItems}`);
  await expect(rows).toHaveCount(25);
  console.log("R3-P5-B5 filas con 25 por página:", await rows.count());

  const pageButton = page.getByRole("group", { name: "Páginas" }).getByRole("button", {
    name: "2",
    exact: true,
  });
  await pageButton.click();
  await expect(pagination).toContainText(`26–50 de ${totalItems}`);
  await expect(rows).toHaveCount(25);
  console.log("R3-P5-B5 filas en página 2:", await rows.count());
});

test("R4-P5-B5: el export CSV descarga productos con encabezado", async ({ page }) => {
  await openCatalog(page);

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  if ((await page.locator(".workbench-transfer").getAttribute("open")) === null) {
    await page.locator(".workbench-transfer > summary").click();
  }
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  console.log("R4-P5-B5 CSV descargado:", filename);
  expect(filename.toLowerCase()).toContain(".csv");

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  const header = text.split("\n")[0] ?? "";
  console.log("R4-P5-B5 header CSV:", JSON.stringify(header.slice(0, 80)));
  expect(header.toLowerCase()).toMatch(/nombre|title|producto/);
});
