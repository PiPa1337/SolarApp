import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createProjectArchive, exportProject } from "@solara/exporter";
import { buildCatalogModernProject } from "@solara/project-schema/catalog-modern-template";
// @ts-expect-error módulo ESM compartido sin declaraciones públicas.
import { createLocalProjectStorage } from "../../packages/exporter/scripts/local-project-storage.mjs";

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
  const project = buildCatalogModernProject({
    seed: "clean",
    id: "store-managed-save-test",
    name: "Tienda de guardado",
    slug: "tienda-de-guardado",
    baseUrl: "https://tienda-de-guardado.example",
  });
  const storage = createLocalProjectStorage({ applicationRoot });
  const transaction = await storage.beginSave({
    projectId: project.id,
    name: project.name,
    slug: project.slug,
    projectUpdatedAt: project.updatedAt,
    expectedVersion: null,
  });
  const archive = new TextEncoder().encode(createProjectArchive(project));
  const exported = exportProject(project, { mode: "draft" });
  await storage.upload(transaction.transactionId, "project", bytesStream(archive));
  await storage.upload(
    transaction.transactionId,
    "site",
    bytesStream(new TextEncoder().encode(serializeSiteFiles(exported.files))),
  );
  await storage.commit(transaction.transactionId);
}

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

test("el lanzador persiste el proyecto y el sitio fuera de IndexedDB", async ({ page }) => {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-managed-e2e-"));
  const port = 4300 + Math.floor(Math.random() * 200);
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
    await seedManagedStore(applicationRoot);
    await waitForServer(url);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
    await expect
      .poll(() => existsSync(join(applicationRoot, "proyectos")), { timeout: 15_000 })
      .toBe(true);

    const card = page.locator('article:has([data-store-card-id="store-managed-save-test"])');
    await card.locator(".dashboard-store-card__button").click();
    await page
      .getByRole("region", { name: /Tienda seleccionada:/ })
      .getByRole("button", { name: "Abrir tienda", exact: true })
      .click();
    await page.getByRole("tab", { name: "Resumen" }).click();
    const beforeSave = await page.evaluate(async () => {
      const response = await fetch("/__solara/storage/projects", { credentials: "same-origin" });
      return response.json();
    });
    const baseVersion = beforeSave.projects[0]?.version ?? 0;
    await expect(page.locator("[data-studio-save]")).toBeEnabled();
    await page.locator("[data-studio-save]").click();
    await expect(page.locator(".save-indicator")).toContainText(
      /Guardado|Sitio anterior conservado/,
    );
    const unchangedListing = await page.evaluate(async () => {
      const response = await fetch("/__solara/storage/projects", { credentials: "same-origin" });
      return response.json();
    });
    expect(unchangedListing.projects[0].version).toBe(baseVersion + 1);
    const name = page.getByLabel("Nombre de la tienda");
    await name.fill("Predeterminado editado");
    await page.locator("[data-studio-save]").click();
    await expect(page.locator(".save-indicator")).toContainText(
      /Guardado|Sitio anterior conservado/,
    );

    const manifests = await page.evaluate(async () => {
      const response = await fetch("/__solara/storage/projects", { credentials: "same-origin" });
      return response.json();
    });
    expect(manifests.projects).toHaveLength(1);
    expect(manifests.projects[0].version).toBe(baseVersion + 2);

    const folder = manifests.projects[0].folder as string;
    const manifest = JSON.parse(
      readFileSync(join(applicationRoot, "proyectos", folder, "manifest.json"), "utf8"),
    ) as { current: { version: number }; lastValidSite?: { directoryPath: string } };
    expect(manifest.current.version).toBe(baseVersion + 2);
    expect(manifest.lastValidSite?.directoryPath).toMatch(/\S+/);
    expect(
      existsSync(join(applicationRoot, manifest.lastValidSite?.directoryPath ?? "", "index.html")),
    ).toBe(true);

    await name.fill("Predeterminado con atajo");
    await page.keyboard.press("Control+s");
    await expect(page.locator(".save-indicator")).toContainText(
      /Guardado|Sitio anterior conservado/,
    );
    const shortcutListing = await page.evaluate(async () => {
      const response = await fetch("/__solara/storage/projects", { credentials: "same-origin" });
      return response.json();
    });
    expect(shortcutListing.projects[0].version).toBe(baseVersion + 3);

    await page.getByRole("button", { name: "Volver a tiendas" }).click();
    await expect(page.getByRole("heading", { name: "Tus tiendas" })).toBeVisible();
    await page.locator('[data-store-card-id="store-managed-save-test"]').click();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Abrir sitio público" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveTitle(/Tienda de guardado/i);
    await popup.close();
  } finally {
    if (serverProcess.exitCode === null) serverProcess.kill();
    rmSync(applicationRoot, { recursive: true, force: true });
  }
});

test("commit sin sitio conserva el sitio vigente cuando los bytes del proyecto no cambian", async () => {
  const applicationRoot = mkdtempSync(join(tmpdir(), "solara-site-reuse-"));
  try {
    const project = buildCatalogModernProject({
      seed: "clean",
      id: "store-site-reuse-test",
      name: "Tienda sitio vigente",
      slug: "tienda-sitio-vigente",
      baseUrl: "https://tienda-sitio-vigente.example",
    });
    const storage = createLocalProjectStorage({ applicationRoot });
    const archive = new TextEncoder().encode(createProjectArchive(project));

    const first = await storage.beginSave({
      projectId: project.id,
      name: project.name,
      slug: project.slug,
      projectUpdatedAt: project.updatedAt,
      expectedVersion: null,
    });
    const exported = exportProject(project, { mode: "draft" });
    await storage.upload(first.transactionId, "project", bytesStream(archive));
    await storage.upload(
      first.transactionId,
      "site",
      bytesStream(new TextEncoder().encode(serializeSiteFiles(exported.files))),
    );
    const firstReceipt = await storage.commit(first.transactionId);
    expect(firstReceipt.status).toBe("synced");

    const second = await storage.beginSave({
      projectId: project.id,
      name: project.name,
      slug: project.slug,
      projectUpdatedAt: project.updatedAt,
      expectedVersion: firstReceipt.version,
    });
    await storage.upload(second.transactionId, "project", bytesStream(archive));
    const secondReceipt = await storage.commit(second.transactionId);
    expect(secondReceipt.status).toBe("synced");
    expect(secondReceipt.site?.key).toBe(firstReceipt.site?.key);

    const editedArchive = new TextEncoder().encode(
      createProjectArchive({ ...project, name: "Tienda sitio vigente editada" }),
    );
    const third = await storage.beginSave({
      projectId: project.id,
      name: "Tienda sitio vigente editada",
      slug: project.slug,
      projectUpdatedAt: project.updatedAt,
      expectedVersion: secondReceipt.version,
    });
    await storage.upload(third.transactionId, "project", bytesStream(editedArchive));
    const thirdReceipt = await storage.commit(third.transactionId);
    expect(thirdReceipt.status).toBe("site-outdated");
    expect(thirdReceipt.site?.key).toBe(firstReceipt.site?.key);
  } finally {
    rmSync(applicationRoot, { recursive: true, force: true });
  }
});
