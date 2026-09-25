import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import { buildCanvasManifest, exportProject, renderPreviewHtml } from "./index.js";

const heroSectionId = "modo-section-hero";

describe("metadata del editor (Live Canvas)", () => {
  it("el manifest cubre módulos con bindings y reporta los que no tienen", () => {
    const { entries, coverage } = buildCanvasManifest(catalogModernStore);
    expect(entries.length).toBeGreaterThan(0);
    const hero = entries.filter((entry) => entry.moduleId === "catalog-hero");
    expect(hero.map((entry) => entry.bindingId)).toEqual([
      "title",
      "eyebrow",
      "body",
      "whatsappAction",
      "actionLabel",
      "actionHref",
      "secondaryActionLabel",
      "secondaryActionHref",
      "posterAssetId",
      "backgroundImageId",
      "slide-title",
      "slide-body",
      "slide-action-label",
      "slide-action-href",
      "slide-image",
      "benefit-title",
      "benefit-text",
    ]);
    const notEditable = coverage.filter((item) => !item.editable);
    expect(notEditable.every((item) => item.reason !== undefined)).toBe(true);
  });

  it("cobertura: los módulos del fixture tienen bindings o razón explícita", () => {
    const { coverage } = buildCanvasManifest(catalogModernStore);
    const withoutReason = coverage.filter((item) => !item.editable && item.reason === undefined);
    expect(withoutReason).toEqual([]);
    // Los módulos del fixture moderno core son editables en canvas.
    const editable = coverage.filter((item) => item.editable).map((item) => item.moduleId);
    expect(editable).toContain("catalog-hero");
    expect(editable).toContain("catalog-announcement");
    expect(editable).toContain("catalog-product-grid");
    expect(editable).toContain("catalog-footer");
  });

  it("el preview con editor contiene data-canvas y el manifest; el export nunca", () => {
    const editorResult = renderPreviewHtml(catalogModernStore, "draft", "/", {
      assetTransport: "parent",
      editor: { enabled: true, sectionId: heroSectionId },
    });
    if (typeof editorResult === "string") throw new Error("editor debe devolver objeto");
    expect(editorResult.html).toContain('data-canvas-edit="ce-modo-section-hero-title"');
    expect(editorResult.canvasManifest.entries.length).toBeGreaterThan(0);
    const heroEntry = editorResult.canvasManifest.entries.find(
      (entry) => entry.editId === "ce-modo-section-hero-title",
    );
    expect(heroEntry).toMatchObject({ moduleId: "catalog-hero", fieldKey: "title" });
  });

  it("publica los IDs de los repeaters que nacen de defaults del schema", () => {
    const { entries } = buildCanvasManifest(catalogModernV2Store);
    const benefitTitle = entries.find(
      (entry) => entry.moduleId === "catalog-hero" && entry.bindingId === "benefit-title",
    );
    expect(benefitTitle).toMatchObject({
      fieldKey: "benefits",
      itemFieldKey: "title",
      itemIds: ["hero-benefit-envios", "hero-benefit-pedido", "hero-benefit-compra"],
    });

    const preview = renderPreviewHtml(catalogModernV2Store, "draft", "/", {
      assetTransport: "parent",
      editor: { enabled: true, sectionId: "*" },
    });
    if (typeof preview === "string") throw new Error("editor debe devolver objeto");
    expect(preview.html).toContain(
      'data-canvas-edit="ce-modo-section-hero-benefit-title" data-canvas-item="hero-benefit-envios"',
    );
  });

  it("production y draft exportable no contienen ningún atributo data-canvas", () => {
    for (const mode of ["draft", "production"] as const) {
      const exported = exportProject(catalogModernStore, { mode });
      for (const [path, content] of exported.files) {
        if (!path.endsWith(".html")) continue;
        expect(String(content)).not.toContain("data-canvas-edit");
        expect(String(content)).not.toContain("data-canvas-image");
      }
    }
  });

  it("el preview sin editor no contiene atributos data-canvas", () => {
    const plain = renderPreviewHtml(catalogModernStore, "draft", "/", {
      assetTransport: "parent",
    });
    if (typeof plain !== "string") throw new Error("sin editor debe devolver string");
    expect(plain).not.toContain("data-canvas-edit");
  });

  it("el modo editor global instrumenta más de una sección sin contaminar el export", () => {
    const rendered = renderPreviewHtml(catalogModernStore, "draft", "/", {
      assetTransport: "parent",
      editor: { enabled: true, sectionId: "*" },
    });
    if (typeof rendered === "string") throw new Error("editor debe devolver objeto");
    expect(rendered.html).toContain('data-canvas-edit="ce-modo-section-hero-title"');
    expect(rendered.html).toContain('data-canvas-edit="ce-modo-section-footer-note"');
  });

  it("resuelve entidades reales en Home, categoría, colección y PDP", () => {
    const product = catalogModernStore.products.find((item) => item.status === "active");
    const category = catalogModernStore.categories.find((item) => item.status === "active");
    const collection = catalogModernStore.collections.find((item) => item.status === "active");
    if (!product || !category || !collection) throw new Error("fixture sin entidades activas");

    const home = renderPreviewHtml(catalogModernStore, "draft", "/", {
      assetTransport: "parent",
      editor: { enabled: true, sectionId: "*" },
    });
    if (typeof home === "string") throw new Error("Home editor debe devolver objeto");
    expect(home.html).toContain(
      `data-canvas-edit="ce-modo-section-new-product-title-product-${product.id}-title"`,
    );

    const categoryPreview = renderPreviewHtml(
      catalogModernStore,
      "draft",
      `/categorias/${category.slug}/`,
      { assetTransport: "parent", editor: { enabled: true, sectionId: "*" } },
    );
    if (typeof categoryPreview === "string")
      throw new Error("Categoría editor debe devolver objeto");
    expect(categoryPreview.html).toContain(
      `data-canvas-edit="ce-generated-category-${category.id}-category-title-category-${category.id}-title"`,
    );

    const collectionPreview = renderPreviewHtml(
      catalogModernStore,
      "draft",
      `/colecciones/${collection.slug}/`,
      { assetTransport: "parent", editor: { enabled: true, sectionId: "*" } },
    );
    if (typeof collectionPreview === "string")
      throw new Error("Colección editor debe devolver objeto");
    expect(collectionPreview.html).toContain(
      `data-canvas-edit="ce-generated-collection-${collection.id}-collection-title-collection-${collection.id}-title"`,
    );
    expect(collectionPreview.html).toContain(
      `data-canvas-image="ce-generated-collection-${collection.id}-collection-image-collection-${collection.id}-imageId"`,
    );

    const productPreview = renderPreviewHtml(
      catalogModernStore,
      "draft",
      `/productos/${product.slug}/`,
      { assetTransport: "parent", editor: { enabled: true, sectionId: "*" } },
    );
    if (typeof productPreview === "string") throw new Error("PDP editor debe devolver objeto");
    expect(productPreview.html).toContain(
      `data-canvas-edit="ce-catalog-product-detail-${product.id}-product-title-product-${product.id}-title"`,
    );
    expect(productPreview.html).toContain(
      `data-canvas-edit="ce-catalog-product-detail-${product.id}-product-description-product-${product.id}-description"`,
    );
    expect(productPreview.html).toContain(
      `data-canvas-edit="ce-catalog-product-detail-${product.id}-product-price-product-${product.id}-price"`,
    );
    expect(
      productPreview.canvasManifest.entries.find(
        (entry) =>
          entry.editId ===
          `ce-catalog-product-detail-${product.id}-product-price-product-${product.id}-price`,
      ),
    ).toMatchObject({
      label: "Precio del producto",
      kind: "number",
      sourceKind: "product",
      entityId: product.id,
      entityField: "price",
    });
    expect(productPreview.html).toContain('data-canvas-entity-kind="asset"');
  });

  it("publica los IDs de los ítems automáticos del bento de categorías", () => {
    const section = catalogModernStore.sections.find(
      (item) => item.moduleId === "catalog-category-bento",
    );
    const rootCategory = catalogModernStore.categories.find((item) => !item.parentId);
    if (!section || !rootCategory) throw new Error("Fixture sin bento o categoría raíz");

    const { entries } = buildCanvasManifest(catalogModernStore);
    const itemBinding = entries.find(
      (entry) => entry.sectionId === section.id && entry.bindingId === "item-category",
    );

    expect(itemBinding?.itemIds).toContain(`automatic-category-${rootCategory.id}`);
  });

  it("incluye metadata de todos los módulos presentes con bindings o razón", () => {
    const { coverage } = buildCanvasManifest(catalogModernV2Store);
    const presentModuleIds = new Set([
      ...catalogModernV2Store.sections.map((section) => section.moduleId),
      ...catalogModernV2Store.pages.flatMap((page) =>
        page.sections.map((section) => section.moduleId),
      ),
    ]);
    for (const moduleId of presentModuleIds) {
      const item = coverage.find((candidate) => candidate.moduleId === moduleId);
      expect(item, `falta cobertura para ${moduleId}`).toMatchObject({ moduleId });
      expect(item?.editable === true || Boolean(item?.reason)).toBe(true);
    }
  });

  it("instrumenta la familia legacy con settings y entidades del catálogo", () => {
    const { entries, coverage } = buildCanvasManifest(referenceStore);
    const moduleIds = new Set(referenceStore.sections.map((section) => section.moduleId));
    expect(
      [...moduleIds].every(
        (moduleId) => coverage.find((item) => item.moduleId === moduleId)?.editable,
      ),
    ).toBe(true);
    expect(
      entries.some((entry) => entry.moduleId === "hero-media" && entry.bindingId === "title"),
    ).toBe(true);
    expect(
      entries.some(
        (entry) => entry.moduleId === "compact-product-grid" && entry.sourceKind === "product",
      ),
    ).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.moduleId === "product-detail" &&
          entry.sourceKind === "asset" &&
          entry.entityField === "alt",
      ),
    ).toBe(true);
    const preview = renderPreviewHtml(referenceStore, "draft", "/", {
      assetTransport: "parent",
      editor: { enabled: true, sectionId: "*" },
    });
    if (typeof preview === "string") throw new Error("editor debe devolver objeto");
    expect(preview.html).toContain('data-canvas-edit="ce-section-hero-title"');
    expect(preview.html).toContain('data-canvas-entity-kind="product"');
  });
});
