import { resolveSocialImage } from "@solara/exporter";
import type { StoredProject } from "./repository";

export type DashboardStatusFilter = "all" | "active" | "archived";
export type DashboardSort = "name" | "updated" | "products";

export const DASHBOARD_GRID_PAGE_SIZE = 9;
export const DASHBOARD_LIST_PAGE_SIZE = 5;

export interface DashboardPage<T> {
  items: T[];
  page: number;
  pageCount: number;
  startIndex: number;
  endIndex: number;
}

export interface DashboardStats {
  totalStores: number;
  activeStores: number;
  archivedStores: number;
  activeProducts: number;
}

export interface ProjectMetrics {
  activeProducts: number;
  billableProducts: number;
  variantExtras: number;
  categories: number;
  collections: number;
  assets: number;
}

export interface PinnedPartition<T> {
  pinned: T[];
  rest: T[];
}

export function paginateDashboardItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
): DashboardPage<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), pageCount);
  const startIndex = Math.min((page - 1) * safePageSize, items.length);
  const endIndex = Math.min(startIndex + safePageSize, items.length);
  return {
    items: items.slice(startIndex, endIndex),
    page,
    pageCount,
    startIndex,
    endIndex,
  };
}

export interface HealthAuditResult {
  critical: number;
  skipped: number;
}

export function storeMark(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase() || "?";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function storeFaviconSrc(project: StoredProject["project"]): string | undefined {
  const faviconId = project.seo.faviconAssetId;
  if (!faviconId) return undefined;
  const asset = project.assets.find((candidate) => candidate.id === faviconId);
  if (!asset) return undefined;
  return asset.fallbackSource ?? asset.source;
}

function stringSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function homeHeroAssetIds(project: StoredProject["project"]): string[] {
  const home = project.pages.find((page) => page.kind === "home");
  const sections = home?.sections.length ? home.sections : project.sections;
  const hero =
    sections.find((section) => section.slot === "hero" && section.enabled) ??
    sections.find((section) => section.slot === "hero");
  const settings = hero?.settings ?? {};
  const slides = Array.isArray(settings.slides) ? settings.slides : [];
  const firstSlide = slides.find(
    (slide): slide is Record<string, unknown> =>
      typeof slide === "object" && slide !== null && !Array.isArray(slide),
  );
  const firstSlideImageId = firstSlide ? stringSetting(firstSlide, "imageId") : undefined;
  const mode = stringSetting(settings, "mode");
  const videoId = stringSetting(settings, "videoAssetId");
  const videoPosterId = videoId
    ? project.videos.find((video) => video.id === videoId)?.posterAssetId
    : undefined;
  const configuredIds = [
    ...(mode === "carousel" ? [firstSlideImageId] : []),
    stringSetting(settings, "posterAssetId"),
    stringSetting(settings, "imageId"),
    videoPosterId,
    ...(mode !== "carousel" ? [firstSlideImageId] : []),
    stringSetting(settings, "backgroundImageId"),
  ];
  const fallbackIds = [
    project.seo.socialImageId,
    project.collections.find((collection) => collection.status !== "hidden")?.imageId,
    project.products.find((product) => product.status === "active")?.imageIds[0],
  ];
  return [...new Set([...configuredIds, ...fallbackIds].filter((id): id is string => Boolean(id)))];
}

/** Devuelve el asset visual que representa el hero de la home en una card. */
export function storeHeroAsset(
  project: StoredProject["project"],
): StoredProject["project"]["assets"][number] | undefined {
  const assetIds = homeHeroAssetIds(project);
  return assetIds
    .map((assetId) => project.assets.find((asset) => asset.id === assetId))
    .find((asset) => asset !== undefined);
}

/** Devuelve el mismo asset que el exporter usa para la portada `og:image`. */
export function storeSocialImageAsset(
  project: StoredProject["project"],
): StoredProject["project"]["assets"][number] | undefined {
  return resolveSocialImage(project).asset;
}

export interface HealthAuditCacheEntry {
  project: StoredProject["project"];
  critical: number;
}

/**
 * Audita la salud de cada tienda respetando un presupuesto por tienda. El
 * cache opcional evita re-auditar snapshots sin cambios: la identidad del
 * objeto proyecto garantiza que el resultado sigue vigente.
 */
export function auditStoreHealth(
  projects: readonly StoredProject[],
  audit: (project: StoredProject["project"]) => number,
  timeoutMs: number,
  now: () => number,
  cache?: Map<string, HealthAuditCacheEntry>,
): HealthAuditResult {
  let critical = 0;
  let skipped = 0;
  for (const record of projects) {
    const cached = cache?.get(record.id);
    if (cached && cached.project === record.project) {
      critical += cached.critical;
      continue;
    }
    const startedAt = now();
    let issues: number | undefined;
    try {
      issues = audit(record.project);
    } catch {
      // Una tienda puede no auditarse; el resto del sumario sigue disponible.
    }
    if (now() - startedAt > timeoutMs) {
      skipped += 1;
      cache?.delete(record.id);
    } else if (issues !== undefined) {
      critical += issues;
      cache?.set(record.id, { project: record.project, critical: issues });
    }
  }
  return { critical, skipped };
}

export function partitionPinnedProjects<T extends { id: string }>(
  projects: readonly T[],
  pinnedIds: readonly string[],
): PinnedPartition<T> {
  const pinnedSet = new Set(pinnedIds);
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const project of projects) {
    (pinnedSet.has(project.id) ? pinned : rest).push(project);
  }
  return { pinned, rest };
}

export function getProjectMetrics(project: StoredProject["project"]): ProjectMetrics {
  const activeProducts = project.products.filter((product) => product.status === "active");
  const variantExtras = activeProducts.reduce(
    (total, product) => total + Math.max(0, product.variants.length - 1),
    0,
  );
  return {
    activeProducts: activeProducts.length,
    billableProducts: activeProducts.length + variantExtras,
    variantExtras,
    categories: project.categories.length,
    collections: project.collections.length,
    assets: project.assets.length,
  };
}

/**
 * Configuración de precios mensual — centralizada y configurable.
 * `base` + `included` + `tiers` es global (misma tarifa para todas las tiendas).
 * Los cambios se persisten en localStorage y se reflejan en card y popup sin reload.
 */
export interface PricingConfig {
  base: number;
  included: number; // fijo en 20, no editable en UI
  tier1Price: number; // 21..100
  tier2Price: number; // 101..200
  tier3Price: number; // 201+
}

export const DEFAULT_PRICING: PricingConfig = {
  base: 20000,
  included: 20,
  tier1Price: 300,
  tier2Price: 200,
  tier3Price: 100,
};

// Mantener compatibilidad con código que importaba MONTHLY_PRICING
export const MONTHLY_PRICING = {
  base: DEFAULT_PRICING.base,
  included: DEFAULT_PRICING.included,
  tiers: [
    { upTo: 100, price: DEFAULT_PRICING.tier1Price },
    { upTo: 200, price: DEFAULT_PRICING.tier2Price },
    { upTo: Infinity, price: DEFAULT_PRICING.tier3Price },
  ],
} as const;

const PRICING_STORAGE_KEY = "solara-pricing-config";
const DISCOUNT_STORAGE_KEY = "solara-store-discounts";

function readPricingConfigSafe(): PricingConfig {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return DEFAULT_PRICING;
  try {
    const raw = localStorage.getItem(PRICING_STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING;
    const parsed = JSON.parse(raw) as Partial<PricingConfig>;
    const base =
      typeof parsed.base === "number" && Number.isFinite(parsed.base) && parsed.base >= 0
        ? Math.round(parsed.base)
        : DEFAULT_PRICING.base;
    // incluido fijo en 20 — se ignora valor guardado para evitar tarifa inconsistente
    const included = DEFAULT_PRICING.included;
    const t1 =
      typeof parsed.tier1Price === "number" &&
      Number.isFinite(parsed.tier1Price) &&
      parsed.tier1Price >= 0
        ? Math.round(parsed.tier1Price)
        : DEFAULT_PRICING.tier1Price;
    const t2 =
      typeof parsed.tier2Price === "number" &&
      Number.isFinite(parsed.tier2Price) &&
      parsed.tier2Price >= 0
        ? Math.round(parsed.tier2Price)
        : DEFAULT_PRICING.tier2Price;
    const t3 =
      typeof parsed.tier3Price === "number" &&
      Number.isFinite(parsed.tier3Price) &&
      parsed.tier3Price >= 0
        ? Math.round(parsed.tier3Price)
        : DEFAULT_PRICING.tier3Price;
    return { base, included, tier1Price: t1, tier2Price: t2, tier3Price: t3 };
  } catch {
    return DEFAULT_PRICING;
  }
}

export function loadPricingConfig(): PricingConfig {
  return readPricingConfigSafe();
}

export function savePricingConfig(config: PricingConfig): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  // incluido siempre 20
  const toSave = { ...config, included: DEFAULT_PRICING.included };
  localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(toSave));
}

export function loadStoreDiscounts(): Record<string, number> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(DISCOUNT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100)
        out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadStoreDiscount(storeId: string): number {
  return loadStoreDiscounts()[storeId] ?? 0;
}

export function saveStoreDiscount(storeId: string, discountPercent: number): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const all = loadStoreDiscounts();
  const clamped = Math.max(0, Math.min(100, Math.round(discountPercent)));
  if (clamped === 0) delete all[storeId];
  else all[storeId] = clamped;
  localStorage.setItem(DISCOUNT_STORAGE_KEY, JSON.stringify(all));
}

function pricingToTiers(config: PricingConfig): Array<{ upTo: number; price: number }> {
  return [
    { upTo: 100, price: config.tier1Price },
    { upTo: 200, price: config.tier2Price },
    { upTo: Infinity, price: config.tier3Price },
  ];
}

/**
 * Calcula el coste mensual según cantidad de unidades facturables y config.
 * Fórmula: base (incluye `included`) + tramos adicionales.
 * Ej: 50 → 20.000 + 30×300 = 29.000
 */
export function calculateMonthlyCostForCount(
  count: number,
  config: PricingConfig = loadPricingConfig(),
): number {
  const { base, included } = config;
  const tiers = pricingToTiers(config);
  if (count <= included) return base;
  let total = base;
  let previousUpTo = included;
  for (const tier of tiers) {
    if (count <= previousUpTo) break;
    const upper = Math.min(count, tier.upTo);
    const productsInTier = upper - previousUpTo;
    total += productsInTier * tier.price;
    previousUpTo = tier.upTo;
    if (count <= tier.upTo) break;
  }
  return total;
}

export function calculateMonthlyCost(
  project: StoredProject["project"],
  storeId?: string,
  config?: PricingConfig,
): number {
  const metrics = getProjectMetrics(project);
  const effectiveConfig = config ?? loadPricingConfig();
  const baseCost = calculateMonthlyCostForCount(metrics.billableProducts, effectiveConfig);
  if (!storeId) return baseCost;
  const discount = loadStoreDiscount(storeId);
  if (discount <= 0) return baseCost;
  return Math.max(0, Math.round(baseCost * (1 - discount / 100)));
}

export function formatMonthlyCost(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Desglose por tramo para el popup de Calculadora. */
export function getMonthlyCostBreakdown(
  count: number,
  config: PricingConfig = loadPricingConfig(),
): Array<{
  label: string;
  products: number;
  price: number;
  subtotal: number;
}> {
  const { included } = config;
  const tiers = pricingToTiers(config);
  const breakdown: Array<{ label: string; products: number; price: number; subtotal: number }> = [];
  if (count <= included) return breakdown;
  let previousUpTo = included;
  for (const tier of tiers) {
    if (count <= previousUpTo) break;
    const upper = Math.min(count, tier.upTo);
    const productsInTier = upper - previousUpTo;
    if (productsInTier <= 0) {
      previousUpTo = tier.upTo;
      continue;
    }
    const label =
      tier.upTo === Infinity
        ? `Productos 201 en adelante`
        : `Productos ${previousUpTo + 1} al ${tier.upTo}`;
    breakdown.push({
      label,
      products: productsInTier,
      price: tier.price,
      subtotal: productsInTier * tier.price,
    });
    previousUpTo = tier.upTo;
    if (count <= tier.upTo) break;
  }
  return breakdown;
}

export function getDashboardStats(projects: readonly StoredProject[]): DashboardStats {
  return projects.reduce<DashboardStats>(
    (stats, record) => {
      stats.totalStores += 1;
      if (record.status === "active") stats.activeStores += 1;
      if (record.status === "archived") stats.archivedStores += 1;
      stats.activeProducts += getProjectMetrics(record.project).activeProducts;
      return stats;
    },
    { totalStores: 0, activeStores: 0, archivedStores: 0, activeProducts: 0 },
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

export function filterDashboardProjects(
  projects: readonly StoredProject[],
  query: string,
  status: DashboardStatusFilter,
  sort: DashboardSort,
): StoredProject[] {
  const needle = normalize(query);
  const filtered = projects.filter((record) => {
    if (status !== "all" && record.status !== status) return false;
    if (!needle) return true;
    const haystack = normalize(`${record.name} ${record.project.slug} ${record.project.baseUrl}`);
    return haystack.includes(needle);
  });

  return filtered.toSorted((left, right) => {
    if (sort === "updated") {
      const updated = right.updatedAt.localeCompare(left.updatedAt);
      return updated || left.id.localeCompare(right.id);
    }
    if (sort === "products") {
      const products =
        getProjectMetrics(right.project).activeProducts -
        getProjectMetrics(left.project).activeProducts;
      return (
        products || left.name.localeCompare(right.name, "es-AR") || left.id.localeCompare(right.id)
      );
    }
    return left.name.localeCompare(right.name, "es-AR") || left.id.localeCompare(right.id);
  });
}
