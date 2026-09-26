/**
 * T0.7 — Workers del editor: fallos de imágenes y estados de exportación.
 * La importación CSV (errores por fila, progreso y confirmación) está consolidada
 * en el recorrido de catálogo de tests/e2e/catalog.spec.ts.
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 120_000 : 60_000);

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

async function openDemoCatalog(page: import("@playwright/test").Page): Promise<string> {
  await page.goto(studioUrl);
  await page.evaluate(
    () =>
      new Promise<void>((resolveDelete, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolveDelete());
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  const projectId = await openMutableScaleStore(page, "Workers mutable");
  await page.getByRole("tab", { name: "Catálogo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
  return projectId;
}

async function openDemoAssets(page: import("@playwright/test").Page) {
  await openDemoCatalog(page);
  await page.getByRole("tab", { name: "Recursos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
}

test("reporta por archivo las imágenes que no se pudieron procesar y conserva el resto", async ({
  page,
}) => {
  await openDemoAssets(page);
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator('input[type="file"][accept*="webp"]').setInputFiles([
    { name: "taza.png", mimeType: "image/png", buffer: pixel },
    { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>", "utf8") },
  ]);

  const failures = page.getByTestId("ui-asset-errors");
  await expect(failures).toBeVisible();
  await expect(page.getByTestId("ui-asset-error")).toHaveCount(1);
  await expect(failures).toContainText("logo.svg");
  await expect(failures).toContainText("JPEG, PNG o WebP");
  await expect(page.getByTestId("ui-asset-batch-status")).toContainText("1 imagen agregada");
  await page.getByPlaceholder("Buscar por nombre, texto alternativo o ID").fill("taza");
  await expect(
    page.locator(".asset-item").filter({ has: page.locator('input[value="taza"]') }),
  ).toBeVisible();
});

test("exporta el borrador con estado generando y resultado de éxito", async ({ page }) => {
  test.setTimeout(process.env.CI ? 150_000 : 90_000);
  await openDemoCatalog(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();

  const draftButton = page.getByTestId("ui-export-draft");
  await page.evaluate(() => {
    const capture = {
      dialogSeen: false,
      heading: "",
      taskIds: [] as string[],
      activeTaskSeen: false,
    };
    (window as Window & { __solaraExportProgressCapture?: typeof capture })
      .__solaraExportProgressCapture = capture;
    const observeProgress = () => {
      const dialog = document.querySelector('[data-testid="ui-export-progress-dialog"]');
      if (!dialog) return;
      capture.dialogSeen = true;
      capture.heading = dialog.querySelector("h3")?.textContent?.trim() ?? "";
      const tasks = Array.from(
        dialog.querySelectorAll<HTMLElement>('[data-testid="ui-export-progress-task"]'),
      );
      capture.taskIds = [...new Set([...capture.taskIds, ...tasks.map((task) => task.dataset.task ?? "")])];
      capture.activeTaskSeen ||= tasks.some((task) => task.dataset.status === "active");
    };
    new MutationObserver(observeProgress).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-status"],
    });
  });
  await draftButton.click();
  await expect(draftButton).toBeDisabled();
  await expect(draftButton).toContainText("Generando");
  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 60_000,
  });
  const progress = await page.evaluate(
    () =>
      (window as Window & {
        __solaraExportProgressCapture?: {
          dialogSeen: boolean;
          heading: string;
          taskIds: string[];
          activeTaskSeen: boolean;
        };
      }).__solaraExportProgressCapture,
  );
  expect(progress).toMatchObject({
    dialogSeen: true,
    heading: "Exportando sitio borrador",
    activeTaskSeen: true,
  });
  expect(progress?.taskIds).toEqual(["validate", "recovery", "render"]);
});

test("bloquea la exportación de producción cuando hay errores críticos visibles", async ({
  page,
}) => {
  await openDemoCatalog(page);
  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await createCleanStore(page, "Tienda de auditoría");
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await page.getByRole("button", { name: "Dominio y legales", exact: true }).click();
  const domainAccordion = page.getByRole("button", { name: "Dominio", exact: true });
  if ((await domainAccordion.getAttribute("aria-expanded")) !== "true") {
    await domainAccordion.click();
  }
  const publicUrl = page.getByLabel("URL pública");
  await expect(publicUrl).toBeVisible();
  const insecureUrl = (await publicUrl.inputValue()).replace(/^https:/, "http:");
  await publicUrl.fill(insecureUrl);
  await expect(publicUrl).toHaveValue(insecureUrl);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();

  await expect(page.getByTestId("ui-export-audit-status")).toContainText("Auditoría lista", {
    timeout: 30_000,
  });
  await expect(page.locator(".export-warning")).toContainText(
    "errores críticos deben resolverse.",
  );
  await expect(page.getByTestId("ui-export-production")).toBeDisabled();
});


test("importar un respaldo inválido pide confirmación y muestra un error accionable (T6.7)", async ({
  page,
}) => {
  await openDemoCatalog(page);
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();

  // El lector distingue por el envelope (format/version): un JSON válido sin
  // envelope se reporta como "versión anterior". Para ejercitar el error de
  // respaldo corrupto el fixture debe ser JSON inválido.
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "respaldo-invalido.json",
    mimeType: "application/json",
    buffer: Buffer.from("{no es un respaldo solara", "utf8"),
  });
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Importar y reemplazar");
  await confirm.getByRole("button", { name: "Importar y reemplazar" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId("ui-inline-error")).toBeVisible();
  await expect(page.getByTestId("ui-inline-error")).toContainText(
    "El respaldo está corrupto o no es JSON válido.",
  );
  await expect(page.getByTestId("ui-export-draft")).toBeEnabled();
});
