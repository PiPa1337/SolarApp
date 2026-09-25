import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLocalProjectStorage } from "../scripts/local-project-storage.mjs";

const projectId = "store-storage-test";

function projectJson(name = "Prueba") {
  return JSON.stringify({
    format: "solara-project",
    version: 2,
    projectId,
    exportedAt: "2026-08-07T10:00:00.000Z",
    project: { schemaVersion: 2, id: projectId, name, slug: name.toLowerCase() },
  });
}

function siteMap(
  entries = [{ path: "index.html", encoding: "utf8", data: "<!doctype html><main>sitio</main>" }],
) {
  return JSON.stringify(entries);
}

function requestFrom(bytes) {
  return Readable.from([Buffer.from(bytes)]);
}

async function upload(storage, transactionId, kind, bytes) {
  await storage.upload(transactionId, kind, requestFrom(bytes));
}

describe("almacenamiento local de proyectos", () => {
  it("rechaza crear o sobrescribir la plantilla mediante un guardado normal", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-protected-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      await expect(
        storage.beginSave({
          projectId: "store-modo-sur-demo",
          name: "Predeterminado",
          slug: "predeterminado",
          projectUpdatedAt: "2026-08-07T10:00:00.000Z",
          expectedVersion: null,
        }),
      ).rejects.toMatchObject({ code: "PROTECTED_STORE" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza falsificar el rol protegido dentro del respaldo subido", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-protected-role-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId: "store-fake-template",
        name: "Falsa plantilla",
        slug: "falsa-plantilla",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      const archive = JSON.stringify({
        format: "solara-project",
        version: 2,
        projectId: "store-fake-template",
        exportedAt: "2026-08-07T10:00:00.000Z",
        project: {
          schemaVersion: 2,
          id: "store-fake-template",
          name: "Falsa plantilla",
          slug: "falsa-plantilla",
          origin: { role: "base-template", seed: "duplicate" },
        },
      });
      await upload(storage, transaction.transactionId, "project", archive);
      await expect(storage.commit(transaction.transactionId)).rejects.toMatchObject({
        code: "PROTECTED_STORE",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("versiona el respaldo y extrae el sitio público", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      await upload(storage, transaction.transactionId, "site", siteMap());
      const receipt = await storage.commit(transaction.transactionId);

      expect(receipt.version).toBe(1);
      expect(receipt.status).toBe("synced");
      const listing = await storage.list();
      expect(listing.projects).toHaveLength(1);
      expect(listing.projects[0]).toMatchObject({ projectId, version: 1, siteVersion: 1 });
      const sitePath = join(
        root,
        "proyectos",
        listing.projects[0].folder,
        "sitios",
        receipt.key,
        "index.html",
      );
      expect(await readFile(sitePath, "utf8")).toContain("sitio");
      expect((await storage.readCurrent(projectId)).manifest.current.sha256).toMatch(
        /^[a-f0-9]{64}$/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fija la semántica EX-B7: el sha256 son los bytes exactos del upload", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-hash-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T10:00:00.000Z",
        expectedVersion: null,
      });
      const payload = projectJson();
      const expectedHash = createHash("sha256").update(Buffer.from(payload, "utf8")).digest("hex");
      await upload(storage, transaction.transactionId, "project", payload);
      await upload(storage, transaction.transactionId, "site", siteMap());
      await storage.commit(transaction.transactionId);

      const current = await storage.readCurrent(projectId);
      expect(current.manifest.current.sha256).toBe(expectedHash);
      // Una re-serialización distinta del mismo contenido lógico produce otro hash:
      const reformatted = JSON.stringify(JSON.parse(payload), null, 2);
      expect(createHash("sha256").update(Buffer.from(reformatted, "utf8")).digest("hex")).not.toBe(
        expectedHash,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("acepta slugs largos dentro del contrato del schema y trunca sólo las rutas", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-longslug-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const longSlug = `${"a-".repeat(59)}b`; // 119 caracteres, válido para SlugSchema
      expect(longSlug).toHaveLength(119);
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: longSlug,
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      // La carpeta y el key usan safeSlug (64) para mantener rutas cortas…
      expect(transaction.folder).toMatch(new RegExp(`^${longSlug.slice(0, 64)}--[a-f0-9]{8}$`));
      await upload(
        storage,
        transaction.transactionId,
        "project",
        projectJson().replace('"slug":"prueba"', `"slug":"${longSlug}"`),
      );
      const receipt = await storage.commit(transaction.transactionId);
      expect(receipt.key.startsWith(longSlug.slice(0, 64))).toBe(true);
      // …pero el slug completo se conserva en el manifest y en el listado.
      expect((await storage.list()).projects[0].slug).toBe(longSlug);
      expect((await storage.readCurrent(projectId)).manifest.slug).toBe(longSlug);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza slugs fuera del contrato del schema (largo o patrón)", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-badslug-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const cases = [
        `${"a-".repeat(60)}b`, // 121 caracteres: excede SlugSchema
        "Tienda_A", // mayúsculas y guión bajo
        "tienda--doble", // guiones consecutivos
        "tienda-", // guión final
        "",
      ];
      for (const slug of cases) {
        await expect(
          storage.beginSave({
            projectId,
            name: "Prueba",
            slug,
            projectUpdatedAt: "2026-08-07T10:00:00.000Z",
            expectedVersion: null,
          }),
        ).rejects.toThrow(/slug de tienda inválido/i);
      }
      expect((await storage.list()).projects).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("conserva el sitio válido cuando una versión posterior sólo cambia el proyecto", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      const second = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T11:00:00.000Z",
        expectedVersion: 1,
      });
      await upload(storage, second.transactionId, "project", projectJson("Prueba nueva"));
      const secondReceipt = await storage.commit(second.transactionId);

      expect(secondReceipt).toMatchObject({ version: 2, status: "site-outdated" });
      expect(secondReceipt.site?.key).toBe(firstReceipt.key);
      const listing = await storage.list();
      expect(listing.projects[0]).toMatchObject({ version: 2, siteVersion: 1, siteOutdated: true });
      expect(
        (
          await stat(
            join(
              root,
              "proyectos",
              listing.projects[0].folder,
              "respaldos",
              `${firstReceipt.key}.solara.json`,
            ),
          )
        ).isFile(),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza un respaldo cuyo projectId no coincide con la transacción", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(
        storage,
        transaction.transactionId,
        "project",
        projectJson().replaceAll(projectId, "store-otra"),
      );
      await expect(storage.commit(transaction.transactionId)).rejects.toThrow(
        /no coincide con la tienda/i,
      );
      expect((await storage.list()).projects).toHaveLength(0);
      await storage.abort(transaction.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza conflictos de versión y rutas Zip Slip", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await storage.commit(first.transactionId);
      await expect(
        storage.beginSave({
          projectId,
          name: "Prueba",
          slug: "prueba",
          projectUpdatedAt: "2026-08-06T11:00:00.000Z",
          expectedVersion: null,
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const malicious = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T12:00:00.000Z",
        expectedVersion: 1,
      });
      await upload(storage, malicious.transactionId, "project", projectJson());
      await upload(
        storage,
        malicious.transactionId,
        "site",
        siteMap([{ path: "../fuera.txt", encoding: "utf8", data: "no" }]),
      );
      await expect(storage.commit(malicious.transactionId)).rejects.toThrow(/ruta insegura/i);
      expect((await storage.list()).projects[0].version).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("conserva el manifest anterior ante una interrupción y limita el upload", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-fault-"));
    try {
      let failingStage = "";
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        faultInjector: async (stage) => {
          if (stage === failingStage) throw new Error(`fallo simulado: ${stage}`);
        },
      });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      const limitedStorage = createLocalProjectStorage({
        applicationRoot: root,
        maxUploadBytes: 32,
      });
      const limited = await limitedStorage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await expect(
        upload(limitedStorage, limited.transactionId, "project", projectJson("archivo mayor")),
      ).rejects.toThrow(/límite/i);
      await limitedStorage.abort(limited.transactionId);

      const interrupted = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-06T12:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, interrupted.transactionId, "project", projectJson("v2"));
      failingStage = "before-manifest";
      await expect(storage.commit(interrupted.transactionId)).rejects.toThrow(/simulado/i);
      const listing = await storage.list();
      expect(listing.projects[0]).toMatchObject({ version: 1, siteVersion: 1 });
      expect((await storage.readCurrent(projectId)).manifest.current.version).toBe(1);
      await storage.abort(interrupted.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza un mapa de sitio con demasiados archivos", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-files-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root, maxFiles: 2 });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      await upload(
        storage,
        transaction.transactionId,
        "site",
        siteMap([
          { path: "index.html", encoding: "utf8", data: "<main>a</main>" },
          { path: "catalog-index.json", encoding: "utf8", data: "{}" },
          { path: "search-index.json", encoding: "utf8", data: "{}" },
        ]),
      );
      await expect(storage.commit(transaction.transactionId)).rejects.toThrow(/archivos/i);
      expect((await storage.list()).projects).toHaveLength(0);
      await storage.abort(transaction.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza un archivo individual del sitio demasiado grande", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-file-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root, maxFileBytes: 4 * 1024 });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      await upload(
        storage,
        transaction.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "x".repeat(8 * 1024) }]),
      );
      await expect(storage.commit(transaction.transactionId)).rejects.toThrow(/límite/i);
      expect((await storage.list()).projects).toHaveLength(0);
      await storage.abort(transaction.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("sigue funcionando cuando la migración falla al escribir su marca", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-migration-"));
    try {
      await mkdir(join(root, ".solara-runtime", "migration.json"), { recursive: true });
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const listing = await storage.list();
      expect(listing.projects).toEqual([]);
      expect(listing.recovery).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza un mapa de sitio con datos no textuales", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-data-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      await upload(
        storage,
        transaction.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: 123 }]),
      );
      await expect(storage.commit(transaction.transactionId)).rejects.toThrow(/inválidas/i);
      expect((await storage.list()).projects).toHaveLength(0);
      await storage.abort(transaction.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rechaza un mapa de sitio con rutas duplicadas", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-dupes-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      await upload(
        storage,
        transaction.transactionId,
        "site",
        siteMap([
          { path: "index.html", encoding: "utf8", data: "<main>a</main>" },
          { path: "index.html", encoding: "utf8", data: "<main>b</main>" },
        ]),
      );
      await expect(storage.commit(transaction.transactionId)).rejects.toThrow(/duplicadas/i);
      expect((await storage.list()).projects).toHaveLength(0);
      await storage.abort(transaction.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("simula disco lleno al escribir el manifest sin reemplazar la versión anterior", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-enospc-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      let failingOp = "";
      const guarded = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (op === failingOp) {
            const error = new Error(`escritura rechazada: ${op}`);
            error.code = "ENOSPC";
            throw error;
          }
        },
      });
      const attempt = await guarded.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(guarded, attempt.transactionId, "project", projectJson("v2"));
      failingOp = "write-manifest";
      await expect(guarded.commit(attempt.transactionId)).rejects.toThrow(/escritura rechazada/i);
      const listing = await storage.list();
      expect(listing.projects[0]).toMatchObject({ version: 1, siteVersion: 1 });
      expect((await storage.readCurrent(projectId)).manifest.current.version).toBe(1);
      await guarded.abort(attempt.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("simula permisos revocados al escribir el sitio sin dejar carpetas huérfanas", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-eacces-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      let failingOp = "";
      const guarded = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (op === failingOp) {
            const error = new Error(`escritura rechazada: ${op}`);
            error.code = "EACCES";
            throw error;
          }
        },
      });
      const attempt = await guarded.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(guarded, attempt.transactionId, "project", projectJson("v2"));
      await upload(
        guarded,
        attempt.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      failingOp = "write-site-files";
      await expect(guarded.commit(attempt.transactionId)).rejects.toThrow(/escritura rechazada/i);
      const sitesRoot = join(
        root,
        "proyectos",
        (await storage.list()).projects[0].folder,
        "sitios",
      );
      const siteDirs = (await readdir(sitesRoot)).filter((name) => !name.startsWith("."));
      expect(siteDirs).toHaveLength(1);
      expect(siteDirs[0]).toBe(firstReceipt.key);
      await guarded.abort(attempt.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("permite reintentar después de un fallo transitorio de escritura", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-retry-"));
    try {
      let failingOp = "";
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (op === failingOp) throw new Error(`escritura rechazada: ${op}`);
        },
      });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      failingOp = "rename-site";
      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, attempt.transactionId, "project", projectJson("v2"));
      await upload(
        storage,
        attempt.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      await expect(storage.commit(attempt.transactionId)).rejects.toThrow(/escritura rechazada/i);
      await storage.abort(attempt.transactionId);

      failingOp = "";
      const retry = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, retry.transactionId, "project", projectJson("v2"));
      await upload(
        storage,
        retry.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      const receipt = await storage.commit(retry.transactionId);
      expect(receipt).toMatchObject({ version: 2, status: "synced" });
      expect(receipt.site?.version).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reintenta el rename del sitio ante un lock transitorio (EPERM)", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-eperm-"));
    try {
      let siteRenameFailures = 0;
      let armFailures = false;
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        renameOverride: (source, destination) => {
          if (
            armFailures &&
            String(destination).includes(`${sep}sitios${sep}`) &&
            siteRenameFailures < 2
          ) {
            siteRenameFailures += 1;
            const error = new Error("lock transitorio del sistema");
            error.code = "EPERM";
            return Promise.reject(error);
          }
          return rename(source, destination);
        },
      });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);
      expect(siteRenameFailures).toBe(0);
      armFailures = true;

      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, attempt.transactionId, "project", projectJson("v2"));
      await upload(
        storage,
        attempt.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      const receipt = await storage.commit(attempt.transactionId);
      expect(siteRenameFailures).toBe(2);
      expect(receipt).toMatchObject({ version: 2, status: "synced" });
      expect(receipt.site?.version).toBe(2);
      const siteDir = join(root, receipt.site.directoryPath);
      expect(await readFile(join(siteDir, "index.html"), "utf8")).toBe("<main>v2</main>");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reemplaza el destino stale del sitio de un intento interrumpido", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-stale-"));
    const frozen = () => new Date("2026-08-07T10:00:00.000Z");
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root, now: frozen });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      // La clave v2 es determinista con el reloj congelado; se planta un
      // destino stale con esa clave para simular un intento interrumpido.
      const sitesRoot = dirname(join(root, firstReceipt.site.directoryPath));
      const v2Key = "prueba-2026-08-07T10-00-00-000Z-v000002";
      const v2SiteDir = join(sitesRoot, v2Key);
      await mkdir(v2SiteDir, { recursive: true });
      await writeFile(join(v2SiteDir, "basura.tmp"), "residuo de un intento cortado", "utf8");

      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, attempt.transactionId, "project", projectJson("v2"));
      await upload(
        storage,
        attempt.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      const receipt = await storage.commit(attempt.transactionId);
      expect(receipt).toMatchObject({ version: 2, status: "synced" });
      expect(receipt.site.key).toBe(v2Key);
      expect(await readFile(join(v2SiteDir, "index.html"), "utf8")).toBe("<main>v2</main>");
      expect(await readdir(v2SiteDir)).toEqual(["index.html"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persiste el diagnóstico de recovery entre listados", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-recovery-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      await storage.ensureRoots();
      const brokenRoot = join(root, "proyectos", "tienda-rota");
      await mkdir(brokenRoot, { recursive: true });
      await writeFile(join(brokenRoot, "manifest.json"), "{ esto no es json", "utf8");

      const first = await storage.list();
      expect(first.recovery).toHaveLength(1);
      expect(first.recovery[0].message.length).toBeGreaterThan(0);
      const second = await storage.list();
      expect(second.recovery[0].message).toBe(first.recovery[0].message);

      const sidecar = join(brokenRoot, "recovery.json");
      expect(JSON.parse(await readFile(sidecar, "utf8")).format).toBe("solara-local-recovery");

      await rm(join(brokenRoot, "manifest.json"), { force: true });
      await rm(sidecar, { force: true });
      expect((await storage.list()).recovery).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("descarta la carpeta con sidecar huérfano y sin manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-orphan-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      await storage.ensureRoots();
      const orphanRoot = join(root, "proyectos", "tienda-huerfana");
      await mkdir(orphanRoot, { recursive: true });
      const sidecar = join(orphanRoot, "recovery.json");
      await writeFile(
        sidecar,
        JSON.stringify({
          format: "solara-local-recovery",
          folder: "tienda-huerfana",
          message: "diagnóstico viejo de una tienda que ya no existe",
          detectedAt: "2026-01-01T00:00:00.000Z",
        }),
        "utf8",
      );

      const listing = await storage.list();
      expect(listing.recovery).toHaveLength(0);
      await expect(readFile(sidecar, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reporta en recovery un junction/symlink dentro de proyectos/", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-junction-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const outside = join(root, "fuera-de-proyectos");
      await mkdir(outside, { recursive: true });
      const projectsRoot = join(root, "proyectos");
      await mkdir(projectsRoot, { recursive: true });
      await symlink(
        outside,
        join(projectsRoot, "tienda-enlazada"),
        process.platform === "win32" ? "junction" : "dir",
      );

      const listing = await storage.list();
      const report = listing.recovery.find((r) => r.folder === "tienda-enlazada");
      expect(report).toMatchObject({
        folder: "tienda-enlazada",
        message: expect.stringMatching(/enlace simbólico|junction/i),
      });
      expect(listing.projects.some((p) => p.folder === "tienda-enlazada")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no deja un respaldo huérfano en actual/ si falla el manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-orphan-"));
    try {
      let fail = false;
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (fail && op === "write-manifest") {
            const error = new Error("escritura rechazada: write-manifest");
            error.code = "ENOSPC";
            throw error;
          }
        },
      });
      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, attempt.transactionId, "project", projectJson());
      fail = true;
      await expect(storage.commit(attempt.transactionId)).rejects.toThrow(/escritura rechazada/i);

      const projectsRoot = join(root, "proyectos");
      const [folder] = (await readdir(projectsRoot)).filter((name) => name.startsWith("prueba-"));
      expect(folder).toMatch(/^prueba-/);
      const orphans = await readdir(join(projectsRoot, folder, "actual"));
      expect(orphans.filter((name) => name.endsWith(".solara.json"))).toEqual([]);
      await storage.abort(attempt.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no deja un lock eterno si falla el marcador de la transacción", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-marker-"));
    try {
      let failMarker = true;
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (failMarker && op === "write-transaction-marker") {
            const error = new Error("escritura rechazada: write-transaction-marker");
            error.code = "ENOSPC";
            throw error;
          }
        },
      });
      await expect(
        storage.beginSave({
          projectId,
          name: "Prueba",
          slug: "prueba",
          projectUpdatedAt: "2026-08-07T10:00:00.000Z",
          expectedVersion: null,
        }),
      ).rejects.toThrow(/escritura rechazada/i);
      failMarker = false;
      const retry = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await storage.abort(retry.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no hace fatal un fallo al borrar el respaldo anterior y libera el lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-oldcurrent-"));
    try {
      let failingOp = "";
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (op === failingOp) {
            const error = new Error(`escritura rechazada: ${op}`);
            error.code = "EACCES";
            throw error;
          }
        },
      });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      failingOp = "remove-old-current";
      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, attempt.transactionId, "project", projectJson("v2"));
      await upload(
        storage,
        attempt.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      const receipt = await storage.commit(attempt.transactionId);
      expect(receipt).toMatchObject({ version: 2, status: "synced" });

      const next = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T12:00:00.000Z",
        expectedVersion: receipt.version,
      });
      await storage.abort(next.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("conserva como máximo cinco respaldos automáticos y elimina los más antiguos", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-backup-retention-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const receipts = [];
      for (const index of Array.from({ length: 7 }, (_, value) => value)) {
        const transaction = await storage.beginSave({
          projectId,
          name: `Prueba ${index}`,
          slug: "prueba",
          projectUpdatedAt: `2026-08-07T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
          expectedVersion: index === 0 ? null : index,
        });
        await upload(storage, transaction.transactionId, "project", projectJson(`Prueba ${index}`));
        receipts.push(await storage.commit(transaction.transactionId));
      }

      const folder = (await storage.list()).projects[0].folder;
      const backupRoot = join(root, "proyectos", folder, "respaldos");
      const backups = (await readdir(backupRoot)).sort();
      expect(backups).toHaveLength(5);
      expect(backups).toEqual(
        receipts
          .slice(1, 6)
          .map((receipt) => `${receipt.key}.solara.json`)
          .sort(),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("poda el histórico existente al iniciar el almacenamiento administrado", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-backup-startup-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      await storage.commit(transaction.transactionId);

      const folder = (await storage.list()).projects[0].folder;
      const backupRoot = join(root, "proyectos", folder, "respaldos");
      await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          writeFile(
            join(
              backupRoot,
              `prueba-2026-08-07T${String(index).padStart(2, "0")}-00-00-000Z-v${String(index + 2).padStart(6, "0")}.solara.json`,
            ),
            "histórico",
            "utf8",
          ),
        ),
      );

      await storage.cleanupAutomaticBackups();
      const backups = (await readdir(backupRoot)).sort();
      expect(backups).toHaveLength(5);
      expect(backups.at(0)).toContain("v000005");
      expect(backups.at(-1)).toContain("v000009");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("poda los sitios antiguos y conserva sólo el vigente tras un commit exitoso", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-prune-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const timestamps = ["T10:00:00.000Z", "T11:00:00.000Z", "T12:00:00.000Z"];
      const saves = [];
      for (const index of [0, 1, 2]) {
        const withSite = index < 2;
        const transaction = await storage.beginSave({
          projectId,
          name: `Prueba ${index}`,
          slug: "prueba",
          projectUpdatedAt: `2026-08-07${timestamps[index]}`,
          expectedVersion: index === 0 ? null : index,
        });
        await upload(storage, transaction.transactionId, "project", projectJson(`Prueba ${index}`));
        if (withSite) {
          await upload(
            storage,
            transaction.transactionId,
            "site",
            siteMap([{ path: "index.html", encoding: "utf8", data: `<main>v${index}</main>` }]),
          );
        }
        saves.push(await storage.commit(transaction.transactionId));
      }
      const folder = (await storage.list()).projects[0].folder;
      const sitesRoot = join(root, "proyectos", folder, "sitios");
      const siteDirs = (await readdir(sitesRoot)).filter((name) => !name.startsWith("."));
      expect(saves[2].site?.key).toBe(saves[1].key);
      expect(siteDirs).toEqual([saves[1].key]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no deja huérfanos en sitios/ ni en actual/ si falla tras renombrar el sitio", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-postrename-"));
    try {
      let failingStage = "";
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        faultInjector: async (stage) => {
          if (stage === failingStage) throw new Error(`fallo simulado: ${stage}`);
        },
      });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      const firstReceipt = await storage.commit(first.transactionId);

      failingStage = "after-site-rename";
      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: firstReceipt.version,
      });
      await upload(storage, attempt.transactionId, "project", projectJson("v2"));
      await upload(
        storage,
        attempt.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
      );
      await expect(storage.commit(attempt.transactionId)).rejects.toThrow(/simulado/i);

      const storeRoot = join(root, "proyectos", (await storage.list()).projects[0].folder);
      const siteDirs = (await readdir(join(storeRoot, "sitios"))).filter(
        (name) => !name.startsWith("."),
      );
      expect(siteDirs).toEqual([firstReceipt.key]);
      const archives = (await readdir(join(storeRoot, "actual"))).filter((name) =>
        name.endsWith(".solara.json"),
      );
      expect(archives).toEqual([`${firstReceipt.key}.solara.json`]);
      await storage.abort(attempt.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("libera el lock y el staging si el commit falla antes del manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-copyarchive-"));
    try {
      let failingOp = "";
      const storage = createLocalProjectStorage({
        applicationRoot: root,
        writeGuard: async ({ op }) => {
          if (op === failingOp) throw new Error(`escritura rechazada: ${op}`);
        },
      });
      const attempt = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, attempt.transactionId, "project", projectJson());
      failingOp = "copy-archive";
      await expect(storage.commit(attempt.transactionId)).rejects.toThrow(/escritura rechazada/i);

      // El lock no queda retenido: un segundo guardado de la misma tienda
      // puede empezar sin conflicto de versión.
      failingOp = "";
      const retry = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, retry.transactionId, "project", projectJson());
      const receipt = await storage.commit(retry.transactionId);
      expect(receipt.version).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("barre los temporales viejos de sitios/ y actual/ al commitear", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-tmpsweep-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      await upload(
        storage,
        first.transactionId,
        "site",
        siteMap([{ path: "index.html", encoding: "utf8", data: "<main>v1</main>" }]),
      );
      await storage.commit(first.transactionId);
      const folder = (await storage.list()).projects[0].folder;
      const sitesRoot = join(root, "proyectos", folder, "sitios");
      const actualRoot = join(root, "proyectos", folder, "actual");

      // Restos de un commit interrumpido de hace más de un día.
      const staleSite = join(sitesRoot, `.stale-${Date.now()}.tmp`);
      await mkdir(staleSite, { recursive: true });
      await writeFile(join(staleSite, "index.html"), "x", "utf8");
      const staleArchive = join(actualRoot, ".stale.solara.json.tmp");
      await writeFile(staleArchive, "{}", "utf8");
      const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await utimes(staleSite, old, old);
      await utimes(staleArchive, old, old);

      const second = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: 1,
      });
      await upload(storage, second.transactionId, "project", projectJson("v2"));
      await storage.commit(second.transactionId);

      await expect(readFile(staleSite)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(staleArchive)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("expira las transacciones de clientes muertos y libera sus locks", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-ttl-"));
    try {
      let clock = new Date("2026-08-07T10:00:00.000Z");
      const storage = createLocalProjectStorage({ applicationRoot: root, now: () => clock });

      // Un lock retenido por una transacción vencida no bloquea un nuevo
      // guardado: beginSave barre las transacciones stale.
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      clock = new Date("2026-08-07T10:45:00.000Z");
      const second = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:45:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, second.transactionId, "project", projectJson());
      const receipt = await storage.commit(second.transactionId);
      expect(receipt.version).toBe(1);

      // Una transacción vencida no puede commitear y libera el lock.
      const third = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:46:00.000Z",
        expectedVersion: 1,
      });
      await upload(storage, third.transactionId, "project", projectJson("v2"));
      clock = new Date("2026-08-07T11:20:00.000Z");
      await expect(storage.commit(third.transactionId)).rejects.toThrow(/expir/i);

      const retry = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:20:00.000Z",
        expectedVersion: 1,
      });
      await storage.abort(retry.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reporta en recovery una tienda cuyo respaldo actual no coincide con su hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-hash-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const transaction = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, transaction.transactionId, "project", projectJson());
      const receipt = await storage.commit(transaction.transactionId);

      const folder = (await storage.list()).projects[0].folder;
      const currentPath = join(root, "proyectos", folder, "actual", `${receipt.key}.solara.json`);
      await writeFile(currentPath, projectJson("Modificada"), "utf8");

      const listing = await storage.list();
      expect(listing.projects).toHaveLength(0);
      expect(listing.recovery).toHaveLength(1);
      expect(listing.recovery[0].message).toMatch(/no coincide con su hash/i);
      expect(listing.recovery[0].projectId).toBe(projectId);
      expect(listing.recovery[0].version).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("permite importar un respaldo validado sobre una tienda con hash roto", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-storage-recover-hash-"));
    try {
      const storage = createLocalProjectStorage({ applicationRoot: root });
      const first = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      await upload(storage, first.transactionId, "project", projectJson());
      const firstReceipt = await storage.commit(first.transactionId);

      const folder = (await storage.list()).projects[0].folder;
      const currentPath = join(
        root,
        "proyectos",
        folder,
        "actual",
        `${firstReceipt.key}.solara.json`,
      );
      await writeFile(currentPath, projectJson("Modificada"), "utf8");
      const recovery = (await storage.list()).recovery[0];

      const repaired = await storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T11:00:00.000Z",
        expectedVersion: recovery.version,
      });
      await upload(storage, repaired.transactionId, "project", projectJson("Recuperada"));
      const repairedReceipt = await storage.commit(repaired.transactionId);

      expect(repairedReceipt.version).toBe(2);
      const listing = await storage.list();
      expect(listing.recovery).toHaveLength(0);
      expect(listing.projects).toHaveLength(1);
      expect((await storage.readCurrent(projectId)).manifest.current.version).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
