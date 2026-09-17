import { describe, expect, it } from "vitest";
import { buildCatalogModernProject, catalogModernCleanStore } from "./catalog-modern-template";

const placeholder = buildCatalogModernProject({ seed: "placeholder" });

describe("seed placeholder", () => {
  it("crea 33 productos base con copy instructivo", () => {
    expect(placeholder.products).toHaveLength(33);
    expect(placeholder.products[0]?.title).toBe("Producto 01");
    expect(placeholder.products[0]?.description).toBe("Descripcion del producto 01.");
    for (const product of placeholder.products) {
      expect(product.variants[0]?.price).toBeGreaterThan(0);
      expect(product.variants.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("crea 6 categorias raiz y no crea colecciones", () => {
    expect(placeholder.categories.map((c) => c.title)).toEqual([
      "Hogar",
      "Cocina",
      "Decoración",
      "Textiles",
      "Organización",
      "Limpieza",
    ]);
    expect(placeholder.categories.every((category) => category.parentId === undefined)).toBe(true);
    expect(placeholder.collections).toHaveLength(0);
  });

  it("hero y announcement usan textos instructivos", () => {
    const hero = placeholder.sections.find((s) => s.moduleId === "catalog-hero");
    const heroSettings = hero?.settings as { title?: string; body?: string };
    expect(heroSettings.title).toBe("Una tienda hecha para tu marca.");
    expect(heroSettings.body).toContain("Cargá tus productos");
    const announcement = placeholder.sections.find((s) => s.moduleId === "catalog-announcement");
    expect((announcement?.settings as { text?: string }).text).toBe(
      "Tu tienda online, lista para empezar.",
    );
  });

  it("marcas y testimonios desactivados", () => {
    const brands = placeholder.sections.find((s) => s.moduleId === "catalog-brand-strip");
    const testimonials = placeholder.sections.find((s) => s.moduleId === "catalog-testimonials");
    expect(brands?.enabled).toBe(false);
    expect(testimonials?.enabled).toBe(false);
  });

  it("grilla de productos activa apuntando al catalogo completo", () => {
    const grid = placeholder.sections.find(
      (s) => s.moduleId === "catalog-product-grid" && s.enabled,
    );
    const settings = grid?.settings as { source?: string; sourceId?: string; limit?: number };
    expect(settings.source).toBe("all");
    expect(settings.sourceId).toBe("");
    expect(settings.limit).toBe(12);
  });

  it("es distinto de clean y demo pero mantiene el contrato V2", () => {
    expect(placeholder.products.length).not.toBe(catalogModernCleanStore.products.length);
    expect(placeholder.commerceTemplates.designFamily).toBe("catalog-modern-v2");
    expect(placeholder.origin?.seed).toBe("placeholder");
    expect(placeholder.pages.map((page) => page.kind)).toEqual(["home"]);
  });
});
