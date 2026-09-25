import "fake-indexeddb/auto";
import {
  getCategoryProductIds,
  IMAGE_ASSET_RECIPE,
  type ImageAsset,
  type StoreProjectV1,
  StoreProjectV1Schema,
} from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import {
  buildModernBaseTemplateProject,
  catalogModernCleanStore,
} from "@solara/project-schema/catalog-modern-template";
import { referenceStore } from "@solara/project-schema/fixture";
import { isBaseTemplate } from "@solara/project-schema/project-policy";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// El entorno de vitest no define localStorage; el stub permite probar el
// sentinel de la purga única con el mismo contrato del navegador.
const memoryStorage = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value);
      },
      removeItem: (key: string) => {
        memoryStorage.delete(key);
      },
    },
  });
}

import {
  ASSET_CACHE_RECIPE_VERSION,
  buildScaleDemoProject,
  clearAssetCache,
  clearRecoveryDraft,
  compactProjectResponsiveAssets,
  createAssetCacheKey,
  createProject,
  DEMO_ONLY_PURGE_SENTINEL,
  DEPRECATED_CATEGORY_CLEANUP_SENTINEL,
  database,
  deleteProject,
  duplicateProject,
  ensureCatalogModernDemoGallery,
  ensureCatalogModernDemoReviews,
  ensureCatalogModernDemoTestimonials,
  ensureDemoSectionOrder,
  ensureDeprecatedCategoriesRemoved,
  ensureScaleDemoProject,
  getCachedAsset,
  getProject,
  getProjectMigration,
  getRecoveryDraft,
  importProject,
  listProjects,
  listProjectsWithRecovery,
  markProjectMigration,
  needsImageOptimization,
  PREDETERMINADO_V1_PROJECT_ID,
  purgeNonDemoStores,
  putCachedAsset,
  removeRetiredDemoEditorialData,
  retireLegacyDemoProjects,
  SCALE_DEMO_PROJECT_ID,
  saveProject as saveProjectToRepository,
  saveRecoveryDraft,
  setProjectArchived,
  shouldSeedRecoveryDraft,
  V1_DEMO_PROJECT_ID,
} from "./repository";

// Las fixtures protegidas se siembran sólo para probar migraciones explícitas;
// el guard normal de saveProject sigue rechazando esas escrituras.
const saveProject = (project: StoreProjectV1) =>
  saveProjectToRepository(project, { allowProtectedWrite: isBaseTemplate(project) });

describe("repositorio local", () => {
  beforeEach(async () => {
    await database.projects.clear();
    await database.assetCache.clear();
    await database.recoveryDrafts.clear();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(DEPRECATED_CATEGORY_CLEANUP_SENTINEL);
      localStorage.removeItem(DEMO_ONLY_PURGE_SENTINEL);
    }
  });

  afterAll(async () => {
    database.close();
    await database.delete();
  });

  it("guarda, obtiene y lista un proyecto validado", async () => {
    await saveProject(referenceStore);

    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
    const records = await listProjects();
    expect(records).toHaveLength(1);
    expect(records[0]?.name).toBe(referenceStore.name);
  });

  it("compacta variantes legacy sin tocar el favicon", () => {
    const project = structuredClone(referenceStore);
    const firstAsset = project.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    firstAsset.width = 1800;
    firstAsset.height = 1200;
    firstAsset.source = "data:image/webp;base64,AA==";
    firstAsset.responsiveSources = [320, 480, 640, 768, 1024, 1280, 1600, 1800].map((width) => ({
      width,
      source: `data:image/webp;base64,${btoa(String(width))}`,
    }));
    const favicon = {
      ...firstAsset,
      id: "asset-test-favicon",
      name: "Favicon",
      alt: "Favicon",
      mimeType: "image/x-icon",
      source: "data:image/x-icon;base64,AA==",
      responsiveSources: [16, 32, 48, 64, 128, 256].map((width) => ({
        width,
        source: `data:image/png;base64,${btoa(String(width))}`,
      })),
      width: 256,
      height: 256,
    };
    project.assets.push(favicon);

    const compacted = compactProjectResponsiveAssets(project);

    expect(compacted.assets[0]?.responsiveSources?.map((source) => source.width)).toEqual([
      768, 1800,
    ]);
    expect(compacted.assets.at(-1)?.responsiveSources).toHaveLength(6);
  });

  it("rechaza guardar directamente la plantilla protegida", async () => {
    await expect(saveProjectToRepository(buildScaleDemoProject())).rejects.toMatchObject({
      code: "PROTECTED_STORE",
    });
  });

  it("mantiene un borrador de recuperación separado del proyecto confirmado", async () => {
    const edited = StoreProjectV1Schema.parse({
      ...referenceStore,
      name: "Borrador local",
      updatedAt: "2026-08-06T12:00:00.000Z",
    });
    await saveProject(referenceStore);
    await saveRecoveryDraft(edited, 4);

    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
    expect(await getRecoveryDraft(referenceStore.id)).toMatchObject({
      baseDiskVersion: 4,
      project: edited,
    });
    await clearRecoveryDraft(referenceStore.id);
    expect(await getRecoveryDraft(referenceStore.id)).toBeUndefined();
  });

  it("siembra RecoveryDraft sólo cuando el navegador es más nuevo que el disco", () => {
    const seed = { updatedAt: "2026-08-01T10:00:00.000Z" };
    const editedAfterDisk = { updatedAt: "2026-08-02T10:00:00.000Z" };
    expect(shouldSeedRecoveryDraft(editedAfterDisk, seed, true)).toBe(true);
    expect(shouldSeedRecoveryDraft(seed, editedAfterDisk, true)).toBe(false);
    expect(shouldSeedRecoveryDraft(seed, seed, true)).toBe(true);
    expect(shouldSeedRecoveryDraft(editedAfterDisk, seed, false)).toBe(false);
  });

  it("rechaza proyectos inválidos antes de escribir en IndexedDB", async () => {
    await expect(saveProject({ ...referenceStore, baseUrl: "url-inválida" })).rejects.toThrow();
    expect(await listProjects()).toHaveLength(0);
  });

  it("no guarda un proyecto que contiene una imagen sin optimizar", async () => {
    const raw = structuredClone(referenceStore);
    const firstAsset = raw.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    delete firstAsset.fallbackSource;
    delete firstAsset.responsiveSources;
    delete firstAsset.optimizationRecipe;
    firstAsset.mimeType = "image/jpeg";
    firstAsset.source = "data:image/jpeg;base64,cmF3";
    firstAsset.hash = "hash-raw";

    await expect(saveProject(raw)).rejects.toMatchObject({ code: "IMAGE_NOT_OPTIMIZED" });
    expect(await listProjects()).toHaveLength(0);
  });

  it("separa registros corruptos y deja una ruta de recuperacion accionable", async () => {
    await database.projects.put({
      id: referenceStore.id,
      name: referenceStore.name,
      status: referenceStore.status,
      updatedAt: referenceStore.updatedAt,
      project: { ...referenceStore, baseUrl: "invalid" },
    } as never);

    const result = await listProjectsWithRecovery();
    expect(result.projects).toHaveLength(0);
    expect(result.recovery).toEqual([
      expect.objectContaining({
        id: referenceStore.id,
        message: expect.stringContaining("baseUrl"),
      }),
    ]);
    await expect(getProject(referenceStore.id)).rejects.toThrow(/Importar respaldo/);
  });

  it("duplica, archiva y restaura tiendas sin alterar el original", async () => {
    await saveProject(referenceStore);
    const duplicate = await duplicateProject(referenceStore.id);

    expect(duplicate.id).not.toBe(referenceStore.id);
    expect(duplicate.products).toHaveLength(referenceStore.products.length);
    expect(duplicate.products.map((product) => product.id)).not.toEqual(
      referenceStore.products.map((product) => product.id),
    );
    expect(duplicate.origin?.seed).toBe("duplicate");
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);

    await setProjectArchived(duplicate.id, true);
    expect((await getProject(duplicate.id))?.status).toBe("archived");
    await setProjectArchived(duplicate.id, false);
    expect((await getProject(duplicate.id))?.status).toBe("active");
  });

  it("importa un respaldo como una tienda nueva sin sobrescribir el origen", async () => {
    await saveProject(referenceStore);

    const imported = await importProject(referenceStore);

    expect(imported.id).not.toBe(referenceStore.id);
    expect(imported.name).toBe(referenceStore.name);
    expect(imported.products).toHaveLength(referenceStore.products.length);
    expect(imported.products.map((product) => product.id)).not.toEqual(
      referenceStore.products.map((product) => product.id),
    );
    expect(imported.origin?.seed).toBe("duplicate");
    expect(imported.whatsapp.phone).toBe(referenceStore.whatsapp.phone);
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
  });

  it("elimina una tienda con sus borradores y protege la plantilla base", async () => {
    await saveProject(referenceStore);
    await saveProject(catalogModernStore);
    const duplicate = await duplicateProject(referenceStore.id);
    await saveRecoveryDraft(duplicate);
    await markProjectMigration(duplicate.id, "pending");

    await deleteProject(duplicate.id);
    expect(await getProject(duplicate.id)).toBeUndefined();
    expect(await getRecoveryDraft(duplicate.id)).toBeUndefined();
    expect(await getProjectMigration(duplicate.id)).toBeUndefined();
    // El original sigue intacto.
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
    await expect(deleteProject(catalogModernStore.id)).rejects.toThrow(
      "La plantilla protegida no se puede borrar.",
    );

    // El borrado es idempotente para tiendas que sólo estaban persistidas en disco.
    await expect(deleteProject(duplicate.id)).resolves.toBeUndefined();
  });

  it("crea una tienda nueva desde la plantilla sin inventar un teléfono de WhatsApp", async () => {
    const clean = await createProject({ name: "Tienda nueva" });
    expect(clean.whatsapp.phone).toBe("");
    expect(clean.origin?.seed).toBe("duplicate");
    expect(clean.origin?.role).toBe("store");
    expect(clean.products).toHaveLength(33);
    expect(clean.assets.length).toBeGreaterThan(0);

    const configured = await createProject({
      name: "Tienda configurada",
      phone: "+54 9 11 5555 1234",
    });
    expect(configured.whatsapp.phone).toBe("5491155551234");
  });

  it("conserva datos después de cerrar y reabrir Dexie", async () => {
    await saveProject(referenceStore);
    database.close();
    await database.open();

    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
  });

  it("migra la caché v1 sin cambiar su clave primaria", async () => {
    const databaseName = `solara-commerce-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(databaseName);
    legacy.version(1).stores({ assetCache: "hash, createdAt" });
    await legacy.open();
    await legacy.table("assetCache").put({
      hash: "legacy-hash",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    legacy.close();

    const upgraded = new Dexie(databaseName);
    upgraded.version(1).stores({ assetCache: "hash, createdAt" });
    upgraded
      .version(2)
      .stores({ assetCache: "hash, cacheKey, recipeVersion, createdAt, lastUsedAt" })
      .upgrade(async (transaction) => {
        await transaction.table("assetCache").clear();
      });
    await upgraded.open();

    expect(await upgraded.table("assetCache").get("legacy-hash")).toBeUndefined();
    upgraded.close();
    await Dexie.delete(databaseName);
  });

  it("identifica la caché por hash y versión de receta", () => {
    expect(createAssetCacheKey("abc")).toBe(`abc:recipe-${ASSET_CACHE_RECIPE_VERSION}`);
    expect(createAssetCacheKey("abc", 2)).not.toBe(createAssetCacheKey("abc", 1));
  });

  it("guarda y recupera assets compatibles sin reutilizar otras recetas", async () => {
    await putCachedAsset({
      hash: "hash-asset",
      originalName: "producto.jpg",
      mimeType: "image/webp",
      width: 960,
      height: 640,
      primary: "data:image/webp;base64,cHJpbWFyeQ==",
      fallback: "data:image/jpeg;base64,ZmFsbGJhY2s=",
      responsive: [{ width: 480, source: "data:image/webp;base64,cmVzcG9uc2l2ZQ==" }],
      createdAt: "2026-08-01T00:00:00.000Z",
    });

    const cached = await getCachedAsset("hash-asset");
    expect(cached?.cacheKey).toBe(createAssetCacheKey("hash-asset"));
    expect(cached?.recipeVersion).toBe(ASSET_CACHE_RECIPE_VERSION);
    expect(Date.parse(cached?.lastUsedAt ?? "")).not.toBeNaN();
    expect(await getCachedAsset("hash-asset", ASSET_CACHE_RECIPE_VERSION + 1)).toBeUndefined();
  });

  it("puede limpiar la caché regenerable sin tocar proyectos", async () => {
    await saveProject(referenceStore);
    await putCachedAsset({
      hash: "hash-cache",
      originalName: "producto.webp",
      mimeType: "image/webp",
      width: 480,
      height: 320,
      primary: "data:image/webp;base64,cA==",
      fallback: "data:image/jpeg;base64,Zg==",
      responsive: [],
      createdAt: "2026-08-01T00:00:00.000Z",
    });

    await clearAssetCache();

    expect(await getCachedAsset("hash-cache")).toBeUndefined();
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
  });

  it("preserva Predeterminado y archiva la base limpia anterior", async () => {
    const legacyClean = {
      ...structuredClone(catalogModernCleanStore),
      id: "store-catalog-modern-clean-default" as typeof catalogModernCleanStore.id,
      name: "Mi primera tienda",
      slug: "mi-primera-tienda" as typeof catalogModernCleanStore.slug,
      baseUrl: "https://mi-primera-tienda.example",
    };
    const legacyDemo = {
      ...structuredClone(catalogModernStore),
      id: "store-modo-sur-demo" as typeof catalogModernStore.id,
      name: "Demo Modo Sur, catálogo moderno",
      identity: {
        ...catalogModernStore.identity,
        legalName: "Modo Sur",
        brandName: "Modo Sur",
      },
      whatsapp: {
        ...catalogModernStore.whatsapp,
        greeting: "Hola Modo Sur, quiero hacer este pedido:",
      },
    };
    await saveProject(legacyClean);
    await saveProject(legacyDemo);

    expect(await ensureScaleDemoProject()).toBe(true);
    expect((await getProject(legacyDemo.id))?.name).toBe("Demo Modo Sur, catálogo moderno");
    expect((await getProject(legacyDemo.id))?.identity.brandName).toBe("Mi tienda");
    expect((await getProject(legacyClean.id))?.status).toBe("archived");
    expect((await getProject(legacyClean.id))?.name).toBe("Base limpia anterior");
  });

  it("no actualiza silenciosamente la presentación V2 de Predeterminado", async () => {
    const staleDemo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
      name: "Predeterminado",
      origin: { ...catalogModernStore.origin, seed: "demo" },
      products: catalogModernStore.products.map((product, index) =>
        index === 0 ? { ...product, title: "Nombre personalizado" } : product,
      ),
    });
    await saveProject(staleDemo);

    expect(await ensureScaleDemoProject()).toBe(true);
    const repaired = await getProject(SCALE_DEMO_PROJECT_ID);
    expect(repaired?.commerceTemplates.designFamily).toBe("catalog-modern-v2");
    expect(repaired?.theme.container).toBe(1760);
    expect(repaired?.products).toHaveLength(33);
  });

  it("migra el seed placeholder reservado de Predeterminado a la demo de escala", async () => {
    const staleDemo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
      name: "Predeterminado",
      origin: {
        ...catalogModernStore.origin,
        seed: "placeholder" as const,
        role: "base-template" as const,
        updatePolicy: "pinned" as const,
      },
    });
    await putCachedAsset({
      hash: "remote-unsplash-about-hero",
      originalName: "Retrato editorial de la marca.jpg",
      mimeType: "image/jpeg",
      width: 1200,
      height: 1800,
      primary: "data:image/jpeg;base64,cmVzaWR1YWw=",
      fallback: "data:image/jpeg;base64,cmVzaWR1YWw=",
      responsive: [],
      createdAt: "2026-08-23T00:00:00.000Z",
    });
    await saveProject(staleDemo);

    expect(removeRetiredDemoEditorialData(staleDemo).pages.map((page) => page.kind)).toEqual([
      "home",
    ]);
    expect(await ensureScaleDemoProject()).toBe(true);

    const cleaned = await getProject(SCALE_DEMO_PROJECT_ID);
    expect(cleaned?.origin?.seed).toBe("placeholder");
    expect(cleaned?.products).toHaveLength(33);
    expect((await getCachedAsset("remote-unsplash-about-hero"))?.hash).toBe(
      "remote-unsplash-about-hero",
    );
  });

  it("construye Predeterminado directamente con Editorial V2", () => {
    const demo = buildScaleDemoProject();
    expect(demo.name).toBe("Predeterminado");
    expect(demo.identity.brandName).toBe("Mi tienda");
    expect(JSON.stringify(demo)).not.toContain("Modo Sur");
    expect(demo.commerceTemplates.designFamily).toBe("catalog-modern-v2");
    expect(demo.theme.container).toBe(1760);
    expect(demo.products).toHaveLength(33);
    expect(demo.categories).toHaveLength(6);
  });

  it("retira Sale y Novedades de todos los proyectos sin perder productos", async () => {
    const firstProduct = catalogModernStore.products[0];
    if (!firstProduct) throw new Error("Fixture moderno incompleto");
    const stale = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: "store-stale-categories",
      origin: {
        ...catalogModernStore.origin,
        seed: "duplicate" as const,
        role: "store" as const,
        updatePolicy: "managed" as const,
      },
      categories: [
        ...structuredClone(catalogModernStore.categories),
        {
          id: "category-sale",
          slug: "sale",
          title: "Sale",
          description: "Categoria temporal",
          imageId: "asset-hero",
          productIds: [firstProduct.id],
        },
        {
          id: "category-novedades",
          slug: "novedades",
          title: "Novedades",
          description: "Categoria temporal",
          imageId: "asset-hero",
          productIds: [firstProduct.id],
        },
      ],
      products: catalogModernStore.products.map((product, index) =>
        index === 0
          ? {
              ...product,
              categoryIds: [...product.categoryIds, "category-sale", "category-novedades"],
              tags: [...product.tags, "sale", "novedades"],
            }
          : product,
      ),
      navigation: {
        ...catalogModernStore.navigation,
        items: [
          ...catalogModernStore.navigation.items,
          { id: "nav-sale", label: "Sale", href: "/categorias/sale/" },
          { id: "nav-novedades", label: "Novedades", href: "/categorias/novedades/" },
        ],
      },
      sections: catalogModernStore.sections.map((section) =>
        section.moduleId === "catalog-hero"
          ? { ...section, settings: { ...section.settings, actionHref: "/categorias/novedades/" } }
          : section,
      ),
    });
    await saveProject(stale);

    expect(await ensureDeprecatedCategoriesRemoved()).toBe(true);
    const cleaned = await getProject(stale.id);
    if (!cleaned) throw new Error("Proyecto migrado inexistente");
    expect(
      cleaned.categories.some((category) => ["sale", "novedades"].includes(category.slug)),
    ).toBe(false);
    expect(cleaned.products.every((product) => product.categoryIds.length > 0)).toBe(true);
    expect(
      cleaned.products.every(
        (product) => !product.tags.some((tag) => ["sale", "novedades"].includes(tag)),
      ),
    ).toBe(true);
    expect(JSON.stringify(cleaned.navigation)).not.toContain("categorias/sale");
    expect(JSON.stringify(cleaned.navigation)).not.toContain("categorias/novedades");
    expect(JSON.stringify(cleaned.sections)).not.toContain("categorias/novedades");
    const firstCategory = cleaned.categories[0];
    if (!firstCategory) throw new Error("Proyecto sin categorias");
    expect(firstCategory.productIds).toEqual(getCategoryProductIds(cleaned, firstCategory.id));
    expect(await ensureDeprecatedCategoriesRemoved()).toBe(false);
  });

  it("amplía las reseñas del demo sin tocar otras tiendas", async () => {
    const staleDemo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
      products: catalogModernStore.products.map((product, index) =>
        index === 0 ? { ...product, reviews: product.reviews?.slice(0, 2) } : product,
      ),
    });
    await saveProject(staleDemo);
    await saveProject(referenceStore);

    expect(await ensureCatalogModernDemoReviews({ allowProtectedWrite: true })).toBe(true);
    expect((await getProject(staleDemo.id))?.products[0]?.reviews).toHaveLength(6);
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
    expect(await ensureCatalogModernDemoReviews({ allowProtectedWrite: true })).toBe(false);
  });

  it("amplía la galería del demo sin reescribir imágenes personalizadas", async () => {
    const staleDemo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
      products: catalogModernStore.products.map((product, index) =>
        index === 0 ? { ...product, imageIds: product.imageIds.slice(0, 1) } : product,
      ),
    });
    await saveProject(staleDemo);
    await saveProject(referenceStore);

    expect(await ensureCatalogModernDemoGallery({ allowProtectedWrite: true })).toBe(true);
    const expanded = await getProject(staleDemo.id);
    expect(expanded?.products[0]?.imageIds).toHaveLength(3);
    expect(expanded?.products[0]?.imageIds[0]).toBe(staleDemo.products[0]?.imageIds[0]);
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
    expect(await ensureCatalogModernDemoGallery({ allowProtectedWrite: true })).toBe(false);
  });

  it("amplía las reseñas visibles del demo a doce sin tocar otras tiendas", async () => {
    const staleDemo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
      sections: catalogModernStore.sections.map((section) =>
        section.moduleId === "catalog-testimonials"
          ? {
              ...section,
              settings: {
                ...section.settings,
                items: Array.isArray(section.settings.items)
                  ? section.settings.items.slice(0, 3)
                  : [],
              },
            }
          : section,
      ),
    });
    await saveProject(staleDemo);
    await saveProject(referenceStore);

    expect(await ensureCatalogModernDemoTestimonials({ allowProtectedWrite: true })).toBe(true);
    const expanded = await getProject(staleDemo.id);
    const testimonials = expanded?.sections.find(
      (section) => section.moduleId === "catalog-testimonials",
    );
    expect(testimonials?.settings.items).toHaveLength(12);
    expect(await getProject(referenceStore.id)).toEqual(referenceStore);
    expect(await ensureCatalogModernDemoTestimonials({ allowProtectedWrite: true })).toBe(false);
  });

  it("reordena el demo para que el bento siga a la franja de marcas", async () => {
    const staleDemo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
      name: "Predeterminado",
    });
    await saveProject(staleDemo);

    expect(await ensureDemoSectionOrder({ allowProtectedWrite: true })).toBe(true);
    const reordered = await getProject(SCALE_DEMO_PROJECT_ID);
    const moduleIds = reordered?.sections.map((section) => section.moduleId) ?? [];
    const brandIndex = moduleIds.indexOf("catalog-brand-strip");
    expect(moduleIds.slice(brandIndex, brandIndex + 4)).toEqual([
      "catalog-brand-strip",
      "catalog-category-bento",
      "catalog-product-grid",
      "catalog-product-grid",
    ]);
    expect(reordered?.sections.map((section) => section.id).sort()).toEqual(
      staleDemo.sections.map((section) => section.id).sort(),
    );
    expect(await ensureDemoSectionOrder({ allowProtectedWrite: true })).toBe(false);
  });

  it("no reordena el demo si el bento ya sigue a la franja de marcas", async () => {
    const alreadyOrdered = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: SCALE_DEMO_PROJECT_ID,
    });
    const sections = [...alreadyOrdered.sections];
    const bentoIndex = sections.findIndex(
      (section) => section.moduleId === "catalog-category-bento",
    );
    const brandIndex = sections.findIndex((section) => section.moduleId === "catalog-brand-strip");
    const bento = sections.splice(bentoIndex, 1)[0];
    if (!bento) throw new Error("Fixture sin bento");
    sections.splice(brandIndex + 1, 0, bento);
    await saveProject(StoreProjectV1Schema.parse({ ...alreadyOrdered, sections }));

    expect(await ensureDemoSectionOrder()).toBe(false);
    expect((await getProject(SCALE_DEMO_PROJECT_ID))?.sections).toEqual(sections);
  });

  it("no toca otra tienda aunque tenga el orden viejo", async () => {
    const otherStore = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: "store-otra",
    });
    await saveProject(otherStore);

    expect(await ensureDemoSectionOrder()).toBe(false);
    expect((await getProject("store-otra"))?.sections).toEqual(otherStore.sections);
  });

  it("purga una sola vez y conserva únicamente Predeterminado V2", async () => {
    const v1Reference = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: V1_DEMO_PROJECT_ID,
    });
    const v2Reference = buildScaleDemoProject();
    const v1Demo = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: PREDETERMINADO_V1_PROJECT_ID,
    });
    const extraStore = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: "store-extra",
    });
    await saveProject(v1Reference);
    await saveProject(v2Reference);
    await saveProject(v1Demo);
    await saveProject(extraStore);
    await saveRecoveryDraft(extraStore, 0);
    await markProjectMigration(extraStore.id, "done");

    // v2: purga TODAS las tiendas (incluida la demo anterior) para re-seed
    // con placeholder. El usuario arranca limpio.
    expect(await purgeNonDemoStores()).toBe(true);
    expect(await getProject(V1_DEMO_PROJECT_ID)).toBeUndefined();
    expect(await getProject(SCALE_DEMO_PROJECT_ID)).toBeUndefined();
    expect(await getProject(PREDETERMINADO_V1_PROJECT_ID)).toBeUndefined();
    expect(await getProject("store-extra")).toBeUndefined();
    expect(await getRecoveryDraft("store-extra")).toBeUndefined();
    expect(await getProjectMigration("store-extra")).toBeUndefined();
    expect(localStorage.getItem(DEMO_ONLY_PURGE_SENTINEL)).toBe("3");

    expect(await purgeNonDemoStores()).toBe(false);
    await saveProject(StoreProjectV1Schema.parse({ ...extraStore, id: "store-nueva" }));
    expect(await purgeNonDemoStores()).toBe(false);
    expect((await getProject("store-nueva"))?.id).toBe("store-nueva");
  });

  it("retira las referencias V1 sin tocar tiendas del usuario", async () => {
    const legacyProject = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: PREDETERMINADO_V1_PROJECT_ID,
    });
    const modoSurProject = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: V1_DEMO_PROJECT_ID,
    });
    const userProject = StoreProjectV1Schema.parse({
      ...structuredClone(catalogModernStore),
      id: "store-del-usuario",
    });
    await saveProject(legacyProject);
    await saveProject(modoSurProject);
    await saveProject(userProject);
    await saveRecoveryDraft(legacyProject, 1);
    await markProjectMigration(legacyProject.id, "done");

    expect(await retireLegacyDemoProjects()).toBe(true);
    expect(await getProject(PREDETERMINADO_V1_PROJECT_ID)).toBeUndefined();
    expect(await getProject(V1_DEMO_PROJECT_ID)).toBeUndefined();
    expect(await getRecoveryDraft(PREDETERMINADO_V1_PROJECT_ID)).toBeUndefined();
    expect(await getProjectMigration(PREDETERMINADO_V1_PROJECT_ID)).toBeUndefined();
    expect(await getProject(userProject.id)).toEqual(userProject);
    expect(await retireLegacyDemoProjects()).toBe(false);
  });
});

describe("predicado de optimización de imágenes", () => {
  const avifVariant = (width: number) => ({
    width,
    source: "data:image/avif;base64,dmFyaWFudGU=",
  });
  const pngVariant = (width: number) => ({ width, source: "data:image/png;base64,cG5n" });

  function imageAsset(overrides: Partial<ImageAsset>): ImageAsset {
    return {
      kind: "image",
      id: "asset-predicado" as ImageAsset["id"],
      name: "Imagen",
      alt: "Imagen de prueba",
      mimeType: "image/avif",
      source: "data:image/avif;base64,cHJpbWFyeQ==",
      optimizationRecipe: IMAGE_ASSET_RECIPE,
      fallbackSource: "data:image/jpeg;base64,ZmFsbGJhY2s=",
      responsiveSources: [avifVariant(480), avifVariant(768), avifVariant(1800)],
      width: 1800,
      height: 1200,
      hash: "hash-predicado",
      ...overrides,
    };
  }

  it("marca para reproceso un asset del canal agente sin variantes webp o avif", () => {
    const agentAsset = imageAsset({
      mimeType: "image/png",
      source: "data:image/png;base64,b3JpZ2luYWw=",
      optimizationRecipe: undefined,
      fallbackSource: undefined,
      responsiveSources: [pngVariant(768)],
    });
    expect(needsImageOptimization(agentAsset)).toBe(true);
  });

  it("marca para reproceso una foto auditada con fallback png y receta legacy", () => {
    const auditedPhoto = imageAsset({
      fallbackSource: "data:image/png;base64,cGVzb3M=",
    });
    expect(needsImageOptimization(auditedPhoto)).toBe(true);
  });

  it("mantiene estable un asset ya reprocesado con fallback jpeg", () => {
    expect(needsImageOptimization(imageAsset({}))).toBe(false);
  });

  it("mantiene estable un asset transparente ya reprocesado con receta actual", () => {
    const transparent = imageAsset({
      optimizationRecipe: "responsive-alpha-v2",
      fallbackSource: "data:image/png;base64,dHJhbnNwYXJlbnRl",
    });
    expect(needsImageOptimization(transparent)).toBe(false);
  });

  it("considera optimizados todos los placeholders de la plantilla moderna", () => {
    const template = buildModernBaseTemplateProject();
    expect(template.assets).toHaveLength(5);
    expect(template.assets.every((asset) => needsImageOptimization(asset))).toBe(false);
    expect(template.assets.map((asset) => [asset.width, asset.height])).toEqual([
      [1254, 1254],
      [1200, 900],
      [1800, 1200],
      [1200, 628],
      [32, 32],
    ]);
  });

  it("excluye los favicons de la migración responsive", () => {
    const favicon = imageAsset({
      mimeType: "image/x-icon",
      source: "data:image/x-icon;base64,AA==",
      fallbackSource: "data:image/png;base64,ZmF2aWNvbg==",
      responsiveSources: [pngVariant(16), pngVariant(32), pngVariant(256)],
      width: 256,
      height: 256,
    });
    expect(needsImageOptimization(favicon)).toBe(false);
  });
});

describe("sentinel de migración a disco", () => {
  beforeEach(async () => {
    // El afterAll del primer describe cierra y elimina la base compartida;
    // Dexie no la reabre solo, así que se recrea con el esquema vigente aquí.
    await database.open();
    await database.migrations.clear();
  });

  it("registra el estado pending y done por proyecto", async () => {
    await markProjectMigration("store-sentinel", "pending");
    expect((await getProjectMigration("store-sentinel"))?.status).toBe("pending");
    await markProjectMigration("store-sentinel", "done");
    expect((await getProjectMigration("store-sentinel"))?.status).toBe("done");
  });

  it("no mezcla registros de proyectos distintos", async () => {
    await markProjectMigration("store-a", "done");
    await markProjectMigration("store-b", "pending");
    expect((await getProjectMigration("store-a"))?.status).toBe("done");
    expect((await getProjectMigration("store-b"))?.status).toBe("pending");
  });
});
