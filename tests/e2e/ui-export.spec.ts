/**
 * Auditoría de controles (2026-08-10) — regresión del panel Exportar.
 * F8-B1: el resumen "Salud de exportación" debe mostrar el mismo conteo de
 * críticos que bloquea "Exportar producción" (una sola fuente de verdad).
 * F8-B2: las etapas de generación deben avanzar de a una a medida que el
 * worker las completa (validate antes que render/package).
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { resetStudioIndexedDb } from "./project-helpers";
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

async function openDemoStore(page: import("@playwright/test").Page) {
  await resetStudioIndexedDb(page, studioUrl);
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();
}

async function createAuditStore(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  await page.getByLabel("Nueva tienda").fill("Tienda de auditoría");
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Crear tienda desde plantilla", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 30_000,
  });
}

test("el resumen de salud muestra el mismo conteo de críticos que bloquea la producción", async ({
  page,
}) => {
  await resetStudioIndexedDb(page, studioUrl);
  await createAuditStore(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();
  await expect(page.getByTestId("ui-export-audit-status")).toContainText("Auditoría lista:", {
    timeout: 30_000,
  });

  const block = page.locator(".export-warning");
  await expect(block).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ui-export-production")).toBeDisabled();

  const blockCount = Number((await block.innerText()).match(/(\d+) errores críticos/)?.[1] ?? "0");
  expect(blockCount).toBeGreaterThan(0);
  await expect(page.locator(".optimization-export-summary")).toContainText(
    `${blockCount} críticos`,
  );
});

test("las etapas de generación avanzan de a una mientras exporta el borrador", async ({ page }) => {
  test.setTimeout(process.env.CI ? 150_000 : 90_000);
  await openDemoStore(page);

  await page.getByTestId("ui-export-draft").click();
  await expect(page.getByTestId("ui-export-stage")).toHaveCount(3);

  await page.waitForFunction(
    () => {
      const stages = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="ui-export-stage"]'),
      );
      const done = (id: string) =>
        stages.find((node) => node.dataset.stage === id)?.dataset.done === "true";
      return done("validate") && !done("render");
    },
    undefined,
    { timeout: 60_000 },
  );

  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 60_000,
  });
  for (const stage of ["validate", "render", "package"]) {
    await expect(
      page.locator(`[data-testid="ui-export-stage"][data-stage="${stage}"]`),
    ).toHaveAttribute("data-done", "true");
  }
});

test("P8-B5: la descarga del respaldo es un .solara.json v2 válido", async ({ page }) => {
  await openDemoStore(page);

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("ui-export-backup").click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  console.log("P8-B5 archivo descargado:", filename);
  expect(filename).toMatch(/\.solara\.json$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  const parsed = JSON.parse(text) as {
    format?: string;
    version?: number;
    project?: { schemaVersion?: number };
  };
  console.log(
    "P8-B5 envelope:",
    parsed.format,
    parsed.version,
    "| schema:",
    parsed.project?.schemaVersion,
  );
  expect(parsed.format).toBe("solara-project");
  expect(parsed.version).toBe(2);
  expect(parsed.project?.schemaVersion).toBe(2);
});

test("P8-B6: el historial de exportaciones registra y se borra con confirmación", async ({
  page,
}) => {
  await openDemoStore(page);
  await page.getByTestId("ui-export-draft").click();
  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 90_000,
  });

  const history = page.getByTestId("ui-export-history");
  await expect(history).toBeVisible();
  const items = history.getByTestId("ui-export-history-item");
  await expect(items.first()).toBeVisible();
  const count = await items.count();
  console.log("P8-B6 ítems del historial:", count);
  expect(count).toBeGreaterThan(0);

  await history.getByTestId("ui-export-history-clear").click();
  const dialog = page.getByRole("dialog", { name: "Borrar historial de exportaciones" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Borrar historial" }).click();
  await expect(history).toBeHidden();
  console.log("P8-B6 historial borrado");
});

test("R4-P8-B5: exportar producción pasa por confirmación y completa las etapas", async ({
  page,
}) => {
  await openDemoStore(page);
  await page.evaluate(() => {
    const directory = (
      name: string,
    ): {
      name: string;
      getDirectoryHandle(childName: string): Promise<ReturnType<typeof directory>>;
      getFileHandle(): Promise<{
        createWritable(): Promise<{ write(): Promise<void>; close(): Promise<void> }>;
      }>;
    } => ({
      name,
      getDirectoryHandle: async (childName) => directory(`${name}/${childName}`),
      getFileHandle: async () => ({
        createWritable: async () => ({
          write: async () => undefined,
          close: async () => undefined,
        }),
      }),
    });
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => directory("playwright-export"),
    });
  });
  await page.getByTestId("ui-export-production").click();
  const dialog = page.getByRole("dialog", { name: "Exportar sitio de producción" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Exportar producción" }).click();
  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 120_000,
  });
  for (const stage of ["validate", "render", "package"]) {
    await expect(
      page.locator(`[data-testid="ui-export-stage"][data-stage="${stage}"]`),
    ).toHaveAttribute("data-done", "true");
  }
  console.log("R4-P8-B5 producción exportada con las tres etapas");
});
