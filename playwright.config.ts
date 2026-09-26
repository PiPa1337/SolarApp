import { defineConfig, devices } from "@playwright/test";

// El Studio v1 se soporta y valida por completo en Chromium. Firefox y WebKit
// repiten únicamente los contratos del sitio público exportado: esta lista es
// explícita para que un nuevo barrido interno del editor no triplique por
// accidente el gate release ni convierta diferencias del browser del Studio en
// supuestas regresiones del storefront.
const publicStorefrontSpecs = /[/\\](exported-store|exporter-sentinel|storefront-nojs)\.spec\.ts$/;
const publicStorefrontSentinels =
  /selecciona una variante, agrega al carrito y abre WhatsApp|la demo con teléfono real conserva el contrato data-whatsapp del sitio|sin JavaScript la compra se deriva a WhatsApp y la navegación móvil queda accesible/;
const ciVisualSpecs = [/[/\\]__vision__[/\\]/, /[/\\]visual-break\.spec\.ts$/];
const auditSpecs = [
  /[/\\]__vision__[/\\].+\.spec\.ts$/,
  /[/\\]calculator-visual-audit\.spec\.ts$/,
  /[/\\](?:ui-export|visual-break)\.spec\.ts$/,
];
const requestedE2eMode = process.env.SOLARA_E2E_MODE?.trim().toLowerCase();
const e2eMode =
  requestedE2eMode === "audit" || requestedE2eMode === "all" ? requestedE2eMode : "functional";
const testMatch = e2eMode === "audit" ? auditSpecs : undefined;
const testIgnore =
  e2eMode === "functional" ? auditSpecs : process.env.CI === "true" ? ciVisualSpecs : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  // El gate normal conserva contratos funcionales. Las cinco auditorías
  // manuales seleccionadas se ejecutan sólo en modo audit/all.
  testMatch,
  testIgnore,
  fullyParallel: false,
  // 0 reintentos en local (post-cambio rápido); CI conserva 1 para flakes de timing.
  retries: process.env.CI === "true" ? 1 : 0,
  // 3 workers por defecto en local para no congelar la máquina: cada spec levanta
  // su propio servidor en puerto aleatorio (listen(0) o rangos disjuntos por
  // archivo), así que la paralelización es segura pero acotada. En máquinas
  // 8C/16T usar PLAYWRIGHT_WORKERS=8 para la suite completa (~3-4 min).
  // Smoke quick (5 specs) queda en ~20-40s. Override con PLAYWRIGHT_WORKERS=N.
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? 3),
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    trace: process.env.CI === "true" ? "retain-on-failure" : "off",
    serviceWorkers: "block",
  },
  outputDir: process.env.SOLARA_PERF_PLAYWRIGHT_OUTPUT_DIR ?? "test-results",
  projects:
    process.env.PLAYWRIGHT_MULTI_BROWSER === "1"
      ? [
          { name: "chromium", use: { ...devices["Desktop Chrome"] } },
          {
            name: "firefox",
            testMatch: publicStorefrontSpecs,
            grep: publicStorefrontSentinels,
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            testMatch: publicStorefrontSpecs,
            grep: publicStorefrontSentinels,
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
