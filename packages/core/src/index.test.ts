import {
  parseProject,
  type StoreProjectV1,
  StoreProjectV1Schema,
  StoreProjectV2Schema,
  type StoreSection,
} from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { buildCatalogModernProject } from "@solara/project-schema/catalog-modern-template";
import { referenceStore } from "@solara/project-schema/fixture";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import {
  adjustPrice,
  createHistory,
  executeCommand,
  exportCatalogCsv,
  exportProductsCsv,
  importCatalogCsv,
  importProductsCsv,
  redo,
  reduceProject,
  undo,
} from "./index";
import { generatePerformanceFixture } from "./performance.js";

const timestamp = "2026-07-30T10:00:00.000Z";
const firstProduct = referenceStore.products[0];

if (firstProduct === undefined) {
  throw new Error("El fixture debe contener al menos un producto.");
}

describe("reduceProject", () => {
  it("es determinista para el mismo estado y comando", () => {
    const command = {
      type: "products.addTags" as const,
      productIds: [firstProduct.id],
      tags: ["destacado"],
      at: timestamp,
    };

    expect(reduceProject(referenceStore, command)).toEqual(reduceProject(referenceStore, command));
  });

  it("archiva y restaura productos", () => {
    const archived = reduceProject(referenceStore, {
      type: "product.archive",
      productId: firstProduct.id,
      at: timestamp,
    });
    expect(archived.products[0]?.status).toBe("archived");

    const restored = reduceProject(archived, {
      type: "product.restore",
      productId: firstProduct.id,
      at: "2026-07-30T11:00:00.000Z",
    });
    expect(restored.products[0]?.status).toBe("active");
  });

  it("elimina sólo productos archivados y recalcula índices derivados", () => {
    const source = structuredClone(catalogModernStore);
    const product = source.products[0];
    const categoryId = product?.categoryIds[0];
    const collectionId = product?.collectionIds[0];
    if (!product || !categoryId || !collectionId) {
      throw new Error("El fixture debe asignar categoría y colección al primer producto.");
    }

    const archived = reduceProject(source, {
      type: "product.archive",
      productId: product.id,
      at: timestamp,
    });
    const deleted = reduceProject(archived, {
      type: "product.delete",
      productId: product.id,
      at: "2026-07-30T11:00:00.000Z",
    });

    expect(deleted.products.some((candidate) => candidate.id === product.id)).toBe(false);
    expect(
      deleted.categories.find((candidate) => candidate.id === categoryId)?.productIds,
    ).not.toContain(product.id);
    expect(
      deleted.collections.find((candidate) => candidate.id === collectionId)?.productIds,
    ).not.toContain(product.id);
    expect(() =>
      reduceProject(source, {
        type: "product.delete",
        productId: product.id,
        at: timestamp,
      }),
    ).toThrow("Sólo se pueden eliminar productos archivados");
  });

  it("aplica una importación de catálogo como una sola operación", () => {
    const imported = structuredClone(referenceStore);
    const first = imported.products[0];
    const category = imported.categories[0];
    if (!first || !category) throw new Error("El fixture debe tener producto y categoría.");
    first.categoryIds = [category.id];
    const result = reduceProject(referenceStore, {
      type: "catalog.applyImport",
      products: imported.products,
      categories: imported.categories,
      collections: imported.collections,
      at: timestamp,
    });
    expect(result.products[0]?.categoryIds).toEqual([category.id]);
    expect(result.categories.find((item) => item.id === category.id)?.productIds).toContain(
      first.id,
    );
    expect(result.updatedAt).toBe(timestamp);
  });

  it("activa sólo las secciones base intactas al cargar el primer catálogo", () => {
    const clean = buildCatalogModernProject({ seed: "clean" });
    const demo = buildCatalogModernProject({ seed: "demo" });
    const result = reduceProject(clean, {
      type: "catalog.applyImport",
      products: demo.products.slice(0, 1),
      categories: demo.categories,
      collections: demo.collections,
      at: timestamp,
    });
    expect(result.sections.find((section) => section.id === "modo-section-new")?.enabled).toBe(
      true,
    );
    expect(
      result.sections.find((section) => section.id === "modo-section-categories")?.enabled,
    ).toBe(true);
  });

  it("activa la grilla base al crear manualmente el primer producto activo", () => {
    const clean = buildCatalogModernProject({ seed: "clean" });
    const demo = buildCatalogModernProject({ seed: "demo" });
    const product = structuredClone(demo.products[0]);
    if (!product) throw new Error("La demo debe tener un producto.");
    product.categoryIds = [];
    product.collectionIds = [];
    product.imageIds = [];
    product.variants = product.variants.map((variant) => ({ ...variant, imageId: undefined }));
    const result = reduceProject(clean, {
      type: "product.create",
      product,
      at: timestamp,
    });
    expect(result.sections.find((section) => section.id === "modo-section-new")?.enabled).toBe(
      true,
    );
  });

  it("ajusta precios masivos con enteros y redondeo estable", () => {
    expect(adjustPrice(10_001, { type: "percentage", basisPoints: 1_250 })).toBe(11_251);
    expect(adjustPrice(50, { type: "percentage", basisPoints: -5_000 })).toBe(25);
    expect(adjustPrice(50, { type: "amount", cents: -100 })).toBe(0);

    const adjusted = reduceProject(referenceStore, {
      type: "products.adjustPrices",
      productIds: referenceStore.products.map((product) => product.id),
      adjustment: { type: "percentage", basisPoints: 750 },
      at: timestamp,
    });

    for (const product of adjusted.products) {
      for (const variant of product.variants) {
        expect(Number.isInteger(variant.price)).toBe(true);
      }
    }
  });

  it("rechaza comandos con productos inexistentes sin cambios parciales", () => {
    const before = structuredClone(referenceStore);
    expect(() =>
      reduceProject(referenceStore, {
        type: "products.addTags",
        productIds: [firstProduct.id, "product-missing" as typeof firstProduct.id],
        tags: ["no-debe-aplicarse"],
        at: timestamp,
      }),
    ).toThrow("Productos inexistentes");
    expect(referenceStore).toEqual(before);
  });

  it("muta sólo los ids listados: con 2 productos, cambia 1 y el otro queda intacto", () => {
    const two = generatePerformanceFixture(2);
    const first = two.products[0];
    const second = two.products[1];
    if (!first || !second) throw new Error("El fixture debe tener 2 productos.");
    const result = reduceProject(two, {
      type: "products.setStatus",
      productIds: [first.id],
      status: "archived",
      at: timestamp,
    });
    expect(result.products).toHaveLength(2);
    expect(result.products[0]?.status).toBe("archived");
    expect(result.products[0]?.updatedAt).toBe(timestamp);
    expect(result.products[1]).toEqual(second);
    expect(result.products[1]?.status).toBe(second.status);
    expect(result.products[1]?.updatedAt).toBe(second.updatedAt);
  });

  it("usa -10_000 basisPoints como piso: -100% llega a 0 y menos queda fuera", () => {
    expect(adjustPrice(500, { type: "percentage", basisPoints: -10_000 })).toBe(0);
    expect(() => adjustPrice(500, { type: "percentage", basisPoints: -10_001 })).toThrow(
      "El porcentaje no puede reducir el precio por debajo de cero.",
    );
  });

  it("mantiene la misma referencia para operaciones sin cambios", () => {
    const unchanged = reduceProject(referenceStore, {
      type: "products.setStatus",
      productIds: [firstProduct.id],
      status: firstProduct.status,
      at: timestamp,
    });
    expect(unchanged).toBe(referenceStore);
  });

  it("no retrocede updatedAt si el reloj del dispositivo está atrasado", () => {
    const changed = reduceProject(referenceStore, {
      type: "product.update",
      productId: firstProduct.id,
      changes: { title: "Cambio con reloj atrasado" },
      at: "2020-01-01T00:00:00.000Z",
    });
    expect(changed.updatedAt).toBe(referenceStore.updatedAt);
    expect(changed.products[0]?.updatedAt).toBe(referenceStore.updatedAt);
  });

  it("product.update acepta videoIds y conserva variantes y precios", () => {
    const before = referenceStore.products[0];
    if (!before) throw new Error("Fixture incompleto.");
    const updated = reduceProject(referenceStore, {
      type: "product.update",
      productId: before.id,
      changes: { videoIds: [] },
      at: timestamp,
    });
    expect(updated.products[0]?.videoIds).toEqual([]);
    expect(updated.products[0]?.variants).toEqual(before.variants);
  });

  it("aplica categorías, colecciones, tags y estados de forma coherente", () => {
    const category = referenceStore.categories[1];
    const collection = referenceStore.collections[0];
    if (!category || !collection) throw new Error("Fixture incompleto.");

    const categorized = reduceProject(referenceStore, {
      type: "products.setCategories",
      productIds: [firstProduct.id],
      categoryIds: [category.id],
      at: timestamp,
    });
    expect(categorized.products[0]?.categoryIds).toEqual([category.id]);
    expect(
      categorized.categories.find((candidate) => candidate.id === category.id)?.productIds,
    ).toContain(firstProduct.id);

    const collected = reduceProject(categorized, {
      type: "products.setCollections",
      productIds: [firstProduct.id],
      collectionIds: [collection.id],
      at: "2026-07-30T10:01:00.000Z",
    });
    const tagged = reduceProject(collected, {
      type: "products.addTags",
      productIds: [firstProduct.id],
      tags: ["nuevo", "nuevo"],
      at: "2026-07-30T10:02:00.000Z",
    });
    const cleaned = reduceProject(tagged, {
      type: "products.removeTags",
      productIds: [firstProduct.id],
      tags: ["nuevo"],
      at: "2026-07-30T10:03:00.000Z",
    });
    expect(cleaned.products[0]?.tags).not.toContain("nuevo");
  });

  it("persiste el payload completo del editor con los mismos ids de producto y variantes", () => {
    const source = referenceStore.products[0];
    if (!source) throw new Error("El fixture debe contener productos.");
    const original = source.variants[0];
    if (!original) throw new Error("El fixture debe tener variantes.");
    const result = reduceProject(referenceStore, {
      type: "product.update",
      productId: source.id,
      changes: {
        slug: source.slug,
        title: "Remera editada desde el editor",
        description: source.description,
        richDescription: source.richDescription,
        status: source.status,
        brand: source.brand,
        categoryIds: source.categoryIds,
        collectionIds: source.collectionIds,
        tags: [...source.tags, "editada"],
        imageIds: source.imageIds,
        variants: source.variants.map((variant, index) =>
          index === 0
            ? {
                ...variant,
                title: `${variant.title} copia`,
                price: (variant.price + 100) as typeof variant.price,
              }
            : variant,
        ),
      },
      at: timestamp,
    });
    const updated = result.products.find((product) => product.id === source.id);
    expect(updated?.id).toBe(source.id);
    expect(updated?.title).toBe("Remera editada desde el editor");
    expect(updated?.createdAt).toBe(source.createdAt);
    expect(updated?.variants.map((variant) => variant.id)).toEqual(
      source.variants.map((variant) => variant.id),
    );
    expect(updated?.variants[0]?.title).toBe(`${original.title} copia`);
    expect(updated?.variants[0]?.price).toBe(original.price + 100);
    expect(() => StoreProjectV2Schema.parse(result)).not.toThrow();
  });

  it("acepta una variante duplicada con id nuevo y conserva los ids existentes", () => {
    const source = referenceStore.products[0];
    if (!source) throw new Error("El fixture debe contener productos.");
    const original = source.variants[0];
    if (!original) throw new Error("El fixture debe tener variantes.");
    const copy = {
      ...original,
      id: "variant-copia-editor" as typeof original.id,
      title: `${original.title} copia`,
      sku: "",
    };
    const result = reduceProject(referenceStore, {
      type: "product.update",
      productId: source.id,
      changes: { variants: [...source.variants, copy] },
      at: timestamp,
    });
    expect(result.products[0]?.variants.map((variant) => variant.id)).toEqual([
      ...source.variants.map((variant) => variant.id),
      copy.id,
    ]);
    expect(() => StoreProjectV2Schema.parse(result)).not.toThrow();
  });

  it("crea con el payload del editor sin regenerar el id del borrador", () => {
    if (!firstProduct) throw new Error("El fixture debe contener productos.");
    const stamp = "2026-07-30T09:00:00.000Z";
    const result = reduceProject(referenceStore, {
      type: "product.create",
      product: {
        ...firstProduct,
        id: "producto-nuevo-editor" as typeof firstProduct.id,
        slug: "producto-nuevo-editor" as typeof firstProduct.slug,
        title: "Producto nuevo del editor",
        status: "hidden" as const,
        variants: firstProduct.variants.map((variant, index) => ({
          ...variant,
          id: `variant-producto-nuevo-editor-${index}` as typeof variant.id,
          imageId: undefined,
        })),
        createdAt: stamp,
        updatedAt: stamp,
      },
      at: timestamp,
    });
    const created = result.products.find((product) => product.id === "producto-nuevo-editor");
    expect(created?.id).toBe("producto-nuevo-editor");
    expect(created?.createdAt).toBe(timestamp);
    expect(created?.updatedAt).toBe(timestamp);
    expect(() => StoreProjectV2Schema.parse(result)).not.toThrow();
  });

  it("volver una categoría a la raíz omite la clave parentId y el resultado pasa el schema", () => {
    const textiles = catalogScaleStore.categories.find((category) => category.slug === "textiles");
    if (!textiles) throw new Error("El fixture debe tener la categoría textiles.");
    const moved = reduceProject(catalogScaleStore, {
      type: "category.reparent",
      categoryId: textiles.id,
      at: timestamp,
    });
    const root = moved.categories.find((category) => category.id === textiles.id);
    expect(root?.parentId).toBeUndefined();
    expect("parentId" in (root ?? {})).toBe(false);
    expect(() => StoreProjectV2Schema.parse(moved)).not.toThrow();
  });
});

describe("contrato con secciones (ids de ítems)", () => {
  const demoStore = buildCatalogModernProject({ seed: "demo" });
  const firstDemoProduct = demoStore.products[0];

  it("preserva los settings de secciones y los ids de ítems ante comandos del dominio", () => {
    if (firstDemoProduct === undefined) {
      throw new Error("La demo debe tener al menos un producto.");
    }
    const sectionsJson = JSON.stringify(demoStore.sections);

    const adjusted = reduceProject(demoStore, {
      type: "products.adjustPrices",
      productIds: [firstDemoProduct.id],
      adjustment: { type: "amount", cents: 1_000 },
      at: timestamp,
    });
    const changed = reduceProject(adjusted, {
      type: "products.setStatus",
      productIds: [firstDemoProduct.id],
      status: "hidden",
      at: "2026-07-30T10:01:00.000Z",
    });

    expect(JSON.stringify(changed.sections)).toBe(sectionsJson);
    const testimonials = changed.sections.find(
      (section) => section.id === "modo-section-testimonials",
    );
    const items = testimonials?.settings.items as Array<{ id: string }> | undefined;
    expect(items?.map((item) => item.id)).toEqual([
      "modo-testimonial-1",
      "modo-testimonial-2",
      "modo-testimonial-3",
      "modo-testimonial-4",
      "modo-testimonial-5",
      "modo-testimonial-6",
      "modo-testimonial-7",
      "modo-testimonial-8",
      "modo-testimonial-9",
      "modo-testimonial-10",
      "modo-testimonial-11",
      "modo-testimonial-12",
    ]);
  });

  it("no valida ni repara ids de ítems: el gate vive en el schema del módulo", () => {
    if (firstDemoProduct === undefined) {
      throw new Error("La demo debe tener al menos un producto.");
    }
    const withMissingId = structuredClone(demoStore);
    const testimonials = withMissingId.sections.find(
      (section) => section.id === "modo-section-testimonials",
    );
    if (testimonials === undefined) {
      throw new Error("La demo debe tener la sección de testimonios.");
    }
    const items = testimonials.settings.items as Array<Record<string, unknown>>;
    const item = items[0];
    if (item === undefined) {
      throw new Error("La demo debe tener ítems de testimonios.");
    }
    delete item.id;
    const sectionsJson = JSON.stringify(withMissingId.sections);

    expect(() => parseProject(withMissingId)).not.toThrow();

    const changed = reduceProject(withMissingId, {
      type: "products.adjustPrices",
      productIds: [firstDemoProduct.id],
      adjustment: { type: "amount", cents: 500 },
      at: timestamp,
    });
    expect(JSON.stringify(changed.sections)).toBe(sectionsJson);
    const after = changed.sections.find((section) => section.id === "modo-section-testimonials");
    const afterItems = after?.settings.items as Array<Record<string, unknown>> | undefined;
    expect(afterItems?.[0]).not.toHaveProperty("id");
  });
});

describe("contrato Builder → gate de secciones", () => {
  const demoStore = buildCatalogModernProject({ seed: "demo" });
  const newSectionId = (): StoreSection["id"] =>
    `section-${crypto.randomUUID()}` as StoreSection["id"];
  const gate = (project: StoreProjectV1) => StoreProjectV1Schema.safeParse(project);
  const testimonials = () =>
    demoStore.sections.find((section) => section.id === "modo-section-testimonials");
  const withSections = (sections: StoreSection[]): StoreProjectV1 => ({
    ...demoStore,
    sections,
    updatedAt: demoStore.updatedAt,
  });

  it("acepta agregar una sección como lo envía Builder (spread + id nuevo)", () => {
    const template = testimonials();
    if (template === undefined) throw new Error("La demo debe tener testimonios.");
    const added: StoreSection = { ...structuredClone(template), id: newSectionId() };

    const result = gate(withSections([...demoStore.sections, added]));
    expect(result.success).toBe(true);
    expect(result.data?.sections).toHaveLength(demoStore.sections.length + 1);
  });

  it("acepta duplicar con id nuevo y el gate rechaza ids colisionados", () => {
    const first = demoStore.sections[0];
    if (first === undefined) throw new Error("La demo debe tener secciones.");

    const duplicate: StoreSection = { ...structuredClone(first), id: newSectionId() };
    expect(gate(withSections([first, duplicate, ...demoStore.sections.slice(1)])).success).toBe(
      true,
    );

    const collision = { ...first, settings: { ...first.settings, title: "Colisión" } };
    const rejected = gate(withSections([first, collision, ...demoStore.sections.slice(1)]));
    expect(rejected.success).toBe(false);
    expect(rejected.error?.issues[0]?.message).toContain("ID de sección duplicado");
  });

  it("acepta mover una sección sin alterar el resto del payload", () => {
    const sections = [...demoStore.sections];
    const [moved] = sections.splice(1, 1);
    if (moved === undefined) throw new Error("La demo debe tener al menos dos secciones.");
    sections.unshift(moved);

    const result = gate(withSections(sections));
    expect(result.success).toBe(true);
    expect(result.data?.sections[0]?.id).toBe(moved.id);
    expect(result.data?.sections.map((section) => section.id)).toEqual(
      sections.map((section) => section.id),
    );
  });

  it("acepta eliminar una sección por id y sólo elimina esa", () => {
    const target = demoStore.sections[2];
    if (target === undefined) throw new Error("La demo debe tener al menos tres secciones.");

    const result = gate(
      withSections(demoStore.sections.filter((section) => section.id !== target.id)),
    );
    expect(result.success).toBe(true);
    expect(result.data?.sections.some((section) => section.id === target.id)).toBe(false);
    expect(result.data?.sections).toHaveLength(demoStore.sections.length - 1);
  });

  it("acepta actualizar settings sin perder los valores que no se tocaron", () => {
    const target = testimonials();
    if (target === undefined) throw new Error("La demo debe tener testimonios.");
    const settings = { ...target.settings, title: "Título editado" };

    const result = gate(
      withSections(
        demoStore.sections.map((section) =>
          section.id === target.id ? { ...section, settings } : section,
        ),
      ),
    );
    expect(result.success).toBe(true);
    const parsed = result.data?.sections.find((section) => section.id === target.id);
    expect(parsed?.settings).toEqual(settings);
    expect(parsed?.settings.title).toBe("Título editado");
  });

  it("acepta payloads de secciones en Home (spread de pages como envía Builder)", () => {
    const source = demoStore.sections.find((section) => section.slot === "content");
    if (source === undefined) throw new Error("La demo debe tener una sección de contenido.");
    const pageSection: StoreSection = { ...structuredClone(source), id: newSectionId() };
    const payload: StoreProjectV1 = {
      ...demoStore,
      pages: demoStore.pages.map((page) =>
        page.kind === "home" ? { ...page, sections: [pageSection] } : page,
      ),
      updatedAt: demoStore.updatedAt,
    };

    const result = gate(payload);
    expect(result.success).toBe(true);
    expect(
      result.data?.pages
        .find((page) => page.kind === "home")
        ?.sections.map((section) => section.id),
    ).toEqual([pageSection.id]);
  });

  it("reduceProject conserva las secciones de páginas intactas", () => {
    const source = demoStore.sections.find((section) => section.slot === "content");
    if (source === undefined) throw new Error("La demo debe tener una sección de contenido.");
    const seeded: StoreProjectV1 = {
      ...demoStore,
      pages: demoStore.pages.map((page) =>
        page.kind === "about"
          ? { ...page, sections: [{ ...structuredClone(source), id: newSectionId() }] }
          : page,
      ),
    };
    const pagesJson = JSON.stringify(seeded.pages);
    const firstDemoProduct = seeded.products[0];
    if (firstDemoProduct === undefined) {
      throw new Error("La demo debe tener al menos un producto.");
    }

    const changed = reduceProject(seeded, {
      type: "products.adjustPrices",
      productIds: [firstDemoProduct.id],
      adjustment: { type: "amount", cents: 700 },
      at: timestamp,
    });
    expect(JSON.stringify(changed.pages)).toBe(pagesJson);
  });
});

describe("historial", () => {
  it("revierte y rehace el estado completo", () => {
    const initial = createHistory(referenceStore);
    const changed = executeCommand(initial, {
      type: "product.update",
      productId: firstProduct.id,
      changes: { title: "Título editado" },
      at: timestamp,
    });

    expect(changed.present.products[0]?.title).toBe("Título editado");
    expect(undo(changed).present).toEqual(referenceStore);
    expect(redo(undo(changed)).present).toEqual(changed.present);
  });

  it("reemplaza todo el catálogo como una sola operación reversible", () => {
    const replacement = referenceStore.products.slice(0, 1);
    const changed = executeCommand(createHistory(referenceStore), {
      type: "products.replaceAll",
      products: replacement,
      at: timestamp,
    });

    expect(changed.present.products).toEqual(replacement);
    expect(undo(changed).present).toEqual(referenceStore);
    expect(redo(undo(changed)).present.products).toEqual(replacement);
  });

  it("deshacer tras un reemplazo devuelve exactamente el estado anterior", () => {
    const changed = executeCommand(createHistory(referenceStore), {
      type: "products.replaceAll",
      products: referenceStore.products.slice(0, 1),
      at: timestamp,
    });
    expect(changed.past[0]).toBe(referenceStore);
    expect(undo(changed).present).toBe(referenceStore);
  });

  it("un comando nuevo tras deshacer trunca el futuro", () => {
    const changed = executeCommand(createHistory(referenceStore), {
      type: "product.update",
      productId: firstProduct.id,
      changes: { title: "Título editado" },
      at: timestamp,
    });
    const undone = undo(changed);
    expect(undone.future).toHaveLength(1);

    const diverged = executeCommand(undone, {
      type: "product.update",
      productId: firstProduct.id,
      changes: { title: "Título divergente" },
      at: "2026-07-30T10:01:00.000Z",
    });
    expect(diverged.future).toHaveLength(0);
    expect(diverged.present.products[0]?.title).toBe("Título divergente");
  });

  it("un comando sin cambios no empuja al pasado ni borra el futuro", () => {
    const changed = executeCommand(createHistory(referenceStore), {
      type: "product.update",
      productId: firstProduct.id,
      changes: { title: "Título editado" },
      at: timestamp,
    });
    const undone = undo(changed);
    const noop = executeCommand(undone, {
      type: "products.setStatus",
      productIds: [firstProduct.id],
      status: firstProduct.status,
      at: timestamp,
    });
    expect(noop).toBe(undone);
    expect(noop.future).toHaveLength(1);
  });

  it("undo y redo sobre pilas vacías devuelven el mismo estado", () => {
    const initial = createHistory(referenceStore);
    expect(undo(initial)).toBe(initial);
    expect(redo(initial)).toBe(initial);
    expect(undo(redo(initial))).toBe(initial);
  });

  it("normaliza referencias de otra tienda al importar un catálogo", () => {
    const foreignProducts = generatePerformanceFixture(2).products.map((product) => ({
      ...product,
      categoryIds: ["category-externa"] as typeof product.categoryIds,
      collectionIds: ["collection-externa"] as typeof product.collectionIds,
      imageIds: ["asset-externo"] as typeof product.imageIds,
      variants: product.variants.map((variant) => ({
        ...variant,
        imageId: "asset-externo" as NonNullable<typeof variant.imageId>,
      })),
    }));

    const changed = executeCommand(createHistory(referenceStore), {
      type: "products.replaceAll",
      products: foreignProducts,
      at: timestamp,
    });

    expect(changed.present.products).toHaveLength(2);
    expect(changed.present.products[0]?.categoryIds).toEqual([]);
    expect(changed.present.products[0]?.collectionIds).toEqual([]);
    expect(changed.present.products[0]?.imageIds).toEqual([]);
    expect(changed.present.products[0]?.variants[0]?.imageId).toBeUndefined();
  });
});

describe("CSV", () => {
  it("preserva el fixture en un round-trip", () => {
    const csv = exportProductsCsv(referenceStore.products);
    const imported = importProductsCsv(csv);
    expect(imported).toEqual(referenceStore.products);
  });

  it("preserva las referencias de videos en un round-trip", () => {
    const products = [
      {
        ...firstProduct,
        videoIds: ["video-producto-1", "video-producto-2"],
      },
    ];
    expect(importProductsCsv(exportProductsCsv(products))).toEqual(products);
  });

  it("neutraliza fórmulas de planilla sin perder contenido", () => {
    const products = [
      {
        ...firstProduct,
        title: '=IMPORTXML("https://example.com")',
      },
    ];
    const csv = exportProductsCsv(products);
    expect(csv).toContain("'=IMPORTXML");
    expect(importProductsCsv(csv)).toEqual(products);
  });

  it("acepta BOM, CRLF, comillas y contenido multilínea", () => {
    const products = [
      {
        ...firstProduct,
        description: 'Primera línea\r\nSegunda línea, con "comillas".',
      },
    ];
    const csv = `\uFEFF${exportProductsCsv(products)}`;
    expect(importProductsCsv(csv)).toEqual(products);
  });

  it("preserva 50 productos y 100 variantes", () => {
    const products = generatePerformanceFixture(50).products;
    expect(importProductsCsv(exportProductsCsv(products))).toEqual(products);
  });

  it("exporta e importa el CSV comercial con variantes agrupadas", () => {
    const csv = exportCatalogCsv(referenceStore);
    expect(csv.split("\r\n", 1)[0]).toContain("categorias");
    const imported = importCatalogCsv(csv, referenceStore);
    expect(imported).toEqual(referenceStore.products);
  });

  it("preserva videos en el CSV comercial", () => {
    const project = {
      ...referenceStore,
      products: [
        {
          ...firstProduct,
          videoIds: ["video-producto-1"],
        },
      ],
    };
    expect(importCatalogCsv(exportCatalogCsv(project), referenceStore)).toEqual(project.products);
  });
});

describe("fixture de rendimiento", () => {
  it("genera 50 productos y variantes deterministas", () => {
    const fixture = generatePerformanceFixture(50);
    expect(fixture.products).toHaveLength(50);
    expect(fixture.products.every((product) => product.variants.length === 2)).toBe(true);
    expect(fixture).toEqual(generatePerformanceFixture(50));
  });

  it("aplica una acción masiva a todos los productos seleccionados", () => {
    const fixture = generatePerformanceFixture(50);
    const result = reduceProject(fixture, {
      type: "products.setStatus",
      productIds: fixture.products.map((product) => product.id),
      status: "archived",
      at: "2026-07-30T12:00:00.000Z",
    });
    expect(result.products.every((product) => product.status === "archived")).toBe(true);
  });
});
