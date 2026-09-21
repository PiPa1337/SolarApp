import { formatMoneyForProject } from "@solara/module-sdk";
import { StoreProjectV2Schema } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import {
  createProjectArchive,
  exportProject,
  readProjectArchive,
  renderPreviewHtml,
} from "./index";

describe("listado público de productos", () => {
  it.each([referenceStore, catalogModernStore, catalogModernV2Store, catalogScaleStore])(
    "exporta todos los productos activos y acceso desde el footer de $id",
    (project) => {
      const { files } = exportProject(project, { mode: "production" });
      const html = String(files.get("listado/index.html"));
      const active = project.products.filter((product) => product.status === "active");
      expect(html.match(/data-product-list-row/g)).toHaveLength(active.length);
      for (const product of active) {
        expect(html).toContain(`/productos/${product.slug}/`);
      }
      expect(html).not.toContain("data-products-per-page");
      expect(html).toContain("data-product-list-controls hidden");
      expect(html).toContain('<meta name="robots" content="index,follow');
      expect(html).toContain('"@type":"CollectionPage"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(files.get("index.html")).toMatch(/<footer[\s\S]*href="\/listado\/"/);
      expect(files.get("sitemap.xml")).toContain("/listado/");
      expect(files.get("ai-context.json")).toContain("/listado/");
      expect(renderPreviewHtml(project, "draft", "/listado/")).toContain("data-product-list-row");
    },
  );

  it("respeta subrutas, textos históricos, búsqueda apagada y round-trip del respaldo", async () => {
    const old = structuredClone(catalogModernV2Store);
    old.baseUrl = "https://example.com/tienda";
    old.commerceTemplates.search.enabled = false;
    const input = JSON.parse(JSON.stringify(old));
    delete input.publicCopy.productList;
    const project = StoreProjectV2Schema.parse(input);
    expect(project.schemaVersion).toBe(2);
    expect(project.publicCopy.productList.title).toBe("Listado de productos");
    const restored = await readProjectArchive(await createProjectArchive(project));
    expect(restored.publicCopy.productList).toEqual(project.publicCopy.productList);
    const { files } = exportProject(project, { mode: "production" });
    expect(files.has("buscar/index.html")).toBe(false);
    const html = String(files.get("listado/index.html"));
    expect(html).toContain('href="/tienda/listado/"');
    expect(html).toContain('href="https://example.com/tienda/listado/"');
    expect(html).toContain(`href="/tienda/productos/${project.products[0]?.slug}/"`);
  });

  it("usa precios en centavos y Desde sólo si las variantes tienen precios distintos", () => {
    const project = structuredClone(catalogModernV2Store);
    const first = project.products[0];
    if (!first?.variants[0]) throw new Error("Fixture sin variantes");
    project.products.slice(1).forEach((product) => {
      product.status = "hidden";
    });
    first.title = '<Oferta & "especial">';
    const variant = first.variants[0];
    first.variants = [
      { ...variant, price: 129901 },
      { ...variant, id: "variant-list-alt", sku: "LIST-ALT", price: 249950 },
    ];
    let html = String(renderPreviewHtml(project, "draft", "/listado/"));
    expect(html).toContain("&lt;Oferta &amp; &quot;especial&quot;&gt;");
    expect(html).toContain("data-product-list-from");
    expect(html).toContain(formatMoneyForProject(129901, project));
    first.variants.forEach((item) => {
      item.price = 129901;
    });
    html = String(renderPreviewHtml(project, "draft", "/listado/"));
    expect(html).not.toContain("data-product-list-from");
  });

  it("conserva el listado vacío y excluye ocultos y archivados", () => {
    const project = structuredClone(catalogModernV2Store);
    project.products.forEach((product, index) => {
      product.status = index % 2 ? "hidden" : "archived";
    });
    const html = String(renderPreviewHtml(project, "draft", "/listado/"));
    expect(html).not.toContain("data-product-list-row");
    expect(html).toContain(project.publicCopy.empty.products);
    expect(html).toContain('href="/listado/"');
  });
});
