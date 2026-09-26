/** Verifica que la exportación de producción espere a que termine la auditoría. */
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
