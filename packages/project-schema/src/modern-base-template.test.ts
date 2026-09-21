import { describe, expect, it } from "vitest";
import { isCatalogModernSentinelValue } from "./catalog-modern-guidance";
import {
  buildModernBaseTemplateProject,
  isModernBaseTemplateContent,
  MODERN_BASE_TEMPLATE_CONTENT_VERSION,
  replaceModernBaseTemplateContent,
} from "./modern-base-template";
import { cloneProjectFromTemplate } from "./project-policy";
import { isValidIcoDataUrl, StoreProjectV2Schema } from "./index";

describe("plantilla base moderna neutral", () => {
  it("tiene el catálogo, origen, carrito y distribución fijados", () => {
    const project = buildModernBaseTemplateProject();

    expect(StoreProjectV2Schema.safeParse(project).success).toBe(true);
    expect(project.schemaVersion).toBe(2);
    expect(project.products).toHaveLength(33);
    expect(project.categories).toHaveLength(6);
    expect(project.collections).toHaveLength(0);
    expect(project.origin).toMatchObject({
      templateId: "catalog-modern",
      templateVersion: 2,
      seed: "placeholder",
      role: "base-template",
      updatePolicy: "pinned",
    });
    expect(project.commerceTemplates).toMatchObject({
      designFamily: "catalog-modern-v2",
      cart: { enabled: true },
      checkout: { enabled: true },
    });
    expect(project.siteShell.cart).toBe(true);
    expect(project.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "modo-section-cart",
          moduleId: "catalog-cart-drawer",
          enabled: true,
        }),
      ]),
    );

    expect(project.categories.map((category) => category.productIds.length)).toEqual([
      6, 6, 5, 5, 6, 5,
    ]);
    expect(new Set(project.products.map((product) => product.slug)).size).toBe(33);
    expect(
      new Set(project.products.flatMap((product) => product.variants.map((variant) => variant.sku)))
        .size,
    ).toBe(project.products.flatMap((product) => product.variants).length);
    expect(project.products.every((product) => product.status === "active")).toBe(true);
    expect(project.products.some((product) => product.variants.length > 1)).toBe(true);
    expect(project.products.flatMap((product) => product.variants).every((variant) => Number.isInteger(variant.price))).toBe(
      true,
    );
    expect(project.sections.at(-1)?.moduleId).toBe("catalog-footer");
    expect(project.sections.findIndex((section) => section.moduleId === "contact-form")).toBeLessThan(
      project.sections.findIndex((section) => section.moduleId === "catalog-footer"),
    );
    expect(isModernBaseTemplateContent(project)).toBe(true);
    expect(MODERN_BASE_TEMPLATE_CONTENT_VERSION).toBe(3);
  });

  it("usa placeholders reconocibles y assets con proporciones específicas", () => {
    const project = buildModernBaseTemplateProject();
    const serialized = JSON.stringify(project).toLocaleLowerCase("es-AR");
    for (const token of ["modo sur", "rm descartables", "descartables", "blanqueria", "@gmail.com"]) {
      expect(serialized).not.toContain(token);
    }
    expect(isCatalogModernSentinelValue(project.identity.description)).toBe(true);
    expect(isCatalogModernSentinelValue(project.seo.description)).toBe(true);
    expect(isCatalogModernSentinelValue(project.products[0]?.title ?? "")).toBe(true);
    expect(isCatalogModernSentinelValue(project.categories[0]?.description ?? "")).toBe(true);

    expect(project.assets.map(({ id, width, height }) => ({ id, width, height }))).toEqual([
      { id: "asset-template-product", width: 1254, height: 1254 },
      { id: "asset-template-category", width: 1200, height: 900 },
      { id: "asset-template-hero", width: 1800, height: 1200 },
      { id: "asset-template-social", width: 1200, height: 628 },
      { id: "asset-template-favicon", width: 32, height: 32 },
    ]);
    const favicon = project.assets.find((asset) => asset.id === "asset-template-favicon");
    expect(isValidIcoDataUrl(favicon?.source)).toBe(true);
    for (const asset of project.assets) {
      expect(asset.optimizationRecipe).toBe("responsive-alpha-v2");
      expect(asset.hash).toMatch(/^[0-9a-f]{64}$/i);
      expect(asset.fallbackSource).toMatch(/^data:image\/(?:png|jpeg);base64,/);
      expect(asset.responsiveSources?.at(-1)?.width).toBe(asset.width);
    }
    const product = project.assets.find((asset) => asset.id === "asset-template-product");
    expect(product?.mimeType).toBe("image/webp");
    expect(product?.source).toMatch(/^data:image\/webp;base64,/);
    expect(product?.responsiveSources?.map((source) => source.width)).toEqual([480, 768, 1254]);
    expect(new Set(product?.responsiveSources?.map((source) => source.source)).size).toBe(3);
  });

  it("es determinista y clona IDs sin compartir estado mutable", () => {
    const options = {
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const first = buildModernBaseTemplateProject(options);
    const second = buildModernBaseTemplateProject(options);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const clone = cloneProjectFromTemplate(first, {
      id: "store-clone-template-test",
      name: "Clon de prueba",
      slug: "clon-de-prueba",
      now: options.updatedAt,
      idFactory: (prefix, sourceId) => `clone-${prefix}-${sourceId}`,
    });
    expect(clone.origin).toMatchObject({ role: "store", updatePolicy: "managed", seed: "duplicate" });
    expect(clone.products.map((product) => product.id)).not.toEqual(
      first.products.map((product) => product.id),
    );
    clone.products[0]!.title = "Edición del clon";
    expect(first.products[0]?.title).toBe("Producto 01");
    expect(clone.categories[0]?.productIds[0]).not.toBe(first.categories[0]?.productIds[0]);
    expect(clone.assets).toHaveLength(5);
    expect(clone.assets[0]?.id).not.toBe(first.assets[0]?.id);
    expect(clone.assets[0]?.source).toBe(first.assets[0]?.source);
    expect(clone.assets[0]?.fallbackSource).toBe(first.assets[0]?.fallbackSource);
    expect(clone.assets[0]?.responsiveSources).toEqual(first.assets[0]?.responsiveSources);
    expect(clone.products[0]?.imageIds[0]).toBe(clone.assets[0]?.id);
  });

  it("reemplaza sólo la base reservada y conserva su ruta", () => {
    const old = buildModernBaseTemplateProject({
      name: "Nombre visible legado",
      slug: "ruta-legada",
      baseUrl: "https://ruta-legada.example",
    });
    const replacement = replaceModernBaseTemplateContent(old, {
      updatedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(replacement.name).toBe("Nombre visible legado");
    expect(replacement.slug).toBe("ruta-legada");
    expect(replacement.baseUrl).toBe("https://ruta-legada.example");
    expect(replacement.updatedAt).toBe("2026-09-17T00:00:00.000Z");
    expect(isModernBaseTemplateContent(replacement)).toBe(true);
  });
});
