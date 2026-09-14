/**
 * T4 — Bugfix review 2: exportación.
 * ST-B5: el botón "Exportar producción" no debe habilitarse mientras la
 * auditoría está pendiente (primera carga y re-auditoría al alternar el
 * contexto público). ST-B6: en modo navegador (sin lanzador) el aviso de
 * exportación no debe prometer guardado en proyectos/<tienda>/sitios/.
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createCleanStore } from "./project-helpers";
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
 * fuera de page.route. Se desactiva para que el retraso del chunk de
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
 * Retrasa la primera carga del chunk de @solara/exporter (identificado por su
 * cuerpo) para abrir una ventana determinística donde la auditoría asíncrona
 * del panel sigue pendiente. Otros JS pasan sin tocar.
 */
async function delayExporterChunk(
  page: import("@playwright/test").Page,
  delayMs: number,
): Promise<() => void> {
  await disableServiceWorker(page);
  let releaseDelay = () => {};
  const delayGate = new Promise<void>((resolve) => {
    releaseDelay = resolve;
  });
  let delayed = false;
  await page.route("**/assets/*.js", async (route) => {
    if (delayed) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.body();
    delayed = body.includes("policies.incomplete");
    if (delayed) {
      // El test libera el chunk cuando ya observó el botón bloqueado. El
      // fallback temporal conserva la reproducción si el flujo no llega al
      // panel (por ejemplo, durante una navegación abortada).
      await Promise.race([delayGate, new Promise<void>((resolve) => setTimeout(resolve, delayMs))]);
    }
    await route.fulfill({ response, body });
  });
  return () => releaseDelay();
}

/** Mantiene pendientes sólo las auditorías del worker sin bloquear el Studio. */
async function delayAuditWorker(
  page: import("@playwright/test").Page,
): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    type AuditGateWindow = Window & { __solaraReleaseAudit?: () => void };
    const scopedWindow = window as AuditGateWindow;
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    scopedWindow.__solaraReleaseAudit = releaseGate;

    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      const isAudit =
        message && typeof message === "object" && (message as { type?: unknown }).type === "audit";
      if (isAudit) {
        void gate.then(() => {
          if (transfer === undefined) originalPostMessage.call(this, message);
          else originalPostMessage.call(this, message, transfer);
        });
        return;
      }
      if (transfer === undefined) return originalPostMessage.call(this, message);
      return originalPostMessage.call(this, message, transfer);
    };
  });
  return () =>
    page.evaluate(() => {
      (window as Window & { __solaraReleaseAudit?: () => void }).__solaraReleaseAudit?.();
    });
}

async function delaySiteWorker(page: import("@playwright/test").Page, delayMs: number): Promise<void> {
  await page.addInitScript((delay) => {
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      const isSite = message && typeof message === "object" && (message as { type?: unknown }).type === "site";
      if (isSite) {
        window.setTimeout(() => {
          if (transfer === undefined) originalPostMessage.call(this, message);
          else originalPostMessage.call(this, message, transfer);
        }, delay);
        return;
      }
      if (transfer === undefined) return originalPostMessage.call(this, message);
      return originalPostMessage.call(this, message, transfer);
    };
  }, delayMs);
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

test("no habilita el export de producción mientras la auditoría está pendiente", async ({
  page,
}) => {
  const releaseAudit = await delayAuditWorker(page);
  await openDemoStore(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible({ timeout: 30_000 });

  const production = page.getByTestId("ui-export-production");
  await expect(production).toBeDisabled({ timeout: 1_500 });
  await releaseAudit();
  await expect(production).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText("Salud de exportación", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
});

test("una tienda con críticos nunca habilita el export, ni al re-auditar por contexto", async ({
  page,
}) => {
  await delayExporterChunk(page, 12_000);
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await createCleanStore(page, "Tienda de auditoría");
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible({ timeout: 30_000 });

  const production = page.getByTestId("ui-export-production");
  await expect(production).toBeDisabled({ timeout: 1_500 });
  await page.locator(".export-ai-context input[type='checkbox']").uncheck();
  await expect(production).toBeDisabled({ timeout: 1_500 });
  await expect(page.locator(".export-warning")).toBeVisible({
    timeout: 30_000,
  });
  await expect(production).toBeDisabled();
});

test("mantiene un popup con el avance real hasta completar el export", async ({ page }) => {
  await delaySiteWorker(page, 1_200);
  await openDemoStore(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ui-export-audit-status")).toContainText("Auditoría lista", {
    timeout: 30_000,
  });

  await page.getByTestId("ui-export-draft").click();
  const dialog = page.getByTestId("ui-export-progress-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /Exportando sitio borrador/ })).toBeVisible();
  await expect(dialog.getByTestId("ui-export-progress-task")).toHaveCount(3);
  await expect(dialog.getByTestId("ui-progress")).toHaveAttribute("aria-valuenow", /\d+/);
  await expect(page.getByTestId("ui-export-result")).toBeVisible({ timeout: 30_000 });
  await expect(dialog).not.toBeVisible();
});
