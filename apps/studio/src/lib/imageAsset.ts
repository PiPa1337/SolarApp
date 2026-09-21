import {
  IMAGE_ASSET_RECIPE,
  IMAGE_ASSET_RECIPE_V2,
  isValidIcoDataUrl,
  type ImageAsset,
  RESPONSIVE_IMAGE_MAX_WIDTH,
  type StoreProjectV1,
} from "@solara/project-schema";
import type { ProcessedImage } from "./workers";

const PRIMARY_IMAGE_MIME_TYPES = new Set(["image/avif", "image/webp"]);
const FALLBACK_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export { IMAGE_ASSET_RECIPE_V2 };

const KNOWN_IMAGE_ASSET_RECIPES = new Set([IMAGE_ASSET_RECIPE, IMAGE_ASSET_RECIPE_V2]);

/** Devuelve el MIME declarado por una data URL sin inspeccionar sus bytes. */
export function dataUrlMimeType(source: string | undefined): string | undefined {
  return source ? /^data:([^;,]+)[;,]/i.exec(source)?.[1]?.toLowerCase() : undefined;
}

function isDataUrlWithMime(source: string | undefined, mimeTypes: Set<string>): boolean {
  const mimeType = source ? dataUrlMimeType(source) : undefined;
  return mimeType !== undefined && mimeTypes.has(mimeType);
}

/** Assets internos que no son una carga del usuario y se reemplazan desde Studio. */
export function isSystemImageAsset(asset: ImageAsset): boolean {
  return (
    asset.source.startsWith("/fixtures/") ||
    /^(?:fixture|template|remote-unsplash)-/i.test(asset.hash)
  );
}

function hasExpectedResponsiveSources(asset: ImageAsset, primaryMimeType: string): boolean {
  const sources = asset.responsiveSources;
  if (!sources || sources.length === 0 || asset.width > RESPONSIVE_IMAGE_MAX_WIDTH) return false;
  if (Math.max(...sources.map((source) => source.width)) !== asset.width) return false;
  return sources.every(
    (source) =>
      source.width <= asset.width &&
      dataUrlMimeType(source.source) === primaryMimeType &&
      source.source.startsWith("data:image/"),
  );
}

function isStructurallyOptimizedImageAsset(asset: ImageAsset): boolean {
  if (asset.mimeType === "image/x-icon") {
    return (
      dataUrlMimeType(asset.source) === "image/x-icon" &&
      isValidIcoDataUrl(asset.source) &&
      isDataUrlWithMime(asset.fallbackSource, new Set(["image/png"])) &&
      hasExpectedResponsiveSources(asset, "image/png") &&
      asset.width <= 256 &&
      asset.height <= 256
    );
  }

  const primaryMimeType = dataUrlMimeType(asset.source);
  return (
    primaryMimeType !== undefined &&
    PRIMARY_IMAGE_MIME_TYPES.has(primaryMimeType) &&
    isDataUrlWithMime(asset.fallbackSource, FALLBACK_IMAGE_MIME_TYPES) &&
    hasExpectedResponsiveSources(asset, primaryMimeType)
  );
}

/** True only when the asset carries the current complete editor recipe. */
export function isOptimizedImageAsset(asset: ImageAsset): boolean {
  const primaryMimeType = dataUrlMimeType(asset.source);
  return (
    isSystemImageAsset(asset) ||
    (asset.optimizationRecipe !== undefined &&
      KNOWN_IMAGE_ASSET_RECIPES.has(asset.optimizationRecipe) &&
      isStructurallyOptimizedImageAsset(asset) &&
      (asset.mimeType === "image/x-icon" || asset.mimeType === primaryMimeType))
  );
}

/**
 * Marks an older asset whose bytes already contain the complete responsive
 * recipe. This repairs metadata without trying to decode a legacy AVIF again.
 */
export function markImageAssetAsOptimized(asset: ImageAsset): ImageAsset | undefined {
  if (!isStructurallyOptimizedImageAsset(asset)) return undefined;
  const primaryMimeType = dataUrlMimeType(asset.source);
  return {
    ...asset,
    ...(asset.mimeType !== "image/x-icon" && primaryMimeType ? { mimeType: primaryMimeType } : {}),
    optimizationRecipe: IMAGE_ASSET_RECIPE_V2,
  };
}

/** Construye un asset de proyecto desde el resultado único del worker. */
export function createImageAssetFromProcessed(
  metadata: Pick<ImageAsset, "id" | "name" | "alt" | "hash">,
  processed: ProcessedImage,
): ImageAsset {
  const mimeType = dataUrlMimeType(processed.primary);
  if (!mimeType || !PRIMARY_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("El optimizador no generó un formato de imagen válido.");
  }
  const asset: ImageAsset = {
    kind: "image",
    ...metadata,
    mimeType,
    optimizationRecipe: IMAGE_ASSET_RECIPE_V2,
    source: processed.primary,
    fallbackSource: processed.fallback,
    responsiveSources: processed.responsive,
    width: processed.width,
    height: processed.height,
  };
  assertImageAssetOptimized(asset);
  return asset;
}

export function assertImageAssetOptimized(asset: ImageAsset): void {
  if (isOptimizedImageAsset(asset)) return;
  const error = new Error(
    `La imagen «${asset.name}» no está optimizada con la receta responsive actual.`,
  ) as Error & { code?: string };
  error.code = "IMAGE_NOT_OPTIMIZED";
  throw error;
}

export function assertProjectImagesOptimized(project: StoreProjectV1): void {
  for (const asset of project.assets) assertImageAssetOptimized(asset);
}
