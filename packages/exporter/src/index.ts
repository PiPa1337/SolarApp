/**
 * Exporter público compartido por Preview y el sitio exportado. Construye un
 * snapshot una vez, renderiza páginas y metadatos rastreables, deduplica assets
 * y produce el sitio estático sin incluir estado interno del editor.
 */

import {
  type CanvasBinding,
  canvasEntityAttributes,
  canvasEntityEditId,
  internalHref,
  renderImage,
} from "@solara/module-sdk";
import {
  getModuleDefinition,
  MOBILE_HERO_SQUARE_FIX,
  MODULE_STYLE_BLOCKS,
  moduleRegistry,
  type PageRenderContext,
  PRODUCT_GALLERY_MOBILE_FIX,
  renderSections,
  STORE_BASE_STYLES,
  STORE_THEME_TOKEN_STYLES,
} from "@solara/modules";
import type {
  Category,
  ImageAsset,
  Product,
  StoreProjectV1,
  StoreSection,
  Variant,
  VideoAsset,
} from "@solara/project-schema";
import {
  ARGENTINA_LEGAL_PROFILE,
  compactResponsiveSources,
  DEFAULT_THEME_TEXT_SHADOW_BLUR,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_X,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y,
  DEFAULT_THEME_TEXT_SHADOW_OPACITY,
  deriveThemeTextShadowColor,
  formatLegalCountryCoverage,
  formatLegalRevisionAt,
  getCategoryAncestors,
  getCategoryBreadcrumb,
  getCategoryProductIds,
  isValidIco,
  personalizeWhatsAppGreeting,
  resolveLegalCountryName,
  StoreProjectV1Schema,
} from "@solara/project-schema";
import { ensureCatalogModernV2Sections } from "@solara/project-schema/catalog-modern-template";
import { formatPrice } from "@solara/project-schema/money";
import {
  buildAiContext,
  buildLlmsTxt,
  fitTitle,
  type OptimizationOptions,
  type OptimizationReport,
  optimizeProject,
} from "@solara/site-optimizer";
import { STOREFRONT_RUNTIME_CSS, STOREFRONT_RUNTIME_JS } from "@solara/storefront-runtime";
import { activeFonts, type FontTransport, fontCssFor, fontFilesFor } from "./fonts";

export type { OptimizationReport } from "@solara/site-optimizer";
export type { FontOption, FontTransport } from "./fonts";
export { FONT_OPTIONS, fontCssFor, fontFilesFor } from "./fonts";

/** Fingerprint compartido por Preview, exportación y reconstrucciones globales. */
/**
 * Huella reproducible del renderer: deriva del contenido real de los estilos
 * base + módulos + runtime. No cambia con timestamps ni rutas; dos builds con
 * el mismo código producen la misma huella.
 */
export const EXPORTER_RENDERER_FINGERPRINT = `${sha256Hex(
  `${STORE_BASE_STYLES}\n${Object.values(MODULE_STYLE_BLOCKS).join("\n")}\n${PRODUCT_GALLERY_MOBILE_FIX}\n${MOBILE_HERO_SQUARE_FIX}\n${STOREFRONT_RUNTIME_JS}`,
).slice(0, 16)}`;

export type ExportMode = "draft" | "production";
export type AuditSeverity = "critical" | "warning" | "info";
export type AuditArea =
  | "technical"
  | "content"
  | "structured-data"
  | "merchant"
  | "performance"
  | "ai";
export type AuditFixTarget = "summary" | "catalog" | "assets" | "seo" | "export";

export interface AuditIssue {
  code: string;
  severity: AuditSeverity;
  area?: AuditArea;
  message: string;
  path?: string;
  entity?: {
    type: "store" | "product" | "variant" | "category" | "collection" | "asset";
    id: string;
    label: string;
  };
  fixTarget?: AuditFixTarget;
  documentationUrl?: string;
}

export interface CommerceOfferSnapshot {
  productId: string;
  variantId: string;
  itemGroupId: string;
  itemGroupTitle: string;
  canonicalPath: string;
  variantPath: string;
  title: string;
  description: string;
  brand: string;
  sku: string;
  gtin?: string;
  mpn?: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  currency: string;
  availability: "in_stock" | "out_of_stock" | "preorder";
  availabilityDate?: string;
  imageUrls: readonly string[];
}

export interface CommerceProductSnapshot {
  productId: string;
  canonicalPath: string;
  title: string;
  imageUrls: readonly string[];
  offers: readonly CommerceOfferSnapshot[];
}

export interface CommerceSnapshot {
  baseUrl: string;
  updatedAt: string;
  products: readonly CommerceProductSnapshot[];
  offers: readonly CommerceOfferSnapshot[];
}

export interface AuditReport {
  issues: readonly AuditIssue[];
  criticalCount: number;
  warningCount: number;
  merchantMode: "experimental-whatsapp";
  optimization?: OptimizationReport;
}

export interface ExportOptions {
  mode: ExportMode;
  /**
   * Compatibilidad con consumidores antiguos; producción siempre incluye el
   * contexto público para agentes. En borrador no se publican esos archivos.
   */
  publicAiContext?: boolean;
  optimizationProfile?: OptimizationOptions["profile"];
  /** Genera nombres de archivo semantico para assets (SEO para Google Images). */
  useSemanticNames?: boolean;
  /** Recortes og 1200x630 por assetId, generados por el pipeline de Studio. */
  socialImageCrops?: ReadonlyMap<string, SocialImageCrop>;
  /** Archivos opcionales de la bóveda de recuperación, preparados por Studio. */
  recoveryFiles?: ReadonlyMap<string, string | Uint8Array>;
}

export interface ExportResult {
  files: ReadonlyMap<string, string | Uint8Array>;
  audit: AuditIssue[];
  optimization: OptimizationReport;
}

export interface DeploymentManifestV1 {
  version: 1;
  mode: ExportMode;
  baseUrl: string;
  revision: string;
  runtime: {
    css: string;
    js: string;
  };
  publicAiContext: boolean;
  externalHosts: readonly string[];
  essentialFileHashes: Readonly<Record<string, string>>;
}

interface RuntimeAssetPaths {
  css: string;
  js: string;
  fontPaths?: ReadonlyMap<string, string>;
  serviceWorker?: boolean;
}

export interface PageDescriptor {
  path: string;
  title: string;
  description: string;
  canonicalPath: string;
  /** Fecha de modificación significativa de esta URL para el sitemap. */
  lastModifiedAt?: string;
  pageType:
    | "home"
    | "category"
    | "collection"
    | "product"
    | "search"
    | "cart"
    | "legal"
    | "not-found";
  body: string;
  structuredData: unknown[];
  image?: string;
  /** Image that is critical for this route, if one exists. Social images stay lazy. */
  preloadImage?: string;
  /** URL canónica de la página anterior en paginación, si aplica. */
  prevPath?: string;
  /** URL canónica de la página siguiente en paginación, si aplica. */
  nextPath?: string;
}

export interface PublicExportManifest {
  pages: readonly PageDescriptor[];
  activeModules: readonly string[];
  usedAssetIds: readonly string[];
  usedVideoIds: readonly string[];
  runtimeFeatures: readonly string[];
  indexableRoutes: readonly string[];
  searchEnabled: boolean;
  cartEnabled: boolean;
  checkoutEnabled: boolean;
}

interface PublicMediaUsage {
  assetIds: Set<string>;
  videoIds: Set<string>;
}

const encoder = new TextEncoder();

function parseProject(projectInput: StoreProjectV1, operation: string): StoreProjectV1 {
  const result = StoreProjectV1Schema.safeParse(projectInput);
  if (result.success) return ensureCatalogModernV2Sections(result.data);

  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
    .join("; ");
  throw new Error(`No se puede ${operation}: el proyecto es inválido. ${details}`);
}

import { escapeAttribute, escapeHtml, escapeXml, jsonForScript } from "./html.js";
import {
  buildFaviconIco,
  buildLlmsFullTxt,
  buildOfflinePage,
  buildRssFeed,
  buildServiceWorker,
  buildWebManifest,
  generateStoreIconPng,
  sha256Hex,
} from "./pwa.js";

export { escapeAttribute, escapeHtml, escapeXml, jsonForScript };
export { runLighthouseLite } from "./lighthouse-lite.js";
export { sha256Hex } from "./pwa.js";

function formatMoney(amount: number, project: StoreProjectV1): string {
  return formatPrice(amount, {
    currency: project.currency,
    locale: project.locale,
    priceFractionDisplay: project.priceFractionDisplay,
  });
}

import {
  absoluteResourceUrl,
  absoluteUrl,
  assetHref,
  baseUrlPathname,
  normalizeBaseUrl,
  prefixDocumentHrefs,
  resourceHref,
} from "./urls.js";

export {
  absoluteResourceUrl,
  absoluteUrl,
  assetHref,
  baseUrlPathname,
  normalizeBaseUrl,
  prefixDocumentHrefs,
  resourceHref,
};

export type {
  MediaUsage,
  RecoveryAssetRef,
  RecoveryManifest,
  RecoveryMissing,
  SlimResult,
} from "./recovery.js";
export {
  buildRecoveryAssetRefs,
  newRecoveryDir,
  parseRecoveryManifest,
  RECOVERY_ASSETS_NAME,
  RECOVERY_MANIFEST_NAME,
  RECOVERY_MAX_BYTES,
  RECOVERY_ROOT,
  RECOVERY_SLIM_NAME,
  REF_PREFIX,
  recoveryFileList,
  restoreAssetSources,
  splitSlimProject,
} from "./recovery.js";

import { buildWhatsAppLink, interpolatePublicCopy, publicWhatsAppPhone } from "./whatsapp.js";

export { buildWhatsAppLink, interpolatePublicCopy, publicWhatsAppPhone };

import {
  assetExtension,
  imageExtensionFromSource,
  imageFor,
  imageMimeTypeFromBytes,
  imageMimeTypeFromSource,
  imageUrl,
  mimeTypeExtension,
  normalizeDataUrlMimeType,
  parseDataUrl,
  productImagePaths,
  resolveSocialImage,
  type SocialImageCrop,
  type SocialImageResolutionOptions,
  socialImageCompatibility,
  socialImageCompatibilityByAssetId,
  socialOgImagePath,
  videoFor,
  videoUrl,
} from "./assets.js";
import {
  breadcrumbData,
  itemListData,
  itemListFromSnapshots,
  productStructuredData,
  storeStructuredData,
} from "./structured-data.js";

export {
  assetExtension,
  imageExtensionFromSource,
  imageFor,
  imageUrl,
  imageMimeTypeFromBytes,
  imageMimeTypeFromSource,
  mimeTypeExtension,
  normalizeDataUrlMimeType,
  parseDataUrl,
  productImagePaths,
  socialImageCompatibility,
  socialImageCompatibilityByAssetId,
  resolveSocialImage,
  socialOgImagePath,
  type SocialImageCrop,
  videoFor,
  videoUrl,
};
export { breadcrumbData, productStructuredData, storeStructuredData };

import { auditProject, auditReport } from "./audit.js";
import { buildCfWorkerSource } from "./cf-worker.js";
import {
  buildCatalogIndex,
  buildImageSitemap,
  buildMerchantFeed,
  buildSearchIndex,
  buildSitemap,
  buildVideoSitemap,
} from "./feeds.js";
import { merchantItemGroupIdMap } from "./merchant.js";

export { auditProject, auditReport };
export {
  MERCHANT_ITEM_GROUP_ID_MAX_LENGTH,
  merchantIdMap,
  merchantItemGroupIdMap,
  normalizeMerchantId,
  normalizeMerchantItemGroupId,
} from "./merchant.js";

function offerAvailability(variant: Variant): CommerceOfferSnapshot["availability"] {
  return variant.stockStatus;
}

export function buildCommerceSnapshot(project: StoreProjectV1): CommerceSnapshot {
  const itemGroupIds = merchantItemGroupIdMap(
    project.products.filter((product) => product.status === "active").map((product) => product.id),
  );
  const baseImagePaths = new Map<string, readonly string[]>();
  const productImages = (product: Product): readonly string[] => {
    const cached = baseImagePaths.get(product.id);
    if (cached) return cached;
    const paths = productImagePaths(project, product);
    baseImagePaths.set(product.id, paths);
    return paths;
  };
  const variantImages = (product: Product, variant: Variant): readonly string[] => {
    if (!variant.imageId) return productImages(product);
    const variantImage = imageUrl(project, variant.imageId);
    if (!variantImage) return productImages(product);
    return [...new Set([variantImage, ...productImages(product)])];
  };
  const products = project.products
    .filter((product) => product.status === "active")
    .map((product) => {
      const canonicalPath = `/productos/${product.slug}/`;
      const productImagePathsForProduct = productImages(product);
      const offers = product.variants.map(
        (variant) =>
          ({
            productId: product.id,
            variantId: variant.id,
            itemGroupId: itemGroupIds.get(product.id) ?? product.id,
            itemGroupTitle: product.title,
            canonicalPath,
            variantPath: `${canonicalPath}?variant=${encodeURIComponent(variant.id)}`,
            title: `${product.title} - ${variant.title}`,
            description: product.description,
            brand: product.brand,
            sku: variant.sku,
            ...(variant.gtin ? { gtin: variant.gtin } : {}),
            ...(variant.mpn ? { mpn: variant.mpn } : {}),
            priceMinor: variant.price,
            ...(variant.compareAtPrice !== undefined
              ? { compareAtPriceMinor: variant.compareAtPrice }
              : {}),
            currency: project.currency,
            availability: offerAvailability(variant),
            ...(variant.availabilityDate ? { availabilityDate: variant.availabilityDate } : {}),
            imageUrls: variantImages(product, variant).map((url) =>
              absoluteResourceUrl(project, url),
            ),
          }) satisfies CommerceOfferSnapshot,
      );
      return {
        productId: product.id,
        canonicalPath,
        title: product.title,
        imageUrls: productImagePathsForProduct.map((url) => absoluteResourceUrl(project, url)),
        offers,
      } satisfies CommerceProductSnapshot;
    });

  return {
    baseUrl: normalizeBaseUrl(project.baseUrl),
    updatedAt: project.updatedAt,
    products,
    offers: products.flatMap((product) => product.offers),
  };
}

function sourceExtension(source: string, fallback: string): string {
  return imageExtensionFromSource(source, fallback) ?? fallback;
}

export function dataUrlBytes(source: string): Uint8Array | undefined {
  return parseDataUrl(source)?.bytes;
}

function faviconSourcesForProject(project: StoreProjectV1): {
  ico?: Uint8Array;
  png?: Uint8Array;
} {
  const asset = project.assets.find((candidate) => candidate.id === project.seo.faviconAssetId);
  if (!asset) return {};
  let png: Uint8Array | undefined;
  const sources = [asset.source, asset.fallbackSource].filter(
    (source): source is string => typeof source === "string" && source.length > 0,
  );
  for (const source of sources) {
    const bytes = dataUrlBytes(source);
    const mimeType = imageMimeTypeFromBytes(bytes);
    if (mimeType === "image/x-icon" && bytes) return { ico: bytes };
    if (mimeType === "image/png" && bytes && !png) png = bytes;
  }
  return png ? { png } : {};
}

function faviconIcoForProject(project: StoreProjectV1): Uint8Array {
  const sources = faviconSourcesForProject(project);
  const favicon = sources.ico ?? buildFaviconIco(project.identity.brandName, sources.png);
  if (!isValidIco(favicon)) {
    throw new Error("El renderer no pudo construir un favicon.ico ICO válido.");
  }
  return favicon;
}

function assertExportedFavicon(files: ReadonlyMap<string, string | Uint8Array>): void {
  const favicon = files.get("favicon.ico");
  if (!(favicon instanceof Uint8Array) || !isValidIco(favicon)) {
    throw new Error("La exportación no produjo un favicon.ico ICO válido.");
  }
}

function publicAssetPath(
  asset: ImageAsset,
  kind: "primary" | "fallback",
  source: string,
  width?: number,
  semanticNames = false,
): string {
  const suffix = width ? `-${width}` : kind === "fallback" ? "-fallback" : "";
  const extension = sourceExtension(source, assetExtension(asset));
  if (!semanticNames) return `/assets/${asset.hash}${suffix}.${extension}`;
  const slug = (asset.alt || asset.name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const baseName = slug || asset.hash.slice(0, 12);
  return `/assets/${baseName}-${asset.hash.slice(0, 8)}${suffix}.${extension}`;
}

/**
 * Mapa canónico asset/video → archivo del sitio con sus bytes exactos.
 *
 * Es la única fuente que la bóveda de recuperación usa para rehidratar:
 * replica las mismas decisiones que `buildFiles` (primario vs `favicon.ico`
 * dedicado, fórmula de videos, skip de sources http). Sin entrada = sin
 * archivo (las sources http se conservan tal cual porque no pesan).
 *
 * `favicon.ico` siempre guarda los bytes del favicon cuando es x-icon
 * (ver emisión en `buildFiles`), así que mapearlo ahí es correcto haya o no
 * primario dedicado. Solo entran IDs del conjunto `used` (misma instancia que
 * `buildFiles` calcula): cada entrada existe sí o sí en el sitio exportado.
 */
export function publicAssetPaths(
  project: StoreProjectV1,
  used: { assetIds: ReadonlySet<string>; videoIds: ReadonlySet<string> },
  semanticNames = false,
): Map<string, string> {
  const paths = new Map<string, string>();
  const faviconAsset = project.assets.find((asset) => asset.id === project.seo.faviconAssetId);
  const faviconBytes = faviconAsset ? dataUrlBytes(faviconAsset.source) : undefined;
  const faviconIsCustomIco =
    !!faviconBytes && imageMimeTypeFromBytes(faviconBytes) === "image/x-icon";
  for (const asset of project.assets) {
    if (!used.assetIds.has(asset.id) || !/^data:/i.test(asset.source)) continue;
    const bytes = dataUrlBytes(asset.source);
    if (!bytes) {
      throw new Error(`El asset ${asset.id} contiene una data URL inválida.`);
    }
    if (faviconIsCustomIco && faviconAsset && asset.id === faviconAsset.id) {
      paths.set(asset.id, "favicon.ico");
      continue;
    }
    paths.set(
      asset.id,
      publicAssetPath(asset, "primary", asset.source, undefined, semanticNames).slice(1),
    );
  }
  for (const video of project.videos) {
    if (!used.videoIds.has(video.id) || !/^data:/i.test(video.source)) continue;
    const bytes = dataUrlBytes(video.source);
    if (!bytes || bytes.length === 0) {
      throw new Error(`El video ${video.id} contiene una data URL inválida.`);
    }
    paths.set(video.id, `assets/${video.hash}.${assetExtension(video)}`);
  }
  return paths;
}

function responsiveSourcesForAsset(asset: ImageAsset): ImageAsset["responsiveSources"] {
  if (
    imageMimeTypeFromSource(asset.source, asset.mimeType) === "image/x-icon" ||
    !asset.responsiveSources
  ) {
    return asset.responsiveSources;
  }
  return compactResponsiveSources(asset.responsiveSources, asset.width, {
    width: asset.width,
    source: asset.source,
  });
}

function projectWithPublicAssetUrls(
  project: StoreProjectV1,
  semanticNames = false,
  socialImageOptions: SocialImageResolutionOptions = {},
  mediaUsage?: PublicMediaUsage,
): StoreProjectV1 {
  const whatsAppPhone = publicWhatsAppPhone(project);
  const allowedAssetIds = (mediaUsage ?? publicMediaUsage(project, socialImageOptions)).assetIds;
  const resolverOptions = { ...socialImageOptions, allowedAssetIds };
  const expectedSocial = resolveSocialImage(project, undefined, resolverOptions);
  const publicProject = {
    ...project,
    whatsapp: {
      ...project.whatsapp,
      phone: whatsAppPhone,
    },
    assets: project.assets.map((asset) => {
      const effectiveMimeType =
        imageMimeTypeFromSource(asset.source, asset.mimeType) ?? asset.mimeType;
      const publicPrimarySource = /^data:/i.test(asset.source)
        ? publicAssetPath(asset, "primary", asset.source, undefined, semanticNames)
        : asset.source;
      const responsiveSources = responsiveSourcesForAsset(asset);
      return {
        ...asset,
        mimeType: effectiveMimeType,
        source: publicPrimarySource,
        ...(asset.fallbackSource
          ? {
              fallbackSource: /^data:/i.test(asset.fallbackSource)
                ? publicAssetPath(asset, "fallback", asset.fallbackSource, undefined, semanticNames)
                : asset.fallbackSource,
            }
          : {}),
        ...(responsiveSources
          ? {
              responsiveSources: responsiveSources.map((source) => ({
                ...source,
                source: /^data:/i.test(source.source)
                  ? source.source === asset.source
                    ? publicPrimarySource
                    : publicAssetPath(asset, "primary", source.source, source.width, semanticNames)
                  : source.source,
              })),
            }
          : {}),
      };
    }),
    videos: project.videos.map((video) => ({
      ...video,
      source: /^data:/i.test(video.source)
        ? `/assets/${video.hash}.${assetExtension(video)}`
        : video.source,
    })),
  };
  const publicSocial = resolveSocialImage(publicProject, undefined, resolverOptions);
  if (expectedSocial.status === "resolved" && publicSocial.status !== "resolved") {
    throw new Error("La portada social se perdió al convertir los assets a rutas públicas.");
  }
  return publicProject;
}

const PREVIEW_ASSET_PREFIX = "/__solara-preview-assets/";

interface PreviewAssetBundle {
  project: StoreProjectV1;
  sources: ReadonlyMap<string, string>;
}

function createPreviewAssetBundle(project: StoreProjectV1): PreviewAssetBundle {
  const sources = new Map<string, string>();
  const addSource = (asset: ImageAsset | VideoAsset, source: string, suffix = ""): string => {
    if (!/^data:/i.test(source)) return source;
    const normalizedSource = asset.kind === "image" ? normalizeDataUrlMimeType(source) : source;
    const extension =
      asset.kind === "image"
        ? (imageExtensionFromSource(source, assetExtension(asset)) ?? assetExtension(asset))
        : assetExtension(asset);
    const path = `${PREVIEW_ASSET_PREFIX}${asset.hash}${suffix}.${extension}`;
    const previous = sources.get(path);
    if (previous !== undefined && previous !== normalizedSource) {
      throw new Error(`Dos assets distintos intentan ocupar la misma ruta de preview: ${path}`);
    }
    sources.set(path, normalizedSource);
    return path;
  };

  return {
    project: {
      ...project,
      assets: project.assets.map((asset) => {
        const primarySource = addSource(asset, asset.source);
        const responsiveSources = responsiveSourcesForAsset(asset);
        return {
          ...asset,
          source: primarySource,
          ...(asset.fallbackSource
            ? { fallbackSource: addSource(asset, asset.fallbackSource, "-fallback") }
            : {}),
          ...(responsiveSources
            ? {
                responsiveSources: responsiveSources.map((responsive) => ({
                  ...responsive,
                  source:
                    responsive.source === asset.source
                      ? primarySource
                      : addSource(asset, responsive.source, `-${responsive.width}`),
                })),
              }
            : {}),
        };
      }),
      videos: project.videos.map((video) => ({
        ...video,
        source: addSource(video, video.source),
      })),
    },
    sources,
  };
}

function previewAssetMarkup(
  sources: ReadonlyMap<string, string>,
  transport: "inline" | "parent" = "inline",
): string {
  if (transport === "parent") {
    const paths = JSON.stringify([...sources.keys()]);
    return `<script>
(() => {
  const paths = ${paths};
  const hydrateFavicon = () => {
    document.querySelectorAll("[data-solara-preview-favicon]").forEach((element) => {
      const source = element.getAttribute("data-solara-preview-favicon");
      if (source) element.setAttribute("href", source);
    });
  };
  const receivedSources = new Map();
  const objectUrls = new Map();
  const requestedPaths = new Set(paths);
  const hydratedImages = new WeakSet();
  const requestMissing = (values) => {
    const missing = [...new Set(values)].filter((value) => value && !requestedPaths.has(value));
    if (missing.length === 0) return;
    missing.forEach((value) => requestedPaths.add(value));
    window.parent.postMessage({ type: "solara-preview-assets-request", paths: missing }, "*");
  };
  const sourceFor = async (value) => {
    const source = receivedSources.get(value);
    if (!source) return "";
    const cached = objectUrls.get(value);
    if (cached) return cached;
    try {
      const response = await fetch(source);
      const objectUrl = URL.createObjectURL(await response.blob());
      objectUrls.set(value, objectUrl);
      return objectUrl;
    } catch {
      objectUrls.set(value, source);
      return source;
    }
  };
  const hydrateImage = (element) => {
    // Preview images use object URLs and must not wait for an iframe scroll
    // before decoding. Public exports keep their native lazy-loading policy.
    if (element.tagName === "IMG") {
      element.setAttribute("loading", "eager");
      element.setAttribute("fetchpriority", "high");
    }
  };
  const previewPathFor = (element) => {
    const deferred = element.getAttribute("data-solara-preview-src");
    if (deferred) return deferred;
    const source = element.getAttribute("src") || "";
    return source.startsWith("/__solara-preview-assets/") ? source : "";
  };
  const hydrateDynamicImage = async (element) => {
    const path = previewPathFor(element);
    if (!path || hydratedImages.has(element)) return;
    if (!receivedSources.has(path)) {
      requestMissing([path]);
      return;
    }
    const source = await sourceFor(path);
    if (!source) return;
    hydratedImages.add(element);
    hydrateImage(element);
    element.setAttribute("src", source);
  };
  const observeDynamicImages = () => {
    if (!("MutationObserver" in window) || !document.documentElement) return;
    const scan = (node) => {
      if (!(node instanceof Element)) return;
      if (node.tagName === "IMG") void hydrateDynamicImage(node);
      node.querySelectorAll("img").forEach((element) => void hydrateDynamicImage(element));
    };
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(scan);
        } else if (mutation.target instanceof HTMLImageElement) {
          void hydrateDynamicImage(mutation.target);
        }
      });
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "data-solara-preview-src"],
    });
  };
  const hydrate = async (sources) => {
    Object.entries(sources || {}).forEach(([path, source]) => {
      if (typeof source === "string" && source) receivedSources.set(path, source);
    });
    document.querySelectorAll("img").forEach(hydrateImage);
    await Promise.all([...receivedSources.keys()].map((value) => sourceFor(value)));
    await Promise.all([...document.querySelectorAll("[data-solara-preview-src]")].map(async (element) => {
      const source = await sourceFor(element.getAttribute("data-solara-preview-src") || "");
      if (source) {
        hydrateImage(element);
        element.setAttribute("src", source);
        hydratedImages.add(element);
      }
    }));
    await Promise.all([...document.querySelectorAll("img")].map(hydrateDynamicImage));
    await Promise.all([...document.querySelectorAll("[data-solara-preview-srcset]")].map(async (element) => {
      const srcset = element.getAttribute("data-solara-preview-srcset") || "";
      const entries = srcset.split(",");
      const hydrated = await Promise.all(entries.map(async (entry) => {
        const parts = entry.trim().split(/\\s+/);
        const source = await sourceFor(parts.shift() || "");
        return source ? [source, ...parts].join(" ") : entry;
      }));
      if (hydrated.length > 0) element.setAttribute("srcset", hydrated.join(","));
    }));
    await Promise.all([...document.querySelectorAll("[data-solara-preview-poster]")].map(async (element) => {
      const source = await sourceFor(element.getAttribute("data-solara-preview-poster") || "");
      if (source) element.setAttribute("poster", source);
    }));
  };
  observeDynamicImages();
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "solara-preview-assets-response") return;
    void hydrate(event.data.sources || {});
  });
  hydrateFavicon();
  window.parent.postMessage({ type: "solara-preview-assets-request", paths }, "*");
})();
</script>`;
  }
  if (sources.size === 0) return "";
  const serialized = jsonForScript(Object.fromEntries(sources));
  return `<script type="application/json" id="solara-preview-assets">${serialized}</script>
<script>
 (async () => {
  document.querySelectorAll("[data-solara-preview-favicon]").forEach((element) => {
    const source = element.getAttribute("data-solara-preview-favicon");
    if (source) element.setAttribute("href", source);
  });
  const payload = document.getElementById("solara-preview-assets");
  if (!payload) return;
  try {
    const sources = JSON.parse(payload.textContent || "{}");
    const objectUrls = new Map();
    const sourceFor = async (value) => {
      const source = sources[value];
      if (!source) return "";
      const cached = objectUrls.get(value);
      if (cached) return cached;
      try {
        const response = await fetch(source);
        const objectUrl = URL.createObjectURL(await response.blob());
        objectUrls.set(value, objectUrl);
        return objectUrl;
      } catch {
        objectUrls.set(value, source);
        return source;
      }
    };
    document.querySelectorAll("img").forEach((element) => {
      element.setAttribute("loading", "eager");
      element.setAttribute("fetchpriority", "high");
    });
    const values = [...new Set(Object.keys(sources))];
    await Promise.all(values.map(async (value) => sourceFor(value)));
    document.querySelectorAll("[data-solara-preview-src]").forEach((element) => {
      const source = objectUrls.get(element.getAttribute("data-solara-preview-src") || "");
      if (source) {
        element.setAttribute("loading", "eager");
        element.setAttribute("src", source);
      }
    });
    document.querySelectorAll("[data-solara-preview-srcset]").forEach((element) => {
      const srcset = element.getAttribute("data-solara-preview-srcset") || "";
      const hydrated = srcset
        .split(",")
        .map((entry) => {
          const parts = entry.trim().split(/\\s+/);
          const source = objectUrls.get(parts.shift() || "");
          return source ? [source, ...parts].join(" ") : entry;
        })
        .join(",");
      element.setAttribute("srcset", hydrated);
    });
    document.querySelectorAll("[data-solara-preview-poster]").forEach((element) => {
      const source = objectUrls.get(element.getAttribute("data-solara-preview-poster") || "");
      if (source) element.setAttribute("poster", source);
    });
    payload.remove();
  } catch {
    // A preview asset must never prevent the storefront from rendering.
  }
})();
</script>`;
}

function deferPreviewAssetMarkup(document: string, sources: ReadonlyMap<string, string>): string {
  if (sources.size === 0) return document;
  const isPreviewPath = (value: string): boolean => sources.has(value);
  const deferAttribute = (html: string, attribute: "src" | "poster"): string =>
    html.replace(new RegExp(`\\s${attribute}="([^"]+)"`, "g"), (match, value: string) =>
      isPreviewPath(value) ? ` data-solara-preview-${attribute}="${value}"` : match,
    );
  let deferred = deferAttribute(deferAttribute(document, "src"), "poster");
  deferred = deferred.replace(/\ssrcset="([^"]+)"/g, (match, value: string) =>
    value.split(",").some((entry: string) => isPreviewPath(entry.trim().split(/\s+/)[0] ?? ""))
      ? ` data-solara-preview-srcset="${value}"`
      : match,
  );
  return deferred;
}

const themeCssCache = new Map<string, string>();

function themeCss(
  project: StoreProjectV1,
  transport: FontTransport = "file",
  fontPathOverrides?: ReadonlyMap<string, string>,
): string {
  const cacheKeyParts = [
    transport,
    JSON.stringify(project.theme),
    [...(fontPathOverrides?.entries() ?? [])].map(([k, v]) => `${k}=${v}`).join(","),
  ];
  const backgroundAsset = project.theme.background
    ? project.assets.find((asset) => asset.id === project.theme.background?.imageAssetId)
    : undefined;
  // La URL del fondo depende de los bytes del asset: sin su hash, un cambio de
  // imagen con el mismo tema serviría CSS con la URL anterior.
  if (backgroundAsset) cacheKeyParts.push(`bg=${backgroundAsset.hash}`);
  const cacheKey = cacheKeyParts.join("|");
  const cached = themeCssCache.get(cacheKey);
  if (cached) return cached;
  const t = project.theme;
  const { colors, typography, spacingScale, radius, container } = t;

  const lhTight = typography.lineHeightTight ?? 1.15;
  const lhBody = typography.lineHeightBody ?? 1.6;
  const lsDisplay = typography.letterSpacingDisplay ?? "-0.02em";
  const fwDisplay = typography.fontWeightDisplay ?? 500;
  const fwBody = typography.fontWeightBody ?? 400;
  const sectionY = t.spacing?.sectionY ?? "clamp(3rem, 6vw, 6rem)";
  const cardGap = t.spacing?.cardGap ?? "clamp(1rem, 2vw, 2rem)";
  const padX = t.spacing?.containerPaddingX ?? "1rem";
  const shadowCard =
    t.shadows?.card ?? "0 18px 36px color-mix(in srgb, var(--solara-text), transparent 86%)";
  const shadowElevated =
    t.shadows?.elevated ?? "0 14px 30px color-mix(in srgb, var(--solara-text), transparent 82%)";
  const shadowOverlay =
    t.shadows?.overlay ?? "0 24px 70px color-mix(in srgb, var(--solara-text), transparent 86%)";
  const borderWidth = t.borders?.width ?? "1px";
  const borderStyle = t.borders?.style ?? "solid";
  const motionFast = t.motion?.durationFast ?? "150ms";
  const motionNormal = t.motion?.durationNormal ?? "280ms";
  const motionEasing = t.motion?.easing ?? "cubic-bezier(.16,1,.3,1)";
  const saleColor = colors.sale ?? "#d94a55";
  const ratingColor = colors.rating ?? "#d99a12";
  const accentAltColor =
    colors.accentAlt ?? `color-mix(in srgb, ${colors.accent} 68%, ${colors.background})`;
  const textShadowColorValue = deriveThemeTextShadowColor(colors);
  const v2TextShadowColorValue = deriveThemeTextShadowColor(colors, colors.background);
  const textShadowOpacity = t.shadows?.text?.opacity ?? DEFAULT_THEME_TEXT_SHADOW_OPACITY;
  const textShadowOffsetX = t.shadows?.text?.offsetX ?? DEFAULT_THEME_TEXT_SHADOW_OFFSET_X;
  const textShadowOffsetY = t.shadows?.text?.offsetY ?? DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y;
  const textShadowBlur = t.shadows?.text?.blur ?? DEFAULT_THEME_TEXT_SHADOW_BLUR;
  const heroTextShadow =
    t.shadows?.text?.enabled === false
      ? "none"
      : `${textShadowOffsetX}px ${textShadowOffsetY}px ${textShadowBlur}px color-mix(in srgb, var(--solara-text-shadow) ${Math.round(textShadowOpacity * 100)}%, transparent)`;
  const v2HeroTextShadow =
    t.shadows?.text?.enabled === false
      ? "none"
      : `${textShadowOffsetX}px ${textShadowOffsetY}px ${textShadowBlur}px color-mix(in srgb, ${v2TextShadowColorValue} ${Math.round(textShadowOpacity * 100)}%, transparent)`;
  // Fondo con imagen por tienda: el color sigue como base y la imagen repite
  // encima. En export `source` ya es la ruta pública; en preview es data URI.
  // La raíz [data-solara-store] pinta el color plano (y cada familia repite
  // con (0,2,0), ej. [data-solara-store].catalog-modern): se transparenta con
  // (0,2,2) y solo cuando hay imagen (el html conserva el color debajo).
  // La raíz siempre es div.solara-page[data-solara-store] en toda familia.
  const backgroundOverlay =
    t.background && t.background.opacity < 1
      ? `linear-gradient(color-mix(in srgb,var(--solara-background) ${Math.round((1 - t.background.opacity) * 100)}%,transparent),color-mix(in srgb,var(--solara-background) ${Math.round((1 - t.background.opacity) * 100)}%,transparent)),`
      : "";
  const backgroundCss =
    t.background && backgroundAsset
      ? `\nbody{background-image:${backgroundOverlay}url("${backgroundAsset.source.replace(/"/g, "%22")}");background-repeat:${backgroundOverlay ? "no-repeat," : ""}${t.background.repeat};background-size:${backgroundOverlay ? "auto," : ""}${t.background.size};}\nhtml body [data-solara-store].solara-page{background-color:transparent}`
      : "";

  const result = `
:root {
  color-scheme: light;
  --solara-background: ${colors.background};
  --solara-surface: ${colors.surface};
  --solara-text: ${colors.text};
  --solara-muted: ${colors.muted};
  --solara-accent: ${colors.accent};
  --solara-accent-text: ${colors.accentText};
  --solara-border: ${colors.border};
  --solara-sale: ${saleColor};
  --solara-rating: ${ratingColor};
  --solara-accent-alt: ${accentAltColor};
  --solara-text-shadow: ${textShadowColorValue};
  --solara-hero-text-shadow: ${heroTextShadow};
  --solara-hero-text-shadow-v2: ${v2HeroTextShadow};
  --solara-font-display: ${typography.display};
  --solara-font-body: ${typography.body};
  --solara-type-scale: ${typography.scale};
  --solara-line-height-tight: ${lhTight};
  --solara-line-height-body: ${lhBody};
  --solara-letter-spacing-display: ${lsDisplay};
  --solara-font-weight-display: ${fwDisplay};
  --solara-font-weight-body: ${fwBody};
  --solara-space-scale: ${spacingScale};
  --solara-section-y: ${sectionY};
  --solara-card-gap: ${cardGap};
  --solara-padding-x: ${padX};
  --solara-radius: ${radius}px;
  --solara-container: ${container}px;
  --solara-chrome-height: 116px;
  --solara-border-width: ${borderWidth};
  --solara-border-style: ${borderStyle};
  --solara-shadow-card: ${shadowCard};
  --solara-shadow-elevated: ${shadowElevated};
  --solara-shadow-overlay: ${shadowOverlay};
  --solara-motion-fast: ${motionFast};
  --solara-motion-normal: ${motionNormal};
  --solara-motion-easing: ${motionEasing};
}

* { box-sizing: border-box; }
html { background: var(--solara-background); color: var(--solara-text); }
body { margin: 0; min-width: 0; font-family: var(--solara-font-body); line-height: var(--solara-line-height-body); }${backgroundCss}
${fontCssFor(typography.display, typography.body, transport, fontPathOverrides)}
img { display: block; max-width: 100%; height: auto; }
a { color: inherit; }
button, input, select, textarea { font: inherit; }
button, input, select, textarea, a { outline-offset: 3px; }
:focus-visible { outline: 2px solid var(--solara-accent); }
.solara-page { min-height: 100dvh; overflow: clip; }
.solara-container { width: min(calc(100% - 2 * var(--solara-padding-x)), var(--solara-container)); margin-inline: auto; padding-inline: var(--solara-padding-x); }
`.trim();
  themeCssCache.set(cacheKey, result);
  if (themeCssCache.size > 64) {
    const firstKey = themeCssCache.keys().next().value;
    if (firstKey) themeCssCache.delete(firstKey);
  }
  return result;
}

/** Remove CSS transport whitespace while preserving quoted content and calc spacing. */
export function minifyCss(value: string): string {
  const quoted: string[] = [];
  const protectedValue = value.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, (match) => {
    const token = `__SOLARA_CSS_STRING_${quoted.length}__`;
    quoted.push(match);
    return token;
  });
  let minified = protectedValue
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    // El `+` queda fuera: en calc() requiere espacios a ambos lados y
    // quitarlos vuelve inválida la declaración (el navegador la descarta).
    .replace(/\s*([{};,:>~])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  quoted.forEach((match, index) => {
    minified = minified.replace(`__SOLARA_CSS_STRING_${index}__`, match);
  });
  return minified;
}

function shellSectionEnabled(project: StoreProjectV1, section: StoreSection): boolean {
  if (section.slot === "announcement") return project.siteShell.announcement;
  if (section.slot === "header") return project.siteShell.header;
  if (section.slot === "footer") return project.siteShell.footer;
  if (section.slot === "cart") return project.siteShell.cart;
  return true;
}

function activeProjectSections(
  project: StoreProjectV1,
  sections: readonly StoreSection[],
): StoreSection[] {
  return sections.filter((section) => shellSectionEnabled(project, section));
}

function isModernProject(project: StoreProjectV1): boolean {
  return (
    project.commerceTemplates.designFamily === "catalog-modern-v1" ||
    project.commerceTemplates.designFamily === "catalog-modern-v2"
  );
}

function isPublishedEditablePage(
  _project: StoreProjectV1,
  page: StoreProjectV1["pages"][number],
): boolean {
  return page.kind === "home";
}

function modernProjectClass(project: StoreProjectV1): string {
  if (!isModernProject(project)) return "";
  return project.commerceTemplates.designFamily === "catalog-modern-v2"
    ? " catalog-modern catalog-modern-v2 cm v2"
    : " catalog-modern";
}

export function publicMediaUsage(
  project: StoreProjectV1,
  socialImageOptions: SocialImageResolutionOptions = {},
): {
  assetIds: Set<string>;
  videoIds: Set<string>;
} {
  const assetIds = new Set<string>();
  const videoIds = new Set<string>();
  const knownAssetIds = new Set<string>(project.assets.map((asset) => asset.id));
  const knownVideoIds = new Set<string>(project.videos.map((video) => video.id));
  const addValue = (value: unknown): void => {
    if (typeof value !== "string") return;
    if (knownAssetIds.has(value)) assetIds.add(value);
    if (knownVideoIds.has(value)) videoIds.add(value);
  };
  addValue(project.identity.logoAssetId);
  addValue(project.seo.faviconAssetId);
  if (project.theme.background) addValue(project.theme.background.imageAssetId);
  project.products
    .filter((product) => product.status === "active")
    .forEach((product) => {
      product.imageIds.forEach(addValue);
      (product.videoIds ?? []).forEach(addValue);
      product.variants.forEach((variant) => {
        addValue(variant.imageId);
      });
    });
  project.categories
    .filter((category) => category.status !== "hidden")
    .forEach((category) => {
      addValue(category.imageId);
    });
  project.collections
    .filter((collection) => collection.status !== "hidden")
    .forEach((collection) => {
      addValue(collection.imageId);
    });
  const sections = [
    ...project.sections,
    ...project.pages
      .filter((page) => isPublishedEditablePage(project, page))
      .flatMap((page) => page.sections),
  ];
  sections
    .filter((section) => section.enabled && shellSectionEnabled(project, section))
    .forEach((section) => {
      if (section.settings.enabled === false) return;
      const definition = getModuleDefinition(section.moduleId);
      if (!definition) return;
      const mode = section.settings.mode;
      const isHero = section.moduleId === "hero-media" || section.moduleId === "catalog-hero";
      const scanField = (fieldKey: string): boolean => {
        if (isHero && fieldKey === "videoAssetId" && mode !== "video") return false;
        if (isHero && fieldKey === "slides" && mode !== "carousel") return false;
        if (
          section.moduleId === "catalog-hero" &&
          project.commerceTemplates.designFamily === "catalog-modern-v2" &&
          mode !== "carousel" &&
          fieldKey === "backgroundImageId"
        ) {
          return false;
        }
        return true;
      };
      for (const field of definition.settingsFields) {
        if (!scanField(field.key)) continue;
        if (field.type === "asset") {
          addValue(section.settings[field.key]);
          continue;
        }
        if (field.type === "array") {
          const items = section.settings[field.key];
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (typeof item !== "object" || item === null) continue;
            Object.values(item).forEach(addValue);
          }
          continue;
        }
        if (field.type !== "repeater") continue;
        const items = section.settings[field.key];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (typeof item !== "object" || item === null) continue;
          for (const itemField of field.fields) {
            if (itemField.type === "asset") {
              addValue((item as Record<string, unknown>)[itemField.key]);
            }
          }
        }
      }
    });

  project.videos.forEach((video) => {
    if (videoIds.has(video.id)) addValue(video.posterAssetId);
  });
  const socialAsset = resolveSocialImage(project, undefined, {
    ...socialImageOptions,
    allowedAssetIds: assetIds,
  }).asset;
  if (socialAsset) assetIds.add(socialAsset.id);
  return { assetIds, videoIds };
}

const SOCIAL_IMAGE_MIN_WIDTH = 1200;
const SOCIAL_IMAGE_MIN_HEIGHT = 630;

export interface SocialCropRequest {
  assetId: string;
  source: string;
  width: number;
  height: number;
}

export function collectSocialCropRequests(
  project: StoreProjectV1,
  socialImageOptions: SocialImageResolutionOptions = {},
): SocialCropRequest[] {
  const options = {
    compatibilityByAssetId: socialImageCompatibilityByAssetId(project),
    ...socialImageOptions,
  };
  const requests = new Map<string, SocialCropRequest>();
  const pushAsset = (asset: ImageAsset | undefined): void => {
    if (!asset || requests.has(asset.id)) return;
    if (imageMimeTypeFromSource(asset.source, asset.mimeType) === "image/x-icon") return;
    const source = /^data:/i.test(asset.source)
      ? asset.source
      : /^data:/i.test(asset.fallbackSource ?? "")
        ? (asset.fallbackSource ?? "")
        : "";
    if (!source) return;
    if (asset.width < SOCIAL_IMAGE_MIN_WIDTH || asset.height < SOCIAL_IMAGE_MIN_HEIGHT) return;
    requests.set(asset.id, { assetId: asset.id, source, width: asset.width, height: asset.height });
  };
  pushAsset(resolveSocialImage(project, undefined, options).asset);
  for (const category of project.categories) {
    if (category.status === "hidden") continue;
    pushAsset(imageFor(project, category.imageId));
  }
  for (const collection of project.collections) {
    if (collection.status === "hidden") continue;
    pushAsset(imageFor(project, collection.imageId));
  }
  for (const product of project.products) {
    if (product.status !== "active") continue;
    pushAsset(imageFor(project, product.imageIds[0]));
  }
  return [...requests.values()];
}

/**
 * Resolve the public export graph once so every derived file uses the same
 * page/module/media decisions. This is intentionally not persisted.
 */
export function createPublicExportManifest(
  project: StoreProjectV1,
  pages?: readonly PageDescriptor[],
  socialImageOptions: SocialImageResolutionOptions = {},
): PublicExportManifest {
  const media = publicMediaUsage(project, socialImageOptions);
  const resolvedPages =
    pages ??
    buildPages(project, undefined, {
      socialImageOptions,
      mediaUsage: media,
    });
  return createPublicExportManifestWithMedia(project, resolvedPages, socialImageOptions, media);
}

function createPublicExportManifestWithMedia(
  project: StoreProjectV1,
  pages: readonly PageDescriptor[],
  socialImageOptions: SocialImageResolutionOptions,
  baseMedia: PublicMediaUsage,
): PublicExportManifest {
  const sections = activeProjectSections(project, [
    ...project.sections,
    ...project.pages
      .filter((page) => isPublishedEditablePage(project, page))
      .flatMap((page) => page.sections),
  ]);
  const activeModules = [...new Set(sections.map((section) => section.moduleId))].sort();
  const media: PublicMediaUsage = {
    assetIds: new Set(baseMedia.assetIds),
    videoIds: new Set(baseMedia.videoIds),
  };
  pages.forEach((page) => {
    const preloadAsset = page.preloadImage
      ? project.assets.find((asset) =>
          [asset.source, asset.fallbackSource, imageUrl(project, asset.id)]
            .filter((value): value is string => Boolean(value))
            .includes(page.preloadImage as string),
        )
      : undefined;
    if (preloadAsset) media.assetIds.add(preloadAsset.id);
    const socialAsset = resolveSocialImage(project, page.image, {
      ...socialImageOptions,
      allowedAssetIds: media.assetIds,
    }).asset;
    if (socialAsset) media.assetIds.add(socialAsset.id);
  });
  const runtimeFeatures = new Set<string>();

  if (project.siteShell.header && activeModules.some((moduleId) => moduleId.includes("header"))) {
    runtimeFeatures.add("header");
  }
  if (project.commerceTemplates.search.enabled) runtimeFeatures.add("search");
  if (project.commerceTemplates.cart.enabled || project.siteShell.cart) runtimeFeatures.add("cart");
  if (project.commerceTemplates.checkout.enabled) runtimeFeatures.add("checkout");
  if (pages.some((page) => page.pageType === "category")) runtimeFeatures.add("category");
  if (pages.some((page) => page.pageType === "product")) runtimeFeatures.add("product");
  if (activeModules.some((moduleId) => moduleId.includes("hero"))) runtimeFeatures.add("hero");
  if (media.videoIds.size > 0) runtimeFeatures.add("video");
  if (activeModules.includes("contact-form")) runtimeFeatures.add("contact");
  if (activeModules.some((moduleId) => moduleId.includes("motion")) || sections.length > 0) {
    runtimeFeatures.add("motion");
  }
  if (pages.some((page) => page.pageType === "product" && page.body.includes("data-variant"))) {
    runtimeFeatures.add("variants");
  }
  if (pages.some((page) => page.pageType === "category" && page.body.includes("data-category"))) {
    runtimeFeatures.add("filters");
  }

  return {
    pages,
    activeModules,
    usedAssetIds: [...media.assetIds].sort(),
    usedVideoIds: [...media.videoIds].sort(),
    runtimeFeatures: [...runtimeFeatures].sort(),
    indexableRoutes: pages
      .filter((page) => !["search", "cart", "checkout", "not-found"].includes(page.pageType))
      .map((page) => page.canonicalPath),
    searchEnabled: project.commerceTemplates.search.enabled,
    cartEnabled: project.commerceTemplates.cart.enabled,
    checkoutEnabled: project.commerceTemplates.checkout.enabled,
  };
}

export function effectiveHomeSections(project: StoreProjectV1): readonly StoreSection[] {
  const home = project.pages.find((page) => page.kind === "home");
  return home?.sections.length ? home.sections : project.sections;
}

const HOME_CONTACT_MODULE_IDS = new Set(["contact-form", "contact-channels"]);

function renderProjectSections(
  project: StoreProjectV1,
  sections: readonly StoreSection[],
  pageContext: {
    pageType: PageDescriptor["pageType"];
    product?: Product;
    category?: Category;
    collection?: StoreProjectV1["collections"][number];
    products?: readonly Product[];
    canvasSectionId?: string;
  },
): string {
  const modulePageType =
    pageContext.pageType === "legal" || pageContext.pageType === "not-found"
      ? "content"
      : pageContext.pageType;
  const activeSections = activeProjectSections(project, sections);
  const renderContext: PageRenderContext = {
    pageType: modulePageType,
    ...(pageContext.product ? { product: pageContext.product } : {}),
    ...(pageContext.category ? { category: pageContext.category } : {}),
    ...(pageContext.collection ? { collection: pageContext.collection } : {}),
    ...(pageContext.products ? { products: pageContext.products } : {}),
    ...(pageContext.canvasSectionId !== undefined
      ? { canvasSectionId: pageContext.canvasSectionId }
      : {}),
  };
  if (pageContext.pageType !== "home") {
    return String(renderSections(project, activeSections, renderContext));
  }

  // Los dos módulos de contacto se mantienen independientes para el
  // Constructor, pero comparten una grilla sólo cuando aparecen juntos en
  // Home. Así la página dedicada conserva su layout y Home puede reordenarlos
  // sin perder la composición responsive.
  const chunks: string[] = [];
  let contactSections: StoreSection[] = [];
  const flushContactSections = (): void => {
    if (contactSections.length === 0) return;
    chunks.push(
      `<div class="solara-home-contact">${String(renderSections(project, contactSections, renderContext))}</div>`,
    );
    contactSections = [];
  };

  for (const section of activeSections) {
    if (HOME_CONTACT_MODULE_IDS.has(section.moduleId)) {
      contactSections.push(section);
      continue;
    }
    flushContactSections();
    chunks.push(String(renderSections(project, [section], renderContext)));
  }
  flushContactSections();
  return chunks.join("");
}

function moduleStylesForSections(
  sections: readonly StoreSection[],
  additionalModuleIds: readonly string[] = [],
): string {
  const moduleIds = new Set([
    ...sections.filter((section) => section.enabled).map((section) => section.moduleId),
    ...additionalModuleIds,
  ]);
  if (moduleIds.has("split-hero")) moduleIds.add("hero-media");
  const styleKeys = [
    ...new Set(
      [...moduleIds].map((moduleId) => {
        const definition = getModuleDefinition(moduleId);
        if (!definition) throw new Error(`Módulo desconocido: ${moduleId}.`);
        return String(definition.styleAsset).replace(/^module-style-/, "");
      }),
    ),
  ];
  const blocks = styleKeys.map((styleKey) => MODULE_STYLE_BLOCKS[styleKey] ?? "");
  return `${STORE_BASE_STYLES}\n${blocks.filter(Boolean).join("\n")}`;
}

function stylesForProjectFamily(project: StoreProjectV1, styles: string): string {
  if (project.commerceTemplates.designFamily !== "catalog-modern-v2") {
    return `${styles}\n${STORE_THEME_TOKEN_STYLES}\n${PRODUCT_GALLERY_MOBILE_FIX}\n${MOBILE_HERO_SQUARE_FIX}`;
  }
  const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"] ?? "";
  const withFamily = v2Styles ? `${styles}\n${v2Styles}` : styles;
  return `${withFamily}\n${STORE_THEME_TOKEN_STYLES}\n${PRODUCT_GALLERY_MOBILE_FIX}\n${MOBILE_HERO_SQUARE_FIX}`;
}

function exportedModuleStyles(project: StoreProjectV1): string {
  const pageSections = project.pages
    .filter((page) => isPublishedEditablePage(project, page))
    .flatMap((page) => page.sections);
  const productModule = isModernProject(project) ? "catalog-product-detail" : "product-detail";
  return stylesForProjectFamily(
    project,
    moduleStylesForSections(
      activeProjectSections(project, [...project.sections, ...pageSections]),
      project.products.some((product) => product.status === "active") ? [productModule] : [],
    ),
  );
}

function previewModuleStyles(project: StoreProjectV1, route = "/"): string {
  const isHome = route === "/" || route === "";
  const pageSections = isHome
    ? []
    : project.pages
        .filter((page) => isPublishedEditablePage(project, page))
        .flatMap((page) => page.sections);
  const productModule = isModernProject(project) ? "catalog-product-detail" : "product-detail";
  return stylesForProjectFamily(
    project,
    moduleStylesForSections(
      activeProjectSections(project, [...project.sections, ...pageSections]),
      project.products.some((product) => product.status === "active") ? [productModule] : [],
    ),
  );
}

function productDetailSection(project: StoreProjectV1, product: Product, editor = false): string {
  const moduleId = isModernProject(project) ? "catalog-product-detail" : "product-detail";
  const definition = getModuleDefinition(moduleId);
  if (!definition) throw new Error("Falta el módulo product-detail.");
  const section: StoreSection = {
    id: `${moduleId}-${product.id}` as StoreSection["id"],
    slot: "product",
    moduleId,
    enabled: true,
    settings: {},
    motion: {
      preset: "fade",
      intensity: 4,
      direction: "up",
      distance: 0,
      duration: 0.45,
      delay: 0,
      stagger: 0,
      easing: "cubic-bezier(.16,1,.3,1)",
      entryPoint: 0.15,
      once: true,
    },
  };
  const settings = definition.settingsSchema.parse({});
  const rendered = definition.render({
    project,
    section,
    settings,
    pageType: "product",
    product,
    ...(editor
      ? {
          canvas: {
            editorMode: true as const,
            sectionId: section.id,
          },
        }
      : {}),
  });
  return String(rendered);
}

function listingSections(
  project: StoreProjectV1,
  pageType: "category" | "collection" | "related",
  limit: number,
): StoreSection[] {
  const source = project.sections.find(
    (section) =>
      section.slot === "catalog" &&
      (isModernProject(project)
        ? section.moduleId === "catalog-product-grid"
        : ["editorial-product-grid", "compact-product-grid"].includes(section.moduleId)),
  );
  if (!source) return [];
  if (!isModernProject(project)) return [source];
  return [
    {
      ...source,
      id: `${source.id}-${pageType}` as StoreSection["id"],
      settings: {
        ...source.settings,
        source: "all",
        sourceId: "",
        limit,
        showViewAll: pageType === "related" ? false : source.settings.showViewAll,
        ...(pageType === "related" ? { title: "También puede interesarte" } : {}),
      },
    },
  ];
}

const PICTURE_MOBILE_MEDIA = "(max-width: 1023px)";
const PICTURE_DESKTOP_MEDIA = "(min-width: 1024px)";

function parseSrcsetPairs(value: string): Array<{ url: string; width: number }> {
  const pairs: Array<{ url: string; width: number }> = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [url, descriptor] = trimmed.split(/\s+/);
    if (!url) continue;
    const width = Number((descriptor ?? "").replace(/w$/, ""));
    pairs.push({ url, width: Number.isFinite(width) && width > 0 ? width : 0 });
  }
  return pairs;
}

/**
 * Espejo del `<picture>` real del body para el preload del LCP, partido por
 * media: el navegador sólo descarga el link cuyo `media` matchea, así cada
 * viewport resuelve el MISMO recurso que elegirá el `<picture>` (con DPR alto
 * un único imagesrcset global podía resolver el full en móvil y duplicar la
 * descarga que el picture evita con su fuente ≤1023px).
 */
function picturePreloadSources(
  body: string,
  preloadImage: string,
):
  | {
      mobile?: { srcset: string; sizes?: string };
      full?: { href: string; srcset: string; sizes?: string };
    }
  | undefined {
  const candidates: Array<{
    mobile?: { srcset: string; sizes?: string };
    full?: { href: string; srcset: string; sizes?: string };
    eager: boolean;
  }> = [];
  for (const match of body.matchAll(/<picture>([\s\S]*?)<\/picture>/g)) {
    const block = match[1] ?? "";
    if (!block.includes(preloadImage)) continue;
    const sourceTags = [...block.matchAll(/<source\b[^>]*>/g)].map((tag) => tag[0]);
    if (sourceTags.length === 0) continue;
    const attribute = (tag: string, name: string): string | undefined =>
      new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1];
    const dedupePairs = (pairs: Array<{ url: string; width: number }>) =>
      pairs.filter(
        (pair, index, all) =>
          all.findIndex((other) => other.url === pair.url && other.width === pair.width) === index,
      );
    const serializePairs = (pairs: Array<{ url: string; width: number }>) =>
      pairs.map((pair) => (pair.width > 0 ? `${pair.url} ${pair.width}w` : pair.url)).join(", ");
    const mobileTags = sourceTags.filter((tag) => attribute(tag, "media") === PICTURE_MOBILE_MEDIA);
    const fullTags = sourceTags.filter((tag) => !attribute(tag, "media"));
    const mobilePairs = dedupePairs(
      mobileTags.flatMap((tag) => parseSrcsetPairs(attribute(tag, "srcset") ?? "")),
    );
    const fullPairs = dedupePairs(
      fullTags.flatMap((tag) => parseSrcsetPairs(attribute(tag, "srcset") ?? "")),
    );
    if (mobilePairs.length === 0 && fullPairs.length === 0) continue;
    const imgTag = /<img\b[^>]*>/i.exec(block)?.[0] ?? "";
    const mobileSizes = mobileTags[0] ? attribute(mobileTags[0], "sizes") : undefined;
    const fullSizes = fullTags[0] ? attribute(fullTags[0], "sizes") : undefined;
    candidates.push({
      ...(mobilePairs.length
        ? {
            mobile: {
              srcset: serializePairs(mobilePairs),
              ...(mobileSizes ? { sizes: mobileSizes } : {}),
            },
          }
        : {}),
      ...(fullPairs.length
        ? {
            full: {
              href: fullPairs[0]?.url ?? "",
              srcset: serializePairs(fullPairs),
              ...(fullSizes ? { sizes: fullSizes } : {}),
            },
          }
        : {}),
      eager: /loading="eager"/i.test(imgTag) || /fetchpriority="high"/i.test(imgTag),
    });
  }
  return candidates.find((candidate) => candidate.eager) ?? candidates[0];
}

function lcpPreloadLinks(
  criticalImage: string,
  sources: ReturnType<typeof picturePreloadSources>,
): string {
  if (!sources) {
    return `<link rel="preload" as="image" href="${escapeAttribute(criticalImage)}" fetchpriority="high">`;
  }
  const { mobile, full } = sources;
  if (mobile && full) {
    return [
      `<link rel="preload" as="image" media="${PICTURE_MOBILE_MEDIA}" imagesrcset="${escapeAttribute(mobile.srcset)}"${
        mobile.sizes ? ` imagesizes="${escapeAttribute(mobile.sizes)}"` : ""
      } fetchpriority="high">`,
      `<link rel="preload" as="image" media="${PICTURE_DESKTOP_MEDIA}" href="${escapeAttribute(full.href)}" fetchpriority="high">`,
    ].join("\n  ");
  }
  if (mobile) {
    // Defensivo: renderImage siempre emite la fuente completa junto a la móvil;
    // si no existiera, el escritorio caería al src del <img>.
    return [
      `<link rel="preload" as="image" media="${PICTURE_MOBILE_MEDIA}" imagesrcset="${escapeAttribute(mobile.srcset)}"${
        mobile.sizes ? ` imagesizes="${escapeAttribute(mobile.sizes)}"` : ""
      } fetchpriority="high">`,
      `<link rel="preload" as="image" media="${PICTURE_DESKTOP_MEDIA}" href="${escapeAttribute(criticalImage)}" fetchpriority="high">`,
    ].join("\n  ");
  }
  // Sin rama móvil en el picture: la fuente completa aplica en todos los
  // anchos, así que el preload conserva un único link sin media.
  const srcset = full?.srcset;
  const sizes = full?.sizes;
  return `<link rel="preload" as="image" href="${escapeAttribute(full?.href || criticalImage)}"${
    srcset ? ` imagesrcset="${escapeAttribute(srcset)}"` : ""
  }${sizes ? ` imagesizes="${escapeAttribute(sizes)}"` : ""} fetchpriority="high">`;
}

function renderDocument(
  project: StoreProjectV1,
  page: PageDescriptor,
  mode: ExportMode,
  publicAiContext = false,
  manifest?: PublicExportManifest,
  runtimeAssets: RuntimeAssetPaths = { css: "/assets/storefront.css", js: "/assets/storefront.js" },
  socialImageOptions: SocialImageResolutionOptions = {},
): string {
  const copy = project.publicCopy;
  const canonical = absoluteUrl(project, page.canonicalPath);
  const social = resolveSocialImage(project, page.image, {
    ...socialImageOptions,
    ...(manifest ? { allowedAssetIds: new Set(manifest.usedAssetIds) } : {}),
  });
  const socialImage = social.source ? absoluteResourceUrl(project, social.source) : undefined;
  // Video de la página (hero del home o del producto) para Open Graph.
  const homeHeroSection = effectiveHomeSections(project).find(
    (section) => section.slot === "hero" && section.enabled,
  );
  const heroVideoSetting =
    page.pageType === "home" && homeHeroSection?.settings.mode === "video"
      ? homeHeroSection.settings.videoAssetId
      : undefined;
  const pageVideo =
    typeof heroVideoSetting === "string" && heroVideoSetting
      ? videoFor(project, heroVideoSetting)
      : undefined;
  const productVideo =
    page.pageType === "product"
      ? (() => {
          const slug = page.canonicalPath.replace(/^\/productos\//, "").replace(/\/$/, "");
          const product = project.products.find((p) => p.slug === slug);
          const firstVideoId = (product?.videoIds ?? [])[0];
          return typeof firstVideoId === "string" ? videoFor(project, firstVideoId) : undefined;
        })()
      : undefined;
  const effectiveVideo = pageVideo ?? productVideo;
  const faviconAsset = imageFor(project, project.seo.faviconAssetId);
  const faviconMimeType = "image/x-icon";
  const faviconHref = assetHref(project, "/favicon.ico");
  const faviconFallbackHref = faviconAsset?.fallbackSource
    ? assetHref(project, faviconAsset.fallbackSource)
    : undefined;
  const author = project.identity.brandName || project.identity.legalName;
  const publisher = project.identity.legalName || author;
  const nonIndexablePage = ["search", "cart", "checkout", "not-found"].includes(page.pageType);
  const robots =
    mode === "draft"
      ? "noindex,nofollow"
      : nonIndexablePage
        ? "noindex,follow"
        : "index,follow,max-image-preview:large,max-video-preview:-1,max-snippet:-1";
  const verification = [
    project.seo.searchConsoleVerification
      ? `<meta name="google-site-verification" content="${escapeAttribute(project.seo.searchConsoleVerification)}">`
      : "",
    project.seo.merchantVerification
      ? `<meta name="google-site-verification" content="${escapeAttribute(project.seo.merchantVerification)}">`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const structuredData = page.structuredData
    .map((data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`)
    .join("\n");
  const baseHref = baseUrlPathname(project.baseUrl);
  const baseHrefAttribute = baseHref ? ` data-base-href="${escapeAttribute(baseHref)}"` : "";
  const serviceWorkerAttribute =
    (runtimeAssets.serviceWorker ?? mode === "production")
      ? ` data-service-worker-url="${escapeAttribute(assetHref(project, "/sw.js"))}"`
      : "";
  const whatsAppPhone = publicWhatsAppPhone(project);
  const whatsappGreeting = interpolatePublicCopy(
    project.whatsapp.greeting.trim() || copy.whatsapp.orderGreeting,
    { storeName: project.identity.brandName },
  );
  const whatsAppAttributes = whatsAppPhone
    ? ` data-whatsapp="${escapeAttribute(whatsAppPhone)}" data-whatsapp-greeting="${escapeAttribute(personalizeWhatsAppGreeting(whatsappGreeting, project.identity.brandName))}"`
    : "";
  // Sólo el runtime necesita estos grupos; el resto del copy ya está renderizado
  // en HTML y repetirlo en cada página de un catálogo grande infla la salida.
  const runtimeCopy =
    page.pageType === "product" || page.pageType === "cart"
      ? {
          whatsapp: {
            total: copy.whatsapp.total,
            customerName: copy.whatsapp.customerName,
            customerPhone: copy.whatsapp.customerPhone,
            delivery: copy.whatsapp.delivery,
            notes: copy.whatsapp.notes,
            confirmation: copy.whatsapp.confirmation,
          },
          contact: { whatsappFallback: copy.contact.whatsappFallback },
          cart: {
            unavailable: copy.cart.unavailable,
            remove: copy.cart.remove,
            name: copy.cart.name,
            phone: copy.cart.phone,
            phoneInvalid: copy.cart.phoneInvalid,
            delivery: copy.cart.delivery,
            locality: copy.cart.locality,
            postalCode: copy.cart.postalCode,
            notes: copy.cart.notes,
          },
          product: {
            quantity: copy.product.quantity,
            available: copy.product.available,
            outOfStock: copy.product.outOfStock,
            addToCart: copy.product.addToCart,
            noStock: copy.product.noStock,
          },
          checkout: {
            emptyCart: copy.checkout.emptyCart,
            invalidItems: copy.checkout.invalidItems,
            total: copy.checkout.total,
            verificationWarning: copy.checkout.verificationWarning,
            disclaimer: copy.checkout.disclaimer,
          },
          empty: { cart: copy.empty.cart },
          search: { error: copy.search.error },
        }
      : page.pageType === "category" || page.pageType === "collection"
        ? {
            whatsapp: copy.whatsapp,
            cart: copy.cart,
            product: copy.product,
            checkout: copy.checkout,
            empty: copy.empty,
            filters: copy.filters,
          }
        : {
            navigation: copy.navigation,
            pages: copy.pages,
            export: copy.export,
            whatsapp: copy.whatsapp,
            contact: copy.contact,
            cart: copy.cart,
            product: copy.product,
            checkout: copy.checkout,
            empty: copy.empty,
            search: copy.search,
            filters: copy.filters,
          };
  const publicCopyAttribute = ` data-solara-copy="${escapeAttribute(JSON.stringify(runtimeCopy))}"`;
  const criticalImage = page.preloadImage ? resourceHref(project, page.preloadImage) : undefined;
  const criticalImageSources =
    mode === "production" && page.preloadImage && criticalImage
      ? picturePreloadSources(page.body, page.preloadImage)
      : undefined;
  const lcpPreload =
    mode === "production" && criticalImage
      ? lcpPreloadLinks(criticalImage, criticalImageSources)
      : "";
  // El logo del navbar está above-the-fold en todas las páginas pero el navegador
  // lo descubre recién al parsear el header: se precarga con el mismo recurso que
  // elegirá su <picture> (igual que el preload LCP) para que no parpadee en frío.
  const logoImgSrc = /\bsrc="([^"]*)"/i.exec(
    /<img\b[^>]*class="[^"]*\bsolara-logo\b[^"]*"[^>]*>/i.exec(page.body)?.[0] ?? "",
  )?.[1];
  const logoPreload =
    mode === "production" && logoImgSrc && !logoImgSrc.startsWith("data:")
      ? lcpPreloadLinks(logoImgSrc, picturePreloadSources(page.body, logoImgSrc))
      : "";
  const fontPreloads =
    mode === "production"
      ? activeFonts(project.theme.typography.display, project.theme.typography.body)
          .map(
            (font) =>
              `<link rel="preload" as="font" type="font/woff2" href="${escapeAttribute(assetHref(project, `/${runtimeAssets.fontPaths?.get(font.woff2Path) ?? font.woff2Path}`))}" crossorigin>`,
          )
          .join("\n  ")
      : "";
  const aiContextLinks =
    mode === "production" && publicAiContext && !nonIndexablePage
      ? `<link rel="alternate" type="application/json" title="Contexto publico para agentes" href="${escapeAttribute(assetHref(project, "/ai-context.json"))}">
  <link rel="alternate" type="text/plain" title="Resumen publico para agentes" href="${escapeAttribute(assetHref(project, "/llms.txt"))}">`
      : "";
  const rssFeedLink =
    mode === "production" &&
    !nonIndexablePage &&
    project.products.some((product) => product.status === "active")
      ? `<link rel="alternate" type="application/rss+xml" title="${escapeAttribute(`${project.identity.brandName} — productos publicados`)}" href="${escapeAttribute(assetHref(project, "/feed.xml"))}">`
      : "";
  const consumerRightsLink =
    mode === "production" &&
    page.pageType !== "legal" &&
    project.legalProfile.consumerRights.enabled
      ? `<aside class="solara-consumer-rights" aria-label="${escapeAttribute(copy.pages.privacy)}"><a href="${escapeAttribute(ARGENTINA_LEGAL_PROFILE.withdrawal.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ARGENTINA_LEGAL_PROFILE.withdrawal.label)}</a></aside>`
      : "";
  const bodyWithConsumerRights = appendToFooter(page.body, consumerRightsLink);
  const socialDimensions =
    social.width && social.height
      ? `<meta property="og:image:width" content="${social.width}"><meta property="og:image:height" content="${social.height}">`
      : "";
  const socialMetadata = socialImage
    ? `<meta property="og:image" content="${escapeAttribute(socialImage)}"><meta property="og:image:type" content="${escapeAttribute(social.mimeType ?? "")}"><meta property="og:image:alt" content="${escapeAttribute(social.asset?.alt || page.title)}">${socialDimensions}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeAttribute(page.title)}"><meta name="twitter:description" content="${escapeAttribute(page.description)}"><meta name="twitter:image" content="${escapeAttribute(socialImage)}">`
    : `<meta name="twitter:card" content="summary">`;

  return `<!doctype html>
<html lang="${escapeAttribute(project.locale)}" data-store-id="${escapeAttribute(project.id)}" data-currency="${escapeAttribute(project.currency)}" data-price-fraction-display="${escapeAttribute(project.priceFractionDisplay)}"${whatsAppAttributes}${publicCopyAttribute} data-solara-runtime-features="${escapeAttribute((manifest?.runtimeFeatures ?? []).join(","))}"${baseHrefAttribute}${serviceWorkerAttribute}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeAttribute(page.description)}">
  <meta name="author" content="${escapeAttribute(author)}">
  <meta name="publisher" content="${escapeAttribute(publisher)}">
  <meta name="robots" content="${escapeAttribute(robots)}">
  <meta name="googlebot" content="${escapeAttribute(robots)}">
  <link rel="canonical" href="${escapeAttribute(canonical)}">
  <meta name="theme-color" content="${escapeAttribute(project.theme.colors.background)}">
  ${
    faviconHref
      ? `<link rel="icon" href="${escapeAttribute(faviconHref)}" sizes="16x16 32x32 48x48 64x64 128x128 256x256" type="${escapeAttribute(faviconMimeType ?? "image/x-icon")}">
  <link rel="shortcut icon" href="${escapeAttribute(faviconHref)}" type="${escapeAttribute(faviconMimeType ?? "image/x-icon")}">${
    faviconFallbackHref
      ? `
  <link rel="apple-touch-icon" sizes="180x180" href="${escapeAttribute(faviconFallbackHref)}">`
      : ""
  }`
      : ""
  }
  <meta property="og:type" content="${escapeAttribute(page.pageType === "product" ? "product" : "website")}">
  <meta property="og:locale" content="es_AR">
  <meta property="og:site_name" content="${escapeAttribute(project.identity.brandName)}">
  <meta property="og:title" content="${escapeAttribute(page.title)}">
  <meta property="og:description" content="${escapeAttribute(page.description)}">
  <meta property="og:url" content="${escapeAttribute(canonical)}">
  ${socialMetadata}
  ${project.identity.twitterHandle ? `<meta name="twitter:site" content="${escapeAttribute(project.identity.twitterHandle.startsWith("@") ? project.identity.twitterHandle : `@${project.identity.twitterHandle}`)}">` : ""}
  ${effectiveVideo ? `<meta property="og:video" content="${escapeAttribute(absoluteResourceUrl(project, effectiveVideo.source))}"><meta property="og:video:type" content="${escapeAttribute(effectiveVideo.mimeType)}">` : ""}
  ${page.pageType === "product" ? `<meta property="article:published_time" content="${escapeAttribute(project.createdAt)}"><meta property="article:modified_time" content="${escapeAttribute(project.updatedAt)}"><meta property="article:author" content="${escapeAttribute(author)}">` : ""}
  ${verification}
  ${lcpPreload}
  ${logoPreload}
  ${fontPreloads}
  ${aiContextLinks}
  ${rssFeedLink}
  ${whatsAppAttributes ? `<link rel="preconnect" href="https://wa.me" crossorigin><link rel="dns-prefetch" href="https://wa.me">` : ""}
  ${page.prevPath ? `<link rel="prev" href="${escapeAttribute(absoluteUrl(project, page.prevPath))}">` : ""}
  ${page.nextPath ? `<link rel="next" href="${escapeAttribute(absoluteUrl(project, page.nextPath))}">` : ""}
  <link rel="manifest" href="${escapeAttribute(assetHref(project, "/manifest.webmanifest"))}">
  <link rel="stylesheet" href="${escapeAttribute(assetHref(project, runtimeAssets.css))}">
  ${structuredData}
</head>
<body>
  <a class="solara-skip-link" href="#solara-main">${escapeHtml(copy.export.skipToContent)}</a>
  <div class="solara-page${modernProjectClass(project)}" data-solara-store data-design-family="${escapeHtml(project.commerceTemplates.designFamily ?? "legacy-editorial-v1")}" data-page-type="${page.pageType}">${bodyWithConsumerRights.replace("<main", '<main id="solara-main"')}</div>
  <script src="${escapeAttribute(assetHref(project, runtimeAssets.js))}" defer></script>
</body>
</html>`;
}

function appendToFooter(body: string, content: string): string {
  if (!content) return body;
  const whatsappMarker = 'class="catalog-footer-whatsapp"';
  const whatsappIndex = body.indexOf(whatsappMarker);
  if (whatsappIndex >= 0) {
    const closeAnchor = body.indexOf("</a>", whatsappIndex);
    if (closeAnchor >= 0) {
      const insertAt = closeAnchor + "</a>".length;
      return `${body.slice(0, insertAt)}${content}${body.slice(insertAt)}`;
    }
  }
  const footerInnerEnd = body.lastIndexOf("</div></footer>");
  if (footerInnerEnd < 0) return body;
  return `${body.slice(0, footerInnerEnd)}${content}${body.slice(footerInnerEnd)}`;
}

function paginationWindowItems(pageNumber: number, totalPages: number): Array<number | "gap"> {
  const pages = new Set<number>([1, totalPages]);
  for (let page = pageNumber - 2; page <= pageNumber + 2; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }
  const sorted = [...pages].sort((left, right) => left - right);
  const items: Array<number | "gap"> = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous === 2) items.push(previous + 1);
    else if (page - previous > 2) items.push("gap");
    items.push(page);
    previous = page;
  }
  return items;
}

function paginationNavigation(
  project: StoreProjectV1,
  basePath: string,
  pageNumber: number,
  totalPages: number,
): string {
  if (totalPages <= 1) return "";
  const copy = project.publicCopy.export;
  const pathFor = (page: number) =>
    internalHref(project, page === 1 ? `${basePath}/` : `${basePath}/pagina/${page}/`);
  const numericWindow = paginationWindowItems(pageNumber, totalPages)
    .map((item) => {
      if (item === "gap") {
        return `<span class="solara-pagination__ellipsis" aria-hidden="true">…</span>`;
      }
      if (item === pageNumber) return `<span aria-current="page">${item}</span>`;
      return `<a href="${escapeHtml(pathFor(item))}">${item}</a>`;
    })
    .join(" ");
  return `<nav class="solara-pagination" aria-label="${escapeAttribute(copy.pagination)}">
    ${pageNumber > 1 ? `<a rel="prev" href="${escapeHtml(pathFor(pageNumber - 1))}">${escapeHtml(copy.previous)}</a>` : ""}
    ${numericWindow}
    <span>${escapeHtml(interpolatePublicCopy(copy.pageOf, { page: String(pageNumber), total: String(totalPages) }))}</span>
    ${pageNumber < totalPages ? `<a rel="next" href="${escapeHtml(pathFor(pageNumber + 1))}">${escapeHtml(copy.next)}</a>` : ""}
  </nav>`;
}

export function categoryProducts(project: StoreProjectV1, category: Category): Product[] {
  const productIds = new Set(getCategoryProductIds(project, category.id));
  return project.products.filter(
    (product) => product.status === "active" && productIds.has(product.id),
  );
}

function categoryChildrenMarkup(
  project: StoreProjectV1,
  category: Category,
  productCountForCategory: (categoryId: Category["id"]) => number = (categoryId) =>
    getCategoryProductIds(project, categoryId).length,
): string {
  const children = project.categories.filter(
    (candidate) => candidate.parentId === category.id && candidate.status !== "hidden",
  );
  if (children.length === 0) return "";
  const copy = project.publicCopy.export;
  return `<nav class="solara-category-children" aria-label="${escapeAttribute(interpolatePublicCopy(copy.categoryChildren, { category: category.title }))}"><h2>${escapeHtml(interpolatePublicCopy(copy.exploreCategory, { category: category.title }))}</h2><ul>${children
    .map(
      (child) =>
        `<li><a href="${internalHref(project, `/categorias/${child.slug}/`)}"><span>${escapeHtml(child.title)}</span><small>${productCountForCategory(child.id)} ${escapeHtml(copy.categoryProducts)}</small></a></li>`,
    )
    .join("")}</ul></nav>`;
}

function categorySortSelect(project: StoreProjectV1): string {
  const copy = project.publicCopy.filters;
  return `<label>${escapeHtml(copy.sort)} <select data-category-sort><option value="recommended">${escapeHtml(copy.recommended)}</option><option value="price-asc">${escapeHtml(copy.priceAsc)}</option><option value="price-desc">${escapeHtml(copy.priceDesc)}</option><option value="name">${escapeHtml(copy.name)}</option></select></label>`;
}

function categoryListingMarkup(
  project: StoreProjectV1,
  products: readonly Product[],
  grid: string,
): string {
  const copy = project.publicCopy;
  const resultCount = `<span data-category-result-count data-category-total="${products.length}">${products.length} ${escapeHtml(copy.filters.resultCount)}</span>`;
  if (isModernProject(project)) {
    return `<div class="catalog-category-layout">
      ${modernCategoryFilters(project, products, project.commerceTemplates.designFamily === "catalog-modern-v2")}
      <div class="catalog-category-results">
        <div class="solara-category-toolbar" data-category-toolbar>
          ${resultCount}
          ${categorySortSelect(project)}
        </div>
        ${grid}
      </div>
    </div>`;
  }
  const tagOptions = [...new Set(products.flatMap((product) => product.tags))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 12)
    .map((tag) => `<option value="${escapeAttribute(tag)}">${escapeHtml(tag)}</option>`)
    .join("");
  const filterCopy = copy.filters;
  return `<div class="solara-category-toolbar" data-category-toolbar>
    ${resultCount}
    <details><summary>${escapeHtml(filterCopy.title)}</summary><div><label><input type="checkbox" data-category-available> ${escapeHtml(filterCopy.availableOnly)}</label><label>${escapeHtml(filterCopy.tag)} <select data-category-tag><option value="">${escapeHtml(filterCopy.all)}</option>${tagOptions}</select></label><label>${escapeHtml(filterCopy.minimum)} <input type="number" min="0" step="1" data-category-min-price inputmode="decimal"></label><label>${escapeHtml(filterCopy.maximum)} <input type="number" min="0" step="1" data-category-max-price inputmode="decimal"></label></div></details>
    ${categorySortSelect(project)}
  </div>
  ${grid}`;
}

function modernCategoryFilters(
  project: StoreProjectV1,
  products: readonly Product[],
  mobileSheet = false,
  controlPrefix = "category",
): string {
  const copy = project.publicCopy.filters;
  const dataAttribute = (name: string): string => `data-${controlPrefix}-${name}`;
  const tags = [...new Set(products.flatMap((product) => product.tags))].slice(0, 12);
  const tagOptions = tags
    .map((tag) => `<option value="${escapeAttribute(tag)}">${escapeHtml(tag)}</option>`)
    .join("");
  const optionGroups = new Map<string, Set<string>>();
  products.forEach((product) => {
    product.variants.forEach((variant) => {
      Object.entries(variant.optionValues).forEach(([key, value]) => {
        const values = optionGroups.get(key) ?? new Set<string>();
        values.add(value);
        optionGroups.set(key, values);
      });
    });
  });
  const optionFilters = [...optionGroups.entries()]
    .slice(0, 6)
    .map(([key, values]) => {
      const options = [...values]
        .sort((left, right) => left.localeCompare(right, "es-AR"))
        .slice(0, 16)
        .map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
        .join("");
      return `<fieldset><legend>${escapeHtml(key)}</legend><label><span class="sr-only">${escapeHtml(copy.filterByTag)} ${escapeHtml(key)}</span><select ${dataAttribute("option")} ${dataAttribute("option-key")}="${escapeAttribute(key)}"><option value="">${escapeHtml(copy.all)}</option>${options}</select></label></fieldset>`;
    })
    .join("");
  const groups = `<div class="catalog-filter-groups"><fieldset><legend>${escapeHtml(copy.availability)}</legend><label><input type="checkbox" ${dataAttribute("available")}> ${escapeHtml(copy.availableOnly)}</label></fieldset><fieldset><legend>${escapeHtml(copy.tag)}</legend><label><span class="sr-only">${escapeHtml(copy.filterByTag)}</span><select ${dataAttribute("tag")}><option value="">${escapeHtml(copy.all)}</option>${tagOptions}</select></label></fieldset>${optionFilters}<fieldset><legend>${escapeHtml(copy.price)}</legend><div class="catalog-price-fields"><label><span>${escapeHtml(copy.minimum)}</span><input type="number" min="0" step="1" ${dataAttribute("min-price")} inputmode="decimal"></label><label><span>${escapeHtml(copy.maximum)}</span><input type="number" min="0" step="1" ${dataAttribute("max-price")} inputmode="decimal"></label></div></fieldset></div>`;
  const summary = `<summary><span>${escapeHtml(copy.title)}</span><span class="catalog-filter-disclosure" aria-hidden="true">&#x2304;</span></summary>`;
  const content = mobileSheet
    ? `<details class="catalog-filter-toggle">${summary}</details>${groups}`
    : `<details open>${summary}${groups}</details>`;
  return `<aside class="catalog-category-filters${controlPrefix === "search" ? " solara-search-filters" : ""}" aria-label="${escapeAttribute(copy.title)}">${content}</aside>`;
}

function categoryBreadcrumbItems(
  project: StoreProjectV1,
  category: Category,
): Array<{ name: string; path: string }> {
  return [
    { name: project.publicCopy.pages.home, path: "/" },
    ...getCategoryBreadcrumb(project, category.id).map((item) => ({
      name: item.title,
      path: `/categorias/${item.slug}/`,
    })),
  ];
}

function categoryBreadcrumbMarkup(project: StoreProjectV1, category: Category): string {
  const items = categoryBreadcrumbItems(project, category);
  return `<nav class="solara-breadcrumbs" aria-label="${escapeAttribute(project.publicCopy.export.breadcrumbs)}">${items
    .map((item, index) => {
      const current = index === items.length - 1;
      return `${index > 0 ? '<span aria-hidden="true">/</span>' : ""}${
        current
          ? `<span aria-current="page">${escapeHtml(item.name)}</span>`
          : `<a href="${escapeAttribute(item.path)}">${escapeHtml(item.name)}</a>`
      }`;
    })
    .join("")}</nav>`;
}

export function productCategoryScope(project: StoreProjectV1, product: Product): Set<string> {
  return new Set(
    product.categoryIds.flatMap((categoryId) => [
      categoryId,
      ...getCategoryAncestors(project, categoryId as Category["id"]).map((category) => category.id),
    ]),
  );
}

function buildPages(
  project: StoreProjectV1,
  snapshot = buildCommerceSnapshot(project),
  options: {
    editor?: boolean;
    socialImageOptions?: SocialImageResolutionOptions;
    mediaUsage?: PublicMediaUsage;
  } = {},
): PageDescriptor[] {
  const isV2Design = project.commerceTemplates.designFamily === "catalog-modern-v2";
  const renderPageSections = (
    sections: readonly StoreSection[],
    pageContext: Parameters<typeof renderProjectSections>[2],
  ): string =>
    renderProjectSections(project, sections, {
      ...pageContext,
      ...(options.editor ? { canvasSectionId: "*" } : {}),
    });
  const copy = project.publicCopy;
  const sharedHeader = project.sections.filter((section) =>
    ["announcement", "header"].includes(section.slot),
  );
  const sharedFooter = project.sections.filter((section) =>
    isModernProject(project)
      ? ["cart", "footer"].includes(section.slot) || section.moduleId === "catalog-newsletter-cta"
      : ["trust", "cart", "footer"].includes(section.slot),
  );
  // F-11: el CTA de novedades conserva en páginas comerciales y legales, pero
  // una 404 ya pide volver al catálogo; repetirlo ahí solo diluye la acción.
  const notFoundFooter = sharedFooter.filter(
    (section) => section.moduleId !== "catalog-newsletter-cta",
  );
  const homeHero = effectiveHomeSections(project).find(
    (section) => section.enabled && section.slot === "hero",
  );
  const homeHeroVideo =
    homeHero?.settings.mode === "video" && typeof homeHero.settings.videoAssetId === "string"
      ? videoFor(project, homeHero.settings.videoAssetId)
      : undefined;
  const socialMedia = options.mediaUsage ?? publicMediaUsage(project, options.socialImageOptions);
  const socialImage = resolveSocialImage(project, undefined, {
    ...options.socialImageOptions,
    allowedAssetIds: socialMedia.assetIds,
  }).source;
  const defaultSeoDescription =
    project.seo.description.trim() ||
    project.identity.description.trim() ||
    `Descubrí la propuesta de ${project.identity.brandName}.`;
  const homePreloadImage =
    (typeof homeHero?.settings.posterAssetId === "string"
      ? imageUrl(project, homeHero.settings.posterAssetId)
      : undefined) ??
    imageUrl(project, homeHeroVideo?.posterAssetId) ??
    socialImage;
  const homeConfig = project.pages.find((page) => page.kind === "home");
  const homeSections = homeConfig?.sections.length
    ? [...sharedHeader, ...homeConfig.sections, ...sharedFooter]
    : project.sections;
  const activeProducts = project.products.filter((product) => product.status === "active");
  const productById = new Map(project.products.map((product) => [product.id, product]));
  const categoryProductsCache = new Map<string, Product[]>();
  const categoryProductCountCache = new Map<string, number>();
  const productCountForCategory = (categoryId: Category["id"]): number => {
    const cached = categoryProductCountCache.get(categoryId);
    if (cached !== undefined) return cached;
    const count = getCategoryProductIds(project, categoryId).length;
    categoryProductCountCache.set(categoryId, count);
    return count;
  };
  const productsForCategory = (category: Category): Product[] => {
    const cached = categoryProductsCache.get(category.id);
    if (cached) return cached;
    const productIds = new Set(getCategoryProductIds(project, category.id));
    const products = activeProducts.filter((product) => productIds.has(product.id));
    categoryProductsCache.set(category.id, products);
    return products;
  };
  const productCategoryScopeCache = new Map<string, Set<string>>();
  const categoryScopeForProduct = (product: Product): Set<string> => {
    const cached = productCategoryScopeCache.get(product.id);
    if (cached) return cached;
    const scope = productCategoryScope(project, product);
    productCategoryScopeCache.set(product.id, scope);
    return scope;
  };
  const pageSize = project.commerceTemplates.category.productsPerPage;
  const categorySections = listingSections(project, "category", pageSize);
  const collectionSections = listingSections(project, "collection", pageSize);
  const relatedSections = project.commerceTemplates.product.showRelated
    ? listingSections(project, "related", 8)
    : [];
  const activeProductTitleCounts = new Map<string, number>();
  for (const product of activeProducts) {
    activeProductTitleCounts.set(
      product.title,
      (activeProductTitleCounts.get(product.title) ?? 0) + 1,
    );
  }

  const home: PageDescriptor = {
    path: "index.html",
    title: homeConfig?.seoTitle ?? project.seo.title ?? project.name ?? project.identity.brandName,
    description:
      homeConfig?.seoDescription ?? project.seo.description ?? project.identity.description,
    canonicalPath: "/",
    pageType: "home",
    body: `<main class="solara-home">${renderPageSections(homeSections, { pageType: "home" })}</main>`,
    structuredData: [
      ...storeStructuredData(project),
      // ItemList de destacados: refuerza la senal de catalogo para Google.
      itemListFromSnapshots(project, project.identity.brandName, snapshot.products.slice(0, 12)),
    ],
    ...(socialImage ? { image: socialImage } : {}),
    ...(homePreloadImage ? { preloadImage: homePreloadImage } : {}),
  };

  const categories = project.categories.flatMap((category) => {
    if (category.status === "hidden") return [];
    const products = productsForCategory(category);
    const pages: PageDescriptor[] = [];

    const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
    for (let offset = 0; offset < Math.max(products.length, 1); offset += pageSize) {
      const pageNumber = Math.floor(offset / pageSize) + 1;
      const categoryCanvas = {
        editorMode: options.editor === true,
        sectionId: `generated-category-${category.id}`,
      } as const;
      const categoryCanvasRoot = options.editor
        ? ` data-solara-module="generated-category-page" data-solara-section="${escapeAttribute(categoryCanvas.sectionId)}"`
        : "";
      const paginated = products.slice(offset, offset + pageSize);
      const categoryAsset = imageFor(project, category.imageId);
      const categoryImage = imageUrl(project, category.imageId);
      const categoryMedia =
        categoryAsset && categoryImage
          ? String(
              renderImage(project, category.imageId, {
                className: "solara-category-hero-image",
                loading: "eager",
                fetchPriority: "high",
                sizes: "100vw",
                fallbackAlt: category.title,
              }),
            )
          : "";
      const categoryMediaWithBinding = categoryMedia.replace(
        "<img",
        `<img${canvasEntityAttributes(categoryCanvas, "category-image", "category", category.id, "imageId", "image")}`,
      );
      const categoryGrid = renderPageSections(categorySections, {
        pageType: "category",
        category: { ...category, productIds: paginated.map((product) => product.id) },
        products: paginated,
      });
      const body = [
        renderPageSections(sharedHeader, { pageType: "category", category }),
        `<main class="solara-container catalog-category-page"${categoryCanvasRoot}>
          ${categoryBreadcrumbMarkup(project, category)}
          <header class="solara-category-hero">
            <div class="solara-category-hero-copy">
              <h1><span class="solara-category-title-glass"${canvasEntityAttributes(categoryCanvas, "category-title", "category", category.id, "title")}>${escapeHtml(category.title)}</span></h1>
              <p${canvasEntityAttributes(categoryCanvas, "category-description", "category", category.id, "description")}>${escapeHtml(category.description)}</p>
            </div>
            ${categoryMediaWithBinding}
          </header>
          ${categoryChildrenMarkup(project, category, productCountForCategory)}
          ${category.seoIntro ? `<section class="solara-category-intro solara-container"><h2 class="sr-only">Sobre ${escapeHtml(category.title)}</h2><p${canvasEntityAttributes(categoryCanvas, "category-seo-intro", "category", category.id, "seoIntro")}>${escapeHtml(category.seoIntro)}</p></section>` : ""}
          ${categoryListingMarkup(project, products, categoryGrid)}
          ${paginationNavigation(project, `/categorias/${category.slug}`, pageNumber, totalPages)}
        </main>`,
        renderPageSections(sharedFooter, { pageType: "category", category }),
      ].join("");
      const canonicalPath =
        pageNumber === 1
          ? `/categorias/${category.slug}/`
          : `/categorias/${category.slug}/pagina/${pageNumber}/`;
      pages.push({
        path:
          pageNumber === 1
            ? `categorias/${category.slug}/index.html`
            : `categorias/${category.slug}/pagina/${pageNumber}/index.html`,
        title: fitTitle(
          `${category.title}${pageNumber > 1 ? ` — Página ${pageNumber}` : ""}`,
          project.identity.brandName,
        ),
        description: category.description || project.seo.description,
        canonicalPath,
        pageType: "category",
        body,
        structuredData: [
          breadcrumbData(project, categoryBreadcrumbItems(project, category)),
          itemListData(project, category.title, paginated),
        ],
        ...(categoryImage ? { image: categoryImage } : {}),
        ...(categoryImage ? { preloadImage: categoryImage } : {}),
        ...(pageNumber > 1
          ? {
              prevPath:
                pageNumber === 2
                  ? `/categorias/${category.slug}/`
                  : `/categorias/${category.slug}/pagina/${pageNumber - 1}/`,
            }
          : {}),
        ...(pageNumber < totalPages
          ? { nextPath: `/categorias/${category.slug}/pagina/${pageNumber + 1}/` }
          : {}),
      });
    }

    return pages;
  });

  const collections = project.collections
    .filter((collection) => collection.status !== "hidden")
    .flatMap((collection) => {
      const products = collection.productIds
        .map((id) => productById.get(id))
        .filter((product): product is Product => Boolean(product && product.status === "active"));
      const pages: PageDescriptor[] = [];
      const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
      for (let offset = 0; offset < Math.max(products.length, 1); offset += pageSize) {
        const pageNumber = Math.floor(offset / pageSize) + 1;
        const collectionCanvas = {
          editorMode: options.editor === true,
          sectionId: `generated-collection-${collection.id}`,
        } as const;
        const collectionCanvasRoot = options.editor
          ? ` data-solara-module="generated-collection-page" data-solara-section="${escapeAttribute(collectionCanvas.sectionId)}"`
          : "";
        const paginated = products.slice(offset, offset + pageSize);
        const collectionHeroAsset = imageFor(project, collection.imageId);
        const collectionHeroImage = imageUrl(project, collection.imageId);
        const collectionHeroMarkup =
          collectionHeroAsset && collectionHeroImage
            ? String(
                renderImage(project, collection.imageId, {
                  className: "solara-collection-hero-image",
                  loading: "eager",
                  fetchPriority: "high",
                  sizes: "100vw",
                  fallbackAlt: collection.title,
                }),
              ).replace(
                "<img",
                `<img${canvasEntityAttributes(collectionCanvas, "collection-image", "collection", collection.id, "imageId", "image")}`,
              )
            : "";
        const body = [
          renderPageSections(sharedHeader, { pageType: "collection", collection }),
          `<main class="solara-container"${collectionCanvasRoot}>
          <header class="solara-category-hero solara-collection-hero">
            <div class="solara-category-hero-copy">
              <h1${canvasEntityAttributes(collectionCanvas, "collection-title", "collection", collection.id, "title")}>${escapeHtml(collection.title)}</h1>
              <p${canvasEntityAttributes(collectionCanvas, "collection-description", "collection", collection.id, "description")}>${escapeHtml(collection.description)}</p>
            </div>
            ${collectionHeroMarkup}
          </header>
          ${renderPageSections(collectionSections, {
            pageType: "collection",
            collection: { ...collection, productIds: paginated.map((product) => product.id) },
            products: paginated,
          })}
          ${paginationNavigation(project, `/colecciones/${collection.slug}`, pageNumber, totalPages)}
        </main>`,
          renderPageSections(sharedFooter, { pageType: "collection", collection }),
        ].join("");
        const canonicalPath =
          pageNumber === 1
            ? `/colecciones/${collection.slug}/`
            : `/colecciones/${collection.slug}/pagina/${pageNumber}/`;
        const collectionImage = imageUrl(project, collection.imageId);
        pages.push({
          path:
            pageNumber === 1
              ? `colecciones/${collection.slug}/index.html`
              : `colecciones/${collection.slug}/pagina/${pageNumber}/index.html`,
          title: fitTitle(
            `${collection.title}${pageNumber > 1 ? ` — Página ${pageNumber}` : ""}`,
            project.identity.brandName,
          ),
          description: collection.description || project.seo.description,
          canonicalPath,
          pageType: "collection",
          body,
          structuredData: [
            breadcrumbData(project, [
              { name: copy.pages.home, path: "/" },
              { name: collection.title, path: `/colecciones/${collection.slug}/` },
            ]),
          ],
          ...(collectionImage ? { image: collectionImage } : {}),
          ...(collectionImage ? { preloadImage: collectionImage } : {}),
        });
      }
      return pages;
    });

  const products = activeProducts.map((product): PageDescriptor => {
    const productImage = imageUrl(project, product.imageIds[0]);
    const productCategoryIds = categoryScopeForProduct(product);
    const relatedProducts = activeProducts
      .filter((candidate) => {
        if (candidate.id === product.id) return false;
        const candidateCategoryIds = categoryScopeForProduct(candidate);
        return (
          [...candidateCategoryIds].some((id) => productCategoryIds.has(id)) ||
          candidate.collectionIds.some((id) => product.collectionIds.includes(id))
        );
      })
      .slice(0, 8);
    // En catálogos chicos completamos la fila con productos activos para
    // conservar una sección de recomendaciones útil y visualmente estable.
    if (relatedProducts.length < 8) {
      const relatedIds = new Set(relatedProducts.map((candidate) => candidate.id));
      relatedProducts.push(
        ...activeProducts
          .filter((candidate) => candidate.id !== product.id && !relatedIds.has(candidate.id))
          .slice(0, 8 - relatedProducts.length),
      );
    }
    const body = [
      renderPageSections(sharedHeader, { pageType: "product", product }),
      `<main>${productDetailSection(project, product, options.editor)}${
        relatedProducts.length && relatedSections.length
          ? `<section class="solara-related-products"><div class="solara-container">${renderPageSections(relatedSections, { pageType: "product", products: relatedProducts })}</div></section>`
          : ""
      }</main>`,
      renderPageSections(sharedFooter, { pageType: "product", product }),
    ].join("");
    return {
      path: `productos/${product.slug}/index.html`,
      title: fitTitle(
        `${product.title}${(activeProductTitleCounts.get(product.title) ?? 0) > 1 ? ` — ${product.slug}` : ""}`,
        project.identity.brandName,
      ),
      description: product.description || project.seo.description,
      canonicalPath: `/productos/${product.slug}/`,
      lastModifiedAt: product.updatedAt,
      pageType: "product",
      body,
      structuredData: [
        breadcrumbData(project, [
          { name: copy.pages.home, path: "/" },
          { name: copy.pages.products, path: "/" },
          { name: product.title, path: `/productos/${product.slug}/` },
        ]),
        productStructuredData(project, product, snapshot),
      ],
      ...(productImage ? { image: productImage } : {}),
      ...(productImage ? { preloadImage: productImage } : {}),
    };
  });

  const copyValues = { storeName: project.identity.brandName };
  const whatsAppContactLink = buildWhatsAppLink(
    project,
    interpolatePublicCopy(copy.whatsapp.ask, copyValues),
  );
  const searchControls = `<form class="solara-search-form" role="search" action="/buscar/" method="get"><label for="solara-search-input">${escapeHtml(copy.search.title)}</label><div><input id="solara-search-input" name="q" type="search" autocomplete="off" placeholder="${escapeAttribute(copy.search.placeholder)}"><button class="solara-primary-action" type="submit">${escapeHtml(copy.search.submit)}</button></div></form>`;
  const searchProducts = activeProducts;
  const searchFilters = modernCategoryFilters(
    project,
    searchProducts,
    project.commerceTemplates.designFamily === "catalog-modern-v2",
    "category",
  );
  const searchSort = categorySortSelect(project).replace(
    "data-category-sort",
    "data-category-sort data-search-sort",
  );
  const searchPage: PageDescriptor = {
    path: "buscar/index.html",
    title: `${copy.search.title} | ${project.identity.brandName}`,
    description: defaultSeoDescription,
    canonicalPath: "/buscar/",
    pageType: "search",
    body: `${renderPageSections(sharedHeader, { pageType: "search" })}<main class="solara-search-page solara-container"><nav class="solara-breadcrumbs" aria-label="${escapeAttribute(copy.export.breadcrumbs)}"><a href="${internalHref(project, "/")}">${escapeHtml(copy.pages.home)}</a><span aria-hidden="true">/</span><span>${escapeHtml(copy.pages.search)}</span></nav><header class="solara-page-intro"><p class="solara-eyebrow">${escapeHtml(copy.pages.catalog)}</p><h1>${escapeHtml(copy.search.title)}</h1><p>${escapeHtml(copy.search.queryLabel)}</p>${searchControls}</header><section class="catalog-category-layout solara-search-layout"><div class="solara-search-filter-column">${searchFilters}</div><div class="catalog-category-results solara-search-results"><div class="solara-category-toolbar" data-search-toolbar><span data-category-result-count data-search-result-count data-category-total="${searchProducts.length}" aria-live="polite">${escapeHtml(copy.search.empty)}</span>${searchSort}</div><div data-search-results aria-live="polite"><div class="solara-search-results-grid" data-category-grid data-products-per-page="${project.commerceTemplates.category.productsPerPage}"></div></div></div></section></main>${renderPageSections(sharedFooter, { pageType: "search" })}`,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: copy.search.title,
        url: absoluteUrl(project, "/buscar/"),
      },
    ],
  };

  const firstRootCategory = project.categories.find(
    (category) => !category.parentId && category.status !== "hidden",
  );
  const emptyCartHref = firstRootCategory
    ? internalHref(project, `/categorias/${firstRootCategory.slug}/`)
    : internalHref(project, "/buscar/");
  const cartContinueHref = internalHref(project, "/#contact-form");
  const cartContinueLabel = copy.checkout.coordinate;
  const cartPage: PageDescriptor = {
    path: "carrito/index.html",
    title: `Carrito | ${project.identity.brandName}`,
    description: defaultSeoDescription,
    canonicalPath: "/carrito/",
    pageType: "cart",
    body: `${renderPageSections(sharedHeader, { pageType: "cart" })}<main class="solara-cart-page solara-container"><nav class="solara-breadcrumbs" aria-label="${escapeAttribute(copy.export.breadcrumbs)}"><a href="${internalHref(project, "/")}">${escapeHtml(copy.pages.home)}</a><span aria-hidden="true">/</span><span>${escapeHtml(copy.pages.cart)}</span></nav><header class="solara-page-intro"><p class="solara-eyebrow">${escapeHtml(copy.checkout.selection)}</p><h1>${escapeHtml(copy.pages.cart)}</h1></header><section class="solara-cart-page-grid"><div data-cart-lines><p class="solara-empty-state">${escapeHtml(copy.empty.cart)}</p></div><aside class="solara-cart-summary"><p><span>${escapeHtml(copy.cart.subtotal)}</span><strong data-cart-subtotal>${escapeHtml(formatMoney(0, project))}</strong></p><p><span>${escapeHtml(copy.cart.delivery)}</span><strong>${escapeHtml(copy.cart.deliveryToCoordinate)}</strong></p><p><span>${escapeHtml(copy.checkout.total)}</span><strong data-cart-total>${escapeHtml(formatMoney(0, project))}</strong></p><a class="solara-primary-action" href="${escapeAttribute(cartContinueHref)}">${escapeHtml(cartContinueLabel)}</a></aside></section></main>${renderPageSections(sharedFooter, { pageType: "cart" })}`,
    structuredData: [],
  };
  cartPage.body = cartPage.body.replace(
    `<a class="solara-primary-action" href="${escapeAttribute(cartContinueHref)}">${cartContinueLabel}</a>`,
    `<a data-cart-cta href="${escapeAttribute(emptyCartHref)}"><span class="solara-primary-action">${escapeHtml(copy.cart.exploreCategories)}</span></a><a data-cart-cta href="${escapeAttribute(cartContinueHref)}" hidden><span class="solara-primary-action">${escapeHtml(cartContinueLabel)}</span></a>`,
  );

  const formatPolicyDays = (minimum: number, maximum: number) =>
    minimum === maximum
      ? `${minimum} ${minimum === 1 ? "día" : "días"}`
      : `${minimum} a ${maximum} días`;
  const policyCoverage = (countries: readonly string[]) =>
    formatLegalCountryCoverage(project, countries);
  const policyContactAction = whatsAppContactLink
    ? `<a class="solara-primary-action" href="${escapeAttribute(whatsAppContactLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.product.askWhatsApp)}</a>`
    : `<a class="solara-secondary-action" href="${escapeAttribute(internalHref(project, "/#contact-form"))}">${escapeHtml(copy.hero.contact)}</a>`;
  const renderV2PolicyPage = (
    title: string,
    eyebrow: string,
    summary: string,
    details: string,
    facts: readonly (readonly [label: string, value: string])[] = [],
  ) =>
    [
      renderPageSections(sharedHeader, { pageType: "legal" }),
      `<main class="solara-editorial-page solara-policy-page solara-container"><nav class="solara-breadcrumbs" aria-label="${escapeAttribute(copy.export.breadcrumbs)}"><a href="${internalHref(project, "/")}">${escapeHtml(copy.pages.home)}</a><span aria-hidden="true">/</span><span>${escapeHtml(title)}</span></nav><header class="solara-page-intro"><p class="solara-eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></header><section class="solara-story-grid"><div><h2>${escapeHtml(copy.export.policyDetailsTitle)}</h2><p>${escapeHtml(details)}</p></div><div><h2>${escapeHtml(copy.export.policyQuestionsTitle)}</h2><p>${escapeHtml(copy.export.policyQuestionsBody)}</p>${policyContactAction}</div></section>${facts.length ? `<section class="solara-values-grid">${facts.map(([label, value]) => `<article><h2>${escapeHtml(label)}</h2><p>${escapeHtml(value)}</p></article>`).join("")}</section>` : ""}</main>`,
      renderPageSections(sharedFooter, { pageType: "legal" }),
    ].join("");
  const LEGACY_PRIVACY_TEXT = "Usamos tus datos únicamente para responder y coordinar el pedido.";
  const LEGACY_TERMS_TEXT = "Los precios y la disponibilidad se confirman antes del pago.";
  const isLegacyPrivacyText = (value: string) => value.trim() === LEGACY_PRIVACY_TEXT;
  const isLegacyTermsText = (value: string) => value.trim() === LEGACY_TERMS_TEXT;
  const formatRichPolicyText = (raw: string): string => {
    const blocks = raw
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);
    if (blocks.length === 0) return `<p>${escapeHtml(raw.trim())}</p>`;
    let html = "";
    for (const block of blocks) {
      if (block.startsWith("## ") || block.startsWith("### ")) {
        const isH2 = block.startsWith("## ");
        const prefixLen = isH2 ? 3 : 4;
        const linesInBlock = block.split("\n");
        const headingLine = (linesInBlock[0] ?? "").slice(prefixLen).trim();
        html += isH2
          ? `<h2>${escapeHtml(headingLine)}</h2>`
          : `<h3>${escapeHtml(headingLine)}</h3>`;
        const remaining = linesInBlock.slice(1).join("\n").trim();
        if (!remaining) continue;
        const remLines = remaining
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const bulletCount = remLines.findIndex((l) => !/^[-•*]\s+/.test(l));
        const orderedCount = remLines.findIndex((l) => !/^\d+\.\s+/.test(l));
        const isRemainingBullet = remLines.length > 0 && remLines.every((l) => /^[-•*]\s+/.test(l));
        const isRemainingOrdered =
          remLines.length > 1 && remLines.every((l) => /^\d+\.\s+/.test(l));
        if (isRemainingBullet) {
          html += `<ul>${remLines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s+/, "").trim())}</li>`).join("")}</ul>`;
          continue;
        }
        if (isRemainingOrdered) {
          html += `<ol>${remLines.map((l) => `<li>${escapeHtml(l.replace(/^\d+\.\s+/, "").trim())}</li>`).join("")}</ol>`;
          continue;
        }
        if (bulletCount > 0 && bulletCount < remLines.length) {
          const bulletLines = remLines.slice(0, bulletCount);
          const restLines = remLines.slice(bulletCount);
          html += `<ul>${bulletLines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s+/, "").trim())}</li>`).join("")}</ul>`;
          if (restLines.length > 0) html += `<p>${escapeHtml(restLines.join(" "))}</p>`;
          continue;
        }
        if (orderedCount > 0 && orderedCount < remLines.length) {
          const orderedLines = remLines.slice(0, orderedCount);
          const restLines = remLines.slice(orderedCount);
          html += `<ol>${orderedLines.map((l) => `<li>${escapeHtml(l.replace(/^\d+\.\s+/, "").trim())}</li>`).join("")}</ol>`;
          if (restLines.length > 0) html += `<p>${escapeHtml(restLines.join(" "))}</p>`;
          continue;
        }
        if (
          remaining.includes("\n- ") ||
          remaining.includes("\n• ") ||
          remaining.includes("\n* ")
        ) {
          const introLines: string[] = [];
          const listLines: string[] = [];
          const postListLines: string[] = [];
          let state: "intro" | "list" | "post" = "intro";
          for (const rawLine of remaining.split("\n")) {
            const line = rawLine.trim();
            if (!line) continue;
            const isBullet = /^[-•*]\s+/.test(line);
            if (state === "intro") {
              if (isBullet) {
                state = "list";
                listLines.push(line);
              } else introLines.push(line);
            } else if (state === "list") {
              if (isBullet) listLines.push(line);
              else {
                state = "post";
                postListLines.push(line);
              }
            } else {
              postListLines.push(line);
            }
          }
          if (introLines.length > 0) html += `<p>${escapeHtml(introLines.join(" "))}</p>`;
          if (listLines.length > 0)
            html += `<ul>${listLines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s+/, "").trim())}</li>`).join("")}</ul>`;
          if (postListLines.length > 0) html += `<p>${escapeHtml(postListLines.join(" "))}</p>`;
          continue;
        }
        html += `<p>${escapeHtml(remaining).replace(/\n/g, "<br>")}</p>`;
        continue;
      }
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const isBulletList = lines.length > 0 && lines.every((line) => /^[-•*]\s+/.test(line));
      const isOrderedList = lines.length > 1 && lines.every((line) => /^\d+\.\s+/.test(line));
      if (isBulletList) {
        html += `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^[-•*]\s+/, "").trim())}</li>`).join("")}</ul>`;
        continue;
      }
      if (isOrderedList) {
        html += `<ol>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s+/, "").trim())}</li>`).join("")}</ol>`;
        continue;
      }
      if (block.includes("\n- ") || block.includes("\n• ") || block.includes("\n* ")) {
        const introLines: string[] = [];
        const listLines: string[] = [];
        const postListLines: string[] = [];
        let state: "intro" | "list" | "post" = "intro";
        for (const rawLine of block.split("\n")) {
          const line = rawLine.trim();
          if (!line) continue;
          const isBullet = /^[-•*]\s+/.test(line);
          if (state === "intro") {
            if (isBullet) {
              state = "list";
              listLines.push(line);
            } else introLines.push(line);
          } else if (state === "list") {
            if (isBullet) listLines.push(line);
            else {
              state = "post";
              postListLines.push(line);
            }
          } else {
            postListLines.push(line);
          }
        }
        if (introLines.length > 0) html += `<p>${escapeHtml(introLines.join(" "))}</p>`;
        if (listLines.length > 0)
          html += `<ul>${listLines.map((line) => `<li>${escapeHtml(line.replace(/^[-•*]\s+/, "").trim())}</li>`).join("")}</ul>`;
        if (postListLines.length > 0) html += `<p>${escapeHtml(postListLines.join(" "))}</p>`;
        continue;
      }
      html += `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    }
    return html;
  };
  const buildDefaultPrivacyRichText = (target: StoreProjectV1): string => {
    const brand = target.identity.brandName;
    const legal = target.identity.legalName || brand;
    const legalProfile = target.legalProfile;
    const countryName =
      resolveLegalCountryName(target, legalProfile.countryCode) ?? legalProfile.countryCode;
    const jurisdiction = legalProfile.jurisdiction || countryName;
    const email = target.identity.email || "el email publicado en la web";
    const phone = target.whatsapp.phone || target.identity.phone || "";
    const phoneDisplay = phone ? ` · WhatsApp ${phone}` : "";
    const address = target.identity.address || jurisdiction;
    const base = target.baseUrl || "tu dominio";
    return `Usamos tus datos únicamente para responder y coordinar el pedido. Esta política explica, en lenguaje claro, qué información trata ${brand} y cómo funciona técnicamente esta web.

## 1. Responsable y alcance
Responsable: ${legal} (${brand}). Contacto: ${email}${phoneDisplay} · ${address}. Sitio: ${base}. Esta política aplica al sitio estático y catálogo online en ${countryName}. No comprende servicios externos que abras voluntariamente (WhatsApp, redes sociales o medios de pago que coordines por fuera). Última actualización: ${formatLegalRevisionAt(target)}.

## 2. Qué datos recopilamos y cuándo
- Datos que vos nos proporcionás voluntariamente al preparar un pedido o consultarnos: nombre, teléfono, dirección o punto de entrega, notas opcionales y contenido del carrito (productos, variantes, cantidades y subtotal estimado).
- Mensajes que enviás por WhatsApp, email u otros canales publicados.
- Datos técnicos mínimos del hosting estático: registros de acceso (IP, fecha, recurso solicitado, código de respuesta) generados por el proveedor para servir los archivos, prevenir abusos y medir disponibilidad.
- Preferencias guardadas únicamente en tu navegador (localStorage, sessionStorage e IndexedDB) para mantener el carrito y un borrador de recuperación si cerrás la pestaña. No creamos cuentas de usuario en el sitio público.
No solicitamos datos sensibles ni realizamos perfilado automatizado.

## 3. Para qué usamos tus datos
Usamos tus datos únicamente para responder y coordinar el pedido: confirmar disponibilidad y precio vigente, calcular envío, acordar forma de pago, coordinar entrega o retiro y brindar soporte postventa. La operación se informa según la política de envíos ("${target.policies.shipping.summary}") y la política de cambios ("${target.policies.returns.summary}"). No usamos tus datos para publicidad sin tu consentimiento, no los vendemos ni los cedemos con fines comerciales.

## 4. Base legal
Tratamos tus datos con tu consentimiento al completarlos y enviarlos voluntariamente por el formulario o por WhatsApp, y en el marco de gestiones previas a una compra (${ARGENTINA_LEGAL_PROFILE.privacyLaw.label}, ${countryName}). Podés revocarlo en cualquier momento sin efecto retroactivo.

## 5. Conservación
Conservamos mensajes y detalles del pedido el tiempo necesario para gestionar la venta, cumplir obligaciones legales e impositivas y atender reclamos. El carrito en tu navegador permanece hasta que lo vacíes o borres datos del sitio. Los logs del hosting se conservan según política del proveedor (habitualmente 30 a 90 días) y luego se rotan o anonimizan.

## 6. Con quién se comparten
- WhatsApp / Meta: al tocar “Enviar pedido por WhatsApp” o “Consultar por WhatsApp”, tu mensaje y los datos incluidos se transmiten a WhatsApp bajo sus propias condiciones. Te mostramos el contenido antes de abrir la app.
- Proveedor de hosting estático y CDN: alojan archivos HTML, CSS, JS e imágenes y pueden procesar logs técnicos para entregarlos. No tienen acceso al contenido de tu carrito más allá de la descarga de archivos públicos.
- No cedemos datos a terceros con fines de marketing. Si en el futuro sumáramos analítica, píxeles o servicios externos, lo informaremos aquí y solicitaremos consentimiento cuando corresponda.

## 7. Cookies y almacenamiento local
Este sitio es estático y no utiliza cookies de seguimiento. Utiliza exclusivamente almacenamiento local funcional:
- localStorage para carrito y preferencias de catálogo
- sessionStorage para estados transitorios de navegación
- IndexedDB para borrador de recuperación del editor local (sólo Studio)
No hay cookies de terceros, fingerprinting ni publicidad programática. Podés borrar estos datos desde la configuración del navegador sin impedir la navegación, aunque perderás el carrito.

## 8. Seguridad
El sitio se sirve por HTTPS y los archivos públicos no contienen información privada. El pedido no se guarda en una base de datos central: se compone en tu navegador y viaja como mensaje directo a nuestro WhatsApp. Aplicamos buenas prácticas de control de acceso en el hosting y validamos el contenido publicado. Ningún sistema es infalible: no envíes datos innecesarios y verificá que hablás con nuestros canales oficiales.

## 9. Tus derechos
Podés ejercer los derechos de acceso, rectificación, actualización y supresión previstos en ${ARGENTINA_LEGAL_PROFILE.privacyLaw.label} y el derecho a la información del art. 14 inc. 3. Para hacerlo, escribinos a ${email}${phone ? ` o por WhatsApp al ${phone}` : ""} indicando qué necesitás consultar, corregir o eliminar. Respondemos en plazo razonable y sin costo. También podés presentar reclamo ante ${ARGENTINA_LEGAL_PROFILE.privacyAuthority.label}: ${ARGENTINA_LEGAL_PROFILE.privacyAuthority.href}.

## 10. Menores
El sitio no está dirigido a menores de 13 años y no recopilamos deliberadamente sus datos. Si sos menor, navegá con asistencia de un adulto.

## 11. Cambios en esta política
Publicaremos la versión actualizada en esta misma URL con nueva fecha de vigencia. Cambios relevantes se anunciarán en la web. Te recomendamos revisarla antes de coordinar un nuevo pedido.`;
  };
  const buildDefaultTermsRichText = (target: StoreProjectV1): string => {
    const brand = target.identity.brandName;
    const legal = target.identity.legalName || brand;
    const legalProfile = target.legalProfile;
    const countryName =
      resolveLegalCountryName(target, legalProfile.countryCode) ?? legalProfile.countryCode;
    const jurisdiction = legalProfile.jurisdiction || countryName;
    const email = target.identity.email || "el email publicado en la web";
    const phone = target.whatsapp.phone || target.identity.phone || "";
    const phoneDisplay = phone ? ` · WhatsApp ${phone}` : "";
    const address = target.identity.address || jurisdiction;
    const base = target.baseUrl || "tu dominio";
    const currencyLabel = target.currency === "ARS" ? "pesos argentinos (ARS)" : target.currency;
    const handling = formatPolicyDays(
      target.policies.shipping.handlingDaysMin,
      target.policies.shipping.handlingDaysMax,
    );
    const transit = formatPolicyDays(
      target.policies.shipping.transitDaysMin,
      target.policies.shipping.transitDaysMax,
    );
    const coverage = policyCoverage(target.policies.shipping.countries);
    const returnsDays = String(target.policies.returns.returnDays);
    const paymentMethods =
      legalProfile.paymentMethods.join(", ") || "los medios informados por la tienda";
    const salesChannels =
      legalProfile.salesChannels.join(", ") || "los canales publicados por la tienda";
    const withdrawal = legalProfile.consumerRights.enabled
      ? `${ARGENTINA_LEGAL_PROFILE.withdrawal.label} (${ARGENTINA_LEGAL_PROFILE.withdrawal.defaultDays} días desde la compra, ${ARGENTINA_LEGAL_PROFILE.withdrawal.reference}) disponible cuando corresponda según el canal de venta: ${ARGENTINA_LEGAL_PROFILE.withdrawal.href}.`
      : "La tienda no declara habilitado un botón de arrepentimiento en su perfil legal.";
    return `Los precios y la disponibilidad se confirman antes del pago. Este sitio funciona como catálogo y carrito local para preparar un pedido que luego se coordina directamente con ${brand}.

## 1. Identificación y objeto
Titular: ${legal} (${brand}) · ${address} · Contacto: ${email}${phoneDisplay} · Sitio: ${base}. Este documento regula el uso del catálogo online en ${countryName}, la preparación del pedido en el navegador y las condiciones para coordinar una compra por WhatsApp o email.

## 2. Naturaleza del sitio y del carrito
El sitio es una vidriera estática sin carrito en servidor ni cobro online. Podés navegar categorías, productos, colecciones, buscar y armar un carrito. El carrito vive en tu navegador y no genera reserva de stock ni contrato hasta que lo confirmemos por WhatsApp o email. El botón “Preparar pedido” genera un resumen que vos enviás voluntariamente. Sin confirmación bilateral, no hay venta perfeccionada.

## 3. Precios, moneda y disponibilidad
- Todos los precios se exhiben en ${currencyLabel} y corresponden al momento de la navegación. Pueden variar sin previo aviso por actualización de listas, impuestos o costos logísticos.
- El subtotal y total que ves son estimativos y no incluyen envío salvo que se indique lo contrario.
- La disponibilidad se actualiza periódicamente pero no es en tiempo real; el stock definitivo y el precio vigente se confirman al responder tu mensaje.
- Errores evidentes de tipografía o carga no obligan a honrar un precio manifiestamente irrisorio; te lo informaremos antes de avanzar.

## 4. Cómo coordinar un pedido
1. Agregás productos y variantes al carrito, indicás cantidad.
2. Completás nombre, teléfono, dirección o punto de entrega y notas opcionales.
3. Presionás “Preparar pedido” y luego “Enviar pedido en WhatsApp”. Se abrirá WhatsApp con un mensaje pre-armado que incluye el detalle.
4. Respondemos verificando precio, stock, opciones de pago y costo/tiempos de envío.
5. Si aceptás, coordinamos el pago y la entrega.
Podés consultar sin comprar usando “Consultar por WhatsApp” en cada producto.

## 5. Pagos
El sitio no cobra online. No ingresás tarjetas ni datos bancarios aquí. Las formas de pago declaradas por la tienda son: ${paymentMethods}. Los canales de venta declarados son: ${salesChannels}. El pedido se considera pagado cuando el medio elegido lo acredita y nosotros lo confirmamos. No compartas comprobantes sensibles fuera de nuestros canales oficiales.

## 6. Entregas y envíos
- Coordinamos el envío y su costo antes de confirmar el pedido. Plazos informativos de preparación: ${handling}; tránsito estimado: ${transit} — son orientativos y dependen de localidad, operador y demanda.
- Cobertura principal: ${coverage}. Otras zonas se cotizan a pedido.
- El costo de envío, si aplica, se informa antes del pago y puede variar según peso, volumen y domicilio.
- Entregas pueden verse afectadas por feriados, clima o incidencias del transporte; te mantenemos informado por el mismo canal.

## 7. Cambios, devoluciones y garantía
- Tenés ${returnsDays} días corridos desde la recepción para solicitar cambio. El producto debe conservar su estado original, sin uso, con embalaje y etiquetas. Para descartables y productos de higiene/packaging, el cambio se evalúa por lote y condición higiénica; te lo informaremos antes de confirmar.
- Coordiná el cambio por WhatsApp/email con fotos y número de pedido. El costo de reenvío se acuerda según el motivo.
- Productos en promoción, liquidación o personalizados pueden tener condiciones específicas informadas en el detalle.
- Garantía legal conforme al Código Civil y Comercial y ${ARGENTINA_LEGAL_PROFILE.consumerLaw.label} por vicios o defectos. No cubre mal uso o almacenamiento inadecuado.

## 8. Uso del contenido y propiedad intelectual
Textos, fotos, gráficos, logo y diseño pertenecen a ${brand} o a sus proveedores y están protegidos. Podés compartir enlaces al sitio, pero no copiar, modificar ni usar el contenido con fines comerciales sin autorización.

## 9. Disponibilidad y responsabilidad
Hacemos esfuerzos razonables para que el sitio esté disponible y la información sea precisa, pero al ser provisto “tal cual” no garantizamos ausencia de errores o interrupciones. No somos responsables por daños derivados del uso del sitio, incompatibilidades de tu dispositivo o fallas de servicios externos (WhatsApp, hosting, red).

## 10. Contacto, arrepentimiento y reclamos
Escribinos a ${email}${phone ? ` o por WhatsApp al ${phone}` : ""} para consultas, correcciones o ejercicio de derechos. ${withdrawal} Para controversias, podés acudir a ${ARGENTINA_LEGAL_PROFILE.consumerAuthority.label}: ${ARGENTINA_LEGAL_PROFILE.consumerAuthority.href}.

## 11. Ley aplicable y jurisdicción
Estas condiciones se rigen por las leyes de ${jurisdiction}. Para cualquier divergencia, serán competentes los tribunales ordinarios del domicilio del consumidor, sin perjuicio de los derechos que te otorga ${ARGENTINA_LEGAL_PROFILE.consumerLaw.label}.

## 12. Actualizaciones
Podemos actualizar estos Términos para reflejar cambios operativos o legales. La versión vigente es la publicada en esta página con fecha de actualización. Al continuar usando el sitio o coordinar un nuevo pedido aceptás las condiciones actualizadas. Última actualización: ${formatLegalRevisionAt(target)}.`;
  };
  const renderV2LegalArticle = (
    title: string,
    eyebrow: string,
    summary: string,
    rawDetails: string,
  ) => {
    const isPrivacy = title === copy.pages.privacy;
    const isTerms = title === copy.pages.terms;
    const override = isPrivacy
      ? project.legalProfile.privacyOverride.trim()
      : isTerms
        ? project.legalProfile.termsOverride.trim()
        : "";
    let details = override || rawDetails;
    if (!override && isPrivacy && isLegacyPrivacyText(rawDetails))
      details = buildDefaultPrivacyRichText(project);
    if (!override && isTerms && isLegacyTermsText(rawDetails))
      details = buildDefaultTermsRichText(project);
    const hasRichMarkers = details.includes("## ") || details.includes("\n\n");
    const formatted = hasRichMarkers
      ? formatRichPolicyText(details)
      : `<p>${escapeHtml(details)}</p>`;
    return [
      renderPageSections(sharedHeader, { pageType: "legal" }),
      `<main class="solara-editorial-page solara-policy-page solara-container"><nav class="solara-breadcrumbs" aria-label="${escapeAttribute(copy.export.breadcrumbs)}"><a href="${internalHref(project, "/")}">${escapeHtml(copy.pages.home)}</a><span aria-hidden="true">/</span><span>${escapeHtml(title)}</span></nav><header class="solara-page-intro"><p class="solara-eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></header><article class="solara-legal-article">${formatted}</article></main>`,
      renderPageSections(sharedFooter, { pageType: "legal" }),
    ].join("");
  };

  const notFoundPage: PageDescriptor = {
    path: "404.html",
    title: `${copy.pages.notFound} | ${project.identity.brandName}`,
    description: defaultSeoDescription,
    canonicalPath: "/404.html",
    pageType: "not-found",
    body: isV2Design
      ? `${renderPageSections(sharedHeader, { pageType: "legal" })}<main class="solara-container solara-error-page"><nav class="solara-breadcrumbs" aria-label="${escapeAttribute(copy.export.breadcrumbs)}"><a href="${internalHref(project, "/")}">${escapeHtml(copy.pages.home)}</a><span aria-hidden="true">/</span><span>404</span></nav><section class="solara-error-hero"><div class="solara-error-copy"><p class="solara-eyebrow">${escapeHtml(copy.pages.notFoundEyebrow)}</p><h1>${escapeHtml(copy.pages.notFoundTitle)}</h1><p>${escapeHtml(copy.pages.notFoundDescription)}</p><div class="solara-error-actions"><a class="solara-primary-action" href="${internalHref(project, "/")}">${escapeHtml(copy.pages.returnHome)}</a>${firstRootCategory ? `<a class="solara-secondary-action" href="${escapeAttribute(internalHref(project, `/categorias/${firstRootCategory.slug}/`))}">${escapeHtml(copy.pages.viewCategories)}</a>` : ""}</div></div><p class="solara-error-code" aria-hidden="true">404</p></section></main>${renderPageSections(notFoundFooter, { pageType: "legal" })}`
      : `${renderPageSections(sharedHeader, { pageType: "legal" })}<main class="solara-container solara-error-page"><p class="solara-eyebrow">404</p><h1>${escapeHtml(copy.pages.notFoundTitle)}</h1><p>${escapeHtml(copy.pages.notFoundDescription)}</p><a class="solara-primary-action" href="${internalHref(project, "/")}">${escapeHtml(copy.pages.returnHome)}</a></main>${renderPageSections(notFoundFooter, { pageType: "legal" })}`,
    structuredData: [],
  };

  const legalPages: PageDescriptor[] = [
    {
      path: "envios/index.html",
      title: `${copy.pages.shipping} | ${project.identity.brandName}`,
      description: project.policies.shipping.summary,
      canonicalPath: "/envios/",
      pageType: "legal",
      body: isV2Design
        ? renderV2PolicyPage(
            copy.pages.shipping,
            copy.pages.shippingDeliveryInfo,
            project.policies.shipping.summary,
            project.policies.shipping.details,
            [
              [
                copy.pages.shippingPreparation,
                formatPolicyDays(
                  project.policies.shipping.handlingDaysMin,
                  project.policies.shipping.handlingDaysMax,
                ),
              ],
              [
                copy.pages.shippingTransit,
                formatPolicyDays(
                  project.policies.shipping.transitDaysMin,
                  project.policies.shipping.transitDaysMax,
                ),
              ],
              [copy.pages.policyCoverage, policyCoverage(project.policies.shipping.countries)],
            ],
          )
        : `${renderPageSections(sharedHeader, { pageType: "legal" })}<main class="solara-container"><h1>${escapeHtml(copy.pages.shipping)}</h1><p>${escapeHtml(project.policies.shipping.details)}</p></main>${renderPageSections(sharedFooter, { pageType: "legal" })}`,
      structuredData: [],
    },
    {
      path: "devoluciones/index.html",
      title: `${copy.pages.returns} | ${project.identity.brandName}`,
      description: project.policies.returns.summary,
      canonicalPath: "/devoluciones/",
      pageType: "legal",
      body: isV2Design
        ? renderV2PolicyPage(
            copy.pages.returns,
            copy.pages.returnsConditions,
            project.policies.returns.summary,
            project.policies.returns.details,
            [
              [
                copy.pages.returnsInformedPeriod,
                formatPolicyDays(
                  project.policies.returns.returnDays,
                  project.policies.returns.returnDays,
                ),
              ],
              [copy.pages.policyCoverage, policyCoverage(project.policies.returns.countries)],
            ],
          )
        : `${renderPageSections(sharedHeader, { pageType: "legal" })}<main class="solara-container"><h1>${escapeHtml(copy.pages.returns)}</h1><p>${escapeHtml(project.policies.returns.details)}</p></main>${renderPageSections(sharedFooter, { pageType: "legal" })}`,
      structuredData: [],
    },
    {
      path: "privacidad/index.html",
      title: `${copy.pages.privacy} | ${project.identity.brandName}`,
      description: copy.pages.privacyDescription,
      canonicalPath: "/privacidad/",
      pageType: "legal",
      body: isV2Design
        ? renderV2LegalArticle(
            copy.pages.privacy,
            copy.pages.privacyDataUsage,
            copy.pages.privacyDescription,
            project.policies.privacy,
          )
        : `${renderPageSections(sharedHeader, { pageType: "legal" })}<main class="solara-container"><h1>${escapeHtml(copy.pages.privacy)}</h1><p>${escapeHtml(project.policies.privacy)}</p></main>${renderPageSections(sharedFooter, { pageType: "legal" })}`,
      structuredData: [],
    },
    {
      path: "terminos/index.html",
      title: `${copy.pages.terms} | ${project.identity.brandName}`,
      description: copy.pages.termsDescription,
      canonicalPath: "/terminos/",
      pageType: "legal",
      body: isV2Design
        ? renderV2LegalArticle(
            copy.pages.terms,
            copy.footer.terms,
            copy.pages.termsSubtitle,
            project.policies.terms,
          )
        : `${renderPageSections(sharedHeader, { pageType: "legal" })}<main class="solara-container"><h1>${escapeHtml(copy.pages.terms)}</h1><p>${escapeHtml(project.policies.terms)}</p></main>${renderPageSections(sharedFooter, { pageType: "legal" })}`,
      structuredData: [],
    },
  ];

  const publishedLegalPages = isV2Design
    ? legalPages.filter(
        (page) => page.canonicalPath !== "/envios/" && page.canonicalPath !== "/devoluciones/",
      )
    : legalPages;

  return [
    home,
    ...(project.commerceTemplates.search.enabled ? [searchPage] : []),
    ...(project.commerceTemplates.cart.enabled ? [cartPage] : []),
    notFoundPage,
    ...categories,
    ...collections,
    ...products,
    ...publishedLegalPages,
  ].map((page) => ({
    ...page,
    body: page.body || `<main><p>${escapeHtml(project.publicCopy.empty.page)}</p></main>`,
  }));
}

function externalHosts(project: StoreProjectV1): string[] {
  const values = [
    ...project.assets.flatMap((asset) => [
      asset.source,
      asset.fallbackSource ?? "",
      ...(asset.responsiveSources?.map((source) => source.source) ?? []),
    ]),
    ...project.videos.map((video) => video.source),
  ];
  const hosts = new Set<string>();
  for (const value of values) {
    if (!/^https?:\/\//i.test(value)) continue;
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      // La auditoría de URLs reporta la entrada inválida; no se publica como host.
    }
  }
  if (publicWhatsAppPhone(project)) hosts.add("wa.me");
  return [...hosts].sort();
}

function isAllowedPublicPath(path: string): boolean {
  if (!path || /^[\\/]|^[A-Za-z]:[\\/]|(^|[\\/])\.\.(?:[\\/]|$)/.test(path)) return false;
  return /^(?:index\.html|404\.html|[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*\/index\.html|assets\/[A-Za-z0-9._+-]+|icons\/icon-(?:192|512)\.png|offline\/index\.html|manifest\.webmanifest|sw\.js|favicon\.ico|robots\.txt|sitemap\.xml|image-sitemap\.xml|video-sitemap\.xml|google-merchant\.xml|ai-context\.json|llms(?:-full)?\.txt|search-index\.json|catalog-index\.json|feed\.xml|_headers|_worker\.js|_redirects|\.well-known\/security\.txt|deployment-manifest\.json|solara-recovery\/[0-9a-f]{64}\/(?:manifest\.json|slim\.json\.gz|assets\.json))$/.test(
    path,
  );
}

function assertPublicFileMap(files: ReadonlyMap<string, string | Uint8Array>): void {
  for (const path of files.keys()) {
    if (
      path.includes(".solara.json") ||
      path.includes("proyectos/") ||
      path.includes(".local-backups")
    ) {
      throw new Error(`El mapa público contiene un archivo privado: ${path}`);
    }
    if (!isAllowedPublicPath(path)) {
      throw new Error(`El mapa público contiene una ruta fuera de la allowlist: ${path}`);
    }
  }
}

function exportedAssetPath(project: StoreProjectV1, value: string): string | undefined {
  if (/^data:/i.test(value)) return undefined;
  let url: URL;
  try {
    url = new URL(value, `${normalizeBaseUrl(project.baseUrl)}/`);
  } catch {
    return undefined;
  }
  let pathname = url.pathname;
  const prefix = baseUrlPathname(project.baseUrl);
  if (prefix) {
    if (pathname === prefix) pathname = "/";
    else if (pathname.startsWith(`${prefix}/`)) pathname = pathname.slice(prefix.length);
    else return undefined;
  }
  const path = pathname.replace(/^\/+/, "");
  return path.startsWith("assets/") ? path : undefined;
}

function assertPublicArtifactReferences(
  files: ReadonlyMap<string, string | Uint8Array>,
  project: StoreProjectV1,
): void {
  const assertReference = (value: string, context: string): void => {
    const path = exportedAssetPath(project, value);
    if (path && !files.has(path)) {
      throw new Error(
        `El artefacto público referencia un asset inexistente (${context}): ${value}`,
      );
    }
  };

  for (const [path, value] of files) {
    if (typeof value !== "string") continue;
    if (path.endsWith(".html")) {
      for (const match of value.matchAll(/\b(?:href|src|poster)=["']([^"']+)["']/gi)) {
        assertReference(match[1] ?? "", path);
      }
      for (const match of value.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
        for (const candidate of (match[1] ?? "").split(",")) {
          assertReference(candidate.trim().split(/\s+/)[0] ?? "", path);
        }
      }
      const ogImage = value.match(/<meta\s+[^>]*property="og:image"[^>]*content="([^"]*)"/i)?.[1];
      if (ogImage) {
        const ogType = value.match(
          /<meta\s+[^>]*property="og:image:type"[^>]*content="([^"]*)"/i,
        )?.[1];
        const twitterImage = value.match(
          /<meta\s+[^>]*name="twitter:image"[^>]*content="([^"]*)"/i,
        )?.[1];
        if (!ogType || !/^image\/[a-z0-9.+-]+$/i.test(ogType)) {
          throw new Error(
            `La metadata social de ${path} declara un MIME inválido: ${ogType ?? "ausente"}.`,
          );
        }
        if (twitterImage !== ogImage) {
          throw new Error(`La metadata social de ${path} desincroniza og:image y twitter:image.`);
        }
        const localPath = exportedAssetPath(project, ogImage);
        const bytes = localPath ? files.get(localPath) : undefined;
        if (localPath && !bytes) {
          throw new Error(
            `La metadata social de ${path} apunta a un archivo inexistente: ${ogImage}`,
          );
        }
        if (bytes && typeof bytes !== "string") {
          const actualMimeType = imageMimeTypeFromBytes(bytes);
          if (actualMimeType && actualMimeType !== ogType) {
            throw new Error(
              `La metadata social de ${path} declara ${ogType}, pero el archivo es ${actualMimeType}.`,
            );
          }
        }
      }
    }
    if (path.endsWith(".xml")) {
      for (const match of value.matchAll(/<(?:image:loc|video:content_loc)>([^<]+)</gi)) {
        assertReference(match[1] ?? "", path);
      }
    }
  }
}

function fileHash(value: string | Uint8Array): string {
  return sha256Hex(value);
}

function sameFileContent(left: string | Uint8Array, right: string | Uint8Array): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

function setFileChecked(
  files: Map<string, string | Uint8Array>,
  path: string,
  value: string | Uint8Array,
): void {
  const previous = files.get(path);
  if (previous === undefined) {
    files.set(path, value);
    return;
  }
  if (!sameFileContent(previous, value)) {
    throw new Error(
      `La exportación detectó una colisión de archivos con contenido distinto: ${path}`,
    );
  }
}

function writeDataAsset(
  files: Map<string, string | Uint8Array>,
  asset: ImageAsset,
  kind: "primary" | "fallback",
  source: string,
  width: number | undefined,
  semanticNames: boolean,
): void {
  const bytes = dataUrlBytes(source);
  if (!bytes) {
    if (/^data:/i.test(source)) {
      throw new Error(`El asset ${asset.id} contiene una data URL inválida.`);
    }
    return;
  }
  const actualMimeType = imageMimeTypeFromBytes(bytes);
  if (!actualMimeType) {
    throw new Error(`El asset ${asset.id} contiene bytes de imagen irreconocibles.`);
  }
  const actualExtension = mimeTypeExtension(actualMimeType);
  const outputExtension = imageExtensionFromSource(source, assetExtension(asset));
  if (actualExtension && outputExtension !== actualExtension) {
    throw new Error(
      `El asset ${asset.id} declara una extensión incompatible con sus bytes reales (${outputExtension} vs ${actualExtension}).`,
    );
  }
  const path = publicAssetPath(asset, kind, source, width, semanticNames).slice(1);
  setFileChecked(files, path, bytes);
}

function addDeploymentManifest(
  files: Map<string, string | Uint8Array>,
  project: StoreProjectV1,
  mode: ExportMode,
  publicAiContext: boolean,
  runtimeAssets: RuntimeAssetPaths,
): {
  manifest: DeploymentManifestV1;
  revision: string;
  essentialFileHashes: Record<string, string>;
} {
  assertPublicFileMap(files);
  const essentialPaths = [
    "index.html",
    runtimeAssets.css.slice(1),
    runtimeAssets.js.slice(1),
    "sw.js",
    "manifest.webmanifest",
    ...(mode === "production" ? ["_headers", "_worker.js"] : []),
  ].filter((path) => files.has(path));
  const essentialFileHashes: Record<string, string> = Object.fromEntries(
    essentialPaths.sort().map((path) => [path, fileHash(files.get(path) as string | Uint8Array)]),
  );
  const runtime = { css: runtimeAssets.css, js: runtimeAssets.js };
  const revision = sha256Hex(
    JSON.stringify({ mode, baseUrl: project.baseUrl, runtime, essentialFileHashes }),
  ).slice(0, 16);
  const deploymentManifest: DeploymentManifestV1 = {
    version: 1,
    mode,
    baseUrl: project.baseUrl,
    revision,
    runtime,
    publicAiContext,
    externalHosts: externalHosts(project),
    essentialFileHashes,
  };
  files.set("deployment-manifest.json", JSON.stringify(deploymentManifest, null, 2));
  assertPublicFileMap(files);
  return { manifest: deploymentManifest, revision, essentialFileHashes };
}

function buildFiles(
  project: StoreProjectV1,
  mode: ExportMode,
  publicAiContext: boolean,
  semanticNames: boolean,
  socialImageCrops?: ReadonlyMap<string, SocialImageCrop>,
  recoveryFiles?: ReadonlyMap<string, string | Uint8Array>,
): Map<string, string | Uint8Array> {
  const socialImageOptions: SocialImageResolutionOptions = {
    compatibilityByAssetId: socialImageCompatibilityByAssetId(project),
    ...(mode === "production" && socialImageCrops?.size ? { socialImageCrops } : {}),
  };
  const sourceMedia = publicMediaUsage(project, socialImageOptions);
  const publicProject = projectWithPublicAssetUrls(
    project,
    semanticNames,
    socialImageOptions,
    sourceMedia,
  );
  const snapshot = buildCommerceSnapshot(publicProject);
  const pages = buildPages(publicProject, snapshot, {
    socialImageOptions,
    mediaUsage: sourceMedia,
  });
  const manifest = createPublicExportManifestWithMedia(
    publicProject,
    pages,
    socialImageOptions,
    sourceMedia,
  );
  const fontFiles = fontFilesFor(
    publicProject.theme.typography.display,
    publicProject.theme.typography.body,
  );
  const fontPathOverrides = new Map(
    [...fontFiles].map(([path, bytes]) => [
      path,
      `assets/font.${sha256Hex(bytes).slice(0, 16)}.woff2`,
    ]),
  );
  const cssFull = minifyCss(
    `${themeCss(publicProject, "file", fontPathOverrides)}\n${exportedModuleStyles(publicProject)}\n${STOREFRONT_RUNTIME_CSS}`,
  );
  const cssHome = minifyCss(
    `${themeCss(publicProject, "file", fontPathOverrides)}\n${previewModuleStyles(publicProject, "/")}\n${STOREFRONT_RUNTIME_CSS}`,
  );
  const cssFullPath = `/assets/storefront.${sha256Hex(cssFull).slice(0, 16)}.css`;
  const cssHomePath = `/assets/storefront-home.${sha256Hex(cssHome).slice(0, 16)}.css`;
  const unifiedHomeCss = cssHome === cssFull;
  const runtimeSource =
    mode === "draft"
      ? `// DEBUG: modo draft — source map disponible via scripts/build-runtime.mjs\n${STOREFRONT_RUNTIME_JS}`
      : STOREFRONT_RUNTIME_JS;
  const runtimeAssetsFull: RuntimeAssetPaths = {
    css: cssFullPath,
    js: `/assets/storefront.${sha256Hex(runtimeSource).slice(0, 16)}.js`,
    fontPaths: fontPathOverrides,
    serviceWorker: true,
  };
  const runtimeAssetsHome: RuntimeAssetPaths = {
    css: unifiedHomeCss ? cssFullPath : cssHomePath,
    js: runtimeAssetsFull.js,
    fontPaths: fontPathOverrides,
    serviceWorker: true,
  };
  const mediaUsage = {
    assetIds: new Set(manifest.usedAssetIds),
    videoIds: new Set(manifest.usedVideoIds),
  };
  const files = new Map<string, string | Uint8Array>();
  pages.forEach((page) => {
    const assets = page.pageType === "home" ? runtimeAssetsHome : runtimeAssetsFull;
    files.set(
      page.path,
      prefixDocumentHrefs(
        publicProject,
        renderDocument(
          publicProject,
          page,
          mode,
          publicAiContext,
          manifest,
          assets,
          socialImageOptions,
        ),
      ),
    );
  });
  files.set(cssFullPath.slice(1), cssFull);
  if (!unifiedHomeCss) files.set(cssHomePath.slice(1), cssHome);
  files.set(runtimeAssetsFull.js.slice(1), runtimeSource);
  const copyJson = JSON.stringify(publicProject.publicCopy);
  files.set(`assets/copy.${sha256Hex(copyJson).slice(0, 16)}.json`, copyJson);
  fontFiles.forEach((bytes, path) => {
    files.set(fontPathOverrides.get(path) ?? path, bytes);
  });
  if (manifest.searchEnabled) files.set("search-index.json", buildSearchIndex(publicProject));
  if (manifest.cartEnabled || manifest.checkoutEnabled || publicProject.siteShell.cart)
    files.set("catalog-index.json", buildCatalogIndex(publicProject));
  if (recoveryFiles) {
    for (const [path, value] of recoveryFiles) setFileChecked(files, path, value);
  }
  files.set(
    "robots.txt",
    mode === "draft"
      ? "User-agent: *\nDisallow: /\n"
      : `User-agent: *\nAllow: /\nDisallow: /solara-recovery/\nSitemap: ${absoluteUrl(publicProject, "/sitemap.xml")}\n`,
  );
  if (mode === "production") {
    files.set("sitemap.xml", buildSitemap(publicProject, pages, manifest));
    files.set("image-sitemap.xml", buildImageSitemap(publicProject, pages));
    if (manifest.usedVideoIds.length > 0)
      files.set("video-sitemap.xml", buildVideoSitemap(publicProject));
  }
  if (mode === "production") {
    files.set("google-merchant.xml", buildMerchantFeed(publicProject, snapshot));
    if (publicAiContext) {
      files.set("ai-context.json", buildAiContext(publicProject, { compact: true }));
      files.set("llms.txt", buildLlmsTxt(publicProject));
      files.set("llms-full.txt", buildLlmsFullTxt(publicProject));
    }
    files.set(
      "_headers",
      `/*
  Cache-Control: public, max-age=0, must-revalidate, stale-while-revalidate=86400
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; media-src 'self' data: https:; font-src 'self' data:; manifest-src 'self'; worker-src 'self'; form-action 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Access-Control-Expose-Headers: Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Cache-Control, Referrer-Policy, Permissions-Policy

/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable

/sitemap.xml
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

/image-sitemap.xml
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

${
  manifest.usedVideoIds.length > 0
    ? `/video-sitemap.xml
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

`
    : ""
}/google-merchant.xml
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate
  Content-Type: application/xml; charset=utf-8

/ai-context.json
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/llms.txt
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/llms-full.txt
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/search-index.json
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/catalog-index.json
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate
${
  recoveryFiles
    ? `/solara-recovery/*
  ! Cache-Control
  Cache-Control: public, max-age=0, must-revalidate
  X-Robots-Tag: noindex, nofollow
  Access-Control-Allow-Origin: *

`
    : ""
}
/sw.js
  ! Cache-Control
  Cache-Control: no-cache

/manifest.webmanifest
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

/feed.xml
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate
  Content-Type: application/rss+xml; charset=utf-8
`,
    );
    files.set(
      "_worker.js",
      buildCfWorkerSource({ canonicalOrigin: normalizeBaseUrl(publicProject.baseUrl) }),
    );
  }
  // PWA: manifest y service worker para instalación y cache offline.
  const logoAsset = project.assets.find((asset) => asset.id === project.identity.logoAssetId);
  const logoBytes = logoAsset ? dataUrlBytes(logoAsset.source) : undefined;
  files.set("icons/icon-192.png", generateStoreIconPng(publicProject, 192, logoBytes));
  files.set("icons/icon-512.png", generateStoreIconPng(publicProject, 512, logoBytes));
  files.set("favicon.ico", faviconIcoForProject(project));
  files.set("offline/index.html", buildOfflinePage(publicProject));
  files.set("manifest.webmanifest", buildWebManifest(publicProject));
  const precacheContent = new Map<string, string | Uint8Array>([
    [assetHref(publicProject, "/"), files.get("index.html") ?? ""],
    [assetHref(publicProject, "/offline/index.html"), files.get("offline/index.html") ?? ""],
    [assetHref(publicProject, "/manifest.webmanifest"), files.get("manifest.webmanifest") ?? ""],
    [assetHref(publicProject, runtimeAssetsFull.css), cssFull],
    [assetHref(publicProject, runtimeAssetsFull.js), runtimeSource],
  ]);
  if (!unifiedHomeCss) precacheContent.set(assetHref(publicProject, cssHomePath), cssHome);
  if (mode === "production") {
    const rss = buildRssFeed(publicProject);
    if (rss) files.set("feed.xml", rss);
    const expiresDate = new Date(
      new Date(publicProject.updatedAt).getTime() + 31536000000,
    ).toISOString();
    const securityEmail = publicProject.identity.email.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(securityEmail)) {
      files.set(
        ".well-known/security.txt",
        `Contact: mailto:${securityEmail}\nExpires: ${expiresDate}\nCanonical: ${absoluteUrl(publicProject, "/.well-known/security.txt")}\n`,
      );
    }
    files.set("_redirects", "# Solara redirect rules\n");
  }

  const faviconAssetId = project.seo.faviconAssetId;
  let faviconOnlyAsset: ImageAsset | undefined;
  if (faviconAssetId) {
    const usageWithoutFavicon = publicMediaUsage(
      { ...project, seo: { ...project.seo, faviconAssetId: undefined } },
      socialImageOptions,
    );
    if (!usageWithoutFavicon.assetIds.has(faviconAssetId)) {
      faviconOnlyAsset = project.assets.find((asset) => asset.id === faviconAssetId);
    }
  }
  project.assets
    .filter((asset) => mediaUsage.assetIds.has(asset.id))
    .forEach((asset) => {
      const dedupedFaviconPrimary =
        faviconOnlyAsset?.id === asset.id &&
        imageMimeTypeFromSource(asset.source, asset.mimeType) === "image/x-icon";
      if (!dedupedFaviconPrimary)
        writeDataAsset(files, asset, "primary", asset.source, undefined, semanticNames);
      if (asset.fallbackSource)
        writeDataAsset(files, asset, "fallback", asset.fallbackSource, undefined, semanticNames);
      responsiveSourcesForAsset(asset)?.forEach((source) => {
        if (source.source === asset.source) return;
        writeDataAsset(files, asset, "primary", source.source, source.width, semanticNames);
      });
    });
  project.videos
    .filter((video) => mediaUsage.videoIds.has(video.id))
    .forEach((video) => {
      const bytes = dataUrlBytes(video.source);
      if (/^data:/i.test(video.source)) {
        if (!bytes || bytes.length === 0) {
          throw new Error(`El video ${video.id} contiene una data URL inválida.`);
        }
        setFileChecked(files, `assets/${video.hash}.${assetExtension(video)}`, bytes);
      }
    });
  if (socialImageOptions.socialImageCrops) {
    for (const [assetId, crop] of socialImageOptions.socialImageCrops) {
      const asset = project.assets.find((candidate) => candidate.id === assetId);
      const bytes = dataUrlBytes(crop.dataUrl);
      if (!asset || !bytes || bytes.length === 0) continue;
      setFileChecked(files, socialOgImagePath(asset).slice(1), bytes);
    }
  }
  assertPublicArtifactReferences(files, publicProject);
  const deployment = addDeploymentManifest(
    files,
    publicProject,
    mode,
    publicAiContext,
    runtimeAssetsFull,
  );
  files.set(
    "sw.js",
    buildServiceWorker(publicProject, {
      runtimeCssPath: runtimeAssetsFull.css,
      runtimeJsPath: runtimeAssetsFull.js,
      extraPrecachePaths: [runtimeAssetsHome.css],
      revision: deployment.revision,
      precacheContent,
    }),
  );
  deployment.essentialFileHashes["sw.js"] = fileHash(files.get("sw.js") as string | Uint8Array);
  files.set("deployment-manifest.json", JSON.stringify(deployment.manifest, null, 2));
  return files;
}

/**
 * Envuelve un error interno de generación con la fase en la que ocurrió y
 * conserva el mensaje original como causa, para que el usuario pueda accionar
 * sobre la entidad que falló en lugar de ver un stack interno.
 */
function withExportContext<T>(phase: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`La generación del sitio falló en ${phase}: ${detail}`, {
      cause: error,
    });
  }
}

/**
 * Builds the complete public artifact from one parsed snapshot. Keep all
 * generated files here so Preview, public site, SEO and Merchant cannot drift apart.
 */
export function exportProject(projectInput: StoreProjectV1, options: ExportOptions): ExportResult {
  const project = parseProject(projectInput, "exportar");
  // El contexto IA forma parte del contrato del export de producción. Se
  // conserva la opción para consumidores antiguos y para borradores, pero no
  // permite omitirlo del sitio público final.
  const publicAiContext = options.mode === "production" ? true : (options.publicAiContext ?? true);
  const optimization = optimizeProject(project, {
    mode: options.mode,
    profile: options.optimizationProfile ?? "safe",
    publicAiContext,
  });
  const baseAudit = auditProject(project, publicAiContext, options.mode);
  const existingPaths = new Set(baseAudit.map((issue) => issue.path).filter(Boolean));
  const optimizationAudit: AuditIssue[] = optimization.findings
    .filter((finding) => !finding.path || !existingPaths.has(finding.path))
    .map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      area: finding.area,
      message: finding.message,
      ...(finding.path ? { path: finding.path } : {}),
      ...(finding.entity ? { entity: finding.entity } : {}),
    }));
  const audit = [...baseAudit, ...optimizationAudit];
  const critical = audit.filter((issue) => issue.severity === "critical");
  if (options.mode === "production" && critical.length > 0) {
    throw new Error(
      `La exportación de producción tiene ${critical.length} errores críticos: ${critical
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }

  const files = withExportContext("la fase de archivos del sitio", () =>
    buildFiles(
      project,
      options.mode,
      publicAiContext,
      options.useSemanticNames ?? false,
      options.socialImageCrops,
      options.recoveryFiles,
    ),
  );
  assertExportedFavicon(files);
  return { files, audit, optimization };
}

export function buildOptimizationReport(
  projectInput: StoreProjectV1,
  options: Pick<ExportOptions, "mode" | "publicAiContext" | "optimizationProfile"> = {
    mode: "draft",
    publicAiContext: true,
  },
): OptimizationReport {
  const project = parseProject(projectInput, "auditar la optimizacion");
  const publicAiContext = options.mode === "production" ? true : (options.publicAiContext ?? true);
  return optimizeProject(project, {
    mode: options.mode,
    profile: options.optimizationProfile ?? "safe",
    publicAiContext,
  });
}

/** Renderiza el mismo árbol de exportProject sin escribir archivos. */
export interface CanvasManifestEntry {
  editId: string;
  sectionId: string;
  moduleId: string;
  bindingId: string;
  label: string;
  kind: string;
  fieldKey: string;
  itemFieldKey?: string;
  itemIds?: readonly string[];
  sourceKind?: string;
  entityId?: string;
  entityField?: string;
  capabilities?: readonly string[];
  multiline?: boolean;
  maxLength?: number;
}

/**
 * Manifest de bindings editables del proyecto. Sólo para el preview del
 * editor: nunca se incluye en exportProject ni en el HTML público.
 */
function buildCanvasManifestFromProject(project: StoreProjectV1): {
  entries: CanvasManifestEntry[];
  coverage: Array<{ moduleId: string; editable: boolean; bindings: number; reason?: string }>;
} {
  const entries: CanvasManifestEntry[] = [];
  const seenModules = new Map<string, { bindings: number; reason?: string }>();
  const persistedSections = [
    ...project.sections,
    ...project.pages.flatMap((page) => page.sections),
  ].filter(
    (section, index, all) => all.findIndex((candidate) => candidate.id === section.id) === index,
  );
  const sections = [
    ...persistedSections,
    ...persistedSections
      .filter((section) => section.moduleId === "catalog-product-grid")
      .flatMap((section) =>
        (["category", "collection", "related"] as const).map((pageType) => ({
          ...section,
          id: `${section.id}-${pageType}` as StoreSection["id"],
        })),
      ),
  ];
  const repeaterItemIds = (
    section: StoreSection,
    fieldKey: string,
    settings: Record<string, unknown> = section.settings as Record<string, unknown>,
  ): string[] => {
    const rawItems = settings[fieldKey];
    const persistedIds = Array.isArray(rawItems)
      ? rawItems
          .map((item) =>
            typeof item === "object" && item !== null && "id" in item
              ? (item as { id?: unknown }).id
              : undefined,
          )
          .filter((id): id is string => typeof id === "string")
      : [];

    // The category bento renders a derived repeater when its configured list
    // is empty (or contains no root categories). Its selection IDs must match
    // those generated by the module, otherwise Canvas rejects a visible item.
    if (section.moduleId !== "catalog-category-bento" || fieldKey !== "items") {
      return persistedIds;
    }
    const rootCategoryIds = project.categories
      .filter((category) => !category.parentId)
      .map((category) => category.id);
    const rootCategorySet = new Set<string>(rootCategoryIds);
    const configuredCategoryIds: string[] = [];
    const seenCategoryIds = new Set<string>();
    if (Array.isArray(rawItems)) {
      for (const item of rawItems) {
        if (typeof item !== "object" || item === null) continue;
        const candidate = item as { id?: unknown; categoryId?: unknown };
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.categoryId !== "string" ||
          !rootCategorySet.has(candidate.categoryId) ||
          seenCategoryIds.has(candidate.categoryId)
        ) {
          continue;
        }
        seenCategoryIds.add(candidate.categoryId);
        configuredCategoryIds.push(candidate.id);
      }
    }
    return configuredCategoryIds.length > 0
      ? configuredCategoryIds
      : rootCategoryIds.map((categoryId) => `automatic-category-${categoryId}`);
  };
  const addEntry = (
    section: StoreSection,
    binding: CanvasBinding,
    editId: string,
    sourceKind?: string,
    entityId?: string,
    entityField?: string,
    settings: Record<string, unknown> = section.settings as Record<string, unknown>,
  ): void => {
    if (!binding) return;
    const source = binding.source;
    entries.push({
      editId,
      sectionId: section.id,
      moduleId: section.moduleId,
      bindingId: binding.id,
      label: binding.label,
      kind: binding.kind,
      fieldKey:
        source.kind === "section-setting" || source.kind === "section-repeater-item"
          ? source.fieldKey
          : source.kind === "public-copy"
            ? source.field
            : source.field,
      ...(source.kind === "section-repeater-item" ? { itemFieldKey: source.itemFieldKey } : {}),
      ...(source.kind === "section-repeater-item"
        ? {
            itemIds: repeaterItemIds(section, source.fieldKey, settings),
          }
        : {}),
      ...(sourceKind === undefined ? {} : { sourceKind }),
      ...(entityId === undefined ? {} : { entityId }),
      ...(entityField === undefined ? {} : { entityField }),
      capabilities: binding.capabilities,
      ...(binding.multiline === undefined ? {} : { multiline: binding.multiline }),
      ...(binding.maxLength === undefined ? {} : { maxLength: binding.maxLength }),
    });
  };
  for (const section of sections) {
    const definition = moduleRegistry[section.moduleId];
    if (!definition) continue;
    const settings = definition.settingsSchema.parse(section.settings) as Record<string, unknown>;
    const bindings = definition.canvasBindings ?? [];
    if (!seenModules.has(section.moduleId)) {
      seenModules.set(section.moduleId, {
        bindings: bindings.length,
        ...(bindings.length === 0 ? { reason: "sin bindings declarados" } : {}),
      });
    }
    for (const binding of bindings) {
      const source = binding.source;
      if (source.kind === "section-setting" || source.kind === "section-repeater-item") {
        addEntry(
          section,
          binding,
          `ce-${section.id}-${binding.id}`,
          undefined,
          undefined,
          undefined,
          settings,
        );
        continue;
      }
      const entities =
        source.kind === "identity"
          ? [{ id: project.id, field: source.field }]
          : source.kind === "product"
            ? (source.entityId === "*"
                ? project.products.filter((product) => product.status === "active")
                : project.products.filter((product) => product.id === source.entityId)
              ).map((product) => ({ id: product.id, field: source.field }))
            : source.kind === "category"
              ? (source.entityId === "*"
                  ? project.categories
                  : project.categories.filter((category) => category.id === source.entityId)
                ).map((category) => ({ id: category.id, field: source.field }))
              : source.kind === "collection"
                ? (source.entityId === "*"
                    ? project.collections
                    : project.collections.filter((collection) => collection.id === source.entityId)
                  ).map((collection) => ({ id: collection.id, field: source.field }))
                : source.kind === "asset"
                  ? (source.entityId === "*"
                      ? project.assets
                      : project.assets.filter((asset) => asset.id === source.entityId)
                    ).map((asset) => ({ id: asset.id, field: source.field }))
                  : [{ id: source.group, field: source.field }];
      for (const entity of entities) {
        addEntry(
          section,
          binding,
          canvasEntityEditId(section.id, binding.id, source.kind, entity.id, entity.field),
          source.kind,
          entity.id,
          entity.field,
          settings,
        );
      }
    }
  }
  // Product pages are generated from data rather than persisted sections. Add
  // the same synthetic section IDs used by productDetailSection so a PDP
  // selection resolves against the current product and its real assets.
  const detailModuleId = isModernProject(project) ? "catalog-product-detail" : "product-detail";
  const detailDefinition = moduleRegistry[detailModuleId];
  if (detailDefinition) {
    for (const product of project.products.filter((item) => item.status === "active")) {
      const detailSection: StoreSection = {
        id: `${detailModuleId}-${product.id}` as StoreSection["id"],
        slot: "product",
        moduleId: detailModuleId,
        enabled: true,
        settings: {},
        motion: {
          preset: "fade",
          intensity: 4,
          direction: "up",
          distance: 0,
          duration: 0.45,
          delay: 0,
          stagger: 0,
          easing: "cubic-bezier(.16,1,.3,1)",
          entryPoint: 0.15,
          once: true,
        },
      };
      const bindings = detailDefinition.canvasBindings ?? [];
      for (const binding of bindings) {
        const source = binding.source;
        if (source.kind === "section-setting" || source.kind === "section-repeater-item") {
          addEntry(detailSection, binding, `ce-${detailSection.id}-${binding.id}`);
        } else if (source.kind === "product" && source.entityId === "*") {
          addEntry(
            detailSection,
            binding,
            canvasEntityEditId(detailSection.id, binding.id, source.kind, product.id, source.field),
            source.kind,
            product.id,
            source.field,
          );
        } else if (source.kind === "asset" && source.entityId === "*") {
          for (const assetId of new Set([
            ...product.imageIds,
            ...product.variants
              .map((variant) => variant.imageId)
              .filter((id): id is NonNullable<typeof id> => typeof id === "string"),
          ])) {
            addEntry(
              detailSection,
              binding,
              canvasEntityEditId(detailSection.id, binding.id, source.kind, assetId, source.field),
              source.kind,
              assetId,
              source.field,
            );
          }
        }
      }
    }
  }
  const addGeneratedEntityEntry = (
    sectionId: string,
    moduleId: string,
    bindingId: string,
    label: string,
    kind: string,
    sourceKind: "category" | "collection",
    entityId: string,
    field: string,
    capabilities: readonly string[],
  ): void => {
    const editId = canvasEntityEditId(sectionId, bindingId, sourceKind, entityId, field);
    entries.push({
      editId,
      sectionId,
      moduleId,
      bindingId,
      label,
      kind,
      fieldKey: field,
      sourceKind,
      entityId,
      entityField: field,
      capabilities,
    });
    if (!seenModules.has(moduleId)) {
      seenModules.set(moduleId, { bindings: 1 });
    }
  };
  for (const category of project.categories) {
    const sectionId = `generated-category-${category.id}`;
    addGeneratedEntityEntry(
      sectionId,
      "generated-category-page",
      "category-title",
      "Título de categoría",
      "text",
      "category",
      category.id,
      "title",
      ["edit-text"],
    );
    addGeneratedEntityEntry(
      sectionId,
      "generated-category-page",
      "category-description",
      "Descripción de categoría",
      "text",
      "category",
      category.id,
      "description",
      ["edit-text"],
    );
    addGeneratedEntityEntry(
      sectionId,
      "generated-category-page",
      "category-seo-intro",
      "Introducción SEO de categoría",
      "text",
      "category",
      category.id,
      "seoIntro",
      ["edit-text"],
    );
    addGeneratedEntityEntry(
      sectionId,
      "generated-category-page",
      "category-image",
      "Imagen de categoría",
      "image",
      "category",
      category.id,
      "imageId",
      ["edit-image"],
    );
  }
  for (const collection of project.collections) {
    const sectionId = `generated-collection-${collection.id}`;
    addGeneratedEntityEntry(
      sectionId,
      "generated-collection-page",
      "collection-title",
      "Título de colección",
      "text",
      "collection",
      collection.id,
      "title",
      ["edit-text"],
    );
    addGeneratedEntityEntry(
      sectionId,
      "generated-collection-page",
      "collection-description",
      "Descripción de colección",
      "text",
      "collection",
      collection.id,
      "description",
      ["edit-text"],
    );
    addGeneratedEntityEntry(
      sectionId,
      "generated-collection-page",
      "collection-image",
      "Imagen de colección",
      "image",
      "collection",
      collection.id,
      "imageId",
      ["edit-image"],
    );
  }
  return {
    entries,
    coverage: [...seenModules.entries()].map(([moduleId, info]) => ({
      moduleId,
      editable: info.bindings > 0,
      bindings: info.bindings,
      ...(info.reason === undefined ? {} : { reason: info.reason }),
    })),
  };
}

export function buildCanvasManifest(
  projectInput: StoreProjectV1,
  _options: { path?: string } = {},
): ReturnType<typeof buildCanvasManifestFromProject> {
  return buildCanvasManifestFromProject(
    parseProject(projectInput, "construir el manifest del canvas"),
  );
}

/** Renderiza el mismo árbol de exportProject sin escribir archivos. */
export function renderPreviewHtml(
  projectInput: StoreProjectV1,
  mode: ExportMode = "draft",
  path = "/",
  options: {
    assetTransport?: "inline" | "parent";
    /** Activa los atributos data-canvas en la sección indicada (sólo editor). */
    editor?: { enabled: true; sectionId: string };
  } = {},
): string | { html: string; canvasManifest: ReturnType<typeof buildCanvasManifest> } {
  const project = parseProject(projectInput, "renderizar la vista previa");
  const socialImageOptions: SocialImageResolutionOptions = {
    compatibilityByAssetId: socialImageCompatibilityByAssetId(project),
  };
  const sourceMedia = publicMediaUsage(project, socialImageOptions);
  const previewAssets = createPreviewAssetBundle(project);
  const pages = withExportContext("la fase de páginas del sitio", () =>
    buildPages(previewAssets.project, undefined, {
      editor: options.editor?.enabled === true,
      socialImageOptions,
      mediaUsage: sourceMedia,
    }),
  );
  const manifest = createPublicExportManifestWithMedia(
    previewAssets.project,
    pages,
    socialImageOptions,
    sourceMedia,
  );
  const canvasManifest = options.editor?.enabled
    ? buildCanvasManifestFromProject(previewAssets.project)
    : undefined;
  const page =
    pages.find((candidate) => candidate.canonicalPath === path) ??
    pages.find((candidate) => candidate.pageType === "not-found") ??
    pages[0];
  if (!page) throw new Error("No se pudo renderizar la página inicial.");
  // El editor re-renderiza el body de la página objetivo con los atributos
  // data-canvas de su sección; el resto de páginas queda idéntico al export.
  const pageForRender =
    options.editor?.enabled && page.pageType === "home"
      ? (() => {
          if (options.editor.sectionId === "*") {
            const configuredHomeSections = previewAssets.project.pages.find(
              (candidate) => candidate.kind === "home",
            )?.sections;
            const sections =
              configuredHomeSections && configuredHomeSections.length > 0
                ? configuredHomeSections
                : previewAssets.project.sections;
            const body = renderProjectSections(previewAssets.project, sections, {
              pageType: "home",
              canvasSectionId: "*",
            });
            return { ...page, body };
          }
          const section = previewAssets.project.sections.find(
            (item) => item.id === options.editor?.sectionId,
          );
          if (!section) return page;
          const body = renderProjectSections(previewAssets.project, [section], {
            pageType: "home",
            canvasSectionId: options.editor.sectionId,
          });
          return {
            ...page,
            body: body.replace("<section", `<section data-canvas-root="${section.id}"`),
          };
        })()
      : page;
  let document = withExportContext("la fase de documentos del sitio", () =>
    renderDocument(
      previewAssets.project,
      pageForRender,
      mode,
      false,
      manifest,
      {
        css: "/assets/storefront.css",
        js: "/assets/storefront.js",
        serviceWorker: false,
      },
      socialImageOptions,
    ),
  );
  document = prefixDocumentHrefs(project, document);
  const previewFaviconHref = `data:image/x-icon;base64,${toBase64Bytes(faviconIcoForProject(project))}`;
  const previewFaviconAttribute = ` data-solara-preview-favicon="${escapeAttribute(previewFaviconHref)}"`;
  document = document.replace(
    /(<link rel="(?:icon|shortcut icon)" href="[^"]*\/favicon\.ico")/g,
    `$1${previewFaviconAttribute}`,
  );
  const usedSources = new Map(
    [...previewAssets.sources].filter(([path]) => document.includes(path)),
  );
  if (options.assetTransport === "parent") {
    document = deferPreviewAssetMarkup(document, usedSources);
  }
  const stylesheetHref = assetHref(project, "/assets/storefront.css");
  const storefrontSrc = assetHref(project, "/assets/storefront.js");
  const html = document
    .replace("</body>", `${previewAssetMarkup(usedSources, options.assetTransport)}\n</body>`)
    .replace(`href="${stylesheetHref}"`, 'href="data:text/css;base64,PREVIEW_STYLE"')
    .replace(
      `src="${storefrontSrc}"`,
      `src="data:text/javascript;base64,${toBase64(STOREFRONT_RUNTIME_JS)}"`,
    )
    .replace(
      "data:text/css;base64,PREVIEW_STYLE",
      `data:text/css;base64,${toBase64(
        minifyCss(
          `${themeCss(project, "inline")}\n${previewModuleStyles(project, path)}\n${STOREFRONT_RUNTIME_CSS}`,
        ),
      )}`,
    );
  if (options.editor?.enabled) {
    return { html, canvasManifest: canvasManifest ?? { entries: [], coverage: [] } };
  }
  return html;
}

export function getPreviewAssetSources(projectInput: StoreProjectV1): ReadonlyMap<string, string> {
  const project = parseProject(projectInput, "preparar los recursos de la vista previa");
  return createPreviewAssetBundle(project).sources;
}

function toBase64(value: string): string {
  if (typeof btoa === "function") {
    const bytes = encoder.encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  return Buffer.from(value, "utf8").toString("base64");
}

function toBase64Bytes(value: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    value.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  return Buffer.from(value).toString("base64");
}

export function createProjectArchive(projectInput: StoreProjectV1): string {
  const project = parseProject(projectInput, "crear el archivo del proyecto");
  return `${JSON.stringify(
    {
      format: "solara-project",
      version: 2,
      projectId: project.id,
      exportedAt: new Date().toISOString(),
      project,
    },
    null,
    2,
  )}\n`;
}

export function readProjectArchive(input: string): StoreProjectV1 {
  let envelope: {
    format?: string;
    version?: number;
    project?: unknown;
  };
  try {
    envelope = JSON.parse(input) as { format?: string; version?: number; project?: unknown };
  } catch {
    throw new Error("El respaldo está corrupto o no es JSON válido.");
  }
  if (envelope.format !== "solara-project" || envelope.version !== 2 || !envelope.project) {
    throw new Error(
      "Este respaldo pertenece a una versión anterior. Conservá el archivo original y creá una nueva tienda con el sistema actual.",
    );
  }
  return parseProject(envelope.project as StoreProjectV1, "leer el respaldo del proyecto");
}
