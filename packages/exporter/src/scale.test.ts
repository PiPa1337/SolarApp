import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import { exportProject, renderPreviewHtml } from "./index";

describe("exporter con catálogo jerárquico de escala", () => {
  const exported = exportProject(catalogScaleStore, { mode: "production" });

  it("genera productos, categorías y paginación esperados", () => {
    const productPages = [...exported.files.keys()].filter((path) =>
      /^productos\/[^/]+\/index\.html$/.test(path),
    );
    const categoryPages = [...exported.files.keys()].filter((path) =>
      /^categorias\/[^/]+\//.test(path),
    );

    expect(productPages).toHaveLength(50);
    expect(categoryPages).toHaveLength(16);
    expect(exported.files.has("categorias/casa/index.html")).toBe(true);
    expect(exported.files.has("categorias/casa/pagina/2/index.html")).toBe(true);
    expect(String(exported.files.get("categorias/casa/pagina/2/index.html"))).toContain(
      'rel="prev"',
    );
    expect(String(exported.files.get("categorias/casa/index.html"))).toContain('rel="next"');
    expect(exported.files.has("categorias/novedades/index.html")).toBe(false);
    expect(exported.files.has("categorias/sale/index.html")).toBe(false);

    const categoryPageOne = String(exported.files.get("categorias/casa/index.html"));
    const categoryPageTwo = String(exported.files.get("categorias/casa/pagina/2/index.html"));
    const titleOf = (html: string) => /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
    expect(titleOf(categoryPageTwo)).toContain("Página 2");
    expect(titleOf(categoryPageTwo)).not.toBe(titleOf(categoryPageOne));

    const sitemap = String(exported.files.get("sitemap.xml"));
    const home = String(exported.files.get("index.html"));
    expect(home).toContain(">Categorías</summary>");
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1])
      .filter((location): location is string => Boolean(location));
    expect(new Set(locations).size).toBe(locations.length);
    expect(locations.filter((location) => location.includes("/categorias/")).length).toBe(16);
    expect(locations.filter((location) => location.includes("/productos/")).length).toBe(50);
  });

  it("agrega descendientes en padres y conserva hojas aisladas", () => {
    const casa = String(exported.files.get("categorias/casa/index.html"));
    const textiles = String(exported.files.get("categorias/textiles/index.html"));
    const decoracionProduct = catalogScaleStore.products.find((product) =>
      product.categoryIds.includes("category-decoracion" as (typeof product.categoryIds)[number]),
    );
    const textilesProduct = catalogScaleStore.products.find((product) =>
      product.categoryIds.includes("category-textiles" as (typeof product.categoryIds)[number]),
    );
    if (!decoracionProduct || !textilesProduct) throw new Error("Fixture incompleto");

    expect(casa).toContain("Explorar Casa");
    expect(casa).toContain(`/productos/${decoracionProduct.slug}/`);
    expect(textiles).toContain(`/categorias/casa/`);
    expect(textiles).toContain('aria-current="page">Textiles</span>');
    expect(textiles).toContain(`/productos/${textilesProduct.slug}/`);
    expect(textiles).not.toContain(`/productos/${decoracionProduct.slug}/`);
  });

  it("indexa ancestros, variantes y assets reutilizados", () => {
    const search = JSON.parse(String(exported.files.get("search-index.json"))) as Array<{
      categoryNames: string[];
      title: string;
    }>;
    const feed = String(exported.files.get("google-merchant.xml"));
    const home = String(exported.files.get("index.html"));

    expect(search).toHaveLength(50);
    expect(home.match(/data-product-card/g) ?? []).toHaveLength(12);
    expect(home).not.toMatch(/[\u00c3\u00c2\ufffd]/);
    expect(home.indexOf('data-solara-module="compact-product-grid"')).toBeLessThan(
      home.indexOf('data-solara-module="collection-grid"'),
    );
    expect(search.find((entry) => entry.title === "Pieza de escala 01")?.categoryNames).toContain(
      "Casa",
    );
    expect(feed.match(/<item>/g)).toHaveLength(60);
    // Con data URLs embebidas el export emite /assets/{hash}.webp.
    const uniqueAssets = new Set(
      [...home.matchAll(/assets\/fixture-[a-z0-9-]+\.webp/g)].map((m) => m[0]),
    );
    expect(uniqueAssets.size).toBeGreaterThanOrEqual(3);
  });

  it("ofrece en legacy las etiquetas de productos de otras páginas de la categoría", () => {
    const project = structuredClone(catalogScaleStore);
    project.products.slice(24, 28).forEach((product) => {
      product.tags = [...product.tags, "etiqueta-pagina-dos"];
    });
    const result = exportProject(project, { mode: "production" });
    const pageOne = String(result.files.get("categorias/casa/index.html"));
    const pageTwo = String(result.files.get("categorias/casa/pagina/2/index.html"));

    expect(pageOne).toContain('<option value="etiqueta-pagina-dos">');
    expect(pageTwo).toContain("Pieza de escala 25");
    expect(pageTwo).not.toContain("Pieza de escala 01");
  });

  it("no emite el layout ni los filtros de opciones modernos en categorías legacy", () => {
    const casa = String(exported.files.get("categorias/casa/index.html"));

    expect(casa).not.toContain("catalog-category-layout");
    expect(casa).not.toContain("data-category-option");
    expect(casa).toContain("solara-category-toolbar");
    expect(casa).toContain("data-category-tag");
    expect(casa).toContain("data-category-available");
    expect(casa).toContain("data-category-sort");
  });

  it("usa el copy global para los filtros legacy", () => {
    const project = structuredClone(catalogScaleStore);
    project.publicCopy.filters = {
      ...project.publicCopy.filters,
      title: "Refinar catálogo",
      availableOnly: "Con stock",
      tag: "Tema",
      all: "Cualquier tema",
      minimum: "Desde",
      maximum: "Hasta",
    };
    const category = String(
      exportProject(project, { mode: "production" }).files.get("categorias/casa/index.html"),
    );

    expect(category).toContain("Refinar catálogo");
    expect(category).toContain("Con stock");
    expect(category).toContain("Tema");
    expect(category).toContain("Cualquier tema");
    expect(category).toContain("Desde");
    expect(category).toContain("Hasta");
  });

  it("mantiene paridad entre preview y exportación en categoría hija y página 2", () => {
    const moduleTree = (html: string) =>
      [...html.matchAll(/data-solara-module="([^"]+)"/g)].map((match) => match[1]);
    const childPreview = renderPreviewHtml(catalogScaleStore, "draft", "/categorias/textiles/");
    const childExport = String(exported.files.get("categorias/textiles/index.html"));
    const pageTwoPreview = renderPreviewHtml(
      catalogScaleStore,
      "draft",
      "/categorias/casa/pagina/2/",
    );
    const pageTwoExport = String(exported.files.get("categorias/casa/pagina/2/index.html"));

    expect(moduleTree(childPreview)).toEqual(moduleTree(childExport));
    expect(moduleTree(pageTwoPreview)).toEqual(moduleTree(pageTwoExport));
    expect(childPreview).toContain("Casa");
    expect(pageTwoPreview).toContain("Casa");
    expect(exportProject(catalogScaleStore, { mode: "production" }).files).toEqual(exported.files);
  });

  it("emite ventana numérica de paginación además de prev/next", () => {
    const project = structuredClone(catalogScaleStore);
    project.commerceTemplates.category.productsPerPage = 4;
    const result = exportProject(project, { mode: "production" });
    const navOf = (path: string) => {
      const html = String(result.files.get(path));
      if (!html) throw new Error(`Fixture sin ${path}`);
      const nav = /<nav class="solara-pagination"[\s\S]*?<\/nav>/.exec(html)?.[0];
      if (!nav) throw new Error(`Sin paginación en ${path}`);
      return nav;
    };
    const pageOne = navOf("categorias/casa/index.html");
    const pageFour = navOf("categorias/casa/pagina/4/index.html");
    const pageSeven = navOf("categorias/casa/pagina/7/index.html");

    expect(pageOne).toContain('<span aria-current="page">1</span>');
    expect(pageOne).not.toContain('href="/categorias/casa/">1</a>');
    expect(pageOne).toContain('href="/categorias/casa/pagina/2/">2</a>');
    expect(pageOne).toContain('href="/categorias/casa/pagina/3/">3</a>');
    expect(pageOne).toContain('href="/categorias/casa/pagina/7/">7</a>');
    expect(pageOne).toContain(
      '<span class="solara-pagination__ellipsis" aria-hidden="true">…</span>',
    );
    expect(pageOne).not.toMatch(/<a[^>]*>…<\/a>/);
    expect(pageOne).toContain('rel="next"');
    expect(pageOne).not.toContain('rel="prev"');

    expect(pageFour).toContain('<span aria-current="page">4</span>');
    expect(pageFour).toContain('href="/categorias/casa/">1</a>');
    expect(pageFour).toContain('href="/categorias/casa/pagina/2/">2</a>');
    expect(pageFour).toContain('href="/categorias/casa/pagina/3/">3</a>');
    expect(pageFour).toContain('href="/categorias/casa/pagina/5/">5</a>');
    expect(pageFour).toContain('href="/categorias/casa/pagina/6/">6</a>');
    expect(pageFour).toContain('href="/categorias/casa/pagina/7/">7</a>');
    expect(pageFour).not.toContain("solara-pagination__ellipsis");
    expect(pageFour).toContain('rel="prev"');
    expect(pageFour).toContain('rel="next"');

    expect(pageSeven).toContain('<span aria-current="page">7</span>');
    expect(pageSeven).toContain('href="/categorias/casa/pagina/5/">5</a>');
    expect(pageSeven).toContain('href="/categorias/casa/pagina/6/">6</a>');
    expect(pageSeven).toContain("solara-pagination__ellipsis");
    expect(pageSeven).toContain('rel="prev"');
    expect(pageSeven).not.toContain('rel="next"');
  });

  it("limita la ventana numérica a ±2 con primera, última y elipses", () => {
    const project = structuredClone(catalogScaleStore);
    project.commerceTemplates.category.productsPerPage = 2;
    const html = String(
      exportProject(project, { mode: "production" }).files.get(
        "categorias/casa/pagina/7/index.html",
      ),
    );
    if (!html) throw new Error("Fixture sin página 7 de casa");
    const pageSeven = /<nav class="solara-pagination"[\s\S]*?<\/nav>/.exec(html)?.[0];
    if (!pageSeven) throw new Error("Sin paginación en página 7");

    expect(pageSeven).toContain('<span aria-current="page">7</span>');
    expect(pageSeven).toContain('href="/categorias/casa/">1</a>');
    expect(pageSeven).toContain('href="/categorias/casa/pagina/14/">14</a>');
    for (const page of [5, 6, 8, 9]) {
      expect(pageSeven).toContain(`href="/categorias/casa/pagina/${page}/">${page}</a>`);
    }
    for (const page of [2, 3, 4, 10, 11, 12, 13]) {
      expect(pageSeven).not.toContain(`href="/categorias/casa/pagina/${page}/">${page}</a>`);
    }
    expect(pageSeven.match(/solara-pagination__ellipsis/g)).toHaveLength(2);
    expect(pageSeven).toContain('rel="prev" href="/categorias/casa/pagina/6/"');
    expect(pageSeven).toContain('rel="next" href="/categorias/casa/pagina/8/"');
  });

  it("mantiene la ventana numérica idéntica entre preview y export", () => {
    const project = structuredClone(catalogScaleStore);
    project.commerceTemplates.category.productsPerPage = 4;
    const preview = renderPreviewHtml(project, "draft", "/categorias/casa/pagina/4/");
    const exportedPage = String(
      exportProject(project, { mode: "production" }).files.get(
        "categorias/casa/pagina/4/index.html",
      ),
    );
    const window = (html: string) =>
      /<nav class="solara-pagination"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(window(preview)).toBe(window(exportedPage));
  });
});
