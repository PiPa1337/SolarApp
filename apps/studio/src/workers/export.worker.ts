/** Valida archive/export fuera de React y conserva paridad con el exporter. */
import type {
  AuditIssue,
  OptimizationReport,
  RecoveryAssetRef,
  RecoveryManifest,
} from "@solara/exporter";
import type { StoreProjectV1 } from "@solara/project-schema";
import { generateSocialCrops } from "./social-crop";

type ExporterModule = typeof import("@solara/exporter");
type ProjectArchiveModule = typeof import("../lib/projectArchive");

let exporterModulePromise: Promise<ExporterModule> | undefined;
let projectArchiveModulePromise: Promise<ProjectArchiveModule> | undefined;

function loadExporter(): Promise<ExporterModule> {
  exporterModulePromise ??= import("@solara/exporter");
  return exporterModulePromise;
}

function loadProjectArchive(): Promise<ProjectArchiveModule> {
  projectArchiveModulePromise ??= import("../lib/projectArchive");
  return projectArchiveModulePromise;
}

type RecoveryFiles = ReadonlyMap<string, string | Uint8Array>;

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("gzip");
  // Consumir la salida mientras se escribe evita backpressure con respaldos grandes.
  const output = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  await writer.write(buffer);
  await writer.close();
  return new Uint8Array(await output);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("gzip");
  const output = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  await writer.write(buffer);
  await writer.close();
  return new Uint8Array(await output);
}

async function buildRecoveryFiles(
  project: StoreProjectV1,
  exporter: ExporterModule,
  createProjectArchiveBytes: ProjectArchiveModule["createProjectArchiveBytes"],
): Promise<RecoveryFiles> {
  const used = exporter.publicMediaUsage(project);
  const publicPaths = exporter.publicAssetPaths(project, used);
  const sourceHashes = new Map<string, string>();
  for (const asset of [...project.assets, ...project.videos]) {
    if (!/^data:/i.test(asset.source)) continue;
    if (asset.kind === "video" ? !used.videoIds.has(asset.id) : !used.assetIds.has(asset.id)) {
      continue;
    }
    const bytes = exporter.dataUrlBytes(asset.source);
    if (!bytes) throw new Error(`El recurso ${asset.id} contiene una data URL inválida.`);
    sourceHashes.set(asset.id, exporter.sha256Hex(bytes));
  }
  const { slimProject, missing } = exporter.splitSlimProject(project, used);
  const slimRaw = createProjectArchiveBytes(slimProject);
  const slimGzip = await gzip(slimRaw);
  const assetRefs = exporter.buildRecoveryAssetRefs(project, used, publicPaths, sourceHashes);
  const assetsBytes = jsonBytes(assetRefs);
  const dir = exporter.newRecoveryDir();
  const paths = exporter.recoveryFileList(dir);
  const manifest = {
    format: "solara-recovery" as const,
    version: 1 as const,
    projectId: project.id,
    exportedAt: new Date().toISOString(),
    schemaVersion: project.schemaVersion,
    templateVersion: project.origin?.templateVersion ?? 1,
    rendererFingerprint: exporter.EXPORTER_RENDERER_FINGERPRINT,
    assetBasePath: exporter.baseUrlPathname(project.baseUrl),
    slimFile: paths.slim,
    assetsFile: paths.assets,
    slimSha256: exporter.sha256Hex(slimGzip),
    slimGzipBytes: slimGzip.byteLength,
    slimRawBytes: slimRaw.byteLength,
    assetsSha256: exporter.sha256Hex(assetsBytes),
    coverage: "published-only" as const,
    missing,
  } satisfies RecoveryManifest;
  const manifestBytes = jsonBytes(manifest);
  const totalBytes = manifestBytes.byteLength + slimGzip.byteLength + assetsBytes.byteLength;
  if (totalBytes > exporter.RECOVERY_MAX_BYTES) {
    throw new Error(
      `La bóveda de recuperación supera el límite de 2 MB (${Math.ceil(totalBytes / 1024)} KB).`,
    );
  }
  return new Map([
    [paths.manifest, manifestBytes],
    [paths.slim, slimGzip],
    [paths.assets, assetsBytes],
  ]);
}

function manifestUrlFromInput(input: string): URL {
  const url = new URL(input.trim());
  if (!/\/manifest\.json$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/manifest.json`;
  }
  return url;
}

async function fetchBytes(
  url: URL,
  label: string,
  maxBytes = 2 * 1024 * 1024,
): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo descargar ${label} (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`${label} supera el límite permitido.`);
  return bytes;
}

function manifestFilePath(manifestPath: string, file: string, expectedName: string): string {
  const directory = manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1);
  const normalizedFile = file.replace(/^\/+/, "");
  const expectedFile = `${directory.replace(/^\/+/, "")}${expectedName}`;
  if (normalizedFile !== expectedFile) {
    throw new Error(`La bóveda referencia un ${expectedName} fuera de su directorio.`);
  }
  return normalizedFile;
}

function validateRecoveryAssetPath(file: string): string {
  if (!/^(?:[A-Za-z0-9._+-]+\/)*[A-Za-z0-9._+-]+$/.test(file)) {
    throw new Error(`La bóveda contiene una ruta de asset inválida: ${file}.`);
  }
  return file;
}

function publicRecoveryAssetUrl(manifestUrl: URL, assetBasePath: string, file: string): URL {
  validateRecoveryAssetPath(file);
  if (
    assetBasePath &&
    assetBasePath !== "/" &&
    !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/.test(assetBasePath)
  ) {
    throw new Error("La bóveda contiene una base URL inválida.");
  }
  const basePath = assetBasePath === "/" ? "" : assetBasePath.replace(/\/$/, "");
  const base = `${manifestUrl.origin}${basePath}/`;
  return new URL(file, base);
}

type RecoveryByteReader = (path: string, label: string) => Promise<Uint8Array>;

async function recoverProjectData(
  manifest: RecoveryManifest,
  readFile: RecoveryByteReader,
  readAsset: (ref: RecoveryAssetRef) => Promise<Uint8Array>,
  exporter: ExporterModule,
  readProjectArchive: ProjectArchiveModule["readProjectArchive"],
): Promise<StoreProjectV1> {
  const slimGzip = await readFile(manifest.slimFile, "el proyecto slim");
  if (slimGzip.byteLength !== manifest.slimGzipBytes) {
    throw new Error("El tamaño del proyecto slim no coincide con su manifest.");
  }
  if (exporter.sha256Hex(slimGzip) !== manifest.slimSha256) {
    throw new Error("El proyecto slim no pasó la verificación de integridad.");
  }
  const slimRaw = await gunzip(slimGzip);
  if (manifest.slimRawBytes !== slimRaw.byteLength) {
    throw new Error("El proyecto slim está truncado.");
  }
  const assetsBytes = await readFile(manifest.assetsFile, "el índice de assets");
  if (exporter.sha256Hex(assetsBytes) !== manifest.assetsSha256) {
    throw new Error("El índice de assets no pasó la verificación de integridad.");
  }
  const slimProject = readProjectArchive(slimRaw);
  if (slimProject.id !== manifest.projectId) {
    throw new Error("El proyecto slim no coincide con el projectId del manifest.");
  }
  const refs = JSON.parse(new TextDecoder().decode(assetsBytes)) as RecoveryAssetRef[];
  if (!Array.isArray(refs)) throw new Error("El índice de assets de la bóveda no es válido.");
  const blobs = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  for (const ref of refs) {
    if (
      !ref ||
      typeof ref.id !== "string" ||
      typeof ref.file !== "string" ||
      (ref.kind !== "image" && ref.kind !== "video") ||
      typeof ref.mimeType !== "string" ||
      !/^[0-9a-f]{64}$/i.test(ref.hash)
    ) {
      throw new Error("El índice de assets de la bóveda contiene una entrada inválida.");
    }
    if (blobs.has(ref.id)) throw new Error(`El índice de assets duplica el recurso ${ref.id}.`);
    const bytes = await readAsset(ref);
    if (exporter.sha256Hex(bytes) !== ref.hash) {
      throw new Error(`El asset ${ref.id} no pasó la verificación de integridad.`);
    }
    blobs.set(ref.id, { bytes, mimeType: ref.mimeType });
  }
  return exporter.restoreAssetSources(slimProject, blobs);
}

async function recoverProjectFromManifest(
  input: string,
  exporter: ExporterModule,
  readProjectArchive: ProjectArchiveModule["readProjectArchive"],
): Promise<StoreProjectV1> {
  const manifestUrl = manifestUrlFromInput(input);
  const manifest = exporter.parseRecoveryManifest(
    JSON.parse(
      new TextDecoder().decode(await fetchBytes(manifestUrl, "el manifest de recuperación")),
    ),
  );
  return recoverProjectData(
    manifest,
    (path, label) =>
      fetchBytes(
        new URL(
          `/${manifestFilePath(manifestUrl.pathname, path, path.endsWith(".gz") ? "slim.json.gz" : "assets.json")}`,
          manifestUrl.origin,
        ),
        label,
      ),
    (ref) =>
      fetchBytes(
        publicRecoveryAssetUrl(manifestUrl, manifest.assetBasePath, ref.file),
        `el asset ${ref.id}`,
      ),
    exporter,
    readProjectArchive,
  );
}

async function recoverProjectFromFolder(
  files: ReadonlyMap<string, Uint8Array>,
  exporter: ExporterModule,
  readProjectArchive: ProjectArchiveModule["readProjectArchive"],
): Promise<StoreProjectV1> {
  const manifestPath = [...files.keys()].find((path) =>
    /^solara-recovery\/[0-9a-f]{64}\/manifest\.json$/i.test(path),
  );
  if (!manifestPath) throw new Error("La carpeta no contiene una bóveda de recuperación válida.");
  const manifestBytes = files.get(manifestPath);
  if (!manifestBytes) throw new Error("No se pudo leer el manifest de recuperación.");
  const manifest = exporter.parseRecoveryManifest(
    JSON.parse(new TextDecoder().decode(manifestBytes)),
  );
  const slimPath = manifestFilePath(manifestPath, manifest.slimFile, "slim.json.gz");
  const assetsPath = manifestFilePath(manifestPath, manifest.assetsFile, "assets.json");
  const readPath: RecoveryByteReader = async (path, label) => {
    const normalized = path.replace(/^\/+/, "");
    const bytes = files.get(normalized);
    if (!bytes) throw new Error(`Falta ${label} en la carpeta seleccionada.`);
    if (bytes.byteLength > 2 * 1024 * 1024) throw new Error(`${label} supera el límite permitido.`);
    return bytes;
  };
  return recoverProjectData(
    { ...manifest, slimFile: slimPath, assetsFile: assetsPath },
    readPath,
    async (ref) => readPath(validateRecoveryAssetPath(ref.file), `el asset ${ref.id}`),
    exporter,
    readProjectArchive,
  );
}

type ExportRequest =
  | {
      id: string;
      type: "site";
      project: StoreProjectV1;
      mode: "draft" | "production";
      options: {
        publicAiContext?: boolean;
        optimizationProfile?: "safe" | "strict";
        includeRecovery?: boolean;
      };
    }
  | {
      id: string;
      type: "audit";
      project: StoreProjectV1;
      publicAiContext: boolean;
    }
  | {
      id: string;
      type: "preview";
      project?: StoreProjectV1;
      revision: number;
      route: string;
      options?: {
        assetTransport?: "inline" | "parent";
        editor?: { enabled: true; sectionId: string };
      };
    }
  | {
      id: string;
      type: "project-write";
      project: StoreProjectV1;
    }
  | {
      id: string;
      type: "project-read";
      buffer: ArrayBuffer;
    }
  | {
      id: string;
      type: "project-recover";
      manifestUrl: string;
    }
  | {
      id: string;
      type: "project-recover-folder";
      files: Array<{ path: string; data: ArrayBuffer }>;
    };

let previewProject: StoreProjectV1 | undefined;
let previewRevision: number | undefined;
let previewAssetSources: Record<string, string> = {};

self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    const request = event.data;
    if (request.type === "site") {
      const { auditReport, collectSocialCropRequests, exportProject } = await loadExporter();
      const archive = await loadProjectArchive();
      const project = { ...request.project };
      const options = { mode: request.mode, ...request.options };
      const reportProgress = (
        task: "validate" | "social-crops" | "recovery" | "render",
        status: "active" | "complete",
      ) => self.postMessage({ id: request.id, kind: "export-progress", task, status });

      reportProgress("validate", "active");
      auditReport(project);
      reportProgress("validate", "complete");
      let socialImageCrops;
      if (request.mode === "production") {
        reportProgress("social-crops", "active");
        socialImageCrops = await generateSocialCrops(collectSocialCropRequests(project));
        reportProgress("social-crops", "complete");
      }
      let recoveryFiles;
      if (request.options.includeRecovery) {
        reportProgress("recovery", "active");
        recoveryFiles = await buildRecoveryFiles(
          project,
          await loadExporter(),
          archive.createProjectArchiveBytes,
        );
        reportProgress("recovery", "complete");
      }
      reportProgress("render", "active");
      const result = exportProject(project, {
        ...options,
        ...(socialImageCrops && socialImageCrops.size > 0 ? { socialImageCrops } : {}),
        ...(recoveryFiles ? { recoveryFiles } : {}),
      });
      reportProgress("render", "complete");
      const optimization: OptimizationReport = result.optimization;
      const audit: AuditIssue[] = result.audit;
      self.postMessage({
        id: request.id,
        ok: true,
        result: {
          files: result.files,
          audit,
          optimization,
          criticalCount: audit.filter((issue) => issue.severity === "critical").length,
        },
      });
      return;
    }

    if (request.type === "audit") {
      const { auditReport, buildOptimizationReport } = await loadExporter();
      self.postMessage({
        id: request.id,
        ok: true,
        result: {
          criticalCount: auditReport(request.project).criticalCount,
          optimization: buildOptimizationReport(request.project, {
            mode: "production",
            publicAiContext: request.publicAiContext,
          }),
        },
      });
      return;
    }

    if (request.type === "preview") {
      const exporter = await loadExporter();
      const shouldSendAssetSources = request.project !== undefined;
      if (request.project && request.revision !== previewRevision) {
        previewProject = request.project;
        previewRevision = request.revision;
        previewAssetSources = Object.fromEntries(
          exporter.getPreviewAssetSources(request.project).entries(),
        );
      }
      if (!previewProject || request.revision !== previewRevision) {
        throw new Error("El worker de preview no tiene el snapshot de la revisión solicitada.");
      }
      const rendered = exporter.renderPreviewHtml(previewProject, "draft", request.route, {
        ...(request.options?.assetTransport
          ? { assetTransport: request.options.assetTransport }
          : {}),
        ...(request.options?.editor ? { editor: request.options.editor } : {}),
      });
      const html = typeof rendered === "string" ? rendered : rendered.html;
      const canvasManifest =
        typeof rendered === "string" ? { entries: [], coverage: [] } : rendered.canvasManifest;
      self.postMessage({
        id: request.id,
        ok: true,
        result: {
          html,
          canvasManifest,
          ...(shouldSendAssetSources ? { assetSources: previewAssetSources } : {}),
        },
      });
      return;
    }

    if (request.type === "project-write") {
      const { createProjectArchiveBytes } = await loadProjectArchive();
      self.postMessage({
        id: request.id,
        ok: true,
        result: createProjectArchiveBytes(request.project),
      });
      return;
    }

    const { readProjectArchive } = await loadProjectArchive();
    if (request.type === "project-recover") {
      const project = await recoverProjectFromManifest(
        request.manifestUrl,
        await loadExporter(),
        readProjectArchive,
      );
      self.postMessage({ id: request.id, ok: true, result: project });
      return;
    }
    if (request.type === "project-recover-folder") {
      const project = await recoverProjectFromFolder(
        new Map(request.files.map((entry) => [entry.path, new Uint8Array(entry.data)])),
        await loadExporter(),
        readProjectArchive,
      );
      self.postMessage({ id: request.id, ok: true, result: project });
      return;
    }
    const project = readProjectArchive(new Uint8Array(request.buffer));
    self.postMessage({ id: request.id, ok: true, result: project });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo procesar el respaldo del proyecto.",
    });
  }
};
