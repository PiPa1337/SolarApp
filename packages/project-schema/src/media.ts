/**
 * Schemas de assets multimedia. Extraídos de index.ts como parte de la
 * división por dominio (2026-08-21). Dependen sólo de IDs branded.
 */
import { z } from "zod";
import { AssetIdSchema } from "./ids.js";

/**
 * Receta compartida por Studio, el agente y el sitio exportado. La variante
 * intermedia cubre tablet y mobile; la máxima queda para desktop.
 */
export const RESPONSIVE_IMAGE_WIDTHS = [480, 768, 1800] as const;
export const RESPONSIVE_IMAGE_INTERMEDIATE_WIDTH = 768;
export const RESPONSIVE_IMAGE_MAX_WIDTH = 1800;
/** Marca estable para distinguir la receta materializada de las variantes. */
export const IMAGE_ASSET_RECIPE = "responsive-export-v1";
/** Receta materializada por el optimizador de imágenes de Studio. */
export const IMAGE_ASSET_RECIPE_V2 = "responsive-alpha-v2";

function isValidIcoEntryImage(view: DataView, offset: number, size: number): boolean {
  if (
    size >= 8 &&
    view.getUint8(offset) === 0x89 &&
    view.getUint8(offset + 1) === 0x50 &&
    view.getUint8(offset + 2) === 0x4e &&
    view.getUint8(offset + 3) === 0x47 &&
    view.getUint8(offset + 4) === 0x0d &&
    view.getUint8(offset + 5) === 0x0a &&
    view.getUint8(offset + 6) === 0x1a &&
    view.getUint8(offset + 7) === 0x0a
  ) {
    return true;
  }
  if (size < 12) return false;
  const headerSize = view.getUint32(offset, true);
  if (headerSize === 12) {
    return view.getUint16(offset + 4, true) > 0 && view.getUint16(offset + 6, true) > 0;
  }
  if (headerSize < 40 || headerSize > size) return false;
  return view.getInt32(offset + 4, true) !== 0 && view.getInt32(offset + 8, true) !== 0;
}

/**
 * Valida la estructura binaria de un ICO, no sólo sus cuatro bytes iniciales.
 * El exportador puede recibir assets legacy, pero nunca debe preservar como
 * favicon un archivo truncado que sólo imita la firma del formato.
 */
export function isValidIco(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.byteLength < 6) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) return false;
  const count = view.getUint16(4, true);
  const directorySize = 6 + count * 16;
  if (count === 0 || bytes.byteLength < directorySize) return false;

  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = view.getUint8(entryOffset) || 256;
    const height = view.getUint8(entryOffset + 1) || 256;
    const size = view.getUint32(entryOffset + 8, true);
    const offset = view.getUint32(entryOffset + 12, true);
    if (
      width < 1 ||
      width > 256 ||
      height < 1 ||
      height > 256 ||
      size === 0 ||
      offset < directorySize ||
      offset > bytes.byteLength - size ||
      !isValidIcoEntryImage(view, offset, size)
    ) {
      return false;
    }
  }
  return true;
}

/** Comprueba un ICO persistido en la forma de asset que usa SolaraCommerce. */
export function isValidIcoDataUrl(source: string | undefined): boolean {
  if (!source) return false;
  const match = /^data:[^;,]+;base64,(.*)$/is.exec(source);
  if (!match) return false;
  const payload = (match[1] ?? "").replace(/\s/g, "");
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    return false;
  }
  try {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return isValidIco(bytes);
  } catch {
    return false;
  }
}

export interface ResponsiveImageSource {
  width: number;
  source: string;
}

export function responsiveImageWidths(
  sourceWidth: number,
  maxWidth = RESPONSIVE_IMAGE_MAX_WIDTH,
): number[] {
  const safeSourceWidth = Math.max(1, Math.floor(sourceWidth));
  const safeMaxWidth = Math.max(1, Math.min(Math.floor(maxWidth), RESPONSIVE_IMAGE_MAX_WIDTH));
  const width = Math.min(safeSourceWidth, safeMaxWidth);
  return [
    ...new Set([...RESPONSIVE_IMAGE_WIDTHS.filter((candidate) => candidate < width), width]),
  ].sort((left, right) => left - right);
}

/** Conserva sólo la mejor fuente disponible y el punto más cercano a 768px. */
export function compactResponsiveSources(
  sources: readonly ResponsiveImageSource[] | undefined,
  sourceWidth: number,
  primary?: ResponsiveImageSource,
): ResponsiveImageSource[] | undefined {
  if (sources === undefined) return undefined;
  if (sources.length === 0) return [];

  const byWidth = new Map<number, ResponsiveImageSource>();
  for (const source of sources) {
    if (
      Number.isInteger(source.width) &&
      source.width > 0 &&
      source.width <= sourceWidth &&
      source.source
    ) {
      byWidth.set(source.width, source);
    }
  }
  if (primary && Number.isInteger(primary.width) && primary.width > 0) {
    byWidth.set(primary.width, primary);
  }

  const candidates = [...byWidth.values()].sort((left, right) => left.width - right.width);
  if (candidates.length <= 1) return candidates;

  const high = candidates[candidates.length - 1];
  if (!high) return [];
  const lower = candidates.slice(0, -1);
  const intermediate = lower.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate.width - RESPONSIVE_IMAGE_INTERMEDIATE_WIDTH);
    const bestDistance = Math.abs(best.width - RESPONSIVE_IMAGE_INTERMEDIATE_WIDTH);
    return candidateDistance < bestDistance ||
      (candidateDistance === bestDistance && candidate.width > best.width)
      ? candidate
      : best;
  });
  return [intermediate, high];
}

export const ImageAssetSchema = z.object({
  kind: z.literal("image").default("image"),
  id: AssetIdSchema,
  name: z.string().min(1),
  alt: z.string(),
  mimeType: z.string().min(1),
  source: z.string().min(1),
  // Opcional para poder leer proyectos anteriores y repararlos al abrirlos.
  optimizationRecipe: z.string().min(1).optional(),
  fallbackSource: z.string().min(1).optional(),
  responsiveSources: z
    .array(
      z.object({
        width: z.number().int().positive(),
        source: z.string().min(1),
      }),
    )
    .optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  hash: z.string().min(1),
});

export const VideoAssetSchema = z.object({
  kind: z.literal("video"),
  id: AssetIdSchema,
  name: z.string().min(1),
  alt: z.string().default(""),
  mimeType: z.enum(["video/mp4", "video/webm"]),
  source: z.string().min(1),
  posterAssetId: AssetIdSchema.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive().max(60),
  hash: z.string().min(1),
});

export const MediaAssetSchema = z.union([ImageAssetSchema, VideoAssetSchema]);
