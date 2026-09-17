import { describe, expect, it } from "vitest";
import { catalogModernStore } from "./catalog-modern-fixture";
import { catalogModernV2Store } from "./catalog-modern-v2-fixture";
import { referenceStore } from "./fixture";
import {
  MoneySchema,
  migrateProject,
  ProductSchema,
  PUBLIC_COPY_DEFAULTS,
  personalizeWhatsAppGreeting,
  SlugSchema,
  type StoreProjectV2,
  StoreProjectV2Schema,
} from "./index";

function invalidProject(mutator: (project: StoreProjectV2) => void): StoreProjectV2 {
  const project = structuredClone(referenceStore);
  mutator(project);
  return project;
}

describe("StoreProjectV2Schema", () => {
  it("personaliza el saludo comercial con la marca actual", () => {
    expect(
      personalizeWhatsAppGreeting("Hola Modo Sur, quiero hacer este pedido:", "Predeterminado"),
    ).toBe("Hola Predeterminado, quiero hacer este pedido:");
    expect(personalizeWhatsAppGreeting("Necesito ayuda", "Predeterminado")).toBe("Necesito ayuda");
  });

  it("valida el fixture compartido", () => {
    expect(StoreProjectV2Schema.parse(referenceStore)).toEqual(referenceStore);
  });

  it("normaliza publicCopy para respaldos V2 anteriores", () => {
    const { publicCopy: _legacyCopy, ...legacyProject } = structuredClone(referenceStore);

    const parsed = StoreProjectV2Schema.parse(legacyProject);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.publicCopy.navigation.cart).toBe(PUBLIC_COPY_DEFAULTS.navigation.cart);
    expect(parsed.publicCopy.product.addToCart).toBe(PUBLIC_COPY_DEFAULTS.product.addToCart);
  });

  it("acepta fecha de disponibilidad opcional sin cambiar schemaVersion", () => {
    const project = structuredClone(referenceStore);
    const variant = project.products[0]?.variants[0];
    if (!variant) throw new Error("Fixture incompleto");
    variant.availabilityDate = "2026-09-01T00:00:00.000Z";

    const parsed = StoreProjectV2Schema.parse(project);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.products[0]?.variants[0]?.availabilityDate).toBe("2026-09-01T00:00:00.000Z");
  });

  it("acepta catalog-modern-v2 sin cambiar schemaVersion ni reinterpretar V1", () => {
    const parsed = StoreProjectV2Schema.parse(catalogModernV2Store);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.commerceTemplates.designFamily).toBe("catalog-modern-v2");
    expect(parsed.theme.colors.background).toBe("#f7f5f0");
    expect(parsed.theme.container).toBe(1760);
    expect(catalogModernStore.commerceTemplates.designFamily).toBe("catalog-modern-v1");
  });

  it("asigna a cada categoría raíz una imagen curada o determinista del store moderno", () => {
    const roots = catalogModernStore.categories.filter((category) => !category.parentId);
    const assetIds = new Set<string>(catalogModernStore.assets.map((asset) => asset.id));

    expect(roots).toHaveLength(8);
    roots.forEach((category) => {
      expect(category.imageId, category.id).toBeDefined();
      expect(assetIds.has(category.imageId ?? ""), category.id).toBe(true);
    });

    const byId = new Map<string, string>(
      roots.map((category) => [category.id, category.imageId ?? ""]),
    );
    expect(byId.get("category-remeras")).toBe("asset-product-01");
    expect(byId.get("category-camisas")).toBe("asset-product-04");
    expect(byId.get("category-pantalones")).toBe("asset-product-06");
    const abrigos = roots.find((category) => category.id === "category-abrigos");
    const abrigosFirstProduct = catalogModernStore.products.find((product) =>
      abrigos?.productIds.includes(product.id),
    );
    expect(abrigos?.imageId).toBe(abrigosFirstProduct?.imageIds[0]);
  });

  it("rechaza dinero fraccionario y slugs inválidos", () => {
    expect(MoneySchema.safeParse(19.99).success).toBe(false);
    expect(SlugSchema.safeParse("Manta Bruma").success).toBe(false);
  });

  it("rechaza slugs con nombres reservados de Windows", () => {
    const reserved = [
      "con",
      "prn",
      "aux",
      "nul",
      "com1",
      "com9",
      "lpt1",
      "lpt9",
      "CON",
      "Nul",
      "CoM3",
    ];
    for (const slug of reserved) {
      expect(SlugSchema.safeParse(slug).success, `slug reservado aceptado: ${slug}`).toBe(false);
    }
    const allowed = ["contenido", "control", "conn", "const", "com", "lpt", "com10", "lpt10"];
    for (const slug of allowed) {
      expect(SlugSchema.safeParse(slug).success, `slug válido rechazado: ${slug}`).toBe(true);
    }
  });

  it("rechaza versiones sin migración", () => {
    expect(() => migrateProject({ ...referenceStore, schemaVersion: 1 })).toThrow(
      "Versión de proyecto incompatible",
    );
  });

  it("rechaza IDs duplicados de entidades y variantes", () => {
    const duplicateProduct = invalidProject((project) => {
      const first = project.products[0];
      if (first) project.products.push(structuredClone(first));
    });
    expect(() => StoreProjectV2Schema.parse(duplicateProduct)).toThrow("ID de producto duplicado");

    const duplicateVariant = invalidProject((project) => {
      const firstVariant = project.products[0]?.variants[0];
      const secondVariant = project.products[1]?.variants[0];
      if (firstVariant && secondVariant) secondVariant.id = firstVariant.id;
    });
    expect(() => StoreProjectV2Schema.parse(duplicateVariant)).toThrow("ID de variante duplicado");

    const duplicateSection = invalidProject((project) => {
      const first = project.sections[0];
      if (first) project.sections.push(structuredClone(first));
    });
    expect(() => StoreProjectV2Schema.parse(duplicateSection)).toThrow("ID de sección duplicado");
  });

  it("rechaza slugs duplicados por familia", () => {
    const duplicateProductSlug = invalidProject((project) => {
      const first = project.products[0];
      const second = project.products[1];
      if (first && second) second.slug = first.slug;
    });
    expect(() => StoreProjectV2Schema.parse(duplicateProductSlug)).toThrow(
      "Slug de producto duplicado",
    );

    const duplicateCategorySlug = invalidProject((project) => {
      const first = project.categories[0];
      const second = project.categories[1];
      if (first && second) second.slug = first.slug;
    });
    expect(() => StoreProjectV2Schema.parse(duplicateCategorySlug)).toThrow(
      "Slug de categoría duplicado",
    );
  });

  it("rechaza referencias inexistentes e índices inversos incoherentes", () => {
    const missingCategory = invalidProject((project) => {
      const product = project.products[0];
      const existing = project.categories[0];
      if (product && existing)
        product.categoryIds = [`${existing.id}-missing` as typeof existing.id];
    });
    expect(() => StoreProjectV2Schema.parse(missingCategory)).toThrow("Categoría del producto");

    const missingAsset = invalidProject((project) => {
      const product = project.products[0];
      const existing = project.assets[0];
      if (product && existing) product.imageIds = [`${existing.id}-missing` as typeof existing.id];
    });
    expect(() => StoreProjectV2Schema.parse(missingAsset)).toThrow("Imagen del producto");

    const missingFavicon = invalidProject((project) => {
      project.seo.faviconAssetId = "missing-favicon";
    });
    expect(() => StoreProjectV2Schema.parse(missingFavicon)).toThrow("Favicon");

    const inconsistentIndex = invalidProject((project) => {
      const category = project.categories[0];
      if (category) category.productIds = [];
    });
    expect(() => StoreProjectV2Schema.parse(inconsistentIndex)).toThrow(
      "no coincide con las asignaciones",
    );
  });

  it("acepta fondo de tema opcional y rechaza imagen inexistente o tamaño inseguro", () => {
    const assetId = referenceStore.assets[0]?.id;
    if (!assetId) throw new Error("Fixture incompleto");
    const withBackground = invalidProject((project) => {
      Object.assign(project.theme, {
        background: { imageAssetId: assetId, repeat: "repeat", size: "480px", opacity: 0.45 },
      });
    });
    const parsed = StoreProjectV2Schema.parse(withBackground);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.theme.background?.imageAssetId).toBe(assetId);
    expect(parsed.theme.background?.repeat).toBe("repeat");
    expect(parsed.theme.background?.size).toBe("480px");
    expect(parsed.theme.background?.opacity).toBe(0.45);

    const defaultBackground = invalidProject((project) => {
      Object.assign(project.theme, { background: { imageAssetId: assetId } });
    });
    expect(StoreProjectV2Schema.parse(defaultBackground).theme.background?.opacity).toBe(1);

    const missingBackground = invalidProject((project) => {
      Object.assign(project.theme, { background: { imageAssetId: "missing-background" } });
    });
    expect(() => StoreProjectV2Schema.parse(missingBackground)).toThrow("Fondo");

    const unsafeSize = invalidProject((project) => {
      Object.assign(project.theme, {
        background: { imageAssetId: assetId, size: "480px};body{display:none" },
      });
    });
    expect(() => StoreProjectV2Schema.parse(unsafeSize)).toThrow();

    const unsafeOpacity = invalidProject((project) => {
      Object.assign(project.theme, { background: { imageAssetId: assetId, opacity: 1.1 } });
    });
    expect(() => StoreProjectV2Schema.parse(unsafeOpacity)).toThrow();
  });

  it("acepta la sombra de texto del hero mobile con defaults seguros", () => {
    const project = invalidProject((value) => {
      Object.assign(value.theme, { shadows: { text: { opacity: 0.85 } } });
    });

    const parsed = StoreProjectV2Schema.parse(project);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.theme.shadows?.text).toEqual({
      enabled: true,
      opacity: 0.85,
      offsetX: 1,
      offsetY: 1,
      blur: 0,
    });
  });

  it("acepta distancias independientes para las cuatro direcciones de la sombra", () => {
    const project = invalidProject((value) => {
      Object.assign(value.theme, {
        shadows: {
          text: { offsetTop: 8, offsetRight: 4, offsetBottom: 14, offsetLeft: 6 },
        },
      });
    });

    expect(StoreProjectV2Schema.parse(project).theme.shadows?.text).toMatchObject({
      offsetTop: 8,
      offsetRight: 4,
      offsetBottom: 14,
      offsetLeft: 6,
    });
  });

  it("rechaza cronología imposible", () => {
    const invalidTimestamp = invalidProject((project) => {
      project.updatedAt = "2020-01-01T00:00:00.000Z";
    });
    expect(() => StoreProjectV2Schema.parse(invalidTimestamp)).toThrow(
      "updatedAt anterior a createdAt",
    );
  });

  it("rechaza destinos internos de navegación que no existen", () => {
    const invalidNavigation = invalidProject((project) => {
      const item = project.navigation.items[0];
      if (item) item.href = "/categorias/no-existe/";
    });
    expect(() => StoreProjectV2Schema.parse(invalidNavigation)).toThrow("no existe en el proyecto");

    const disabledTemplate = invalidProject((project) => {
      project.commerceTemplates.search.enabled = false;
      const item = project.navigation.items[0];
      if (item) item.href = "/buscar/";
    });
    expect(() => StoreProjectV2Schema.parse(disabledTemplate)).toThrow("no existe en el proyecto");
  });

  it("rechaza referencias audiovisuales inexistentes en secciones editables", () => {
    const invalidHero = invalidProject((project) => {
      const hero = project.sections.find((section) => section.slot === "hero");
      if (hero) hero.settings = { ...hero.settings, posterAssetId: "missing-poster" };
    });
    expect(() => StoreProjectV2Schema.parse(invalidHero)).toThrow("Recurso de la sección");

    const invalidPage = invalidProject((project) => {
      const page = project.pages.find((candidate) => candidate.kind === "home");
      const source = project.sections.find((section) => section.slot === "content");
      if (page && source) {
        page.sections = [{ ...structuredClone(source), settings: { imageId: "missing-image" } }];
      }
    });
    expect(() => StoreProjectV2Schema.parse(invalidPage)).toThrow("Recurso de la sección");
  });

  it("producto acepta videoIds opcionales y rechaza más de 3", () => {
    const base = {
      id: "prod-video-001",
      slug: "prod-video",
      title: "Prod video",
      description: "desc",
      status: "active",
      brand: "Marca",
      categoryIds: [],
      collectionIds: [],
      tags: [],
      imageIds: [],
      variants: [
        {
          id: "var-001",
          title: "Única",
          sku: "",
          optionValues: {},
          price: 1000,
          available: true,
          stockStatus: "in_stock",
        },
      ],
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    };
    expect(ProductSchema.parse({ ...base }).videoIds).toEqual([]);
    expect(ProductSchema.parse({ ...base, videoIds: ["video-1"] }).videoIds).toEqual(["video-1"]);
    expect(() => ProductSchema.parse({ ...base, videoIds: ["a", "b", "c", "d"] })).toThrow();
  });

  it("proyecto viejo sin videoIds sigue válido (back-compat)", () => {
    const base = {
      id: "prod-old-001",
      slug: "prod-old",
      title: "Viejo",
      description: "desc",
      status: "active",
      brand: "Marca",
      categoryIds: [],
      collectionIds: [],
      tags: [],
      imageIds: [],
      variants: [
        {
          id: "var-001",
          title: "Única",
          sku: "",
          optionValues: {},
          price: 1000,
          available: true,
          stockStatus: "in_stock",
        },
      ],
      createdAt: "2026-09-04T00:00:00.000Z",
      updatedAt: "2026-09-04T00:00:00.000Z",
    };
    expect(ProductSchema.parse({ ...base }).videoIds).toEqual([]);
  });
});
