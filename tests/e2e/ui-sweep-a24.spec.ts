import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createProjectArchive, exportProject } from "@solara/exporter";
import { buildCatalogModernProject } from "@solara/project-schema/catalog-modern-template";
// @ts-expect-error módulo ESM compartido sin declaraciones públicas.
import { createLocalProjectStorage } from "../../packages/exporter/scripts/local-project-storage.mjs";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";
import { type RunningStudioServer, startStudioServer, stopStudioServer } from "./studio-server";

/**
 * Barrido A13 — Diálogos y acciones del dashboard (slice de auditoría;
 * Dashboard.tsx no se edita; los bugs quedan como regresiones del owner A12.
 *
 * Contrato por control: (1) efecto real, (2) auto-feedback del control,
 * (3) contrato de datos (payload -> receptor).
 */

let studioServer: RunningStudioServer;

test.beforeAll(async () => {
  studioServer = await startStudioServer();
});

test.afterAll(async () => {
  await stopStudioServer(studioServer.server);
});

test.setTimeout(90_000);

async function openDashboard(page: Page): Promise<void> {
  await page.goto(studioServer.url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
}

async function openMutableDashboardStore(page: Page, name: string): Promise<number> {
  await openDashboard(page);
  await openMutableScaleStore(page, name);
  await page.getByRole("button", { name: "Volver a tiendas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  return page.locator(".dashboard-store-card").count();
}

function cardByName(page: Page, name: string): Locator {
  return page.locator(".dashboard-store-card").filter({ hasText: name }).first();
}

async function selectStore(page: Page, name: string): Promise<Locator> {
  const card = cardByName(page, name);
  await card.locator(".dashboard-store-card__button").click();
  const detail = page.getByRole("region", { name: `Tienda seleccionada: ${name}` });
  await expect(detail).toBeVisible();
  return detail;
}

async function openCreateDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Crear tienda" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("A13: crear — diálogo con foco, validación de nombre y pasos con indicador activo", async ({
  page,
}) => {
  await openDashboard(page);
  const dialog = await openCreateDialog(page);

  // Auto-feedback: foco inicial en el nombre y pasos en «1 Marca».
  await expect(page.getByLabel("Nueva tienda")).toBeFocused();
  const steps = dialog.locator(".create-store__steps li");
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(0)).toHaveClass(/is-active/);

  // Validación: Continuar sin nombre no avanza.
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByTestId("ui-inline-error")).toContainText("Escribí un nombre");

  // Paso 2: aparece el campo de marca y el indicador lo marca activo.
  await page.getByLabel("Nueva tienda").fill("Tienda A13");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByLabel("Nombre visible de la marca")).toBeVisible();
  await expect(steps.nth(1)).toHaveClass(/is-active/);

  // Atrás vuelve al paso 1 y el indicador retrocede.
  await dialog.getByRole("button", { name: "Atrás", exact: true }).click();
  await expect(page.getByLabel("Nombre visible de la marca")).toHaveCount(0);
  await expect(steps.nth(0)).toHaveClass(/is-active/);
  await expect(steps.nth(1)).not.toHaveClass(/is-active/);

  // Avance completo: paso 3 (email/WhatsApp) y paso 4 (revisión con botón final).
  for (let step = 1; step <= 2; step += 1) {
    await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(page.getByLabel("Email de contacto (opcional)")).toBeVisible();
  await expect(page.getByLabel("WhatsApp (opcional)")).toBeVisible();
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(steps.nth(3)).toHaveClass(/is-active/);
  await expect(dialog).toContainText("diseño Catalog Modern");
  await expect(dialog.getByRole("button", { name: "Crear tienda desde plantilla" })).toBeVisible();
});

test("A13: crear — cancelar con Escape y con X devuelve el foco al botón", async ({ page }) => {
  await openDashboard(page);
  const createButton = page.getByRole("button", { name: "Nueva tienda", exact: true });

  await openCreateDialog(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Crear tienda" })).toHaveCount(0);
  await expect(createButton).toBeFocused();

  await openCreateDialog(page);
  await page.getByRole("button", { name: "Cerrar creación" }).click();
  await expect(page.getByRole("dialog", { name: "Crear tienda" })).toHaveCount(0);
  await expect(createButton).toBeFocused();
});

test("A13: crear — el contrato de datos agrega la card con su id y persiste", async ({ page }) => {
  await openDashboard(page);

  const dialog = await openCreateDialog(page);
  await page.getByLabel("Nueva tienda").fill("Tienda A13");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Nombre visible de la marca").fill("Marca A13");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Email de contacto (opcional)").fill("hola@a13.test");
  await page.getByLabel("WhatsApp (opcional)").fill("5491100000000");
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
  await dialog.getByRole("button", { name: "Crear tienda desde plantilla" }).click();

  // Efecto real: la creación navega al editor con la tienda nueva activa.
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();

  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");
  await expect(cardByName(page, "Tienda A13")).toBeVisible();

  // Contrato de datos: la card nueva abre un detalle con id generado `store-*`.
  const detail = await selectStore(page, "Tienda A13");
  await expect(detail.locator("dd").first()).toHaveText(/^store-/);

  // Persistencia: tras recargar, la tienda creada sigue en la biblioteca.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");
  await expect(cardByName(page, "Tienda A13")).toBeVisible();
});

test("A13: duplicar — id nuevo, nombre elegido, cancelar y toast", async ({ page }) => {
  await openDashboard(page);
  const originalDetail = await selectStore(page, "Predeterminado");
  const originalId = (await originalDetail.locator("dd").first().textContent()) ?? "";
  expect(originalId).toMatch(/^store-/);

  // Cancelar no crea nada y el foco vuelve al disparador del diálogo (el
  // botón Duplicar del panel): restauración nativa del diálogo, no a la card.
  await originalDetail.getByRole("button", { name: "Duplicar" }).click();
  const duplicateDialog = page.getByTestId("ui-duplicate-dialog");
  await expect(duplicateDialog).toBeVisible();
  await expect(page.getByTestId("ui-duplicate-name")).toHaveValue("Predeterminado (copia)");
  await expect(page.getByTestId("ui-duplicate-name")).toBeFocused();
  await duplicateDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(duplicateDialog).toBeHidden();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("1 visibles");
  await expect(originalDetail.getByRole("button", { name: "Duplicar", exact: true })).toBeFocused();

  // Confirmación con nombre propio: la card nueva aparece con ese nombre.
  await originalDetail.getByRole("button", { name: "Duplicar" }).click();
  await expect(duplicateDialog).toBeVisible();
  await page.getByTestId("ui-duplicate-name").fill("Copia A13");
  await duplicateDialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(duplicateDialog).toBeHidden();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("2 visibles");
  await expect(cardByName(page, "Copia A13")).toBeVisible();
  await expect(page.getByTestId("ui-toast")).toContainText("Tienda duplicada");

  // Contrato de datos: la copia recibe un id nuevo, distinto del original.
  const copyDetail = await selectStore(page, "Copia A13");
  await expect(copyDetail.locator("dd").first()).toHaveText(/^store-/);
  expect((await copyDetail.locator("dd").first().textContent()) ?? "").not.toBe(originalId);
});

test("A12: duplicar con éxito devuelve el foco a la card de origen", async ({ page }) => {
  await openDashboard(page);
  const detail = await selectStore(page, "Predeterminado");
  await detail.getByRole("button", { name: "Duplicar" }).click();
  const duplicateDialog = page.getByTestId("ui-duplicate-dialog");
  await expect(duplicateDialog).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "Duplicar", exact: true }).click();
  await expect(duplicateDialog).toBeHidden();
  // El camino de cancelar restaura el foco al disparador del diálogo; el de
  // éxito ahora también devuelve el foco a la card de origen (fix A12).
  await expect(page.locator('[data-store-card-id="store-modo-sur-demo"]')).toBeFocused();
});

test("A13: archivar — confirmación, cancelar y deshacer", async ({ page }) => {
  const storeName = "Tienda A24 archivable";
  const visibleBefore = await openMutableDashboardStore(page, storeName);
  const detail = await selectStore(page, storeName);

  // La confirmación es un diálogo propio con foco en Cancelar (destructivo).
  await detail.getByRole("button", { name: "Archivar", exact: true }).click();
  const confirm = page.getByTestId("ui-confirm-dialog");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Archivar tienda");
  await expect(confirm).toContainText(`"${storeName}"`);
  await expect(confirm.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();

  // Cancelar no archiva.
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(`${visibleBefore} visibles`);

  // Confirmar archiva: la card sale de Activas y el toast ofrece Deshacer.
  await detail.getByRole("button", { name: "Archivar", exact: true }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByTestId("ui-confirm-accept").click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(`${visibleBefore - 1} visibles`);

  const toast = page.getByTestId("ui-toast").filter({ hasText: "archivada" }).first();
  await expect(toast).toContainText("archivada");
  await toast.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(`${visibleBefore} visibles`);
  await expect(cardByName(page, storeName).locator(".dashboard-store-card__status")).toHaveText(
    "Activa",
  );
});

test("A13: archivar — restaurar desde el filtro de archivadas", async ({ page }) => {
  const storeName = "Tienda A24 restore";
  const visibleBefore = await openMutableDashboardStore(page, storeName);
  const detail = await selectStore(page, storeName);
  await detail.getByRole("button", { name: "Archivar", exact: true }).click();
  await page.getByTestId("ui-confirm-dialog").getByTestId("ui-confirm-accept").click();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(`${visibleBefore - 1} visibles`);

  // La card vive en Archivadas con su estado reflejado.
  await page.getByLabel("Estado").selectOption("archived");
  await expect(cardByName(page, storeName).locator(".dashboard-store-card__status")).toHaveText(
    "Archivada",
  );

  // Restaurar la vuelve a Activas: como el filtro sigue en «Archivadas», la
  // card sale de la lista visible y el detalle se cierra al quedar sin
  // selección visible (comportamiento del filtro, no una pérdida de datos).
  const archivedDetail = await selectStore(page, storeName);
  await archivedDetail.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText("0 visibles");
  await expect(cardByName(page, storeName)).toHaveCount(0);

  // En Activas la card reaparece con estado Activa y el detalle ofrece Archivar.
  await page.getByLabel("Estado").selectOption("active");
  await expect(page.locator(".dashboard-cosmic-count")).toHaveText(`${visibleBefore} visibles`);
  await expect(cardByName(page, storeName).locator(".dashboard-store-card__status")).toHaveText(
    "Activa",
  );
  const restoredDetail = await selectStore(page, storeName);
  await expect(restoredDetail.getByRole("button", { name: "Archivar", exact: true })).toBeVisible();
});

test("A12: restaurar muestra el toast de confirmación y no deja foco en una card", async ({
  page,
}) => {
  const storeName = "Tienda A24 restore toast";
  await openMutableDashboardStore(page, storeName);
  const detail = await selectStore(page, storeName);
  await detail.getByRole("button", { name: "Archivar", exact: true }).click();
  await page.getByTestId("ui-confirm-dialog").getByTestId("ui-confirm-accept").click();
  await page.getByLabel("Estado").selectOption("archived");
  const archivedDetail = await selectStore(page, storeName);
  await archivedDetail.getByRole("button", { name: "Restaurar", exact: true }).click();
  // Archivar muestra toast con Deshacer; restaurar muestra una confirmación
  // propia sin acción de deshacer (fix A12) aunque la card salga del filtro.
  const toast = page.locator("[data-testid='ui-toast']").filter({ hasText: "restaurada" });
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText("Deshacer");
  // La card restaurada ya no está en el filtro «Archivadas»: ninguna card
  // queda enfocada (la selección no migra a otro destino visible).
  await expect(page.locator(".dashboard-store-card__button:focus")).toHaveCount(0);
});

test("A13: respaldo ahora — descarga real de un .solara.json con el proyecto", async ({ page }) => {
  await openDashboard(page);
  await selectStore(page, "Predeterminado");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Respaldo ahora" }).click();
  const download = await downloadPromise;
  // El nombre deriva del slug del proyecto (demo-catalogo-jerarquico), no del
  // nombre visible «Predeterminado»: contrato App.tsx -> downloadBlob.
  expect(download.suggestedFilename()).toBe("demo-catalogo-jerarquico-respaldo.solara.json");

  const envelope = JSON.parse(readFileSync((await download.path()) ?? "", "utf8")) as {
    format: string;
    version: number;
    project: { schemaVersion: number; id: string };
  };
  expect(envelope.format).toBe("solara-project");
  expect(envelope.version).toBe(2);
  expect(envelope.project.schemaVersion).toBe(2);
  expect(envelope.project.id).toBe("store-modo-sur-demo");

  // Auto-feedback del panel de detalle tras la operación.
  await expect(page.getByTestId("ui-detail-notice")).toContainText("Se creó un respaldo.");
});

test("A13: abrir tienda — la card y el detalle navegan al editor", async ({ page }) => {
  await openDashboard(page);
  const detail = await selectStore(page, "Predeterminado");
  await detail.getByRole("button", { name: "Abrir tienda", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();

  await page.getByRole("button", { name: "Volver a tiendas" }).click();
  const detailAfterReturn = await selectStore(page, "Predeterminado");
  await detailAfterReturn.getByRole("button", { name: "Abrir tienda" }).click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible();
});

// ---------------------------------------------------------------- modo gestionado

async function waitForServer(url: string): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(url)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10_000, intervals: [100, 250, 500] },
    )
    .toBe(200);
}

async function* bytesStream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

function serializeSiteFiles(files: ReadonlyMap<string, string | Uint8Array>): string {
  return JSON.stringify(
    [...files.entries()].map(([path, value]) =>
      typeof value === "string"
        ? { path, encoding: "utf8", data: value }
        : { path, encoding: "base64", data: Buffer.from(value).toString("base64") },
    ),
  );
}

async function seedManagedStore(applicationRoot: string): Promise<void> {
  const template = buildCatalogModernProject({
    seed: "demo",
    id: "store-a24-managed",
    name: "Predeterminado",
    slug: "predeterminado-a24",
    baseUrl: "https://predeterminado-a24.example",
  });
  const project = {
    ...template,
    origin: { ...template.origin, role: "store" as const, updatePolicy: "managed" as const },
  };
  const storage = createLocalProjectStorage({ applicationRoot });
  const transaction = await storage.beginSave({
    projectId: project.id,
    name: project.name,
    slug: project.slug,
    projectUpdatedAt: project.updatedAt,
    expectedVersion: null,
  });
  const archive = new TextEncoder().encode(createProjectArchive(project));
  const exported = exportProject(project, { mode: "production" });
  await storage.upload(transaction.transactionId, "project", bytesStream(archive));
  await storage.upload(
    transaction.transactionId,
    "site",
    bytesStream(new TextEncoder().encode(serializeSiteFiles(exported.files))),
  );
  await storage.commit(transaction.transactionId);
}

async function startManagedServer(): Promise<{ process: ChildProcess; url: string; root: string }> {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-a13-managed-"));
  await seedManagedStore(applicationRoot);
  // Rango propio (5400-5549): evita colisiones con agentes paralelos que usan
  // 4300-4499 (a15, local-storage), 4700-4899 (editor-persistence) y 4900+ (a11y).
  const port = 5400 + Math.floor(Math.random() * 150);
  const token = randomBytes(24).toString("base64url");
  const url = `http://127.0.0.1:${port}`;
  const serverProcess: ChildProcess = spawn(
    process.execPath,
    [
      resolve("packages/exporter/scripts/serve.mjs"),
      resolve("apps/studio/dist"),
      String(port),
      token,
      applicationRoot,
    ],
    { cwd: resolve("."), stdio: "ignore" },
  );
  await waitForServer(url);
  return { process: serverProcess, url, root: applicationRoot };
}

async function stopManagedServer(process: ChildProcess, root: string): Promise<void> {
  if (process.exitCode === null) process.kill();
  rmSync(root, { recursive: true, force: true });
}

interface ManagedStoreRef {
  id: string;
  name: string;
}

async function ensureManagedStore(
  page: Page,
  url: string,
  requestedName: string,
): Promise<ManagedStoreRef> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 120_000,
  });

  let cards = page.locator(".dashboard-store-card");
  if ((await cards.count()) === 0) {
    await createCleanStore(page, requestedName);
    await page.getByRole("button", { name: "Volver a tiendas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 120_000,
    });
    cards = page.locator(".dashboard-store-card");
  }

  const card = cards.filter({ hasText: requestedName }).first();
  const selectedCard = (await card.count()) > 0 ? card : cards.first();
  const name = (
    (await selectedCard.locator(".dashboard-store-card__button strong").textContent()) ??
    requestedName
  ).trim();
  const id = await selectedCard
    .locator(".dashboard-store-card__button")
    .getAttribute("data-store-card-id");
  if (!id) throw new Error(`No se pudo identificar la tienda managed "${name}".`);
  return { id, name };
}

test("A13: panel gestionado — descargar, respaldo, sitio público y carpeta", async ({ page }) => {
  test.setTimeout(240_000);
  const managed = await startManagedServer();
  try {
    await page.goto(managed.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Respaldar todo" })).toBeEnabled({
      timeout: 15_000,
    });

    const managedStore = await ensureManagedStore(page, managed.url, "Predeterminado");
    const detail = await selectStore(page, managedStore.name);
    const projectId = ((await detail.locator("dd").first().textContent()) ?? "").trim();
    expect(projectId).toMatch(/^store-/);

    // Descargar respaldo: archivo real desde disco, con versión del manifest.
    const downloadPromise = page.waitForEvent("download");
    await detail.getByRole("button", { name: "Descargar respaldo" }).click();
    const download = await downloadPromise;
    // Slug real del proyecto en disco con la versión actual del manifest. El
    // boot puede escribir más de una vez mientras materializa la tienda.
    expect(download.suggestedFilename()).toMatch(/-v\d+\.solara\.json$/);

    // Respaldo ahora: respaldo manual en disco, aviso en el panel.
    await detail.getByRole("button", { name: "Respaldo ahora" }).click();
    await expect(page.getByTestId("ui-detail-notice")).toContainText("Se creó un respaldo.");

    // Camino de error: el endpoint rechaza la apertura y el banner global
    // muestra el motivo; el botón vuelve a quedar habilitado y sin popup.
    await page.route("**/open-site", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "La tienda no tiene un sitio público válido." }),
      });
    });
    await detail.getByRole("button", { name: "Abrir sitio público" }).click();
    await expect(page.locator(".global-error")).toContainText("no tiene un sitio público válido");
    await page.getByRole("button", { name: "Cerrar mensaje" }).click();
    await expect(detail.getByRole("button", { name: "Abrir sitio público" })).toBeEnabled();
    await page.unroute("**/open-site");

    // Camino feliz: el sitio se exportó durante la migración de boot
    // (persistProjectToDisk exporta production) y el botón abre el popup real.
    const popupPromise = page.waitForEvent("popup");
    await detail.getByRole("button", { name: "Abrir sitio público" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/^http:\/\/127\.0\.0\.1:\d+/);
    // El título público es SEO y puede diferir del nombre interno de la tienda.
    await expect(popup).toHaveTitle(/\S+/);
    await popup.close();

    // Abrir carpeta: el POST llega al endpoint local con el id correcto; la
    // apertura del explorador queda fuera del entorno de pruebas.
    let folderRequestUrl = "";
    await page.route("**/open-folder", async (route) => {
      folderRequestUrl = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, folder: "e2e" }),
      });
    });
    await detail.getByRole("button", { name: "Abrir carpeta" }).click();
    // El POST llega al endpoint local con el id correcto; esperar a que el
    // botón salga del estado «Abriendo carpeta» asegura que el fetch terminó.
    await expect(detail.getByRole("button", { name: "Abrir carpeta" })).toBeEnabled();
    expect(folderRequestUrl).toContain(`/storage/projects/${projectId}/open-folder`);
    await expect(page.locator(".global-error")).toHaveCount(0);
  } finally {
    await stopManagedServer(managed.process, managed.root);
  }
});

test("A13: cierre del servidor — cancelar, estado cerrando y terminal con banner", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const managed = await startManagedServer();
  try {
    await page.goto(managed.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 15_000,
    });
    const closeButton = page.getByRole("button", { name: "Cerrar app" });
    await expect(closeButton).toBeVisible({ timeout: 15_000 });

    // Cancelar mantiene el servidor vivo y el diálogo devuelve el foco al
    // botón que lo abrió (restauración nativa de dialog.close()).
    await closeButton.click();
    const shutdownDialog = page.getByRole("dialog", { name: "¿Cerrar SolaraCommerce?" });
    await expect(shutdownDialog).toBeVisible();
    await shutdownDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(shutdownDialog).toBeHidden();
    await expect(closeButton).toBeFocused();
    await expect.poll(async () => (await fetch(managed.url)).status, { timeout: 5_000 }).toBe(200);

    // Cierre confirmado: el diálogo queda en «Cerrando...» con todo deshabilitado
    // mientras el servidor responde (respuesta demorada para poder observarlo).
    let delayShutdown = true;
    await page.route("**/__solara/shutdown", async (route) => {
      if (delayShutdown) await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_500));
      await route.continue();
    });
    await closeButton.click();
    await expect(shutdownDialog).toBeVisible();
    await shutdownDialog.getByRole("button", { name: "Cerrar y detener" }).click();
    const closing = shutdownDialog.getByRole("button", { name: "Cerrando..." });
    await expect(closing).toBeVisible();
    await expect(closing).toBeDisabled();
    await expect(shutdownDialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();

    // Terminal: banner persistente y servidor detenido.
    await expect(page.locator(".shutdown-status")).toContainText("Servidor local detenido", {
      timeout: 15_000,
    });
    await expect.poll(() => managed.process.exitCode, { timeout: 10_000 }).toBe(0);
    await expect(page.getByRole("button", { name: "Cerrar app" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Respaldar todo" })).toBeDisabled();

    // El estado terminal no se revierte: ni diálogo ni banner nuevo.
    delayShutdown = false;
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("solara:open-shutdown"));
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".shutdown-status")).toContainText("Servidor local detenido");
  } finally {
    await stopManagedServer(managed.process, managed.root);
  }
});

test("A12: la «X» de creación se deshabilita mientras la tienda se crea", async ({ page }) => {
  const managed = await startManagedServer();
  try {
    await page.goto(managed.url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Respaldar todo" })).toBeEnabled({
      timeout: 15_000,
    });

    // Demorar el inicio de la transacción de guardado hace observable el
    // estado «Creando» (la creación local es demasiado rápida para capturarla).
    await page.route("**/__solara/storage/projects", async (route) => {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_500));
      await route.continue();
    });

    const dialog = await openCreateDialog(page);
    await page.getByLabel("Nueva tienda").fill("Tienda A13 X");
    for (let step = 1; step <= 3; step += 1) {
      await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
    }
    const closeCreation = page.getByRole("button", { name: "Cerrar creación" });
    // El nombre cambia a «Creando» durante la transacción: el locator por regex
    // resuelve en ambos estados.
    const submit = dialog.getByRole("button", { name: /Crear tienda desde plantilla|Creando/ });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText("Creando");
    // Auto-feedback: la X queda deshabilitada mientras `creatingProject`;
    // closeCreate no hace nada y el diálogo no queda a medias.
    await expect(closeCreation).toBeDisabled();
    // Al terminar la transacción la creación navega igual al editor.
    await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await stopManagedServer(managed.process, managed.root);
  }
});
