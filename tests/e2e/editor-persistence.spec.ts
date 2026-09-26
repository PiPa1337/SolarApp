/**
 * T0.8 — Multi-tab y recovery draft con el servidor gestionado.
 * Verifica el conflicto 409 entre dos pestañas (mensaje claro y las opciones
 * recargar disco / conservar borrador / duplicar) y el diálogo de recuperación
 * del borrador al volver a abrir la tienda tras una recarga.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";

test.setTimeout(process.env.CI ? 180_000 : 120_000);

async function waitForServer(url: string): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${url}/__solara/session`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10_000, intervals: [100, 250, 500] },
    )
    .toBe(200);
}

interface ManagedServer {
  url: string;
  root: string;
  process: ChildProcess;
}

async function startManagedServer(): Promise<ManagedServer> {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-persistence-e2e-"));
  const port = 4700 + Math.floor(Math.random() * 200);
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
  try {
    await waitForServer(url);
  } catch (reason) {
    serverProcess.kill();
    rmSync(applicationRoot, { recursive: true, force: true });
    throw reason;
  }
  return { url, root: applicationRoot, process: serverProcess };
}

async function stopManagedServer(managed: ManagedServer): Promise<void> {
  if (managed.process.exitCode === null) managed.process.kill();
  rmSync(managed.root, { recursive: true, force: true });
}

async function openDashboard(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
}

/** Crea una tienda editable (semilla placeholder) y queda dentro del Studio. */
async function createCleanStoreManaged(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Nueva tienda", exact: true }).click();
  await page.getByLabel("Nueva tienda").fill(name);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Crear tienda desde plantilla", exact: true }).click();
  // Ãreas lleva acento en la UI; usar matcher insensible al resto del texto.
  await expect(page.getByRole("navigation", { name: /de la tienda/ })).toBeVisible({
    timeout: 30_000,
  });
}

async function openManagedStoreByName(page: Page, name: string): Promise<void> {
  const card = page.locator(".dashboard-store-card").filter({
    has: page.getByText(name, { exact: true }),
  });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: new RegExp(`Tienda seleccionada: ${name}`) })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  const navigation = page.getByRole("navigation", { name: /de la tienda/ });
  const recovery = page.getByTestId("ui-confirm-dialog");
  await expect
    .poll(async () => (await navigation.isVisible()) || (await recovery.isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
}

async function renameAndSave(page: Page, name: string): Promise<void> {
  await page.getByLabel("Nombre de la tienda").fill(name);
  await page.locator("[data-studio-save]").click();
  await expect(page.locator(".save-indicator")).toHaveText(/Guardado|Sitio anterior conservado/, {
    timeout: 60_000,
  });
}

/** Abre una segunda ventana aislada (IndexedDB propio) sobre el mismo servidor. */
async function openSecondTab(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openDashboard(page, url);
  return page;
}

async function createConflict(
  browser: Browser,
  url: string,
  first: string,
  second: string,
): Promise<{ pageA: Page; pageB: Page }> {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await openDashboard(pageA, url);
  await createCleanStoreManaged(pageA, url, `${first} inicial`);
  await pageA.getByRole("tab", { name: "Resumen" }).click();
  await renameAndSave(pageA, first);

  const pageB = await openSecondTab(browser, url);
  await openManagedStoreByName(pageB, first);
  await pageB.getByRole("tab", { name: "Resumen" }).click();
  await renameAndSave(pageB, second);

  await pageA.getByLabel("Nombre de la tienda").fill(`${first} (borrador local)`);
  await pageA.locator("[data-studio-save]").click();
  await expect(pageA.getByTestId("ui-conflict-dialog")).toBeVisible({ timeout: 60_000 });
  return { pageA, pageB };
}

test("dos pestañas: la segunda guardada genera 409 con opciones y conservar borrador permite recuperarlo", async ({
  browser,
}) => {
  const managed = await startManagedServer();
  try {
    const { pageA } = await createConflict(browser, managed.url, "Tienda P0 A", "Tienda P0 B");
    await expect(pageA.getByTestId("ui-conflict-dialog")).toContainText("otra pestaña");

    // F2 (fix 409): el diálogo toma el foco inicial, el Tab queda atrapado
    // dentro de sus opciones y al elegir una el foco vuelve al estudio.
    await expect
      .poll(async () => {
        const focused = await pageA.evaluate(() => document.activeElement?.textContent ?? "");
        return focused;
      })
      .toContain("Conservar borrador");
    await pageA.keyboard.press("Tab");
    await expect
      .poll(async () => {
        const focused = await pageA.evaluate(
          () => document.activeElement?.closest("[data-testid='ui-conflict-dialog']") !== null,
        );
        return focused;
      })
      .toBe(true);

    await pageA.getByTestId("ui-conflict-keep").click();
    await expect(pageA.getByTestId("ui-conflict-dialog")).toHaveCount(0);
    await expect(pageA.getByTestId("ui-studio-notice")).toContainText("Borrador conservado");
    await expect
      .poll(async () => {
        const focusedInsideDialog = await pageA.evaluate(
          () => document.activeElement?.closest("[data-testid='ui-conflict-dialog']") !== null,
        );
        return focusedInsideDialog;
      })
      .toBe(false);
    await expect(pageA.getByLabel("Nombre de la tienda")).toHaveValue(
      "Tienda P0 A (borrador local)",
    );

    // T4.12: la recuperación del borrador ya no usa window.confirm; el
    // diálogo unificado (ui-confirm-dialog) pide confirmación explícita.
    await pageA.reload();
    await expect(pageA.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 30_000,
    });
    await openManagedStoreByName(pageA, "Tienda P0 B");
    const recovery = pageA.getByTestId("ui-confirm-dialog");
    await expect(recovery).toBeVisible({ timeout: 30_000 });
    await expect(recovery).toContainText("borrador");
    await recovery.getByRole("button", { name: "Recuperar borrador" }).click();
    await expect(pageA.getByRole("tab", { name: "Resumen" })).toBeVisible();
    await pageA.getByRole("tab", { name: "Resumen" }).click();
    await expect(pageA.getByLabel("Nombre de la tienda")).toHaveValue(
      "Tienda P0 A (borrador local)",
      { timeout: 30_000 },
    );
  } finally {
    await stopManagedServer(managed);
  }
});

test("el conflicto 409 permite recargar desde disco y descarta el borrador local", async ({
  browser,
}) => {
  const managed = await startManagedServer();
  try {
    const { pageA } = await createConflict(browser, managed.url, "Tienda P0 C", "Tienda P0 D");
    await pageA.getByTestId("ui-conflict-reload").click();

    await expect(pageA.locator(".studio-breadcrumb__current")).toHaveText("Tienda P0 D", {
      timeout: 60_000,
    });
    await pageA.getByRole("tab", { name: "Resumen" }).click();
    await expect(pageA.getByLabel("Nombre de la tienda")).toHaveValue("Tienda P0 D");
  } finally {
    await stopManagedServer(managed);
  }
});


test("el conflicto 409 permite duplicar con el borrador local y persiste la copia", async ({
  browser,
}) => {
  const managed = await startManagedServer();
  try {
    const { pageA } = await createConflict(browser, managed.url, "Tienda P0 G", "Tienda P0 H");
    await pageA.getByTestId("ui-conflict-duplicate").click();

    await expect(pageA.locator(".studio-breadcrumb__current")).toHaveText(
      "Tienda P0 G (borrador local) copia",
      { timeout: 60_000 },
    );
    await pageA.getByRole("button", { name: "Volver a tiendas" }).click();
    await expect(pageA.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
    await expect(
      pageA.locator(".dashboard-store-card").getByText("Tienda P0 G (borrador local) copia", {
        exact: true,
      }),
    ).toBeVisible();

    const listing = await pageA.evaluate(async () => {
      const response = await fetch("/__solara/storage/projects", { credentials: "same-origin" });
      return response.json();
    });
    const names = listing.projects.map((project: { name: string }) => project.name);
    expect(names).toContain("Tienda P0 G (borrador local) copia");
    expect(names).toContain("Tienda P0 H");
    expect(names.filter((name: string) => name.startsWith("Tienda P0 "))).toHaveLength(2);
  } finally {
    await stopManagedServer(managed);
  }
});
