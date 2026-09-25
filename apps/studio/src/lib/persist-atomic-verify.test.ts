import "fake-indexeddb/auto";
import { StoreProjectV1Schema } from "@solara/project-schema";
import { buildCatalogModernProject } from "@solara/project-schema/catalog-modern-template";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock workers para no depender de Worker real en Vitest (jsdom)
vi.mock("./workers", async () => {
  const actual = await vi.importActual<typeof import("./workers")>("./workers");
  return {
    ...actual,
    createProjectArchiveInWorker: vi.fn(async (project: any) =>
      new TextEncoder().encode(JSON.stringify(project)),
    ),
    readProjectArchiveBytesInWorker: vi.fn(async (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes);
      return JSON.parse(text);
    }),
    readProjectArchiveOwnedBytesInWorker: vi.fn(async (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes);
      return JSON.parse(text);
    }),
    readProjectArchiveInWorker: vi.fn(async (file: File) => {
      const text = await file.text();
      return JSON.parse(text);
    }),
    exportSiteInWorker: vi.fn(async () => {
      throw new Error("site fail");
    }),
  };
});

// Mock saveLocalProject para no tocar disco real
vi.mock("./localStorage", async () => {
  const actual = await vi.importActual<typeof import("./localStorage")>("./localStorage");
  return {
    ...actual,
    saveLocalProject: vi.fn(async () => ({ version: 2 })),
  };
});

// Verifica invariante: fallo despues de escribir backup pero antes de production no debe perder proyecto editable
describe("persistencia - atomicidad backup vs site", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("INV: si exportSite falla, el backup editable sigue valido", async () => {
    const base = buildCatalogModernProject({
      seed: "clean",
      id: "persist-atomic",
      name: "Test",
      slug: "test",
    });
    const project = StoreProjectV1Schema.parse(base);
    const { persistProjectToDisk } = await import("./localProjectRepository");
    const { saveLocalProject } = await import("./localStorage");
    const result = await persistProjectToDisk(project, 1);
    expect(result.siteError).toBe("site fail");
    expect(saveLocalProject).toHaveBeenCalledTimes(1);
    // Debe haber guardado el proyecto aunque el site falló: metadata con expectedVersion 1
    const callArgs = (saveLocalProject as any).mock.calls[0];
    expect(callArgs).toHaveLength(3);
    const metadata = callArgs[0];
    expect(metadata.expectedVersion).toBe(1);
    expect(metadata.projectId).toBe("persist-atomic");
    expect(callArgs[1]).toBeInstanceOf(Uint8Array);
    expect(callArgs[2]).toBeUndefined();
  });
  it("INV: backup se verifica antes de guardar (projectId coincide)", async () => {
    const base = buildCatalogModernProject({
      seed: "clean",
      id: "persist-atomic-2",
      name: "Test2",
      slug: "test2",
    });
    const project = StoreProjectV1Schema.parse(base);
    const workers = await import("./workers");
    // Fuerza createProjectArchive a devolver proyecto con id distinto para probar verificación
    (workers.createProjectArchiveInWorker as any).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify({ ...project, id: "otro-id" })),
    );
    const { persistProjectToDisk } = await import("./localProjectRepository");
    await expect(persistProjectToDisk(project, 1)).rejects.toThrow(/no coincide/);
  });
});
