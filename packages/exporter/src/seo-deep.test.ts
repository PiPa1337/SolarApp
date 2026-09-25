import { getCategoryProductIds } from "@solara/project-schema";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { describe, expect, it } from "vitest";
import { exportProject } from "./index";

function html(files: Map<string, string | Uint8Array>, path: string): string {
  const v = files.get(path);
  if (!v) throw new Error(`Missing ${path}`);
  return typeof v === "string" ? v : new TextDecoder().decode(v);
}
function canonical(html: string): string | null {
  const m = /<link rel="canonical" href="([^"]*)"/.exec(html);
  return m ? m[1] : null;
}
function robots(html: string): string | null {
  const m = /<meta name="robots" content="([^"]*)"/.exec(html);
  return m ? m[1] : null;
}
function og(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`, "i");
  const m = re.exec(html);
  return m ? m[1] : null;
}
function jsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
    try {
      out.push(JSON.parse(m[1]));
    } catch {}
  return out;
}

describe("seo deep audit", () => {
  it("subcarpeta baseUrl: canonical, og:url, sitemap, JSON-LD, hrefs", () => {
    const s = structuredClone(catalogModernV2Store);
    (s as any).baseUrl = "https://example.com/tienda/";
    const r = exportProject(s, { mode: "production" });
    const home = html(r.files as any, "index.html");
    const cat = s.categories[0];
    const catHtml = html(r.files as any, `categorias/${cat.slug}/index.html`);
    const prod = s.products[0];
    const prodHtml = html(r.files as any, `productos/${prod.slug}/index.html`);
    const sitemap = html(r.files as any, "sitemap.xml");
    for (const h of [home, catHtml, prodHtml]) {
      expect(canonical(h)).toMatch(/^https:\/\/example\.com\/tienda\//);
      expect(og(h, "og:url")).toMatch(/^https:\/\/example\.com\/tienda\//);
    }
    expect(sitemap).toContain("https://example.com/tienda/");
    expect(sitemap).toContain("https://example.com/tienda/categorias/");
    // JSON-LD URLs absolutas con subcarpeta
    const prodLd = jsonLd(prodHtml).find(
      (x: any) => x["@type"] === "Product" || x["@type"] === "ProductGroup",
    );
    const url = prodLd.url || prodLd.hasVariant?.[0]?.offers?.url || "";
    expect(url).toMatch(/^https:\/\/example\.com\/tienda\//);
    // hrefs internos prefijados
    expect(home).toContain('href="/tienda/');
    expect(home).toContain('href="/tienda/categorias/');
  });

  it("draft vs production: robots y sitemap", () => {
    const s = structuredClone(catalogModernV2Store);
    const draft = exportProject(s, { mode: "draft" });
    const prod = exportProject(s, { mode: "production" });
    expect(html(draft.files as any, "index.html")).toContain("noindex,nofollow");
    expect(html(prod.files as any, "index.html")).toContain("index,follow");
    expect(draft.files.has("sitemap.xml")).toBe(false);
    expect(prod.files.has("sitemap.xml")).toBe(true);
    expect(html(draft.files as any, "robots.txt")).toContain("Disallow: /");
    expect(html(prod.files as any, "robots.txt")).toContain("Sitemap: https://");
  });

  it("paginas privadas noindex y no en sitemap: search, cart, checkout, 404", () => {
    const s = structuredClone(catalogModernV2Store);
    const prod = exportProject(s, { mode: "production" });
    const sitemap = html(prod.files as any, "sitemap.xml");
    for (const p of ["buscar/index.html", "carrito/index.html"]) {
      const h = html(prod.files as any, p);
      expect(robots(h)).toBe("noindex,follow");
      expect(sitemap).not.toContain(p.replace("/index.html", "/"));
    }
    // 404 y search no deben estar en sitemap
    expect(prod.files.has("404.html")).toBe(true);
    expect(html(prod.files as any, "404.html")).toContain("noindex,follow");
  });

  it("paginacion: canonical y sitemap para pagina 2", () => {
    const s = structuredClone(catalogModernV2Store);
    s.commerceTemplates.category.productsPerPage = 1;
    const cat = s.categories[0];
    s.products.slice(0, 3).forEach((p) => {
      if (!p.categoryIds.includes(cat.id)) p.categoryIds.push(cat.id);
    });
    (cat as any).productIds = getCategoryProductIds(s, cat.id) as any;
    const r = exportProject(s, { mode: "production" });
    const sitemap = html(r.files as any, "sitemap.xml");
    expect(sitemap).toContain(`/categorias/${cat.slug}/pagina/2/`);
    const page2 = html(r.files as any, `categorias/${cat.slug}/pagina/2/index.html`);
    expect(canonical(page2)).toContain("/pagina/2/");
    expect(robots(page2)).toContain("index,follow");
  });

  it("productos sin precio y agotados: Offer price y availability", () => {
    const s = structuredClone(catalogModernV2Store);
    const p = s.products[0];
    p.variants[0].price = 100; // 1.00, minimo valido
    for (const v of p.variants) (v as any).stockStatus = "out_of_stock";
    const r = exportProject(s, { mode: "production" });
    const h = html(r.files as any, `productos/${p.slug}/index.html`);
    const ld = jsonLd(h).find(
      (x: any) => x["@type"] === "Product" || x["@type"] === "ProductGroup",
    );
    const offers = ld["@type"] === "ProductGroup" ? ld.hasVariant : [ld];
    expect(offers[0].offers.price).toBe("1.00");
    expect(offers[0].offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("title/description escapan & < > y og:image absoluta con alt", () => {
    const s = structuredClone(catalogModernV2Store);
    const home = s.pages.find((p) => p.kind === "home")!;
    home.seoTitle = 'A & B "C" <D>';
    home.seoDescription = 'Desc & <b>"X"</b>';
    s.seo.socialImageId = s.assets[0].id;
    const r = exportProject(s, { mode: "production" });
    const h = html(r.files as any, "index.html");
    expect(h).toContain("<title>A &amp; B &quot;C&quot; &lt;D&gt;</title>");
    expect(og(h, "og:title")).toBe("A &amp; B &quot;C&quot; &lt;D&gt;");
    expect(og(h, "og:description")).toBe("Desc &amp; &lt;b&gt;&quot;X&quot;&lt;/b&gt;");
    expect(og(h, "og:image")).toMatch(/^https:\/\//);
    expect(h).toContain("og:image:alt");
  });

  it("no-JS: search form, paginacion, y contenido visible", () => {
    const s = structuredClone(catalogModernV2Store);
    s.commerceTemplates.category.productsPerPage = 1;
    const cat = s.categories[0];
    s.products.slice(0, 3).forEach((p) => {
      if (!p.categoryIds.includes(cat.id)) p.categoryIds.push(cat.id);
    });
    (cat as any).productIds = getCategoryProductIds(s, cat.id) as any;
    const r = exportProject(s, { mode: "production" });
    const searchHtml = html(r.files as any, "buscar/index.html");
    expect(searchHtml).toContain(
      '<form class="solara-search-form" role="search" action="/buscar/" method="get">',
    );
    const catHtml = html(r.files as any, `categorias/${cat.slug}/index.html`);
    expect(catHtml).toContain('aria-label="Paginaci');
    const prodHtml = html(r.files as any, `productos/${s.products[0].slug}/index.html`);
    expect(prodHtml).toContain("<main");
    expect(prodHtml).toContain("data-variant");
  });

  it("priceFractionDisplay no afecta Offer ni merchant", () => {
    const s = structuredClone(catalogModernV2Store);
    (s as any).priceFractionDisplay = "auto";
    s.products[0].variants[0].price = 100000; // 1000.00
    const r = exportProject(s, { mode: "production" });
    const h = html(r.files as any, `productos/${s.products[0].slug}/index.html`);
    const ld = jsonLd(h).find(
      (x: any) => x["@type"] === "Product" || x["@type"] === "ProductGroup",
    );
    const offer = ld["@type"] === "ProductGroup" ? ld.hasVariant[0].offers : ld.offers;
    expect(offer.price).toBe("1000.00");
    const feed = html(r.files as any, "google-merchant.xml");
    expect(feed).toContain("1000.00");
  });
});
