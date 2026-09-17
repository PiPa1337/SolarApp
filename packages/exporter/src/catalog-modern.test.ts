import { StoreProjectV2Schema } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernCleanStore } from "@solara/project-schema/catalog-modern-template";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { describe, expect, it } from "vitest";
import { exportProject, renderPreviewHtml } from "./index";

describe("tienda base catalog-modern de 50 productos", () => {
  const exported = exportProject(catalogModernStore, { mode: "production" });

  const checkoutMarkers = [
    'data-cart-step="review"',
    "data-cart-review-panel",
    "data-cart-checkout-panel",
    "data-cart-checkout-next",
    "data-cart-review-back",
    "data-cart-checkout-submit",
  ];

  const expectCheckoutContract = (html: string, surface: string): void => {
    for (const marker of checkoutMarkers) {
      expect(html, `${surface}: falta ${marker}`).toContain(marker);
    }
  };

  it("genera el catálogo completo y conserva la familia visual moderna", () => {
    const productPages = [...exported.files.keys()].filter((path) =>
      /^productos\/[^/]+\/index\.html$/.test(path),
    );
    const categoryPages = [...exported.files.keys()].filter((path) =>
      /^categorias\/[^/]+\//.test(path),
    );
    const home = String(exported.files.get("index.html"));
    const product = String(exported.files.get("productos/remera-esencial-de-algodon/index.html"));

    expect(productPages).toHaveLength(50);
    expect(categoryPages).toHaveLength(14);
    expect(home).toContain('data-design-family="catalog-modern-v1"');
    expect(home).toMatch(/>Categorías<span class="catalog-nav-chevron"/);
    expect(home).toContain('class="catalog-mega-menu__groups"');
    expect(home).toContain('class="catalog-mega-group catalog-mega-group--has-children"');
    expect(home).not.toContain(">Tienda</summary>");
    expect(home).not.toMatch(/[\u00C3\u00C2\uFFFD]/);
    expect(home).toContain('data-solara-module="catalog-product-grid"');
    expect(home).toContain("data-catalog-search-dialog");
    expect(home).toContain("data-catalog-search-open");
    // El hero optimizado viaja como data URL y el export lo convierte a /assets/{hash}.webp
    expect(home).toContain("assets/fixture-modo-sur-hero.webp");
    expect(home).toContain("/fixtures/modo-sur-product-01.webp");
    expect(home.match(/data-product-card/g) ?? []).toHaveLength(20);
    expect(home).not.toContain("catalog-product-rating");
    expect(home).not.toContain("catalog-product-availability");
    expect(home).toContain("Remeras");
    expect(home).toContain("Camisas");
    expect(product).toContain('data-solara-module="catalog-product-detail"');
    expect(product).toContain("data-variant-select");
    expect(product).not.toContain("catalog-option-pill");
    expect(product).not.toContain("catalog-variant-links");
    expect(product).not.toContain('role="tablist"');
    expect(product).toContain('class="catalog-product-specs"');
    expect(product).toContain('class="catalog-product-policies"');
    expect(product).not.toContain('class="catalog-product-reviews"');
    expect(product).not.toContain('class="catalog-product-rating"');
  });

  it("recorre preview y export con una raíz V2 aislada sin alterar V1", () => {
    const v2Export = exportProject(catalogModernV2Store, { mode: "production" });
    const v2Home = String(v2Export.files.get("index.html"));
    const v2Product = String(v2Export.files.get("productos/remera-esencial-de-algodon/index.html"));
    const v2Sitemap = String(v2Export.files.get("sitemap.xml"));
    const v2Preview = renderPreviewHtml(catalogModernV2Store, "draft", "/");
    const v1Home = String(exported.files.get("index.html"));
    const moduleTree = (html: string) =>
      [...html.matchAll(/data-solara-module="([^"]+)"/g)].map((match) => match[1]);

    expect(v2Home).toContain('data-design-family="catalog-modern-v2"');
    expect(v2Home).toContain('class="solara-page catalog-modern catalog-modern-v2 cm v2"');
    expect(v2Home).toContain('data-solara-module="catalog-product-grid"');
    expect(v2Home).toContain('class="solara-home-contact"');
    expect(v2Home).toContain('data-solara-module="contact-form"');
    expect(v2Home).toContain('data-solara-module="contact-channels"');
    expect(v2Home.match(/class="catalog-testimonial"/g) ?? []).toHaveLength(12);
    expect(v2Home).not.toContain("catalog-testimonials-controls");
    expect(v2Product).toContain('data-solara-module="catalog-product-detail"');
    expect(v2Export.files.has("nosotros/index.html")).toBe(false);
    expect(v2Export.files.has("contacto/index.html")).toBe(false);
    expect(v2Export.files.has("compra/index.html")).toBe(false);
    expect(v2Export.files.has("envios/index.html")).toBe(false);
    expect(v2Export.files.has("devoluciones/index.html")).toBe(false);
    expect(v2Home).not.toContain('href="/nosotros/"');
    expect(v2Home).not.toContain('href="/contacto/"');
    expect(v2Home).not.toContain('href="/envios/"');
    expect(v2Home).not.toContain('href="/devoluciones/"');
    expect(v2Home).not.toContain('href="/compra/"');
    expect(v2Home).toContain('<link rel="canonical"');
    expect(v2Home).toContain('<meta property="og:title"');
    expect(v2Sitemap).toContain("/productos/remera-esencial-de-algodon/");
    expect(moduleTree(v2Preview)).toEqual(moduleTree(v2Home));
    expect(v1Home).not.toContain("catalog-modern-v2");
  });

  it("mantiene el contrato de checkout V2 en export y Preview para cada raíz moderna", () => {
    for (const project of [catalogModernStore, catalogModernV2Store]) {
      const exportedProject = exportProject(project, { mode: "production" });
      const exportedHome = exportedProject.files.get("index.html");
      const exportedCart = exportedProject.files.get("carrito/index.html");
      expect(exportedHome).toBeDefined();
      expect(exportedCart).toBeDefined();
      expectCheckoutContract(String(exportedHome), `${project.name} export home`);
      expectCheckoutContract(String(exportedCart), `${project.name} export carrito`);

      const previewHome = renderPreviewHtml(project, "draft", "/");
      const previewCart = renderPreviewHtml(project, "draft", "/carrito/");
      expectCheckoutContract(String(previewHome), `${project.name} Preview home`);
      expectCheckoutContract(String(previewCart), `${project.name} Preview carrito`);
    }
  });

  it("bloquea production en la plantilla limpia hasta reemplazar placeholders", () => {
    const draft = exportProject(catalogModernCleanStore, { mode: "draft" });
    expect(draft.audit.some((issue) => issue.code === "template.placeholder")).toBe(true);
    expect(() => exportProject(catalogModernCleanStore, { mode: "production" })).toThrow(
      "imágenes de plantilla",
    );
  });

  it("distingue placeholders publicados de imágenes de plantilla sin referencias", () => {
    const source = catalogModernCleanStore.assets[0];
    if (!source) throw new Error("La plantilla limpia debe tener una imagen de ejemplo.");
    const draft = exportProject(
      {
        ...catalogModernCleanStore,
        assets: [
          ...catalogModernCleanStore.assets,
          { ...source, id: `${source.id}-unused` as typeof source.id },
        ],
      },
      { mode: "draft" },
    );
    expect(draft.audit).toContainEqual(
      expect.objectContaining({ code: "template.placeholder.unused", severity: "warning" }),
    );
  });

  it("mantiene la paridad entre preview y exportación y el índice de búsqueda", () => {
    const preview = renderPreviewHtml(catalogModernStore, "draft", "/");
    const exportedHome = String(exported.files.get("index.html"));
    const moduleTree = (html: string) =>
      [...html.matchAll(/data-solara-module="([^"]+)"/g)].map((match) => match[1]);
    const search = JSON.parse(String(exported.files.get("search-index.json"))) as Array<{
      title: string;
      options?: string[];
      tokens?: {
        title: string[];
        brand: string[];
        tags: string[];
        categories: string[];
        description: string[];
      };
    }>;
    const remera = search.find((entry) => entry.title === "Remera esencial de algodón");

    expect(moduleTree(preview)).toEqual(moduleTree(exportedHome));
    expect(search).toHaveLength(50);
    expect(remera?.tokens?.title).toContain("remera");
    expect(remera?.tokens?.title).toContain("algodon");
    expect(remera?.tokens?.description).toContain("prenda");
    expect(remera?.tokens?.categories).toContain("basicas");
    expect(remera?.options).toContain("Talle=S");
    expect(search.every((entry) => Array.isArray(entry.tokens?.title))).toBe(true);
    expect(exported.files.has("categorias/novedades/index.html")).toBe(false);
    expect(exported.files.has("categorias/sale/index.html")).toBe(false);
    expect(String(exported.files.get("sitemap.xml"))).toContain(
      "/productos/remera-esencial-de-algodon/",
    );
    expect(catalogModernStore.whatsapp.greeting).toBe(
      "Hola Tienda Referencia, quiero hacer este pedido:",
    );
  });

  it("construye la categoría moderna con filtros y pie comercial", () => {
    const category = String(exported.files.get("categorias/remeras/index.html"));

    expect(category).toContain('class="solara-container catalog-category-page"');
    expect(category).toContain('class="catalog-category-filters"');
    expect(category).toContain('class="catalog-category-layout"');
    expect(category).toContain('data-solara-module="catalog-product-grid"');
    expect(category).toContain("data-category-grid");
    expect(category).toContain("data-category-option");
    expect(category).toContain("data-product-price=");
    expect(category).not.toContain("catalog-product-rating");
    expect(category).not.toContain("catalog-product-availability");
    expect(category).toContain('data-solara-module="catalog-newsletter-cta"');
    expect(category).not.toContain('data-solara-module="catalog-testimonials"');
    const cart = String(exported.files.get("carrito/index.html"));
    expect(cart).toContain("data-cart-subtotal");
    expect(cart).toContain("Entrega");
    expect(cart).toContain("data-cart-cta");
    expect(cart).toContain("Explorar categor\u00EDas");
    expect(cart).toContain("Continuar a compra");
  });

  it("mantiene la página de búsqueda compacta con input persistente y resultados fuera del diálogo", () => {
    const search = String(exported.files.get("buscar/index.html"));

    expect(search).toContain("data-catalog-search-dialog");
    expect(search).toContain("data-catalog-search-open");
    expect(search).toContain('class="catalog-category-layout solara-search-layout"');
    expect(search).toContain('data-search-results aria-live="polite"');
    expect(search).toContain('data-category-option-key="Talle"');
    expect(search).toContain("data-search-sort");
    expect(search).toContain('<form class="solara-search-form" role="search" action="/buscar/"');
    expect(search).toContain('<label for="solara-search-input">Buscar productos</label>');
    expect(search).toContain('<input id="solara-search-input" name="q" type="search"');
  });

  it("conserva la búsqueda de la página cuando el header la oculta", () => {
    const project = {
      ...catalogModernStore,
      navigation: { ...catalogModernStore.navigation, showSearch: false },
    };
    const search = String(exportProject(project, { mode: "draft" }).files.get("buscar/index.html"));

    expect(search).not.toContain("data-catalog-search-dialog");
    expect(search).not.toContain("data-catalog-search-open");
    expect(search).toContain('<label for="solara-search-input">Buscar productos</label>');
    expect(search).toContain('<input id="solara-search-input" name="q" type="search"');
  });

  it("emite el total real de la categoría en el contador de resultados", () => {
    const remeras = String(exported.files.get("categorias/remeras/index.html"));

    expect(remeras).toMatch(/data-category-result-count data-category-total="\d+">\d+ productos/);
    const totalMatch = remeras.match(
      /data-category-result-count data-category-total="(\d+)">\1 productos/,
    );
    expect(totalMatch).not.toBeNull();
  });

  it("mantiene showRating alineado entre preview y exportacion", () => {
    const withRatings = {
      ...catalogModernStore,
      sections: catalogModernStore.sections.map((section) =>
        section.moduleId === "catalog-product-grid"
          ? { ...section, settings: { ...section.settings, showRating: true } }
          : section,
      ),
    };
    const preview = renderPreviewHtml(withRatings, "draft", "/");
    const exportedHome = String(
      exportProject(withRatings, { mode: "draft" }).files.get("index.html"),
    );

    expect(preview).not.toContain('class="catalog-product-rating"');
    expect(exportedHome).not.toContain('class="catalog-product-rating"');
    expect(preview).not.toContain("4.7 / 5 · 6 reseñas");
    expect(exportedHome).not.toContain("4.7 / 5 · 6 reseñas");

    const withoutRatings = {
      ...withRatings,
      sections: withRatings.sections.map((section) =>
        section.moduleId === "catalog-product-grid"
          ? { ...section, settings: { ...section.settings, showRating: false } }
          : section,
      ),
    };
    expect(renderPreviewHtml(withoutRatings, "draft", "/")).not.toContain(
      'class="catalog-product-rating"',
    );
    expect(
      String(exportProject(withoutRatings, { mode: "draft" }).files.get("index.html")),
    ).not.toContain('class="catalog-product-rating"');
  });

  it("deduplica fuentes de assets embebidos en el preview", () => {
    const payload = "A".repeat(100_000);
    const embedded = {
      ...catalogModernStore,
      assets: catalogModernStore.assets.map((asset) => ({
        ...asset,
        source: `data:image/png;base64,${payload}`,
      })),
    };
    const preview = renderPreviewHtml(embedded, "draft", "/");

    expect(preview).toContain('id="solara-preview-assets"');
    expect(preview).toContain("__solara-preview-assets");
    expect(preview.length).toBeLessThan(2_000_000);

    const transported = renderPreviewHtml(embedded, "draft", "/", {
      assetTransport: "parent",
    });
    expect(transported).toContain("solara-preview-assets-request");
    expect(transported).toContain("data-solara-preview-src");
    expect(transported).not.toMatch(/\ssrc="\/__solara-preview-assets\//);
    expect(transported).not.toContain(payload);
    expect(transported.length).toBeLessThan(2_000_000);
  });

  it("calcula el navbar moderno para cantidades de categorías variables", () => {
    const custom = StoreProjectV2Schema.parse({
      ...structuredClone(catalogModernStore),
      navigation: {
        ...catalogModernStore.navigation,
        catalogLabel: "Explorar",
        items: [
          { id: "nav-one", label: "Una categoría", href: "/categorias/remeras/" },
          {
            id: "nav-two",
            label: "Otra categoría",
            href: "/categorias/pantalones/",
            children: [{ id: "nav-child", label: "Subcategoría", href: "/categorias/jeans/" }],
          },
        ],
      },
    });
    const html = renderPreviewHtml(custom, "draft", "/");

    expect(html).toContain('>Explorar<span class="catalog-nav-chevron"');
    expect(html).toContain("Una categoría");
    expect(html).toContain("Subcategoría");
    expect(html).toContain('class="catalog-mobile-categories"');
    expect(html).not.toContain(">Tienda</summary>");
  });
});
