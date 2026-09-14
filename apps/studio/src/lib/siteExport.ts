import type { ExportMode } from "@solara/exporter";

interface WritableFileLike {
  write(data: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface DirectoryLike {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileLike>;
}

interface FileLike {
  createWritable(): Promise<WritableFileLike>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryLike>;
}

export type ChosenExportDirectory = DirectoryLike;

export interface SiteWriteProgress {
  current: number;
  total: number;
}

function getDirectoryPicker(): DirectoryPickerWindow["showDirectoryPicker"] {
  if (typeof window === "undefined") return undefined;
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  return typeof picker === "function" ? picker.bind(window) : undefined;
}

function isPickerCancellation(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    (reason as { name?: unknown }).name === "AbortError"
  );
}

function safePathSegments(path: string): string[] {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !path.trim() ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`La exportación contiene una ruta insegura: ${path}.`);
  }
  return segments;
}

/** Abre el selector nativo mientras todavía existe la activación del click. */
export async function chooseExportDirectory(): Promise<ChosenExportDirectory | null> {
  const picker = getDirectoryPicker();
  if (!picker) {
    throw new Error(
      "Este navegador no permite elegir una carpeta. Abrí SolaraCommerce en Chrome o Edge.",
    );
  }
  try {
    return await picker({ mode: "readwrite" });
  } catch (reason) {
    if (isPickerCancellation(reason)) return null;
    throw reason;
  }
}

export async function writeSiteToDirectory(
  directory: ChosenExportDirectory,
  files: ReadonlyMap<string, string | Uint8Array>,
  mode: ExportMode,
  onProgress?: (progress: SiteWriteProgress) => void,
): Promise<{ folder: string; filesWritten: number }> {
  if (files.size === 0) throw new Error("La exportación no contiene archivos.");

  const entries: Array<{ segments: string[]; data: string | Uint8Array }> = [];
  const seen = new Set<string>();
  for (const [path, data] of files) {
    const segments = safePathSegments(path);
    const key = segments.join("/").toLowerCase();
    if (seen.has(key)) throw new Error(`La exportación repite la ruta ${path}.`);
    seen.add(key);
    entries.push({ segments, data });
  }

  onProgress?.({ current: 0, total: entries.length });

  for (const [index, { segments, data }] of entries.entries()) {
    let target = directory;
    for (const segment of segments.slice(0, -1)) {
      target = await target.getDirectoryHandle(segment, { create: true });
    }
    const file = await target.getFileHandle(segments.at(-1) as string, { create: true });
    const writable = await file.createWritable();
    await writable.write(data);
    await writable.close();
    onProgress?.({ current: index + 1, total: entries.length });
  }

  return {
    folder: `${directory.name} (${mode === "production" ? "producción" : "borrador"})`,
    filesWritten: entries.length,
  };
}
