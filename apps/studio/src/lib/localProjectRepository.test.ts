import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { buildModernBaseTemplateProject } from "@solara/project-schema/catalog-modern-template";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLoadedProject } from "./localProjectRepository";

const createProjectArchiveInWorker = vi.fn(async (project: unknown) =>
  new TextEncoder().encode(
    JSON.stringify({
      projectId: (project as { id: string }).id,
      id: (project as { id: string }).id,
      project,
    }),
  ),
);
const readProjectArchiveBytesInWorker = vi.fn(async (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes)),
);
const exportSiteInWorker = vi.fn(async () => ({
  files: new Map<string, string | Uint8Array>([["index.html", "<html></html>"]]),
}));
const saveLocalProject = vi.fn(async () => ({
  projectId: "x",
  version: 2,
  status: "synced" as const,
  folder: "f",
  key: "k",
  projectPath: "p",
  site: null,
}));
const createLocalManualBackup = vi.fn(async () => ({
  path: "proyectos/base/backup.solara.json",
  version: 1,
}));

vi.mock("./workers", () => ({
  createProjectArchiveInWorker: (...args: unknown[]) => createProjectArchiveInWorker(...args),
  readProjectArchiveBytesInWorker: (...args: unknown[]) => readProjectArchiveBytesInWorker(...args),
  exportSiteInWorker: (...args: unknown[]) => exportSiteInWorker(...args),
}));

vi.mock("./localStorage", () => ({
  listLocalProjects: vi.fn(),
  readLocalProject: vi.fn(),
  saveLocalProject: (...args: unknown[]) => saveLocalProject(...args),
  createLocalManualBackup: (...args: unknown[]) => createLocalManualBackup(...args),
}));

vi.mock("./repository", () => ({
  optimizeProjectAssets: vi.fn(async (project: unknown) => project),
  repairProjectMediaMetadata: vi.fn((project: unknown) => project),
  saveProject: vi.fn(),
}));

describe("carga de proyectos administrados", () => {
  it("restaura las secciones de Contacto de Home al abrir un respaldo incompleto", () => {
    const stored = structuredClone(catalogModernV2Store);
    stored.sections = stored.sections.filter(
      (section) => !["contact-form", "contact-channels"].includes(section.moduleId),
    );

    const loaded = normalizeLoadedProject(stored);

    expect(loaded.pages).toHaveLength(1);
    expect(loaded.pages[0]?.kind).toBe("home");
    expect(loaded.sections.map((section) => section.moduleId)).toContain("contact-form");
    expect(loaded.sections.map((section) => section.moduleId)).toContain("contact-channels");
    expect(loaded.sections).toHaveLength(stored.sections.length + 2);
  });
});

describe("persistProjectToDisk", () => {
  afterEach(() => {
    exportSiteInWorker.mockClear();
    saveLocalProject.mockClear();
  });

  it("no genera la bóveda de recuperación durante el guardado administrado", async () => {
    const { persistProjectToDisk } = await import("./localProjectRepository");
    const project = {
      ...structuredClone(catalogModernV2Store),
      id: "store-save-without-recovery",
      slug: "save-without-recovery",
    };

    exportSiteInWorker.mockClear();
    await persistProjectToDisk(project, 1);

    expect(exportSiteInWorker).toHaveBeenCalledTimes(1);
    expect(exportSiteInWorker.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("no re-exporta el sitio cuando el proyecto ya está sincronizado", async () => {
    const { persistProjectToDisk } = await import("./localProjectRepository");
    const project = structuredClone(catalogModernV2Store);

    const first = await persistProjectToDisk(project, 1);
    expect(first.siteError).toBeUndefined();
    expect(exportSiteInWorker).toHaveBeenCalledTimes(1);
    expect(saveLocalProject.mock.calls[0]?.[2]).toEqual(expect.any(String));

    saveLocalProject.mockClear();
    const second = await persistProjectToDisk(project, 2);
    expect(exportSiteInWorker).toHaveBeenCalledTimes(1);
    expect(saveLocalProject).toHaveBeenCalledTimes(1);
    expect(saveLocalProject.mock.calls[0]?.[2]).toBeUndefined();
    expect(second.siteError).toBeUndefined();
  });

  it("re-exporta el sitio cuando el contenido del proyecto cambió", async () => {
    const { persistProjectToDisk } = await import("./localProjectRepository");
    const project = structuredClone(catalogModernV2Store);

    await persistProjectToDisk(project, 1);
    saveLocalProject.mockClear();
    exportSiteInWorker.mockClear();

    const edited = { ...project, name: "Otro nombre" };
    await persistProjectToDisk(edited, 2);

    expect(exportSiteInWorker).toHaveBeenCalledTimes(1);
    expect(saveLocalProject.mock.calls[0]?.[2]).toEqual(expect.any(String));
  });

  it("cancela una migración protegida si la exportación de producción falla", async () => {
    const { persistProjectToDisk } = await import("./localProjectRepository");
    const project = buildModernBaseTemplateProject({ id: "store-site-failure", slug: "site-failure" });
    exportSiteInWorker.mockRejectedValueOnce(new Error("site fail"));

    await expect(
      persistProjectToDisk(project, 1, { allowProtectedWrite: true, requireSite: true }),
    ).rejects.toThrow(/migración protegida se canceló.*site fail/);
    expect(saveLocalProject).not.toHaveBeenCalled();
  });
});
