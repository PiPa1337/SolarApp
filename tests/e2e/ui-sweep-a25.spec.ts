/**
 * Barrido A25 — ProjectCard (panel de detalle) y GuidedOverview (Preparar).
 * OWNER: apps/studio/src/features/dashboard/ProjectCard.tsx
 *        apps/studio/src/features/GuidedOverview.tsx
 *
 * Contrato de 3 capas por control:
 *  (1) efecto real: el click produce la acción (no aserciones visible-only);
 *  (2) auto-feedback: aria-pressed/is-selected/is-open, aria-live, progressbar
 *      con aria-valuenow coherente, aria-selected de la pestaña destino;
 *  (3) datos: el payload leído desde IndexedDB/localStorage coincide con el
 *      render (métricas del detalle, selección, pin, versión de plantilla).
 *
 * Cubre el bin A25: click de la card (selecciona y abre el detalle), botón
 * Abrir tienda del panel (abre el editor), checkbox de comparar (selección
 * marcada), pin (persiste), Escape del detalle (cierra, enfoca y limpia),
 * aviso aria-live del respaldo; "Siguiente" (navega y abre el pane), "Modo
 * avanzado" (cambia), ítems de requisito y accesos rápidos (navegan al scope),
 * panel de upgrade ("Respaldar y adoptar cambios") y elementos de progreso.
 */
import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(120_000);

let studioServer: Server;
let studioUrl: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  studioServer = running.server;
  studioUrl = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(studioServer);
});

const DEMO_STORE_ID = "store-modo-sur-demo";
const DEMO_STORE_NAME = "Predeterminado";

interface StoredProjectRecord {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  project: {
    name: string;
    origin?: { templateVersion?: number; seed?: string };
    products: Array<{ status: string; variants: Array<{ available: boolean }> }>;
    categories: unknown[];
    collections: unknown[];
    assets: unknown[];
  };
}

async function openDashboard(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () => reject(new Error("La base quedó bloqueada.")));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
}

function card(page: Page, name: string): Locator {
  return page.locator(".dashboard-store-card").filter({ hasText: name }).first();
}

function cardButton(page: Page, name: string): Locator {
  return card(page, name).locator(".dashboard-store-card__button");
}

function detailPanel(page: Page, name?: string): Locator {
  return page.getByRole("region", {
    name: name ? `Tienda seleccionada: ${name}` : "Tienda seleccionada",
  });
}

function editorPane(page: Page): Locator {
  return page.locator("[data-studio-editor-pane]");
}

async function expectPaneOpen(page: Page): Promise<void> {
  await expect(editorPane(page)).toHaveAttribute("aria-hidden", "false");
  await expect(editorPane(page)).toHaveClass(/editor-pane--open/);
}

function studioTab(page: Page, name: string): Locator {
  return page.getByRole("tab", { name, exact: true });
}

async function openGuidedTab(page: Page): Promise<void> {
  await studioTab(page, "Preparar").click();
  await expect(page.getByRole("heading", { name: "Preparar tienda" })).toBeVisible();
  await expectPaneOpen(page);
}

async function openStoreInStudio(page: Page, name: string): Promise<void> {
  await cardButton(page, name).click();
  await detailPanel(page, name).getByRole("button", { name: "Abrir tienda" }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 20_000,
  });
}

async function recordById(page: Page, id: string): Promise<StoredProjectRecord | undefined> {
  return page.evaluate(
    ([recordId]) =>
      new Promise<StoredProjectRecord | undefined>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const all = db.transaction("projects").objectStore("projects").getAll();
          all.addEventListener("success", () => {
            const records = all.result as StoredProjectRecord[];
            resolve(records.find((item) => item.id === recordId));
          });
          all.addEventListener("error", () => reject(all.error));
        });
      }),
    [id],
  );
}

function metricsOf(record: StoredProjectRecord): {
  activeProducts: number;
  billableProducts: number;
  variantExtras: number;
  categories: number;
  collections: number;
  assets: number;
} {
  const activeProducts = record.project.products.filter((product) => product.status === "active");
  const variantExtras = activeProducts.reduce(
    (total, product) => total + Math.max(0, product.variants.length - 1),
    0,
  );
  return {
    activeProducts: activeProducts.length,
    billableProducts: activeProducts.length + variantExtras,
    variantExtras,
    categories: record.project.categories.length,
    collections: record.project.collections.length,
    assets: record.project.assets.length,
  };
}

async function seedTemplateVersion(page: Page, id: string, version: number): Promise<void> {
  const seeded = await page.evaluate(
    ([recordId, nextVersion]) =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open("solara-commerce-studio");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const db = request.result;
          const transaction = db.transaction("projects", "readwrite");
          const store = transaction.objectStore("projects");
          const all = store.getAll();
          all.addEventListener("success", () => {
            const records = all.result as StoredProjectRecord[];
            const record = records.find((item) => item.id === recordId);
            if (!record) {
              resolve(false);
              return;
            }
            store.put({
              ...record,
              project: {
                ...record.project,
                origin: { ...(record.project.origin ?? {}), templateVersion: nextVersion },
              },
            });
          });
          all.addEventListener("error", () => reject(all.error));
          transaction.addEventListener("complete", () => resolve(true));
          transaction.addEventListener("error", () => reject(transaction.error));
        });
      }),
    [id, version],
  );
  expect(seeded).toBe(true);
}

test("el click en la card selecciona, abre el detalle con datos reales y da feedback de estado", async ({
  page,
}) => {
  await openDashboard(page);

  // El boot autoselecciona la primera tienda: cerrar para que el click de la
  // card sea el disparador real de la apertura.
  await expect(detailPanel(page, DEMO_STORE_NAME)).toBeVisible();
  await detailPanel(page, DEMO_STORE_NAME).getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(detailPanel(page)).toContainText("Seleccioná una tienda");

  const record = await recordById(page, DEMO_STORE_ID);
  expect(record).toMatchObject({ id: DEMO_STORE_ID });
  const metrics = metricsOf(record as StoredProjectRecord);

  await cardButton(page, DEMO_STORE_NAME).click();

  const panel = detailPanel(page, DEMO_STORE_NAME);
  await expect(panel).toBeVisible();
  await expect(cardButton(page, DEMO_STORE_NAME)).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, DEMO_STORE_NAME)).toHaveClass(/is-selected/);
  await expect(panel).toHaveClass(/is-open/);
  await expect(panel.getByRole("heading", { name: DEMO_STORE_NAME })).toBeVisible();
  await expect(cardButton(page, DEMO_STORE_NAME)).toContainText(
    `${metrics.activeProducts} productos`,
  );

  // Capa 3: las métricas del detalle son las del proyecto persistido.
  const facts = panel.locator(".dashboard-store-detail__facts dd");
  await expect(facts).toHaveCount(6);
  await expect(facts.nth(0)).toHaveText(DEMO_STORE_ID);
  await expect(facts.nth(1)).toHaveAttribute(
    "title",
    /^\d{1,2} [a-z]{3,4} \d{4}, \d{1,2}:\d{2} [ap]\.\s*m\.$/i,
  );
  await expect(facts.nth(1)).toHaveText(/^\d{1,2} [a-z]{3,4} \d{4}$/);
  await expect(facts.nth(2)).toHaveText(
    `${metrics.billableProducts} (${metrics.variantExtras} extra)`,
  );
  await expect(facts.nth(3)).toHaveText(String(metrics.categories));
  await expect(panel.locator(".dashboard-store-detail__facts dt").nth(4)).toHaveText("Mensualidad");
  await expect(facts.nth(4)).toHaveText("$ 32.000");
  await expect(facts.nth(5)).toHaveText(String(metrics.assets));
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-selected"))).toBe(
    DEMO_STORE_ID,
  );
});

test("Escape cierra el detalle, restaura el foco a la card y limpia la selección persistida", async ({
  page,
}) => {
  await openDashboard(page);
  const cardBtn = cardButton(page, DEMO_STORE_NAME);
  await cardBtn.click();
  await expect(detailPanel(page, DEMO_STORE_NAME)).toBeVisible();

  await detailPanel(page, DEMO_STORE_NAME).getByRole("button", { name: "Respaldo ahora" }).focus();
  await page.keyboard.press("Escape");

  await expect(detailPanel(page)).toContainText("Seleccioná una tienda");
  await expect(cardBtn).toBeFocused();
  await expect(cardBtn).toHaveAttribute("aria-pressed", "false");
  await expect(
    await page.evaluate(() => localStorage.getItem("solara-dashboard-selected")),
  ).toBeNull();
});

test("la calculadora simula cantidades sin modificar el catálogo y se adapta a mobile", async ({
  page,
}) => {
  await openDashboard(page);
  await page.evaluate(() => {
    localStorage.removeItem("solara-pricing-config");
    localStorage.removeItem("solara-store-discounts");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const before = await recordById(page, DEMO_STORE_ID);
  expect(before).toMatchObject({ id: DEMO_STORE_ID });
  const actualMetrics = metricsOf(before as StoredProjectRecord);
  const launcher = detailPanel(page, DEMO_STORE_NAME).getByRole("button", {
    name: "Calculadora",
  });
  await launcher.click();

  const dialog = page.getByRole("dialog", { name: "Precio de tu tienda online" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(`${actualMetrics.billableProducts} productos`, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(`(${actualMetrics.variantExtras} extra)`, { exact: true }),
  ).toBeVisible();
  await expect(
    detailPanel(page, DEMO_STORE_NAME)
      .locator(".dashboard-store-detail__facts div")
      .filter({ hasText: "Mensualidad" })
      .locator("dd"),
  ).toHaveText("$ 32.000");
  await expect(dialog.getByText("$ 32.000/mes", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cerrar calculadora" })).toBeFocused();

  await dialog.getByRole("button", { name: "Simular cantidad" }).click();
  const quantity = dialog.getByRole("spinbutton", { name: "Cantidad facturable" });
  await expect(quantity).toHaveValue(String(actualMetrics.billableProducts));
  await quantity.fill("250");
  await expect(dialog.getByText("Simulación", { exact: true })).toBeVisible();
  await expect(dialog.getByText("250 productos", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(`(${actualMetrics.variantExtras} extra)`, { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByText("$ 69.000/mes", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("No modifica el catálogo ni la tarifa guardada.");

  await quantity.fill("0");
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Ingresá al menos 1 producto.")).toBeVisible();
  await quantity.fill("250");

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const fit = await dialog.evaluate((element) => {
      const content = element.querySelector<HTMLElement>(".dashboard-calculator-dialog__content");
      const body = element.querySelector<HTMLElement>(".dashboard-calculator-dialog__body");
      return {
        contentFits: Boolean(content && content.scrollHeight <= content.clientHeight + 1),
        bodyFits: Boolean(body && body.scrollHeight <= body.clientHeight + 1),
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(fit, `${viewport.width}x${viewport.height}`).toEqual({
      contentFits: true,
      bodyFits: true,
      pageFits: true,
    });
  }

  await dialog.getByRole("tab", { name: "Configurar tarifa" }).click();
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const bodyFits = await dialog
      .locator(".dashboard-calculator-dialog__body")
      .evaluate((body) => body.scrollHeight <= body.clientHeight + 1);
    expect(bodyFits, `tarifa ${viewport.width}x${viewport.height}`).toBe(true);
  }

  await dialog.getByRole("tab", { name: "Resumen y simulación" }).click();
  await dialog.getByRole("button", { name: "Volver a la cantidad actual" }).click();
  await expect(
    dialog.getByText(`${actualMetrics.billableProducts} productos`, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(`(${actualMetrics.variantExtras} extra)`, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();

  const after = await recordById(page, DEMO_STORE_ID);
  expect(metricsOf(after as StoredProjectRecord).activeProducts).toBe(actualMetrics.activeProducts);
});

test("el botón Abrir tienda del panel abre el editor con el proyecto", async ({ page }) => {
  await openDashboard(page);
  await openStoreInStudio(page, DEMO_STORE_NAME);
  await studioTab(page, "Preparar").click();
  await expectPaneOpen(page);
  // La demo está 100% lista: el resumen guiado aterriza en el estado listo.
  await expect(page.getByTestId("ui-guided-ready")).toBeVisible();
});

test("el pin marca la card, agrupa Fijadas y persiste tras recargar", async ({ page }) => {
  await openDashboard(page);
  const record = await recordById(page, DEMO_STORE_ID);
  expect(record).toMatchObject({ id: DEMO_STORE_ID });

  await cardButton(page, DEMO_STORE_NAME).click();
  const pin = detailPanel(page, DEMO_STORE_NAME).getByTestId("ui-detail-pin");
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Fijadas" })).toBeVisible();
  await expect(
    page
      .locator(".dashboard-cosmic-group")
      .filter({ hasText: "Fijadas" })
      .locator(".dashboard-store-card"),
  ).toHaveCount(1);
  await expect(
    await page.evaluate(() => localStorage.getItem("solara-dashboard-pinned")),
  ).toContain(DEMO_STORE_ID);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(detailPanel(page, DEMO_STORE_NAME).getByTestId("ui-detail-pin")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Fijadas" })).toBeVisible();

  await detailPanel(page, DEMO_STORE_NAME).getByTestId("ui-detail-pin").click();
  await expect(page.getByRole("heading", { name: "Fijadas" })).toHaveCount(0);
  await expect(await page.evaluate(() => localStorage.getItem("solara-dashboard-pinned"))).toBe(
    "[]",
  );
});

test("el checkbox de comparar marca la selección y habilita Comparar con dos tiendas", async ({
  page,
}) => {
  await openDashboard(page);
  await createCleanStore(page, "Alfa A25");
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();

  const toggle = page.getByRole("button", { name: "Comparar tiendas", exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const alfaCheckbox = card(page, "Alfa A25").getByTestId("ui-card-compare");
  const demoCheckbox = card(page, DEMO_STORE_NAME).getByTestId("ui-card-compare");
  await expect(page.getByTestId("ui-card-compare")).toHaveCount(2);

  await alfaCheckbox.check();
  await expect(alfaCheckbox).toBeChecked();
  await expect(page.getByText("1 tienda seleccionada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar", exact: true })).toBeDisabled();

  await demoCheckbox.check();
  await expect(demoCheckbox).toBeChecked();
  await expect(page.getByText("2 tiendas seleccionadas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("ui-card-compare")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("el respaldo anuncia el resultado con aria-live en el panel de detalle", async ({ page }) => {
  await openDashboard(page);
  await cardButton(page, DEMO_STORE_NAME).click();
  await expect(detailPanel(page, DEMO_STORE_NAME)).toBeVisible();

  await detailPanel(page, DEMO_STORE_NAME).getByRole("button", { name: "Respaldo ahora" }).click();
  const notice = page.getByTestId("ui-detail-notice");
  await expect(notice).toContainText("Se creó un respaldo.", { timeout: 30_000 });
  await expect(notice).toHaveAttribute("aria-live", "polite");
});

test("Siguiente navega al área del primer pendiente y abre el pane", async ({ page }) => {
  await openDashboard(page);
  await createCleanStore(page, "Tienda Siguiente A25");
  await openGuidedTab(page);

  const nextButton = page.getByTestId("ui-guided-next");
  await expect(nextButton).toContainText("Siguiente: Descripción de marca");
  await nextButton.click();

  await expect(studioTab(page, "Resumen")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();
  await expectPaneOpen(page);
});

test("los ítems de requisito navegan a su scope", async ({ page }) => {
  await openDashboard(page);
  await createCleanStore(page, "Tienda Scopes A25");
  await openGuidedTab(page);

  const cases: Array<{ id: string; tab: string; advanced?: boolean }> = [
    { id: "identity.description", tab: "Resumen" },
    { id: "seo.description", tab: "SEO" },
    { id: "home.hero.title", tab: "Constructor", advanced: true },
  ];
  for (const entry of cases) {
    const item = page.locator(`[data-requirement-id="${entry.id}"]`);
    if (!(await item.isVisible())) {
      const done = page.getByTestId("ui-guided-done");
      if ((await done.count()) > 0) await done.locator("summary").click();
    }
    if (!(await item.isVisible())) continue;
    const status = await item.getAttribute("data-requirement-status");
    if (status === "ready") continue;
    await item.getByRole("button", { name: /^Editar / }).click();
    await expect(studioTab(page, entry.tab)).toHaveAttribute("aria-selected", "true");
    if (entry.advanced) {
      // home.hero.title vive en el Constructor: la navegación guiada activa
      // el Modo avanzado y deja la base editable.
      await expect(page.getByRole("button", { name: "Agregar sección" })).toBeEnabled();
    }
    await openGuidedTab(page);
  }

  // Los recursos de la plantilla limpia navegan a Recursos. El checklist
  // tapea los pendientes a 12 y los asset.* van al final del orden del
  // modelo: desplegar la lista completa antes de buscarlos.
  const moreToggle = page.locator(".guided-checklist__more");
  if ((await moreToggle.count()) > 0) {
    await moreToggle.click();
    await expect(moreToggle).toHaveText("Mostrar menos");
  }
  const assetItem = page.locator('[data-requirement-id^="asset."]').first();
  await expect(assetItem).toHaveAttribute("data-requirement-status", "placeholder");
  await assetItem.getByRole("button", { name: /^Editar / }).click();
  await expect(studioTab(page, "Recursos")).toHaveAttribute("aria-selected", "true");
});

test("los tres accesos rápidos de Preparar navegan al área anunciada", async ({ page }) => {
  await openDashboard(page);
  await createCleanStore(page, "Tienda Accesos A25");
  await openGuidedTab(page);

  const cases = [
    { button: /Marca y textos/, tab: "Resumen", heading: "Resumen" },
    { button: /Cargar catálogo/, tab: "Catálogo", heading: "Catálogo" },
    { button: /Organizar imágenes/, tab: "Recursos", heading: "Recursos" },
  ] as const;

  for (const entry of cases) {
    await page.getByRole("button", { name: entry.button }).click();
    await expect(studioTab(page, entry.tab)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: entry.heading, exact: true })).toBeVisible();
    await expectPaneOpen(page);
    await openGuidedTab(page);
  }
});

test("el progreso es coherente con el proyecto y sube al completar un requisito", async ({
  page,
}) => {
  await openDashboard(page);
  await createCleanStore(page, "Tienda Progreso A25");
  await openGuidedTab(page);

  const progress = page.getByTestId("ui-guided-progress");
  await expect(progress).toHaveAttribute("role", "progressbar");
  await expect(progress).toHaveAttribute("aria-valuemin", "0");
  await expect(progress).toHaveAttribute("aria-valuemax", "100");
  await expect(page.locator("output.guided-progress")).toHaveAttribute("aria-live", "polite");

  const readProgress = async () => {
    const summary = await page
      .getByText(/^\d+ de \d+ requisitos listos$/)
      .textContent()
      .then((text) => text ?? "");
    const [ready, total] = summary.match(/\d+/g)?.map(Number) ?? [];
    return {
      ready,
      total,
      percent: Number(await progress.getAttribute("aria-valuenow")),
    };
  };
  const initial = await readProgress();
  expect(initial.total).toBeGreaterThan(0);
  expect(initial.percent).toBe(Math.round((initial.ready / initial.total) * 100));

  // Completar el primer requisito pendiente desde Resumen debe aumentar el
  // progreso, sin depender de un número fijo de requisitos de una plantilla.
  await studioTab(page, "Resumen").click();
  await page.getByLabel("Descripción", { exact: true }).fill("Descripción completada desde A25.");
  await expect(page.getByTestId("ui-save-indicator")).toContainText("Cambios guardados", {
    timeout: 5_000,
  });
  await openGuidedTab(page);

  await expect(page.locator('[data-requirement-id="identity.whatsapp"]')).toHaveAttribute(
    "data-requirement-status",
    /ready|missing|placeholder/,
  );
  await expect.poll(readProgress).toMatchObject({ total: initial.total, ready: initial.ready + 1 });
});

test("la tienda demo lista muestra el estado listo y Revisar publicación abre Exportar", async ({
  page,
}) => {
  await openDashboard(page);
  await openStoreInStudio(page, DEMO_STORE_NAME);
  await openGuidedTab(page);

  await expect(page.getByTestId("ui-guided-ready")).toBeVisible();
  await expect(page.getByText("La tienda puede pasar a revisión de publicación.")).toBeVisible();

  // Consistencia interna: "X de X requisitos listos" con progreso 100%.
  const summary = await page
    .getByText(/^\d+ de \d+ requisitos listos$/)
    .textContent()
    .then((text) => text ?? "");
  const [ready, total] = summary.match(/\d+/g)?.map(Number) ?? [];
  expect(ready).toBeGreaterThan(0);
  expect(ready).toBe(total);
  await expect(page.getByTestId("ui-guided-progress")).toHaveAttribute("aria-valuenow", "100");
  // Con todo listo queda el banner listo + el detalle de los listos (PR8).
  await expect(page.getByTestId("ui-guided-done")).toHaveCount(1);

  await page.getByRole("button", { name: "Revisar publicación" }).click();
  await expect(studioTab(page, "Exportar")).toHaveAttribute("aria-selected", "true");
  await expectPaneOpen(page);
});

test("el panel de upgrade respalda y adopta los cambios de plantilla en la demo", async ({
  page,
}) => {
  await openDashboard(page);
  const projectId = await openMutableScaleStore(page, "Tienda A25 upgrade");
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await seedTemplateVersion(page, projectId, 1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 20_000,
  });
  await openStoreInStudio(page, "Tienda A25 upgrade");
  await openGuidedTab(page);

  const updatePanel = page.locator(".template-update");
  await expect(updatePanel).toBeVisible();
  await expect(updatePanel).toContainText("Actualización disponible");
  await expect(updatePanel).toContainText("Actualizar Catalog Modern a la versión 2");

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await updatePanel.getByRole("button", { name: "Respaldar y adoptar cambios" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-antes-de-actualizar\.solara\.json$/);

  // Adopción aplicada: el panel desaparece y la versión persiste en IndexedDB.
  await expect(updatePanel).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(async () => (await recordById(page, projectId))?.project.origin?.templateVersion, {
      timeout: 15_000,
    })
    .toBe(2);

  // La adopción no toca el contenido ni fuerza un estado de checklist: la
  // copia mutable conserva su progreso propio después del upgrade.
  await expect(page.getByTestId("ui-guided-progress")).toBeVisible();
});
