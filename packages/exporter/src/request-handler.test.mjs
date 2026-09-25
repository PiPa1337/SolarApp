import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createSolaraRequestHandler,
  openFolderInExplorerOnWindows,
} from "../scripts/solara-request-handler.mjs";

vi.mock("node:fs", async (importActual) => {
  const actual = await importActual();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});

const projectId = "store-open-folder";
const shutdownCookieName = "solara_shutdown";

function projectJson(id = projectId, name = "Prueba") {
  return JSON.stringify({
    format: "solara-project",
    version: 2,
    projectId: id,
    exportedAt: "2026-08-07T10:00:00.000Z",
    project: { schemaVersion: 2, id, name, slug: name.toLowerCase().replaceAll(" ", "-") },
  });
}

function request(method, pathname, headers = {}, body) {
  return {
    method,
    pathname,
    headers,
    body,
    ...(body
      ? {
          [Symbol.asyncIterator]: () => Readable.from([Buffer.from(body)])[Symbol.asyncIterator](),
        }
      : {}),
  };
}

async function createProject(handler) {
  const storage = handler.storage;
  const transaction = await storage.beginSave({
    projectId,
    name: "Prueba",
    slug: "prueba",
    projectUpdatedAt: "2026-08-07T10:00:00.000Z",
    expectedVersion: null,
  });
  await storage.upload(
    transaction.transactionId,
    "project",
    Readable.from([Buffer.from(projectJson())]),
  );
  return storage.commit(transaction.transactionId);
}

async function createStoredProject(handler, id) {
  const storage = handler.storage;
  const transaction = await storage.beginSave({
    projectId: id,
    name: id,
    slug: id,
    projectUpdatedAt: "2026-08-07T10:00:00.000Z",
    expectedVersion: null,
  });
  await storage.upload(
    transaction.transactionId,
    "project",
    Readable.from([Buffer.from(projectJson(id, id))]),
  );
  return storage.commit(transaction.transactionId);
}

describe("handler: retiro de referencias legacy", () => {
  it("retira sólo los dos IDs V1 reservados y conserva tiendas del usuario", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-retire-demo-"));
    try {
      const handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      await createStoredProject(handler, "store-modo-sur");
      await createStoredProject(handler, "store-modo-sur-demo-v1");
      await createStoredProject(handler, "store-de-usuario");

      const response = await handler.handle(
        request("POST", "/__solara/storage/migrations/retire-legacy-demo", {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body).removedProjectIds).toEqual([
        "store-modo-sur",
        "store-modo-sur-demo-v1",
      ]);
      await expect(handler.storage.readCurrent("store-modo-sur")).resolves.toBeUndefined();
      await expect(handler.storage.readCurrent("store-modo-sur-demo-v1")).resolves.toBeUndefined();
      await expect(handler.storage.readCurrent("store-de-usuario")).resolves.toMatchObject({
        manifest: { slug: "store-de-usuario" },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});

describe("handler: abrir carpeta de una tienda", () => {
  it("confirma que Explorer arrancó antes de informar éxito", async () => {
    const unref = vi.fn();
    const child = {
      once: vi.fn((event, listener) => {
        if (event === "spawn") queueMicrotask(listener);
        return child;
      }),
      unref,
    };
    const spawnProcess = vi.fn(() => child);

    await expect(
      openFolderInExplorerOnWindows("C:\\sitios\\prueba", { platform: "win32", spawnProcess }),
    ).resolves.toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith("explorer", ["C:\\sitios\\prueba"], {
      detached: true,
      stdio: "ignore",
    });
    expect(unref).toHaveBeenCalledOnce();
  });

  it("abre la carpeta de una tienda existente con la cookie de sesión", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-folder-"));
    try {
      const openFolderInExplorer = vi.fn(() => true);
      const handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        openFolderInExplorer,
        onShutdown: () => {},
      });
      await createProject(handler);
      const response = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-folder`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(response.status).toBe(200);
      expect(openFolderInExplorer).toHaveBeenCalledOnce();
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(body.folder).toMatch(/^prueba--[a-f0-9]{8}$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("responde 404 para tiendas inexistentes y 403 sin sesión", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-folder-"));
    try {
      const handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        openFolderInExplorer: vi.fn(() => true),
        onShutdown: () => {},
      });
      const missing = await handler.handle(
        request("POST", "/__solara/storage/projects/tienda-ausente/open-folder", {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(missing.status).toBe(404);
      const unauthorized = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-folder`),
      );
      expect(unauthorized.status).toBe(403);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("responde error si Windows no puede iniciar Explorer", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-folder-"));
    try {
      const openFolderInExplorer = vi.fn(() => false);
      const handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        openFolderInExplorer,
        onShutdown: () => {},
      });
      await createProject(handler);
      const response = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-folder`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(response.status).toBe(500);
      expect(JSON.parse(response.body)).toEqual({
        ok: false,
        error: "Windows no pudo abrir la carpeta de la tienda.",
      });
      expect(openFolderInExplorer).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handler: eliminar una tienda", () => {
  it("borra la tienda persistida y requiere la sesión local", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-delete-"));
    let handler;
    try {
      handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      const id = "store-delete-test";
      await createStoredProject(handler, id);

      const response = await handler.handle(
        request("DELETE", `/__solara/storage/projects/${id}`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ ok: true });
      await expect(handler.storage.readCurrent(id)).resolves.toBeUndefined();

      const unauthorized = await handler.handle(
        request("DELETE", `/__solara/storage/projects/${id}`),
      );
      expect(unauthorized.status).toBe(403);
    } finally {
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("anuncia DELETE en rutas de almacenamiento no permitidas", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-delete-allow-"));
    let handler;
    try {
      handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      const response = await handler.handle(
        request("PATCH", "/__solara/storage/projects/store-delete-test", {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.Allow).toContain("DELETE");
    } finally {
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handler: transacción de guardado (begin-save/upload)", () => {
  it("comienza una transacción con un slug largo válido del schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-longslug-"));
    try {
      const handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      const longSlug = `${"a-".repeat(59)}b`;
      const response = await handler.handle(
        request(
          "POST",
          "/__solara/storage/saves",
          {
            cookie: `${shutdownCookieName}=token-test`,
            "Content-Type": "application/json",
          },
          JSON.stringify({
            projectId: "store-slug-largo",
            name: "Prueba",
            slug: longSlug,
            projectUpdatedAt: "2026-08-07T10:00:00.000Z",
            expectedVersion: null,
          }),
        ),
      );
      expect(response.status).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      expect(typeof body.transactionId).toBe("string");
      await handler.storage.abort(body.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("verifica el hash del upload aunque el header llegue con mayúsculas", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-hashcase-"));
    try {
      const handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      const transaction = await handler.storage.beginSave({
        projectId: "store-hash-case",
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T10:00:00.000Z",
        expectedVersion: null,
      });
      const payload = Buffer.from(projectJson());
      const path = `/__solara/storage/saves/${transaction.transactionId}/project`;
      // El cliente envía `X-Solara-SHA256`; la verificación no puede depender
      // de que el transporte normalice el nombre del header a minúsculas.
      const wrong = await handler.handle(
        request(
          "PUT",
          path,
          {
            cookie: `${shutdownCookieName}=token-test`,
            "X-Solara-SHA256": "0".repeat(64),
            "Content-Type": "application/vnd.solara.project+json",
          },
          payload,
        ),
      );
      expect(wrong.status).toBe(400);
      expect(JSON.parse(wrong.body).error).toMatch(/hash/i);
      const correct = await handler.handle(
        request(
          "PUT",
          path,
          {
            cookie: `${shutdownCookieName}=token-test`,
            "X-Solara-SHA256": createHash("sha256").update(payload).digest("hex"),
            "Content-Type": "application/vnd.solara.project+json",
          },
          payload,
        ),
      );
      expect(correct.status).toBe(200);
      await handler.storage.abort(transaction.transactionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handler: abrir el sitio público", () => {
  async function saveWithSite(storage, version, content) {
    const transaction = await storage.beginSave({
      projectId,
      name: "Prueba",
      slug: "prueba",
      projectUpdatedAt: `2026-08-07T1${version}:00:00.000Z`,
      expectedVersion: version === 1 ? null : version - 1,
    });
    await storage.upload(
      transaction.transactionId,
      "project",
      Readable.from([Buffer.from(projectJson())]),
    );
    await storage.upload(
      transaction.transactionId,
      "site",
      Readable.from([
        Buffer.from(
          JSON.stringify([
            { path: "index.html", encoding: "utf8", data: `<main>${content}</main>` },
          ]),
        ),
      ]),
    );
    return storage.commit(transaction.transactionId);
  }

  it("renueva el servidor del sitio tras un guardado con sitio nuevo", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-site-"));
    let handler;
    try {
      handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      await saveWithSite(handler.storage, 1, "v1");
      const open1 = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-site`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(open1.status).toBe(200);
      const url1 = JSON.parse(open1.body).url;
      await expect((await fetch(`${url1}/index.html`)).text()).resolves.toContain("v1");

      await saveWithSite(handler.storage, 2, "v2");
      const open2 = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-site`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(open2.status).toBe(200);
      const url2 = JSON.parse(open2.body).url;
      await expect((await fetch(`${url2}/index.html`)).text()).resolves.toContain("v2");
    } finally {
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("conserva el sitio que un preview abierto sigue sirviendo tras un guardado", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-protected-"));
    let handler;
    try {
      handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      await saveWithSite(handler.storage, 1, "v1");
      const open1 = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-site`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(open1.status).toBe(200);
      const url1 = JSON.parse(open1.body).url;
      await expect((await fetch(`${url1}/index.html`)).text()).resolves.toContain("v1");

      // El guardado pasa por la ruta de commit del handler, que protege
      // las keys que los servidores cacheados siguen sirviendo.
      const transaction = await handler.storage.beginSave({
        projectId,
        name: "Prueba",
        slug: "prueba",
        projectUpdatedAt: "2026-08-07T12:00:00.000Z",
        expectedVersion: 1,
      });
      await handler.storage.upload(
        transaction.transactionId,
        "project",
        Readable.from([Buffer.from(projectJson())]),
      );
      await handler.storage.upload(
        transaction.transactionId,
        "site",
        Readable.from([
          Buffer.from(
            JSON.stringify([{ path: "index.html", encoding: "utf8", data: "<main>v2</main>" }]),
          ),
        ]),
      );
      const commitResponse = await handler.handle(
        request("POST", `/__solara/storage/saves/${transaction.transactionId}/commit`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(commitResponse.status).toBe(200);

      // El preview abierto sigue funcionando aunque la poda borró las
      // keys que ningún servidor cacheado protege.
      await expect((await fetch(`${url1}/index.html`)).text()).resolves.toContain("v1");

      // open-site de nuevo: cierra el server viejo y sirve la key nueva.
      const open2 = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-site`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(open2.status).toBe(200);
      const url2 = JSON.parse(open2.body).url;
      await expect((await fetch(`${url2}/index.html`)).text()).resolves.toContain("v2");
      await expect(fetch(`${url1}/index.html`)).rejects.toThrow();
    } finally {
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("no tumba el servidor si el archivo desaparece al servirlo", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-stream-"));
    let handler;
    try {
      handler = createSolaraRequestHandler({
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      await saveWithSite(handler.storage, 1, "v1");
      const open1 = await handler.handle(
        request("POST", `/__solara/storage/projects/${projectId}/open-site`, {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      const url1 = JSON.parse(open1.body).url;
      await expect((await fetch(`${url1}/index.html`)).text()).resolves.toContain("v1");

      // La próxima lectura falla como si el directorio hubiera sido
      // podado entre el stat y el stream: la respuesta puede ser 404 o
      // un socket cortado, pero nunca puede caer el servidor local.
      const broken = new Readable({ read() {} });
      vi.mocked(createReadStream).mockImplementationOnce(() => {
        queueMicrotask(() =>
          broken.emit("error", Object.assign(new Error("archivo borrado"), { code: "ENOENT" })),
        );
        return broken;
      });
      const outcome = await fetch(`${url1}/index.html`)
        .then((response) => response.status)
        .catch(() => 0);
      expect([0, 404, 500]).toContain(outcome);

      // El servidor local sigue respondiendo al almacenamiento.
      const status = await handler.handle(
        request("GET", "/__solara/storage/status", {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(status.status).toBe(200);
    } finally {
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handler: estado del QA perpetuo", () => {
  it("devuelve conteos reales de ciclos y ciclo activo", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-qa-"));
    let handler;
    try {
      const cyclesRoot = join(root, ".solara-runtime", "agent", "qa-cycles");
      await mkdir(cyclesRoot, { recursive: true });
      await writeFile(
        join(cyclesRoot, "qa-cycle-done.json"),
        JSON.stringify({
          cycleId: "qa-cycle-done",
          phase: "done",
          backlogItem: "P1",
          attempts: 1,
          startedAt: "2026-08-25T00:00:00.000Z",
          updatedAt: "2026-08-25T00:01:00.000Z",
        }),
        "utf8",
      );
      await writeFile(
        join(cyclesRoot, "qa-cycle-active.json"),
        JSON.stringify({
          cycleId: "qa-cycle-active",
          phase: "gates",
          backlogItem: "P2",
          attempts: 2,
          startedAt: "2026-08-25T00:02:00.000Z",
          updatedAt: "2026-08-25T00:03:00.000Z",
        }),
        "utf8",
      );
      await writeFile(
        join(cyclesRoot, "qa-cycle-blocked.json"),
        JSON.stringify({
          cycleId: "qa-cycle-blocked",
          phase: "blocked",
          backlogItem: "P3",
          attempts: 3,
          error: "x",
          startedAt: "2026-08-25T00:04:00.000Z",
          updatedAt: "2026-08-25T00:05:00.000Z",
        }),
        "utf8",
      );
      const handler = createSolaraRequestHandler({
        staticRoot: root,
        applicationRoot: root,
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      const response = await handler.handle(
        request("GET", "/__solara/storage/qa-status", {
          cookie: `${shutdownCookieName}=token-test`,
        }),
      );
      expect(response.status).toBe(200);
      const body = JSON.parse(Buffer.from(response.body).toString("utf8"));
      expect(body.ok).toBe(true);
      expect(body.completedCount).toBe(1);
      expect(body.blockedCount).toBe(1);
      expect(body.activeCycle).toMatchObject({ backlogItem: "P2", phase: "gates", attempts: 2 });
    } finally {
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handler: preferencias persistentes de Gargantua", () => {
  it("guarda y recupera los presets desde el runtime de la instalación", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-gravity-preferences-"));
    const auth = { cookie: `${shutdownCookieName}=token-test` };
    const preferences = {
      customPresets: [null, null, null],
      activeSettings: { filamentDetail: 2.75, taaQuality: "extreme" },
      activeCustomPreset: 0,
      selectedCustomPreset: 0,
    };
    let handler;
    let otherPortHandler;
    try {
      handler = createSolaraRequestHandler({
        applicationRoot: root,
        origin: "http://127.0.0.1:4174",
        shutdownToken: "token-test",
        onShutdown: () => {},
      });

      const unauthorized = await handler.handle(
        request("GET", "/__solara/storage/preferences/gravity"),
      );
      expect(unauthorized.status).toBe(403);

      const saved = await handler.handle(
        request(
          "PUT",
          "/__solara/storage/preferences/gravity",
          { ...auth, origin: "http://127.0.0.1:4174", "content-type": "application/json" },
          JSON.stringify(preferences),
        ),
      );
      expect(saved.status).toBe(200);
      await expect(
        readFile(join(root, ".solara-runtime", "gravity-preferences.json"), "utf8"),
      ).resolves.toContain('"taaQuality": "extreme"');

      otherPortHandler = createSolaraRequestHandler({
        applicationRoot: root,
        origin: "http://127.0.0.1:45123",
        shutdownToken: "token-test",
        onShutdown: () => {},
      });
      const loaded = await otherPortHandler.handle(
        request("GET", "/__solara/storage/preferences/gravity", {
          ...auth,
          origin: "http://127.0.0.1:45123",
        }),
      );
      expect(loaded.status).toBe(200);
      expect(JSON.parse(loaded.body).preferences).toEqual(preferences);
    } finally {
      await otherPortHandler?.close();
      await handler?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handler: página 404 personalizada del sitio estático", () => {
  it("sirve 404.html del sitio para rutas inexistentes como pagina/99", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-404-"));
    try {
      await writeFile(join(root, "index.html"), "<main>home</main>");
      await writeFile(join(root, "404.html"), "<main>no-encontrada</main>");
      const handler = createSolaraRequestHandler({
        staticRoot: root,
        applicationRoot: root,
        onShutdown: () => {},
      });
      const missing = await handler.handle(request("GET", "/categorias/x/pagina/99/"));
      expect(missing.status).toBe(404);
      expect(Buffer.from(missing.body).toString("utf8")).toContain("no-encontrada");
      expect(missing.headers["Content-Type"]).toContain("text/html");

      const queryPageOne = await handler.handle(request("GET", "/categorias/x/?pagina=1"));
      expect(queryPageOne.status).toBe(404);

      const home = await handler.handle(request("GET", "/"));
      expect(home.status).toBe(200);
      expect(Buffer.from(home.body).toString("utf8")).toContain("home");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("mantiene el 404 plano si el sitio no incluye 404.html", async () => {
    const root = await mkdtemp(join(tmpdir(), "solara-handler-404-"));
    try {
      await writeFile(join(root, "index.html"), "<main>home</main>");
      const handler = createSolaraRequestHandler({
        staticRoot: root,
        applicationRoot: root,
        onShutdown: () => {},
      });
      const missing = await handler.handle(request("GET", "/ruta-inexistente/"));
      expect(missing.status).toBe(404);
      expect(missing.headers["Content-Type"]).toContain("text/plain");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
