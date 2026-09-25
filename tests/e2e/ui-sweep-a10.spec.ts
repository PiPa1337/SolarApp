/**
 * A10 — Barrido total de controles (2026-08-10): Builder, controles de picker
 * y alta de secciones. Verifica el contrato de 3 capas: (1) efecto real
 * (estado/datos/preview, no "visible-only"), (2) auto-feedback del control
 * (aria-expanded, dialog, slot label, foco devuelto, panel de error), y
 * (3) contrato de datos (settings contra el schema del módulo).
 *
 * Cobertura del bin A10:
 *  - "Agregar sección" abre el picker con aria-expanded/dialog.
 *  - Búsqueda de módulos filtra y muestra el estado vacío.
 *  - Elegir un módulo lo agrega al slot elegido (label visible + preview).
 *  - Restricción de slot: incompatibles deshabilitados con motivo.
 *  - Cierre por Cancelar / Escape / click fuera: dialog cerrado + foco devuelto.
 *  - Restaurar valores por defecto: feedback visible en inspector y preview.
 *  - Sección con esquema inválido: panel de error del Builder (settings que no
 *    superan el schema del módulo, seedeados vía IndexedDB) y limpieza al
 *    corregir; el motion fuera de rango se rechaza en el borde del Studio con
 *    error visible y sin commit; los valores válidos llegan al preview y
 *    persisten.
 *  - Regresiones: cambio de página reclama el slot del selector y el botón
 *    Cancelar cierra el diálogo como las demás vías de cierre.
 */
import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 90_000 : 45_000);

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

async function openBuilder(page: Page): Promise<string> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  const projectId = await openMutableScaleStore(page, "Tienda A10 mutable");
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();
  return projectId;
}

const sectionsList = (page: Page) => page.getByRole("list", { name: "Secciones de la tienda" });
const previewFrame = (page: Page) => page.frameLocator('iframe[title="Vista previa desktop"]');
const picker = (page: Page) => page.getByTestId("ui-module-picker");
const addButton = (page: Page) => page.getByRole("button", { name: "Agregar sección" });

async function openPicker(page: Page): Promise<Locator> {
  await addButton(page).click();
  const dialog = picker(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectHero(page: Page) {
  const hero = sectionsList(page).getByRole("listitem").filter({ hasText: "Hero de catálogo" });
  await hero.getByRole("button").first().click();
}

test("agregar sección abre el picker como diálogo con aria-expanded coherente", async ({
  page,
}) => {
  await openBuilder(page);
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");

  const dialog = await openPicker(page);
  await expect(dialog).toHaveRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-label", "Elegir módulo de sección");
  await expect(dialog.getByLabel("Buscar módulo")).toBeFocused();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "true");
});

test("la búsqueda filtra módulos y reporta el estado vacío", async ({ page }) => {
  await openBuilder(page);
  const dialog = await openPicker(page);

  await dialog.getByLabel("Buscar módulo").fill("detalle moderno");
  await expect(dialog.getByRole("button", { name: /Detalle moderno de producto/ })).toHaveCount(1);

  await dialog.getByLabel("Buscar módulo").fill("zzz-inexistente");
  await expect(dialog.getByText(/No hay módulos que coincidan/)).toBeVisible();
  await expect(dialog.getByText(/zzz-inexistente/)).toBeVisible();
});

test("elegir un módulo lo agrega al slot indicado y el preview lo refleja", async ({ page }) => {
  await openBuilder(page);
  const sections = sectionsList(page);
  const initialCount = await sections.getByRole("listitem").count();

  await page.getByLabel("Tipo de sección").selectOption("catalog");
  const dialog = await openPicker(page);
  await dialog.getByLabel("Buscar módulo").fill("mosaico");
  await dialog.getByRole("button", { name: /Mosaico de categorías/ }).click();

  await expect(dialog).toBeHidden();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(sections.getByRole("listitem")).toHaveCount(initialCount + 1);

  const added = sections.getByRole("listitem").last();
  await expect(added).toContainText("Mosaico de categorías");
  await expect(added.locator(".section-select span")).toHaveText("Catálogo");
  await expect(page.locator(".inspector header span")).toHaveText("Catálogo");

  const addedId = await added.locator(".section-select").getAttribute("data-section-select");
  expect(addedId).toMatch(/\S+/);
  await expect(
    previewFrame(page).locator(
      `[data-solara-section="${addedId}"][data-solara-module="catalog-category-bento"]`,
    ),
  ).toBeVisible({ timeout: 15_000 });
});

test("los módulos incompatibles con el slot quedan bloqueados con motivo", async ({ page }) => {
  await openBuilder(page);
  await page.getByLabel("Tipo de sección").selectOption("cart");
  const dialog = await openPicker(page);

  await dialog.getByLabel("Buscar módulo").fill("detalle");
  const blocked = dialog.getByRole("button", { name: /Detalle moderno de producto/ });
  await expect(blocked).toBeDisabled();
  await expect(blocked).toContainText("No compatible con «Carrito»");

  await dialog.getByLabel("Buscar módulo").fill("carrito");
  await expect(dialog.getByRole("button", { name: /Carrito moderno/ })).toBeEnabled();
});

test("Escape cierra el picker y devuelve el foco al botón de agregar", async ({ page }) => {
  await openBuilder(page);
  const dialog = await openPicker(page);
  await dialog.getByLabel("Buscar módulo").fill("hero");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(addButton(page)).toBeFocused();
});

test("Cancelar cierra el picker y devuelve el foco al botón de agregar", async ({ page }) => {
  await openBuilder(page);
  const dialog = await openPicker(page);
  await dialog.getByLabel("Buscar módulo").fill("hero");

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(addButton(page)).toBeFocused();
});

test("un click fuera del picker lo cierra y devuelve el foco al botón", async ({ page }) => {
  await openBuilder(page);
  const dialog = await openPicker(page);

  // El overlay del picker cubre la parte derecha del encabezado; se usa el
  // título del panel (fuera del picker y del botón) como objetivo neutral.
  await page.getByRole("heading", { name: "Constructor" }).click();
  await expect(dialog).toBeHidden();
  await expect(addButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(addButton(page)).toBeFocused();
});

test("V2 mantiene Home como única página editable del Constructor", async ({ page }) => {
  await openBuilder(page);
  const pageSelector = page.getByLabel("Página de edición");

  await expect(pageSelector).toHaveValue("home");
  await expect(pageSelector.locator("option")).toHaveCount(1);
  await expect(pageSelector.locator('option[value="about"]')).toHaveCount(0);
  await expect(pageSelector.locator('option[value="contact"]')).toHaveCount(0);
});

test("restaurar valores por defecto revierte la sección con feedback visible", async ({ page }) => {
  await openBuilder(page);
  await selectHero(page);

  const title = page.getByRole("textbox", { name: "Título", exact: true }).first();
  const body = page.getByRole("textbox", { name: "Descripción", exact: true }).first();
  await title.fill("Título del barrido");
  await body.fill("Cuerpo del barrido");
  await expect(previewFrame(page).locator('[data-solara-module="catalog-hero"] h1')).toHaveText(
    "Título del barrido",
    { timeout: 15_000 },
  );

  await page.getByRole("button", { name: "Restaurar valores por defecto" }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Restaurar valores por defecto" });
  await expect(restoreDialog).toBeVisible();
  await expect(restoreDialog.locator(".confirm-dialog__body")).toContainText("configuración");
  await restoreDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(title).toHaveValue("Título del barrido");
  await page.getByRole("button", { name: "Restaurar valores por defecto" }).click();
  await page
    .getByRole("dialog", { name: "Restaurar valores por defecto" })
    .getByRole("button", { name: "Restaurar valores", exact: true })
    .click();
  await expect(title).toHaveValue("Vestite con lo que te representa.");
  await expect(body).toHaveValue("Prendas elegidas para acompañarte todos los días.");
  await expect(previewFrame(page).locator('[data-solara-module="catalog-hero"] h1')).toHaveText(
    "Vestite con lo que te representa.",
    { timeout: 15_000 },
  );
});

test("un motion fuera de rango no se commitea y el studio avisa el error de schema", async ({
  page,
}) => {
  await openBuilder(page);
  await selectHero(page);

  // El límite del proyecto (distancia máx. 160) se aplica en el borde del
  // Studio: el commit se rechaza, el input vuelve al valor guardado (18 en el
  // fixture) y el error de schema aparece sin marcar cambios pendientes.
  const distance = page.getByRole("spinbutton", { name: "Distancia" });
  await expect(distance).toHaveValue("18");
  await distance.fill("999");
  await expect(distance).toHaveValue("18");
  await expect(
    page.getByTestId("ui-inline-error").filter({ hasText: "motion.distance" }),
  ).toBeVisible();
  await expect(page.getByText("Cambios pendientes", { exact: true })).toHaveCount(0);
});

test("los controles de movimiento válidos actualizan preview y persisten", async ({ page }) => {
  const projectId = await openBuilder(page);
  await selectHero(page);

  const preset = page.getByRole("combobox", { name: "Preset" });
  const intensity = page.getByRole("slider", { name: /^Intensidad / });
  const duration = page.getByRole("spinbutton", { name: "Duración" });
  const distance = page.getByRole("spinbutton", { name: "Distancia" });
  const once = page.getByRole("checkbox", { name: "Ejecutar una vez" });

  await preset.selectOption("fade");
  await intensity.fill("7");
  await duration.fill("0.8");
  await distance.fill("42");
  await once.uncheck();

  const hero = previewFrame(page).locator('[data-solara-module="catalog-hero"]');
  await expect(hero).toHaveAttribute("data-motion-preset", "fade", { timeout: 15_000 });
  await expect(hero).toHaveAttribute("data-motion-intensity", "0.7");
  await expect(hero).toHaveAttribute("data-motion-distance", "42");
  await expect(hero).toHaveAttribute("data-motion-once", "false");
  await expect(hero).toHaveAttribute("style", /--motion-duration:800ms/);

  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            new Promise<Record<string, unknown> | null>((resolve, reject) => {
              const request = indexedDB.open("solara-commerce-studio");
              request.addEventListener("error", () => reject(request.error));
              request.addEventListener("success", () => {
                const db = request.result;
                const get = db.transaction("projects").objectStore("projects").get(id);
                get.addEventListener("success", () => {
                  const section = get.result?.project?.sections?.find(
                    (candidate: { moduleId?: string }) => candidate.moduleId === "catalog-hero",
                  );
                  db.close();
                  resolve(section?.motion ?? null);
                });
                get.addEventListener("error", () => reject(get.error));
              });
            }),
          projectId,
        ),
      { timeout: 15_000 },
    )
    .toMatchObject({ preset: "fade", intensity: 7, duration: 0.8, distance: 42, once: false });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({ timeout: 20_000 });
  await page.locator(`[data-store-card-id="${projectId}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor" }).click();
  await selectHero(page);

  await expect(page.getByRole("combobox", { name: "Preset" })).toHaveValue("fade");
  await expect(page.getByRole("slider", { name: "Intensidad 7" })).toHaveValue("7");
  await expect(page.getByRole("spinbutton", { name: "Duración" })).toHaveValue("0.8");
  await expect(page.getByRole("spinbutton", { name: "Distancia" })).toHaveValue("42");
  await expect(page.getByRole("checkbox", { name: "Ejecutar una vez" })).not.toBeChecked();
});

async function seedInvalidHeroSettings(page: Page, projectId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const openDatabase = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        // Sin versión fija: la base puede haber sido migrada por un release
        // (p. ej. versión 40) y sólo escribimos en el store `projects`.
        const request = indexedDB.open("solara-commerce-studio");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const read = async (db: IDBDatabase) =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = db.transaction("projects", "readonly").objectStore("projects").getAll();
        request.onsuccess = () => resolve(request.result as Array<Record<string, unknown>>);
        request.onerror = () => reject(request.error);
      });
    const write = async (db: IDBDatabase, record: Record<string, unknown>) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("projects", "readwrite");
        transaction.objectStore("projects").put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

    const database = await openDatabase();
    const records = await read(database);
    const demo = records.find((record) => record.id === id);
    if (!demo) throw new Error("No se encontró la tienda demo para seedear.");
    const project = demo.project as {
      sections: Array<{ moduleId: string; settings: Record<string, unknown> }>;
    };
    const hero = project.sections.find((section) => section.moduleId === "catalog-hero");
    if (!hero) throw new Error("No se encontró la sección hero para seedear.");
    // Settings inválidos para el schema del módulo (pero válidos para el
    // proyecto): el caso real de un respaldo que envejeció respecto del módulo.
    hero.settings = { ...hero.settings, mode: "invalid-mode" };
    await write(database, demo);
    database.close();
  }, projectId);
  await page.reload();
}

test("una sección con settings inválidos para su módulo muestra el panel de error y se limpia al corregir", async ({
  page,
}) => {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  const projectId = await openMutableScaleStore(page, "Tienda A10 inválida");
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await seedInvalidHeroSettings(page, projectId);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });

  await page.locator(`[data-store-card-id="${projectId}"]`).click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Constructor" }).click();
  await expect(page.getByRole("heading", { name: "Constructor" })).toBeVisible();

  await selectHero(page);
  const panel = page.getByTestId("ui-section-schema-error");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("mode");

  // Corregir el campo inválido valida la sección y limpia el panel.
  await page.getByLabel("Modo", { exact: true }).selectOption("video");
  await expect(panel).toBeHidden();
  await expect(previewFrame(page).locator('[data-solara-module="catalog-hero"]')).toBeVisible({
    timeout: 15_000,
  });
});
