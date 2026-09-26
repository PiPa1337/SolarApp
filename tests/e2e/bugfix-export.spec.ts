/**
 * T4 — Bugfix review 2: exportación.
 * ST-B5: el botón de producción espera la auditoría y el contexto público de
 * agentes siempre forma parte de la exportación. ST-B6: en modo navegador el
 * aviso no debe prometer guardado en proyectos/<tienda>/sitios/.
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

async function delaySiteWorker(
  page: import("@playwright/test").Page,
  delayMs: number,
): Promise<void> {
  await page.addInitScript((delay) => {
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      const isSite =
        message && typeof message === "object" && (message as { type?: unknown }).type === "site";
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
  await expect(page.getByTestId("ui-export-audit-status")).toContainText("Auditoría lista", {
    timeout: 10_000,
  });
});

test("producción siempre incluye el contexto de agentes", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await createCleanStore(page, "Tienda de auditoría");
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ui-export-audit-status")).toContainText("Auditoría lista", {
    timeout: 30_000,
  });

  const contentOptions = page.locator("details.export-content-options");
  await contentOptions.locator("summary").click();
  await expect(page.getByTestId("ui-export-ai-context-status")).toContainText("se generan siempre");
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
