import type { Server } from "node:http";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { startStudioServer, stopStudioServer } from "./studio-server";

const VIEWPORT = { width: 1920, height: 912 };
const VISUAL_DIR = process.env.SOLARA_VISUAL_DIR ?? "test-results";

test.setTimeout(60_000);

let server: Server;
let url: string;

test.beforeAll(async () => {
  const running = await startStudioServer();
  server = running.server;
  url = running.url;
});

test.afterAll(async () => {
  await stopStudioServer(server);
});

async function openCalculator(page: Page): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.evaluate(() => {
    localStorage.removeItem("solara-pricing-config");
    localStorage.removeItem("solara-store-discounts");
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await expect(
    page.getByRole("region", { name: "Tienda seleccionada: Predeterminado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calculadora", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Precio de tu tienda online" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cerrar calculadora" })).toBeFocused();
}

async function expectDialogFits(page: Page): Promise<void> {
  const fit = await page.getByRole("dialog").evaluate((element) => {
    const content = element.querySelector<HTMLElement>(".dashboard-calculator-dialog__content");
    const body = element.querySelector<HTMLElement>(".dashboard-calculator-dialog__body");
    const rect = element.getBoundingClientRect();
    return {
      dialogFits: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
      contentFits: Boolean(content && content.scrollHeight <= content.clientHeight + 1),
      bodyFits: Boolean(body && body.scrollHeight <= body.clientHeight + 1),
      pageFits: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(fit).toEqual({ dialogFits: true, contentFits: true, bodyFits: true, pageFits: true });
}

test("captura y verifica la calculadora a 1920x912", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await openCalculator(page);

  const dialog = page.getByRole("dialog", { name: "Precio de tu tienda online" });
  const accessibility = await new AxeBuilder({ page })
    .include(".dashboard-calculator-dialog:not(.dashboard-delete-dialog)")
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await expectDialogFits(page);
  await page.screenshot({ path: join(VISUAL_DIR, "calculator-after-summary.png") });

  await dialog.getByRole("button", { name: "Simular cantidad" }).click();
  await dialog.getByRole("spinbutton", { name: "Cantidad facturable" }).fill("250");
  await expect(dialog.getByText("Simulación", { exact: true })).toBeVisible();
  await expectDialogFits(page);
  await page.screenshot({ path: join(VISUAL_DIR, "calculator-after-simulation.png") });

  await dialog.getByRole("tab", { name: "Configurar tarifa" }).click();
  await expect(dialog.getByRole("heading", { name: "Tarifa mensual", exact: true })).toBeVisible();
  await expectDialogFits(page);
  await page.screenshot({ path: join(VISUAL_DIR, "calculator-after-pricing.png") });
});
