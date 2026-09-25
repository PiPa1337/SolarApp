import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernCleanStore } from "@solara/project-schema/catalog-modern-template";
import { describe, expect, it, vi } from "vitest";
import {
  auditStoreHealth,
  calculateMonthlyCost,
  DASHBOARD_GRID_PAGE_SIZE,
  DASHBOARD_LIST_PAGE_SIZE,
  DEFAULT_PRICING,
  DEFAULT_VARIANT_BILLING_MODE,
  filterDashboardProjects,
  getDashboardStats,
  getProjectMetrics,
  loadVariantBillingMode,
  paginateDashboardItems,
  partitionPinnedProjects,
  saveVariantBillingMode,
  storeHeroAsset,
  storeMark,
  storeSocialImageAsset,
} from "./dashboardModel";
import type { StoredProject } from "./repository";

function record(
  id: string,
  name: string,
  updatedAt: string,
  status: StoredProject["status"] = "active",
  project = catalogModernStore,
): StoredProject {
  return { id, name, status, updatedAt, project };
}

describe("modelo del dashboard", () => {
  it("resume sólo datos reales del proyecto", () => {
    const metrics = getProjectMetrics(catalogModernStore);

    expect(metrics.activeProducts).toBe(50);
    expect(metrics.billableProducts).toBe(60);
    expect(metrics.variantExtras).toBe(10);
    expect(metrics.categories).toBe(14);
    expect(metrics.collections).toBeGreaterThan(0);
    expect(metrics.assets).toBeGreaterThan(0);
  });

  it("resuelve la imagen principal configurada para el hero de la home", () => {
    const hero = catalogModernStore.sections.find((section) => section.slot === "hero");
    if (!hero || typeof hero.settings.posterAssetId !== "string") {
      throw new Error("Fixture sin imagen de hero");
    }

    expect(storeHeroAsset(catalogModernStore)?.id).toBe(hero.settings.posterAssetId);
  });

  it("resuelve la misma imagen social que usa la portada og:image", () => {
    const project = {
      ...catalogModernStore,
      seo: { ...catalogModernStore.seo, socialImageId: "asset-hero" },
    };

    expect(storeSocialImageAsset(project)?.id).toBe("asset-hero");
  });

  it("cuenta cada variante adicional de productos activos aunque no esté disponible", () => {
    const first = catalogModernStore.products[0];
    const second = catalogModernStore.products[1];
    if (!first || !second) throw new Error("Fixture sin productos suficientes");

    const project = {
      ...catalogModernStore,
      products: [
        {
          ...first,
          variants: first.variants.slice(0, 5).map((variant, index) => ({
            ...variant,
            available: index !== 4,
          })),
        },
        { ...second, variants: second.variants.slice(0, 1) },
        { ...first, id: "product-hidden", status: "hidden" as const },
      ],
    };

    expect(getProjectMetrics(project)).toMatchObject({
      activeProducts: 2,
      billableProducts: 6,
      variantExtras: 4,
    });
  });

  it("no agrega extras cuando cada producto activo tiene una sola variante", () => {
    const metrics = getProjectMetrics(catalogModernCleanStore);

    expect(metrics.variantExtras).toBe(0);
    expect(metrics.billableProducts).toBe(metrics.activeProducts);
  });

  it("convierte 164 productos con dos grupos de cinco variantes en 172 facturables", () => {
    const multiVariant = catalogModernStore.products[0];
    const singleVariant = catalogModernStore.products[1];
    if (!multiVariant || !singleVariant) throw new Error("Fixture sin productos suficientes");

    const project = {
      ...catalogModernStore,
      products: Array.from({ length: 164 }, (_, index) => ({
        ...(index < 2 ? multiVariant : singleVariant),
        id: `product-billable-${index}`,
        status: "active" as const,
        variants:
          index < 2 ? multiVariant.variants.slice(0, 5) : singleVariant.variants.slice(0, 1),
      })),
    };

    expect(getProjectMetrics(project)).toMatchObject({
      activeProducts: 164,
      billableProducts: 172,
      variantExtras: 8,
    });
  });

  it("calcula la mensualidad con productos facturables, no con el inventario real", () => {
    expect(calculateMonthlyCost(catalogModernStore, undefined, DEFAULT_PRICING)).toBe(32_000);
  });

  it("permite calcular sin cobrar variantes y conserva los extras informativos", () => {
    const metrics = getProjectMetrics(catalogModernStore, "products-only");

    expect(metrics).toMatchObject({
      activeProducts: 50,
      billableProducts: 50,
      variantExtras: 10,
    });
    expect(
      calculateMonthlyCost(catalogModernStore, undefined, DEFAULT_PRICING, "products-only"),
    ).toBe(29_000);
  });

  it("persiste el modo de cobro de variantes por tienda", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    expect(loadVariantBillingMode("tienda-a")).toBe(DEFAULT_VARIANT_BILLING_MODE);
    saveVariantBillingMode("tienda-a", "products-only");
    expect(loadVariantBillingMode("tienda-a")).toBe("products-only");
    expect(loadVariantBillingMode("tienda-b")).toBe(DEFAULT_VARIANT_BILLING_MODE);
  });

  it("suma tiendas activas y archivadas sin inventar métricas", () => {
    const projects = [
      record("active", "Activa", "2026-08-01T00:00:00.000Z"),
      record("archived", "Archivada", "2026-08-02T00:00:00.000Z", "archived", {
        ...catalogModernCleanStore,
        status: "archived",
      }),
    ];

    expect(getDashboardStats(projects)).toEqual({
      totalStores: 2,
      activeStores: 1,
      archivedStores: 1,
      activeProducts: 50,
    });
  });

  it("filtra sin distinguir acentos y ordena de forma determinista", () => {
    const projects = [
      record("zeta", "Álamo", "2026-08-01T00:00:00.000Z"),
      record("alpha", "Casa Sur", "2026-08-03T00:00:00.000Z"),
      record("archived", "Casa Antigua", "2026-08-02T00:00:00.000Z", "archived"),
    ];

    expect(
      filterDashboardProjects(projects, "alamo", "all", "name").map((item) => item.id),
    ).toEqual(["zeta"]);
    expect(
      filterDashboardProjects(projects, "casa", "active", "updated").map((item) => item.id),
    ).toEqual(["alpha"]);
    expect(filterDashboardProjects(projects, "", "all", "name").map((item) => item.id)).toEqual([
      "zeta",
      "archived",
      "alpha",
    ]);
  });

  it("particiona las fijadas al inicio conservando el orden del resto", () => {
    const projects = [
      record("zeta", "Álamo", "2026-08-01T00:00:00.000Z"),
      record("alpha", "Casa Sur", "2026-08-03T00:00:00.000Z"),
      record("archived", "Casa Antigua", "2026-08-02T00:00:00.000Z", "archived"),
    ];

    expect(partitionPinnedProjects(projects, ["alpha"]).pinned.map((item) => item.id)).toEqual([
      "alpha",
    ]);
    expect(partitionPinnedProjects(projects, ["alpha"]).rest.map((item) => item.id)).toEqual([
      "zeta",
      "archived",
    ]);
    expect(partitionPinnedProjects(projects, []).pinned).toHaveLength(0);
    expect(partitionPinnedProjects(projects, ["alpha", "missing"]).pinned).toHaveLength(1);
  });

  it("pagina la grilla en nueve elementos y la lista en cinco sin perder el total", () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1);

    expect(paginateDashboardItems(items, 1, DASHBOARD_GRID_PAGE_SIZE)).toMatchObject({
      items: items.slice(0, 9),
      page: 1,
      pageCount: 3,
      startIndex: 0,
      endIndex: 9,
    });
    expect(paginateDashboardItems(items, 2, DASHBOARD_LIST_PAGE_SIZE)).toMatchObject({
      items: items.slice(5, 10),
      page: 2,
      pageCount: 5,
      startIndex: 5,
      endIndex: 10,
    });
  });

  it("ajusta páginas inválidas al límite disponible", () => {
    const items = ["a", "b", "c"];

    expect(paginateDashboardItems(items, 99, 2)).toMatchObject({
      items: ["c"],
      page: 2,
      pageCount: 2,
      startIndex: 2,
      endIndex: 3,
    });
    expect(paginateDashboardItems(items, 0, 2).page).toBe(1);
  });

  it("salta sólo la tienda lenta y sigue auditando el resto", () => {
    let elapsed = 0;
    let slow = true;
    const now = () => elapsed;
    const audit = (project: StoredProject["project"]) => {
      expect(project.id).toBe(catalogModernStore.id);
      if (slow) {
        slow = false;
        elapsed += 400;
      }
      return 1;
    };

    const result = auditStoreHealth(
      [
        record("lenta", "Lenta", "2026-08-01T00:00:00.000Z"),
        record("rapida", "Rápida", "2026-08-02T00:00:00.000Z"),
      ],
      audit,
      300,
      now,
    );

    expect(slow).toBe(false);
    expect(result).toEqual({ critical: 1, skipped: 1 });
  });

  it("no cuenta la omisión cuando ninguna tienda excede el presupuesto", () => {
    const now = () => 1_000;

    const result = auditStoreHealth(
      [
        record("a", "Una", "2026-08-01T00:00:00.000Z"),
        record("b", "Dos", "2026-08-02T00:00:00.000Z"),
      ],
      () => 3,
      300,
      now,
    );

    expect(result).toEqual({ critical: 6, skipped: 0 });
  });

  it("sigue con el resto cuando una tienda no puede auditarse", () => {
    let threw = true;
    const audit = (project: StoredProject["project"]) => {
      if (threw) {
        threw = false;
        throw new Error("auditoría rota");
      }
      return project.assets.length + 1;
    };

    const result = auditStoreHealth(
      [
        record("rota", "Rota", "2026-08-01T00:00:00.000Z"),
        record("sana", "Sana", "2026-08-02T00:00:00.000Z"),
      ],
      audit,
      300,
      () => 0,
    );

    expect(threw).toBe(false);
    expect(result.skipped).toBe(0);
    expect(result.critical).toBeGreaterThan(0);
  });

  it("devuelve sumario vacío sin tiendas", () => {
    expect(
      auditStoreHealth(
        [],
        () => 1,
        300,
        () => 0,
      ),
    ).toEqual({ critical: 0, skipped: 0 });
  });

  it("reutiliza la auditoría cacheada mientras el snapshot no cambie", () => {
    const records = [
      record("a", "Una", "2026-08-01T00:00:00.000Z"),
      record("b", "Dos", "2026-08-02T00:00:00.000Z"),
    ];
    const audit = vi.fn(() => 2);
    const cache = new Map<string, { project: StoredProject["project"]; critical: number }>();

    const first = auditStoreHealth(records, audit, 300, () => 0, cache);
    const second = auditStoreHealth(records, audit, 300, () => 0, cache);

    expect(first).toEqual({ critical: 4, skipped: 0 });
    expect(second).toEqual({ critical: 4, skipped: 0 });
    expect(audit).toHaveBeenCalledTimes(2);
  });

  it("re-audita cuando el snapshot de la tienda cambió", () => {
    const original = record("a", "Una", "2026-08-01T00:00:00.000Z");
    const edited = { ...original, project: { ...original.project, name: "Otra" } };
    const audit = vi.fn(() => 2);
    const cache = new Map<string, { project: StoredProject["project"]; critical: number }>();

    auditStoreHealth([original], audit, 300, () => 0, cache);
    const second = auditStoreHealth([edited], audit, 300, () => 0, cache);

    expect(audit).toHaveBeenCalledTimes(2);
    expect(second).toEqual({ critical: 2, skipped: 0 });
  });

  it("marca la tienda con iniciales por palabra, no con las dos primeras letras", () => {
    expect(storeMark("Predeterminado")).toBe("PR");
    expect(storeMark("Predeterminado V1")).toBe("PV");
    expect(storeMark("  mi   tienda  ")).toBe("MT");
    expect(storeMark("")).toBe("?");
    expect(storeMark("A")).toBe("A");
  });
});
