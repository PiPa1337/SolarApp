/**
 * Auditoría Tema T2 (2026-08-10) — Colores del tema: 7 tokens × 2 controles.
 * Para cada token (background/surface/text/muted/accent/accentText/border):
 *   1. editar el input de texto → la variable CSS --solara-<token> computada
 *      del preview cambia al valor nuevo;
 *   2. editar el picker nativo (input type=color) → el mismo efecto en el
 *      preview y el texto del input se sincroniza con el color confirmado;
 *   3. el sitio exportado: exportProject() ANTES y DESPUÉS (patrón
 *      exported-store.spec.ts) y la declaración --solara-<token> del
 *      assets/storefront.css debe cambiar (diff CSS antes/después);
 *   4. utilidad: el CSS exportado debe CONTENER un consumidor
 *      var(--solara-<token>) (la declaración sola no alcanza: la variable
 *      tiene que usarse en el sitio público);
 *   5. hex inválido → error inline (ui-field-error, role=alert) y el color
 *      confirmado NO cambia (ni preview ni sitio); al reescribir un hex
 *      válido el error desaparece y el token se commitea de nuevo.
 */
import type { Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { referenceStore } from "@solara/project-schema/fixture";
import { readHashedStorefrontCss } from "./export-helpers";
import { createCleanStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 90_000 : 60_000);

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

type ThemeColorKey =
  | "background"
  | "surface"
  | "text"
  | "muted"
  | "accent"
  | "accentText"
  | "border";
type ThemeColors = Record<ThemeColorKey, string>;

const COLOR_LABELS: Record<ThemeColorKey, string> = {
  background: "Fondo",
  surface: "Superficie",
  text: "Texto",
  muted: "Texto secundario",
  accent: "Acento",
  accentText: "Texto sobre acento",
  border: "Borde",
};

const THEME_COLOR_KEYS: readonly ThemeColorKey[] = [
  "background",
  "surface",
  "text",
  "muted",
  "accent",
  "accentText",
  "border",
];

/** Sufijo de la variable CSS del sitio para cada token del proyecto. */
const VAR_SUFFIX: Record<ThemeColorKey, string> = {
  background: "background",
  surface: "surface",
  text: "text",
  muted: "muted",
  accent: "accent",
  accentText: "accent-text",
  border: "border",
};

const COLOR_ERROR = "Ingresá un color hex como #1a2b3c.";

/**
 * Valores de prueba por token: hex válidos de 6 dígitos, distintos entre sí y
 * distintos de la paleta default (Marfil editorial) del fixture.
 */
const TEXT_TARGET: ThemeColors = {
  background: "#17324d",
  surface: "#2a4458",
  text: "#0a1220",
  muted: "#5a6b7c",
  accent: "#0e7c4f",
  accentText: "#f4f7fa",
  border: "#9db1c4",
};

const PICKER_TARGET: ThemeColors = {
  background: "#204060",
  surface: "#33526b",
  text: "#111c2e",
  muted: "#6c7d8e",
  accent: "#12885e",
  accentText: "#eef4fb",
  border: "#aebfd0",
};

async function setupCleanStore(page: Page, name: string): Promise<void> {
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
  await createCleanStore(page, name);
}

async function openThemeTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Tema de la tienda", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tema de la tienda", exact: true })).toBeVisible();
}

/** Colores confirmados del proyecto: los pickers nativos reflejan el commit. */
async function readCommittedColors(page: Page): Promise<ThemeColors> {
  const colors = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    colors[key] = await page.getByTestId(`ui-color-native-${key}`).inputValue();
  }
  return colors;
}

/** Variable CSS computada del preview para un token. */
function previewVar(page: Page, key: ThemeColorKey) {
  const html = page.frameLocator('iframe[title="Vista previa desktop"]').locator("html");
  return async () => {
    try {
      return await html.evaluate(
        (element, variable) => getComputedStyle(element).getPropertyValue(variable),
        `--solara-${VAR_SUFFIX[key]}`,
      );
    } catch (reason) {
      // Cambiar un token reemplaza el srcdoc del iframe; durante ese único
      // frame intermedio la lectura puede observar un documento detached.
      // expect.poll vuelve a consultar el mismo token en el iframe nuevo.
      if (reason instanceof Error && reason.message.includes("Frame was detached")) return "";
      throw reason;
    }
  };
}

/** Exporta el sitio con la paleta dada y devuelve CSS + las 7 vars declaradas. */
function exportedWith(colors: ThemeColors): { css: string; vars: ThemeColors } {
  const store = structuredClone(referenceStore);
  store.theme = { ...store.theme, colors: { ...colors } };
  const result = exportProject(store, { mode: "production" });
  const css = readHashedStorefrontCss(result.files);
  const vars = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    const suffix = VAR_SUFFIX[key];
    const match = new RegExp(`--solara-${suffix}(?![-\\w]):\\s*([^;}]+)`).exec(css);
    if (match === null) throw new Error(`Falta --solara-${suffix} en el CSS exportado`);
    vars[key] = match[1].trim();
  }
  return { css, vars };
}

/** Aserción de utilidad: el CSS exportado usa la variable (consumidor real). */
function assertConsumed(css: string, key: ThemeColorKey): void {
  const usage = `var(--solara-${VAR_SUFFIX[key]})`;
  expect(css, `--solara-${VAR_SUFFIX[key]} declarada pero sin consumidor en el sitio`).toContain(
    usage,
  );
}

for (const key of THEME_COLOR_KEYS) {
  test(`token ${key} (${COLOR_LABELS[key]}): texto y picker con efecto en preview y sitio; hex inválido no commitea`, async ({
    page,
  }) => {
    await setupCleanStore(page, `T2 ${key}`);
    await openThemeTab(page);

    // Estado ANTES: paleta default, var computada del preview y sitio exportado.
    const before = await readCommittedColors(page);
    const beforeOut = exportedWith(before);
    assertConsumed(beforeOut.css, key);
    await expect.poll(previewVar(page, key), { timeout: 15_000 }).toBe(before[key]);

    // 1) Input de texto: el token commitea y llega al preview y al sitio.
    const textTarget = TEXT_TARGET[key];
    await page.getByTestId(`ui-color-text-${key}`).fill(textTarget);
    await expect(page.getByTestId(`ui-color-text-${key}`)).toHaveValue(textTarget);
    await expect(page.getByTestId(`ui-color-native-${key}`)).toHaveValue(textTarget);
    await expect.poll(previewVar(page, key), { timeout: 15_000 }).toBe(textTarget);

    const textColors = await readCommittedColors(page);
    expect(textColors[key]).toBe(textTarget);
    const textOut = exportedWith(textColors);
    expect(textOut.vars[key]).toBe(textTarget);
    expect(textOut.vars[key]).not.toBe(beforeOut.vars[key]);
    expect(textOut.css).not.toBe(beforeOut.css);
    assertConsumed(textOut.css, key);

    // 2) Picker nativo: mismo efecto; el texto del input se sincroniza.
    const pickerTarget = PICKER_TARGET[key];
    await page.getByTestId(`ui-color-native-${key}`).fill(pickerTarget);
    await expect(page.getByTestId(`ui-color-native-${key}`)).toHaveValue(pickerTarget);
    await expect(page.getByTestId(`ui-color-text-${key}`)).toHaveValue(pickerTarget);
    await expect.poll(previewVar(page, key), { timeout: 15_000 }).toBe(pickerTarget);

    const pickerColors = await readCommittedColors(page);
    expect(pickerColors[key]).toBe(pickerTarget);
    const pickerOut = exportedWith(pickerColors);
    expect(pickerOut.vars[key]).toBe(pickerTarget);
    expect(pickerOut.vars[key]).not.toBe(textOut.vars[key]);
    expect(pickerOut.css).not.toBe(textOut.css);
    assertConsumed(pickerOut.css, key);

    // 3) Hex inválido: error inline y NINGÚN cambio confirmado (preview y sitio).
    await page.getByTestId(`ui-color-text-${key}`).fill("zzz");
    await expect(page.getByTestId("ui-field-error")).toHaveText(COLOR_ERROR);
    const invalidColor = page.getByTestId(`ui-color-text-${key}`);
    await expect(invalidColor).toHaveAttribute("aria-invalid", "true");
    const errorId = await invalidColor.getAttribute("aria-describedby");
    expect(errorId).toBe(`theme-color-error-${key}`);
    await expect(page.locator(`#${errorId}`)).toHaveText(COLOR_ERROR);
    await expect(page.getByTestId(`ui-color-native-${key}`)).toHaveValue(pickerTarget);
    await expect.poll(previewVar(page, key), { timeout: 15_000 }).toBe(pickerTarget);
    const invalidOut = exportedWith(await readCommittedColors(page));
    expect(invalidOut.vars[key]).toBe(pickerTarget);
    expect(invalidOut.css).toBe(pickerOut.css);

    // 4) Recuperación: un hex válido limpia el error y vuelve a commitear.
    await page.getByTestId(`ui-color-text-${key}`).fill(textTarget);
    await expect(page.getByTestId("ui-field-error")).toHaveCount(0);
    await expect(page.getByTestId(`ui-color-text-${key}`)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect.poll(previewVar(page, key), { timeout: 15_000 }).toBe(textTarget);
    const recovered = exportedWith(await readCommittedColors(page));
    expect(recovered.vars[key]).toBe(textTarget);
  });
}

test("sombra del hero mobile: control nativo, preview y exclusión del botón", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await setupCleanStore(page, "T2 sombra hero mobile");
  await openThemeTab(page);

  const toggle = page.getByTestId("ui-text-shadow-enabled");
  const opacity = page.getByTestId("ui-text-shadow-opacity");
  const offsetX = page.getByTestId("ui-text-shadow-offset-x");
  const offsetY = page.getByTestId("ui-text-shadow-offset-y");
  const blur = page.getByTestId("ui-text-shadow-blur");
  const preview = page.getByTestId("ui-text-shadow-preview");

  await expect(toggle).toBeChecked();
  await expect(opacity).toHaveValue("0.65");
  await expect(offsetX).toHaveValue("1");
  await expect(offsetY).toHaveValue("1");
  await expect(blur).toHaveValue("0");
  await expect
    .poll(() => preview.evaluate((element) => element.style.textShadow))
    .toContain("1px 1px 0");

  await page.getByRole("button", { name: "Vista móvil" }).click();
  const mobileFrame = page.frameLocator('iframe[title="Vista previa mobile"]');
  const mobileHeroTitle = mobileFrame.locator(
    '[data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-title',
  );
  const mobileHeroButtons = mobileFrame.locator(
    '[data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-actions a',
  );
  await expect(mobileHeroTitle).toBeVisible();
  await expect
    .poll(() => mobileHeroTitle.evaluate((element) => getComputedStyle(element).textShadow))
    .toContain("1px 1px 0");
  await expect
    .poll(() =>
      mobileHeroButtons.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).textShadow),
      ),
    )
    .toEqual(["none", "none"]);

  await page.getByRole("button", { name: "Vista de escritorio" }).click();
  const desktopFrame = page.frameLocator('iframe[title="Vista previa desktop"]');
  const desktopHeroTitle = desktopFrame.locator(
    '[data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-title',
  );
  await expect(desktopHeroTitle).toBeVisible();
  await expect
    .poll(() => desktopHeroTitle.evaluate((element) => getComputedStyle(element).textShadow))
    .toBe("none");

  await opacity.fill("0.85");
  await expect(opacity).toHaveValue("0.85");
  await offsetX.fill("-8");
  await offsetY.fill("14");
  await blur.fill("6");
  await expect(offsetX).toHaveValue("-8");
  await expect(offsetY).toHaveValue("14");
  await expect(blur).toHaveValue("6");
  await expect
    .poll(() => preview.evaluate((element) => element.style.textShadow))
    .toContain("-8px 14px 6px");

  await toggle.uncheck();
  await expect(opacity).toBeDisabled();
  await expect(offsetX).toBeDisabled();
  await expect(offsetY).toBeDisabled();
  await expect(blur).toBeDisabled();
  await expect(preview).toHaveCSS("text-shadow", "none");

  await toggle.check();
  await expect(opacity).toBeEnabled();
  await expect
    .poll(() => preview.evaluate((element) => element.style.textShadow))
    .toContain("-8px 14px 6px");
});
