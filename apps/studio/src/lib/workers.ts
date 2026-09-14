/**
 * Fachada tipada para los Web Workers de CSV, imágenes y exportación. Su
 * responsabilidad es serializar mensajes y errores; la lógica de negocio vive
 * en paquetes compartidos para que tests y preview no diverjan.
 */
import type { CatalogCsvContext } from "@solara/core";
import type { AuditIssue, ExportMode, OptimizationReport } from "@solara/exporter";
import {
  type Product,
  RESPONSIVE_IMAGE_MAX_WIDTH,
  responsiveImageWidths,
  type StoreProjectV1,
} from "@solara/project-schema";
import { hasVisibleAlpha } from "./image-alpha";

interface WorkerSuccess<Result> {
  id: string;
  ok: true;
  result: Result;
}

interface WorkerFailure {
  id: string;
  ok: false;
  error: string;
}

type WorkerResponse<Result> = WorkerSuccess<Result> | WorkerFailure;

export interface ProcessedImage {
  width: number;
  height: number;
  primary: string;
  fallback: string;
  responsive: Array<{ width: number; source: string }>;
}

function fallbackImagePlan(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = RESPONSIVE_IMAGE_MAX_WIDTH,
) {
  const safeMaxWidth = Math.max(1, Math.min(Math.floor(maxWidth), RESPONSIVE_IMAGE_MAX_WIDTH));
  const width = Math.min(sourceWidth, safeMaxWidth);
  const responsiveWidths = responsiveImageWidths(sourceWidth, safeMaxWidth);
  return {
    width,
    height: Math.max(1, Math.round((sourceHeight / sourceWidth) * width)),
    responsiveWidths,
  };
}

function canvasDataUrl(
  image: HTMLImageElement,
  width: number,
  mimeType: "image/webp" | "image/jpeg" | "image/png",
  preserveAlpha: boolean,
): string {
  const height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: preserveAlpha });
  if (!context) throw new Error("El navegador no pudo procesar la imagen.");
  if (!preserveAlpha) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  const quality =
    mimeType === "image/webp"
      ? width >= 1200
        ? 0.75
        : 0.82
      : mimeType === "image/jpeg"
        ? width >= 1200
          ? 0.8
          : 0.88
        : undefined;
  return quality === undefined ? canvas.toDataURL(mimeType) : canvas.toDataURL(mimeType, quality);
}

const IMAGE_ALPHA_PROBE_MAX_WIDTH = 128;

function probeImageAlpha(image: HTMLImageElement): boolean {
  const scale = Math.min(
    1,
    IMAGE_ALPHA_PROBE_MAX_WIDTH / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!context) return true;
  context.drawImage(image, 0, 0, width, height);
  return hasVisibleAlpha(context.getImageData(0, 0, width, height));
}

async function processImageOnMainThread(file: File, buffer: ArrayBuffer): Promise<ProcessedImage> {
  if (typeof document === "undefined") {
    throw new Error("El navegador no pudo procesar la imagen.");
  }
  const objectUrl = URL.createObjectURL(new Blob([buffer], { type: file.type }));
  const image = new Image();
  image.decoding = "async";
  try {
    image.src = objectUrl;
    await image.decode();
    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      throw new Error("La imagen no tiene dimensiones válidas.");
    }
    if (image.naturalWidth * image.naturalHeight > 50_000_000) {
      throw new Error("La imagen supera el límite de 50 megapíxeles.");
    }
    const plan = fallbackImagePlan(image.naturalWidth, image.naturalHeight);
    let preserveAlpha = file.type !== "image/jpeg";
    if (preserveAlpha) {
      try {
        preserveAlpha = probeImageAlpha(image);
      } catch {
        preserveAlpha = true;
      }
    }
    const responsive = plan.responsiveWidths.map((width) => ({
      width,
      source: canvasDataUrl(image, width, "image/webp", preserveAlpha),
    }));
    const primary = responsive.at(-1)?.source;
    if (!primary) throw new Error("No se pudo generar la imagen principal.");
    const fallbackType = preserveAlpha ? "image/png" : "image/jpeg";
    return {
      ...plan,
      primary,
      fallback: canvasDataUrl(image, plan.width, fallbackType, preserveAlpha),
      responsive,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface CatalogPackageImage {
  path: string;
  type: string;
  buffer: ArrayBuffer;
}

export interface CatalogPackageContents {
  csv: string;
  images: CatalogPackageImage[];
}

function requestWorker<Request extends object, Result>(
  worker: Worker,
  request: Request,
  transfer: Transferable[] = [],
  recreate?: () => Worker,
  timeoutMs = 0,
): Promise<Result> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const perform = (current: Worker, retried: boolean) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const detach = () => {
        current.removeEventListener("message", handleMessage);
        current.removeEventListener("error", handleError);
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      };
      const handleMessage = (event: MessageEvent<WorkerResponse<Result>>) => {
        if (event.data.id !== id) return;
        detach();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      const handleError = (event: ErrorEvent) => {
        detach();
        if (!retried && recreate) {
          perform(recreate(), true);
          return;
        }
        const detail = event?.message ? `: ${event.message}` : "";
        reject(
          new Error(
            retried
              ? `El worker no respondió y el reintento falló${detail}.`
              : `El worker no respondió${detail}.`,
          ),
        );
      };
      const handleTimeout = () => {
        detach();
        current.terminate();
        if (!retried && recreate) {
          perform(recreate(), true);
          return;
        }
        reject(new Error("el worker no respondió dentro del tiempo esperado."));
      };
      current.addEventListener("message", handleMessage);
      current.addEventListener("error", handleError);
      current.postMessage({ ...request, id }, transfer);
      if (timeoutMs > 0) timeoutId = setTimeout(handleTimeout, timeoutMs);
    };
    perform(worker, false);
  });
}

/** Recrea un worker cacheado caído: resetea la caché y devuelve una instancia nueva. */
function recreateWorker(reset: () => void, factory: () => Worker): () => Worker {
  return () => {
    reset();
    return factory();
  };
}

let csvWorker: Worker | undefined;
let imageWorker: Worker | undefined;
let exportWorker: Worker | undefined;
let catalogPackageWorker: Worker | undefined;
let previewProjectRef: StoreProjectV1 | undefined;
let previewProjectRevision = 0;
let previewLoadedRevision: number | undefined;
let previewAssetSourcesRevision: number | undefined;
let previewAssetSources: Record<string, string> | undefined;

function getCsvWorker(): Worker {
  csvWorker ??= new Worker(new URL("../workers/csv.worker.ts", import.meta.url), {
    type: "module",
  });
  return csvWorker;
}

function getImageWorker(): Worker {
  imageWorker ??= new Worker(new URL("../workers/image.worker.ts", import.meta.url), {
    type: "module",
  });
  return imageWorker;
}

function getExportWorker(): Worker {
  exportWorker ??= new Worker(new URL("../workers/export.worker.ts", import.meta.url), {
    type: "module",
  });
  return exportWorker;
}

function resetExportWorker(): void {
  exportWorker?.terminate?.();
  exportWorker = undefined;
  previewLoadedRevision = undefined;
  previewAssetSourcesRevision = undefined;
  previewAssetSources = undefined;
}

function getCatalogPackageWorker(): Worker {
  catalogPackageWorker ??= new Worker(
    new URL("../workers/catalog-package.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  return catalogPackageWorker;
}

export function importCsvInWorker(csv: string, context?: CatalogCsvContext): Promise<Product[]> {
  return requestWorker(
    getCsvWorker(),
    context ? { type: "import", csv, context } : { type: "import", csv },
    [],
    recreateWorker(() => {
      csvWorker = undefined;
    }, getCsvWorker),
  );
}

export interface CsvRowError {
  row: number;
  message: string;
}

/** Diagnostica un CSV fallido y reporta el error de cada fila inválida. */
export function diagnoseCsvInWorker(
  csv: string,
  context?: CatalogCsvContext,
): Promise<CsvRowError[]> {
  return requestWorker(
    getCsvWorker(),
    context ? { type: "diagnose", csv, context } : { type: "diagnose", csv },
    [],
    recreateWorker(() => {
      csvWorker = undefined;
    }, getCsvWorker),
  );
}

export function readCatalogPackageInFolder(files: File[]): Promise<CatalogPackageContents> {
  const root = files[0]?.webkitRelativePath?.split("/")[0];
  const payload = files.map((file) => {
    const rawPath = file.webkitRelativePath || file.name;
    const path = root && rawPath.startsWith(`${root}/`) ? rawPath.slice(root.length + 1) : rawPath;
    return { path, type: file.type, buffer: file.arrayBuffer() };
  });
  return Promise.all(payload.map(async (entry) => ({ ...entry, buffer: await entry.buffer }))).then(
    (entries) =>
      requestWorker(
        getCatalogPackageWorker(),
        { type: "catalog-package", files: entries },
        [],
        recreateWorker(() => {
          catalogPackageWorker = undefined;
        }, getCatalogPackageWorker),
      ),
  );
}

export function exportCsvInWorker(products: Product[]): Promise<string> {
  return requestWorker(
    getCsvWorker(),
    { type: "export", products },
    [],
    recreateWorker(() => {
      csvWorker = undefined;
    }, getCsvWorker),
  );
}

export function exportCommercialCsvInWorker(
  project: Pick<StoreProjectV1, "products" | "categories" | "collections">,
): Promise<string> {
  return requestWorker(
    getCsvWorker(),
    { type: "export-commercial", project },
    [],
    recreateWorker(() => {
      csvWorker = undefined;
    }, getCsvWorker),
  );
}

export async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function processImageInWorker(file: File): Promise<ProcessedImage> {
  const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!supportedTypes.includes(file.type)) {
    throw new Error("Formato no compatible. Usá una imagen JPEG, PNG, WebP o AVIF.");
  }
  if (file.size === 0) throw new Error("La imagen está vacía.");
  if (file.size > 25 * 1024 * 1024) throw new Error("La imagen supera el límite de 25 MB.");
  const buffer = await file.arrayBuffer();
  const workerBuffer = buffer.slice(0);
  try {
    return await requestWorker(
      getImageWorker(),
      {
        buffer: workerBuffer,
        name: file.name,
        type: file.type,
        maxWidth: RESPONSIVE_IMAGE_MAX_WIDTH,
      },
      [workerBuffer],
      recreateWorker(() => {
        imageWorker = undefined;
      }, getImageWorker),
    );
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (!/OffscreenCanvas|createImageBitmap/i.test(message)) throw reason;
    return processImageOnMainThread(file, buffer);
  }
}

export function exportSiteInWorker(
  project: StoreProjectV1,
  mode: ExportMode,
  options: {
    publicAiContext?: boolean;
    optimizationProfile?: "safe" | "strict";
    includeRecovery?: boolean;
  } = {},
  onProgress?: (event: ExportProgressEvent) => void,
): Promise<{
  files: ReadonlyMap<string, string | Uint8Array>;
  audit: AuditIssue[];
  optimization: OptimizationReport;
  criticalCount: number;
}> {
  return requestWorkerWithStages(
    getExportWorker(),
    { type: "site", project, mode, options },
    onProgress,
    recreateWorker(() => {
      resetExportWorker();
    }, getExportWorker),
  );
}

export function recoverProjectFromUrlInWorker(manifestUrl: string): Promise<StoreProjectV1> {
  return requestWorker(
    getExportWorker(),
    { type: "project-recover", manifestUrl },
    [],
    recreateWorker(() => {
      resetExportWorker();
    }, getExportWorker),
  );
}

export async function recoverProjectFromFolderInWorker(files: File[]): Promise<StoreProjectV1> {
  if (files.length === 0) throw new Error("Seleccioná la carpeta exportada del sitio.");
  const root = files[0]?.webkitRelativePath.split("/")[0] ?? "";
  const entries = await Promise.all(
    files.map(async (file) => {
      const relative = file.webkitRelativePath || file.name;
      const path =
        root && relative.startsWith(`${root}/`) ? relative.slice(root.length + 1) : relative;
      return { path, data: await file.arrayBuffer() };
    }),
  );
  return requestWorker(
    getExportWorker(),
    { type: "project-recover-folder", files: entries },
    entries.map((entry) => entry.data),
    recreateWorker(() => {
      resetExportWorker();
    }, getExportWorker),
  );
}

export type ExportTaskId = "validate" | "social-crops" | "recovery" | "render";

export interface ExportProgressMessage {
  id: string;
  kind: "export-progress";
  task: ExportTaskId;
  status: "active" | "complete";
}

export type ExportProgressEvent = Pick<ExportProgressMessage, "task" | "status">;

function requestWorkerWithStages<Request extends object, Result>(
  worker: Worker,
  request: Request,
  onProgress?: (event: ExportProgressEvent) => void,
  recreate?: () => Worker,
): Promise<Result> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const perform = (current: Worker, retried: boolean) => {
      const detach = () => {
        current.removeEventListener("message", handleMessage);
        current.removeEventListener("error", handleError);
      };
      const handleMessage = (
        event: MessageEvent<WorkerResponse<Result> | ExportProgressMessage>,
      ) => {
        if (event.data.id !== id) return;
        if ("kind" in event.data) {
          onProgress?.(event.data);
          return;
        }
        detach();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error));
      };
      const handleError = (event: ErrorEvent) => {
        detach();
        if (!retried && recreate) {
          perform(recreate(), true);
          return;
        }
        const detail = event?.message ? `: ${event.message}` : "";
        reject(
          new Error(
            retried
              ? `El worker no respondió y el reintento falló${detail}.`
              : `El worker no respondió${detail}.`,
          ),
        );
      };
      current.addEventListener("message", handleMessage);
      current.addEventListener("error", handleError);
      current.postMessage({ ...request, id });
    };
    perform(worker, false);
  });
}

export function createProjectArchiveInWorker(project: StoreProjectV1): Promise<Uint8Array> {
  return requestWorker(
    getExportWorker(),
    { type: "project-write", project },
    [],
    recreateWorker(() => {
      resetExportWorker();
    }, getExportWorker),
  );
}

export async function readProjectArchiveInWorker(file: File): Promise<StoreProjectV1> {
  const buffer = await file.arrayBuffer();
  return readProjectArchiveBufferInWorker(buffer);
}

function readProjectArchiveBufferInWorker(buffer: ArrayBuffer): Promise<StoreProjectV1> {
  return requestWorker(
    getExportWorker(),
    { type: "project-read", buffer },
    [buffer],
    recreateWorker(() => {
      resetExportWorker();
    }, getExportWorker),
  );
}

export function readProjectArchiveBytesInWorker(bytes: Uint8Array): Promise<StoreProjectV1> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return readProjectArchiveBufferInWorker(copy.buffer);
}

/** Transfiere un buffer de lectura que el llamador ya no necesita conservar. */
export function readProjectArchiveOwnedBytesInWorker(bytes: Uint8Array): Promise<StoreProjectV1> {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return readProjectArchiveBufferInWorker(bytes.buffer as ArrayBuffer);
  }
  return readProjectArchiveBytesInWorker(bytes);
}

export interface AuditResult {
  criticalCount: number;
  optimization: OptimizationReport;
}

/**
 * Peso aproximado del proyecto en caracteres de cadenas embebidas (data URLs
 * y descripciones). Recorre estructuras, nunca concatena: es O(recursos) y
 * acotado, sin riesgo de Invalid string length.
 */
function estimateProjectWeight(project: StoreProjectV1): number {
  let total = 0;
  for (const asset of project.assets) {
    total += asset.source.length + (asset.fallbackSource?.length ?? 0);
    for (const responsive of asset.responsiveSources ?? []) total += responsive.source.length;
  }
  for (const video of project.videos) total += video.source.length;
  for (const product of project.products) {
    total += product.description.length;
    for (const variant of product.variants) total += variant.title.length;
  }
  return total;
}

/**
 * Timeout de la auditoría proporcional al peso: con proyectos enormes la
 * validación Zod y el análisis del worker tardan decenas de segundos; el
 * timeout fijo de 10s mataba al worker y la auditoría nunca terminaba.
 */
function auditTimeoutFor(project: StoreProjectV1): number {
  const weight = estimateProjectWeight(project);
  return Math.min(90_000, 10_000 + Math.round(weight / 20_000));
}

/**
 * Ejecuta la auditoría de exportación en el worker del exportador: el worker
 * tiene su propio mapa de módulos, así que si la carga del chunk falla se
 * puede reintentar recreándolo (el mapa de módulos de la página no lo
 * permite). Si el worker muere, se termina y se olvida para la próxima
 * llamada.
 */
export function auditProjectInWorker(
  project: StoreProjectV1,
  publicAiContext: boolean,
): Promise<AuditResult> {
  return requestWorker(
    getExportWorker(),
    { type: "audit", project, publicAiContext },
    [],
    recreateWorker(() => {
      resetExportWorker();
    }, getExportWorker),
    auditTimeoutFor(project),
  );
}

export interface PreviewWorkerResult {
  html: string;
  canvasManifest: { entries: Array<Record<string, unknown>>; coverage: unknown[] };
  assetSources: Record<string, string>;
}

export function renderPreviewInWorker(
  project: StoreProjectV1,
  route: string,
  options?: { assetTransport?: "inline" | "parent"; editor?: { enabled: true; sectionId: string } },
): Promise<PreviewWorkerResult> {
  if (previewProjectRef !== project) {
    previewProjectRef = project;
    previewProjectRevision += 1;
    previewLoadedRevision = undefined;
  }
  const revision = previewProjectRevision;
  const request: {
    type: "preview";
    project?: StoreProjectV1;
    revision: number;
    route: string;
    options?: {
      assetTransport?: "inline" | "parent";
      editor?: { enabled: true; sectionId: string };
    };
  } = {
    type: "preview",
    revision,
    route,
    ...(options ? { options } : {}),
    ...(previewLoadedRevision === revision ? {} : { project }),
  };
  type PreviewWorkerResponse = Omit<PreviewWorkerResult, "assetSources"> & {
    assetSources?: Record<string, string>;
  };
  return requestWorker<typeof request, PreviewWorkerResponse>(
    getExportWorker(),
    request,
    [],
    recreateWorker(() => {
      resetExportWorker();
      request.project = project;
    }, getExportWorker),
  ).then((result: PreviewWorkerResponse): PreviewWorkerResult => {
    if (result.assetSources !== undefined) {
      previewAssetSourcesRevision = revision;
      previewAssetSources = result.assetSources;
    }
    if (previewAssetSourcesRevision !== revision || previewAssetSources === undefined) {
      throw new Error("El worker de preview no devolvió los assets de la revisión solicitada.");
    }
    if (previewProjectRef === project && previewProjectRevision === revision) {
      previewLoadedRevision = revision;
    }
    return { ...result, assetSources: previewAssetSources };
  });
}
