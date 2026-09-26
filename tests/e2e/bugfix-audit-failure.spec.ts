/**
 * F-02 — Bugfix review 3: fallo de auditoría visible y recuperable.
 * Si el worker que ejecuta la auditoría falla al cargarse, el panel de
 * exportación debe mostrar el error (patrón InlineError) con un botón
 * "Reintentar auditoría" y mantener deshabilitado el export de producción
 * sin silencio. Al reintentar con la red restaurada, la auditoría se
 * completa y el botón de producción se habilita.
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 90_000);

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

/**
 * El studio registra un service worker PWA que desvía los requests de chunks
 * fuera de page.route. Se desactiva para que el fallo del chunk de
 * @solara/exporter sea determinístico.
 */
async function disableServiceWorker(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "serviceWorker", {
        value: undefined,
        configurable: true,
      });
    } catch {
      // navegadores sin service workers: no hace falta neutralizarlo
    }
  });
}

/**
 * Falla la descarga del script del worker del exportador (identificado por su
 * prefijo de archivo) mientras la ruta esté registrada. El worker falla al
 * nacer y la auditoría del panel reporta el error. Otros JS pasan sin tocar.
 */
async function failAuditWorker(page: import("@playwright/test").Page): Promise<void> {
  await disableServiceWorker(page);
  await page.route("**/assets/*.js", async (route) => {
    if (route.request().url().includes("export.worker-")) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
}

async function openDemoStore(page: import("@playwright/test").Page) {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  const card = page.locator('article:has([data-store-card-id="store-modo-sur-demo"])');
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
}

test("el fallo de auditoría se muestra y el reintento habilita producción", async ({ page }) => {
  await failAuditWorker(page);
  await openDemoStore(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();

  const production = page.getByTestId("ui-export-production");
  await expect(production).toBeDisabled();
  await expect(page.getByText("No se pudo cargar la auditoría", { exact: false })).toBeVisible({
    timeout: 30_000,
  });
  const retry = page.getByRole("button", { name: "Reintentar auditoría" });
  await expect(retry).toBeVisible();
  await expect(production).toBeDisabled();

  await page.unroute("**/assets/*.js");
  await retry.click();
  await expect(production).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("ui-export-audit-status")).toContainText("Auditoría lista", {
    timeout: 10_000,
  });
});
