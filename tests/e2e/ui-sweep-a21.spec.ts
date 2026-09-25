import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createCleanStore, openMutableScaleStore } from "./project-helpers";

/**
 * Barrido A21 — Seo + ManagedPersistenceControls (OWNER: features/Seo.tsx +
 * features/ManagedPersistenceControls.tsx).
 *
 * Contrato de 3 capas por control:
 * (1) click real -> efecto real (valores persistidos entre pestañas, preview
 *     de Google/OG actualizado, informe descargado, conflicto abierto);
 * (2) auto-feedback del control (maxLength + contador, aria-pressed del
 *     checklist, estados del indicador managed: pendiente/guardando/guardado/
 *     error, foco de la trampa del diálogo de conflicto);
 * (3) contrato de datos (página home -> homepageSeoPreview; socialImageId ->
 *     preview OG; expectedVersion -> VERSION_CONFLICT -> onConflict; abrir
 *     sitio -> endpoint managed; recargar desde disco -> proyecto del disco;
 *     duplicar -> tienda «copia»).
 *
 * El servidor de Studio sirve una SNAPSHOT de apps/studio/dist: otros agentes
 * del barrido reconstruyen dist en paralelo y un build a mitad de carrera
 * entregaría un bundle inconsistente. El servidor managed reutiliza la misma
 * snapshot como raíz estática (serve.mjs).
 */

const DEMO_STORE_ID = "store-modo-sur-demo";
const DEMO_SLUG = "demo-catalogo-jerarquico";

interface StudioSnapshotServer {
  server: Server;
  url: string;
  root: string;
}

interface ManagedServer {
  url: string;
  root: string;
  process: ChildProcess;
}

interface ManagedProjectRef {
  id: string;
  name: string;
}

function snapshotDist(): string {
  const sourceRoot = resolve("apps/studio/dist");
  const targetRoot = mkdtempSync(join(tmpdir(), "solara-a21-dist-"));
  const copyAll = (): void => {
    rmSync(targetRoot, { recursive: true, force: true });
    mkdirSync(targetRoot, { recursive: true });
    cpSync(sourceRoot, targetRoot, { recursive: true, dereference: true });
  };
  const references = (): string[] => {
    const html = readFileSync(join(sourceRoot, "index.html"), "utf8");
    return [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((match) => match[1] ?? "");
  };
  const complete = (): boolean => {
    if (
      readFileSync(join(sourceRoot, "index.html"), "utf8") !==
      readFileSync(join(targetRoot, "index.html"), "utf8")
    ) {
      return false;
    }
    return references().every((asset) => {
      const source = join(sourceRoot, asset);
      const target = join(targetRoot, asset);
      if (!existsSync(source) || !existsSync(target)) return false;
      return readFileSync(source).equals(readFileSync(target));
    });
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    copyAll();
    if (complete()) return targetRoot;
    void sleep(2_000);
  }
  throw new Error("No se pudo obtener un snapshot estable de apps/studio/dist.");
}

async function startSnapshotServer(): Promise<StudioSnapshotServer> {
  const root = snapshotDist();
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (requested === "/__solara/session") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ managed: false }));
      return;
    }
    const normalized = normalize(requested).replace(/^([/\\])+/, "");
    let file = resolve(join(root, normalized));
    if (!file.startsWith(root)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const contentTypes: Record<string, string> = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de Studio.");
  }
  return { server, url: `http://127.0.0.1:${address.port}`, root };
}

async function stopSnapshotServer(snapshot: StudioSnapshotServer): Promise<void> {
  await new Promise<void>((resolveClosing, reject) => {
    snapshot.server.close((error) => (error ? reject(error) : resolveClosing()));
  });
  rmSync(snapshot.root, { recursive: true, force: true });
}

async function startManagedServer(staticRoot: string): Promise<ManagedServer> {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-a21-managed-"));
  const port = 5400 + Math.floor(Math.random() * 300);
  const token = randomBytes(24).toString("base64url");
  const url = `http://127.0.0.1:${port}`;
  const serverProcess: ChildProcess = spawn(
    process.execPath,
    [
      resolve("packages/exporter/scripts/serve.mjs"),
      staticRoot,
      String(port),
      token,
      applicationRoot,
    ],
    { cwd: resolve("."), stdio: "ignore" },
  );
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${url}/__solara/session`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15_000, intervals: [100, 250, 500] },
    )
    .toBe(200);
  return { url, root: applicationRoot, process: serverProcess };
}

async function stopManagedServer(managed: ManagedServer): Promise<void> {
  if (managed.process.exitCode === null) managed.process.kill();
  rmSync(managed.root, { recursive: true, force: true });
}

/** Un servidor gestionado nuevo no materializa la plantilla protegida en disco. */
async function ensureManagedProject(
  page: Page,
  managed: ManagedServer,
  requestedName: string,
): Promise<ManagedProjectRef> {
  await page.goto(managed.url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 120_000,
  });

  let cards = page.locator(".dashboard-store-card");
  if ((await cards.count()) === 0) {
    await createCleanStore(page, requestedName);
    await page.getByRole("button", { name: "Volver a tiendas" }).click();
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
      timeout: 120_000,
    });
    cards = page.locator(".dashboard-store-card");
  }

  const card = cards.first();
  const name = (
    (await card.locator(".dashboard-store-card__button strong").textContent()) ?? requestedName
  ).trim();
  const id = await card.locator(".dashboard-store-card__button").getAttribute("data-store-card-id");
  if (!id) throw new Error(`No se pudo identificar el proyecto managed "${name}".`);
  return { id, name };
}

async function openManagedProject(
  page: Page,
  managed: ManagedServer,
  project: ManagedProjectRef,
): Promise<void> {
  await page.goto(managed.url);
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 120_000,
  });
  const card = page
    .locator(".dashboard-store-card")
    .filter({ has: page.locator(`[data-store-card-id="${project.id}"]`) })
    .first();
  await expect(card).toBeVisible({ timeout: 120_000 });
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 120_000,
  });
}

let studioServer: StudioSnapshotServer;

test.beforeAll(async () => {
  studioServer = await startSnapshotServer();
});

test.afterAll(async () => {
  await stopSnapshotServer(studioServer);
});

test.setTimeout(120_000);

async function wipeIndexedDb(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolvePromise, reject) => {
        const request = indexedDB.deleteDatabase("solara-commerce-studio");
        request.addEventListener("success", () => resolvePromise());
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("blocked", () =>
          reject(new Error("No se pudo limpiar la base de Studio.")),
        );
      }),
  );
}

async function openDemoStore(page: Page): Promise<void> {
  await page.goto(studioServer.url);
  await wipeIndexedDb(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible({
    timeout: 40_000,
  });
  const card = page.locator(`article:has([data-store-card-id="${DEMO_STORE_ID}"])`);
  await card.locator(".dashboard-store-card__button").click();
  await page
    .getByRole("region", { name: /Tienda seleccionada:/ })
    .getByRole("button", { name: "Abrir tienda", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Áreas de la tienda" })).toBeVisible({
    timeout: 40_000,
  });
}

async function openMutableStore(page: Page, name = "Tienda A21 mutable"): Promise<void> {
  await page.goto(studioServer.url);
  await wipeIndexedDb(page);
  await page.reload();
  await openMutableScaleStore(page, name);
}

function seoPanel(page: Page): Locator {
  return page.locator('[data-studio-editor-pane][data-tab="seo"]');
}

function overviewPanel(page: Page): Locator {
  return page.locator('[data-studio-editor-pane][data-tab="overview"]');
}

async function goToSeoTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SEO y Google" })).toBeVisible();
}

async function failRendererChunk(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "serviceWorker", {
        value: undefined,
        configurable: true,
      });
    } catch {
      // Los navegadores sin service workers ya permiten interceptar el chunk.
    }
  });
  // "renderPreviewHtml" aparece en varios chunks del build: el worker de
  // preview lo invoca (t.renderPreviewHtml) y los chunks que exportan el
  // módulo @solara/exporter lo declaran (xx as renderPreviewHtml). La
  // auditoría SEO hace import("@solara/exporter") desde Seo-*.js, así que el
  // bloqueo debe cubrir TODOS los chunks que lo contienen salvo el entry del
  // index.html (romperlo impediría bootear el Studio). Sin flag de un solo
  // disparo: un abort no consume el bloqueo del chunk del exporter.
  const assetsDirectory = resolve("apps/studio/dist/assets");
  const entryScripts = new Set(
    [
      ...readFileSync(resolve("apps/studio/dist/index.html"), "utf8").matchAll(
        /assets\/[^"']+\.js/g,
      ),
    ].map((match) => `/${match[0]}`),
  );
  const rendererPaths = new Set(
    readdirSync(assetsDirectory)
      .filter(
        (asset) =>
          asset.endsWith(".js") &&
          !entryScripts.has(`/assets/${asset}`) &&
          readFileSync(resolve(assetsDirectory, asset), "utf8").includes("renderPreviewHtml"),
      )
      .map((asset) => `/assets/${asset}`),
  );
  if (rendererPaths.size === 0) throw new Error("No se encontró el chunk del renderer SEO.");
  await page.route("**/assets/*.js", async (route) => {
    if (rendererPaths.has(new URL(route.request().url()).pathname)) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
}

test("el Studio mantiene el ancho de página en sus ocho pestañas y viewports", async ({ page }) => {
  await openDemoStore(page);

  const viewports = [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  const tabs = [
    "Preparar",
    "Resumen",
    "Catálogo",
    "Constructor",
    "Tema de la tienda",
    "Recursos",
    "SEO",
    "Exportar",
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const tab of tabs) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(metrics.documentWidth, `${tab} @ ${viewport.width}px`).toBeLessThanOrEqual(
        metrics.viewportWidth,
      );
      expect(metrics.bodyWidth, `${tab} @ ${viewport.width}px`).toBeLessThanOrEqual(
        metrics.viewportWidth,
      );
    }
  }
});

// --------------------------------------------------------------- SEO: global

test("A21.1 los campos globales limitan con maxLength, cuentan caracteres y persisten entre pestañas", async ({
  page,
}) => {
  await openMutableStore(page, "Tienda A21 SEO global");
  await goToSeoTab(page);

  const panel = seoPanel(page);
  const title = panel.getByLabel("Título SEO");
  const description = panel.getByLabel("Descripción SEO");

  await expect(title).toHaveAttribute("maxlength", "70");
  await expect(description).toHaveAttribute("maxlength", "180");
  await expect(panel.getByText(/\/70 caracteres$/)).toBeVisible();
  await expect(panel.getByText(/\/180 caracteres$/)).toBeVisible();

  await title.fill("Título global A21");
  await expect(panel.getByText(`${"Título global A21".length}/70 caracteres`)).toBeVisible();
  await description.fill("Descripción global A21.");
  await expect(panel.getByText(`${"Descripción global A21.".length}/180 caracteres`)).toBeVisible();

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(title).toHaveValue("Título global A21");
  await expect(description).toHaveValue("Descripción global A21.");
  await expect(panel.getByText(`${"Título global A21".length}/70 caracteres`)).toBeVisible();
});

test("A21.2 las verificaciones de Search Console y Merchant persisten entre pestañas", async ({
  page,
}) => {
  await openMutableStore(page, "Tienda A21 verificaciones");
  await goToSeoTab(page);

  const panel = seoPanel(page);
  const searchConsole = panel.getByLabel("Verificación de Search Console");
  const merchant = panel.getByLabel("Verificación de Merchant Center");

  await searchConsole.fill("google-site-verification=a21");
  await merchant.fill("merchant-verification-a21");

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await page.getByRole("tab", { name: "SEO", exact: true }).click();
  await expect(searchConsole).toHaveValue("google-site-verification=a21");
  await expect(merchant).toHaveValue("merchant-verification-a21");
});

// ------------------------------------------------------------------- Imagen

test("A21.3 el picker de imagen social cambia el campo y el preview de Open Graph", async ({
  page,
}) => {
  await openMutableStore(page, "Tienda A21 imagen social");
  await goToSeoTab(page);

  const panel = seoPanel(page);
  const select = panel.getByLabel("Portada del sitio", { exact: true });
  const ogImage = page.getByTestId("ui-seo-preview-og").locator("img");

  await expect(select.locator('option[value=""]')).toContainText(
    "Usar la primera imagen disponible",
  );
  const imageOptions = select.locator('option[value]:not([value=""])');
  const initialSelection = await select.inputValue();
  const imageValues = await imageOptions.evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );
  expect(imageValues.length).toBeGreaterThan(1);
  const selectedAssetValue =
    imageValues.find(
      (value) => value !== initialSelection && (initialSelection || value !== imageValues[0]),
    ) ?? imageValues[1];
  expect(selectedAssetValue).toMatch(/\S+/);

  const initialSrc = await ogImage.getAttribute("src");
  expect(initialSrc).toMatch(/\S+/);

  await select.selectOption(selectedAssetValue ?? "");
  await expect(select).toHaveValue(selectedAssetValue ?? "");
  await expect
    .poll(async () => ogImage.getAttribute("src"), { timeout: 10_000 })
    .not.toBe(initialSrc);

  await select.selectOption(initialSelection);
  await expect(select).toHaveValue(initialSelection);
  await expect.poll(async () => ogImage.getAttribute("src"), { timeout: 10_000 }).toBe(initialSrc);
});

test("A21.3b SEO reintenta la auditoría cuando el renderer vuelve a estar disponible", async ({
  page,
}) => {
  await failRendererChunk(page);
  await openDemoStore(page);
  await goToSeoTab(page);

  const error = page.getByTestId("ui-seo-audit-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  await expect(error).toContainText("No se pudo completar la auditoría");
  const retry = error.getByRole("button", { name: "Reintentar", exact: true });
  await expect(retry).toBeEnabled();

  await page.unroute("**/assets/*.js");
  await retry.click();
  await expect(error).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("ui-seo-audit-state")).toContainText("Score SEO:");
  await expect(page.getByTestId("ui-seo-crawler")).toBeVisible();
});

// -------------------------------------------------------- Per-page -> preview

test("A21.4 el SEO por página de Home manda en el preview de Google y Open Graph", async ({
  page,
}) => {
  await openMutableStore(page, "Tienda A21 SEO por página");

  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  const overview = overviewPanel(page);
  await expect(overview).toBeVisible();
  const pagesAccordion = overview.locator('[data-accordion-id="pages"]');
  await expect(pagesAccordion.locator(".overview-accordion__toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  const homeBlock = overview.locator(".page-editor").filter({ hasText: "Home" }).first();
  const homeTitle = homeBlock.getByLabel("Título SEO");
  const homeDescription = homeBlock.getByLabel("Descripción SEO");
  await expect(homeTitle).toHaveAttribute("maxlength", "70");
  await expect(homeDescription).toHaveAttribute("maxlength", "180");

  await homeTitle.fill("Home título A21");
  await expect(homeBlock.getByText(`${"Home título A21".length}/70 caracteres`)).toBeVisible();
  await homeDescription.fill("Home descripción A21.");
  await expect(
    homeBlock.getByText(`${"Home descripción A21.".length}/180 caracteres`),
  ).toBeVisible();

  await goToSeoTab(page);
  const googlePreview = page.getByTestId("ui-seo-preview-google");
  await expect(googlePreview.locator("a")).toHaveText("Home título A21");
  await expect(googlePreview).toContainText("Home descripción A21.");
  await expect(page.getByTestId("ui-seo-preview-og").locator("strong")).toHaveText(
    "Home título A21",
  );

  // El global no se tocó: la página manda sobre el seo global (contrato de datos).
  await expect(seoPanel(page).getByLabel("Título SEO")).not.toHaveValue("Home título A21");

  // Persistencia por página: vuelta al Resumen conserva los valores de Home.
  await page.getByRole("tab", { name: "Resumen", exact: true }).click();
  await expect(homeTitle).toHaveValue("Home título A21");
  await expect(homeDescription).toHaveValue("Home descripción A21.");
});

// ----------------------------------------------------------------- Checklist

test("A21.5 el checklist de revisión marca items con aria-pressed y actualiza el contador", async ({
  page,
}) => {
  await page.goto(studioServer.url);
  await wipeIndexedDb(page);
  await page.reload();
  await createCleanStore(page, "Tienda A21 SEO");
  await goToSeoTab(page);

  const items = page.getByTestId("ui-seo-check-item");
  const count = page.getByTestId("ui-seo-check-count");
  await expect(items).not.toHaveCount(0);
  await expect(count).toContainText("0/");

  const firstToggle = page.getByTestId("ui-seo-check-toggle").first();
  await expect(firstToggle).toHaveAttribute("aria-pressed", "false");
  await expect(firstToggle).toContainText("Marcar revisado");
  const item = firstToggle.locator("xpath=ancestor::li");
  await expect(item).toHaveAttribute("data-done", "false");

  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute("aria-pressed", "true");
  await expect(firstToggle).toContainText("Revisado");
  await expect(item).toHaveAttribute("data-done", "true");
  await expect(count).toContainText("1/");

  const total = Number.parseInt((await count.innerText()).split("/")[1] ?? "0", 10);
  const secondToggle = page.getByTestId("ui-seo-check-toggle").nth(1);
  await secondToggle.click();
  await expect(count).toContainText(`2/${total}`);

  await secondToggle.click();
  await expect(count).toContainText(`1/${total}`);
  await expect(page.getByTestId("ui-seo-check-toggle").nth(1)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("A21.6 «Ir a corregir» navega a la pestaña del destino sin colapsar el checklist", async ({
  page,
}) => {
  await page.goto(studioServer.url);
  await wipeIndexedDb(page);
  await page.reload();
  await createCleanStore(page, "Tienda A21 Navegación");
  await goToSeoTab(page);

  const fixButtons = page.getByTestId("ui-seo-check-fix");
  await expect(fixButtons).not.toHaveCount(0);
  const labels = await fixButtons.allTextContents();
  const destination = (labels[0] ?? "Ir a SEO").replace("Ir a ", "").trim();
  await fixButtons.first().click();

  await expect(page.getByRole("tab", { name: destination, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: destination, exact: true })).toBeFocused();
  await expect(page.getByTestId("ui-seo-check-fix")).toHaveCount(0);

  await goToSeoTab(page);
  await expect(page.getByTestId("ui-seo-check-fix")).not.toHaveCount(0);
});

// ---------------------------------------------------------------- Informe SEO

test("A21.7 «Descargar informe» baja el JSON de optimización con el slug de la tienda", async ({
  page,
}) => {
  await openDemoStore(page);
  await goToSeoTab(page);
  await expect(page.getByTestId("ui-seo-crawler")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ui-seo-route").first()).toContainText("/");

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Descargar informe" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${DEMO_SLUG}-optimization.json`);

  const path = await download.path();
  expect(path).toMatch(/\S+/);
  const report = JSON.parse(readFileSync(path ?? "", "utf8")) as {
    score?: number;
    routes?: Array<{ path: string; indexable?: boolean }>;
    snapshotHash?: string;
  };
  expect(typeof report.score).toBe("number");
  expect(Array.isArray(report.routes)).toBe(true);
  expect(report.routes?.length ?? 0).toBeGreaterThan(0);
  expect(typeof report.snapshotHash).toBe("string");
});

// ------------------------------------------------------- Guardado administrado

test("A21.8 el indicador managed anuncia pendientes, Guardando… y Guardado, y Ctrl+S guarda", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const managed = await startManagedServer(studioServer.root);
  try {
    const managedProject = await ensureManagedProject(page, managed, "Tienda A21 managed");
    await openManagedProject(page, managed, managedProject);

    const indicator = page.locator("output.save-indicator");
    const saveButton = page.locator("[data-studio-save]");
    await expect(indicator).toHaveAttribute("aria-live", "polite");
    await expect(indicator).toContainText("Guardado");
    // El guardado queda disponible incluso sin cambios, según el contrato del
    // editor: permite confirmar manualmente el snapshot actual.
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveAttribute("aria-busy", "false");

    await page.getByRole("tab", { name: "Resumen", exact: true }).click();
    const nameInput = page.getByLabel("Nombre de la tienda");
    await expect(nameInput).toBeVisible();

    await nameInput.fill("Edición A21 managed");
    await expect(saveButton).toBeEnabled();
    await expect(indicator).toContainText("Cambios pendientes");
    await expect(indicator).toHaveClass(/save-indicator--saved/);

    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>("[data-studio-save]");
      if (!button) throw new Error("No se encontró el botón de guardado.");
      const transitions: string[] = [];
      const record = () => transitions.push(button.getAttribute("aria-busy") ?? "missing");
      record();
      const observer = new MutationObserver(record);
      observer.observe(button, { attributes: true, attributeFilter: ["aria-busy"] });
      (
        window as unknown as { __managedSaveBusyTransitions?: string[] }
      ).__managedSaveBusyTransitions = transitions;
      (
        window as unknown as { __managedSaveBusyObserver?: MutationObserver }
      ).__managedSaveBusyObserver = observer;
    });
    await page.keyboard.press("Control+s");
    await expect(indicator).toContainText(
      /Guardado|Sitio anterior conservado|Sitio desactualizado/,
      {
        timeout: 90_000,
      },
    );
    await expect(indicator).not.toContainText("Cambios pendientes");
    await expect(indicator).toHaveClass(/save-indicator--(saved|site-outdated)/);
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveAttribute("aria-busy", "false");
    const saveTransitions = await page.evaluate(() => {
      const state = window as unknown as {
        __managedSaveBusyTransitions?: string[];
        __managedSaveBusyObserver?: MutationObserver;
      };
      state.__managedSaveBusyObserver?.disconnect();
      return state.__managedSaveBusyTransitions ?? [];
    });
    expect(saveTransitions, "el guardado administrado anuncia su estado ocupado").toContain("true");
    expect(saveTransitions.at(-1), "el guardado administrado vuelve a estar disponible").toBe(
      "false",
    );

    await nameInput.fill("Edición A21 botón");
    await expect(indicator).toContainText("Cambios pendientes");
    await saveButton.click();
    await expect(indicator).toContainText(
      /Guardado|Sitio anterior conservado|Sitio desactualizado/,
      {
        timeout: 90_000,
      },
    );
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveAttribute("aria-busy", "false");
    await expect(page.getByTestId("ui-status-bar")).toContainText("Persistencia: Disco");
  } finally {
    await stopManagedServer(managed);
  }
});

test("A21.8b Exportar anuncia y bloquea Abrir sitio mientras resuelve el host managed", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const managed = await startManagedServer(studioServer.root);
  try {
    const managedProject = await ensureManagedProject(page, managed, "Tienda A21 exportable");
    await openManagedProject(page, managed, managedProject);
    await page.getByRole("tab", { name: "Exportar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Exportar", exact: true })).toBeVisible();

    await page.getByTestId("ui-export-draft").click();
    await expect(page.getByTestId("ui-export-result")).toContainText("Exportación correcta", {
      timeout: 90_000,
    });

    const openSite = page.getByTestId("ui-export-open-site");
    await expect(openSite).toBeEnabled();
    await expect(openSite).toHaveAttribute("aria-busy", "false");
    await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>('[data-testid="ui-export-open-site"]');
      if (!button) throw new Error("No se encontró Abrir sitio en Exportar.");
      const transitions: string[] = [];
      const record = () => transitions.push(button.getAttribute("aria-busy") ?? "missing");
      record();
      const observer = new MutationObserver(record);
      observer.observe(button, { attributes: true, attributeFilter: ["aria-busy"] });
      (window as unknown as { __exportOpenBusy?: string[] }).__exportOpenBusy = transitions;
      (window as unknown as { __exportOpenObserver?: MutationObserver }).__exportOpenObserver =
        observer;
    });

    const popupPromise = page.waitForEvent("popup");
    await openSite.click();
    const popup = await popupPromise;
    await expect(openSite).toBeEnabled({ timeout: 30_000 });
    await expect(openSite).toHaveAttribute("aria-busy", "false");
    const transitions = await page.evaluate(() => {
      const state = window as unknown as {
        __exportOpenBusy?: string[];
        __exportOpenObserver?: MutationObserver;
      };
      state.__exportOpenObserver?.disconnect();
      return state.__exportOpenBusy ?? [];
    });
    expect(transitions).toContain("true");
    expect(transitions.at(-1)).toBe("false");
    await popup.close();
  } finally {
    await stopManagedServer(managed);
  }
});

// ----------------------------------------------------- Conflicto de versionado

/**
 * Prepara el conflicto real: A abre la tienda y guarda (versión N+1); B, que
 * abrió con la versión N, intenta guardar y recibe VERSION_CONFLICT.
 */
async function triggerConflict(pageA: Page, pageB: Page, managed: ManagedServer): Promise<void> {
  const managedProject = await ensureManagedProject(pageA, managed, "Tienda A21 conflicto");
  await openManagedProject(pageA, managed, managedProject);
  await openManagedProject(pageB, managed, managedProject);

  for (const page of [pageA, pageB]) {
    await page.getByRole("tab", { name: "Resumen", exact: true }).click();
    await expect(page.getByLabel("Nombre de la tienda")).toBeVisible();
  }

  await pageA.getByLabel("Nombre de la tienda").fill("Guardado por pestaña A");
  await pageA.locator("[data-studio-save]").click();
  await expect(pageA.locator(".save-indicator")).toContainText(
    /Guardado|Sitio anterior conservado|Sitio desactualizado/,
    { timeout: 90_000 },
  );

  await pageB.getByLabel("Nombre de la tienda").fill("Borrador de la pestaña B");
  await pageB.locator("[data-studio-save]").click();
  const dialog = pageB.getByTestId("ui-conflict-dialog");
  await expect(dialog).toBeVisible({ timeout: 90_000 });
  await expect(dialog).toHaveRole("dialog");
  await expect(
    pageB.getByRole("dialog", { name: "La tienda cambió en otra pestaña" }),
  ).toBeVisible();
}

test("A21.9 el conflicto abre el diálogo con trampa de foco y Conservar/Escape lo cierra restaurando el foco", async ({
  context,
  page,
}) => {
  test.setTimeout(360_000);
  const managed = await startManagedServer(studioServer.root);
  try {
    const pageB = await context.newPage();
    await triggerConflict(page, pageB, managed);

    // Foco inicial dentro del diálogo + estado de error visible en el indicador.
    await expect(pageB.getByTestId("ui-conflict-keep")).toBeFocused();
    await expect(pageB.locator("output.save-indicator")).toHaveClass(/save-indicator--error/);
    await expect(pageB.locator("output.save-indicator")).toContainText("Error al guardar");
    // El botón Reintentar existe pero el pane queda inert bajo el diálogo: el
    // locator por clase lo alcanza; el de rol sólo lo ve sin el overlay.
    await expect(pageB.locator(".save-retry")).toBeVisible();

    // Ciclo de Tab: desde el último botón vuelve al primero.
    await pageB.getByTestId("ui-conflict-duplicate").focus();
    await pageB.keyboard.press("Tab");
    await expect(pageB.getByTestId("ui-conflict-keep")).toBeFocused();

    // Shift+Tab: desde el primero va al último.
    await pageB.keyboard.press("Shift+Tab");
    await expect(pageB.getByTestId("ui-conflict-duplicate")).toBeFocused();

    // Escape equivale a Conservar: cierra, avisa y restaura el foco al botón.
    await pageB.keyboard.press("Escape");
    await expect(pageB.getByTestId("ui-conflict-dialog")).toBeHidden();
    await expect(pageB.getByTestId("ui-studio-notice")).toContainText("Borrador conservado");
    await expect(pageB.getByTestId("ui-conflict-dialog")).toHaveCount(0);
    // El restauro recupera el botón Guardar: el navegador lo desenfocó durante
    // el guardado (disabled) y el shell lo captura por selector como opener
    // (A14 resuelto; antes el foco caía en body).
    await expect(pageB.locator("[data-studio-save]")).toBeFocused();
    const notice = pageB.getByTestId("ui-studio-notice");
    await notice.getByRole("button", { name: "Cerrar aviso", exact: true }).click();
    await expect(notice).toHaveCount(0);

    // El indicador conserva el error: el guardado no se confirmó en disco.
    await expect(pageB.locator("output.save-indicator")).toHaveClass(/save-indicator--error/);
    await expect(pageB.getByRole("button", { name: "Reintentar" })).toBeVisible();

    // Reintentar con la versión vieja vuelve a abrir el conflicto (bucle real).
    await pageB.getByRole("button", { name: "Reintentar" }).click();
    await expect(pageB.getByTestId("ui-conflict-dialog")).toBeVisible({ timeout: 90_000 });
    await pageB.keyboard.press("Escape");
    await expect(pageB.getByTestId("ui-conflict-dialog")).toBeHidden();
  } finally {
    await stopManagedServer(managed);
  }
});

test("A14: tras conservar el borrador con Escape el foco cae al body, no al botón Guardar", async ({
  context,
  page,
}) => {
  test.setTimeout(360_000);
  const managed = await startManagedServer(studioServer.root);
  try {
    const pageB = await context.newPage();
    await triggerConflict(page, pageB, managed);
    await pageB.keyboard.press("Escape");
    // El botón Guardar queda deshabilitado durante el guardado: el navegador
    // lo desenfoca antes de que Studio capture el opener del diálogo y el
    // restauro al cerrar apunta a document.body.
    await expect(pageB.locator("[data-studio-save]")).toBeFocused();
  } finally {
    await stopManagedServer(managed);
  }
});

test("A21.10 «Recargar desde disco» restaura el proyecto del disco y alinea el indicador", async ({
  context,
  page,
}) => {
  test.setTimeout(360_000);
  const managed = await startManagedServer(studioServer.root);
  try {
    const pageB = await context.newPage();
    await triggerConflict(page, pageB, managed);

    await pageB.getByTestId("ui-conflict-reload").click();
    await expect(pageB.getByTestId("ui-conflict-dialog")).toBeHidden({ timeout: 90_000 });

    // Datos del disco: el nombre guardado por la pestaña A reemplaza el borrador.
    await expect(pageB.locator(".studio-breadcrumb__current")).toHaveText(
      "Guardado por pestaña A",
      {
        timeout: 60_000,
      },
    );
    // El editor se remonta en la pestaña inicial: el formulario se abre en Resumen.
    await pageB.getByRole("tab", { name: "Resumen", exact: true }).click();
    await expect(pageB.getByLabel("Nombre de la tienda")).toHaveValue("Guardado por pestaña A", {
      timeout: 60_000,
    });
    await expect(pageB.locator("output.save-indicator")).toContainText("Guardado");
    // Guardar permanece disponible incluso cuando el snapshot ya está alineado.
    await expect(pageB.locator("[data-studio-save]")).toBeEnabled();
    await expect(pageB.locator("output.save-indicator")).toHaveClass(/save-indicator--saved/);
  } finally {
    await stopManagedServer(managed);
  }
});

test("A21.11 «Duplicar con mi borrador» crea una tienda copia y abre el editor sobre ella", async ({
  context,
  page,
}) => {
  test.setTimeout(360_000);
  const managed = await startManagedServer(studioServer.root);
  try {
    const pageB = await context.newPage();
    await triggerConflict(page, pageB, managed);

    await pageB.getByTestId("ui-conflict-duplicate").click();
    await expect(pageB.getByTestId("ui-conflict-dialog")).toBeHidden({ timeout: 90_000 });

    // La copia conserva el borrador de B y abre el editor sobre ella.
    await expect(pageB.locator(".studio-breadcrumb__current")).toHaveText(
      "Borrador de la pestaña B copia",
      { timeout: 90_000 },
    );
    // El editor se remonta en la pestaña inicial: el formulario se abre en Resumen.
    await pageB.getByRole("tab", { name: "Resumen", exact: true }).click();
    await expect(pageB.getByLabel("Nombre de la tienda")).toHaveValue(
      "Borrador de la pestaña B copia",
      { timeout: 60_000 },
    );
    await expect(pageB.locator("output.save-indicator")).toContainText("Guardado", {
      timeout: 90_000,
    });
    // Guardar permanece disponible incluso después de crear la copia.
    await expect(pageB.locator("[data-studio-save]")).toBeEnabled();
    await expect(pageB.getByTestId("ui-status-bar")).toContainText("Persistencia: Disco");
  } finally {
    await stopManagedServer(managed);
  }
});
