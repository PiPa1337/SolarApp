import { getCategoryProductIds } from "@solara/project-schema";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { describe, expect, it } from "vitest";
import { buildCommerceSnapshot, exportProject } from "./index";

function getHtml(files: Map<string, string | Uint8Array>, path: string): string {
  const v = files.get(path);
  if (!v) throw new Error(`Missing file ${path}`);
  return typeof v === "string" ? v : new TextDecoder().decode(v);
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]*name="${name}"[^>]*content="([^"]*)"`, "i");
  const m = re.exec(html);
  return m ? m[1] : null;
}
function extractOg(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`, "i");
  const m = re.exec(html);
  return m ? m[1] : null;
}
function extractCanonical(html: string): string | null {
  const m = /<link rel="canonical" href="([^"]*)"/.exec(html);
  return m ? m[1] : null;
}
function extractRobots(html: string): string | null {
  return extractMeta(html, "robots");
}
function extractJsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {}
  }
  return out;
}

describe("seo audit", () => {
  it("canonical y og:url y sitemap y JSON-LD coinciden y son absolutas con subcarpeta", () => {
    const store = structuredClone(catalogModernV2Store);
    (store as any).baseUrl = "https://example.com/tienda/";
    const result = exportProject(store, { mode: "production" });
    const homeHtml = getHtml(result.files as any, "index.html");
    const canonical = extractCanonical(homeHtml);
    const ogUrl = extractOg(homeHtml, "og:url");
    const sitemap = getHtml(result.files as any, "sitemap.xml");
    expect(canonical).toBe("https://example.com/tienda/");
    expect(ogUrl).toBe("https://example.com/tienda/");
    expect(sitemap).toContain("<loc>https://example.com/tienda/</loc>");
    const ld = extractJsonLd(homeHtml).find((x: any) => x["@type"] === "WebSite");
    expect(ld).toMatchObject({
      "@type": "WebSite",
      url: "https://example.com/tienda",
    });
  });

  it("robots: draft noindex,nofollow, production index para home y noindex para search/cart", () => {
    const store = structuredClone(catalogModernV2Store);
    const draft = exportProject(store, { mode: "draft" });
    const prod = exportProject(store, { mode: "production" });
    const draftHome = getHtml(draft.files as any, "index.html");
    const prodHome = getHtml(prod.files as any, "index.html");
    const prodSearch = getHtml(prod.files as any, "buscar/index.html");
    const prodCart = getHtml(prod.files as any, "carrito/index.html");
    expect(extractRobots(draftHome)).toBe("noindex,nofollow");
    expect(extractRobots(prodHome)).toContain("index,follow");
    expect(extractRobots(prodSearch)).toBe("noindex,follow");
    expect(extractRobots(prodCart)).toBe("noindex,follow");
    expect(prodHome).toContain('rel="alternate" type="application/rss+xml"');
    expect(prodHome).toContain('href="/feed.xml"');
    expect(prodSearch).not.toContain('type="application/rss+xml"');
    expect(prodCart).not.toContain('type="application/rss+xml"');
    expect(draftHome).not.toContain('type="application/rss+xml"');
    expect(draft.files.has("sitemap.xml")).toBe(false);
    expect(prod.files.has("sitemap.xml")).toBe(true);
    const sitemap = getHtml(prod.files as any, "sitemap.xml");
    expect(sitemap).not.toContain("/buscar/");
    expect(sitemap).not.toContain("/carrito/");
  });

  it("JSON-LD Product/Offer variante y precio no afectado por priceFractionDisplay", () => {
    const store = structuredClone(catalogModernV2Store);
    (store as any).priceFractionDisplay = "auto";
    // producto con variantes y precio con centavos 00 y con centavos
    const prod = store.products[0];
    if (prod) {
      prod.variants[0].price = 150000; // 1500.00 -> con auto debe mostrar 1500 pero Offer debe ser 1500.00
      if (prod.variants[1]) prod.variants[1].price = 150050; // 1500.50
    }
    const result = exportProject(store, { mode: "production" });
    const html = getHtml(result.files as any, `productos/${prod.slug}/index.html`);
    const lds = extractJsonLd(html);
    const pg = lds.find((x: any) => x["@type"] === "ProductGroup" || x["@type"] === "Product");
    expect(pg).toMatchObject({
      "@type": expect.stringMatching(/^(ProductGroup|Product)$/),
    });
    const offers = pg["@type"] === "ProductGroup" ? pg.hasVariant : [pg];
    expect(offers.length).toBeGreaterThan(0);
    // Offer price debe ser toFixed(2) siempre
    for (const o of offers) {
      expect(o.offers.price).toMatch(/^\d+\.\d{2}$/);
      expect(o.offers.priceCurrency).toBe(store.currency);
      expect(o.offers.availability).toMatch(/InStock|OutOfStock|PreOrder/);
    }
    // No modificar machine-readable por visual: buscar 1500.00 en feed
    const feed = getHtml(result.files as any, "google-merchant.xml");
    expect(feed).toContain("1500.00");
  });

  it("productos agotados y variantes preorden: availability correcta", () => {
    const store = structuredClone(catalogModernV2Store);
    const p = store.products[0];
    for (const v of p.variants) (v as any).stockStatus = "out_of_stock";
    if (p.variants[0]) {
      (p.variants[0] as any).stockStatus = "preorder";
      (p.variants[0] as any).availabilityDate = new Date().toISOString();
    }
    const result = exportProject(store, { mode: "production" });
    const html = getHtml(result.files as any, `productos/${p.slug}/index.html`);
    const lds = extractJsonLd(html);
    const pg = lds.find((x: any) => x["@type"] === "ProductGroup" || x["@type"] === "Product");
    const offers = pg["@type"] === "ProductGroup" ? pg.hasVariant : [pg];
    const avails = offers.map((o: any) => o.offers.availability);
    expect(avails).toContain("https://schema.org/OutOfStock");
    expect(avails).toContain("https://schema.org/PreOrder");
    // HTML visible debe contener precio pero no debe contradecir JSON-LD
    expect(html).toContain("data-variant");
  });

  it("categorias padre/hija y paginacion: canonical y sitemap", () => {
    const store = structuredClone(catalogModernV2Store);
    store.commerceTemplates.category.productsPerPage = 1;
    // asegurar al menos 3 productos en una categoria
    const cat = store.categories[0];
    store.products.slice(0, 3).forEach((prod) => {
      if (!prod.categoryIds.includes(cat.id)) prod.categoryIds.push(cat.id);
    });
    cat.productIds = getCategoryProductIds(store, cat.id) as any;
    const result = exportProject(store, { mode: "production" });
    const sitemap = getHtml(result.files as any, "sitemap.xml");
    expect(sitemap).toContain(`/categorias/${cat.slug}/`);
    expect(sitemap).toContain(`/categorias/${cat.slug}/pagina/2/`);
    const page2Html = getHtml(result.files as any, `categorias/${cat.slug}/pagina/2/index.html`);
    expect(extractCanonical(page2Html)).toBe(
      `${store.baseUrl.replace(/\/+$/, "")}/categorias/${cat.slug}/pagina/2/`,
    );
    expect(extractRobots(page2Html)).toContain("index,follow");
  });

  it("sitemap no incluye duplicados y es absoluta", () => {
    const store = structuredClone(catalogModernV2Store);
    const result = exportProject(store, { mode: "production" });
    const sitemap = getHtml(result.files as any, "sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    for (const loc of locs) expect(loc).toMatch(/^https:\/\//);
  });

  it("sitemap usa la fecha propia de cada producto y no emite captions obsoletos", () => {
    const store = structuredClone(catalogModernV2Store);
    const product = store.products[0];
    product.createdAt = "2024-01-01T12:00:00.000Z";
    product.updatedAt = "2024-05-06T12:00:00.000Z";
    store.updatedAt = "2026-08-31T12:00:00.000Z";

    const result = exportProject(store, { mode: "production" });
    const sitemap = getHtml(result.files as any, "sitemap.xml");
    const productLoc = `<loc>${store.baseUrl.replace(/\/+$/, "")}/productos/${product.slug}/</loc>`;
    const productStart = sitemap.indexOf(productLoc);
    expect(productStart).toBeGreaterThanOrEqual(0);
    expect(sitemap.slice(productStart, sitemap.indexOf("</url>", productStart))).toContain(
      "<lastmod>2024-05-06</lastmod>",
    );
    expect(sitemap).toContain(`<loc>${store.baseUrl.replace(/\/+$/, "")}/</loc>`);
    expect(getHtml(result.files as any, "image-sitemap.xml")).not.toContain("<image:caption>");
  });

  it("mantiene las imágenes del sitemap principal dentro del image-sitemap", () => {
    const store = structuredClone(catalogModernV2Store);
    const result = exportProject(store, { mode: "production" });
    const sitemap = getHtml(result.files as any, "sitemap.xml");
    const imageSitemap = getHtml(result.files as any, "image-sitemap.xml");

    for (const block of sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)) {
      const pageLoc = /<loc>([^<]+)<\/loc>/.exec(block[0] ?? "")?.[1];
      const imageLoc = /<image:loc>([^<]+)<\/image:loc>/.exec(block[0] ?? "")?.[1];
      if (!pageLoc || !imageLoc) continue;
      expect(imageSitemap).toContain(`<loc>${pageLoc}</loc>`);
      expect(imageSitemap).toContain(`<image:loc>${imageLoc}</image:loc>`);
    }
  });

  it("title/description/og:image y alt y no-JS", () => {
    const store = structuredClone(catalogModernV2Store);
    const homePage = store.pages.find((p) => p.kind === "home");
    if (homePage) {
      homePage.seoTitle = 'Tienda & "Especial" <Test>';
      homePage.seoDescription = 'Desc & <b>con "quotes"</b>';
    }
    store.seo.title = 'Tienda & "Especial" <Test>';
    store.seo.description = 'Desc & <b>con "quotes"</b>';
    store.seo.socialImageId = store.assets[0].id;
    const result = exportProject(store, { mode: "production" });
    const homeHtml = getHtml(result.files as any, "index.html");
    expect(homeHtml).toContain("<title>Tienda &amp; &quot;Especial&quot; &lt;Test&gt;</title>");
    expect(extractOg(homeHtml, "og:title")).toBe(
      "Tienda &amp; &quot;Especial&quot; &lt;Test&gt;",
    );
    expect(extractOg(homeHtml, "og:description")).toBe(
      "Desc &amp; &lt;b&gt;con &quot;quotes&quot;&lt;/b&gt;",
    );
    expect(extractOg(homeHtml, "og:image")).toMatch(/^https:\/\//);
    expect(homeHtml).toContain("og:image:alt");
    // no-JS: debe tener contenido visible sin JS
    expect(homeHtml).toContain("<main");
    expect(homeHtml).not.toContain("javascript:void");
  });

  it("Organization y BreadcrumbList presentes", () => {
    const store = structuredClone(catalogModernV2Store);
    const result = exportProject(store, { mode: "production" });
    const homeHtml = getHtml(result.files as any, "index.html");
    const lds = extractJsonLd(homeHtml);
    expect(
      lds.some((x: any) => x["@type"] === "Organization" || x["@type"] === "OnlineStore"),
    ).toBe(true);
    const prod = store.products[0];
    const prodHtml = getHtml(result.files as any, `productos/${prod.slug}/index.html`);
    const prodLds = extractJsonLd(prodHtml);
    expect(prodLds.some((x: any) => x["@type"] === "BreadcrumbList")).toBe(true);
  });

  it("variantes: variantPath vs canonicalPath", () => {
    const store = structuredClone(catalogModernV2Store);
    const snap = buildCommerceSnapshot(store);
    const offer = snap.offers[0];
    expect(offer.variantPath).toContain("?variant=");
    expect(offer.canonicalPath).not.toContain("?variant=");
    const result = exportProject(store, { mode: "production" });
    const html = getHtml(result.files as any, `productos/${store.products[0].slug}/index.html`);
    const lds = extractJsonLd(html);
    const pg = lds.find((x: any) => x["@type"] === "ProductGroup" || x["@type"] === "Product");
    const firstOffer = pg["@type"] === "ProductGroup" ? pg.hasVariant[0].offers : pg.offers;
    expect(firstOffer.url).toContain("?variant=");
  });
});
