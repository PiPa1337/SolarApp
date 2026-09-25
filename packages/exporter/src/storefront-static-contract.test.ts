import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import { exportProject } from "./index";

function textFile(files: ReadonlyMap<string, string | Uint8Array>, path: string): string {
  const value = files.get(path);
  if (typeof value !== "string") throw new Error(`Falta archivo de texto ${path}`);
  return value;
}

describe("storefront static contracts", () => {
  it("V2 conserva rutas, fallback no-JS y navegación estática del footer", () => {
    const { files } = exportProject(catalogModernV2Store, { mode: "production" });
    const home = textFile(files, "index.html");
    const product = textFile(files, "productos/remera-esencial-de-algodon/index.html");

    for (const path of ["compra/index.html", "envios/index.html", "devoluciones/index.html"]) {
      expect(files.has(path), path).toBe(false);
    }

    expect(product).toContain("Remera esencial de algodón");
    expect(product).toContain('class="catalog-add-fallback"');
    expect(home).toContain("Todos los derechos reservados");
    expect(home).toContain(String(new Date().getFullYear()));
    expect(home).toContain(catalogModernV2Store.identity.brandName);
    expect(home).toContain("Hecho con ❤️ en solara.com.ar");
    expect(home).toContain('href="https://solara.com.ar"');
    expect(home).toContain("https://www.argentina.gob.ar/defensa-del-consumidor");
    expect(home).toContain('href="/buscar/"');
    expect(home).toContain('href="/carrito/"');
    expect(home).toContain("data-open-cart");
    for (const category of catalogModernV2Store.categories.filter(
      (category) => category.status !== "hidden",
    )) {
      expect(home).toContain(`href="/categorias/${category.slug}/"`);
      expect(home).toContain(category.title);
    }
  });

  it("preserva contenido, variantes, navegación y feeds sin depender de JavaScript", () => {
    const { files } = exportProject(referenceStore, { mode: "production" });
    const product = textFile(files, "productos/manta-bruma/index.html");
    const home = textFile(files, "index.html");
    const collection = textFile(files, "colecciones/casa-serena/index.html");
    const shipping = textFile(files, "envios/index.html");
    const sitemap = textFile(files, "sitemap.xml");
    const merchant = textFile(files, "google-merchant.xml");

    expect(product).toContain("Manta Bruma");
    expect(product).toMatch(/Algod/i);
    expect(product.replaceAll("\u00A0", " ")).toContain("$ 78.500,00");
    expect(product).toContain('name="variant"');
    expect(product).toContain('value="variant-manta-piedra"');
    expect(home).toContain('href="/productos/manta-bruma/"');
    expect(collection).toContain("Casa serena");
    expect(shipping).toMatch(/Env[ií]os/i);
    expect(sitemap).toContain("/productos/manta-bruma/");
    expect(merchant).toContain("variant-manta-musgo");
  });

  it("con búsqueda apagada no emite rutas muertas y Ver todos cae en categoría visible", () => {
    const project = structuredClone(catalogModernStore);
    project.commerceTemplates.search.enabled = false;
    project.sections = project.sections.map((section) =>
      section.moduleId === "catalog-product-grid"
        ? { ...section, settings: { ...section.settings, viewAllHref: "/buscar/" } }
        : section,
    );

    const { files } = exportProject(project, { mode: "production" });
    const home = textFile(files, "index.html");
    const product = textFile(files, "productos/remera-esencial-de-algodon/index.html");

    for (const html of [home, product]) {
      expect(html).not.toContain('action="/buscar/"');
      expect(html).not.toContain('href="/buscar/"');
    }
    expect(home).toContain('class="catalog-view-all" href="/categorias/remeras/"');
    expect(textFile(files, "categorias/remeras/index.html")).toContain("Remeras");
  });

  it("si la primera variante está agotada, marca como seleccionada una variante disponible", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find((item) => item.slug === "remera-esencial-de-algodon");
    if (!product) throw new Error("Fixture sin remera esencial");
    const soldOut = product.variants.find((variant) => !variant.available);
    const available = product.variants.find((variant) => variant.available);
    if (!soldOut || !available) throw new Error("Fixture sin variantes de disponibilidad mixta");
    product.variants = [
      soldOut,
      ...product.variants.filter((variant) => variant.id !== soldOut.id),
    ];

    const { files } = exportProject(project, { mode: "production" });
    const html = textFile(files, "productos/remera-esencial-de-algodon/index.html");
    expect(html).toMatch(new RegExp(`<option[^>]*value="${available.id}"[^>]*selected`));
    expect(html).toMatch(new RegExp(`<option[^>]*value="${soldOut.id}"[^>]*disabled`));
  });
});
