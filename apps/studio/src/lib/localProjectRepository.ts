/**
 * Orquestador de Guardar: valida y archiva el snapshot en Worker, intenta
 * exportar production y envía proyecto/sitio a una transacción local. Un fallo
 * del sitio no debe descartar el respaldo editable ni el último sitio válido.
 */
import type { StoreProjectV1 } from "@solara/project-schema";
import {
  ensureCatalogModernV2Sections,
  isModernBaseTemplateContent,
  replaceModernBaseTemplateContent,
} from "@solara/project-schema/catalog-modern-template";
import { isBaseTemplate } from "@solara/project-schema/project-policy";
import { assertProjectImagesOptimized } from "./imageAsset";
import {
  createLocalManualBackup,
  type LocalProjectSummary,
  type LocalSaveReceipt,
  listLocalProjects,
  readLocalProject,
  saveLocalProject,
} from "./localStorage";
import {
  optimizeProjectAssets,
  repairProjectMediaMetadata,
  type StoredProject,
  saveProject,
} from "./repository";
import {
  createProjectArchiveInWorker,
  exportSiteInWorker,
  readProjectArchiveBytesInWorker,
  readProjectArchiveOwnedBytesInWorker,
} from "./workers";

export interface DiskProject extends StoredProject {
  diskVersion: number;
  diskStatus: "synced" | "site-outdated";
  mediaRepairPending: boolean;
}

/**
 * El respaldo en disco puede provenir de una versión que todavía guardaba las
 * páginas secundarias V2 sin secciones. La UI necesita abrir el mismo contrato
 * normalizado que usa el repositorio IndexedDB y el exporter.
 */
export function normalizeLoadedProject(project: StoreProjectV1): StoreProjectV1 {
  return repairProjectMediaMetadata(ensureCatalogModernV2Sections(project));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.byteLength; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function serializeSiteFiles(files: ReadonlyMap<string, string | Uint8Array>): string {
  return JSON.stringify(
    [...files.entries()].map(([path, value]) =>
      typeof value === "string"
        ? { path, encoding: "utf8", data: value }
        : { path, encoding: "base64", data: bytesToBase64(value) },
    ),
  );
}

/**
 * Índice de sesión: sha256 del respaldo cuyo sitio quedó sincronizado en
 * disco. Guardar el mismo snapshot no debe re-exportar production: el sitio
 * vigente ya corresponde exactamente a esos bytes (el exporter es
 * determinista). Vive sólo en memoria; al reiniciar la app la primera
 * guarda vuelve a exportar.
 */
const siteSyncIndex = new Map<string, string>();

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadDiskProject(summary: LocalProjectSummary): Promise<DiskProject> {
  const archive = await readLocalProject(summary.projectId);
  const storedProject = await readProjectArchiveOwnedBytesInWorker(archive);
  const normalized = normalizeLoadedProject(storedProject);
  const project = await optimizeProjectAssets(normalized);
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    updatedAt: project.updatedAt,
    project,
    diskVersion: summary.version,
    diskSiteStatus: summary.siteOutdated ? "site-outdated" : "synced",
    diskStatus: summary.siteOutdated ? "site-outdated" : "synced",
    // Los normalizadores conservan la referencia cuando no cambian nada. Usar
    // esa señal evita serializar otra vez snapshots grandes sólo para decidir
    // si hay que ofrecer la reparación de metadatos.
    mediaRepairPending: project !== storedProject,
  };
}

export async function loadAllDiskProjects(): Promise<{
  projects: DiskProject[];
  recovery: Array<{
    id: string;
    name: string;
    updatedAt: string;
    message: string;
    projectId?: string;
    diskVersion?: number;
  }>;
}> {
  const listing = await listLocalProjects();
  const projects: DiskProject[] = [];
  const recovery = listing.recovery.map((item) => ({
    id: `disk:${item.folder}`,
    name: item.folder,
    updatedAt: "",
    message: item.message,
    ...(item.projectId ? { projectId: item.projectId } : {}),
    ...(Number.isInteger(item.version) ? { diskVersion: item.version } : {}),
  }));
  const loadedResults = await Promise.all(
    listing.projects.map(async (summary) => {
      try {
        const loaded = await loadDiskProject(summary);
        await saveProject(loaded.project, {
          allowProtectedWrite: isBaseTemplate(loaded.project),
        });
        return { ok: true as const, loaded };
      } catch (error) {
        return {
          ok: false as const,
          summary,
          message:
            error instanceof Error ? error.message : "No se pudo validar el respaldo en disco.",
        };
      }
    }),
  );
  for (const result of loadedResults) {
    if (result.ok) projects.push(result.loaded);
    else
      recovery.push({
        id: `disk:${result.summary.projectId}`,
        name: result.summary.name,
        updatedAt: result.summary.updatedAt,
        message: result.message,
      });
  }
  projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { projects, recovery };
}

/** Crea artefactos y delega el commit versionado al API loopback. */
export async function persistProjectToDisk(
  project: StoreProjectV1,
  expectedVersion: number | null,
  options: { allowProtectedWrite?: boolean; requireSite?: boolean } = {},
): Promise<{ receipt: LocalSaveReceipt; siteError?: string }> {
  const optimizedProject = await optimizeProjectAssets(project);
  assertProjectImagesOptimized(optimizedProject);
  const archiveBytes = await createProjectArchiveInWorker(optimizedProject);
  const archiveSha256 = await sha256Hex(archiveBytes);
  // El round-trip usa una copia interna del buffer: los bytes originales se
  // conservan intactos para subirlos al servidor tras la verificación.
  const verifiedProject = await readProjectArchiveBytesInWorker(archiveBytes);
  if (verifiedProject.id !== optimizedProject.id) {
    throw new Error("El respaldo generado no coincide con la tienda actual.");
  }
  const siteIsCurrent = siteSyncIndex.get(optimizedProject.id) === archiveSha256;
  let siteMap: string | undefined;
  let siteError: string | undefined;
  if (!siteIsCurrent) {
    try {
      const site = await exportSiteInWorker(optimizedProject, "production");
      siteMap = serializeSiteFiles(site.files);
    } catch (error) {
      siteError =
        error instanceof Error
          ? error.message
          : "La exportación de producción no pudo completarse.";
    }
  }
  if (siteError && options.requireSite) {
    throw new Error(`La migración protegida se canceló: ${siteError}`);
  }
  const receipt = await saveLocalProject(
    {
      projectId: optimizedProject.id,
      name: optimizedProject.name,
      slug: optimizedProject.slug,
      projectUpdatedAt: optimizedProject.updatedAt,
      expectedVersion,
      // El servidor exige el canal de upgrade explícito para tocar la plantilla
      // protegida; sin esta marca, beginSave rechaza con PROTECTED_STORE.
      ...(options.allowProtectedWrite
        ? { actor: { kind: "template-upgrade" as const }, allowProtectedWrite: true }
        : {}),
    },
    archiveBytes,
    siteMap,
  );
  if (!siteError) {
    if (receipt.status === "synced") siteSyncIndex.set(optimizedProject.id, archiveSha256);
    else siteSyncIndex.delete(optimizedProject.id);
  }
  return { receipt, ...(siteError ? { siteError } : {}) };
}

/** Migra la base protegida con backup manual y el mismo canal autorizado que el agente. */
export async function migrateProtectedBaseTemplateOnDisk(
  project: StoreProjectV1,
  expectedVersion: number,
): Promise<{
  changed: boolean;
  project: StoreProjectV1;
  backup?: { path: string; version: number };
  receipt?: LocalSaveReceipt;
  siteError?: string;
}> {
  if (!isBaseTemplate(project) || isModernBaseTemplateContent(project)) {
    return { changed: false, project };
  }
  const backup = await createLocalManualBackup(project.id);
  const migrated = replaceModernBaseTemplateContent(project, {
    updatedAt: new Date().toISOString(),
  });
  const saved = await persistProjectToDisk(migrated, expectedVersion, {
    allowProtectedWrite: true,
    requireSite: true,
  });
  return { changed: true, project: migrated, backup, ...saved };
}
