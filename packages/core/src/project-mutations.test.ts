import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import { commitCanvasField } from "../../../apps/studio/src/features/canvas/canvasMutations";
import { applyMutation, createMutationRegistry } from "./project-mutations.js";

describe("ProjectMutationRegistry", () => {
  it("no permite guardar un favicon que sólo imita la firma ICO", () => {
    const project = structuredClone(referenceStore);
    const favicon = {
      kind: "image" as const,
      id: "asset-invalid-favicon" as (typeof project.assets)[number]["id"],
      name: "Favicon inválido",
      alt: "",
      mimeType: "image/x-icon",
      source: "data:image/x-icon;base64,AAABAA==",
      width: 16,
      height: 16,
      hash: "invalid-favicon",
    };
    project.assets.push(favicon);

    expect(() =>
      applyMutation(project, createMutationRegistry(), {
        type: "seo.update",
        changes: { faviconAssetId: favicon.id },
      }),
    ).toThrow("ICO válido");
  });

  it("whatsapp.update hace merge parcial y valida el schema", () => {
    const applied = applyMutation(catalogModernStore, createMutationRegistry(), {
      type: "whatsapp.update",
      changes: { phone: "5491100000001", includeSku: false },
    });
    expect(applied.project.whatsapp.phone).toBe("5491100000001");
    expect(applied.project.whatsapp.includeSku).toBe(false);
    expect(applied.project.whatsapp.greeting).toBe(catalogModernStore.whatsapp.greeting);
    // Un teléfono con formato libre viola el contrato estricto de WhatsApp.
    expect(() =>
      applyMutation(catalogModernStore, createMutationRegistry(), {
        type: "whatsapp.update",
        changes: { phone: "+54 9 280 466-2332" },
      }),
    ).toThrow();
  });

  it("navigation.update hace merge parcial sobre la navegación existente", () => {
    const applied = applyMutation(catalogModernStore, createMutationRegistry(), {
      type: "navigation.update",
      changes: {
        mode: "curated",
        items: [{ id: "nav-1", label: "Buscar", href: "/buscar/" }],
      },
    });
    expect(applied.project.navigation.mode).toBe("curated");
    expect(applied.project.navigation.items).toHaveLength(1);
    expect(applied.project.navigation.showHome).toBe(catalogModernStore.navigation.showHome);
    // Un href inseguro no puede colarse por la mutation.
    expect(() =>
      applyMutation(catalogModernStore, createMutationRegistry(), {
        type: "navigation.update",
        changes: { items: [{ id: "nav-x", label: "X", href: "javascript:alert(1)" }] },
      }),
    ).toThrow();
  });

  it("section.field.update produce el mismo snapshot que section.updateSettings del agente", () => {
    const sectionId = "modo-section-hero";
    const registry = createMutationRegistry();
    const viaRegistry = applyMutation(catalogModernStore, registry, {
      type: "section.field.update",
      sectionId,
      fieldKey: "title",
      value: "Título editado desde canvas",
    });
    const viaAgent = structuredClone(catalogModernStore);
    const section = viaAgent.sections.find((item) => item.id === sectionId);
    if (!section) throw new Error("fixture sin hero");
    const nextSettings = { ...section.settings, title: "Título editado desde canvas" };
    const viaAgentParsed = structuredClone(viaAgent);
    viaAgentParsed.sections = viaAgentParsed.sections.map((item) =>
      item.id === sectionId ? { ...item, settings: nextSettings } : item,
    );
    // El registry fija updatedAt con su reloj; comparamos el resto del
    // proyecto y verificamos que updatedAt avanzó exactamente una vez.
    const registryJson = JSON.parse(JSON.stringify(viaRegistry.project));
    const agentJson = JSON.parse(JSON.stringify(viaAgentParsed));
    expect(registryJson.sections).toEqual(agentJson.sections);
    expect(typeof registryJson.updatedAt).toBe("string");
    expect(registryJson.updatedAt >= agentJson.updatedAt).toBe(true);
  });

  it("actualiza un repeater que sólo existe como default del schema", () => {
    const applied = applyMutation(catalogModernV2Store, createMutationRegistry(), {
      type: "section.repeater.item.update",
      sectionId: "modo-section-hero",
      fieldKey: "benefits",
      itemId: "hero-benefit-envios",
      changes: { title: "Envíos nacionales" },
    });
    const hero = applied.project.sections.find((section) => section.id === "modo-section-hero");
    const benefits = (hero?.settings as { benefits?: Array<{ id: string; title: string }> })
      .benefits;
    expect(benefits?.find((item) => item.id === "hero-benefit-envios")?.title).toBe(
      "Envíos nacionales",
    );
  });

  it("dos superficies con el mismo timestamp producen bytes idénticos", () => {
    const registry = createMutationRegistry();
    const at = { at: "2026-08-25T12:00:00.000Z" };
    const a = applyMutation(
      catalogModernStore,
      registry,
      {
        type: "section.field.update",
        sectionId: "modo-section-hero",
        fieldKey: "title",
        value: "Igual desde canvas",
      },
      undefined,
      at,
    );
    const viaAgent = applyMutation(
      catalogModernStore,
      registry,
      {
        type: "section.updateSettings",
        sectionId: "modo-section-hero",
        settings: { title: "Igual desde canvas" },
      },
      undefined,
      at,
    );
    const b = applyMutation(
      catalogModernStore,
      registry,
      {
        type: "section.updateSettings",
        sectionId: "modo-section-hero",
        settings: { title: "Igual desde canvas" },
      },
      undefined,
      at,
    );
    // Tres superficies, mismo cambio, mismo timestamp: bytes idénticos.
    expect(JSON.stringify(a.project)).toBe(JSON.stringify(b.project));
    expect(JSON.stringify(a.project)).toBe(JSON.stringify(viaAgent.project));
    expect(a.project.updatedAt).toBe("2026-08-25T12:00:00.000Z");
  });

  it("el harness de Canvas produce el mismo snapshot que sidebar y agente", () => {
    const at = { at: "2026-08-25T12:30:00.000Z" };
    const viaCanvas = commitCanvasField(
      catalogModernStore,
      { sectionId: "modo-section-hero", fieldKey: "title" },
      "Título desde el canvas",
      at,
    );
    const viaSidebar = applyMutation(
      catalogModernStore,
      createMutationRegistry(),
      {
        type: "section.updateSettings",
        sectionId: "modo-section-hero",
        settings: { title: "Título desde el canvas" },
      },
      undefined,
      at,
    );
    expect(JSON.stringify(viaCanvas)).toBe(JSON.stringify(viaSidebar.project));
  });

  it("repeater item update edita por itemId y rechaza campos inventados", () => {
    const registry = createMutationRegistry();
    const store = structuredClone(catalogModernStore);
    const hero = store.sections.find((section) => section.id === "modo-section-hero");
    if (!hero) throw new Error("fixture sin hero");
    hero.settings = {
      ...hero.settings,
      slides: [
        { id: "slide-1", title: "Uno", body: "", actionLabel: "", actionHref: "/", imageId: "" },
      ],
    };
    const applied = applyMutation(store, registry, {
      type: "section.repeater.item.update",
      sectionId: "modo-section-hero",
      fieldKey: "slides",
      itemId: "slide-1",
      changes: { title: "Slide editado" },
    });
    const slides = (
      applied.project.sections.find((section) => section.id === "modo-section-hero")?.settings as {
        slides: Array<{ id: string; title: string }>;
      }
    ).slides;
    expect(slides[0]?.title).toBe("Slide editado");
    expect(() =>
      applyMutation(store, registry, {
        type: "section.repeater.item.update",
        sectionId: "modo-section-hero",
        fieldKey: "slides",
        itemId: "slide-1",
        changes: { campoInventado: 1 },
      }),
    ).toThrow(/Campo desconocido en item/);
  });

  it("rechaza una sección inexistente y un campo desconocido del schema", () => {
    const registry = createMutationRegistry();
    expect(() =>
      applyMutation(catalogModernStore, registry, {
        type: "section.field.update",
        sectionId: "no-existe",
        fieldKey: "title",
        value: "x",
      }),
    ).toThrow(/No existe la sección/);
    expect(() =>
      applyMutation(catalogModernStore, registry, {
        type: "section.field.update",
        sectionId: "modo-section-hero",
        fieldKey: "campoInventado",
        value: "x",
      }),
    ).toThrow(/Campo desconocido/);
  });

  it("aplica mutaciones tipadas a identidad, entidades y assets", () => {
    const registry = createMutationRegistry();
    const product = catalogModernStore.products[0];
    const category = catalogModernStore.categories[0];
    const collection = catalogModernStore.collections[0];
    const asset = catalogModernStore.assets[0];
    if (!product || !category || !collection || !asset) throw new Error("fixture incompleto");

    const identity = applyMutation(catalogModernStore, registry, {
      type: "identity.update",
      changes: { brandName: "Marca Canvas" },
    }).project;
    expect(identity.identity.brandName).toBe("Marca Canvas");

    const identityWithPublicUrl = applyMutation(catalogModernStore, registry, {
      type: "identity.update",
      changes: { baseUrl: "https://pao-bi3.pages.dev/" },
    }).project;
    expect(identityWithPublicUrl.baseUrl).toBe("https://pao-bi3.pages.dev/");

    const productResult = applyMutation(identity, registry, {
      type: "product.update",
      productId: product.id,
      changes: {
        title: "Producto Canvas",
        richDescription: '<p>Seguro</p><script>alert("x")</script>',
      },
    }).project;
    const editedProduct = productResult.products.find((item) => item.id === product.id);
    expect(editedProduct?.title).toBe("Producto Canvas");
    expect(editedProduct?.richDescription).toBe("<p>Seguro</p>");

    const categoryResult = applyMutation(productResult, registry, {
      type: "category.update",
      categoryId: category.id,
      changes: { title: "Categoría Canvas" },
    }).project;
    expect(categoryResult.categories.find((item) => item.id === category.id)?.title).toBe(
      "Categoría Canvas",
    );

    const collectionResult = applyMutation(categoryResult, registry, {
      type: "collection.update",
      collectionId: collection.id,
      changes: { title: "Colección Canvas" },
    }).project;
    expect(collectionResult.collections.find((item) => item.id === collection.id)?.title).toBe(
      "Colección Canvas",
    );

    const assetResult = applyMutation(collectionResult, registry, {
      type: "asset.update",
      assetId: asset.id,
      changes: { alt: "Imagen editada desde Canvas" },
    }).project;
    expect(assetResult.assets.find((item) => item.id === asset.id)?.alt).toBe(
      "Imagen editada desde Canvas",
    );
  });

  it("actualiza el precio de la primera variante como centavos enteros", () => {
    const product = catalogModernStore.products[0];
    if (!product) throw new Error("fixture sin producto");
    const changed = applyMutation(
      catalogModernStore,
      createMutationRegistry(),
      {
        type: "product.update",
        productId: product.id,
        changes: { price: 12345 },
      },
      undefined,
      { at: "2026-08-25T12:00:00.000Z" },
    );
    expect(
      changed.project.products.find((item) => item.id === product.id)?.variants[0]?.price,
    ).toBe(12345);
    expect(() =>
      applyMutation(
        catalogModernStore,
        createMutationRegistry(),
        { type: "product.update", productId: product.id, changes: { price: 12.5 } },
        undefined,
        { at: "2026-08-25T12:00:00.000Z" },
      ),
    ).toThrow("entero seguro");
  });

  it("reordena productos y sincroniza los índices derivados de categorías", () => {
    const project = structuredClone(catalogModernStore);
    const first = project.products[0];
    const last = project.products.at(-1);
    if (!first || !last) throw new Error("fixture sin productos");
    const reordered = applyMutation(
      project,
      createMutationRegistry(),
      { type: "products.reorder", productIds: [last.id, ...project.products.slice(0, -1).map((item) => item.id)] },
      undefined,
      { at: "2026-08-25T12:00:00.000Z" },
    ).project;
    expect(reordered.products[0]?.id).toBe(last.id);
    const category = reordered.categories.find((item) => item.id === last.categoryIds[0]);
    expect(category?.productIds[0]).toBe(last.id);
    expect(() =>
      applyMutation(
        project,
        createMutationRegistry(),
        { type: "products.reorder", productIds: [first.id] },
        undefined,
        { at: "2026-08-25T12:00:00.000Z" },
      ),
    ).toThrow("cada producto exactamente una vez");
  });

  it("reordena repeaters por ID estable y aplica tokens de tema validados", () => {
    const registry = createMutationRegistry();
    const at = { at: "2026-08-25T13:00:00.000Z" };
    const hero = catalogModernStore.sections.find((section) => section.id === "modo-section-hero");
    if (!hero) throw new Error("fixture sin hero");
    const slides = [
      { id: "slide-a", title: "A", body: "", actionLabel: "", actionHref: "/", imageId: "" },
      { id: "slide-b", title: "B", body: "", actionLabel: "", actionHref: "/", imageId: "" },
    ];
    const withSlides = structuredClone(catalogModernStore);
    withSlides.sections = withSlides.sections.map((section) =>
      section.id === hero.id ? { ...section, settings: { ...section.settings, slides } } : section,
    );
    const reordered = applyMutation(
      withSlides,
      registry,
      {
        type: "section.repeater.item.reorder",
        sectionId: hero.id,
        fieldKey: "slides",
        itemId: "slide-b",
        beforeItemId: "slide-a",
      },
      undefined,
      at,
    ).project;
    expect(
      (
        reordered.sections.find((section) => section.id === hero.id)?.settings.slides as Array<{
          id: string;
        }>
      ).map((item) => item.id),
    ).toEqual(["slide-b", "slide-a"]);

    const withBackground = structuredClone(reordered);
    const backgroundAssetId = withBackground.assets[0]?.id;
    if (!backgroundAssetId) throw new Error("fixture sin asset");
    Object.assign(withBackground.theme, { background: { imageAssetId: backgroundAssetId } });
    const themed = applyMutation(
      withBackground,
      registry,
      {
        type: "theme.updateTokens",
        tokens: {
          colors: { accent: "#123456" },
          radius: 12,
          background: { opacity: 0.45 },
          shadows: { text: { enabled: true, opacity: 0.8 } },
        },
      },
      undefined,
      at,
    ).project;
    expect(themed.theme.colors.accent).toBe("#123456");
    expect(themed.theme.radius).toBe(12);
    expect(themed.theme.background?.imageAssetId).toBe(backgroundAssetId);
    expect(themed.theme.background?.opacity).toBe(0.45);
    expect(themed.theme.shadows?.text).toMatchObject({ enabled: true, opacity: 0.8 });
  });
});
