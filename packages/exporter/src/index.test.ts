import { CATALOG_MODERN_PLACEHOLDER_PHONE, isValidIco } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import type { DeploymentManifestV1 } from "./index";
import {
  auditProject,
  buildCommerceSnapshot,
  collectSocialCropRequests,
  createProjectArchive,
  createPublicExportManifest,
  exportProject,
  getPreviewAssetSources,
  minifyCss,
  readProjectArchive,
  renderPreviewHtml,
} from "./index";
import { buildFaviconIco, buildLlmsFullTxt, sha256Hex } from "./pwa";
import { encodePngRgba } from "./pwa-png";

const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const VALID_JPEG_DATA_URL = "data:image/jpeg;base64,/9j/2Q==";
const VALID_WEBP_DATA_URL = "data:image/webp;base64,UklGRgAAAABXRUJQ";
const VALID_AVIF_DATA_URL = "data:image/avif;base64,AAAAFGZ0eXBhdmlmAAAAAGF2aWY=";

function onlineStoreJsonLd(homeHtml: string): Record<string, unknown> {
  for (const script of homeHtml.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    const data = JSON.parse(script[1] ?? "{}") as Record<string, unknown>;
    if (data["@type"] === "OnlineStore") return data;
  }
  throw new Error("Falta el bloque JSON-LD OnlineStore.");
}

function homeMetaDescription(homeHtml: string): string {
  return /<meta name="description" content="([^"]*)"/.exec(homeHtml)?.[1] ?? "";
}

function runtimeAsset(files: ReadonlyMap<string, string | Uint8Array>, kind: "css" | "js"): string {
  const path = [...files.keys()].find((candidate) =>
    new RegExp(`^assets/storefront\\.[a-f0-9]+\\.${kind}$`, "i").test(candidate),
  );
  if (!path) throw new Error(`Falta runtime ${kind} hasheado`);
  return String(files.get(path));
}

describe("exporter", () => {
  it("incluye archivos de recuperación permitidos y los excluye del rastreo", () => {
    const dir = `solara-recovery/${"a".repeat(64)}`;
    const result = exportProject(referenceStore, {
      mode: "production",
      recoveryFiles: new Map([
        [`${dir}/manifest.json`, '{"format":"solara-recovery","version":1}'],
        [`${dir}/slim.json.gz`, new Uint8Array([31, 139, 8])],
        [`${dir}/assets.json`, "[]"],
      ]),
    });

    expect(result.files.has(`${dir}/manifest.json`)).toBe(true);
    expect(result.files.get("robots.txt")).toContain("Disallow: /solara-recovery/");
    expect(result.files.get("_headers")).toContain("solara-recovery/*");
    expect(result.files.get("_headers")).toContain("Access-Control-Allow-Origin: *");
    expect(result.files.get("sitemap.xml")).not.toContain("solara-recovery");
  });

  it("calcula SHA-256 de forma portable en browser y Node", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("emite el acento alternativo del tema y deriva uno para proyectos antiguos", () => {
    const themed = structuredClone(catalogModernV2Store);
    themed.theme.colors.accentAlt = "#123456";
    const themedCss = runtimeAsset(exportProject(themed, { mode: "production" }).files, "css");

    expect(themedCss).toContain("--solara-accent-alt:#123456");
    expect(themedCss).toContain("var(--solara-accent-alt");

    const legacy = structuredClone(catalogModernV2Store);
    delete legacy.theme.colors.accentAlt;
    const legacyCss = runtimeAsset(exportProject(legacy, { mode: "production" }).files, "css");

    expect(legacyCss).toContain("--solara-accent-alt:color-mix(in srgb,#a63d2f 68%,#f7f5f0)");
  });

  it("deriva la sombra del hero desde la paleta y sólo la aplica en su copy mobile", () => {
    const project = structuredClone(catalogModernV2Store);
    project.theme.colors.text = "#202020";
    project.theme.colors.background = "#f7f5f0";
    project.theme.colors.accentAlt = "#ffffff";
    Object.assign(project.theme, { shadows: { text: { enabled: true, opacity: 0.65 } } });
    const css = runtimeAsset(exportProject(project, { mode: "production" }).files, "css");

    expect(css).toContain("--solara-text-shadow:#ffffff");
    expect(css).toContain(
      "--solara-hero-text-shadow:1px 1px 0px color-mix(in srgb,var(--solara-text-shadow) 65%,transparent)",
    );
    expect(css).toContain(
      "--solara-hero-text-shadow-v2:1px 1px 0px color-mix(in srgb,#202020 65%,transparent)",
    );
    expect(css).toContain(
      '[data-solara-store][data-page-type="home"] [data-solara-module="catalog-hero"] .catalog-hero-copy .catalog-eyebrow,',
    );
    expect(css).toContain("text-shadow:var(--solara-hero-text-shadow,none)");
    expect(css).not.toContain(".catalog-hero-actions{text-shadow");
    expect(css).not.toContain("@media(max-width:767px){body{text-shadow:");
  });

  it("permite apagar la sombra del hero sin dejar una regla residual", () => {
    const project = structuredClone(catalogModernV2Store);
    Object.assign(project.theme, { shadows: { text: { enabled: false, opacity: 0.65 } } });
    const css = runtimeAsset(exportProject(project, { mode: "production" }).files, "css");

    expect(css).toContain("--solara-hero-text-shadow:none");
  });

  it("transporta las cuatro direcciones, desenfoque e intensidad sin reemplazar el color del tema", () => {
    const project = structuredClone(catalogModernV2Store);
    Object.assign(project.theme, {
      shadows: {
        text: {
          enabled: true,
          opacity: 0.4,
          offsetTop: 8,
          offsetRight: 4,
          offsetBottom: 14,
          offsetLeft: 6,
          blur: 6,
        },
      },
    });
    const css = runtimeAsset(exportProject(project, { mode: "production" }).files, "css");

    expect(css).toContain(
      "--solara-hero-text-shadow-v2:0px -8px 6px color-mix(in srgb,#11110f 40%,transparent),4px 0px 6px color-mix(in srgb,#11110f 40%,transparent),0px 14px 6px color-mix(in srgb,#11110f 40%,transparent),-6px 0px 6px color-mix(in srgb,#11110f 40%,transparent)",
    );
  });

  it("transporta el copy global personalizado a preview y exportación", () => {
    const project = structuredClone(catalogModernV2Store);
    project.publicCopy.navigation.cart = "Bolsa";
    project.publicCopy.search.title = "Encontrar productos";
    project.publicCopy.contact.javascriptFallback = "Usá email o WhatsApp para consultarnos.";
    project.publicCopy.checkout.verificationWarning = "La tienda debe confirmar el pedido.";
    project.publicCopy.cart.phoneInvalid = "Revisá el teléfono de contacto.";

    const preview = renderPreviewHtml(project, "draft", "/");
    const exported = String(exportProject(project, { mode: "draft" }).files.get("index.html"));

    expect(preview).toContain("Bolsa");
    expect(exported).toContain("Bolsa");
    expect(exported).toContain("data-solara-copy=");
    expect(exported).toContain("Encontrar productos");
    expect(exported).toContain("Usá email o WhatsApp para consultarnos.");
    expect(exported).toContain("La tienda debe confirmar el pedido.");
    expect(exported).toContain('title="Revisá el teléfono de contacto."');
  });

  it("transporta la advertencia y validación telefónica custom al runtime de carrito", () => {
    const project = structuredClone(catalogModernV2Store);
    project.publicCopy.checkout.verificationWarning = "Pedido sujeto a confirmación manual.";
    project.publicCopy.cart.phoneInvalid = "Indicá un teléfono con código de área.";

    const cart = String(exportProject(project, { mode: "draft" }).files.get("carrito/index.html"));
    expect(cart).toContain("Pedido sujeto a confirmación manual.");
    expect(cart).toContain("Indicá un teléfono con código de área.");
    expect(cart).toContain("data-solara-copy=");
  });

  it("usa el copy global en políticas y recuperación 404", () => {
    const project = structuredClone(catalogModernStore);
    project.publicCopy.pages.notFoundTitle = "Esta dirección no existe";
    project.publicCopy.export.policyQuestionsTitle = "¿Necesitás ayuda?";

    const result = exportProject(project, { mode: "production" });
    const privacy = String(result.files.get("privacidad/index.html"));
    const notFound = String(result.files.get("404.html"));

    expect(privacy).toContain("¿Necesitás ayuda?");
    expect(notFound).toContain("Esta dirección no existe");
  });

  it("no publica páginas independientes de Compra, Nosotros ni Contacto", () => {
    const result = exportProject(catalogModernV2Store, { mode: "production" });
    expect(result.files.has("compra/index.html")).toBe(false);
    expect(result.files.has("nosotros/index.html")).toBe(false);
    expect(result.files.has("contacto/index.html")).toBe(false);
    expect(renderPreviewHtml(catalogModernV2Store, "draft", "/compra/")).toContain(
      "No encontramos esa página",
    );
    expect(renderPreviewHtml(catalogModernV2Store, "draft", "/nosotros/")).toContain(
      "No encontramos esa página",
    );
    expect(renderPreviewHtml(catalogModernV2Store, "draft", "/contacto/")).toContain(
      "No encontramos esa página",
    );
  });

  it("coloca el botón de arrepentimiento dentro del footer sólo en production", () => {
    for (const project of [catalogModernV2Store, referenceStore]) {
      const productionHome = String(
        exportProject(project, { mode: "production" }).files.get("index.html"),
      );
      const footerStart = productionHome.indexOf("<footer");
      const footerEnd = productionHome.indexOf("</footer>", footerStart);
      const consumerRightsStart = productionHome.indexOf('class="solara-consumer-rights"');
      const footer = productionHome.slice(footerStart, footerEnd);

      expect(footerStart).toBeGreaterThanOrEqual(0);
      expect(footerEnd).toBeGreaterThan(footerStart);
      expect(consumerRightsStart).toBeGreaterThan(footerStart);
      expect(consumerRightsStart).toBeLessThan(footerEnd);
      expect(footer).toContain('class="solara-consumer-rights"');
      expect(footer).toContain("https://www.argentina.gob.ar/defensa-del-consumidor");

      const draftHome = String(exportProject(project, { mode: "draft" }).files.get("index.html"));
      expect(draftHome).not.toContain("solara-consumer-rights");

      for (const legalPath of ["privacidad/index.html", "terminos/index.html"]) {
        const legalPage = String(
          exportProject(project, { mode: "production" }).files.get(legalPath),
        );
        expect(legalPage).not.toContain("solara-consumer-rights");
      }
    }
  });

  it("usa el mismo renderer del contacto final de Home en preview y exportación", () => {
    const project = structuredClone(catalogModernV2Store);
    const contact = project.sections.find((section) => section.moduleId === "contact-form");
    if (!contact) throw new Error("Fixture sin formulario de contacto en Home");
    contact.settings = { ...contact.settings, title: "Preview Escribinos" };
    const preview = renderPreviewHtml(project, "draft", "/");
    const exportedHome = String(exportProject(project, { mode: "draft" }).files.get("index.html"));
    expect(preview).toContain("Preview Escribinos");
    expect(exportedHome).toContain("Preview Escribinos");
  });

  it("minifyCss conserva los espacios de + en calc (válido) y compacta el resto", () => {
    const input = `/* comentario */\n.a { width: calc(100% + 2rem); gap: 1rem  2rem; }\n.a > .b { color: red; }`;
    const out = minifyCss(input);
    expect(out).not.toContain("/*");
    expect(out).toContain("calc(100% + 2rem)");
    expect(out).not.toContain("1rem  2rem");
    expect(out).toContain(".a>.b");
    expect(out).not.toContain("; }");
    // round() con min() anidado sigue siendo válido tras minificar
    const math = minifyCss(".m { width: calc(min(90svh * 9 / 16, 45vw) + 2px); }");
    expect(math).toContain("min(90svh * 9 / 16,45vw) + 2px");
  });

  it("crea páginas estáticas y un feed consistente", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const productHtml = String(result.files.get("productos/manta-bruma/index.html"));
    const feed = String(result.files.get("google-merchant.xml"));

    expect(productHtml).toContain("Manta Bruma");
    expect(productHtml).toContain("78500.00");
    expect(productHtml).toContain('"@type":"ProductGroup"');
    expect(feed.match(/<item>/g)).toHaveLength(3);
    expect(feed).toContain("<g:price>78500.00 ARS</g:price>");
    expect(result.files.has("ai-context.json")).toBe(true);
    expect(result.files.has("llms.txt")).toBe(true);
    expect(result.optimization.aiReadiness.structuredDataSource).toBe("shared-snapshot");
    expect(productHtml).toContain('href="/ai-context.json"');
  });

  it("emite llms-full con URLs normalizadas e información comercial completa", () => {
    const project = structuredClone(referenceStore);
    project.baseUrl = `${project.baseUrl.replace(/\/+$/, "")}/`;
    const result = exportProject(project, { mode: "production" });
    const full = String(result.files.get("llms-full.txt"));

    expect(full).toContain("## Categorías");
    expect(full).toContain("## Contacto");
    expect(full).toContain(`Última actualización: ${project.updatedAt}`);
    expect(full).toContain(`- Email: ${project.identity.email}`);
    expect(full).not.toMatch(/https?:\/\/[^/]+\/\/productos\//);
    expect(full).toContain(`- URL: ${project.baseUrl.replace(/\/+$/, "")}/productos/manta-bruma/`);
    const urls = [
      ...full.matchAll(/\]\((https?:\/\/[^)]+)\)/g),
      ...full.matchAll(/^- URL: (https?:\/\/\S+)$/gm),
    ].map((match) => match[1]);
    expect(new Set(urls).size).toBe(urls.length);
    expect(full.match(/^### /gm) ?? []).toHaveLength(
      project.products.filter((product) => product.status === "active").length,
    );
  });

  it("representa cada variante en llms-full sin reducir el catálogo a la primera", () => {
    const project = structuredClone(referenceStore);
    const product = project.products[0];
    const variant = product?.variants[0];
    if (!product || !variant) throw new Error("Fixture sin variante");
    product.variants.push({
      ...variant,
      id: `${variant.id}-alternativa` as typeof variant.id,
      sku: "SKU-ALTERNATIVA",
      title: "Alternativa",
      price: variant.price + 100,
      available: false,
      stockStatus: "out_of_stock",
    });

    const full = buildLlmsFullTxt(project);

    expect(full).toContain("- Precio: desde ");
    expect(full).toContain("- Variantes:");
    expect(full).toContain("Alternativa");
    expect(full).toContain("SKU: SKU-ALTERNATIVA");
    expect(full).toContain("sin stock");
  });

  it("genera un RSS completo, estable y autodetectable para productos activos", () => {
    const project = structuredClone(catalogScaleStore);
    project.baseUrl = "https://example.test/tienda/";
    const product = project.products.find((candidate) => candidate.status === "active");
    if (!product) throw new Error("Fixture sin productos activos");
    product.createdAt = "2024-01-01T12:00:00.000Z";
    product.updatedAt = "2024-05-06T12:00:00.000Z";
    project.updatedAt = "2026-08-31T12:00:00.000Z";

    const result = exportProject(project, { mode: "production", publicAiContext: false });
    const feed = String(result.files.get("feed.xml"));
    const home = String(result.files.get("index.html"));
    const activeProducts = project.products.filter((candidate) => candidate.status === "active");

    expect(feed.match(/<item>/g) ?? []).toHaveLength(activeProducts.length);
    expect(feed).toContain(`<guid isPermaLink="false">${product.id}</guid>`);
    expect(feed).toContain(`<pubDate>${new Date(product.updatedAt).toUTCString()}</pubDate>`);
    expect(feed).toContain(
      '<atom:link href="https://example.test/tienda/feed.xml" rel="self" type="application/rss+xml" />',
    );
    expect(home).toContain('type="application/rss+xml"');
    expect(home).toContain('href="/tienda/feed.xml"');
  });

  it("emite runtime hasheado y deployment-manifest v1 sin archivos privados", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const manifest = JSON.parse(String(result.files.get("deployment-manifest.json"))) as {
      version: number;
      mode: string;
      runtime: { css: string; js: string };
      essentialFileHashes: Record<string, string>;
    };
    expect(manifest.version).toBe(1);
    expect(manifest.mode).toBe("production");
    expect(manifest.runtime.css).toMatch(/^\/assets\/storefront\.[a-f0-9]+\.css$/);
    expect(manifest.runtime.js).toMatch(/^\/assets\/storefront\.[a-f0-9]+\.js$/);
    expect(result.files.has(manifest.runtime.css.slice(1))).toBe(true);
    expect(result.files.has(manifest.runtime.js.slice(1))).toBe(true);
    expect([...result.files.keys()].some((path) => path.includes(".solara.json"))).toBe(false);
    expect([...result.files.keys()].some((path) => path.startsWith("proyectos/"))).toBe(false);
    expect(manifest.essentialFileHashes["sw.js"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("cambia las URLs de runtime cuando cambia el CSS", () => {
    const baseline = exportProject(referenceStore, { mode: "production" });
    const changed = structuredClone(referenceStore);
    changed.theme.colors.accent = "#123456";
    const baseManifest = JSON.parse(
      String(baseline.files.get("deployment-manifest.json")),
    ) as DeploymentManifestV1;
    const changedManifest = JSON.parse(
      String(exportProject(changed, { mode: "production" }).files.get("deployment-manifest.json")),
    ) as DeploymentManifestV1;
    expect(changedManifest.runtime.css).not.toBe(baseManifest.runtime.css);
    expect(changedManifest.runtime.js).toBe(baseManifest.runtime.js);
  });

  it("emite una sola CSS pública cuando la home comparte bytes con el resto del sitio", () => {
    const result = exportProject(catalogModernStore, { mode: "production" });
    const cssPaths = [...result.files.keys()].filter((path) =>
      /^assets\/storefront[^/]*\.css$/.test(path),
    );
    expect(cssPaths).toHaveLength(1);

    const home = String(result.files.get("index.html"));
    const categoryPath = [...result.files.keys()].find((path) =>
      /^categorias\/[^/]+\/index\.html$/.test(path),
    );
    if (!categoryPath) throw new Error("Fixture sin página de categoría");
    const category = String(result.files.get(categoryPath));
    const homeHref = /<link rel="stylesheet" href="([^"]+)"/.exec(home)?.[1];
    const categoryHref = /<link rel="stylesheet" href="([^"]+)"/.exec(category)?.[1];
    expect(homeHref).toMatch(/^\/assets\/storefront\.[a-f0-9]+\.css$/);
    expect(categoryHref).toBe(homeHref);
  });

  it("mantiene PWA y precache bajo la subcarpeta con versión basada en contenido", () => {
    const project = { ...referenceStore, baseUrl: "https://example.test/tienda/" };
    const result = exportProject(project, { mode: "production" });
    const webManifest = JSON.parse(String(result.files.get("manifest.webmanifest"))) as {
      start_url: string;
      icons: Array<{ src: string }>;
    };
    const sw = String(result.files.get("sw.js"));
    expect(webManifest.start_url).toBe("/tienda/");
    expect(webManifest.icons.every((icon) => icon.src.startsWith("/tienda/"))).toBe(true);
    expect(sw).toContain("/tienda/");
    expect(sw).toContain("/tienda/assets/storefront.");
    expect(sw).toContain("caches.open(CACHE_NAME)");
    expect(sw).not.toContain("caches.match(");
  });

  it("usa un snapshot comercial para HTML, variantes, sitemap y feed", () => {
    const snapshot = buildCommerceSnapshot(referenceStore);
    const result = exportProject(referenceStore, { mode: "production" });
    const productHtml = String(result.files.get("productos/manta-bruma/index.html"));
    const collectionHtml = String(result.files.get("colecciones/casa-serena/index.html"));
    const sitemap = String(result.files.get("sitemap.xml"));
    const imageSitemap = String(result.files.get("image-sitemap.xml"));
    const feed = String(result.files.get("google-merchant.xml"));

    expect(snapshot.offers).toHaveLength(3);
    expect(new Set(snapshot.offers.map((offer) => offer.variantId)).size).toBe(3);
    expect(snapshot.offers[0]?.variantPath).toBe(
      "/productos/manta-bruma/?variant=variant-manta-musgo",
    );
    expect(productHtml).toContain("https://tienda-referencia.example/assets/fixture-manta.webp");
    expect(productHtml).toContain("https://schema.org/color");
    expect(collectionHtml).toContain("Casa serena");
    expect(sitemap).toContain("https://tienda-referencia.example/colecciones/casa-serena/");
    expect(sitemap).toContain("https://tienda-referencia.example/envios/");
    expect(imageSitemap).toContain("https://tienda-referencia.example/assets/fixture-manta.webp");
    expect(feed).toContain(
      "<g:image_link>https://tienda-referencia.example/assets/fixture-manta.webp</g:image_link>",
    );
    expect(feed).toContain("<g:mpn>JD-12-CRU</g:mpn>");
    const noIdentifierProject = {
      ...referenceStore,
      products: referenceStore.products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => ({
          ...variant,
          gtin: undefined,
          mpn: undefined,
        })),
      })),
    };
    const noIdentifierFeed = String(
      exportProject(noIdentifierProject, { mode: "production" }).files.get("google-merchant.xml"),
    );
    expect(noIdentifierFeed).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  it("mantiene contenido y SEO en el HTML inicial", () => {
    const preview = renderPreviewHtml(referenceStore);
    const css = String(runtimeAsset(exportProject(referenceStore, { mode: "draft" }).files, "css"));
    expect(preview).toContain("Una casa con materia y calma.");
    expect(preview).toContain('<meta name="description"');
    expect(preview).toContain('<script type="application/ld+json">');
    expect(preview).not.toContain("data-solara-dark-toggle");
    expect(css).not.toContain(".solara-dark-toggle");
    expect(css).not.toContain("color-scheme: light dark");
    expect(css).not.toContain("data-color-mode");
    expect(css).not.toContain("color-scheme:dark");
    expect(css).toContain(":root{color-scheme:light");
  });

  it("no emite el css dark muerto por la decision f4", () => {
    const production = exportProject(referenceStore, { mode: "production" });
    const css = runtimeAsset(production.files, "css");
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toContain('data-color-mode="dark"');
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
    expect(css).not.toMatch(/\{\s*\}/);
    const home = String(
      exportProject(catalogModernStore, { mode: "production" }).files.get("index.html"),
    );
    expect(home).not.toContain("data-color-mode");
    expect(home).not.toContain("data-theme");
  });

  it("usa el mismo árbol semántico de módulos en preview y home exportado", () => {
    const preview = renderPreviewHtml(referenceStore);
    const exported = String(
      exportProject(referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    const moduleTree = (html: string) =>
      [...html.matchAll(/data-solara-module="([^"]+)"/g)].map((match) => match[1]);

    expect(moduleTree(preview)).toEqual(moduleTree(exported));
  });

  it("incluye estilos una sola vez y excluye assets de módulos deshabilitados", () => {
    const source = referenceStore.sections.find((section) => section.moduleId === "trust-strip");
    if (!source) throw new Error("Fixture incompleto");
    const project = {
      ...referenceStore,
      sections: [
        ...referenceStore.sections,
        { ...source, id: "section-trust-copy", enabled: true },
        {
          ...source,
          id: "section-disabled-content",
          slot: "content",
          moduleId: "editorial-hero",
          enabled: false,
        },
      ],
    };
    const result = exportProject(project as typeof referenceStore, { mode: "draft" });
    const baseline = exportProject(referenceStore, { mode: "draft" });
    const css = runtimeAsset(result.files, "css");
    const html = String(result.files.get("index.html"));

    expect(css).toBe(runtimeAsset(baseline.files, "css"));
    expect(html).not.toContain('data-solara-module="editorial-hero"');
    expect(
      [...result.files.keys()].filter((path) => /^assets\/storefront\.[a-f0-9]+\.js$/i.test(path)),
    ).toHaveLength(1);
  });

  it("deduplica el bloque catalog-modern por style key en la exportación", () => {
    const css = String(
      runtimeAsset(exportProject(catalogModernStore, { mode: "production" }).files, "css"),
    );
    const distinctive = "catalog-modern .catalog-product-card h3 a:hover";

    expect(css.split(distinctive).length - 1).toBe(1);
    expect(new Blob([css]).size).toBeLessThan(300_000);
  });

  it("incluye la foundation V2 sólo en proyectos catalog-modern-v2", () => {
    const v1Result = exportProject(catalogModernStore, { mode: "production" });
    const v2Result = exportProject(catalogModernV2Store, { mode: "production" });
    const v1Css = runtimeAsset(v1Result.files, "css");
    const v2Css = runtimeAsset(v2Result.files, "css");
    const v1Home = String(v1Result.files.get("index.html"));
    const v2Home = String(v2Result.files.get("index.html"));

    expect(v2Css).toContain(".cm.v2 .catalog-hero-inner");
    expect(v2Css).toContain("--catalog-v2-motion-editorial");
    expect(v2Css).toContain("prefers-reduced-motion:reduce");
    expect(v2Home).toContain("catalog-modern-v2 cm v2");
    expect(v1Css).not.toContain("--catalog-v2-motion-editorial");
    expect(v1Home).not.toContain("catalog-modern-v2 cm v2");
    expect(v1Css).not.toContain("catalog-hero-video{display:none}");
  });

  it("publica sólo las políticas vigentes y recuperación 404 V2", () => {
    const result = exportProject(catalogModernV2Store, { mode: "production" });
    const privacy = String(result.files.get("privacidad/index.html"));
    const terms = String(result.files.get("terminos/index.html"));
    const notFound = String(result.files.get("404.html"));

    expect(result.files.has("envios/index.html")).toBe(false);
    expect(result.files.has("devoluciones/index.html")).toBe(false);
    expect(result.files.has("compra/index.html")).toBe(false);
    expect(privacy).toContain(catalogModernV2Store.policies.privacy);
    expect(terms).toContain(catalogModernV2Store.policies.terms);
    expect(notFound).toContain('class="solara-error-code" aria-hidden="true">404');
    expect(notFound).toContain("Volver al inicio");
    // F-11: el CTA de novedades conserva en páginas legales pero no en 404.
    expect(privacy).toContain("catalog-newsletter-inner");
    expect(notFound).not.toContain("catalog-newsletter-inner");
  });

  it("rechaza proyectos inválidos con una ruta accionable en cada límite público", () => {
    const invalid = { ...referenceStore, baseUrl: "no-es-una-url" };

    expect(() => exportProject(invalid as typeof referenceStore, { mode: "draft" })).toThrow(
      /exportar.*baseUrl/i,
    );
    expect(() => renderPreviewHtml(invalid as typeof referenceStore)).toThrow(
      /vista previa.*baseUrl/i,
    );
    expect(() => createProjectArchive(invalid as typeof referenceStore)).toThrow(
      /archivo del proyecto.*baseUrl/i,
    );
  });

  it("envuelve errores internos de generación con contexto de fase accionable", () => {
    const broken = structuredClone(referenceStore);
    const section = broken.sections.find((candidate) => candidate.moduleId === "hero-media");
    if (!section) throw new Error("Fixture incompleto");
    section.moduleId = "modulo-inexistente";

    expect(() => exportProject(broken as typeof referenceStore, { mode: "draft" })).toThrow(
      /generación del sitio falló.*Módulo desconocido: modulo-inexistente/s,
    );
    expect(() => renderPreviewHtml(broken as typeof referenceStore)).toThrow(
      /generación del sitio falló.*Módulo desconocido: modulo-inexistente/s,
    );
  });

  it("excluye feed y agrega noindex en borrador", () => {
    const result = exportProject(referenceStore, { mode: "draft" });
    expect(result.files.has("google-merchant.xml")).toBe(false);
    expect(result.files.has("feed.xml")).toBe(false);
    expect(result.files.has("sitemap.xml")).toBe(false);
    expect(result.files.get("robots.txt")).toContain("Disallow: /");
    expect(result.files.get("index.html")).toContain("noindex,nofollow");
  });

  it("declara capacidades públicas y noindexa rutas transaccionales", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const manifest = createPublicExportManifest(referenceStore);
    const search = String(result.files.get("buscar/index.html"));
    const cart = String(result.files.get("carrito/index.html"));
    const home = String(result.files.get("index.html"));

    expect(manifest.searchEnabled).toBe(true);
    expect(manifest.cartEnabled).toBe(true);
    expect(manifest.runtimeFeatures).toContain("cart");
    expect(manifest.runtimeFeatures).toContain("motion");
    expect(home).toContain('data-solara-runtime-features="');
    expect(search).toContain('<meta name="robots" content="noindex,follow">');
    expect(cart).toContain('<meta name="robots" content="noindex,follow">');
    expect(result.files.has("compra/index.html")).toBe(false);
  });

  it("emite un pattern de teléfono válido en el checkout interno del carrito", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const cart = String(result.files.get("carrito/index.html"));
    const match = cart.match(/name="phone"[^>]*pattern="([^"]+)"/);
    const pattern = match?.[1];
    expect(pattern).toBe("[\\d\\+\\(\\)\\- ]{8,}");
    expect(cart).not.toContain("[0-9+ ()-]{8,}");
    expect(() => new RegExp(pattern ?? "", "v")).not.toThrow();
    expect(new RegExp(pattern ?? "", "v").test("11 5555-0142")).toBe(true);
  });

  it("precarga sólo la imagen crítica de cada ruta y conserva headers de cache", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const home = String(result.files.get("index.html"));
    const product = String(result.files.get("productos/manta-bruma/index.html"));
    const headers = String(result.files.get("_headers"));

    expect(home.match(/<link rel="preload" as="image"/g)).toHaveLength(2);
    expect(product.match(/<link rel="preload" as="image"/g)).toHaveLength(2);
    expect(headers).toContain("/assets/*");
    expect(headers).toContain("max-age=31536000, immutable");
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000");
    expect(headers).toContain("/ai-context.json");
  });

  it("no publica el fondo editorial ancho del hero V2", () => {
    const project = structuredClone(catalogModernV2Store);
    const hero = project.sections.find((section) => section.moduleId === "catalog-hero");
    const heroAsset = project.assets.find((asset) => asset.id === "asset-hero");
    if (!hero || !heroAsset) throw new Error("Fixture V2 sin hero o imagen principal");

    const backgroundAsset = {
      ...heroAsset,
      id: "asset-hero-background-test" as typeof heroAsset.id,
      name: "Fondo editorial de prueba",
      source: VALID_WEBP_DATA_URL,
      fallbackSource: undefined,
      responsiveSources: [],
      hash: "test-hero-background",
    };
    project.assets.push(backgroundAsset);
    hero.settings = { ...hero.settings, backgroundImageId: backgroundAsset.id };

    const result = exportProject(project, { mode: "production" });
    const home = String(result.files.get("index.html"));

    expect(home).not.toContain("/assets/test-hero-background.webp");
  });

  it("precarga las fuentes locales activas en production", () => {
    const result = exportProject(catalogModernV2Store, { mode: "production" });
    const home = String(result.files.get("index.html"));

    expect(home).toMatch(
      /<link rel="preload" as="font" type="font\/woff2" href="\/assets\/font\.[a-f0-9]+\.woff2" crossorigin>/,
    );
  });

  it("publica las rutas vigentes y mantiene fuera las páginas retiradas", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const sitemap = String(result.files.get("sitemap.xml"));
    expect(result.files.has("nosotros/index.html")).toBe(false);
    expect(result.files.has("contacto/index.html")).toBe(false);
    expect(result.files.has("buscar/index.html")).toBe(true);
    expect(result.files.has("carrito/index.html")).toBe(true);
    expect(result.files.has("compra/index.html")).toBe(false);
    expect(result.files.has("404.html")).toBe(true);
    expect(result.files.has("catalog-index.json")).toBe(true);
    expect(sitemap).not.toContain("/buscar/");
    expect(sitemap).not.toContain("/carrito/");
    expect(sitemap).not.toContain("/contacto/");
    expect(sitemap).not.toContain("/nosotros/");
    expect(sitemap).not.toContain("/compra/");
    expect(sitemap).not.toContain("/404.html");
  });

  it("respeta el shell desactivado y no incluye sus estilos", () => {
    const project = {
      ...referenceStore,
      siteShell: {
        ...referenceStore.siteShell,
        announcement: false,
        header: false,
        footer: false,
        cart: false,
      },
    };
    const result = exportProject(project, { mode: "draft" });
    const html = String(result.files.get("index.html"));
    const css = runtimeAsset(result.files, "css");

    expect(html).not.toContain('data-solara-module="announcement-bar"');
    expect(html).not.toContain('data-solara-module="editorial-header"');
    expect(html).not.toContain('data-solara-module="cart-drawer"');
    expect(html).not.toContain('data-solara-module="editorial-footer"');
    expect(css).not.toContain('[data-solara-module="editorial-header"]');
    expect(css).not.toContain('[data-solara-module="cart-drawer"]');
  });

  it("omite media que solo pertenece a una seccion deshabilitada", () => {
    const baseAsset = referenceStore.assets[0];
    if (!baseAsset) throw new Error("Fixture incompleto");
    const unusedAsset = {
      ...baseAsset,
      id: "asset-disabled-hero" as typeof baseAsset.id,
      name: "Poster deshabilitado",
      source: VALID_PNG_DATA_URL,
      width: 1,
      height: 1,
      hash: "disabled-hero",
    };
    const project = {
      ...referenceStore,
      assets: [...referenceStore.assets, unusedAsset],
      sections: referenceStore.sections.map((section) =>
        section.slot === "hero"
          ? {
              ...section,
              enabled: false,
              settings: { ...section.settings, posterAssetId: unusedAsset.id },
            }
          : section,
      ),
    };
    const result = exportProject(project, { mode: "draft" });
    const html = String(result.files.get("index.html"));

    expect(result.files.has("assets/disabled-hero.png")).toBe(false);
    expect(html).not.toContain("disabled-hero");
  });

  it("omite rutas, nombres y media de colecciones ocultas", () => {
    const baseAsset = referenceStore.assets[0];
    const collection = referenceStore.collections[0];
    if (!baseAsset || !collection) throw new Error("Fixture incompleto");
    const hiddenAsset = {
      ...baseAsset,
      id: "asset-hidden-collection" as typeof baseAsset.id,
      name: "Imagen de colección oculta",
      source: VALID_PNG_DATA_URL,
      width: 1,
      height: 1,
      hash: "hidden-collection",
    };
    const project = structuredClone(referenceStore);
    project.assets.push(hiddenAsset);
    project.collections[0] = {
      ...collection,
      status: "hidden",
      imageId: hiddenAsset.id,
    };

    const result = exportProject(project, { mode: "production" });
    const searchIndex = JSON.parse(String(result.files.get("search-index.json"))) as Array<{
      collectionIds: string[];
      collectionNames: string[];
    }>;
    const imageSitemap = String(result.files.get("image-sitemap.xml"));

    expect(result.files.has(`colecciones/${collection.slug}/index.html`)).toBe(false);
    expect(result.files.has("assets/hidden-collection.png")).toBe(false);
    expect(imageSitemap).not.toContain(`/colecciones/${collection.slug}/`);
    expect(searchIndex.every((entry) => !entry.collectionIds.includes(collection.id))).toBe(true);
    expect(searchIndex.every((entry) => !entry.collectionNames.includes(collection.title))).toBe(
      true,
    );
  });

  it("no deja enlaces públicos a una categoría oculta", () => {
    const category = referenceStore.categories[0];
    if (!category) throw new Error("Fixture incompleto");
    const project = structuredClone(referenceStore);
    project.categories[0] = { ...category, status: "hidden" };

    const result = exportProject(project, { mode: "draft" });
    const hiddenPath = `/categorias/${category.slug}/`;
    const cartHtml = String(result.files.get("carrito/index.html"));
    const notFoundHtml = String(result.files.get("404.html"));

    expect(result.files.has(`categorias/${category.slug}/index.html`)).toBe(false);
    expect(cartHtml).not.toContain(`href="${hiddenPath}"`);
    expect(notFoundHtml).not.toContain(`href="${hiddenPath}"`);
  });

  it("renderiza rutas comerciales en el preview compartido", () => {
    const category = renderPreviewHtml(referenceStore, "draft", "/categorias/textiles/");
    const product = renderPreviewHtml(referenceStore, "draft", "/productos/manta-bruma/");

    expect(category).toContain("Textiles");
    expect(product).toContain("Manta Bruma");
  });

  it("mantiene el poster y el video audiovisual autocontenidos", () => {
    const project = {
      ...referenceStore,
      videos: [
        {
          kind: "video" as const,
          id: "video-fixture",
          name: "Hero Casa Luma",
          alt: "Mesa Casa Luma en movimiento",
          mimeType: "video/mp4" as const,
          source: "data:video/mp4;base64,AA==",
          posterAssetId: referenceStore.assets[0]?.id,
          width: 1280,
          height: 720,
          durationSeconds: 5,
          hash: "fixture-video",
        },
      ],
      sections: referenceStore.sections.map((section) =>
        section.slot === "hero"
          ? {
              ...section,
              moduleId: "hero-media",
              settings: {
                mode: "video",
                title: "Una casa con materia y calma.",
                body: "Piezas honestas para usar todos los días.",
                actionLabel: "Ver colección",
                actionHref: "/categorias/textiles/",
                posterAssetId: referenceStore.assets[0]?.id,
                videoAssetId: "video-fixture",
                slides: [],
                autoplay: true,
                intervalMs: 6000,
                overlay: "dark",
                alignment: "left",
              },
            }
          : section,
      ),
    } as typeof referenceStore;
    const result = exportProject(project, { mode: "production" });
    const home = String(result.files.get("index.html"));
    expect(home).toContain('data-hero-mode="video"');
    expect(home).toContain('class="solara-hero-media-poster"');
    expect(result.files.has("assets/fixture-video.mp4")).toBe(true);
    expect(String(result.files.get("video-sitemap.xml"))).toContain("fixture-video.mp4");
  });

  it("incluye el video del hero Catalog Modern V2 y su binario en producción", () => {
    const project = structuredClone(catalogModernStore);
    project.commerceTemplates = {
      ...project.commerceTemplates,
      designFamily: "catalog-modern-v2",
    };
    const hero = project.sections.find(
      (section) => section.moduleId === "catalog-hero" && section.enabled,
    );
    if (!hero) throw new Error("Fixture sin hero");
    const poster = {
      ...project.assets[0],
      id: "asset-video-poster",
      name: "Poster de campaña",
      source: "/assets/fixture-modo-sur-camisa.webp",
      hash: "fixture-video-poster",
    } as (typeof project.assets)[number];
    project.assets = [...project.assets, poster];
    const video = {
      kind: "video" as const,
      id: "video-catalog-modern-v2",
      name: "Campaña Modo Sur",
      alt: "Campaña de Modo Sur en movimiento",
      mimeType: "video/mp4" as const,
      source: "data:video/mp4;base64,AAAA",
      width: 1080,
      height: 1920,
      durationSeconds: 8,
      hash: "fixture-catalog-modern-v2-video",
      posterAssetId: poster.id,
    } as (typeof project.videos)[number];
    project.videos = [video];
    hero.settings = {
      ...hero.settings,
      mode: "video",
      videoAssetId: video.id,
      posterAssetId: "",
      backgroundImageId: "",
    };

    const result = exportProject(project, { mode: "production" });
    const home = String(result.files.get("index.html"));

    expect(home).toContain('data-solara-module="catalog-hero"');
    expect(home).toContain('class="catalog-hero-video"');
    expect(home).toContain('rel="preload" as="image" href="/assets/fixture-modo-sur-camisa.webp"');
    expect(home).toContain(`src="/assets/${video.hash}.mp4"`);
    expect(result.files.has(`assets/${video.hash}.mp4`)).toBe(true);
    expect(String(result.files.get("video-sitemap.xml"))).toContain(`${video.hash}.mp4`);

    const headersConVideo = String(result.files.get("_headers"));
    expect(headersConVideo).toContain("/video-sitemap.xml");
    expect(headersConVideo).toMatch(
      /\/video-sitemap\.xml\n\s*! Cache-Control\n\s*Cache-Control: public, max-age=3600, must-revalidate\n/,
    );
    const headersSinVideo = String(
      exportProject(referenceStore, { mode: "production" }).files.get("_headers"),
    );
    expect(headersSinVideo).not.toContain("/video-sitemap.xml");
  });

  it("mantiene el preload LCP dentro del sitio aunque la baseUrl siga siendo de ejemplo", () => {
    const result = exportProject(
      { ...catalogModernStore, baseUrl: "https://demo-catalogo-jerarquico.example" },
      { mode: "production" },
    );
    const home = String(result.files.get("index.html"));

    expect(home).toContain(
      'media="(max-width: 1023px)" imagesrcset="/assets/fixture-modo-sur-hero.webp 1536w"',
    );
    expect(home).toContain('media="(min-width: 1024px)" href="/assets/fixture-modo-sur-hero.webp"');
    expect(home).not.toMatch(
      /rel="preload" as="image"[^>]*href="https:\/\/demo-catalogo-jerarquico\.example/,
    );
    expect(home).toContain(
      '<link rel="canonical" href="https://demo-catalogo-jerarquico.example/">',
    );
  });

  it("omite el thumbnail cuando el poster del hero no resuelve", () => {
    const validPoster = referenceStore.assets[0]?.id;
    const heroBase = referenceStore.sections.find((section) => section.slot === "hero");
    if (!validPoster || !heroBase) throw new Error("Fixture incompleto");
    const project = {
      ...referenceStore,
      videos: [
        {
          kind: "video" as const,
          id: "video-fixture",
          name: "Hero Casa Luma",
          alt: "Mesa Casa Luma en movimiento",
          mimeType: "video/mp4" as const,
          source: "data:video/mp4;base64,AA==",
          width: 1280,
          height: 720,
          durationSeconds: 5,
          hash: "fixture-video",
        },
      ],
      sections: [
        ...referenceStore.sections.filter((section) => section.slot !== "hero"),
        {
          ...heroBase,
          id: "section-hero-sin-poster",
          settings: {
            ...heroBase.settings,
            mode: "video",
            posterAssetId: "",
            videoAssetId: "video-fixture",
            slides: [],
          },
        },
        {
          ...heroBase,
          id: "section-hero-poster-valido",
          settings: {
            ...heroBase.settings,
            mode: "video",
            posterAssetId: validPoster,
            videoAssetId: "video-fixture",
            slides: [],
          },
        },
      ],
    } as typeof referenceStore;
    const result = exportProject(project, { mode: "production" });
    const home = String(result.files.get("index.html"));
    const videoSitemap = String(result.files.get("video-sitemap.xml"));

    expect(home).not.toContain('"thumbnailUrl":"https://casa-luma.example/"');
    expect(home).not.toContain('"thumbnailUrl":"https://casa-luma.example"');
    expect(videoSitemap).not.toContain("<video:thumbnail_loc>");
    expect(videoSitemap).toContain("fixture-video.mp4");
  });

  it("publica headers de seguridad compatibles con variables de movimiento", () => {
    const headers = String(
      exportProject(referenceStore, { mode: "production" }).files.get("_headers"),
    );
    expect(headers).toContain("Content-Security-Policy");
    expect(headers).toContain("style-src-attr 'unsafe-inline'");
    expect(headers).toContain("script-src 'self'");
    expect(headers).toContain("connect-src 'self'");
  });

  it("permite media remota sólo por https en la CSP del sitio público", () => {
    const headers = String(
      exportProject(referenceStore, { mode: "production" }).files.get("_headers"),
    );
    expect(headers).toContain("media-src 'self' data: https:;");
    expect(headers).toContain("img-src 'self' data: https:;");
    expect(headers).not.toContain(" http:");
  });

  it("recupera un archivo de proyecto sin cambios", () => {
    expect(readProjectArchive(createProjectArchive(referenceStore))).toEqual(referenceStore);
  });

  it("produce archivos reproducibles para el mismo snapshot", () => {
    const first = exportProject(referenceStore, { mode: "production" }).files;
    const second = exportProject(referenceStore, { mode: "production" }).files;
    expect(second).toEqual(first);
  });

  it("deduplica y publica variantes responsive procesadas", () => {
    const firstAsset = referenceStore.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    const project = {
      ...referenceStore,
      assets: [
        {
          ...firstAsset,
          mimeType: "image/webp",
          source: VALID_WEBP_DATA_URL,
          fallbackSource: VALID_JPEG_DATA_URL,
          responsiveSources: [
            { width: 480, source: "data:image/webp;base64,UklGRgEAAABXRUJQ" },
            { width: 960, source: "data:image/webp;base64,UklGRgIAAABXRUJQ" },
          ],
        },
        ...referenceStore.assets.slice(1),
      ],
    };
    const result = exportProject(project, { mode: "draft" });
    const html = String(result.files.get("index.html"));

    expect(result.files.has("assets/fixture-manta.webp")).toBe(true);
    expect(result.files.has("assets/fixture-manta-fallback.jpg")).toBe(true);
    expect(result.files.has("assets/fixture-manta-480.webp")).toBe(false);
    expect(result.files.has("assets/fixture-manta-960.webp")).toBe(true);
    expect(html).toContain("/assets/fixture-manta-960.webp 960w");
    expect(html).toContain('<source type="image/webp" srcset="/assets/fixture-manta.webp 1152w"');
  });

  it("usa la extensión del MIME real para fallback y variantes responsive", () => {
    const firstAsset = referenceStore.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    const project = {
      ...referenceStore,
      assets: [
        {
          ...firstAsset,
          mimeType: "image/webp",
          source: VALID_WEBP_DATA_URL,
          fallbackSource: VALID_PNG_DATA_URL,
          responsiveSources: [{ width: 480, source: VALID_JPEG_DATA_URL }],
        },
        ...referenceStore.assets.slice(1),
      ],
    };

    const result = exportProject(project, { mode: "draft" });
    const html = String(result.files.get("index.html"));

    expect(result.files.has("assets/fixture-manta-fallback.png")).toBe(true);
    expect(result.files.has("assets/fixture-manta-480.jpg")).toBe(true);
    expect(result.files.has("assets/fixture-manta-fallback.jpg")).toBe(false);
    expect(html).toContain("/assets/fixture-manta-fallback.png");
    expect(html).toContain("/assets/fixture-manta-480.jpg 480w");
  });

  it("ajusta automáticamente extensión, MIME, preview y sitemaps a los bytes reales", () => {
    const firstAsset = referenceStore.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    const mislabeledPng = VALID_PNG_DATA_URL.replace("data:image/png", "data:image/avif");
    const project = {
      ...referenceStore,
      assets: [
        {
          ...firstAsset,
          mimeType: "image/avif",
          source: mislabeledPng,
          responsiveSources: [{ width: 480, source: VALID_PNG_DATA_URL }],
        },
        ...referenceStore.assets.slice(1),
      ],
      seo: { ...referenceStore.seo, socialImageId: firstAsset.id },
    };

    const result = exportProject(project as typeof referenceStore, { mode: "production" });
    const home = String(result.files.get("index.html"));
    const product = String(result.files.get("productos/manta-bruma/index.html"));
    const sitemap = String(result.files.get("sitemap.xml"));
    const imageSitemap = String(result.files.get("image-sitemap.xml"));
    const bytes = result.files.get("assets/fixture-manta.png");
    const previewSources = getPreviewAssetSources(project as typeof referenceStore);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...((bytes as Uint8Array) ?? []).slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(result.files.has("assets/fixture-manta.avif")).toBe(false);
    expect(result.files.has("assets/fixture-manta-480.png")).toBe(true);
    expect(home).toContain(
      'property="og:image" content="https://tienda-referencia.example/assets/fixture-manta.png"',
    );
    expect(home).toContain('<meta property="og:image:type" content="image/png">');
    expect(product).toContain('<source type="image/png"');
    expect(product).toContain("/assets/fixture-manta-480.png 480w");
    expect(sitemap).toContain("https://tienda-referencia.example/assets/fixture-manta.png");
    expect(imageSitemap).toContain("https://tienda-referencia.example/assets/fixture-manta.png");
    expect(imageSitemap).not.toContain("fixture-manta.avif");
    expect(previewSources.get("/__solara-preview-assets/fixture-manta.png")).toBe(
      VALID_PNG_DATA_URL,
    );
  });

  it("rechaza una data URL de imagen cuyos bytes no tienen un formato reconocible", () => {
    const project = structuredClone(referenceStore);
    project.assets[0] = {
      ...project.assets[0],
      source: "data:image/png;base64,AA==",
    };

    expect(() => exportProject(project, { mode: "draft" })).toThrow(
      /bytes de imagen irreconocibles/i,
    );
  });

  it("descarta una portada social corrupta y usa otra imagen pública verificable", () => {
    const baseAsset = referenceStore.assets[0];
    if (!baseAsset) throw new Error("Fixture incompleto");
    const invalidSocialAsset = {
      ...baseAsset,
      id: "asset-invalid-social" as typeof baseAsset.id,
      name: "Portada social corrupta",
      source: "data:image/jpeg;base64,AA==",
      fallbackSource: undefined,
      hash: "invalid-social",
    };
    const project = structuredClone(referenceStore);
    project.assets.push(invalidSocialAsset);
    project.seo.socialImageId = invalidSocialAsset.id;

    const result = exportProject(project, { mode: "production" });
    const homeHtml = String(result.files.get("index.html"));

    expect(result.files.has("assets/invalid-social.jpg")).toBe(false);
    expect(homeHtml).not.toContain("invalid-social");
    expect(homeHtml).toContain('<meta property="og:image"');
  });

  it("deduplica rutas y binarios de assets con el mismo hash", () => {
    const firstAsset = referenceStore.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    const duplicate = {
      ...firstAsset,
      id: "asset-duplicate",
      source: VALID_WEBP_DATA_URL,
      mimeType: "image/webp",
      hash: "shared-content-hash",
    };
    const project = {
      ...referenceStore,
      assets: [{ ...duplicate, id: firstAsset.id }, duplicate, ...referenceStore.assets.slice(1)],
    };

    const result = exportProject(project as typeof referenceStore, { mode: "draft" });

    expect(
      [...result.files.keys()].filter((path) => path === "assets/shared-content-hash.webp"),
    ).toHaveLength(1);
  });

  it("advierte una baseUrl con subcarpeta para assets root-relativos", () => {
    const project = {
      ...referenceStore,
      baseUrl: "https://casa-luma.example/tienda/",
    };

    expect(auditProject(project)).toContainEqual(
      expect.objectContaining({
        code: "domain.baseurl-path",
        severity: "warning",
        path: "baseUrl",
      }),
    );
  });

  it("respeta la subcarpeta de baseUrl en canonical, recursos y sitemap", () => {
    const project = {
      ...referenceStore,
      baseUrl: "https://casa-luma.example/tienda/",
    };

    const result = exportProject(project, { mode: "production" });
    const home = String(result.files.get("index.html"));
    expect(home).toContain('<link rel="canonical" href="https://casa-luma.example/tienda/">');
    expect(home).toContain('<meta property="og:url" content="https://casa-luma.example/tienda/">');
    expect(home).toMatch(/href="\/tienda\/assets\/storefront[^"]*\.css"/i);
    expect(home).toMatch(/src="\/tienda\/assets\/storefront[^"]*\.js"/i);
    expect(home).toContain('href="/tienda/ai-context.json"');
    expect(home).toContain('href="/tienda/llms.txt"');

    const sitemap = String(result.files.get("sitemap.xml"));
    expect(sitemap).toContain("https://casa-luma.example/tienda/productos/manta-bruma/");

    const product = String(result.files.get("productos/manta-bruma/index.html"));
    expect(product).toContain('"url":"https://casa-luma.example/tienda/productos/manta-bruma/"');

    const preview = renderPreviewHtml(project, "production", "/");
    expect(preview).toContain("data:text/css;base64,");
    expect(preview).not.toContain('href="/tienda/assets/storefront.css"');
  });

  it("prefija los enlaces internos del body con la subcarpeta de baseUrl", () => {
    const project = {
      ...referenceStore,
      baseUrl: "https://casa-luma.example/tienda/",
    };

    const result = exportProject(project, { mode: "production" });
    const home = String(result.files.get("index.html"));
    const category = String(result.files.get("categorias/textiles/index.html"));
    const cart = String(result.files.get("carrito/index.html"));
    const productPage = String(result.files.get("productos/manta-bruma/index.html"));

    expect(home).toContain('href="/tienda/categorias/mesa/"');
    expect(home).toContain('href="/tienda/productos/manta-bruma/"');
    expect(category).toContain('href="/tienda/productos/manta-bruma/"');
    expect(category).toContain('href="/tienda/buscar/"');
    expect(cart).toContain("data-solara-checkout");
    expect(cart).toContain("data-checkout-form");
    expect(cart).not.toContain('href="/tienda/compra/"');
    expect(productPage).toContain('action="/tienda/carrito/"');
    expect(home).not.toContain('href="/tienda/tienda/');

    const preview = renderPreviewHtml(project, "production", "/");
    expect(preview).toContain('href="/tienda/categorias/mesa/"');
  });

  it("la página de búsqueda declara pageSize y total del catálogo", () => {
    const { files } = exportProject(catalogScaleStore, { mode: "production" });
    const searchHtml = String(files.get("buscar/index.html"));
    expect(searchHtml).toContain(
      `data-products-per-page="${catalogScaleStore.commerceTemplates.category.productsPerPage}"`,
    );
    const total = catalogScaleStore.products.filter(
      (product) => product.status === "active",
    ).length;
    expect(total).toBe(50);
    expect(searchHtml).toContain(`data-category-total="${total}"`);
  });

  it("publica catalog-index.json cuando el drawer de carrito está activo sin templates", () => {
    const project = {
      ...referenceStore,
      commerceTemplates: {
        ...referenceStore.commerceTemplates,
        cart: { enabled: false },
        checkout: { enabled: false },
      },
    };

    const result = exportProject(project, { mode: "production" });

    expect(result.files.has("catalog-index.json")).toBe(true);
  });

  it("incluye rutas paginadas en el image-sitemap", () => {
    const legacy = exportProject(catalogScaleStore, { mode: "production" });
    const legacyImageSitemap = String(legacy.files.get("image-sitemap.xml"));
    const modern = exportProject(catalogModernStore, { mode: "production" });
    const modernImageSitemap = String(modern.files.get("image-sitemap.xml"));

    expect(legacyImageSitemap).toContain(
      "<loc>https://tienda-referencia-scale.example/categorias/casa/pagina/2/</loc>",
    );
    expect(legacyImageSitemap).not.toContain(
      "<loc>https://tienda-referencia-scale.example/categorias/casa/pagina/3/</loc>",
    );
    expect(modernImageSitemap).toContain(
      "<loc>https://tienda-referencia-modern.example/colecciones/esenciales/pagina/2/</loc>",
    );
  });

  it("mantiene la política CSP exacta en _headers", () => {
    const headers = String(
      exportProject(referenceStore, { mode: "production" }).files.get("_headers"),
    );

    expect(headers).toBe(`/*
  Cache-Control: public, max-age=0, must-revalidate, stale-while-revalidate=86400
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; media-src 'self' data: https:; font-src 'self' data:; manifest-src 'self'; worker-src 'self'; form-action 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Access-Control-Expose-Headers: Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Cache-Control, Referrer-Policy, Permissions-Policy

/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable

/sitemap.xml
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

/image-sitemap.xml
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

/google-merchant.xml
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate
  Content-Type: application/xml; charset=utf-8

/ai-context.json
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/llms.txt
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/llms-full.txt
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/search-index.json
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/catalog-index.json
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate

/sw.js
  ! Cache-Control
  Cache-Control: no-cache

/manifest.webmanifest
  ! Cache-Control
  Cache-Control: public, max-age=3600, must-revalidate

/feed.xml
  ! Cache-Control
  Cache-Control: public, max-age=900, must-revalidate
  Content-Type: application/rss+xml; charset=utf-8
`);
  });

  it("emite headers de Cloudflare Pages con detach de cache, CSP sin trusted-types y HSTS con subdominios", () => {
    const result = exportProject(referenceStore, { mode: "production" });
    const headers = String(result.files.get("_headers"));
    const home = String(result.files.get("index.html"));
    const assetsSection = headers.slice(
      headers.indexOf("/assets/*"),
      headers.indexOf("/sitemap.xml"),
    );

    expect(headers).not.toContain("trusted-types");
    expect(headers).not.toContain("require-trusted-types-for");
    expect(headers).not.toContain("Access-Control-Allow-Origin");
    expect(headers).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
    expect(headers).toContain("img-src 'self' data: https:;");
    expect(headers).toContain("media-src 'self' data: https:;");
    expect(headers).not.toContain(" http:");
    expect(assetsSection).toMatch(
      /! Cache-Control\n\s*Cache-Control: public, max-age=31536000, immutable\n/,
    );
    expect(headers).not.toMatch(/video-sitemap/);
    expect(home).not.toContain("og:updated_time");
  });

  it("advierte el riesgo Merchant del checkout por WhatsApp", () => {
    expect(auditProject(referenceStore)).toContainEqual(
      expect.objectContaining({ code: "merchant.whatsapp-checkout", severity: "warning" }),
    );
  });

  it("deriva la cobertura legal del perfil y diferencia draft de producción", () => {
    const project = structuredClone(catalogModernV2Store);
    project.policies = {
      ...project.policies,
      countryNames: {},
      shipping: { ...project.policies.shipping, countries: ["UY"] },
      returns: { ...project.policies.returns, countries: ["UY"] },
    };

    expect(auditProject(project, true, "draft")).toContainEqual(
      expect.objectContaining({ code: "legal.country-name", severity: "warning" }),
    );
    expect(auditProject(project, true, "production")).toContainEqual(
      expect.objectContaining({ code: "legal.country-name", severity: "critical" }),
    );

    project.legalProfile = {
      ...project.legalProfile,
      revisionAt: "2026-08-31T12:00:00.000Z",
      jurisdiction: "Provincia de Buenos Aires",
      privacyOverride: "Texto privado de prueba.",
      termsOverride: "Texto de términos de prueba.",
    };
    project.policies.countryNames = { UY: "Uruguay" };
    const result = exportProject(project, { mode: "production" });
    expect(String(result.files.get("privacidad/index.html"))).toContain("Texto privado de prueba.");
    expect(String(result.files.get("terminos/index.html"))).toContain(
      "Texto de términos de prueba.",
    );
  });

  it("advierte contexto IA y medios remotos sin bloquear producción", () => {
    const project = structuredClone(referenceStore);
    const asset = project.assets[0];
    if (!asset) throw new Error("Fixture incompleto");
    asset.source = "http://cdn.example.test/image.webp";
    const issues = auditProject(project);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "privacy.public-ai-context", severity: "warning" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "privacy.external-media-host",
        message: expect.stringContaining("cdn.example.test"),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "privacy.http-media", severity: "warning" }),
    );
    expect(
      exportProject(project, { mode: "production" }).files.has("deployment-manifest.json"),
    ).toBe(true);
  });

  it("genera siempre el contexto publico para agentes en produccion", () => {
    const result = exportProject(referenceStore, {
      mode: "production",
      publicAiContext: false,
    });
    expect(result.files.has("ai-context.json")).toBe(true);
    expect(result.files.has("llms.txt")).toBe(true);
    expect(result.files.has("llms-full.txt")).toBe(true);
    expect(result.optimization.aiReadiness.publicContextAvailable).toBe(true);
    expect(String(result.files.get("index.html"))).toContain('href="/ai-context.json"');
  });

  it("la Home editable manda sobre el seo global en su ruta", () => {
    const project = {
      ...referenceStore,
      seo: {
        ...referenceStore.seo,
        title: "Título global de la tienda",
        description: "Descripción global de la tienda.",
      },
      pages: referenceStore.pages.map((page) => ({
        ...page,
        seoTitle: "Título exclusivo del Home",
        seoDescription: "Descripción exclusiva del Home.",
      })),
    };
    const result = exportProject(project as typeof referenceStore, { mode: "production" });

    expect(String(result.files.get("index.html"))).toContain(
      "<title>Título exclusivo del Home</title>",
    );
    expect(String(result.files.get("index.html"))).toContain(
      '<meta name="description" content="Descripción exclusiva del Home.">',
    );
    expect(result.files.has("nosotros/index.html")).toBe(false);
    expect(result.files.has("contacto/index.html")).toBe(false);
    expect(String(result.files.get("index.html"))).not.toContain("Título global de la tienda");
  });

  it("el JSON-LD del negocio prefiere whatsapp.phone sobre identity.phone", () => {
    const project = {
      ...referenceStore,
      whatsapp: { ...referenceStore.whatsapp, phone: "5492212345678" },
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    const store = onlineStoreJsonLd(homeHtml);
    expect(store.telephone).toBe("5492212345678");
  });

  it("el JSON-LD del negocio omite telephone y address cuando están vacíos", () => {
    const project = {
      ...referenceStore,
      identity: { ...referenceStore.identity, phone: "", address: "" },
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    const store = onlineStoreJsonLd(homeHtml);
    expect(store.telephone).toBe(referenceStore.whatsapp.phone);
    expect(store).not.toHaveProperty("address");
    expect(JSON.stringify(store)).not.toContain("address");
  });

  it("no publica el teléfono de plantilla (sentinel) en ningún archivo del sitio", () => {
    const project = {
      ...referenceStore,
      whatsapp: { ...referenceStore.whatsapp, phone: CATALOG_MODERN_PLACEHOLDER_PHONE },
    };
    for (const mode of ["draft", "production"] as const) {
      const result = exportProject(project as typeof referenceStore, { mode });
      for (const [path, content] of result.files) {
        expect(String(content), `archivo ${path} (${mode})`).not.toContain(
          CATALOG_MODERN_PLACEHOLDER_PHONE,
        );
      }
      const homeHtml = String(result.files.get("index.html"));
      expect(homeHtml, `home ${mode}`).not.toContain("data-whatsapp=");
      expect(homeHtml, `home ${mode}`).not.toContain("data-whatsapp-greeting=");
      expect(homeHtml, `home ${mode}`).not.toContain("data-whatsapp-include-sku=");
      const store = onlineStoreJsonLd(homeHtml);
      expect(store.telephone).toBe(referenceStore.identity.phone);
      expect(result.files.has("contacto/index.html"), `contacto ${mode}`).toBe(false);
      expect(result.files.has("nosotros/index.html"), `nosotros ${mode}`).toBe(false);
      expect(result.files.has("compra/index.html"), `compra ${mode}`).toBe(false);
      const cartHtml = String(result.files.get("carrito/index.html"));
      expect(cartHtml, `carrito ${mode}`).not.toContain("wa.me");
      const productHtml = String(result.files.get("productos/manta-bruma/index.html"));
      expect(productHtml, `producto ${mode}`).not.toContain("wa.me");
      expect(productHtml, `producto ${mode}`).not.toContain("catalog-add-fallback");
    }
  });

  it("con teléfono válido la Home expone contacto y el carrito conserva el checkout interno", () => {
    const phone = "5491123456789";
    const project = {
      ...catalogModernV2Store,
      whatsapp: { ...catalogModernV2Store.whatsapp, phone },
    };
    const result = exportProject(project as typeof catalogModernV2Store, { mode: "draft" });
    const homeHtml = String(result.files.get("index.html"));
    expect(homeHtml).toContain(`data-whatsapp="${phone}"`);
    expect(homeHtml).toContain(
      `data-whatsapp-greeting="${catalogModernV2Store.whatsapp.greeting}"`,
    );
    expect(homeHtml).toContain(`wa.me/${phone}`);
    expect(homeHtml).toContain("Escribir por WhatsApp");
    const cartHtml = String(result.files.get("carrito/index.html"));
    expect(cartHtml).toContain("data-cart-checkout-panel");
    expect(cartHtml).toContain("data-cart-checkout-next");
    expect(result.files.has("compra/index.html")).toBe(false);
  });

  it("la meta description de Home prefiere la página y el seo global antes que la identidad", () => {
    const project = {
      ...referenceStore,
      pages: referenceStore.pages.map((page) =>
        page.kind === "home" ? { ...page, seoDescription: "Descripción de la página Home." } : page,
      ),
      seo: { ...referenceStore.seo, description: "Descripción del seo global." },
      identity: { ...referenceStore.identity, description: "Descripción de la identidad." },
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    expect(homeMetaDescription(homeHtml)).toBe("Descripción de la página Home.");
    expect(homeHtml).toContain(
      '<meta property="og:description" content="Descripción de la página Home.">',
    );
  });

  it("conecta metadata social y SEO derivada con los datos actuales de la tienda", () => {
    const project = {
      ...referenceStore,
      identity: {
        ...referenceStore.identity,
        brandName: "Tienda editorial",
        legalName: "Tienda editorial SRL",
      },
      assets: referenceStore.assets.map((asset) =>
        asset.id === "asset-manta"
          ? { ...asset, fallbackSource: VALID_PNG_DATA_URL, width: 1200, height: 630 }
          : asset,
      ),
      seo: { ...referenceStore.seo, socialImageId: "asset-manta" },
      updatedAt: "2026-08-18T18:00:00.000Z",
    };
    const result = exportProject(project as typeof referenceStore, { mode: "production" });
    const html = String(result.files.get("index.html"));

    expect(html).toContain('<meta name="author" content="Tienda editorial">');
    expect(html).toContain('<meta name="publisher" content="Tienda editorial SRL">');
    expect(html).toContain('<meta name="robots" content="index,follow');
    expect(html).toContain('<meta name="googlebot" content="index,follow');
    expect(html).toContain(
      '<meta property="og:image" content="https://tienda-referencia.example/assets/fixture-manta-fallback.png">',
    );
    expect(html).toContain(
      '<meta property="og:image:alt" content="Manta de algodón verde sobre un sillón claro">',
    );
    expect(html).not.toContain("og:updated_time");
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it("la meta de Home respeta la página y las rutas internas usan el SEO global", () => {
    const globalDescription = "Descripción global de la tienda.";
    const project = {
      ...referenceStore,
      pages: referenceStore.pages.filter((page) => page.kind === "home"),
      seo: { ...referenceStore.seo, description: globalDescription },
    };
    const result = exportProject(project as typeof referenceStore, { mode: "draft" });
    const homeHtml = String(result.files.get("index.html"));
    expect(homeMetaDescription(homeHtml)).toBe(referenceStore.pages[0]?.seoDescription);
    const searchHtml = String(result.files.get("buscar/index.html"));
    expect(searchHtml).toContain(`<meta name="description" content="${globalDescription}">`);
  });

  it("el título de Home prefiere la página y el seo global antes que la identidad", () => {
    const project = {
      ...referenceStore,
      pages: referenceStore.pages.map((page) =>
        page.kind === "home" ? { ...page, seoTitle: "Título de la página Home" } : page,
      ),
      seo: { ...referenceStore.seo, title: "Título del seo global" },
      name: "Nombre del proyecto",
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    expect(/<title>([\s\S]*?)<\/title>/.exec(homeHtml)?.[1]).toBe("Título de la página Home");
  });

  it("mantiene Contacto V2 dentro de Home sin publicar una ruta propia", () => {
    expect(
      catalogModernV2Store.sections.some((section) => section.moduleId === "contact-form"),
    ).toBe(true);
    expect(
      exportProject(catalogModernV2Store, { mode: "production" }).files.has("contacto/index.html"),
    ).toBe(false);
  });

  it("usa el seo global como fallback en rutas sin página editable", () => {
    const project = {
      ...referenceStore,
      seo: {
        ...referenceStore.seo,
        title: "Título global de la tienda",
        description: "Descripción global de la tienda.",
      },
      categories: referenceStore.categories.map((category, index) =>
        index === 0 ? { ...category, description: "" } : category,
      ),
    };
    const categoryHtml = String(
      exportProject(project as typeof referenceStore, { mode: "production" }).files.get(
        "categorias/textiles/index.html",
      ),
    );
    expect(categoryHtml).toContain(
      '<meta name="description" content="Descripción global de la tienda.">',
    );
  });

  it("og:image sale de project.seo.socialImageId", () => {
    const project = {
      ...referenceStore,
      assets: referenceStore.assets.map((asset) =>
        asset.id === "asset-jarra" ? { ...asset, fallbackSource: VALID_PNG_DATA_URL } : asset,
      ),
      seo: { ...referenceStore.seo, socialImageId: "asset-jarra" as const },
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    expect(homeHtml).toContain(
      '<meta property="og:image" content="https://tienda-referencia.example/assets/fixture-jarra-fallback.png">',
    );
  });

  it("usa el fallback JPG de un asset AVIF para las tarjetas sociales", () => {
    const firstAsset = referenceStore.assets[0];
    if (!firstAsset) throw new Error("Fixture incompleto");
    const socialAsset = {
      ...firstAsset,
      id: "asset-social-avif" as typeof firstAsset.id,
      name: "Portada social AVIF",
      alt: "Portada social de la tienda",
      mimeType: "image/avif",
      source: VALID_AVIF_DATA_URL,
      fallbackSource: VALID_JPEG_DATA_URL,
      width: 1200,
      height: 630,
      hash: "social-avif",
    };
    const project = {
      ...referenceStore,
      assets: [...referenceStore.assets, socialAsset],
      seo: { ...referenceStore.seo, socialImageId: socialAsset.id },
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );

    expect(homeHtml).toContain(
      '<meta property="og:image" content="https://tienda-referencia.example/assets/social-avif-fallback.jpg">',
    );
    expect(homeHtml).toContain(
      '<meta name="twitter:image" content="https://tienda-referencia.example/assets/social-avif-fallback.jpg">',
    );
  });

  function buildCustomFaviconProject() {
    const customIco = buildFaviconIco("favicon-de-prueba");
    const favicon = {
      kind: "image" as const,
      id: "asset-test-favicon" as (typeof referenceStore.assets)[number]["id"],
      name: "Favicon del sitio",
      alt: "Favicon del sitio",
      mimeType: "image/x-icon",
      source: `data:image/x-icon;base64,${Buffer.from(customIco).toString("base64")}`,
      fallbackSource: "data:image/png;base64,iVBORw0KGgo=",
      width: 256,
      height: 256,
      hash: "test-favicon-v1",
    };
    return {
      customIco,
      favicon,
      project: {
        ...referenceStore,
        assets: [...referenceStore.assets, favicon],
        seo: { ...referenceStore.seo, faviconAssetId: favicon.id },
      },
    };
  }

  it("emite el favicon ICO en la raíz y deduplica la copia del asset", () => {
    const { customIco, project } = buildCustomFaviconProject();
    const result = exportProject(project as typeof referenceStore, { mode: "production" });
    const homeHtml = String(result.files.get("index.html"));
    expect(homeHtml).toContain('rel="icon" href="/favicon.ico"');
    expect(homeHtml).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/assets/test-favicon-v1-fallback.png"',
    );
    expect(result.files.has("assets/test-favicon-v1.ico")).toBe(false);
    expect(result.files.has("assets/test-favicon-v1-fallback.png")).toBe(true);
    const rootIco = result.files.get("favicon.ico") as Uint8Array;
    expect(Buffer.from(rootIco).equals(Buffer.from(customIco))).toBe(true);
  });

  it("convierte un favicon legado WebP con fallback PNG en un ICO multirresolución", () => {
    const fallbackPng = encodePngRgba(
      Uint8Array.from([
        255, 255, 255, 255, 255, 255, 0, 128, 255, 255, 0, 128, 255, 32, 16, 8, 255,
      ]),
      2,
      2,
    );
    const fallbackSource = `data:image/png;base64,${Buffer.from(fallbackPng).toString("base64")}`;
    const favicon = {
      kind: "image" as const,
      id: "asset-legacy-favicon" as (typeof referenceStore.assets)[number]["id"],
      name: "Icono legado",
      alt: "Icono legado",
      mimeType: "image/webp",
      source: VALID_WEBP_DATA_URL,
      fallbackSource,
      width: 256,
      height: 256,
      hash: "legacy-favicon-v1",
      responsiveSources: [{ width: 256, source: VALID_WEBP_DATA_URL }],
    };
    const project = {
      ...referenceStore,
      assets: [...referenceStore.assets, favicon],
      seo: { ...referenceStore.seo, faviconAssetId: favicon.id },
    } as typeof referenceStore;

    const result = exportProject(project, { mode: "production" });
    const homeHtml = String(result.files.get("index.html"));
    expect(homeHtml).toContain(
      '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48 64x64 128x128 256x256" type="image/x-icon">',
    );
    expect(homeHtml).not.toContain("legacy-favicon-v1.webp");
    expect(homeHtml).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/assets/legacy-favicon-v1-fallback.png"',
    );

    const rootIco = result.files.get("favicon.ico");
    if (!(rootIco instanceof Uint8Array)) throw new Error("Falta favicon.ico en la exportación.");
    const header = new DataView(rootIco.buffer, rootIco.byteOffset, rootIco.byteLength);
    expect(header.getUint16(4, true)).toBe(6);
    expect(
      Buffer.from(rootIco).equals(
        Buffer.from(buildFaviconIco(project.identity.brandName, fallbackPng)),
      ),
    ).toBe(true);

    const preview = renderPreviewHtml(project, "draft", "/");
    expect(typeof preview).toBe("string");
    expect(String(preview)).toMatch(
      /<link rel="icon" href="\/favicon\.ico"[^>]*data-solara-preview-favicon="data:image\/x-icon;base64,/,
    );
  });

  it("repara un falso ICO truncado antes de escribir el sitio", () => {
    const fallbackPng = encodePngRgba(Uint8Array.from([255, 0, 255, 255]), 1, 1);
    const favicon = {
      kind: "image" as const,
      id: "asset-truncated-favicon" as (typeof referenceStore.assets)[number]["id"],
      name: "Favicon truncado",
      alt: "Favicon truncado",
      mimeType: "image/x-icon",
      source: "data:image/x-icon;base64,AAABAA==",
      fallbackSource: `data:image/png;base64,${Buffer.from(fallbackPng).toString("base64")}`,
      width: 256,
      height: 256,
      hash: "truncated-favicon-v1",
    };
    const project = {
      ...referenceStore,
      assets: [...referenceStore.assets, favicon],
      seo: { ...referenceStore.seo, faviconAssetId: favicon.id },
    } as typeof referenceStore;

    const result = exportProject(project, { mode: "production" });
    const rootIco = result.files.get("favicon.ico");
    expect(rootIco instanceof Uint8Array && isValidIco(rootIco)).toBe(true);
    expect(Buffer.from(rootIco as Uint8Array).equals(Buffer.from([0, 0, 1, 0]))).toBe(false);
  });

  it("mantiene la emisión del asset favicon cuando además se usa como imagen de producto", () => {
    const { favicon } = buildCustomFaviconProject();
    const products = referenceStore.products.map((product, index) =>
      index === 0 ? { ...product, imageIds: [...product.imageIds, favicon.id] } : product,
    );
    const project = {
      ...referenceStore,
      assets: [...referenceStore.assets, favicon],
      seo: { ...referenceStore.seo, faviconAssetId: favicon.id },
      products,
    };
    const result = exportProject(project as typeof referenceStore, { mode: "production" });
    expect(result.files.has("assets/test-favicon-v1.ico")).toBe(true);
  });

  it("usa la descripción SEO de la tienda en rutas sin descripción editable", () => {
    const project = {
      ...referenceStore,
      seo: { ...referenceStore.seo, description: "Descripción central de la tienda." },
      pages: referenceStore.pages.filter((page) => page.kind === "home"),
    };
    const result = exportProject(project as typeof referenceStore, { mode: "production" });
    for (const path of ["buscar/index.html", "carrito/index.html", "404.html"]) {
      const html = String(result.files.get(path));
      expect(html).toContain(
        '<meta name="description" content="Descripción central de la tienda.">',
      );
      expect(html).toContain(
        '<meta property="og:description" content="Descripción central de la tienda.">',
      );
    }
  });

  it("emite la verificación de Search Console y de Merchant Center", () => {
    const project = {
      ...referenceStore,
      seo: {
        ...referenceStore.seo,
        searchConsoleVerification: "search-console-code",
        merchantVerification: "merchant-code",
      },
    };
    const homeHtml = String(
      exportProject(project as typeof referenceStore, { mode: "draft" }).files.get("index.html"),
    );
    expect(homeHtml).toContain(
      '<meta name="google-site-verification" content="search-console-code">',
    );
    expect(homeHtml).toContain('<meta name="google-site-verification" content="merchant-code">');
  });

  it("detecta rutas reservadas y preorder sin fecha", () => {
    const project = {
      ...referenceStore,
      products: referenceStore.products.map((product, index) =>
        index === 0
          ? {
              ...product,
              slug: "envios" as typeof product.slug,
              variants: product.variants.map((variant) => ({
                ...variant,
                stockStatus: "preorder" as const,
                availabilityDate: undefined,
              })),
            }
          : product,
      ),
    };
    const issues = auditProject(project as typeof referenceStore);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "slug.reserved", severity: "critical" }),
        expect.objectContaining({ code: "variant.availability-date", severity: "critical" }),
      ]),
    );
  });
});

describe("renderPreviewHtml sin preload absoluto", () => {
  it("no emite preload de imagen cuando el modo es draft", () => {
    const html = renderPreviewHtml(catalogModernStore, "draft", "/", {
      assetTransport: "parent",
    });
    expect(html).not.toMatch(/rel="preload" as="image"/);
    expect(html).not.toMatch(/https?:\/\/[^"']+\/assets\//);
  });

  it("conserva el preload absoluto en producción", () => {
    const html = renderPreviewHtml(catalogModernStore, "production", "/", {});
    expect(html).toMatch(/rel="preload" as="image"/);
  });
});

describe("preload del logo del navbar", () => {
  function storeWithLogo() {
    const project = structuredClone(catalogModernStore);
    const base = project.assets[0];
    if (!base) throw new Error("Fixture sin assets");
    const logo = {
      ...base,
      id: "asset-logo-test",
      name: "Logo de prueba",
      alt: "Logo de prueba",
      hash: "logo-test",
    } as (typeof project.assets)[number];
    project.identity.logoAssetId = logo.id;
    project.assets = [...project.assets, logo];
    return project;
  }

  it("precarga el logo en producción con el mismo recurso del img", () => {
    const { files } = exportProject(storeWithLogo(), { mode: "production" });
    const home = String(files.get("index.html"));
    const imgSrc = /\bsrc="([^"]*)"/.exec(
      /<img\b[^>]*class="[^"]*\bsolara-logo\b[^"]*"[^>]*>/.exec(home)?.[0] ?? "",
    )?.[1];
    expect(imgSrc).toMatch(/^\/assets\/.+\.webp$/);
    const preloads = [...home.matchAll(/<link rel="preload" as="image"[^>]*>/g)].map(
      (match) => match[0],
    );
    expect(
      preloads.some((link) => link.includes(imgSrc ?? "") && link.includes('fetchpriority="high"')),
    ).toBe(true);
  });

  it("no precarga logo en draft ni cuando la tienda usa wordmark", () => {
    const { files } = exportProject(storeWithLogo(), { mode: "draft" });
    expect(String(files.get("index.html"))).not.toMatch(/rel="preload" as="image"/);
    const plain = exportProject(catalogModernStore, { mode: "production" });
    const plainHome = String(plain.files.get("index.html"));
    expect(plainHome).not.toContain("solara-logo");
  });
});

describe("tema: carga real de fuentes y vars sin duplicados", () => {
  const decodePreviewCss = (preview: string): string => {
    const match = /data:text\/css;base64,([^"]+)/.exec(preview);
    if (!match) throw new Error("CSS del preview no encontrado");
    const encoded = match[1];
    if (!encoded) throw new Error("CSS del preview no encontrado");
    return Buffer.from(encoded, "base64").toString("utf8");
  };

  it("emite @font-face self-host cuando la familia es Google Fonts y agrega el woff2", () => {
    const result = exportProject(catalogModernStore, { mode: "draft" });
    const css = runtimeAsset(result.files, "css");
    const fontPath = [...result.files.keys()].find((path) =>
      /^assets\/font\.[a-f0-9]+\.woff2$/i.test(path),
    );
    const font = fontPath ? result.files.get(fontPath) : undefined;

    expect(css).toContain('@font-face{font-family:"Archivo"');
    expect(css).toMatch(/url\("\/assets\/font\.[a-f0-9]+\.woff2"\) format\("woff2"\)/);
    expect(css).toContain("font-weight:400 900");
    expect(css).not.toContain('local("Arial")');
    expect(css.split("@font-face").length - 1).toBe(1);
    expect(font).toBeInstanceOf(Uint8Array);
    expect((font as Uint8Array).length).toBeGreaterThan(30_000);
    expect([...result.files.keys()].some((path) => path.includes("inter"))).toBe(false);
  });

  it("no emite fuentes para familias del sistema ni archivos woff2", () => {
    const result = exportProject(referenceStore, { mode: "draft" });
    const css = runtimeAsset(result.files, "css");

    expect(css).not.toContain("@font-face");
    expect([...result.files.keys()].some((path) => path.startsWith("assets/fonts/"))).toBe(false);
  });

  it("el preview transporta la fuente inline en base64 sin URLs relativas", () => {
    const preview = renderPreviewHtml(catalogModernStore, "draft", "/");
    const css = decodePreviewCss(preview);

    expect(css).toContain('@font-face{font-family:"Archivo"');
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).not.toContain('url("/assets/fonts/');
    expect(css).not.toContain("local(");
  });

  it("emite una sola var por campo y el body usa el token canónico", () => {
    const css = String(
      runtimeAsset(exportProject(catalogModernStore, { mode: "draft" }).files, "css"),
    );

    expect(css).toContain("--solara-font-display:");
    expect(css).toContain("--solara-font-body:");
    expect(css).toContain("--solara-space-scale:");
    expect(css).not.toMatch(/--solara-display:/);
    expect(css).not.toMatch(/--solara-body:/);
    expect(css).not.toMatch(/--solara-space:/);
    expect(css).toContain("font-family:var(--solara-font-body)");
  });

  it("emite el fondo del tema como background-image y lo omite sin token", () => {
    const assetId = referenceStore.assets[0]?.id;
    if (!assetId) throw new Error("Fixture incompleto");
    const withBackground = structuredClone(referenceStore);
    Object.assign(withBackground.theme, {
      background: { imageAssetId: assetId, repeat: "repeat", size: "480px" },
    });
    const css = String(runtimeAsset(exportProject(withBackground, { mode: "draft" }).files, "css"));

    expect(css).toContain("background-image:url(");
    expect(css).toContain("background-repeat:repeat");
    expect(css).toContain("background-size:480px");
    expect(css).toContain(
      "html body [data-solara-store].solara-page{background-color:transparent}",
    );

    const plain = String(
      runtimeAsset(exportProject(referenceStore, { mode: "draft" }).files, "css"),
    );
    expect(plain).not.toContain("background-image:url(");
    expect(plain).not.toContain(
      "html body [data-solara-store].solara-page{background-color:transparent}",
    );
  });

  it("puede reducir la presencia visual del fondo sin afectar el contenido", () => {
    const assetId = referenceStore.assets[0]?.id;
    if (!assetId) throw new Error("Fixture incompleto");
    const withSubtleBackground = structuredClone(referenceStore);
    Object.assign(withSubtleBackground.theme, {
      background: { imageAssetId: assetId, repeat: "repeat", size: "480px", opacity: 0.45 },
    });

    const css = String(
      runtimeAsset(exportProject(withSubtleBackground, { mode: "draft" }).files, "css"),
    );

    expect(css).toContain(
      'background-image:linear-gradient(color-mix(in srgb,var(--solara-background) 55%,transparent),color-mix(in srgb,var(--solara-background) 55%,transparent)),url("',
    );
    expect(css).toContain("background-repeat:no-repeat,repeat");
    expect(css).toContain("background-size:auto,480px");
  });
});

function preloadAttribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

function parseSrcsetPairs(value: string): Array<{ url: string; width: number }> {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/);
      return { url: url ?? "", width: Number((descriptor ?? "").replace(/w$/, "")) || 0 };
    });
}

function lcpPreloadTags(html: string): string[] {
  const tags = [...html.matchAll(/<link rel="preload" as="image"[^>]*>/g)].map((match) => match[0]);
  if (tags.length === 0) throw new Error("Falta el preload del LCP.");
  return tags;
}

function lcpPreloadTagWithMedia(html: string, media: string): string {
  const tag = lcpPreloadTags(html).find(
    (candidate) => preloadAttribute(candidate, "media") === media,
  );
  if (!tag) throw new Error(`Falta el preload del LCP con media "${media}".`);
  return tag;
}

function pictureSourcesFor(
  html: string,
  marker: string,
): { mobile: string; full: string; sizes?: string } {
  for (const match of html.matchAll(/<picture>([\s\S]*?)<\/picture>/g)) {
    const block = match[1] ?? "";
    if (!block.includes(marker)) continue;
    const sources = [...block.matchAll(/<source\b[^>]*>/g)].map((tag) => tag[0]);
    const mobile = sources.find((tag) => preloadAttribute(tag, "media") === "(max-width: 1023px)");
    const full = sources.find((tag) => !preloadAttribute(tag, "media"));
    if (!mobile || !full) throw new Error("El picture no tiene fuente móvil y completa.");
    return {
      mobile: preloadAttribute(mobile, "srcset") ?? "",
      full: preloadAttribute(full, "srcset") ?? "",
      sizes: preloadAttribute(mobile, "sizes"),
    };
  }
  throw new Error(`No se encontró el picture con ${marker}.`);
}

describe("preload espejo y og social", () => {
  it("el preload del LCP se parte por media y espeja cada fuente del picture de categoría", () => {
    const project = structuredClone(catalogModernStore);
    const category = project.categories.find((candidate) => candidate.slug === "remeras");
    if (!category) throw new Error("Fixture incompleto");
    category.imageId = "asset-manta";
    const html = String(
      exportProject(project, { mode: "production" }).files.get("categorias/remeras/index.html"),
    );
    const picture = pictureSourcesFor(html, "solara-category-hero-image");
    const mobilePairs = parseSrcsetPairs(picture.mobile);
    const fullPairs = parseSrcsetPairs(picture.full);
    expect(mobilePairs.length).toBeGreaterThanOrEqual(1);
    expect(fullPairs.length).toBeGreaterThanOrEqual(1);
    const tags = lcpPreloadTags(html);
    expect(tags).toHaveLength(2);
    const mobile = lcpPreloadTagWithMedia(html, "(max-width: 1023px)");
    const desktop = lcpPreloadTagWithMedia(html, "(min-width: 1024px)");
    expect(parseSrcsetPairs(preloadAttribute(mobile, "imagesrcset") ?? "")).toEqual(mobilePairs);
    expect(preloadAttribute(mobile, "imagesizes")).toBe(picture.sizes);
    expect(preloadAttribute(mobile, "href")).toBeUndefined();
    expect(preloadAttribute(desktop, "href")).toBe(fullPairs[0]?.url);
    expect(preloadAttribute(desktop, "imagesrcset")).toBeUndefined();
    expect(preloadAttribute(mobile, "fetchpriority")).toBe("high");
    expect(preloadAttribute(desktop, "fetchpriority")).toBe("high");
  });

  it("mantiene un único preload sin media cuando el asset del banner no tiene variantes", () => {
    const project = structuredClone(catalogModernStore);
    const category = project.categories.find((candidate) => candidate.slug === "remeras");
    if (!category) throw new Error("Fixture incompleto");
    category.imageId = "asset-product-01";
    const html = String(
      exportProject(project, { mode: "production" }).files.get("categorias/remeras/index.html"),
    );
    const tags = lcpPreloadTags(html);
    expect(tags).toHaveLength(1);
    const preload = tags[0] ?? "";
    expect(preloadAttribute(preload, "media")).toBeUndefined();
    expect(preloadAttribute(preload, "href")).toBe("/fixtures/modo-sur-product-01.webp");
    expect(preloadAttribute(preload, "imagesrcset")).toBeUndefined();
    expect(preloadAttribute(preload, "imagesizes")).toBeUndefined();
  });

  function projectWithSocialAsset(assetOverrides: Partial<{ width: number; height: number }> = {}) {
    const socialAsset = {
      kind: "image" as const,
      id: "asset-social-crop" as (typeof referenceStore.assets)[number]["id"],
      name: "Portada social",
      alt: "Portada social de la tienda",
      mimeType: "image/avif",
      source: VALID_AVIF_DATA_URL,
      fallbackSource: VALID_JPEG_DATA_URL,
      width: assetOverrides.width ?? 1600,
      height: assetOverrides.height ?? 900,
      hash: "social-crop",
    };
    return {
      socialAsset,
      project: {
        ...referenceStore,
        assets: [...referenceStore.assets, socialAsset],
        seo: { ...referenceStore.seo, socialImageId: socialAsset.id },
      } as typeof referenceStore,
    };
  }

  it("emite og:image:width/height con las dimensiones reales del fallback", () => {
    const { project } = projectWithSocialAsset({ width: 1200, height: 630 });
    const html = String(exportProject(project, { mode: "draft" }).files.get("index.html"));
    expect(html).toContain(
      '<meta property="og:image" content="https://tienda-referencia.example/assets/social-crop-fallback.jpg">',
    );
    expect(html).toContain('<meta property="og:image:width" content="768">');
    expect(html).toContain('<meta property="og:image:height" content="403">');
  });

  it("prefiere el og.jpg generado por el pipeline y declara 1200x630", () => {
    const { project } = projectWithSocialAsset();
    const result = exportProject(project, {
      mode: "production",
      socialImageCrops: new Map([
        ["asset-social-crop", { dataUrl: VALID_JPEG_DATA_URL, width: 1200, height: 630 }],
      ]),
    });
    const html = String(result.files.get("index.html"));
    expect(html).toContain(
      '<meta property="og:image" content="https://tienda-referencia.example/assets/social-crop-og.jpg">',
    );
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta property="og:image:type" content="image/jpeg">');
    expect(result.files.get("assets/social-crop-og.jpg")).toBeInstanceOf(Uint8Array);
  });

  it("escribe un único og.jpg por imagen única compartida entre productos", () => {
    const project = structuredClone(referenceStore) as typeof referenceStore;
    const [firstProduct, secondProduct] = project.products;
    if (!firstProduct || !secondProduct) throw new Error("Fixture incompleto");
    secondProduct.imageIds = [firstProduct.imageIds[0] ?? ""];
    const result = exportProject(project, {
      mode: "production",
      socialImageCrops: new Map([
        [
          firstProduct.imageIds[0] ?? "",
          { dataUrl: VALID_JPEG_DATA_URL, width: 1200, height: 630 },
        ],
      ]),
    });
    const ogFiles = [...result.files.keys()].filter((path) => path.endsWith("-og.jpg"));
    expect(ogFiles).toEqual(["assets/fixture-manta-og.jpg"]);
    for (const slug of [firstProduct.slug, secondProduct.slug]) {
      const html = String(result.files.get(`productos/${slug}/index.html`));
      expect(html).toContain(
        '<meta property="og:image" content="https://tienda-referencia.example/assets/fixture-manta-og.jpg">',
      );
      expect(html).toContain('<meta property="og:image:width" content="1200">');
      expect(html).toContain('<meta property="og:image:height" content="630">');
    }
  });

  it("no genera og.jpg cuando la fuente es menor a 1200x630 y declara dims reales del fallback", () => {
    const { project } = projectWithSocialAsset({ width: 900, height: 600 });
    expect(
      collectSocialCropRequests(project).some((request) => request.assetId === "asset-social-crop"),
    ).toBe(false);
    const result = exportProject(project, { mode: "production" });
    expect([...result.files.keys()].filter((path) => path.endsWith("-og.jpg"))).toEqual([]);
    const html = String(result.files.get("index.html"));
    expect(html).toContain(
      '<meta property="og:image" content="https://tienda-referencia.example/assets/social-crop-fallback.jpg">',
    );
    expect(html).toContain('<meta property="og:image:width" content="768">');
    expect(html).toContain('<meta property="og:image:height" content="512">');
  });

  it("colecta pedidos de recorte social deduplicados por imagen única", () => {
    const project = structuredClone(catalogModernStore);
    const [firstProduct, secondProduct] = project.products;
    if (!firstProduct || !secondProduct) throw new Error("Fixture incompleto");
    firstProduct.imageIds = ["asset-manta"];
    secondProduct.imageIds = ["asset-manta"];
    const requests = collectSocialCropRequests(project);
    const mantaRequests = requests.filter((request) => request.assetId === "asset-manta");
    expect(mantaRequests).toHaveLength(1);
    expect(mantaRequests[0]).toMatchObject({
      assetId: "asset-manta",
      width: 1254,
      height: 1254,
    });
    expect(mantaRequests[0]?.source.startsWith("data:image/webp")).toBe(true);
    expect(requests.every((request) => request.source.startsWith("data:"))).toBe(true);
    expect(requests.some((request) => request.assetId === "asset-hero")).toBe(true);
  });

  it("excluye de los recortes sociales las fuentes menores a 1200x630", () => {
    const { project } = projectWithSocialAsset({ width: 900, height: 600 });
    expect(
      collectSocialCropRequests(project).some((request) => request.assetId === "asset-social-crop"),
    ).toBe(false);
  });

  it("excluye de los recortes sociales los assets remotos y los favicons", () => {
    const remoteAsset = {
      kind: "image" as const,
      id: "asset-remote-social" as (typeof referenceStore.assets)[number]["id"],
      name: "Portada remota",
      alt: "Portada remota",
      mimeType: "image/jpeg",
      source: "https://images.example.com/foto.jpg",
      width: 1800,
      height: 1200,
      hash: "remote-social",
    };
    const faviconAsset = {
      kind: "image" as const,
      id: "asset-favicon-social" as (typeof referenceStore.assets)[number]["id"],
      name: "Favicon social",
      alt: "Favicon social",
      mimeType: "image/x-icon",
      source: "data:image/x-icon;base64,AAABAA==",
      width: 256,
      height: 256,
      hash: "favicon-social",
    };
    const project = {
      ...referenceStore,
      assets: [...referenceStore.assets, remoteAsset, faviconAsset],
      seo: { ...referenceStore.seo, socialImageId: remoteAsset.id },
    } as typeof referenceStore;
    const requests = collectSocialCropRequests(project);
    expect(requests.some((request) => request.assetId === "asset-remote-social")).toBe(false);
    expect(requests.some((request) => request.assetId === "asset-favicon-social")).toBe(false);
    expect(requests.every((request) => request.source.startsWith("data:"))).toBe(true);
  });
});
