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

const priceValues = (page: Page) =>
  page
    .getByTestId("ui-price-edit")
    .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)));

test("ordena por precio y por producto sobre el conjunto filtrado", async ({ page }) => {
  await openCatalog(page);

  await page.getByRole("button", { name: "Precio", exact: true }).click();
  const ascending = await priceValues(page);
  expect(ascending.length).toBe(50);
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

  await page.getByRole("button", { name: "Precio", exact: true }).click();
  const descending = await priceValues(page);
  expect(descending).toEqual([...descending].sort((a, b) => b - a));

  const titlesLocator = page.locator('tbody input[aria-label^="Nombre de"]');
  await page.getByRole("button", { name: "Producto", exact: true }).click();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  await expect
    .poll(async () => {
      const titles = await titlesLocator.evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
      );
      return titles.every((title, index) => {
        const previous = titles[index - 1];
        return index === 0 || (previous !== undefined && collator.compare(previous, title) <= 0);
      });
    })
    .toBe(true);
});

test("oculta y persiste columnas configurables", async ({ page }) => {
  test.setTimeout(60_000);
  await openCatalog(page);
  const categoryHeaders = page.locator("thead th", { hasText: "Categorías" });
  await expect(categoryHeaders).toHaveCount(1);

  await page.getByTestId("ui-columns-toggle").click();
  await expect(page.getByTestId("ui-columns-popover")).toBeVisible();
  await page.getByTestId("ui-column-toggle-categories").uncheck();
  await page.getByTestId("ui-columns-toggle").click();
  await expect(categoryHeaders).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await reopenCatalog(page);
  await expect(categoryHeaders).toHaveCount(0);

  await page.getByTestId("ui-columns-toggle").click();
  await page.getByTestId("ui-column-toggle-categories").check();
  await page.getByTestId("ui-columns-toggle").click();
  await expect(categoryHeaders).toHaveCount(1);
});

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

test("edita el estado de una fila sin pasar por el editor", async ({ page }) => {
  await openCatalog(page);
  const trigger = page.getByTestId("ui-status-edit-trigger").first();
  const current = ((await trigger.textContent()) ?? "").trim();
  const nextLabel = current === "Activo" ? "Oculto" : "Activo";
  await expect(trigger).toHaveAttribute("aria-label", new RegExp(`^Estado de .+: ${current}$`));

  await trigger.click();
  const statusSelect = page.getByTestId("ui-status-edit").first();
  await expect(statusSelect).toBeVisible();
  await expect(statusSelect).toBeFocused();
  await statusSelect.selectOption(nextLabel === "Oculto" ? "hidden" : "active");
  const updatedTrigger = page.getByTestId("ui-status-edit-trigger").first();
  await expect(updatedTrigger).toHaveText(nextLabel);
  await expect(updatedTrigger).toBeFocused();
});

test("Escape en el estado inline cancela y devuelve el foco al disparador", async ({ page }) => {
  await openCatalog(page);
  const trigger = page.getByTestId("ui-status-edit-trigger").first();
  const current = ((await trigger.textContent()) ?? "").trim();

  await trigger.click();
  const statusSelect = page.getByTestId("ui-status-edit").first();
  await expect(statusSelect).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(statusSelect).toHaveCount(0);
  await expect(trigger).toHaveText(current);
  await expect(trigger).toBeFocused();
});

test("alterna la vista de tarjetas y la persiste", async ({ page }) => {
  test.setTimeout(60_000);
  await openCatalog(page);
  await page.getByRole("button", { name: "Tarjetas", exact: true }).click();
  const cards = page.getByTestId("ui-catalog-card");
  await expect(cards).toHaveCount(50);
  await expect(cards.first()).toContainText("$");
  await expect(cards.first().getByRole("button", { name: "Editar" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await reopenCatalog(page);
  await expect(page.getByTestId("ui-catalog-cards")).toBeVisible();

  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(50);
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

test("permite recorrer el catálogo y alcanzar la barra masiva al hacer scroll", async ({
  page,
}) => {
  await openCatalog(page);

  const shell = page.locator(".table-shell");
  await shell.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => shell.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByTestId("select-filtered-products").click();
  const bulk = page.locator(".bulk-panel");
  await expect(bulk).toBeVisible();
  const pane = page.locator(".editor-pane");
  await bulk.scrollIntoViewIfNeeded();
  const paneBox = await pane.boundingBox();
  const bulkBox = await bulk.boundingBox();
  expect(paneBox).not.toBeNull();
  expect(bulkBox).not.toBeNull();
  expect(bulkBox?.y).toBeGreaterThanOrEqual((paneBox?.y ?? 0) - 1);
  expect(bulkBox?.y + (bulkBox?.height ?? 0)).toBeLessThanOrEqual(
    (paneBox?.y ?? 0) + (paneBox?.height ?? 0) + 1,
  );
  await expect(bulk.getByRole("button", { name: "Aplicar estado" })).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/editor-workbench/bulk-panel.png" });
});

test("P5-B5: archivar un producto inline y restaurarlo sin perder la fila", async ({ page }) => {
  await openCatalog(page);

  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const firstTrigger = page.getByTestId("ui-status-edit-trigger").first();
  const firstRowName = await rows.first().locator("td").nth(1).innerText();
  await firstTrigger.click();
  const statusSelect = page.getByTestId("ui-status-edit").first();
  await statusSelect.selectOption("archived");
  const labelAfter = rows.first().locator(".status-label");
  await expect(labelAfter).toContainText("Archivad");
  console.log("P5-B5 estado tras archivar:", JSON.stringify(await labelAfter.innerText()));

  const namesAfter = await rows.locator("td").nth(1).allInnerTexts();
  expect(namesAfter).toContain(firstRowName);

  const archivedTrigger = page.getByTestId("ui-status-edit-trigger").first();
  await archivedTrigger.click();
  const archivedSelect = page.getByTestId("ui-status-edit").first();
  await archivedSelect.selectOption("active");
  const labelRestored = rows.first().locator(".status-label");
  await expect(labelRestored).toContainText("Activo");
  console.log("P5-B5 estado tras restaurar:", JSON.stringify(await labelRestored.innerText()));
});

test("P5-B6: la búsqueda por término de estado filtra archivados", async ({ page }) => {
  await openCatalog(page);

  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const firstTrigger = page.getByTestId("ui-status-edit-trigger").first();
  await firstTrigger.click();
  const statusSelect = page.getByTestId("ui-status-edit").first();
  await statusSelect.selectOption("archived");
  await expect(rows.first().locator(".status-label")).toContainText("Archivad");

  const search = page.getByPlaceholder("Buscar por producto, marca o estado");
  await search.fill("archiv");
  const visibleLabels = page.locator("tbody tr .status-label");
  await expect
    .poll(
      async () =>
        (await visibleLabels.allInnerTexts()).every((label) =>
          label.toLowerCase().includes("archivad"),
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
  const labels = await visibleLabels.allInnerTexts();
  console.log("P5-B6 estados visibles tras buscar 'archiv':", JSON.stringify(labels.slice(0, 5)));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label.toLowerCase()).toContain("archivad");
  }

  await search.fill("");
  await expect(rows).toHaveCount(50);
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
