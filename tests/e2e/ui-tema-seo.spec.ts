import type { Server } from "node:http";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore, resetStudioIndexedDb } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

/**
 * F10 — Regresión de controles de Tema y SEO (hallazgo H8-B1).
 * Presets con paleta real en el preview, reset a los valores de apertura,
 * rechazo de hex inválido con error inline, y persistencia del título SEO.
 */

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

async function setupCleanStore(page: Page, name: string): Promise<void> {
  await resetStudioIndexedDb(page, studioUrl);
  await createCleanStore(page, name);
}

async function openThemeTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Tema de la tienda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tema de la tienda", exact: true })).toBeVisible();
}

function fieldsetOf(input: Locator): Locator {
  return input.locator("xpath=ancestor::fieldset[contains(@class, 'field')]");
}

function previewBackground(page: Page): () => Promise<string> {
  const html = page.frameLocator("iframe").locator("html");
  return () =>
    html.evaluate((element) => getComputedStyle(element).backgroundColor).catch(() => "");
}

test("los presets de Tema aplican la paleta real al preview (H8-09)", async ({ page }) => {
  await setupCleanStore(page, "Tienda paleta");
  await openThemeTab(page);

  const accentText = page.getByTestId("ui-color-text-accent");
  const background = previewBackground(page);
  await expect.poll(background, { timeout: 15_000 }).toBe("rgb(247, 245, 240)");

  await page.getByRole("button", { name: "Aplicar paleta Terracota solar" }).click();

  await expect(accentText).toHaveValue("#9a442c");
  await expect(page.getByTestId("ui-color-text-background")).toHaveValue("#fff5ee");
  await expect.poll(background, { timeout: 15_000 }).toBe("rgb(255, 245, 238)");
});

test("el preset aplicado queda marcado como seleccionado en el panel (feedback visible)", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda selección");
  await openThemeTab(page);

  const presets = page.getByTestId("ui-theme-preset");

  await page.getByRole("button", { name: "Aplicar paleta Azul lavanda" }).click();

  const lavenderBlue = presets.filter({ hasText: "Azul lavanda" });
  await expect(lavenderBlue).toHaveAttribute("aria-pressed", "true");
  await expect(lavenderBlue).toHaveAttribute("data-active", "true");
  // La marca "✓ Aplicada" vive en el pseudo-elemento ::after.
  await expect
    .poll(() => lavenderBlue.evaluate((el) => getComputedStyle(el, "::after").content))
    .toContain("Aplicada");

  const editorial = presets.filter({ hasText: "Marfil editorial" });
  await expect(editorial).toHaveAttribute("aria-pressed", "false");

  // El preview y el input de fondo reflejan la paleta aplicada.
  await expect(page.getByTestId("ui-color-text-background")).toHaveValue("#eef1fa");
  await expect.poll(previewBackground(page), { timeout: 15_000 }).toBe("rgb(238, 241, 250)");
});

test("Restaurar colores vuelve a los valores de apertura de la pestaña (H8-10)", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda reset");
  await openThemeTab(page);

  const accentText = page.getByTestId("ui-color-text-accent");
  const backgroundText = page.getByTestId("ui-color-text-background");
  const originalAccent = await accentText.inputValue();
  const originalBackground = await backgroundText.inputValue();

  await page.getByRole("button", { name: "Aplicar paleta Jardín de salvia" }).click();
  await expect(accentText).toHaveValue("#356248");
  await expect(backgroundText).toHaveValue("#f1f6f0");

  await page.getByTestId("ui-reset-colors").click();
  await expect(accentText).toHaveValue(originalAccent);
  await expect(backgroundText).toHaveValue(originalBackground);
  await expect.poll(previewBackground(page), { timeout: 15_000 }).toBe("rgb(247, 245, 240)");
});

test("un color hex inválido muestra error inline y no commitea (H8-B1)", async ({ page }) => {
  await setupCleanStore(page, "Tienda hex inválido");
  await openThemeTab(page);

  const accentText = page.getByTestId("ui-color-text-accent");
  const accentNative = page.getByTestId("ui-color-native-accent");
  const accentField = fieldsetOf(accentText);
  const originalAccent = await accentText.inputValue();
  const originalNative = await accentNative.inputValue();

  await accentText.fill("zzz");
  await expect(accentText).toHaveAttribute("aria-invalid", "true");
  await expect(accentField.getByTestId("ui-field-error")).toContainText("Ingresá un color hex");
  await expect(accentText).toHaveValue("zzz");
  await expect(accentNative).toHaveValue(originalNative);
  await expect(page.getByTestId("ui-contrast-warn")).toHaveCount(0);

  await accentText.fill("#12345");
  await expect(accentField.getByTestId("ui-field-error")).toContainText("Ingresá un color hex");
  await expect(accentNative).toHaveValue(originalNative);

  await accentText.fill("#B4552D");
  await expect(accentField.getByTestId("ui-field-error")).toHaveCount(0);
  await expect(accentText).toHaveValue("#b4552d");
  await expect(accentNative).toHaveValue("#b4552d");

  await accentText.fill("#fff");
  await expect(accentText).toHaveValue("#ffffff");
  await expect(accentNative).toHaveValue("#ffffff");

  await accentText.fill(originalAccent);
  await expect(accentText).toHaveValue(originalAccent);
  await expect(accentNative).toHaveValue(originalNative);
});

test("el título SEO persiste al cambiar de pestaña (H8-01)", async ({ page }) => {
  await setupCleanStore(page, "Tienda SEO");
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();

  const title = page.getByLabel("Título SEO");
  await title.fill("Título SEO auditoría F10");
  await expect(page.getByText("24/70 caracteres")).toBeVisible();

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByLabel("Título SEO")).toHaveValue("Título SEO auditoría F10");
});

test("los pares de color del Tema tienen nombres accesibles independientes", async ({ page }) => {
  await setupCleanStore(page, "Tienda colores accesibles");
  await openThemeTab(page);

  await expect(page.getByLabel("Fondo selector de color")).toHaveValue("#f7f5f0");
  await expect(page.getByLabel("Fondo valor hexadecimal")).toHaveValue("#f7f5f0");
  await expect(page.getByLabel("Texto secundario selector de color")).toBeVisible();
  await expect(page.getByLabel("Texto secundario valor hexadecimal")).toBeVisible();
});

test("SEO comunica el estado de auditoría y agrupa el diagnóstico y las previews", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda SEO estados");
  await page.getByRole("tab", { name: "SEO", exact: true }).click();

  const status = page.getByTestId("ui-seo-audit-state");
  const score = page.locator(".seo-header-score");
  const audit = page.getByTestId("ui-seo-audit-panel");
  const previews = page.getByTestId("ui-seo-preview-google");

  await expect(status).toBeVisible();
  await expect(status).toContainText(/\d+ advertencias|\d+ críticos|Sin observaciones/);
  await expect(score).toHaveAccessibleName(/Score SEO: \d+\/100/);
  await expect(audit).toBeVisible();
  await expect(audit).toContainText(/\d+ errores críticos, \d+ advertencias/);
  await expect(page.locator(".workspace-group").filter({ has: audit })).toHaveAttribute(
    "aria-label",
    "Diagnóstico",
  );
  await expect(page.locator(".workspace-group").filter({ has: previews })).toHaveAttribute(
    "aria-label",
    "Apariencia en buscadores",
  );
  const auditSeverity = audit.locator(".audit-item__severity");
  if (await auditSeverity.count()) {
    await expect(auditSeverity.first()).toHaveText(/Crítico|Advertencia|Información/);
    await expect(audit.locator(".audit-item__meta").first()).not.toContainText("Área:");
    await expect(audit.locator(".audit-item__meta").first()).not.toContainText("Resolver en:");
  }

  const groupOrder = await page
    .locator(".workspace-group")
    .evaluateAll((groups) => groups.map((group) => group.getAttribute("aria-label")));
  expect(groupOrder).toEqual([
    "Apariencia en buscadores",
    "Diagnóstico",
    "Publicación y rastreo",
  ]);
  const diagnosticNavigation = page
    .getByRole("navigation", { name: "Herramientas SEO" })
    .getByRole("button", { name: "Diagnóstico" });
  await diagnosticNavigation.click();
  await expect(diagnosticNavigation).toHaveAttribute("aria-current", "location");
  await expect(audit).toBeInViewport();
});

test("las incidencias SEO conservan metadata legible sin overflow en mobile", async ({ page }) => {
  await setupCleanStore(page, "Tienda SEO mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "SEO", exact: true }).click();

  const audit = page.getByTestId("ui-seo-audit-panel");
  await expect(audit).toBeVisible();
  const issueCount = await audit.locator(".audit-item").count();
  if (issueCount > 0) {
    await expect(audit.locator(".audit-item__severity").first()).toHaveText(
      /Crítico|Advertencia|Información/,
    );
    await expect(audit.locator(".audit-item__meta").first()).not.toContainText("Área:");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("los accesos de auditoría SEO navegan y devuelven el foco al tab destino", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda SEO foco");
  await page.getByRole("tab", { name: "SEO", exact: true }).click();

  const fix = page.getByTestId("ui-seo-audit-fix").first();
  await expect(fix).toBeVisible();
  const fixLabel = await fix.getAttribute("aria-label");
  const destination = fixLabel?.match(/^Ir a (.+?) para resolver:/)?.[1];
  if (!destination)
    throw new Error(`Destino de auditoría SEO inesperado: ${fixLabel ?? "sin aria-label"}`);
  await fix.click();

  const destinationTab = page.getByRole("tab", { name: destination, exact: true });
  await expect(destinationTab).toHaveAttribute("aria-selected", "true");
  await expect(destinationTab).toBeFocused();
});

test("R3-P7-B5: las vistas previas de Google/OG/WhatsApp reflejan el título de la home", async ({
  page,
}) => {
  await setupCleanStore(page, "Tienda Previews");
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  const homeTitleInput = page.locator('input[aria-label="Título SEO"]').first();
  await expect(homeTitleInput).toBeVisible();
  await homeTitleInput.fill("Título único de la vista previa");

  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();

  const google = page.getByTestId("ui-seo-preview-google");
  const og = page.getByTestId("ui-seo-preview-og");
  const whatsapp = page.getByTestId("ui-seo-preview-whatsapp");
  await expect(google).toBeVisible();
  await expect
    .poll(() => google.innerText(), { timeout: 15_000 })
    .toContain("Título único de la vista previa");
  await expect(og).toContainText("Título único de la vista previa");
  await expect(whatsapp).toContainText("Título único de la vista previa");
  console.log("R3-P7-B5 las tres vistas previas reflejan el título de la home");
});

test("R4-P7-B5: la descripción SEO muestra el contador y recorta a 180", async ({ page }) => {
  await setupCleanStore(page, "Tienda Desc SEO");
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();

  const description = page.getByLabel("Descripción SEO");
  await description.fill("a".repeat(200));
  const value = await description.inputValue();
  const hint = await page
    .getByText(/\/180 caracteres/)
    .first()
    .innerText();
  console.log("R4-P7-B5 largo del campo:", value.length, "| hint:", JSON.stringify(hint));
  expect(value.length).toBeLessThanOrEqual(180);
  expect(hint).toMatch(/\d+\/180 caracteres/);
});
