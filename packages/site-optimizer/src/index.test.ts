import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernCleanStore } from "@solara/project-schema/catalog-modern-template";
import { describe, expect, it } from "vitest";
import {
  buildAiContext,
  buildIndexableRoutes,
  buildLlmsTxt,
  fitTitle,
  optimizeProject,
} from "./index";

describe("site optimizer", () => {
  it("construye un informe determinista para la demo de 50 productos", () => {
    const first = optimizeProject(catalogModernStore, {
      mode: "production",
      publicAiContext: true,
    });
    const second = optimizeProject(catalogModernStore, {
      mode: "production",
      publicAiContext: true,
    });

    expect(first).toEqual(second);
    expect(first.counts.activeProducts).toBe(50);
    expect(first.routes.filter((route) => route.pageType === "product")).toHaveLength(50);
    expect(first.aiReadiness.structuredDataSource).toBe("shared-snapshot");
  });

  it("detecta contenido incompleto sin inventarlo", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products[0];
    if (!product) throw new Error("Fixture incompleto");
    product.description = "";
    product.imageIds = [];

    const report = optimizeProject(project, { mode: "draft", publicAiContext: false });
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "content.product.description", severity: "critical" }),
        expect.objectContaining({ code: "content.product.image", severity: "critical" }),
      ]),
    );
    expect(report.aiReadiness.publicContextAvailable).toBe(false);
  });

  it("detecta una fuente de producto menor al baseline de RM", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find((item) => item.status === "active");
    if (!product) throw new Error("Fixture sin productos activos");
    const assetId = product.imageIds[0];
    const assetIndex = project.assets.findIndex((asset) => asset.id === assetId);
    if (assetIndex < 0) throw new Error("Fixture sin imagen de producto");
    const asset = project.assets[assetIndex];
    if (!asset) throw new Error("Fixture sin asset de producto");
    project.assets[assetIndex] = {
      ...asset,
      width: 768,
      responsiveSources: [{ width: 480, source: asset.source }, { width: 768, source: asset.source }],
    };

    const report = optimizeProject(project, { mode: "production", publicAiContext: false });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "performance.product-image-resolution",
        severity: "warning",
        entity: expect.objectContaining({ type: "asset", id: asset.id }),
      }),
    );
  });

  it("detecta PNG como fuente primaria de producto aunque tenga srcset", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find((item) => item.status === "active");
    if (!product) throw new Error("Fixture sin productos activos");
    const assetIndex = project.assets.findIndex((asset) => asset.id === product.imageIds[0]);
    if (assetIndex < 0) throw new Error("Fixture sin imagen de producto");
    const asset = project.assets[assetIndex];
    if (!asset) throw new Error("Fixture sin asset de producto");
    project.assets[assetIndex] = {
      ...asset,
      mimeType: "image/png",
      source: "data:image/png;base64,cG5n",
      responsiveSources: [{ width: 768, source: "data:image/png;base64,cG5n" }],
    };

    const report = optimizeProject(project, { mode: "production", publicAiContext: false });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "performance.product-image-format",
        severity: "warning",
        entity: expect.objectContaining({ type: "asset", id: asset.id }),
      }),
    );
  });

  it("genera contexto publico sin datos privados ni recursos data URL", () => {
    const context = buildAiContext(catalogModernStore);
    const parsed = JSON.parse(context) as {
      products: unknown[];
      site: { name: string };
      contact: { email?: string };
    };
    expect(parsed.site.name).toBe("Tienda Referencia");
    expect(parsed.products).toHaveLength(50);
    expect(context).not.toContain("data:image");
    expect(parsed.contact.email).toBe("hola@tienda-referencia-modern.example");
  });

  it("puede serializar el contexto AI en modo compacto para producción", () => {
    const pretty = buildAiContext(catalogModernStore);
    const compact = buildAiContext(catalogModernStore, { compact: true });

    expect(compact.length).toBeLessThan(pretty.length);
    expect(JSON.parse(compact)).toEqual(JSON.parse(pretty));
  });

  it("no presenta contexto publico como publicado en modo draft", () => {
    const report = optimizeProject(catalogModernStore, {
      mode: "draft",
      publicAiContext: true,
    });
    expect(report.aiReadiness.publicContextAvailable).toBe(false);
  });

  it("genera llms.txt legible y con enlaces canonicos", () => {
    const text = buildLlmsTxt(catalogModernCleanStore);
    expect(text).toContain("# Nueva tienda");
    expect(text).not.toContain("Modo Sur");
    expect(text).toContain("/#contact-form");
    expect(text).toContain("## Productos");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("mantiene llms.txt resumido, sin duplicados y con datos de contacto", () => {
    const project = structuredClone(catalogModernStore);
    const firstProduct = project.products[0];
    const secondProduct = project.products[1];
    if (!firstProduct || !secondProduct) throw new Error("Fixture sin productos suficientes");
    secondProduct.title = firstProduct.title;

    const text = buildLlmsTxt(project);
    const primaryStart = text.indexOf("## Páginas principales");
    const categoriesStart = text.indexOf("## Categorías");
    const primarySection = text.slice(primaryStart, categoriesStart);
    const urls = [...text.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);

    expect(primarySection).not.toContain("/productos/");
    expect(new Set(urls).size).toBe(urls.length);
    expect(text).toContain(`${firstProduct.title} — ${firstProduct.slug}`);
    expect(text).toContain(`${firstProduct.title} — ${secondProduct.slug}`);
    expect(text).toContain("Última actualización:");
    expect(text).toContain("Email:");
  });

  it("no enlaza categorías ocultas en el contexto ni en llms.txt", () => {
    const project = structuredClone(catalogModernStore);
    const hiddenCategory = project.categories[0];
    if (!hiddenCategory) throw new Error("Fixture sin categorías");
    hiddenCategory.status = "hidden";

    const context = JSON.parse(buildAiContext(project)) as {
      pages: Array<{ path: string }>;
      categories: Array<{ id: string }>;
    };
    const hiddenPath = `/categorias/${hiddenCategory.slug}/`;
    const llms = buildLlmsTxt(project);

    expect(context.pages.some((page) => page.path === hiddenPath)).toBe(false);
    expect(context.categories.some((category) => category.id === hiddenCategory.id)).toBe(false);
    expect(llms).not.toContain(hiddenPath);
  });

  it("advierte cuando una seccion de catalogo apunta a un origen inexistente", () => {
    const project = structuredClone(catalogModernStore);
    const section = project.sections.find(
      (item) => item.moduleId === "catalog-product-grid" && item.slot === "catalog",
    );
    if (!section) throw new Error("Fixture sin seccion de catalogo");
    project.sections = [
      ...project.sections,
      {
        ...structuredClone(section),
        id: "section-orphan-collection" as typeof section.id,
        settings: {
          ...section.settings,
          title: "Origen roto",
          source: "collection",
          sourceId: "collection-inexistente",
        },
      },
      {
        ...structuredClone(section),
        id: "section-orphan-category" as typeof section.id,
        settings: {
          ...section.settings,
          title: "Categoria rota",
          source: "category",
          sourceId: "category-inexistente",
        },
      },
    ];
    const report = optimizeProject(project, { mode: "production" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "catalog.section.orphan-source",
          severity: "warning",
          entity: { type: "collection", id: "collection-inexistente", label: "Origen roto" },
        }),
        expect.objectContaining({
          code: "catalog.section.orphan-source",
          severity: "warning",
          entity: { type: "category", id: "category-inexistente", label: "Categoria rota" },
        }),
      ]),
    );
  });

  it("advierte un origen huérfano dentro de las secciones de una página", () => {
    const project = structuredClone(catalogModernStore);
    const section = project.sections.find(
      (item) => item.moduleId === "catalog-product-grid" && item.slot === "catalog",
    );
    if (!section) throw new Error("Fixture sin seccion de catalogo");
    project.pages = project.pages.map((page) =>
      page.kind === "home"
        ? {
            ...page,
            sections: [
              {
                ...structuredClone(section),
                id: "page-orphan-collection" as typeof section.id,
                settings: {
                  ...section.settings,
                  title: "Origen roto en página",
                  source: "collection",
                  sourceId: "collection-inexistente",
                },
              },
            ],
          }
        : page,
    );
    const report = optimizeProject(project, { mode: "production" });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: "catalog.section.orphan-source",
        severity: "warning",
        path: "pages.0.sections.0.settings.sourceId",
        entity: {
          type: "collection",
          id: "collection-inexistente",
          label: "Origen roto en página",
        },
      }),
    );
  });

  it("incluye la paginación de colecciones en rutas, llms.txt y contexto AI", () => {
    const report = optimizeProject(catalogModernStore, { mode: "production" });
    const collectionRoutes = report.routes.filter(
      (route) => route.pageType === "collection" && route.path.includes("/pagina/"),
    );
    const llms = buildLlmsTxt(catalogModernStore);
    const context = JSON.parse(buildAiContext(catalogModernStore)) as {
      pages: Array<{ path: string; canonicalUrl: string }>;
    };

    expect(collectionRoutes).toEqual([
      expect.objectContaining({
        path: "/colecciones/esenciales/pagina/2/",
        canonicalPath: "/colecciones/esenciales/pagina/2/",
        indexable: true,
      }),
    ]);
    expect(llms).toContain("tienda-referencia-modern.example/colecciones/esenciales/pagina/2/");
    expect(context.pages.some((page) => page.path === "/colecciones/esenciales/pagina/2/")).toBe(
      true,
    );
    expect(
      context.pages.some((page) => page.path === "/colecciones/recien-llegados/pagina/2/"),
    ).toBe(false);
  });
});

describe("fitTitle", () => {
  const brand = "Tienda Referencia";

  it("conserva byte-idénticos los títulos que caben", () => {
    expect(fitTitle("Remera esencial negra", brand)).toBe(
      "Remera esencial negra | Tienda Referencia",
    );
  });

  it("trunca la entidad en límite de palabra con … y conserva la marca completa", () => {
    const entity = "Uno dos tres cuatro cinco seis siete ocho nueve diez";
    const title = fitTitle(entity, brand);
    expect(title).toBe("Uno dos tres cuatro cinco seis siete… | Tienda Referencia");
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(` | ${brand}`)).toBe(true);
  });

  it("no trunca cuando la marca deja menos de 20 caracteres para la entidad", () => {
    const marcaLarga = "Marca con nombre comercial sumamente extenso";
    const entity = `Término ${"extenso".repeat(12)}`;
    expect(fitTitle(entity, marcaLarga)).toBe(`${entity} | ${marcaLarga}`);
  });

  it("no trunca cuando el recorte quedaría por debajo del mínimo de entidad", () => {
    const marca = "M".repeat(37);
    const entity = `Hola ${"palabra".repeat(15)}`;
    expect(fitTitle(entity, marca)).toBe(`${entity} | ${marca}`);
  });
});

describe("títulos de rutas acotados a 60 caracteres", () => {
  it("trunca solo la entidad en categoría, colección y producto manteniendo la marca", () => {
    const project = structuredClone(catalogModernStore);
    const category = project.categories[0];
    if (!category) throw new Error("Fixture sin categorías");
    category.title = "Categoria con un nombre comercial excesivamente largo para titulos";
    const collection = project.collections[0];
    if (!collection) throw new Error("Fixture sin colecciones");
    collection.title = "Coleccion con un nombre comercial excesivamente largo para titulos";
    const product = project.products.find((item) => item.status === "active");
    if (!product) throw new Error("Fixture sin productos activos");
    product.title = "Producto con un nombre comercial excesivamente largo para un titulo seo";

    const routes = buildIndexableRoutes(project);
    const brand = project.identity.brandName;
    const categoryRoute = routes.find((item) => item.path === `/categorias/${category.slug}/`);
    const collectionRoute = routes.find((item) => item.path === `/colecciones/${collection.slug}/`);
    const productRoute = routes.find((item) => item.path === `/productos/${product.slug}/`);
    if (!categoryRoute || !collectionRoute || !productRoute) {
      throw new Error("Fixture sin rutas esperadas");
    }

    expect(categoryRoute.title.length).toBeLessThanOrEqual(60);
    expect(categoryRoute.title.endsWith(` | ${brand}`)).toBe(true);
    expect(categoryRoute.title).toContain("…");
    expect(collectionRoute.title.length).toBeLessThanOrEqual(60);
    expect(collectionRoute.title.endsWith(` | ${brand}`)).toBe(true);
    expect(productRoute.title.length).toBeLessThanOrEqual(60);
    expect(productRoute.title.endsWith(` | ${brand}`)).toBe(true);
  });

  it("deja byte-idénticos los títulos cortos de producto", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find((item) => item.status === "active");
    if (!product) throw new Error("Fixture sin productos activos");
    const expected = `${product.title} | ${project.identity.brandName}`;
    if (expected.length > 60) throw new Error("Fixture no apto para el caso corto");

    const route = buildIndexableRoutes(project).find(
      (item) => item.path === `/productos/${product.slug}/`,
    );
    expect(route?.title).toBe(expected);
  });
});
