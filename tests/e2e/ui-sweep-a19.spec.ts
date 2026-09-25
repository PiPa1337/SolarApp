/**
 * Barrido A19 (2026-08-10) — Export + Toast.
 * Contrato de 3 capas sobre el panel Exportar y el sistema global de toasts:
 * funcional (click → efecto real), auto-feedback (disabled/aria/data-done
 * coherente con la lógica) y datos (payload → receptor en worker/localStorage).
 *
 * Cobertura del bin A19:
 * - Borrador: aviso honesto en modo navegador; etapas que avanzan de a una
 *   con marcas visibles por etapa (auto-feedback).
 * - Producción: bloqueada con críticos + razón; funciona sin críticos.
 * - Contexto público: producción lo muestra como contenido obligatorio y los
 *   contadores quedan coherentes con el bloqueo.
 * - Checklist posterior: toggles con estado persistente (data-done + aria-pressed).
 * - Descargar .solara.json: descarga real y botones deshabilitados durante.
 * - Importar respaldo: diálogo de confirmación; inválido → error accionable.
 * - Historial: entradas aparecen y persisten; limpiar las vacía.
 * - Abrir sitio: aviso en modo navegador (sin botón de apertura).
 * - Toasts: aparecen con rol correcto, se descartan, apilan sin scrollear
 *   la página y se autocierran según gravedad.
 */
import type { Server } from "node:http";
import { expect, test } from "@playwright/test";
import { openMutableScaleStore } from "./project-helpers";
import { startStudioServer, stopStudioServer } from "./studio-server";

test.setTimeout(process.env.CI ? 180_000 : 150_000);

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

const DEMO_SLUG = "demo-catalogo-jerarquico";
const HISTORY_KEY = `solara-export-history:${DEMO_SLUG}`;

async function resetIndexedDb(page: import("@playwright/test").Page) {
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
}

async function openDemoStore(page: import("@playwright/test").Page) {
  await resetIndexedDb(page);
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();
}

async function openMutableExportStore(page: import("@playwright/test").Page) {
  await resetIndexedDb(page);
  await openMutableScaleStore(page, "Tienda A19 mutable");
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();
}

async function createAuditStore(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  await page.getByLabel("Nueva tienda").fill(name);
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Crear tienda desde plantilla", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Registra en window los cambios de `disabled` del botón dado. El observer es
 * síncrono: captura ventanas cortas de estado que un poll normal perdería.
 * Devuelve la clave donde quedan los flips observados.
 */
async function watchDisabledFlips(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> {
  const storageKey = `__a19_flips_${Math.random().toString(36).slice(2)}`;
  await page.evaluate(
    ({ selector, storageKey }) => {
      const flips: string[] = [];
      (window as unknown as Record<string, string[]>)[storageKey] = flips;
      new MutationObserver(() => {
        const button = document.querySelector<HTMLElement>(selector);
        flips.push(button?.hasAttribute("disabled") ? "disabled" : "enabled");
      }).observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ["disabled"],
      });
    },
    { selector, storageKey },
  );
  return storageKey;
}

async function readFlips(
  page: import("@playwright/test").Page,
  storageKey: string,
): Promise<string[]> {
  return page.evaluate(
    (key) => (window as never as Record<string, string[]>)[key] ?? [],
    storageKey,
  );
}

test("la producción queda bloqueada con críticos y la razón coincide con el resumen", async ({
  page,
}) => {
  await resetIndexedDb(page);
  await createAuditStore(page, "Tienda barrido A19 bloqueo");
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();

  const production = page.getByTestId("ui-export-production");
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });
  await expect(production).toBeDisabled();

  const block = page.locator(".export-warning");
  await expect(block).toBeVisible();
  const blockCount = Number(
    (await block.innerText()).match(/(\d+) errores críticos deben resolverse/)?.[1] ?? "0",
  );
  expect(blockCount).toBeGreaterThan(0);

  await expect(page.locator(".optimization-export-summary")).toContainText(
    `${blockCount} críticos`,
  );
  await expect(page.locator(".optimization-export-summary")).toContainText(/Salud de exportación/);
  await expect(page.locator(".optimization-export-summary")).toContainText(/advertencias/);
});

test("cancela la produccion sin exportar y devuelve el foco", async ({ page }) => {
  await openDemoStore(page);
  await expect(page.getByTestId("ui-export-production")).toBeEnabled({ timeout: 30_000 });

  const production = page.getByTestId("ui-export-production");
  await production.click();
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-describedby", /.+/);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(production).toBeFocused();
  await expect(page.getByTestId("ui-export-result")).toHaveCount(0);
  await expect(page.getByTestId("ui-export-history")).toHaveCount(0);

  await production.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(production).toBeFocused();
  await expect(page.getByTestId("ui-export-result")).toHaveCount(0);
});

test("el borrador exporta con aviso honesto de modo navegador y etapas marcadas de a una", async ({
  page,
}) => {
  await openDemoStore(page);
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByTestId("ui-export-stages")).toHaveCount(0);
  await page.getByTestId("ui-export-draft").click();

  await expect(page.getByTestId("ui-export-stages")).toBeVisible();
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
    const node = page.locator(`[data-testid="ui-export-stage"][data-stage="${stage}"]`);
    await expect(node).toHaveAttribute("data-done", "true");
    await expect(node).toContainText("Completado");
  }
  await expect(page.getByTestId("ui-export-result")).toContainText("modo navegador");
  await expect(page.getByTestId("ui-export-result")).toContainText(
    "el sitio generado no se conserva en disco",
  );
  await expect(page.getByTestId("ui-export-open-site")).toHaveCount(0);
});

test("el checklist posterior persiste los toggles, navega a SEO y el historial registra la entrada", async ({
  page,
}) => {
  await openDemoStore(page);
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("ui-export-draft").click();
  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 60_000,
  });

  const checklist = page.getByTestId("ui-export-checklist");
  await expect(checklist).toBeVisible();
  await expect(page.getByTestId("ui-export-check-item")).toHaveCount(3);

  const site = page.locator('[data-testid="ui-export-check-item"][data-check-id="site"]');
  const productionItem = page.locator(
    '[data-testid="ui-export-check-item"][data-check-id="production"]',
  );
  await expect(site.getByTestId("ui-export-check-toggle")).toHaveAttribute("aria-pressed", "false");
  await site.getByTestId("ui-export-check-toggle").click();
  await expect(site).toHaveAttribute("data-done", "true");
  await expect(site.getByTestId("ui-export-check-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(site.getByTestId("ui-export-check-toggle")).toContainText("Listo");

  await productionItem.getByTestId("ui-export-check-toggle").click();
  await expect(productionItem).toHaveAttribute("data-done", "true");
  await expect(site).toHaveAttribute("data-done", "true");

  await site.getByTestId("ui-export-check-toggle").click();
  await expect(site).toHaveAttribute("data-done", "false");

  const history = page.getByTestId("ui-export-history");
  await expect(history).toBeVisible();
  await expect(history.getByTestId("ui-export-history-item")).toHaveCount(1);
  await expect(history.getByTestId("ui-export-history-item")).toHaveAttribute("data-mode", "draft");
  await expect(history.getByTestId("ui-export-history-item")).toContainText("Borrador");
  await expect(history.getByTestId("ui-export-history-item")).toContainText("Salud");

  const stored = await page.evaluate((key) => localStorage.getItem(key), HISTORY_KEY);
  const parsed: unknown = stored ? JSON.parse(stored) : [];
  expect(Array.isArray(parsed)).toBe(true);
  expect((parsed as Array<{ mode: string }>)[0]?.mode).toBe("draft");

  await page.getByTestId("ui-export-history-clear").click();
  const clearHistoryDialog = page.getByRole("dialog", {
    name: "Borrar historial de exportaciones",
  });
  await expect(clearHistoryDialog).toBeVisible();
  await expect(clearHistoryDialog.locator(".confirm-dialog__body")).toContainText(
    "El proyecto y los sitios exportados no se modificarán",
  );
  await clearHistoryDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByTestId("ui-export-history")).toBeVisible();
  await page.getByTestId("ui-export-history-clear").click();
  await page
    .getByRole("dialog", { name: "Borrar historial de exportaciones" })
    .getByRole("button", { name: "Borrar historial", exact: true })
    .click();
  await expect(page.getByTestId("ui-export-history")).toHaveCount(0);
  const cleared = await page.evaluate((key) => localStorage.getItem(key), HISTORY_KEY);
  expect(cleared).toBeNull();

  await page.getByTestId("ui-export-check-seo").click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "SEO", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "SEO", exact: true })).toBeFocused();
});

test("el historial persiste al recargar y la producción exporta sin críticos", async ({ page }) => {
  await openDemoStore(page);
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });

  const production = page.getByTestId("ui-export-production");
  await expect(production).toBeEnabled({ timeout: 30_000 });

  await production.click();
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Exportar sitio de producción");
  await dialog.getByTestId("ui-confirm-accept").click();

  await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
    timeout: 90_000,
  });
  await expect(page.getByTestId("ui-export-history")).toBeVisible();
  const prodItem = page.locator('[data-testid="ui-export-history-item"][data-mode="production"]');
  await expect(prodItem).toHaveCount(1);
  await expect(prodItem).toContainText("Producción");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Exportar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exportar" })).toBeVisible();
  await expect(page.getByTestId("ui-export-history-item")).toHaveCount(1);
  await expect(page.getByTestId("ui-export-history-item")).toHaveAttribute(
    "data-mode",
    "production",
  );
});

test("el contexto público forma parte de la producción y mantiene los contadores coherentes", async ({
  page,
}) => {
  await openDemoStore(page);
  await page.getByText("Contenido público de producción", { exact: true }).click();
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ui-export-ai-context-status")).toContainText(
    "se generan siempre",
  );
  await expect(page.getByTestId("ui-export-production")).toBeEnabled();
  await expect(page.getByTestId("ui-export-ai-context")).toHaveCount(0);

  const summary = page.locator(".optimization-export-summary");
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const block = page.locator(".export-warning");
  const blockCount =
    (await block.count()) > 0 ? Number((await block.innerText()).match(/(\d+)/)?.[1] ?? "0") : 0;
  if (blockCount > 0) {
    await expect(summary).toContainText(`${blockCount} críticos`);
  } else {
    await expect(page.locator(".export-warning")).toHaveCount(0);
  }
});

test("descarga real de .solara.json e importación inválida con error accionable", async ({
  page,
}) => {
  await openDemoStore(page);
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("ui-export-backup").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${DEMO_SLUG}.solara.json`);

  const stream = await download.createReadStream();
  if (!stream) throw new Error("sin stream de descarga");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    format: string;
    version: number;
    project: { slug: string };
  };
  expect(payload.format).toBe("solara-project");
  expect(payload.version).toBe(2);
  expect(payload.project.slug).toBe(DEMO_SLUG);

  const flipsKey = await watchDisabledFlips(page, '[data-testid="ui-export-backup"]');

  await page.locator('input[type="file"]').setInputFiles({
    name: "basura.json",
    mimeType: "application/json",
    buffer: Buffer.from("esto no es un respaldo"),
  });
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Importar respaldo");
  await expect(dialog).toContainText("Importar y reemplazar");

  await dialog.getByTestId("ui-confirm-accept").click();
  await expect.poll(() => readFlips(page, flipsKey), { timeout: 15_000 }).toContain("disabled");

  const error = page.getByTestId("ui-inline-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText("corrupto");
  await expect(error).toContainText("JSON");

  await expect(page.getByTestId("ui-export-backup")).toBeEnabled();
  await expect(page.getByTestId("ui-export-import")).toBeEnabled();
  await expect(page.getByTestId("ui-export-draft")).toBeEnabled();
  await expect(page.getByTestId("ui-export-production")).toBeEnabled();
});

test("el diálogo de importación cancela sin efectos y un respaldo válido reemplaza el proyecto", async ({
  page,
}) => {
  await openMutableExportStore(page);
  await expect(page.locator(".optimization-export-summary")).toBeVisible({ timeout: 30_000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: "basura.json",
    mimeType: "application/json",
    buffer: Buffer.from("no es un respaldo"),
  });
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).not.toBeAttached();
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("ui-export-backup").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("sin stream de descarga");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    format: string;
    version: number;
    project: { name: string; updatedAt: string };
  };
  parsed.project.name = `${parsed.project.name} (importada)`;
  parsed.project.updatedAt = new Date().toISOString();
  const payload = Buffer.from(JSON.stringify(parsed), "utf8");

  await page.locator('input[type="file"]').setInputFiles({
    name: "copia.solara.json",
    mimeType: "application/json",
    buffer: payload,
  });
  await expect(page.getByTestId("ui-confirm-dialog")).toBeVisible();
  await page.getByTestId("ui-confirm-accept").click();

  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("ui-inline-error")).toHaveCount(0);
  await expect(page.locator(".studio-breadcrumb__current")).toContainText("(importada)", {
    timeout: 30_000,
  });
  await expect(page.getByRole("tab", { name: "Preparar", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("el toast de Overview aparece con rol status y se descarta con su botón", async ({ page }) => {
  await resetIndexedDb(page);
  await page.locator('[data-store-card-id="store-modo-sur-demo"]').click();
  await page.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  await expect(page.getByTestId("ui-toast")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Eliminar enlace / })
    .first()
    .click();
  const dialog = page.getByTestId("ui-confirm-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar enlace", exact: true }).click();

  const toast = page.getByTestId("ui-toast");
  await expect(toast).toHaveCount(1, { timeout: 10_000 });
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast).toContainText("Enlace de navegación eliminado");
  await expect(page.getByRole("region", { name: "Avisos" })).toContainText(
    "Enlace de navegación eliminado",
  );

  await toast.getByRole("button", { name: "Cerrar aviso" }).click();
  await expect(toast).toHaveCount(0);
});

test("los toasts apilan sin scrollear la página y se autocierran según gravedad", async ({
  page,
}) => {
  await page.route("**/__studio/components", (route) =>
    route.fulfill({ path: "apps/studio/dist/index.html" }),
  );
  await page.goto(`${studioUrl}/__studio/components`);
  await expect(page.getByRole("heading", { name: "Galería de componentes" })).toBeVisible();

  const region = page.locator(".toast-region");
  await expect(region).toHaveAttribute("aria-label", "Avisos");
  const regionStyle = await region.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      position: style.position,
      overflowY: style.overflowY,
      pointerEvents: style.pointerEvents,
    };
  });
  expect(regionStyle.position).toBe("fixed");
  expect(regionStyle.overflowY).toBe("auto");
  expect(regionStyle.pointerEvents).toBe("none");

  const scrollBefore = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);

  await page.getByRole("button", { name: "Éxito", exact: true }).click();
  await page.getByRole("button", { name: "Error", exact: true }).click();
  await page.getByRole("button", { name: "Info", exact: true }).click();

  const toasts = page.getByTestId("ui-toast");
  await expect(toasts).toHaveCount(3);
  await expect(toasts.nth(0)).toHaveAttribute("role", "status");
  await expect(toasts.nth(1)).toHaveAttribute("role", "alert");
  await expect(toasts.nth(2)).toHaveAttribute("role", "status");
  await expect(toasts.nth(0)).toContainText("Cambios guardados.");
  await expect(toasts.nth(1)).toContainText("No se pudo guardar.");

  const scrollAfter = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
  expect(scrollAfter).toBe(scrollBefore);

  await toasts.nth(1).getByRole("button", { name: "Cerrar aviso" }).click();
  await expect(toasts).toHaveCount(2);

  await expect(toasts).toHaveCount(0, { timeout: 8_000 });
});
