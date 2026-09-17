/**
 * Repositorio local Dexie y recovery. Es cache regenerable cuando el servidor
 * gestionado está activo y fallback de desarrollo cuando Studio corre sólo con
 * Vite; el código de UI no debe asumir que IndexedDB es siempre autoridad.
 */
import type { ImageAsset, NavigationItem, StoreProjectV1 } from "@solara/project-schema";
import {
  compactResponsiveSources,
  getCategoryProductIds,
  StoreProjectV1Schema,
} from "@solara/project-schema";
import {
  buildCatalogModernProject,
  buildModernBaseTemplateProject,
  catalogModernCleanStore,
  ensureCatalogModernV2Sections,
  isModernBaseTemplateContent,
  replaceModernBaseTemplateContent,
  replaceCatalogBrandText,
} from "@solara/project-schema/catalog-modern-template";
import { cloneProjectFromTemplate, isBaseTemplate } from "@solara/project-schema/project-policy";
import Dexie, { type EntityTable } from "dexie";
import {
  assertProjectImagesOptimized,
  createImageAssetFromProcessed,
  dataUrlMimeType,
  IMAGE_ASSET_RECIPE_V2,
  isOptimizedImageAsset,
  isSystemImageAsset,
  markImageAssetAsOptimized,
} from "./imageAsset";
import { slugify as slugifySlug } from "./slugify";
import { processImageInWorker } from "./workers";

export interface StoredProject {
  id: string;
  name: string;
  status: StoreProjectV1["status"];
  updatedAt: string;
  project: StoreProjectV1;
  diskVersion?: number;
  diskSiteStatus?: "synced" | "site-outdated";
}

export interface ProjectRecoveryIssue {
  id: string;
  name: string;
  updatedAt: string;
  message: string;
  projectId?: string;
  diskVersion?: number;
}

/**
 * Decide si el proyecto del navegador merece un RecoveryDraft cuando difiere
 * del disco: cuando el navegador es más nuevo o igual con contenido distinto
 * (evidencia de ediciones posteriores). Un demo recién sembrado con updatedAt
 * igual pero sin diff no debe mostrar el diálogo, pero con diff true sí debe
 * sembrarse para evitar perder ediciones que no avanzaron el timestamp.
 */
export function shouldSeedRecoveryDraft(
  browserProject: Pick<StoreProjectV1, "updatedAt">,
  diskProject: Pick<StoreProjectV1, "updatedAt">,
  diff: boolean,
): boolean {
  if (!diff) return false;
  return Date.parse(browserProject.updatedAt) >= Date.parse(diskProject.updatedAt);
}

export interface ProjectListResult {
  projects: StoredProject[];
  recovery: ProjectRecoveryIssue[];
}

export interface CachedAsset {
  cacheKey: string;
  hash: string;
  recipeVersion: number;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  primary: string;
  fallback: string;
  responsive: Array<{ width: number; source: string }>;
  createdAt: string;
  lastUsedAt: string;
}

export interface RecoveryDraft {
  projectId: string;
  baseDiskVersion: number;
  updatedAt: string;
  project: StoreProjectV1;
}

export interface ProjectMigrationRecord {
  projectId: string;
  status: "pending" | "done";
  updatedAt: string;
}

export const ASSET_CACHE_RECIPE_VERSION = 4;

export function createAssetCacheKey(
  hash: string,
  recipeVersion = ASSET_CACHE_RECIPE_VERSION,
): string {
  return `${hash}:recipe-${recipeVersion}`;
}

class SolaraDatabase extends Dexie {
  projects!: EntityTable<StoredProject, "id">;
  assetCache!: EntityTable<CachedAsset, "hash">;
  recoveryDrafts!: EntityTable<RecoveryDraft, "projectId">;
  migrations!: EntityTable<ProjectMigrationRecord, "projectId">;

  constructor() {
    super("solara-commerce-studio");
    this.version(1).stores({
      projects: "id, status, updatedAt, name",
      assetCache: "hash, createdAt",
    });
    this.version(2)
      .stores({
        projects: "id, status, updatedAt, name",
        // IndexedDB no permite cambiar la clave primaria durante una migración.
        // `hash` se conserva como clave desde la versión 1 y la caché se regenera.
        assetCache: "hash, cacheKey, recipeVersion, createdAt, lastUsedAt",
      })
      .upgrade(async (transaction) => {
        // La caché es regenerable; descartarla evita reutilizar resultados de una receta anterior.
        await transaction.table("assetCache").clear();
      });
    this.version(3).stores({
      projects: "id, status, updatedAt, name",
      assetCache: "hash, cacheKey, recipeVersion, createdAt, lastUsedAt",
      recoveryDrafts: "projectId, updatedAt",
    });
    this.version(4).stores({
      projects: "id, status, updatedAt, name",
      assetCache: "hash, cacheKey, recipeVersion, createdAt, lastUsedAt",
      recoveryDrafts: "projectId, updatedAt",
      migrations: "projectId, status, updatedAt",
    });
  }
}

export const database = new SolaraDatabase();

export const PROJECT_STORAGE_VERSION = "2";
export const SCALE_DEMO_PROJECT_ID = "store-modo-sur-demo";
export const SCALE_DEMO_PROJECT_NAME = "Predeterminado";
/** IDs reservados de referencias V1 que ya no forman parte del producto. */
export const V1_DEMO_PROJECT_ID = "store-modo-sur";
export const PREDETERMINADO_V1_PROJECT_ID = "store-modo-sur-demo-v1";
/** Purga única de tiendas: conserva sólo la demo Predeterminado V2. */
export const DEMO_ONLY_PURGE_SENTINEL = "solara-demo-only-purge";
const DEMO_ONLY_PURGE_VERSION = "3"; // v3: la demo protegida usa la fixture moderna neutral
// Predeterminado es la fixture canónica protegida; la cobertura de escala vive
// en `catalogScaleStore` y otros fixtures técnicos, fuera del alta normal.
const DEMO_KEEP_PROJECT_IDS = new Set<string>();
const LEGACY_SCALE_DEMO_PROJECT_NAME = "Demo Modo Sur, catálogo moderno";
const LEGACY_CLEAN_PROJECT_ID = "store-catalog-modern-clean-default";
const LEGACY_CLEAN_PROJECT_NAME = "Mi primera tienda";

export function buildScaleDemoProject(): StoreProjectV1 {
  return buildModernBaseTemplateProject({
    id: SCALE_DEMO_PROJECT_ID,
    name: SCALE_DEMO_PROJECT_NAME,
    slug: "demo-catalogo-jerarquico",
    baseUrl: "https://demo-catalogo-jerarquico.example",
  });
}

function collectReferencedAssetIds(
  value: unknown,
  key: string | undefined,
  target: Set<string>,
): void {
  if (typeof value === "string") {
    if (key && /(?:asset|image|poster|background)(?:asset|image)?ids?$/i.test(key) && value) {
      target.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedAssetIds(item, key, target);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [childKey, childValue] of Object.entries(value)) {
    collectReferencedAssetIds(childValue, childKey, target);
  }
}

/** Retira del demo reservado los assets heredados de las páginas editoriales eliminadas. */
export function removeRetiredDemoEditorialData(project: StoreProjectV1): StoreProjectV1 {
  if (project.id !== SCALE_DEMO_PROJECT_ID || project.origin?.seed !== "placeholder") {
    return project;
  }

  const referencedAssetIds = new Set<string>();
  collectReferencedAssetIds(
    {
      pages: project.pages,
      sections: project.sections,
      products: project.products,
      categories: project.categories,
      collections: project.collections,
      videos: project.videos,
    },
    undefined,
    referencedAssetIds,
  );
  const assets = project.assets.filter(
    (asset) => referencedAssetIds.has(asset.id) && !/^asset-(?:about|contact)-/i.test(asset.id),
  );

  if (
    assets.length === project.assets.length &&
    assets.every((asset, index) => asset.id === project.assets[index]?.id)
  ) {
    return project;
  }

  return StoreProjectV1Schema.parse({
    ...project,
    assets,
    updatedAt: new Date().toISOString(),
  });
}

function isLegacyDemoFixtureAsset(project: StoreProjectV1, assetId: string): boolean {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  return Boolean(
    asset?.hash.startsWith("fixture-modo-sur-") &&
      !asset.hash.startsWith("fixture-modo-sur-product-"),
  );
}

/** Corrige referencias visibles de la fixture sin tocar tiendas personalizadas. */
export function repairScaleDemoBrand(project: StoreProjectV1): StoreProjectV1 {
  if (project.id !== SCALE_DEMO_PROJECT_ID || project.origin?.seed !== "demo") return project;
  const target =
    project.identity.brandName === "Modo Sur"
      ? project.name.trim() || SCALE_DEMO_PROJECT_NAME
      : project.identity.brandName.trim();
  if (!target || target === "Modo Sur" || !JSON.stringify(project).includes("Modo Sur")) {
    return project;
  }
  return StoreProjectV1Schema.parse({
    ...replaceCatalogBrandText(project, "Modo Sur", target),
    identity: {
      ...replaceCatalogBrandText(project.identity, "Modo Sur", target),
      ...(project.identity.legalName.includes("Modo Sur") ? { legalName: target } : {}),
    },
    updatedAt: new Date().toISOString(),
  });
}

/** Migra el snapshot heredado de Predeterminado a la galería editorial actual. */
export function expandCatalogModernDemoGalleries(project: StoreProjectV1): StoreProjectV1 {
  if (project.id !== SCALE_DEMO_PROJECT_ID || project.origin?.seed !== "demo") return project;
  const reference = buildCatalogModernProject({
    seed: "demo",
    name: project.name,
    brandName: project.identity.brandName,
  });
  const referenceAssets = reference.assets.filter((asset) => asset.id.startsWith("asset-product-"));
  const availableAssetIds = new Set([
    ...project.assets.map((asset) => asset.id),
    ...referenceAssets.map((asset) => asset.id),
  ]);
  const missingAssets = referenceAssets.filter(
    (asset) => !project.assets.some((candidate) => candidate.id === asset.id),
  );
  let changed = missingAssets.length > 0;
  const products = project.products.map((product) => {
    const desired = reference.products.find((candidate) => candidate.id === product.id);
    if (!desired) return product;
    const legacyOnly =
      product.imageIds.length === 0 ||
      product.imageIds.every((imageId) => isLegacyDemoFixtureAsset(project, imageId));
    const imageIds = legacyOnly
      ? desired.imageIds.filter((imageId) => availableAssetIds.has(imageId)).slice(0, 3)
      : [...product.imageIds];
    for (const imageId of desired.imageIds) {
      if (imageIds.length >= 3) break;
      if (availableAssetIds.has(imageId) && !imageIds.includes(imageId)) imageIds.push(imageId);
    }
    const firstImageId = imageIds[0];
    const variants = product.variants.map((variant) =>
      variant.imageId && !isLegacyDemoFixtureAsset(project, variant.imageId)
        ? variant
        : { ...variant, ...(firstImageId ? { imageId: firstImageId } : {}) },
    );
    if (
      imageIds.length !== product.imageIds.length ||
      imageIds.some((imageId, index) => imageId !== product.imageIds[index]) ||
      variants.some((variant, index) => variant.imageId !== product.variants[index]?.imageId)
    ) {
      changed = true;
      return { ...product, imageIds, variants };
    }
    return product;
  });
  const referenceCategories = new Map(
    reference.categories.map((category) => [category.id, category]),
  );
  const categories = project.categories.map((category) => {
    const desired = referenceCategories.get(category.id);
    const desiredImageId =
      desired?.imageId && !isLegacyDemoFixtureAsset(reference, desired.imageId)
        ? desired.imageId
        : reference.products.find((product) => product.categoryIds.includes(category.id))
            ?.imageIds[0];
    if (
      !desiredImageId ||
      (category.imageId && !isLegacyDemoFixtureAsset(project, category.imageId))
    ) {
      return category;
    }
    changed = true;
    return { ...category, imageId: desiredImageId };
  });
  return changed
    ? StoreProjectV1Schema.parse({
        ...project,
        assets: [...project.assets, ...structuredClone(missingAssets)],
        products,
        categories,
        updatedAt: new Date().toISOString(),
      })
    : project;
}

type TestimonialRecord = { id: string } & Record<string, unknown>;

function testimonialRecords(value: unknown): TestimonialRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TestimonialRecord =>
      typeof item === "object" && item !== null && "id" in item && typeof item.id === "string",
  );
}

/** Completa sólo las reseñas de la demo V2; las tiendas personalizadas quedan intactas. */
export function expandCatalogModernDemoTestimonials(project: StoreProjectV1): StoreProjectV1 {
  if (project.id !== SCALE_DEMO_PROJECT_ID || project.origin?.seed !== "demo") return project;
  const reference = buildCatalogModernProject({ seed: "demo" });
  const desiredSection = reference.sections.find(
    (section) => section.moduleId === "catalog-testimonials",
  );
  const desiredItems = testimonialRecords(desiredSection?.settings.items);
  if (!desiredItems.length) return project;

  let changed = false;
  const sections = project.sections.map((section) => {
    if (section.moduleId !== "catalog-testimonials") return section;
    const existingItems = testimonialRecords(section.settings.items);
    if (existingItems.length === 0 || existingItems.length >= desiredItems.length) return section;
    const existingIds = new Set(existingItems.map((item) => item.id));
    const additions = desiredItems.filter((item) => !existingIds.has(item.id));
    if (!additions.length) return section;
    changed = true;
    return {
      ...section,
      settings: {
        ...section.settings,
        items: [...existingItems, ...additions].slice(0, desiredItems.length),
      },
    };
  });

  return changed
    ? StoreProjectV1Schema.parse({ ...project, sections, updatedAt: new Date().toISOString() })
    : project;
}

const STORAGE_SENTINEL = "solara-studio-storage-version";
export const DEPRECATED_CATEGORY_CLEANUP_SENTINEL = "solara-deprecated-category-cleanup";
const DEPRECATED_CATEGORY_CLEANUP_VERSION = "1";
let storageReady: Promise<void> | undefined;
let storageReset = false;

async function ensureStorageVersion(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(STORAGE_SENTINEL) === PROJECT_STORAGE_VERSION) return;
  try {
    database.close();
    await Dexie.delete("solara-commerce-studio");
    await database.open();
    localStorage.setItem(STORAGE_SENTINEL, PROJECT_STORAGE_VERSION);
    storageReset = true;
  } catch {
    throw new Error(
      "No se pudo reiniciar la base local. Cerrá otras pestañas de SolaraCommerce y volvé a abrir la app.",
    );
  }
}

async function ready(): Promise<void> {
  storageReady ??= ensureStorageVersion();
  await storageReady;
}

export function consumeStorageResetNotice(): boolean {
  const wasReset = storageReset;
  storageReset = false;
  return wasReset;
}

function toRecord(project: StoreProjectV1): StoredProject {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    updatedAt: project.updatedAt,
    project,
  };
}

function repairModernGreeting(project: StoreProjectV1): StoreProjectV1 {
  const legacyGreeting =
    project.commerceTemplates.designFamily === "catalog-modern-v1" &&
    project.whatsapp.greeting === "Hola Casa Luma, quiero hacer este pedido:";
  const legacyCleanPhone =
    project.origin?.templateId === "catalog-modern" &&
    project.origin.seed === "clean" &&
    project.whatsapp.phone === "5491100000000";
  if (!legacyGreeting && !legacyCleanPhone) {
    return project;
  }

  return StoreProjectV1Schema.parse({
    ...project,
    whatsapp: {
      ...project.whatsapp,
      ...(legacyGreeting
        ? { greeting: `Hola ${project.identity.brandName}, quiero hacer este pedido:` }
        : {}),
      ...(legacyCleanPhone ? { phone: "" } : {}),
    },
  });
}

function repairScaleDemoPresentation(project: StoreProjectV1): StoreProjectV1 {
  if (project.id !== SCALE_DEMO_PROJECT_ID || project.origin?.seed !== "demo") return project;
  const desired = buildScaleDemoProject();
  if (
    project.commerceTemplates.designFamily === desired.commerceTemplates.designFamily &&
    project.theme.container === desired.theme.container &&
    project.theme.colors.background === desired.theme.colors.background
  ) {
    return project;
  }
  return StoreProjectV1Schema.parse({
    ...project,
    theme: structuredClone(desired.theme),
    commerceTemplates: {
      ...project.commerceTemplates,
      designFamily: desired.commerceTemplates.designFamily,
    },
    updatedAt: new Date().toISOString(),
  });
}

function normalizeScaleDemoProject(project: StoreProjectV1): StoreProjectV1 {
  const renamed =
    project.id === SCALE_DEMO_PROJECT_ID &&
    [LEGACY_SCALE_DEMO_PROJECT_NAME, "Modo Sur"].includes(project.name)
      ? { ...project, name: SCALE_DEMO_PROJECT_NAME }
      : project;
  return repairScaleDemoBrand(repairScaleDemoPresentation(renamed));
}

/**
 * Actualiza la demo protegida con cambios de la fixture sin reemplazar todo el
 * proyecto persistido. Esto permite que nuevas versiones de Predeterminado
 * incorporen productos/categorías agregados manteniendo cambios seguros de la
 * sesión actual.
 */
function syncScaleDemoFixtureChanges(project: StoreProjectV1): StoreProjectV1 {
  if (project.id !== SCALE_DEMO_PROJECT_ID || project.origin?.seed !== "demo") return project;

  const desired = buildScaleDemoProject();
  const productIds = new Set(project.products.map((product) => product.id));
  const categoryIds = new Set(project.categories.map((category) => category.id));
  const collectionIds = new Set(project.collections.map((collection) => collection.id));
  const products = [...project.products, ...desired.products.filter((product) => !productIds.has(product.id))];
  const categories = [...project.categories, ...desired.categories.filter((category) => !categoryIds.has(category.id))];
  const collections = [...project.collections, ...desired.collections.filter((collection) => !collectionIds.has(collection.id))];

  const changed =
    products.length !== project.products.length ||
    categories.length !== project.categories.length ||
    collections.length !== project.collections.length;
  if (!changed) return project;

  return StoreProjectV1Schema.parse({
    ...project,
    products,
    categories,
    collections,
    updatedAt: new Date().toISOString(),
  });
}

async function sourceAsDataUrl(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`No se pudo cargar el recurso inicial ${source}.`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error(`No se pudo leer ${source}.`)));
    reader.readAsDataURL(blob);
  });
}

function isFixtureImage(asset: StoreProjectV1["assets"][number]): boolean {
  return asset.source.startsWith("/fixtures/") || asset.hash.startsWith("fixture-");
}

function canProcessImagesInBrowser(): boolean {
  return typeof Worker !== "undefined" || typeof document !== "undefined";
}

async function optimizeEmbeddedFixtureImage(
  asset: StoreProjectV1["assets"][number],
): Promise<StoreProjectV1["assets"][number]> {
  if (!isFixtureImage(asset) || asset.responsiveSources?.length || !canProcessImagesInBrowser()) {
    return asset;
  }

  const response = await fetch(asset.source);
  if (!response.ok) throw new Error(`No se pudo cargar la imagen inicial ${asset.name}.`);
  const blob = await response.blob();
  const file = new File([blob], `${asset.name}.png`, {
    type: blob.type || asset.mimeType || "image/png",
  });
  const processed = await processImageInWorker(file);
  return createImageAssetFromProcessed(
    {
      id: asset.id,
      name: asset.name,
      alt: asset.alt,
      hash: asset.hash,
    },
    processed,
  );
}

function sameResponsiveSources(
  left: StoreProjectV1["assets"][number]["responsiveSources"],
  right: StoreProjectV1["assets"][number]["responsiveSources"],
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every(
    (source, index) =>
      source.width === right[index]?.width && source.source === right[index]?.source,
  );
}

/** Reduce assets legacy a la receta actual sin volver a codificar sus bytes. */
export function compactProjectResponsiveAssets(project: StoreProjectV1): StoreProjectV1 {
  let changed = false;
  const assets = project.assets.map((asset) => {
    if (asset.mimeType === "image/x-icon" || !asset.responsiveSources?.length) return asset;
    const responsiveSources = compactResponsiveSources(asset.responsiveSources, asset.width, {
      width: asset.width,
      source: asset.source,
    });
    if (sameResponsiveSources(asset.responsiveSources, responsiveSources)) return asset;
    changed = true;
    return { ...asset, responsiveSources };
  });
  return changed
    ? StoreProjectV1Schema.parse({
        ...project,
        assets,
        updatedAt: new Date().toISOString(),
      })
    : project;
}

/**
 * Completa la receta responsive de los fixtures que ya estaban guardados en
 * versiones anteriores y compacta cualquier receta legacy sin recodificar
 * imágenes personalizadas del usuario.
 */
export async function optimizeDemoFixtureAssets(project: StoreProjectV1): Promise<StoreProjectV1> {
  const compactedProject = compactProjectResponsiveAssets(project);
  if (!canProcessImagesInBrowser()) return compactedProject;
  const assets = await Promise.all(
    compactedProject.assets.map(async (asset) => {
      if (!isFixtureImage(asset) || asset.responsiveSources?.length) return asset;
      try {
        return await optimizeEmbeddedFixtureImage(asset);
      } catch {
        // Mantener la imagen original permite abrir la tienda aunque un
        // navegador no pueda decodificar un fixture; el próximo reemplazo sí
        // volverá a pasar por la receta completa.
        return asset;
      }
    }),
  );
  if (assets.every((asset, index) => asset === compactedProject.assets[index])) {
    return compactedProject;
  }
  return StoreProjectV1Schema.parse({
    ...compactedProject,
    assets,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Corrige metadatos seguros que quedaron de versiones anteriores del editor.
 * No elimina assets: una imagen sin referencias puede seguir siendo útil para
 * el usuario y su limpieza requiere una decisión explícita.
 */
export function repairProjectMediaMetadata(project: StoreProjectV1): StoreProjectV1 {
  const labels = new Map<string, string>();
  if (project.identity.logoAssetId) {
    labels.set(project.identity.logoAssetId, `Logo de ${project.identity.brandName}`);
  }
  for (const product of project.products) {
    for (const assetId of product.imageIds) labels.set(assetId, product.title);
    for (const variant of product.variants) {
      if (variant.imageId) labels.set(variant.imageId, product.title);
    }
  }
  for (const category of project.categories) {
    if (category.imageId) labels.set(category.imageId, category.title);
  }
  for (const collection of project.collections) {
    if (collection.imageId) labels.set(collection.imageId, collection.title);
  }

  let changed = false;
  const assets = project.assets.map((asset) => {
    const label = labels.get(asset.id);
    if (!label || asset.alt.trim()) return asset;
    changed = true;
    return { ...asset, alt: label };
  });
  const sections = project.sections.map((section) => {
    if (section.moduleId !== "catalog-header") return section;
    const settings = Object.fromEntries(
      Object.entries(section.settings).filter(
        ([key]) => key !== "brandMode" && key !== "brandAssetId",
      ),
    );
    if (Object.keys(settings).length === Object.keys(section.settings).length) return section;
    changed = true;
    return { ...section, settings };
  });
  return changed
    ? StoreProjectV1Schema.parse({
        ...project,
        assets,
        sections,
        updatedAt: new Date().toISOString(),
      })
    : project;
}

const WEBP_OR_AVIF_MIME_TYPES = new Set(["image/webp", "image/avif"]);

function hasWebpOrAvifResponsiveVariant(asset: ImageAsset): boolean {
  return (asset.responsiveSources ?? []).some((source) => {
    const mimeType = dataUrlMimeType(source.source);
    return mimeType !== undefined && WEBP_OR_AVIF_MIME_TYPES.has(mimeType);
  });
}

function hasLegacyPngFallback(asset: ImageAsset): boolean {
  return (
    dataUrlMimeType(asset.fallbackSource) === "image/png" &&
    asset.optimizationRecipe !== IMAGE_ASSET_RECIPE_V2
  );
}

function needsResponsiveImageRepair(asset: StoreProjectV1["assets"][number]): boolean {
  if (asset.kind !== "image" || asset.mimeType === "image/x-icon") return false;
  return !hasWebpOrAvifResponsiveVariant(asset) || hasLegacyPngFallback(asset);
}

export function needsImageOptimization(asset: StoreProjectV1["assets"][number]): boolean {
  // El favicon tiene un contrato binario propio; no debe entrar al pipeline
  // responsive aunque sea un legacy que luego reparará el exporter.
  if (asset.kind !== "image" || asset.mimeType === "image/x-icon") return false;
  return !isOptimizedImageAsset(asset) || needsResponsiveImageRepair(asset);
}

async function optimizeImageAsset(
  asset: StoreProjectV1["assets"][number],
): Promise<StoreProjectV1["assets"][number]> {
  if (!needsImageOptimization(asset)) return asset;
  if (asset.mimeType === "image/x-icon") {
    throw new Error(`El favicon «${asset.name}» no tiene todas sus resoluciones generadas.`);
  }
  const response = await fetch(asset.source);
  if (!response.ok) throw new Error(`No se pudo cargar la imagen ${asset.name}.`);
  const blob = await response.blob();
  const file = new File([blob], `${asset.name}.image`, {
    type: blob.type || asset.mimeType,
  });
  const processed = await processImageInWorker(file);
  return createImageAssetFromProcessed(
    {
      id: asset.id,
      name: asset.name,
      alt: asset.alt,
      hash: asset.hash,
    },
    processed,
  );
}

/**
 * Aplica la misma receta del upload a todos los assets legacy/custom que
 * llegaron antes de que el pipeline responsive existiera. Los errores de una
 * imagen de usuario son bloqueantes: conservarla cruda permitiría que vuelva a
 * entrar al editor y al exportador sin la receta garantizada.
 */
export async function optimizeProjectAssets(project: StoreProjectV1): Promise<StoreProjectV1> {
  if (!canProcessImagesInBrowser()) {
    assertProjectImagesOptimized(project);
    return project;
  }
  const projectWithFixtureAssets = await optimizeDemoFixtureAssets(project);
  const compactedProject = compactProjectResponsiveAssets(projectWithFixtureAssets);
  let changed = compactedProject !== project;
  const assets = [] as StoreProjectV1["assets"];
  for (const asset of compactedProject.assets) {
    if (isSystemImageAsset(asset) || !needsImageOptimization(asset)) {
      assets.push(asset);
      continue;
    }
    const marked = needsResponsiveImageRepair(asset) ? undefined : markImageAssetAsOptimized(asset);
    if (marked) {
      assets.push(marked);
      changed = true;
      continue;
    }
    const optimized = await optimizeImageAsset(asset);
    assets.push(optimized);
    changed ||= optimized !== asset;
  }
  const optimizedProject = changed
    ? StoreProjectV1Schema.parse({
        ...compactedProject,
        assets,
        updatedAt: new Date().toISOString(),
      })
    : project;
  assertProjectImagesOptimized(optimizedProject);
  return optimizedProject;
}

async function embedFixtureAssets(project: StoreProjectV1): Promise<StoreProjectV1> {
  if (!canProcessImagesInBrowser()) return project;
  const assets = await Promise.all(
    project.assets.map(async (asset) =>
      asset.source.startsWith("/fixtures/")
        ? { ...asset, source: await sourceAsDataUrl(asset.source) }
        : asset,
    ),
  );
  return optimizeDemoFixtureAssets(StoreProjectV1Schema.parse({ ...project, assets }));
}

export async function migrateCatalogModernDemo(project: StoreProjectV1): Promise<StoreProjectV1> {
  if (project.id !== SCALE_DEMO_PROJECT_ID) return project;
  await ready();
  const cleaned = removeRetiredDemoEditorialData(project);
  if (cleaned !== project) {
    const retainedAssetIds = new Set(cleaned.assets.map((asset) => asset.id));
    const removedHashes = project.assets
      .filter((asset) => !retainedAssetIds.has(asset.id))
      .map((asset) => asset.hash);
    if (removedHashes.length > 0) await database.assetCache.bulkDelete(removedHashes);
  }
  if (cleaned.origin?.seed !== "demo") return cleaned;
  const expanded = expandCatalogModernDemoGalleries(normalizeScaleDemoProject(cleaned));
  if (!expanded.assets.some((asset) => asset.source.startsWith("/fixtures/"))) return expanded;
  return embedFixtureAssets(expanded);
}

function isDeprecatedCategoryPath(value: string): boolean {
  const pathname = value.split(/[?#]/, 1)[0] ?? value;
  return /^\/categorias\/(?:sale|novedades)(?:\/pagina\/\d+)?\/?$/.test(pathname);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replaceDeprecatedRoutes(value: unknown, fallbackHref: string): unknown {
  if (typeof value === "string") {
    return isDeprecatedCategoryPath(value) ? fallbackHref : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceDeprecatedRoutes(item, fallbackHref));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceDeprecatedRoutes(item, fallbackHref)]),
  );
}

function cleanNavigationItems(items: NavigationItem[], fallbackHref: string): NavigationItem[] {
  return items.flatMap((item) => {
    const children = (item.children ?? []).filter(
      (child) => !child.href || !isDeprecatedCategoryPath(child.href),
    );
    const next = { ...item };
    if (next.href && isDeprecatedCategoryPath(next.href)) {
      next.href = children.length > 0 ? fallbackHref : undefined;
    }
    if (children.length > 0) next.children = children;
    else delete next.children;
    return next.href || next.children ? [next] : [];
  });
}

function fallbackCatalogHref(project: StoreProjectV1): string {
  const activeProductIds = new Set(
    project.products.filter((product) => product.status === "active").map((product) => product.id),
  );
  const collection = project.collections.find((candidate) =>
    candidate.productIds.some((productId) => activeProductIds.has(productId)),
  );
  if (collection) return `/colecciones/${collection.slug}/`;
  const category = project.categories.find(
    (candidate) =>
      !candidate.parentId && candidate.productIds.some((id) => activeProductIds.has(id)),
  );
  return category ? `/categorias/${category.slug}/` : "/buscar/";
}

/** Removes the retired demo categories while preserving products and discoverability. */
export function removeDeprecatedCatalogCategories(project: StoreProjectV1): StoreProjectV1 {
  const deprecatedIds = new Set(
    project.categories
      .filter((category) => category.slug === "sale" || category.slug === "novedades")
      .map((category) => category.id),
  );
  const categories = project.categories
    .filter((category) => !deprecatedIds.has(category.id))
    .map((category): StoreProjectV1["categories"][number] => {
      if (!category.parentId || !deprecatedIds.has(category.parentId)) return category;
      return { ...category, parentId: undefined };
    });
  const fallbackHref = fallbackCatalogHref({ ...project, categories });
  const fallbackCategory = categories.find((category) => !category.parentId)?.id;
  const products = project.products.map((product) => {
    const categoryIds = product.categoryIds.filter((categoryId) => !deprecatedIds.has(categoryId));
    return {
      ...product,
      categoryIds: categoryIds.length || !fallbackCategory ? categoryIds : [fallbackCategory],
      tags: product.tags.filter((tag) => tag !== "sale" && tag !== "novedades"),
    };
  });
  const workingProject = {
    ...project,
    products,
    categories: categories.map((category) => ({ ...category, productIds: [] })),
    navigation: {
      ...project.navigation,
      items: cleanNavigationItems(project.navigation.items, fallbackHref),
    },
    sections: project.sections.map((section) => ({
      ...section,
      settings: replaceDeprecatedRoutes(section.settings, fallbackHref) as typeof section.settings,
    })),
    pages: project.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        settings: replaceDeprecatedRoutes(
          section.settings,
          fallbackHref,
        ) as typeof section.settings,
      })),
    })),
  };
  const finalizedCategories = workingProject.categories.map((category) => ({
    ...category,
    productIds: getCategoryProductIds(workingProject, category.id),
  }));
  return StoreProjectV1Schema.parse({ ...workingProject, categories: finalizedCategories });
}

export async function ensureDeprecatedCategoriesRemoved(): Promise<boolean> {
  await ready();
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem(DEPRECATED_CATEGORY_CLEANUP_SENTINEL) ===
      DEPRECATED_CATEGORY_CLEANUP_VERSION
  ) {
    return false;
  }

  const records = await database.projects.toArray();
  const updates: StoredProject[] = [];
  let hasInvalidRecord = false;
  for (const record of records) {
    const parsed = StoreProjectV1Schema.safeParse(record.project);
    if (!parsed.success) {
      hasInvalidRecord = true;
      continue;
    }
    if (isBaseTemplate(parsed.data)) continue;
    const cleaned = removeDeprecatedCatalogCategories(parsed.data);
    if (JSON.stringify(cleaned) !== JSON.stringify(parsed.data)) updates.push(toRecord(cleaned));
  }
  if (updates.length > 0) {
    await database.transaction("rw", database.projects, async () => {
      for (const record of updates) await database.projects.put(record);
    });
  }
  if (typeof localStorage !== "undefined" && !hasInvalidRecord) {
    localStorage.setItem(DEPRECATED_CATEGORY_CLEANUP_SENTINEL, DEPRECATED_CATEGORY_CLEANUP_VERSION);
  }
  return updates.length > 0;
}

export async function listProjects(): Promise<StoredProject[]> {
  return (await listProjectsWithRecovery()).projects;
}

function schemaErrorMessage(error: {
  issues?: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const first = error.issues?.[0];
  if (!first) return "El proyecto no supera la validación actual.";
  const path = first.path.map(String).join(".") || "project";
  return `${path}: ${first.message}`;
}

export async function listProjectsWithRecovery(): Promise<ProjectListResult> {
  await ready();
  const records = await database.projects.orderBy("updatedAt").reverse().toArray();
  const projects: StoredProject[] = [];
  const recovery: ProjectRecoveryIssue[] = [];
  for (const record of records) {
    const parsed = StoreProjectV1Schema.safeParse(record.project);
    if (parsed.success) {
      try {
        const normalized = ensureCatalogModernV2Sections(parsed.data);
        const project = await optimizeProjectAssets(normalized);
        if (project !== normalized && !isBaseTemplate(project)) {
          await database.projects.put(toRecord(project));
        }
        projects.push({ ...record, ...toRecord(project) });
      } catch (error) {
        recovery.push({
          id: record.id,
          name: record.name,
          updatedAt: record.updatedAt,
          message:
            error instanceof Error ? error.message : "La imagen del proyecto no se pudo optimizar.",
        });
      }
    } else {
      recovery.push({
        id: record.id,
        name: record.name,
        updatedAt: record.updatedAt,
        message: schemaErrorMessage(parsed.error),
      });
    }
  }
  return { projects, recovery };
}

export async function getProject(id: string): Promise<StoreProjectV1 | undefined> {
  await ready();
  const record = await database.projects.get(id);
  if (!record) return undefined;
  const parsed = StoreProjectV1Schema.safeParse(record.project);
  if (!parsed.success) {
    throw new Error(
      `La tienda "${record.name}" no se puede abrir. Exportá un respaldo anterior y recuperala desde Importar respaldo. ${schemaErrorMessage(parsed.error)}`,
    );
  }
  const normalized = ensureCatalogModernV2Sections(parsed.data);
  const project = await optimizeProjectAssets(normalized);
  if (project !== normalized && !isBaseTemplate(project)) {
    await database.projects.put(toRecord(project));
  }
  return project;
}

export interface SaveProjectOptions {
  allowProtectedWrite?: boolean;
}

export async function saveProject(
  project: StoreProjectV1,
  options: SaveProjectOptions = {},
): Promise<StoreProjectV1> {
  await ready();
  const validProject = ensureCatalogModernV2Sections(StoreProjectV1Schema.parse(project));
  if (isBaseTemplate(validProject) && !options.allowProtectedWrite) {
    const error = new Error(
      "La plantilla protegida sólo puede cambiarse mediante un upgrade explícito.",
    ) as Error & { code?: string };
    error.code = "PROTECTED_STORE";
    throw error;
  }
  const optimizedProject = await optimizeProjectAssets(validProject);
  await database.transaction("rw", database.projects, async () => {
    await database.projects.put(toRecord(optimizedProject));
  });
  return optimizedProject;
}

export async function saveRecoveryDraft(
  project: StoreProjectV1,
  baseDiskVersion = 0,
): Promise<void> {
  await ready();
  const validProject = ensureCatalogModernV2Sections(StoreProjectV1Schema.parse(project));
  if (isBaseTemplate(validProject)) return;
  const optimizedProject = await optimizeProjectAssets(validProject);
  const existing = await database.recoveryDrafts.get(optimizedProject.id);
  if (existing) {
    const existingTime = Date.parse(existing.project.updatedAt);
    const newTime = Date.parse(optimizedProject.updatedAt);
    if (newTime < existingTime) return;
    if (newTime === existingTime && baseDiskVersion <= existing.baseDiskVersion) return;
  }
  await database.recoveryDrafts.put({
    projectId: optimizedProject.id,
    baseDiskVersion,
    updatedAt: new Date().toISOString(),
    project: optimizedProject,
  });
}

export async function getRecoveryDraft(projectId: string): Promise<RecoveryDraft | undefined> {
  await ready();
  const draft = await database.recoveryDrafts.get(projectId);
  if (!draft) return undefined;
  const parsed = StoreProjectV1Schema.safeParse(draft.project);
  if (!parsed.success) return undefined;
  const normalized = ensureCatalogModernV2Sections(parsed.data);
  const project = await optimizeProjectAssets(normalized);
  if (project !== normalized) {
    await database.recoveryDrafts.put({ ...draft, project });
  }
  return { ...draft, project };
}

export async function clearRecoveryDraft(projectId: string): Promise<void> {
  await ready();
  await database.recoveryDrafts.delete(projectId);
}

export async function markProjectMigration(
  projectId: string,
  status: ProjectMigrationRecord["status"],
): Promise<void> {
  await ready();
  await database.migrations.put({ projectId, status, updatedAt: new Date().toISOString() });
}

export async function getProjectMigration(
  projectId: string,
): Promise<ProjectMigrationRecord | undefined> {
  await ready();
  return database.migrations.get(projectId);
}

export interface CreateProjectOptions {
  name: string;
  brandName?: string;
  email?: string;
  phone?: string;
}

export async function createProject(input: string | CreateProjectOptions): Promise<StoreProjectV1> {
  await ready();
  const timestamp = new Date().toISOString();
  const suffix = crypto.randomUUID();
  const options = typeof input === "string" ? { name: input } : input;
  const normalizedName = options.name.trim() || "Nueva tienda";
  const slug = slugify(normalizedName, suffix.slice(0, 6));
  const phone = (options.phone ?? "").replace(/\D/g, "");
  const baseRecord = await database.projects.get(SCALE_DEMO_PROJECT_ID);
  const base = baseRecord
    ? StoreProjectV1Schema.parse(baseRecord.project)
    : buildScaleDemoProject();
  if (!isBaseTemplate(base)) {
    throw new Error("No se puede crear una tienda: la plantilla base no está protegida.");
  }
  // La plantilla protegida es la única fuente: Studio y el agente pasan por
  // el mismo cloner para que IDs, assets y referencias queden aislados.
  const cloned = cloneProjectFromTemplate(base, {
    id: `store-${suffix}`,
    name: normalizedName,
    brandName: options.brandName?.trim() || normalizedName,
    slug,
    baseUrl: `https://${slug}.example`,
    now: timestamp,
  });
  const template = StoreProjectV1Schema.parse(cloned);
  const project = await embedFixtureAssets(
    StoreProjectV1Schema.parse({
      ...template,
      identity: {
        ...template.identity,
        email: options.email?.trim() || "",
        phone,
      },
      whatsapp: {
        ...template.whatsapp,
        phone,
      },
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  return saveProject(project);
}

export async function ensureFirstProject(): Promise<StoreProjectV1> {
  await ready();
  const first = await database.projects.orderBy("updatedAt").reverse().first();
  if (first) {
    const parsed = StoreProjectV1Schema.parse(first.project);
    if (isBaseTemplate(parsed)) return optimizeProjectAssets(parsed);
    const project = await optimizeProjectAssets(
      await migrateCatalogModernDemo(repairModernGreeting(parsed)),
    );
    return JSON.stringify(project) !== JSON.stringify(parsed) ? saveProject(project) : project;
  }
  const initial = await embedFixtureAssets(buildScaleDemoProject());
  return saveProject(initial, { allowProtectedWrite: true });
}

export async function ensureModernBaseProject(): Promise<boolean> {
  await ready();
  const existing = await database.projects.get(catalogModernCleanStore.id);
  if (existing) {
    const parsed = StoreProjectV1Schema.parse(existing.project);
    const project = await optimizeDemoFixtureAssets(repairModernGreeting(parsed));
    if (JSON.stringify(project) !== JSON.stringify(parsed)) await saveProject(project);
    return false;
  }

  await saveProject(
    await embedFixtureAssets(StoreProjectV1Schema.parse(structuredClone(catalogModernCleanStore))),
  );
  return true;
}

/**
 * Purga el registro de la tienda candidata del revamp de movimiento
 * (store-modo-sur-revamp), retirada por rollback el 2026-08-08. El registro
 * quedó en IndexedDB tras la sesión del revamp y, si persistiera, el bucle de
 * migración a disco lo volvería a materializar en proyectos/. Idempotente.
 */
export async function purgeRolledBackDemoRecords(): Promise<void> {
  await ready();
  await database.projects.delete("store-modo-sur-revamp");
  await database.recoveryDrafts.delete("store-modo-sur-revamp");
}

/**
 * Purga única (sentinel) de tiendas del perfil local: conserva únicamente la
 * demo Predeterminado V2 y elimina el resto con sus borradores de recuperación
 * y registros de migración. Corre una sola vez por perfil; cualquier tienda
 * que el usuario cree después queda intacta.
 */
export async function purgeNonDemoStores(): Promise<boolean> {
  await ready();
  if (
    typeof localStorage !== "undefined" &&
    localStorage.getItem(DEMO_ONLY_PURGE_SENTINEL) === DEMO_ONLY_PURGE_VERSION
  ) {
    return false;
  }
  let changed = false;
  for (const record of await database.projects.toArray()) {
    if (DEMO_KEEP_PROJECT_IDS.has(record.id)) continue;
    await database.projects.delete(record.id);
    await database.recoveryDrafts.delete(record.id);
    await database.migrations.delete(record.id);
    changed = true;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(DEMO_ONLY_PURGE_SENTINEL, DEMO_ONLY_PURGE_VERSION);
  }
  return changed;
}

/**
 * Retira las dos referencias V1 que una versión anterior de Studio sembraba.
 * No usa una purga global ni toca tiendas creadas por el usuario: los IDs son
 * reservados por la demo y la operación es idempotente para poder ejecutarse
 * también en perfiles que ya fueron migrados.
 */
export async function retireLegacyDemoProjects(): Promise<boolean> {
  await ready();
  let changed = false;
  for (const projectId of [V1_DEMO_PROJECT_ID, PREDETERMINADO_V1_PROJECT_ID]) {
    const exists = await database.projects.get(projectId);
    if (!exists) continue;
    await database.projects.delete(projectId);
    await database.recoveryDrafts.delete(projectId);
    await database.migrations.delete(projectId);
    changed = true;
  }
  return changed;
}

export async function ensureScaleDemoProject(): Promise<boolean> {
  await ready();
  const legacyCleanRecord = await database.projects.get(LEGACY_CLEAN_PROJECT_ID);
  if (legacyCleanRecord) {
    const legacyClean = StoreProjectV1Schema.safeParse(legacyCleanRecord.project);
    if (
      legacyClean.success &&
      legacyClean.data.name === LEGACY_CLEAN_PROJECT_NAME &&
      legacyClean.data.slug === "mi-primera-tienda" &&
      legacyClean.data.origin?.seed === "clean" &&
      legacyClean.data.products.length === 0 &&
      legacyClean.data.categories.length === 0 &&
      legacyClean.data.collections.length === 0 &&
      legacyClean.data.updatedAt === legacyClean.data.createdAt
    ) {
      const archivedAt = new Date().toISOString();
      await saveProject({
        ...legacyClean.data,
        name: "Base limpia anterior",
        status: "archived",
        updatedAt: archivedAt,
      });
    }
  }
  const existing = await database.projects.get(SCALE_DEMO_PROJECT_ID);
  if (existing) {
    const parsed = StoreProjectV1Schema.parse(existing.project);
    if (isBaseTemplate(parsed)) {
      if (isModernBaseTemplateContent(parsed)) return false;
      await saveProject(
        await embedFixtureAssets(
          replaceModernBaseTemplateContent(parsed, { updatedAt: new Date().toISOString() }),
        ),
        { allowProtectedWrite: true },
      );
      return true;
    }
    if (
      parsed.origin?.seed === "demo" &&
      (parsed.products.length < 200 || parsed.categories.length < 10)
    ) {
      await saveProject(await embedFixtureAssets(buildScaleDemoProject()), {
        allowProtectedWrite: true,
      });
      return true;
    }
    const repaired = syncScaleDemoFixtureChanges(repairModernGreeting(normalizeScaleDemoProject(parsed)));
    const migrated = await migrateCatalogModernDemo(repaired);
    const project = expandCatalogModernDemoTestimonials(migrated);
    if (JSON.stringify(project) !== JSON.stringify(parsed)) {
      await saveProject(project);
    }
    return false;
  }

  const demo = buildScaleDemoProject();
  await saveProject(await embedFixtureAssets(demo), { allowProtectedWrite: true });
  return true;
}

export async function ensureCatalogModernDemoReviews(
  options: SaveProjectOptions = {},
): Promise<boolean> {
  await ready();
  const record = await database.projects.get(SCALE_DEMO_PROJECT_ID);
  if (!record) return false;
  const parsed = StoreProjectV1Schema.parse(record.project);
  if (parsed.id !== SCALE_DEMO_PROJECT_ID) return false;
  if (isBaseTemplate(parsed) && !options.allowProtectedWrite) return false;

  const reference = buildCatalogModernProject({ seed: "demo" });
  const referenceReviews = new Map(
    reference.products.map((product) => [product.id, product.reviews ?? []]),
  );
  let changed = false;
  const products = parsed.products.map((product) => {
    const desired = referenceReviews.get(product.id);
    if (!desired?.length || (product.reviews?.length ?? 0) >= desired.length) return product;
    const existing = product.reviews ?? [];
    const existingIds = new Set(existing.map((review) => review.id));
    const additions = desired.filter((review) => !existingIds.has(review.id));
    const reviews = [...existing, ...additions].slice(0, desired.length);
    changed = true;
    return { ...product, reviews };
  });
  if (!changed) return false;
  await saveProject(StoreProjectV1Schema.parse({ ...parsed, products }), options);
  return true;
}

export async function ensureCatalogModernDemoGallery(
  options: SaveProjectOptions = {},
): Promise<boolean> {
  await ready();
  const record = await database.projects.get(SCALE_DEMO_PROJECT_ID);
  if (!record) return false;
  const parsed = StoreProjectV1Schema.parse(record.project);
  if (isBaseTemplate(parsed) && !options.allowProtectedWrite) return false;
  const expanded = await migrateCatalogModernDemo(parsed);
  if (expanded === parsed) return false;
  await saveProject(expanded, options);
  return true;
}

export async function ensureCatalogModernDemoTestimonials(
  options: SaveProjectOptions = {},
): Promise<boolean> {
  await ready();
  const record = await database.projects.get(SCALE_DEMO_PROJECT_ID);
  if (!record) return false;
  const parsed = StoreProjectV1Schema.parse(record.project);
  if (isBaseTemplate(parsed) && !options.allowProtectedWrite) return false;
  const expanded = expandCatalogModernDemoTestimonials(parsed);
  if (expanded === parsed) return false;
  await saveProject(expanded, options);
  return true;
}

/**
 * Reordena las secciones de home de la demo V2 para que el bento de categorías
 * quede inmediatamente después de la franja de marcas (hero → marcas →
 * categorías → grillas). Idempotente por patrón: sólo actúa sobre
 * `store-modo-sur-demo` cuando detecta el orden viejo (franja de marcas seguida
 * de dos grillas consecutivas y luego el bento) y no agrega sentinels, así un
 * reordenamiento manual del usuario nunca se vuelve a tocar.
 */
export async function ensureDemoSectionOrder(options: SaveProjectOptions = {}): Promise<boolean> {
  await ready();
  const record = await database.projects.get(SCALE_DEMO_PROJECT_ID);
  if (!record) return false;
  const parsed = StoreProjectV1Schema.parse(record.project);
  if (parsed.id !== SCALE_DEMO_PROJECT_ID) return false;
  if (isBaseTemplate(parsed) && !options.allowProtectedWrite) return false;

  const bentoIndex = parsed.sections.findIndex(
    (section) => section.moduleId === "catalog-category-bento",
  );
  if (bentoIndex < 3) return false;
  if (
    parsed.sections[bentoIndex - 1]?.moduleId !== "catalog-product-grid" ||
    parsed.sections[bentoIndex - 2]?.moduleId !== "catalog-product-grid" ||
    parsed.sections[bentoIndex - 3]?.moduleId !== "catalog-brand-strip"
  ) {
    return false;
  }

  const sections = [...parsed.sections];
  const bento = sections.splice(bentoIndex, 1)[0];
  if (!bento) return false;
  // El patrón garantiza que el brand-strip está en bentoIndex - 3.
  sections.splice(bentoIndex - 2, 0, bento);
  await saveProject(StoreProjectV1Schema.parse({ ...parsed, sections }), options);
  return true;
}

export async function duplicateProject(id: string): Promise<StoreProjectV1> {
  const source = await getProject(id);
  if (!source) throw new Error("No se encontró la tienda para duplicar.");
  const timestamp = new Date().toISOString();
  const suffix = crypto.randomUUID();
  const project = cloneProjectFromTemplate(source, {
    id: `store-${suffix}`,
    name: `${source.name} copia`,
    slug: slugify(`${source.slug}-copia`, suffix.slice(0, 6)),
    baseUrl: `https://${slugify(`${source.slug}-copia`, suffix.slice(0, 6))}.example`,
    now: timestamp,
  });
  return saveProject(project);
}

/** Importa un respaldo como una tienda nueva sin sobrescribir su proyecto de origen. */
export async function importProject(project: StoreProjectV1): Promise<StoreProjectV1> {
  const source = StoreProjectV1Schema.parse(project);
  const timestamp = new Date().toISOString();
  const suffix = crypto.randomUUID();
  const slug = slugify(`${source.slug}-importada`, suffix.slice(0, 6));
  const imported = cloneProjectFromTemplate(source, {
    id: `store-${suffix}`,
    name: source.name,
    slug,
    baseUrl: `https://${slug}.example`,
    now: timestamp,
  });
  return saveProject(
    StoreProjectV1Schema.parse({
      ...imported,
      identity: {
        ...imported.identity,
        legalName: source.identity.legalName,
        email: source.identity.email,
        phone: source.identity.phone,
        address: source.identity.address,
      },
      whatsapp: {
        ...imported.whatsapp,
        phone: source.whatsapp.phone,
        greeting: source.whatsapp.greeting,
        includeSku: source.whatsapp.includeSku,
      },
    }),
  );
}

export async function setProjectArchived(id: string, archived: boolean): Promise<void> {
  const project = await getProject(id);
  if (!project) throw new Error("No se encontró la tienda.");
  if (isBaseTemplate(project)) {
    throw new Error("La plantilla protegida no se puede archivar ni restaurar.");
  }
  await saveProject(
    StoreProjectV1Schema.parse({
      ...project,
      status: archived ? "archived" : "active",
      updatedAt: new Date().toISOString(),
    }),
  );
}

/**
 * Elimina una tienda del perfil local con sus borradores y migraciones.
 * La plantilla base protegida nunca se puede borrar. El disco se borra por
 * separado vía el endpoint administrado (`deleteLocalProject`). Es idempotente
 * para permitir borrar tiendas que sólo estaban persistidas en disco.
 */
export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  if (project && isBaseTemplate(project)) {
    throw new Error("La plantilla protegida no se puede borrar.");
  }
  await ready();
  await database.projects.delete(id);
  await database.recoveryDrafts.delete(id);
  await database.migrations.delete(id);
}

export async function putCachedAsset(
  asset: Omit<CachedAsset, "cacheKey" | "recipeVersion" | "lastUsedAt"> &
    Partial<Pick<CachedAsset, "recipeVersion" | "lastUsedAt">>,
): Promise<void> {
  try {
    await ready();
    const recipeVersion = asset.recipeVersion ?? ASSET_CACHE_RECIPE_VERSION;
    const timestamp = asset.lastUsedAt ?? new Date().toISOString();
    await database.assetCache.put({
      ...asset,
      cacheKey: createAssetCacheKey(asset.hash, recipeVersion),
      recipeVersion,
      lastUsedAt: timestamp,
    });
  } catch {
    // La caché es regenerable; un registro corrupto o una cuota agotada no
    // debe impedir conservar la imagen en el proyecto real.
  }
}

export async function getCachedAsset(
  hash: string,
  recipeVersion = ASSET_CACHE_RECIPE_VERSION,
): Promise<CachedAsset | undefined> {
  try {
    await ready();
    const cached = await database.assetCache.get(hash);
    if (!cached || cached.recipeVersion !== recipeVersion) return undefined;
    const lastUsedAt = new Date().toISOString();
    await database.assetCache.update(hash, { lastUsedAt });
    return { ...cached, lastUsedAt };
  } catch {
    // Si el registro quedó ilegible, el caller vuelve a procesar el original.
    return undefined;
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  ratio: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return undefined;
  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  return {
    usage,
    quota,
    ratio: quota > 0 ? usage / quota : 0,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function clearAssetCache(): Promise<void> {
  await ready();
  await database.assetCache.clear();
}

export function slugify(value: string, fallback = "tienda"): string {
  const slug = slugifySlug(value);
  return slug || fallback;
}
