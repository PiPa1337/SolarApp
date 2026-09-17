import {
  CATALOG_MODERN_PLACEHOLDER_PHONE,
  CategorySchema,
  type ImageAsset,
  type StoreSection,
  type VideoAsset,
} from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { catalogModernCleanStore } from "@solara/project-schema/catalog-modern-template";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  catalogModernModules,
  contactV2Modules,
  createModuleSection,
  getModuleDefinition,
  getTypedModule,
  MOBILE_HERO_SQUARE_FIX,
  MODULE_STYLE_BLOCKS,
  moduleRegistry,
  officialModules,
  PRODUCT_GALLERY_MOBILE_FIX,
  renderSections,
  replaceModuleInSection,
  STORE_BASE_STYLES,
  STORE_THEME_TOKEN_STYLES,
} from "./index";

describe("official module system", () => {
  it("registers every official module under a stable id", () => {
    expect(Object.keys(moduleRegistry)).toEqual(
      expect.arrayContaining([
        "announcement-bar",
        "editorial-header",
        "hero-media",
        "split-hero",
        "editorial-hero",
        "collection-grid",
        "editorial-product-grid",
        "compact-product-grid",
        "product-detail",
        "image-text-content",
        "trust-strip",
        "cart-drawer",
        "editorial-footer",
      ]),
    );
    expect(getModuleDefinition("split-hero")?.manifest.slots).toContain("hero");
  });

  it("crea secciones válidas y rechaza módulos incompatibles con el slot", () => {
    const section = createModuleSection({
      id: "section-created" as StoreSection["id"],
      slot: "hero",
      moduleId: "hero-media",
    });

    expect(section.settings).toEqual(getModuleDefinition("hero-media")?.settingsSchema.parse({}));
    expect(section.enabled).toBe(true);
    expect(() =>
      createModuleSection({
        id: "section-invalid" as StoreSection["id"],
        slot: "footer",
        moduleId: "hero-media",
      }),
    ).toThrow(/no es compatible/i);
  });

  it("describes every schema setting exactly once and provides valid defaults", () => {
    for (const definition of officialModules) {
      const defaults = definition.settingsSchema.parse({});
      const schemaKeys = Object.keys(defaults).sort();
      const fieldKeys = definition.settingsFields.map((field) => field.key);

      expect(fieldKeys, definition.manifest.id).toHaveLength(new Set(fieldKeys).size);
      expect([...fieldKeys].sort(), definition.manifest.id).toEqual(schemaKeys);
      expect([...definition.manifest.compatibleSettings].sort(), definition.manifest.id).toEqual(
        schemaKeys,
      );
      expect(definition.settingsSchema.safeParse(defaults).success, definition.manifest.id).toBe(
        true,
      );
    }
  });

  it("los ítems de repeater requieren id propio y aceptan los defaults del editor", () => {
    for (const definition of [...officialModules, ...catalogModernModules]) {
      for (const field of definition.settingsFields) {
        if (field.type !== "repeater") continue;
        const defaults = definition.settingsSchema.parse({});
        const editorItem = {
          id: `item-${crypto.randomUUID()}`,
          ...Object.fromEntries(
            field.fields.map((itemField) => [
              itemField.key,
              itemField.type === "boolean"
                ? false
                : itemField.type === "number"
                  ? (itemField.min ?? 0)
                  : itemField.type === "select"
                    ? (itemField.options?.[0]?.value ?? "")
                    : itemField.key === "id"
                      ? `item-${crypto.randomUUID()}`
                      : itemField.key === field.itemLabelKey || itemField.key === "title"
                        ? "Nuevo elemento"
                        : itemField.key === "author"
                          ? "Nueva persona"
                          : itemField.key === "body"
                            ? "Texto editable"
                            : itemField.key === "categoryId"
                              ? (catalogModernStore.categories[0]?.id ?? "")
                              : itemField.key === "actionLabel"
                                ? "Ver más"
                                : itemField.key === "actionHref"
                                  ? "/"
                                  : "",
            ]),
          ),
        };
        const withItem = definition.settingsSchema.safeParse({
          ...defaults,
          [field.key]: [editorItem],
        });
        expect(withItem.success, definition.manifest.id).toBe(true);
        const withoutId = definition.settingsSchema.safeParse({
          ...defaults,
          [field.key]: [{ ...editorItem, id: "" }],
        });
        expect(withoutId.success, `${definition.manifest.id} exige id en el ítem`).toBe(false);
      }
    }
  });

  it("isolates every module style selector under its module root", () => {
    for (const [moduleId, styles] of Object.entries(MODULE_STYLE_BLOCKS)) {
      const selectors = styles
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith("{") && !line.startsWith("@"))
        .map((line) => line.slice(0, -1).trim());

      expect(selectors.length).toBeGreaterThan(0);
      // Split por comas de primer nivel: :is()/:has() pueden agrupar
      // selectores con comas internas sin romper el aislamiento.
      const splitTopLevel = (group: string): string[] => {
        const parts: string[] = [];
        let depth = 0;
        let current = "";
        for (const char of group) {
          if (char === "(") depth += 1;
          else if (char === ")") depth = Math.max(0, depth - 1);
          if (char === "," && depth === 0) {
            parts.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        parts.push(current);
        return parts;
      };
      for (const selectorGroup of selectors) {
        for (const selector of splitTopLevel(selectorGroup)) {
          const trimmed = selector.trim();
          const scoped =
            trimmed.startsWith(":root") ||
            trimmed.startsWith("html") ||
            trimmed.startsWith("body") ||
            trimmed.startsWith("*") ||
            trimmed.startsWith(":where") ||
            (moduleId === "catalog-modern-v2"
              ? trimmed.startsWith(".cm.v2")
              : moduleId.startsWith("catalog-modern")
                ? trimmed.startsWith(`[data-solara-store].${moduleId}`)
                : trimmed.startsWith(`[data-solara-module="${moduleId}"]`));
          expect(scoped).toBe(true);
        }
      }
    }
  });

  it("hereda los estados visuales de la paleta activa en Catalog Modern", () => {
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];

    expect(v2Styles).toContain("--catalog-sale: var(--solara-sale");
    expect(v2Styles).toContain("--catalog-rating: var(--solara-rating");
    expect(v2Styles).toContain("--catalog-accent-alt: var(--solara-accent-alt");
    expect(v2Styles).toContain("color: var(--catalog-paper)");
    expect(v2Styles).toContain("color-mix(in srgb, var(--catalog-ink)");
    expect(v2Styles).not.toContain("--catalog-sale: #a63d2f;");
    expect(v2Styles).not.toContain("rgb(11 11 12");
    expect(v2Styles).toContain("--catalog-v2-wide: var(--solara-container");
    expect(v2Styles).toContain("--catalog-v2-motion-component: var(--solara-motion-normal");
    expect(v2Styles).toContain("calc(var(--solara-card-gap");
    expect(v2Styles).toContain("var(--solara-border-width");
    expect(v2Styles).toMatch(/\.cm\.v2 \.catalog-eyebrow\s*\{[^}]*color: var\(--solara-accent\)/);
    expect(v2Styles).toContain(".cm.v2 .contact-channel-row:hover > span:last-child");
    expect(v2Styles).toContain("color: var(--solara-accent);");
    expect(v2Styles).toMatch(
      /\.cm\.v2 \.contact-form-actions \.contact-form-whatsapp\s*\{[\s\S]*background: var\(--catalog-ink\);[\s\S]*color: var\(--catalog-paper\);/,
    );
    expect(v2Styles).toContain(".cm.v2 .contact-form-actions .contact-form-whatsapp::before");
    expect(v2Styles).toContain(
      "background: color-mix(in srgb, var(--catalog-ink) 82%, var(--catalog-paper));",
    );
    expect(v2Styles).not.toMatch(
      /\.contact-form-whatsapp\s*\{[^}]*background: var\(--catalog-accent-alt\)/,
    );

    expect(STORE_BASE_STYLES).not.toContain("var(--solara-dark-");
    expect(STORE_BASE_STYLES).not.toContain("--solara-background: #1d1e19");
    expect(STORE_BASE_STYLES).toContain(".solara-consumer-rights {");
    expect(STORE_BASE_STYLES).toContain("grid-column: 1 / -1;");
    expect(STORE_BASE_STYLES).not.toMatch(/\.solara-consumer-rights\s*\{[^}]*position:\s*fixed/);
    expect(STORE_THEME_TOKEN_STYLES).toContain("var(--solara-line-height-tight");
  });

  it("alinea los márgenes del sitio v2 con el gutter de 3rem y limpia el CSS muerto", () => {
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!v2Styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    // P1: las páginas con contenedor comparten la línea vertical del header y del footer.
    expect(v2Styles).toMatch(/\.cm\.v2 main\.solara-container\s*\{[^}]*padding-inline:\s*0/);

    // P6: los relacionados no acumulan la anidación del contenedor base.
    expect(v2Styles).toMatch(
      /\.cm\.v2 \.solara-related-products\s*>\s*\.solara-container\s*\{[^}]*width:\s*100%/,
    );
    expect(v2Styles).toMatch(
      /\.cm\.v2 \.solara-related-products\s*>\s*\.solara-container\s*\{[^}]*padding-inline:\s*0/,
    );

    // P7: el mega menú (absoluto respecto del header-inner) usa width 100% para
    // quedar exactamente en la línea vertical del gutter v2, con padding contenido.
    expect(v2Styles).toMatch(/\.cm\.v2 \.catalog-mega-menu\s*\{[^}]*width:\s*100%/);
    expect(v2Styles).toMatch(
      /\.cm\.v2 \.catalog-mega-menu\s*\{[^}]*padding:\s*clamp\(2rem,\s*4vw,\s*3rem\)\s+clamp\(1\.5rem,\s*3vw,\s*2\.5rem\)\s+1\.5rem/,
    );

    // P8: la paginación se centra sobre la grilla de resultados, no sobre el main.
    expect(v2Styles).toMatch(
      /\.cm\.v2 \.catalog-category-page\s*>\s*\.solara-pagination\s*\{[^}]*padding-left:\s*calc\(270px \+ 1rem\)/,
    );

    // P3: el anuncio libera espacio útil en móvil sin tapar el botón de cerrar.
    expect(v2Styles).toMatch(
      /@media \(max-width: ?767px\)\s*\{[^@]*\.cm\.v2 \.catalog-announcement-inner\s*\{[^}]*padding-left:\s*1rem/,
    );

    // P8: reset móvil de la paginación coherente con el layout de una columna.
    expect(v2Styles).toMatch(
      /@media \(max-width: ?767px\)\s*\{[^@]*\.cm\.v2 \.catalog-category-page\s*>\s*\.solara-pagination\s*\{[^}]*padding-left:\s*0/,
    );

    // P5: sin declaraciones ni variables muertas.
    expect(v2Styles).not.toContain("--catalog-v2-reading");
    expect(v2Styles).not.toContain("clamp(1.5rem, 2.4vw, 3rem)");
    expect(v2Styles).not.toContain("clamp(2.5rem, 4vw, 5rem)");
    expect(v2Styles).not.toMatch(
      /\.cm\.v2 \.catalog-product-grid-section,\s*\.cm\.v2 \.catalog-testimonials-section\s*\{\s*padding-block:/,
    );
    expect(v2Styles).not.toMatch(
      /\.cm\.v2 \.catalog-category-bento-section\s*\{[^}]*padding-block:\s*clamp\(2\.6rem,\s*4\.6vw,\s*4\.6rem\)/,
    );
  });

  it("estira la info de ficha a todo el ancho en móvil (sin hueco derecho)", () => {
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!v2Styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    // En columna móvil, align-self:start encogería la info a su contenido y
    // dejaría un hueco a la derecha; debe estirarse al contenedor.
    expect(v2Styles).toMatch(
      /@media \(max-width: ?767px\)\s*\{[^@]*\.cm\.v2 \.catalog-product-info\s*\{[^}]*align-self:\s*stretch/,
    );
  });

  it("delega el appear del CTA de novedades al motion declarativo", () => {
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!v2Styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    expect(v2Styles).not.toContain(
      '.cm.v2 [data-solara-module="catalog-newsletter-cta"][data-motion-visible="true"]',
    );

    const reducedMotionStart = v2Styles.indexOf("@media (prefers-reduced-motion: reduce)");
    const reducedMotionStyles = v2Styles.slice(reducedMotionStart);
    expect(reducedMotionStyles).not.toContain(
      '.cm.v2 [data-solara-module="catalog-newsletter-cta"] .catalog-newsletter-inner,',
    );
  });

  it("preserves compatible hero settings when replacing its visual treatment", () => {
    const hero = referenceStore.sections.find((section) => section.moduleId === "hero-media");
    expect(hero).toBeDefined();
    const source = {
      ...hero,
      settings: { ...hero?.settings, editorOnlyValue: "remove-me" },
    } as StoreSection;

    const replacement = replaceModuleInSection(source, "editorial-hero");

    expect(replacement.moduleId).toBe("editorial-hero");
    expect(replacement.settings.title).toBe(source.settings.title);
    expect(replacement.settings.imageId).toBe(source.settings.posterAssetId);
    expect(replacement.settings).not.toHaveProperty("editorOnlyValue");
  });

  it("preserves compatible grid settings in both replacement directions", () => {
    const catalog = referenceStore.sections.find((section) => section.slot === "catalog");
    expect(catalog).toBeDefined();
    const source = {
      ...catalog,
      moduleId: "editorial-product-grid",
      settings: { title: "Selección", limit: 7, editorOnlyValue: "remove-me" },
    } as StoreSection;

    const compact = replaceModuleInSection(source, "compact-product-grid");
    const editorial = replaceModuleInSection(compact, "editorial-product-grid");

    expect(compact.settings).toEqual({ title: "Selección", limit: 7 });
    expect(editorial.settings).toEqual({ title: "Selección", limit: 7 });
  });

  it("drops incompatible settings and applies target defaults", () => {
    const content = referenceStore.sections[0];
    expect(content).toBeDefined();
    const source = {
      ...content,
      slot: "content",
      moduleId: "unknown-content",
      settings: { title: "Historia", body: "<p>Texto</p>", editorOnlyValue: true },
    } as StoreSection;

    const replacement = replaceModuleInSection(source, "image-text-content");

    expect(replacement.settings).toEqual({
      title: "Historia",
      body: "<p>Texto</p>",
      imageId: "",
      imageSide: "left",
      actionLabel: "",
      actionHref: "",
    });
  });

  it("renders semantic content and escapes project data", () => {
    const project = {
      ...referenceStore,
      identity: { ...referenceStore.identity, brandName: "<Casa segura>" },
    };
    const html = renderSections(project);

    expect(html).toContain("&lt;Casa segura&gt;");
    expect(html).not.toContain("<Casa segura>");
    expect(html).toContain('data-solara-module="hero-media"');
    expect(html).toContain(referenceStore.products[0]?.title);
  });

  it("mantiene el hero dividido y editorial con media y clases propias", () => {
    const source = referenceStore.sections.find((section) => section.moduleId === "hero-media");
    if (!source) throw new Error("Fixture sin hero");
    const split = replaceModuleInSection(
      { ...source, settings: { ...source.settings, imagePosition: "left" } },
      "split-hero",
    );
    const editorial = replaceModuleInSection(
      { ...source, settings: { ...source.settings, imagePosition: "right" } },
      "editorial-hero",
    );
    const splitHtml = renderSections(referenceStore, [split]);
    const editorialHtml = renderSections(referenceStore, [editorial]);

    expect(splitHtml).toContain('data-solara-module="split-hero"');
    expect(splitHtml).toContain("solara-split-hero--left");
    expect(splitHtml).toContain("solara-hero-copy");
    expect(splitHtml).toContain("solara-hero-media");
    expect(editorialHtml).toContain('data-solara-module="editorial-hero"');
    expect(editorialHtml).toContain("solara-editorial-hero--right");
    expect(editorialHtml).toContain("solara-editorial-head");
  });

  it("deriva los textos accesibles del carrusel y video legacy del copy global", () => {
    const source = referenceStore.sections.find((section) => section.moduleId === "hero-media");
    const image = referenceStore.assets[0];
    if (!source || !image) throw new Error("Fixture sin hero o imagen");
    const project = structuredClone(referenceStore);
    project.publicCopy.hero.pauseVideo = "Pausar campaña";
    project.publicCopy.accessibility.heroSlides = "Historias destacadas";
    project.publicCopy.accessibility.goToSlide = "Abrir historia {index}";
    const carousel = {
      ...source,
      settings: {
        ...source.settings,
        mode: "carousel",
        slides: [
          {
            id: "hero-slide-copy",
            eyebrow: "",
            title: "Historia",
            body: "",
            actionLabel: "",
            actionHref: "#",
            imageId: image.id,
          },
          {
            id: "hero-slide-copy-2",
            eyebrow: "",
            title: "Historia 2",
            body: "",
            actionLabel: "",
            actionHref: "#",
            imageId: image.id,
          },
        ],
      },
    };

    const carouselHtml = renderSections(project, [carousel]);
    expect(carouselHtml).toContain('aria-label="Historias destacadas"');
    expect(carouselHtml).toContain('aria-label="Abrir historia 1"');

    const videoAsset: VideoAsset = {
      kind: "video",
      id: "hero-copy-video" as VideoAsset["id"],
      name: "Video de campaña",
      alt: "Video de campaña",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,AAAA",
      width: 640,
      height: 360,
      durationSeconds: 2,
      hash: "hero-copy-video-hash",
    };
    project.videos = [videoAsset];
    const video = {
      ...source,
      settings: { ...source.settings, mode: "video", videoAssetId: videoAsset.id },
    };
    expect(renderSections(project, [video])).toContain("Pausar campaña");
  });

  it("muestra doce productos en la grilla principal de la home de escala", () => {
    const html = renderSections(catalogScaleStore, catalogScaleStore.sections, {
      pageType: "home",
    });
    const productCards = html.match(/data-product-card/g) ?? [];
    expect(productCards).toHaveLength(12);
    expect(html.indexOf('data-solara-module="compact-product-grid"')).toBeLessThan(
      html.indexOf('data-solara-module="collection-grid"'),
    );
  });

  it("renderiza cards Catalog Modern con categoría y sin reseñas ni disponibilidad", () => {
    const html = renderSections(catalogModernStore, catalogModernStore.sections, {
      pageType: "home",
    });
    const firstGrid = html.slice(
      html.indexOf('data-solara-module="catalog-product-grid"'),
      html.indexOf(
        'data-solara-module="catalog-product-grid"',
        html.indexOf('data-solara-module="catalog-product-grid"') + 1,
      ),
    );

    expect(firstGrid).toContain('class="catalog-product-category"');
    expect(firstGrid).not.toContain("catalog-product-rating");
    expect(firstGrid).not.toContain("catalog-product-availability");
  });

  it("renderiza el hero en modo video con loop mudo y sin imagen de portada", () => {
    const project = structuredClone(catalogModernStore);
    const section = project.sections.find(
      (candidate) => candidate.moduleId === "catalog-hero" && candidate.enabled !== false,
    );
    if (!section) throw new Error("Fixture sin hero");
    const video: VideoAsset = {
      kind: "video",
      id: "video-render-test" as VideoAsset["id"],
      name: "Look de temporada",
      alt: "Video de la campaña",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,AAAA",
      width: 1080,
      height: 1920,
      durationSeconds: 8,
      hash: "video-render-hash",
    };
    project.videos = [video];
    section.settings = {
      ...section.settings,
      mode: "video",
      videoAssetId: video.id,
      posterAssetId: "",
    };
    const html = renderSections(project, [section], { pageType: "home" });
    const hero = html.slice(html.indexOf('data-solara-module="catalog-hero"'));
    const videoTag = hero.slice(hero.indexOf("<video"), hero.indexOf("</video>") + 8);
    expect(videoTag).toContain("<video");
    expect(videoTag).toContain("muted");
    expect(videoTag).toContain("loop");
    expect(videoTag).toContain("playsinline");
    expect(videoTag).toMatch(/\sautoplay\b/);
    expect(videoTag).toContain('src="data:video/mp4;base64,AAAA"');
    expect(hero).not.toContain('class="catalog-hero-image"');
  });

  it("V2 conserva sólo la media frontal y omite el fondo ancho del hero", () => {
    const project = structuredClone(catalogModernV2Store);
    const section = project.sections.find((candidate) => candidate.moduleId === "catalog-hero");
    if (!section) throw new Error("Fixture V2 sin hero");
    section.settings = { ...section.settings, backgroundImageId: "asset-hero" };
    const hero = renderSections(project, [section], { pageType: "home" });

    expect(hero).toContain('class="catalog-hero-media"');
    expect(hero).not.toContain('class="catalog-hero-background"');
  });

  it("en modo video autoplay es obligatorio aunque el setting diga false", () => {
    const project = structuredClone(catalogModernStore);
    const section = project.sections.find(
      (candidate) => candidate.moduleId === "catalog-hero" && candidate.enabled !== false,
    );
    if (!section) throw new Error("Fixture sin hero");
    const video: VideoAsset = {
      kind: "video",
      id: "video-autoplay-test" as VideoAsset["id"],
      name: "look",
      alt: "",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,AAAA",
      width: 1080,
      height: 1920,
      durationSeconds: 8,
      hash: "video-autoplay-hash",
    };
    project.videos = [video];
    section.settings = {
      ...section.settings,
      mode: "video",
      videoAssetId: video.id,
      autoplay: false,
    };
    const html = renderSections(project, [section], { pageType: "home" });
    const hero = html.slice(html.indexOf('data-solara-module="catalog-hero"'));
    const videoTag = hero.slice(hero.indexOf("<video"), hero.indexOf("</video>") + 8);
    expect(videoTag).toMatch(/\sautoplay\b/);
  });

  it("usa el poster automático del video como preload", () => {
    const project = structuredClone(catalogModernStore);
    const section = project.sections.find(
      (candidate) => candidate.moduleId === "catalog-hero" && candidate.enabled !== false,
    );
    if (!section) throw new Error("Fixture sin hero");
    const poster: ImageAsset = {
      kind: "image",
      id: "asset-poster-test" as ImageAsset["id"],
      name: "look (preload)",
      alt: "Preload de look",
      mimeType: "image/webp",
      source: "data:image/webp;base64,UE9TVEVS",
      width: 360,
      height: 640,
      hash: "poster-hash",
    };
    const video: VideoAsset = {
      kind: "video",
      id: "video-poster-test" as VideoAsset["id"],
      name: "look",
      alt: "",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,AAAA",
      width: 1080,
      height: 1920,
      durationSeconds: 8,
      hash: "video-hash",
      posterAssetId: poster.id,
    };
    project.assets = [...project.assets, poster];
    project.videos = [video];
    section.settings = {
      ...section.settings,
      mode: "video",
      videoAssetId: video.id,
      posterAssetId: "",
    };
    const html = renderSections(project, [section], { pageType: "home" });
    expect(html).toContain('poster="data:image/webp;base64,UE9TVEVS"');
  });

  it("deriva el bento sólo desde categorías madre y alterna proporciones", () => {
    const html = renderSections(catalogModernStore, catalogModernStore.sections, {
      pageType: "home",
    });
    const bentoStart = html.indexOf('data-solara-module="catalog-category-bento"');
    const bentoEnd = html.indexOf('data-solara-module="catalog-testimonials"', bentoStart);
    const bento = html.slice(bentoStart, bentoEnd);
    const rootCategories = catalogModernStore.categories.filter((category) => !category.parentId);
    const childCategories = catalogModernStore.categories.filter((category) => category.parentId);
    expect(bento.match(/class="catalog-category-bento-item /g) ?? []).toHaveLength(
      rootCategories.length,
    );
    expect(bento).toContain(rootCategories[0]?.title);
    expect(bento).toContain(rootCategories.at(-1)?.title);
    childCategories.forEach((category) => {
      expect(bento).not.toContain(`href="/categorias/${category.slug}/"`);
    });
    expect(bento).toContain("catalog-category-bento-item--wide");
    expect(bento).toContain("catalog-category-bento-item--tall");
    expect(bento).toContain("catalog-category-bento-item--compact");
    expect(
      [...bento.matchAll(/catalog-category-bento-item--(wide|tall|compact)/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["wide", "tall", "tall", "wide", "compact", "compact", "compact", "compact"]);
    expect(bento).toContain('sizes="(max-width: 767px) calc(100vw - 3.5rem)');
    expect(bento).toContain('sizes="(max-width: 767px) calc((100vw - 4.25rem) / 2)');
    expect(bento).toContain(catalogModernStore.publicCopy.navigation.viewAll);
    expect(bento).toContain('href="/categorias/');
  });

  it("separa la imagen cuadrada de la información y expone contador y flecha", () => {
    const html = renderSections(catalogModernStore, catalogModernStore.sections, {
      pageType: "home",
    });
    const bentoStart = html.indexOf('data-solara-module="catalog-category-bento"');
    const bentoEnd = html.indexOf('data-solara-module="catalog-testimonials"', bentoStart);
    const bento = html.slice(bentoStart, bentoEnd);

    expect(bento).toMatch(
      /catalog-category-bento-media[^>]*>.*?<\/div><div class="catalog-category-bento-copy">/s,
    );
    expect(bento).toContain('class="catalog-category-bento-count"');
    expect(bento).toContain('class="catalog-category-bento-arrow" aria-hidden="true"');
  });

  it("recalcula el mosaico automático al cambiar las categorías madre", () => {
    const section = catalogModernStore.sections.find(
      (candidate) => candidate.moduleId === "catalog-category-bento",
    );
    if (!section) throw new Error("Fixture sin bento de categorías");
    const roots = catalogModernStore.categories.filter((category) => !category.parentId);
    const project = structuredClone(catalogModernStore);

    for (const count of [1, 4, 5]) {
      project.categories = roots.slice(0, count);
      const html = renderSections(project, [section], { pageType: "home" });
      const layouts = [...html.matchAll(/catalog-category-bento-item--(wide|tall|compact)/g)].map(
        (match) => match[1],
      );
      expect(layouts).toEqual(
        count === 1
          ? ["wide"]
          : count === 4
            ? ["wide", "tall", "compact", "compact"]
            : ["wide", "tall", "tall", "compact", "compact"],
      );
    }
  });

  it("usa un placeholder neutral cuando la categoría no tiene imagen posible", () => {
    const section = catalogModernStore.sections.find(
      (candidate) => candidate.moduleId === "catalog-category-bento",
    );
    if (!section) throw new Error("Fixture sin bento de categorías");
    const project = structuredClone(catalogModernStore);
    const root = project.categories.find((category) => !category.parentId);
    if (!root) throw new Error("Fixture sin categorías madre");
    root.imageId = undefined;
    project.categories = [root];
    project.products = project.products.filter((product) => !root.productIds.includes(product.id));
    const html = renderSections(project, [section], { pageType: "home" });
    expect(html).toContain(
      `<div class="solara-category-placeholder" aria-hidden="true">${root.title.charAt(0).toUpperCase()}</div>`,
    );
    expect(html).not.toContain("catalog-category-bento-image");
    expect(html).not.toContain("catalog-category-bento-fallback");
  });

  it("no emite el placeholder cuando la categoría del bento tiene imagen", () => {
    const section = catalogModernStore.sections.find(
      (candidate) => candidate.moduleId === "catalog-category-bento",
    );
    if (!section) throw new Error("Fixture sin bento de categorías");
    const html = renderSections(catalogModernStore, [section], { pageType: "home" });
    expect(html).toContain("catalog-category-bento-image");
    expect(html).not.toContain("solara-category-placeholder");
  });

  it("estila el placeholder del bento bajo el atributo raíz del módulo", () => {
    const styles = Object.values(MODULE_STYLE_BLOCKS).join("\n");
    expect(styles).toContain("[data-solara-store].catalog-modern .solara-category-placeholder");
    expect(styles).not.toContain("bento-fallback");
  });

  it("respeta showRating en las cards y expone el resumen de reseñas visible", () => {
    const sections = catalogModernStore.sections.map((section) =>
      section.id === "modo-section-new"
        ? { ...section, settings: { ...section.settings, showRating: true } }
        : section,
    );
    const html = renderSections(catalogModernStore, sections, { pageType: "home" });
    const firstGrid = html.slice(
      html.indexOf('data-solara-module="catalog-product-grid"'),
      html.indexOf(
        'data-solara-module="catalog-product-grid"',
        html.indexOf('data-solara-module="catalog-product-grid"') + 1,
      ),
    );

    expect(firstGrid.match(/class="catalog-product-rating"/g) ?? []).toHaveLength(0);
    expect(firstGrid).not.toContain('aria-label="4.7 de 5"');
    expect(firstGrid).not.toContain("4.7 / 5 · 6 reseñas");
  });

  it("mantiene la marca interna de testimonios fuera del inspector", () => {
    const testimonials = catalogModernModules.find(
      (definition) => definition.manifest.id === "catalog-testimonials",
    );
    if (!testimonials) throw new Error("Falta el módulo catalog-testimonials");
    const repeater = testimonials.settingsFields.find((field) => field.type === "repeater");
    if (!repeater || repeater.type !== "repeater") {
      throw new Error("Falta el repeater de testimonios");
    }

    expect(repeater.fields.map((field) => field.key)).not.toContain("example");
    expect(testimonials.settingsSchema.parse({})).toEqual(expect.objectContaining({ items: [] }));
  });

  it("expone el rail de testimonios y sus controles con una relación accesible", () => {
    const section = catalogModernStore.sections.find(
      (item) => item.moduleId === "catalog-testimonials",
    );
    if (!section) throw new Error("Fixture sin testimonios");
    const html = renderSections(catalogModernStore, [section], { pageType: "home" });
    expect(html).toContain('role="group" aria-label="Controles de testimonios"');
    expect(html).toContain('class="catalog-testimonials-track"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Testimonios de clientes"');
    expect(html).toMatch(/aria-controls="catalog-testimonials-track-[^"]+"/);
    expect(html).toContain('aria-label="Testimonios de clientes" role="region"');
  });

  it("oculta testimonios cuando el repeater está vacío", () => {
    const section = catalogModernStore.sections.find(
      (item) => item.moduleId === "catalog-testimonials",
    );
    if (!section) throw new Error("Fixture sin testimonios");
    const empty = { ...section, settings: { ...section.settings, items: [] } };
    const html = renderSections(catalogModernStore, [empty], { pageType: "home" });
    expect(html).not.toContain('data-solara-module="catalog-testimonials"');
  });

  it("omite beneficios de confianza sin datos configurados", () => {
    const project = {
      ...referenceStore,
      identity: { ...referenceStore.identity, email: "", phone: "" },
      policies: {
        ...referenceStore.policies,
        shipping: { ...referenceStore.policies.shipping, summary: "" },
        returns: { ...referenceStore.policies.returns, summary: "" },
      },
    };
    const trust = referenceStore.sections.find((section) => section.moduleId === "trust-strip");
    if (!trust) throw new Error("Fixture sin trust strip");
    const html = renderSections(project, [trust]);

    expect(html).not.toContain("solara-trust-grid");
    expect(html).not.toContain("Confirmamos disponibilidad");
  });
});

describe("registro de módulos tipado", () => {
  it("resuelve el módulo exacto por id", () => {
    const hero = getTypedModule("catalog-hero");
    expect(hero?.manifest.id).toBe("catalog-hero");
    expect(getTypedModule("no-existe")).toBeUndefined();
  });

  it("afina el tipo por id del módulo", () => {
    const hero = getTypedModule("catalog-hero");
    expectTypeOf(hero).toMatchTypeOf<{ manifest: { id: "catalog-hero" } } | undefined>();
    expectTypeOf(hero).not.toMatchTypeOf<{ manifest: { id: "split-hero" } }>();
    expectTypeOf(getTypedModule("split-hero")).toMatchTypeOf<
      { manifest: { id: "split-hero" } } | undefined
    >();
  });

  it("mantiene ids únicos en el registro", () => {
    const ids = [...officialModules, ...catalogModernModules, ...contactV2Modules].map(
      (definition) => definition.manifest.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("catalog-hero");
  });
});

describe("variante única oculta en fichas (auditoría 2)", () => {
  const monoModernDetail = createModuleSection({
    id: "section-mono-modern" as StoreSection["id"],
    slot: "product",
    moduleId: "catalog-product-detail",
  });
  const monoLegacyDetail = createModuleSection({
    id: "section-mono-legacy" as StoreSection["id"],
    slot: "product",
    moduleId: "product-detail",
  });

  it("oculta label y select de variante en el detalle moderno mono-variante", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find(
      (candidate) => candidate.slug === "remera-esencial-de-algodon",
    );
    if (!product) throw new Error("Fixture sin remera esencial");
    const only = product.variants[0];
    if (!only) throw new Error("Fixture sin variantes");
    product.variants = [only];
    const html = renderSections(project, [monoModernDetail], {
      pageType: "product",
      product,
    });
    expect(html).toMatch(/<label for="catalog-variant-section-mono-modern"[^>]* hidden>/);
    expect(html).toContain("data-variant-select required hidden>");
    expect(html).not.toContain("catalog-variant-options");
  });

  it("muestra el selector en el detalle moderno multi-variante", () => {
    const product = catalogModernStore.products.find(
      (candidate) => candidate.slug === "remera-esencial-de-algodon",
    );
    if (!product || product.variants.length < 2) throw new Error("Fixture sin multi-variante");
    const html = renderSections(catalogModernStore, [monoModernDetail], {
      pageType: "product",
      product,
    });
    expect(html).not.toMatch(/<label for="catalog-variant-section-mono-modern"[^>]*hidden/);
    expect(html).not.toContain("data-variant-select required hidden");
    expect(html).not.toContain("catalog-variant-options");
  });

  it("oculta label y select de variante en el detalle legacy mono-variante", () => {
    const project = structuredClone(referenceStore);
    const product = project.products[0];
    if (!product) throw new Error("Fixture sin producto");
    const only = product.variants[0];
    if (!only) throw new Error("Fixture sin variantes");
    product.variants = [only];
    const html = renderSections(project, [monoLegacyDetail], {
      pageType: "product",
      product,
    });
    expect(html).toMatch(/<label for="variant-section-mono-legacy"[^>]* hidden>/);
    expect(html).toContain("data-variant-select required hidden>");
  });

  it("muestra el selector en el detalle legacy multi-variante", () => {
    const product = referenceStore.products[0];
    if (!product || product.variants.length < 2) throw new Error("Fixture sin multi-variante");
    const html = renderSections(referenceStore, [monoLegacyDetail], {
      pageType: "product",
      product,
    });
    expect(html).not.toMatch(/<label for="variant-section-mono-legacy"[^>]*hidden/);
    expect(html).not.toContain("data-variant-select required hidden");
  });
});

describe("galería producto con videos opcionales", () => {
  const modernVideoSection = createModuleSection({
    id: "section-modern-video" as StoreSection["id"],
    slot: "product",
    moduleId: "catalog-product-detail",
  });

  it("mezcla imágenes y videos con poster/controls y sin autoplay", () => {
    const project = structuredClone(catalogModernStore);
    const video = {
      kind: "video",
      id: "video-prod-001",
      name: "Demo",
      alt: "Demo video",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,AAAA",
      posterAssetId: project.assets[0]?.id,
      width: 640,
      height: 360,
      durationSeconds: 8,
      hash: "video-prod-hash-001",
    } as unknown as VideoAsset;
    project.videos = [video];
    const base = project.products.find((p) => p.status === "active");
    if (!base || !project.assets[0]) throw new Error("Fixture incompleto");
    const product = { ...base, imageIds: [project.assets[0].id], videoIds: [video.id] };
    const html = String(
      renderSections(project, [modernVideoSection], { pageType: "product", product }),
    );
    expect(html).toContain('data-gallery-media-id="video-prod-001"');
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain('preload="none"');
    expect(html).not.toContain("autoplay");
  });

  it("sin videos no emite video y conserva imagen (paridad)", () => {
    const project = structuredClone(catalogModernStore);
    project.videos = [];
    const base = project.products.find((p) => p.status === "active");
    if (!base) throw new Error("Fixture incompleto");
    const product = { ...base, videoIds: [] };
    const html = String(
      renderSections(project, [modernVideoSection], { pageType: "product", product }),
    );
    expect(html).not.toContain("<video");
    expect(html).toContain("data-gallery-image-id");
  });
});

describe("catalog-modern sin JavaScript y gating de búsqueda", () => {
  const modernDetailSection = createModuleSection({
    id: "section-modern-detail-test" as StoreSection["id"],
    slot: "product",
    moduleId: "catalog-product-detail",
  });
  const legacyDetailSection = createModuleSection({
    id: "section-legacy-detail-test" as StoreSection["id"],
    slot: "product",
    moduleId: "product-detail",
  });

  it("ofrece consulta por WhatsApp sin JavaScript en el detalle moderno", () => {
    const product = catalogModernStore.products.find(
      (candidate) => candidate.slug === "remera-esencial-de-algodon",
    );
    if (!product) throw new Error("Fixture sin remera esencial");
    const html = renderSections(catalogModernStore, [modernDetailSection], {
      pageType: "product",
      product,
    });

    expect(html).toContain("<noscript>");
    expect(html).toContain('class="catalog-add-fallback"');
    expect(html).toContain(".catalog-add-fallback{display:");
    expect(html).toContain('href="https://wa.me/5491123456789?text=');
    expect(html).toContain("Remera esencial de algodón");
  });

  it("no ofrece consulta por WhatsApp cuando el teléfono es el sentinel de plantilla", () => {
    const project = structuredClone(catalogModernStore);
    project.whatsapp = { ...project.whatsapp, phone: CATALOG_MODERN_PLACEHOLDER_PHONE };
    const product = project.products.find(
      (candidate) => candidate.slug === "remera-esencial-de-algodon",
    );
    if (!product) throw new Error("Fixture sin remera esencial");
    const html = renderSections(project, [modernDetailSection], {
      pageType: "product",
      product,
    });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("catalog-add-fallback");
    expect(html).not.toContain(CATALOG_MODERN_PLACEHOLDER_PHONE);
  });

  it("ofrece consulta por WhatsApp sin JavaScript en el detalle legacy", () => {
    const product = referenceStore.products[0];
    if (!product) throw new Error("Fixture sin producto");
    const html = renderSections(referenceStore, [legacyDetailSection], {
      pageType: "product",
      product,
    });

    expect(html).toContain("<noscript>");
    expect(html).toContain('class="solara-add-fallback"');
    expect(html).toContain(".solara-add-fallback{display:");
    expect(html).toContain("https://wa.me/");
  });

  it("inicializa el detalle moderno en la variante disponible aunque la primera esté agotada", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find(
      (candidate) => candidate.slug === "remera-esencial-de-algodon",
    );
    if (!product) throw new Error("Fixture sin remera esencial");
    const soldOut = product.variants.find((variant) => !variant.available);
    if (!soldOut) throw new Error("Fixture sin variante agotada");
    product.variants = [soldOut, ...product.variants.filter((variant) => variant !== soldOut)];
    const available = product.variants.find((variant) => variant.available);
    if (!available) throw new Error("Fixture sin variante disponible");

    const html = renderSections(project, [modernDetailSection], {
      pageType: "product",
      product,
    });
    const selectHtml = html.slice(html.indexOf("data-variant-select"), html.indexOf("</select>"));
    const optionTags = selectHtml.match(/<option[^>]*>/g) ?? [];
    expect(optionTags[0]).toContain("disabled");
    expect(optionTags[0]).not.toContain("selected");
    const availableTag = optionTags.find((tag) => tag.includes(`value="${available.id}"`));
    expect(availableTag).toContain("selected");
  });

  it("inicializa el detalle legacy en la variante disponible aunque la primera esté agotada", () => {
    const project = structuredClone(referenceStore);
    const product = project.products[0];
    if (!product || product.variants.length < 2) throw new Error("Fixture sin variantes");
    const [first, second] = product.variants;
    if (!first || !second) throw new Error("Fixture sin variantes");
    product.variants = [{ ...second, available: false }, first];
    const available = product.variants.find((variant) => variant.available);
    if (!available) throw new Error("Fixture sin variante disponible");

    const html = renderSections(project, [legacyDetailSection], {
      pageType: "product",
      product,
    });
    const selectHtml = html.slice(html.indexOf("data-variant-select"), html.indexOf("</select>"));
    const optionTags = selectHtml.match(/<option[^>]*>/g) ?? [];
    expect(optionTags[0]).toContain("disabled");
    expect(optionTags[0]).not.toContain("selected");
    const availableTag = optionTags.find((tag) => tag.includes(`value="${available.id}"`));
    expect(availableTag).toContain("selected");
  });

  it("mantiene la navegación móvil accesible sin JavaScript", () => {
    const headerSection = createModuleSection({
      id: "section-modern-header-test" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const html = renderSections(catalogModernStore, [headerSection], { pageType: "home" });
    const noscripts = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map(
      (match) => match[1],
    );

    expect(noscripts.some((block) => block?.includes(".catalog-mobile-menu[hidden]"))).toBe(true);
    expect(html).toContain(
      '<div id="catalog-mobile-menu" class="catalog-mobile-menu" data-catalog-menu data-state="closed" hidden role="dialog"',
    );
    expect(html).toContain('class="catalog-mobile-menu__backdrop" data-catalog-menu-backdrop');
    expect(html).toContain('class="catalog-mobile-menu__panel"');
    expect(html).not.toContain('<aside id="catalog-mobile-menu"');
    const homeHtml = renderSections(catalogModernStore, catalogModernStore.sections, {
      pageType: "home",
    });
    expect(homeHtml).toContain("Ver opciones de contacto");
  });

  it("no emite rutas a /buscar/ cuando la búsqueda está deshabilitada", () => {
    const project = structuredClone(catalogModernStore);
    project.commerceTemplates.search.enabled = false;

    const html = renderSections(project, project.sections, { pageType: "home" });
    expect(html).not.toContain("/buscar/");
    expect(html).not.toContain("catalog-search-dialog");
    expect(html).not.toContain("catalog-mobile-search");

    const enabledHtml = renderSections(catalogModernStore, catalogModernStore.sections, {
      pageType: "home",
    });
    expect(enabledHtml).toContain("/buscar/");
    expect(enabledHtml).toContain("catalog-search-dialog");
  });

  it("no emite /buscar/ en la plantilla limpia cuando la búsqueda está apagada", () => {
    const project = structuredClone(catalogModernCleanStore);
    project.commerceTemplates.search.enabled = false;

    const html = renderSections(project, project.sections, { pageType: "home" });
    expect(html).not.toContain("/buscar/");
    // Sin categorías el fallback es la home; nunca `/categorias/` (404 latente).
    expect(html).toContain('class="catalog-view-all" href="/"');
    expect(html).not.toContain('href="/categorias/"');

    const enabledHtml = renderSections(catalogModernCleanStore, catalogModernCleanStore.sections, {
      pageType: "home",
    });
    expect(enabledHtml).toContain('href="/buscar/"');
  });

  it("con búsqueda apagada el viewAll /buscar/ cae en la primera categoría raíz visible", () => {
    const project = structuredClone(catalogModernCleanStore);
    project.commerceTemplates.search.enabled = false;
    project.categories = [
      CategorySchema.parse({
        id: "category-fallback-test",
        slug: "test-principal",
        title: "Test principal",
        description: "",
        productIds: [],
      }),
    ];

    const html = renderSections(project, project.sections, { pageType: "home" });
    expect(html).toContain('class="catalog-view-all" href="/categorias/test-principal/"');
    expect(html).not.toContain("/buscar/");
    expect(html).not.toContain('href="/categorias/"');
  });

  it("gates el botón de carrito moderno con los templates de carrito o checkout", () => {
    const headerSection = createModuleSection({
      id: "section-modern-header-cart-test" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const project = structuredClone(catalogModernStore);
    project.commerceTemplates.cart.enabled = false;
    project.commerceTemplates.checkout.enabled = false;

    const disabledHtml = renderSections(project, [headerSection], { pageType: "home" });
    expect(disabledHtml).not.toContain("data-solara-cart-open");

    project.commerceTemplates.checkout.enabled = true;
    const checkoutHtml = renderSections(project, [headerSection], { pageType: "home" });
    expect(checkoutHtml).toContain("data-solara-cart-open");
  });

  it("agrupa todas las variantes en el selector nativo y elimina controles duplicados", () => {
    const project = structuredClone(catalogModernStore);
    const product = project.products.find(
      (candidate) => candidate.slug === "remera-esencial-de-algodon",
    );
    if (!product) throw new Error("Fixture sin remera esencial");
    const [first, second, third] = product.variants;
    if (!first || !second || !third) throw new Error("Fixture sin variantes");
    product.variants = [
      {
        ...first,
        title: "Negro / S",
        optionValues: { Color: "Negro", Talle: "S" },
        available: false,
        stockStatus: "out_of_stock" as const,
      },
      {
        ...second,
        title: "Blanco / S",
        optionValues: { Color: "Blanco", Talle: "S" },
        available: true,
        stockStatus: "in_stock" as const,
      },
      {
        ...third,
        title: "Negro / M",
        optionValues: { Color: "Negro", Talle: "M" },
        available: true,
        stockStatus: "in_stock" as const,
      },
    ];

    const html = renderSections(project, [modernDetailSection], {
      pageType: "product",
      product,
    });
    expect(html).toContain('id="catalog-variant-section-modern-detail-test"');
    expect(html).toContain(">Negro / S ·");
    expect(html).toContain(">Blanco / S ·");
    expect(html).toContain(">Negro / M ·");
    expect(html).not.toContain("catalog-variant-options");
    expect(html).not.toContain("catalog-option-pill");
    expect(html).not.toContain("catalog-variant-links");
  });

  it("incluye reglas de impresión para drawer, backdrops y menú móvil", () => {
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!modernStyles) throw new Error("Falta el bloque de estilos catalog-modern");
    const printBlock = modernStyles.slice(modernStyles.indexOf("@media print"));
    expect(printBlock).toContain("[data-cart-drawer]");
    expect(printBlock).toContain(".catalog-mobile-menu");
    expect(printBlock).toContain("!important");
    expect(printBlock).toContain("transform: none");

    const legacyDrawerStyles = MODULE_STYLE_BLOCKS["cart-drawer"];
    if (!legacyDrawerStyles) throw new Error("Falta el bloque de estilos cart-drawer");
    const legacyPrintBlock = legacyDrawerStyles.slice(legacyDrawerStyles.indexOf("@media print"));
    expect(legacyPrintBlock).toContain("[data-cart-drawer]");

    const headerSection = createModuleSection({
      id: "section-modern-header-print-test" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const headerHtml = renderSections(catalogModernStore, [headerSection], { pageType: "home" });
    expect(headerHtml).toMatch(/<noscript>[\s\S]*@media print/);
  });

  it("mantiene centrada la imagen responsive dentro de la media de cada card", () => {
    expect(STORE_BASE_STYLES).toContain("[data-solara-store] .solara-product-media > picture,");
    expect(STORE_BASE_STYLES).toContain("[data-solara-store] .catalog-product-media > picture {");
    expect(STORE_BASE_STYLES).toContain("width: 100%;\n  height: 100%;");
    expect(STORE_BASE_STYLES).toContain(
      "[data-solara-store] .solara-product-media > picture > img,",
    );
    expect(STORE_BASE_STYLES).toContain("object-position: center;");
  });

  it("mantiene cuadrados los controles de paginación de Catalog Modern", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(styles).toMatch(
      /\.solara-pagination a \{[^}]*border-radius: var\(--solara-radius\)[^}]*\}/,
    );
    expect(styles).not.toMatch(/\.solara-pagination a \{[^}]*border-radius: 999px/);
  });

  it("la nav de paginación oculta nunca se pinta aunque otra regla posterior use flex", () => {
    // Regresión 2026-09-04: `[data-solara-store].catalog-modern .solara-pagination`
    // empata en especificidad (0,3,0) con el override [hidden] y viene después,
    // así que sin !important la nav con hidden="true" se seguía viendo.
    expect(STORE_BASE_STYLES).toMatch(
      /\.solara-pagination\[hidden\] \{\s*display: none !important;\s*\}/,
    );
  });

  it("garantiza hit-area de 44px en la hamburguesa y clamp compacto del hero móvil", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles || !v2Styles) throw new Error("Faltan los estilos de catalog-modern");

    expect(styles).toMatch(/\.catalog-mobile-menu-button \{[^}]*min-width: 44px; min-height: 44px/);
    expect(styles).toContain(
      "font-size: calc(clamp(2.2rem, 9vw, 3.2rem) * var(--solara-type-scale, 1))",
    );
    expect(styles).toContain(
      "font-size: calc(clamp(2.8rem, 5vw, 5.5rem) * var(--solara-type-scale, 1))",
    );
    expect(v2Styles).toContain(
      "font-size: calc(clamp(2.3rem, 9vw, 3.4rem) * var(--solara-type-scale, 1))",
    );
    expect(v2Styles).toContain(
      "font-size: calc(clamp(4.75rem, 6.4vw, 8rem) * var(--solara-type-scale, 1))",
    );
    expect(v2Styles).toContain(
      "font-size: calc(clamp(3.6rem, 7vw, 5.5rem) * var(--solara-type-scale, 1))",
    );
  });

  it("estila la ventana numérica de paginación con elipses discretas", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(styles).toMatch(/\.solara-pagination__ellipsis \{[^}]*border: 0/);
    expect(STORE_BASE_STYLES).toMatch(/\.solara-pagination__ellipsis \{[^}]*border: 0/);
    expect(styles).toMatch(/\.solara-pagination a \{[^}]*min-height: 44px/);
  });

  it("mantiene cuadrados todos los controles de búsqueda", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(STORE_BASE_STYLES).toContain(
      "[data-solara-store] .solara-search-form input {\n  border-radius: 0;\n}",
    );
    expect(styles).toMatch(/\.catalog-search-link \{[^}]*border-radius: 0[^}]*\}/);
    expect(styles).toMatch(/\.catalog-search-dialog-heading button \{[^}]*border-radius: 0[^}]*\}/);
    expect(styles).toMatch(/\.catalog-search-dialog-controls input \{[^}]*border-radius: 0[^}]*\}/);
    expect(styles).toMatch(
      /\.catalog-search-dialog-controls \.catalog-primary-action \{[^}]*border-radius: 0[^}]*\}/,
    );
  });

  it("hace que la imagen de cada resultado llene su caja cuadrada", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles || !modernStyles) throw new Error("Faltan estilos de búsqueda");

    expect(STORE_BASE_STYLES).toMatch(
      /\.solara-search-result img \{[\s\S]*height: auto;[\s\S]*aspect-ratio: 1;[\s\S]*object-fit: cover;/,
    );
    expect(modernStyles).toMatch(
      /\.cm\.v2 \.solara-search-result img \{[\s\S]*height: auto;[\s\S]*aspect-ratio: 1;[\s\S]*object-fit: cover;/,
    );
  });

  it("hace que la galería de producto llene el marco principal y las miniaturas", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles || !modernStyles) throw new Error("Faltan estilos de galería de producto");

    expect(STORE_BASE_STYLES).toMatch(
      /\.solara-product-gallery-main img,[\s\S]*\.catalog-product-gallery-thumb \{[\s\S]*object-fit: cover;/,
    );
    expect(styles).toMatch(
      /\.catalog-product-gallery-image \{[^}]*object-fit: cover;[^}]*\}[\s\S]*\.catalog-product-gallery-thumb \{[^}]*object-fit: cover;/,
    );
    expect(modernStyles).toMatch(
      /\.cm\.v2 \.catalog-product-gallery-image \{[^}]*object-fit: cover;/,
    );
  });

  it("mantiene cuadrada y cubierta la galería de producto en mobile", () => {
    expect(PRODUCT_GALLERY_MOBILE_FIX).toContain("aspect-ratio:1");
    expect(PRODUCT_GALLERY_MOBILE_FIX).toMatch(
      /:is\(img\.catalog-product-gallery-image,img\.solara-product-gallery-image\)[^{]*\{[^}]*object-fit:cover/,
    );
  });

  it("fija en cuadrado el medio del hero de inicio en todas las familias", () => {
    expect(MOBILE_HERO_SQUARE_FIX).toContain(
      '[data-solara-store].catalog-modern .catalog-hero-inner',
    );
    expect(MOBILE_HERO_SQUARE_FIX).toContain(".cm.v2 .catalog-hero-editorial [data-hero-media]");
    expect(MOBILE_HERO_SQUARE_FIX).toContain("border-radius:0");

    const splitHeroStyles = MODULE_STYLE_BLOCKS["split-hero"];
    const heroMediaStyles = MODULE_STYLE_BLOCKS["hero-media"];
    const editorialHeroStyles = MODULE_STYLE_BLOCKS["editorial-hero"];
    if (!splitHeroStyles || !heroMediaStyles || !editorialHeroStyles) {
      throw new Error("Faltan estilos de los heroes legacy");
    }
    expect(splitHeroStyles).toMatch(/\.solara-hero-media \{[^}]*border-radius: 0;/s);
    expect(heroMediaStyles).not.toContain(".solara-hero-media-shell {\n  border-radius:");
    expect(editorialHeroStyles).not.toContain(".solara-hero-media {\n  border-radius:");
  });

  it("permite que el título de producto use todo el ancho en mobile", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles || !modernStyles) throw new Error("Faltan estilos de detalle de producto");

    expect(styles).toMatch(/\.catalog-product-info h1 \{ width: 100%; max-width: 100%;/);
    expect(modernStyles).toMatch(
      /\.cm\.v2 \.catalog-product-info h1 \{\s*width: 100%;\s*max-width: 100%;/,
    );
  });

  it("hace que las imágenes del carrito llenen su marco cuadrado", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles || !modernStyles) throw new Error("Faltan estilos de carrito");

    expect(styles).toMatch(
      /\.catalog-cart-items \.solara-cart-line img \{[^}]*width: 3\.5rem;[^}]*height: 3\.5rem;[^}]*object-fit: cover;/,
    );
    expect(modernStyles).toMatch(
      /\.solara-cart-page-grid \[data-cart-lines\] \.solara-cart-line img \{[^}]*width: 8rem;[^}]*height: 8rem;[^}]*object-fit: cover;/,
    );
  });

  it("mantiene accesibles las líneas y controles del drawer legacy en alturas reducidas", () => {
    const legacyStyles = MODULE_STYLE_BLOCKS["cart-drawer"];
    if (!legacyStyles) throw new Error("Faltan estilos de carrito legacy");

    expect(legacyStyles).toContain(
      "grid-template-rows: auto minmax(8rem, 1fr) auto minmax(0, 1fr);",
    );
    expect(legacyStyles).toMatch(
      /\.solara-cart-drawer > \[data-cart-lines\],[\s\S]*\.solara-cart-drawer > form \{[\s\S]*overflow-y: auto;/,
    );
  });

  it("alinea el resumen del carrito y elimina sus separadores en tablet y mobile", () => {
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!modernStyles) throw new Error("Faltan estilos de carrito V2");

    expect(modernStyles).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.cm\.v2 \.catalog-cart-summary \{[^}]*padding-inline: 0;[^}]*border-top: 0;/,
    );
    expect(modernStyles).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.cm\.v2 \.catalog-cart-summary > p:nth-child\(2\) \{[^}]*justify-items: end;[^}]*text-align: right;/,
    );
    expect(modernStyles).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.cm\.v2 \.catalog-cart-summary \.catalog-cart-total,[\s\S]*\.cm\.v2 \.catalog-cart-drawer \.catalog-drawer-footer \{[^}]*border-top: 0;/,
    );
  });

  it("evita que el email del footer se parta a mitad de palabra", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(styles).toMatch(
      /\.catalog-footer-inner a\[href\^="mailto:"\] \{[^}]*word-break: keep-all;[^}]*overflow-wrap: normal;[^}]*\}/,
    );
  });

  it("alinea Contacto con las demás columnas del footer", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(styles).toMatch(
      /\.catalog-footer-inner address \{[^}]*padding-inline-start: 0;[^}]*border-inline-start: 0;/,
    );
  });

  it("colapsa las grillas de producto a una columna sólo debajo de 340px en V2", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    expect(styles).toMatch(
      /@media \(max-width: 339px\)[\s\S]*?\.cm\.v2 \.catalog-product-grid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 339px\)[\s\S]*?\.cm\.v2 \.catalog-category-results \.catalog-product-grid,[\s\S]*?\.cm\.v2 \.catalog-search-results-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
    );
  });

  it("muestra hasta cuatro relacionados por fila en desktop", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    expect(styles).toMatch(
      /\.cm\.v2 \[data-solara-section\$="-related"\] \.catalog-product-grid \{[^}]*repeat\(4, ?minmax\(0, 1fr\)\)/,
    );
  });

  it("distribuye los resultados de categoría hasta los bordes del contenedor", () => {
    const baseStyles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const modernStyles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!baseStyles || !modernStyles) throw new Error("Faltan estilos de catálogo");

    for (const count of ["2", "3", "4"]) {
      expect(baseStyles).toMatch(
        new RegExp(
          `\\.catalog-product-grid\\[data-product-count="${count}"\\][^}]*justify-content: space-between;`,
        ),
      );
      expect(modernStyles).toMatch(
        new RegExp(
          `\\.cm\\.v2 \\.catalog-product-grid\\[data-product-count="${count}"\\] \\{[^}]*justify-content: space-between;`,
        ),
      );
    }
    expect(modernStyles).toMatch(
      /\.cm\.v2 \.catalog-category-results \.catalog-product-grid\{[^}]*justify-content:space-between;[^}]*width:100%;[^}]*max-width:none[^}]*margin-inline:0/,
    );
  });

  it("mantiene el alto del navbar V2 con nombres de tienda largos", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    const project = structuredClone(catalogModernV2Store);
    project.identity.brandName =
      "Marca de tienda extremadamente larga que no debe deformar el navbar";
    const headerSection = createModuleSection({
      id: "section-modern-header-long-brand-test" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const headerHtml = renderSections(project, [headerSection], { pageType: "home" });

    expect(headerHtml).toContain(project.identity.brandName);
    expect(styles).toMatch(
      /\.cm\.v2 \.catalog-brand \{[\s\S]*width: fit-content;[\s\S]*max-width: 100%;[\s\S]*justify-self: start;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/,
    );
    expect(styles).toMatch(
      /\.cm\.v2 \.catalog-brand \.solara-wordmark \{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/,
    );
    expect(styles).toMatch(
      /\.cm\.v2 \.catalog-brand \.solara-logo \{[^}]*max-height: 3\.5rem;[^}]*object-fit: contain;/,
    );

    const narrowStart = styles.indexOf("@media (max-width: 767px)");
    expect(narrowStart).toBeGreaterThanOrEqual(0);
    const narrowStyles = styles.slice(narrowStart);
    expect(narrowStyles).toMatch(
      /\.cm\.v2 \.catalog-brand \{[\s\S]*width: fit-content;[\s\S]*max-width: 100%;[\s\S]*justify-self: start;[\s\S]*overflow: hidden;[\s\S]*white-space: nowrap;/,
    );
    expect(narrowStyles).toContain(".cm.v2 .catalog-brand .solara-wordmark {");
    expect(narrowStyles).toContain("white-space: nowrap;");
    expect(narrowStyles).toContain("overflow: hidden;");
  });

  it("el header permite ocultar su divisor inferior sin tocar otros bordes", () => {
    const project = structuredClone(catalogModernV2Store);
    const header = createModuleSection({
      id: "section-modern-header-divider-test" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const base = renderSections(project, [header], { pageType: "home" });
    expect(base).not.toContain("catalog-header-inner--no-divider");

    header.settings = { ...header.settings, showDivider: false };
    const noDivider = renderSections(project, [header], { pageType: "home" });
    expect(noDivider).toContain("catalog-header-inner--no-divider");

    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!v2Styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");
    expect(v2Styles).toMatch(
      /\.cm\.v2 \.catalog-header-inner\.catalog-header-inner--no-divider\s*\{[^}]*border-bottom:\s*0/,
    );
  });

  it("el logo del header reserva caja y contiene el alt desde el primer frame", () => {
    const baseStyles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!baseStyles || !v2Styles) throw new Error("Faltan estilos de catálogo");
    // V1: el brand del header nunca tuvo regla para el logo: el alt heredaba
    // la tipografía display (~2rem) y reventaba el navbar cuando la imagen
    // aún no cargó o falla.
    expect(baseStyles).toContain(
      "[data-solara-store].catalog-modern .catalog-brand .solara-logo {",
    );
    // V2: height:100% sobre un padre de alto auto no reserva caja; se pasa a
    // max-height explícito con regla propia del header.
    expect(v2Styles).toContain(".cm.v2 .catalog-brand .solara-logo {");
    expect(v2Styles).toMatch(/\.cm\.v2 \.catalog-brand \.solara-logo \{[^}]*max-height:[^}]*\}/);
    // En ambas familias el alt del logo no debe heredar la display del brand.
    for (const styles of [baseStyles, v2Styles]) {
      expect(styles).toMatch(/\.solara-logo \{[^}]*font-size: 12px;[^}]*\}/);
    }
  });

  it("usa una única imagen de identidad en navbar y footer", () => {
    const project = structuredClone(catalogModernStore);
    const logo = project.assets[0];
    if (!logo) throw new Error("Fixture sin asset para el logo");
    project.identity.logoAssetId = logo.id;
    const header = createModuleSection({
      id: "section-modern-header-brand-mode-test" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const footer = createModuleSection({
      id: "section-modern-footer-brand-mode-test" as StoreSection["id"],
      slot: "footer",
      moduleId: "catalog-footer",
    });

    header.settings = { ...header.settings, brandMode: "text", brandAssetId: "" };
    const headerHtml = renderSections(project, [header], { pageType: "home" });
    const footerHtml = renderSections(project, [footer], { pageType: "home" });
    expect(headerHtml).toContain('class="solara-logo"');
    expect(footerHtml).toContain('class="solara-logo"');
    expect(headerHtml).not.toContain(
      `<span class="solara-wordmark">${project.identity.brandName}</span>`,
    );
    expect(footerHtml).not.toContain(
      `<span class="solara-wordmark">${project.identity.brandName}</span>`,
    );

    const headerDefinition = getModuleDefinition("catalog-header");
    expect(headerDefinition?.manifest.compatibleSettings).toEqual([
      "cartLabel",
      "searchLabel",
      "showDivider",
    ]);
    expect(headerDefinition?.settingsFields.map((field) => field.key)).toEqual([
      "cartLabel",
      "searchLabel",
      "showDivider",
    ]);
  });

  it("muestra el WhatsApp argentino con formato legible y conserva el href limpio", () => {
    const project = structuredClone(catalogModernV2Store);
    project.whatsapp.phone = "542804211660";
    const footer = createModuleSection({
      id: "section-modern-footer-phone-format-test" as StoreSection["id"],
      slot: "footer",
      moduleId: "catalog-footer",
    });

    const html = renderSections(project, [footer], { pageType: "home" });

    expect(html).toContain(">+54 280 421-1660</a>");
    expect(html).toContain('href="https://wa.me/542804211660"');
  });

  it("mantiene visible la media LCP y usa zoom compositado sin clip-path", () => {
    const baseStyles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!baseStyles || !v2Styles) throw new Error("Faltan los estilos de Catalog Modern");

    expect(v2Styles).toContain("[data-hero-media], .catalog-hero-media)[data-solara-loaded]");
    expect(v2Styles).not.toContain(
      "[data-hero-media]{animation:none!important;opacity:1!important}",
    );
    expect(v2Styles).toContain("@keyframes solara-hero-media-zoom");
    expect(v2Styles).toContain(".catalog-hero-line-inner");
    expect(v2Styles).toContain("line-height: 1.1;");
    expect(v2Styles).toContain("text-shadow: none;");
    expect(v2Styles).toContain(
      '.cm.v2 [data-solara-module="catalog-hero"] .catalog-hero-line {\n      overflow: visible;\n    }',
    );
    expect(baseStyles).toContain(
      "min-height: calc(100svh - 96px); margin-top: .75rem; border-radius: 0;",
    );
    expect(v2Styles).toContain(".cm.v2 .catalog-hero-editorial [data-hero-media]");
    expect(v2Styles).toContain("aspect-ratio: auto;\n    border-radius: 0;");
    expect(v2Styles).toContain(
      "min-height: clamp(35.5rem, min(82svh, calc(100vw * 16 / 9)), 43rem);\n      border-radius: 0;",
    );
    expect(v2Styles).toContain("aspect-ratio: 9 / 16;\n      border-radius: 0;");
    expect(v2Styles).toContain("@media (min-width: 768px) and (max-width: 1199px)");
    expect(v2Styles).toContain(".catalog-hero-benefits--band");
    expect(v2Styles).not.toContain("clip-path");
  });

  it("el appear de marca depende del preset de la sección y del load", () => {
    const baseStyles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!baseStyles || !v2Styles) throw new Error("Faltan estilos de catálogo");
    // Oculto pre-load sólo con motion listo y preset distinto de none; el
    // error muestra el alt contenido en vez de dejarlo invisible.
    for (const styles of [baseStyles, v2Styles]) {
      expect(styles).toContain(":is(img.solara-logo");
      expect(styles).toContain(":not([data-solara-loaded]):not([data-solara-broken])");
      expect(styles).toContain("[data-solara-loaded] {");
    }
    expect(v2Styles).toContain("[data-hero-media], .catalog-hero-media)[data-solara-loaded]");
    expect(baseStyles).toContain(
      "figure.solara-hero-media, .solara-hero-media)[data-solara-loaded]",
    );
    // Sin movimiento reducido nunca se oculta: respeta reduced-motion.
    for (const styles of [baseStyles, v2Styles]) {
      expect(styles).toContain("prefers-reduced-motion: no-preference");
    }
  });
});

describe("catalog-product-grid: nombres accesibles únicos", () => {
  it("distingue los enlaces de cada sección por su título", () => {
    const html = renderSections(catalogModernV2Store, catalogModernV2Store.sections, {
      pageType: "home",
    });

    expect(html).toContain(
      `aria-label="${catalogModernV2Store.publicCopy.navigation.viewAll} de Recién llegados"`,
    );
    expect(html).toContain(
      `aria-label="${catalogModernV2Store.publicCopy.navigation.viewAll} de Más elegidos"`,
    );
  });

  it("usa un título contextual y omite el enlace redundante en categorías", () => {
    const section = catalogModernV2Store.sections.find(
      (candidate) => candidate.moduleId === "catalog-product-grid",
    );
    const category = catalogModernV2Store.categories.find((candidate) => !candidate.parentId);
    if (!section || !category) throw new Error("Fixture V2 sin grilla o categoría");

    const html = renderSections(catalogModernV2Store, [section], {
      pageType: "category",
      category,
    });

    expect(html).toContain(`<h2>Productos de ${category.title}</h2>`);
    expect(html).not.toContain('class="catalog-view-all"');
  });
});

describe("catalog-cart-drawer: estado vacío", () => {
  it("no renderiza un CTA de seguir comprando dentro del drawer", () => {
    const section = catalogModernV2Store.sections.find(
      (candidate) => candidate.moduleId === "catalog-cart-drawer",
    );
    if (!section) throw new Error("Fixture V2 sin drawer de carrito");
    const html = renderSections(catalogModernV2Store, [section], { pageType: "home" });

    expect(html).not.toContain("catalog-secondary-action");
    expect(html).toContain("data-cart-drawer");
    expect(html).toContain("data-cart-lines");
  });
});

describe("catalog-hero V2 con CTA único de WhatsApp", () => {
  it("reemplaza las acciones del hero V2 por un único enlace wa.me sin mensaje", () => {
    const section = catalogModernV2Store.sections.find(
      (candidate) => candidate.moduleId === "catalog-hero",
    );
    if (!section) throw new Error("Fixture V2 sin hero");
    const html = renderSections(catalogModernV2Store, [section], { pageType: "home" });
    const actions = html.slice(html.indexOf('class="catalog-hero-actions"'));
    const actionsMarkup = actions.slice(0, actions.indexOf("</div>"));

    expect(actionsMarkup).toContain('class="catalog-primary-action solara-primary-action"');
    expect(actionsMarkup).toContain('href="https://wa.me/5491123456789"');
    expect(actionsMarkup).not.toContain("?text=");
    expect(actionsMarkup).toContain('target="_blank" rel="noopener noreferrer"');
    expect(actionsMarkup).toContain(
      '<span class="catalog-hero-cta-label">Escribir por WhatsApp</span>',
    );
    expect(actionsMarkup).toContain('class="catalog-hero-cta-icon"');
    expect(actionsMarkup).not.toContain("catalog-secondary-action");
    expect(actionsMarkup).not.toContain("Ver reci\u00e9n llegados");
    expect(actionsMarkup.match(/<a\b/g)).toHaveLength(1);
  });

  it("conserva las acciones del hero V2 cuando no hay WhatsApp configurado", () => {
    const project = structuredClone(catalogModernV2Store);
    project.whatsapp = { ...project.whatsapp, phone: "" };
    const section = project.sections.find((candidate) => candidate.moduleId === "catalog-hero");
    if (!section) throw new Error("Fixture V2 sin hero");
    const html = renderSections(project, [section], { pageType: "home" });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("Escribir por WhatsApp");
    expect(html).toContain("Ver reci\u00e9n llegados");
    expect(html).toContain("Explorar tienda");
  });

  it("trata el teléfono sentinel de plantilla como no configurado en V2", () => {
    const project = structuredClone(catalogModernV2Store);
    project.whatsapp = { ...project.whatsapp, phone: CATALOG_MODERN_PLACEHOLDER_PHONE };
    const section = project.sections.find((candidate) => candidate.moduleId === "catalog-hero");
    if (!section) throw new Error("Fixture V2 sin hero");
    const html = renderSections(project, [section], { pageType: "home" });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("Escribir por WhatsApp");
    expect(html).toContain("Ver reci\u00e9n llegados");
  });

  it("no altera las acciones del hero V1", () => {
    const section = catalogModernStore.sections.find(
      (candidate) => candidate.moduleId === "catalog-hero",
    );
    if (!section) throw new Error("Fixture V1 sin hero");
    const html = renderSections(catalogModernStore, [section], { pageType: "home" });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("Escribir por WhatsApp");
    expect(html).toContain('class="catalog-primary-action" href="/colecciones/recien-llegados/"');
    expect(html).toContain("Explorar tienda");
  });
});

describe("catalog-hero V2: contrato de markup para motion (beneficios y líneas)", () => {
  const heroSection = (store: typeof catalogModernV2Store) => {
    const section = store.sections.find((candidate) => candidate.moduleId === "catalog-hero");
    if (!section) throw new Error("Fixture sin hero");
    return section;
  };

  it("V2 renderiza tres beneficios por defecto con svg, aria-label y textos comerciales", () => {
    const html = renderSections(catalogModernV2Store, [heroSection(catalogModernV2Store)], {
      pageType: "home",
    });

    expect(html).toContain('data-hero-benefits aria-label="Beneficios"');
    // La familia V2 renderiza los beneficios dos veces: la copia interna
    // (desktop) y la banda posterior (mobile), con los mismos 3 items.
    expect(html.match(/class="catalog-hero-benefit" data-hero-benefit/g) ?? []).toHaveLength(6);
    expect(html).toContain('class="catalog-hero-benefits catalog-hero-benefits--copy"');
    expect(html).toContain('class="catalog-hero-benefits catalog-hero-benefits--band"');
    expect(html).toContain('--catalog-hero-benefit-icon-radius:8px');
    expect(html.match(/class="catalog-hero-benefit-icon"/g) ?? []).toHaveLength(6);
    expect(html).toContain(
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"',
    );
    expect(html).toContain("<strong>Envíos a todo el país</strong>");
    expect(html).toContain("<strong>Pedido directo</strong>");
    expect(html).toContain("<strong>Compra cuidada</strong>");
    expect(html).toContain("Coordinamos la entrega por WhatsApp");
    expect(html).toContain("Comprá conversando con la marca");
    expect(html).toContain("Confirmamos todo antes de enviar");
    expect(html).not.toContain("catalog-hero-stats");
  });

  it("con benefits vacío cae al markup de stats respetando showCatalogStats", () => {
    const base = heroSection(catalogModernV2Store);
    const html = renderSections(
      catalogModernV2Store,
      [{ ...base, settings: { ...base.settings, benefits: [] } }],
      { pageType: "home" },
    );

    expect(html).toContain('class="catalog-hero-stats"');
    expect(html).not.toContain("data-hero-benefits");

    const hidden = renderSections(
      catalogModernV2Store,
      [{ ...base, settings: { ...base.settings, benefits: [], showCatalogStats: false } }],
      { pageType: "home" },
    );

    expect(hidden).not.toContain("catalog-hero-stats");
    expect(hidden).not.toContain("data-hero-benefits");
  });

  it("V1 conserva el hero actual sin contrato de motion ni beneficios", () => {
    const html = renderSections(catalogModernStore, [heroSection(catalogModernStore)], {
      pageType: "home",
    });

    expect(html).toContain("<h1>Vestite con lo que te representa.</h1>");
    expect(html).toContain("catalog-hero-stats");
    expect(html).not.toContain("data-hero-title");
    expect(html).not.toContain("data-hero-line");
    expect(html).not.toContain("data-hero-rule");
    expect(html).not.toContain("catalog-hero-reveal");
    expect(html).not.toContain("data-hero-benefits");
  });

  it("el modo carousel conserva la estructura actual sin contrato de motion", () => {
    const base = heroSection(catalogModernV2Store);
    const section = {
      ...base,
      settings: {
        ...base.settings,
        mode: "carousel",
        slides: [
          {
            id: "slide-hero-1",
            title: "Primer slide",
            body: "Cuerpo del primero",
            actionLabel: "Ver",
            actionHref: "/",
            imageId: "",
          },
          {
            id: "slide-hero-2",
            title: "Segundo slide",
            body: "Cuerpo del segundo",
            actionLabel: "Ver",
            actionHref: "/",
            imageId: "",
          },
        ],
      },
    };
    const html = renderSections(catalogModernV2Store, [section], { pageType: "home" });

    expect(html).toContain("catalog-hero-slide-stage");
    expect(html).toContain("data-catalog-hero-slide-panel");
    expect(html).toContain("catalog-hero-controls");
    expect(html).toContain("<h1>Primer slide</h1>");
    expect(html).toContain("catalog-hero-stats");
    expect(html).not.toContain("data-hero-title");
    expect(html).not.toContain("data-hero-line");
    expect(html).not.toContain("data-hero-rule");
    expect(html).not.toContain("catalog-hero-reveal");
    expect(html).not.toContain("data-hero-benefits");
  });

  it("conserva saltos explícitos y deja el wrapping responsive al navegador", () => {
    const base = heroSection(catalogModernV2Store);
    const section = {
      ...base,
      settings: { ...base.settings, title: "Vestite con\nlo que te\nrepresenta." },
    };
    const html = renderSections(catalogModernV2Store, [section], { pageType: "home" });

    expect(html.match(/data-hero-line-inner/g) ?? []).toHaveLength(3);
    expect(html).toContain(
      '<span class="catalog-hero-line" data-hero-line><span class="catalog-hero-line-inner" data-hero-line-inner>Vestite con</span></span> <span class="catalog-hero-line" data-hero-line><span class="catalog-hero-line-inner" data-hero-line-inner>lo que te</span></span> <span class="catalog-hero-line" data-hero-line><span class="catalog-hero-line-inner" data-hero-line-inner>representa.</span></span>',
    );
    const titleMarkup = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(
      titleMarkup
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    ).toBe("Vestite con lo que te representa.");

    const short = renderSections(
      catalogModernV2Store,
      [{ ...base, settings: { ...base.settings, title: "Solo dos" } }],
      { pageType: "home" },
    );
    expect(short.match(/data-hero-line-inner/g) ?? []).toHaveLength(1);
    expect(short).toContain(">Solo dos</span></span>");

    const odd = renderSections(
      catalogModernV2Store,
      [{ ...base, settings: { ...base.settings, title: "Una bici verde" } }],
      { pageType: "home" },
    );
    expect(odd.match(/data-hero-line-inner/g) ?? []).toHaveLength(1);
    expect(odd).toContain(">Una bici verde</span></span>");
  });

  it("usa check como ícono de respaldo cuando el ícono no existe", () => {
    const base = heroSection(catalogModernV2Store);
    const section = {
      ...base,
      settings: {
        ...base.settings,
        benefits: [
          { id: "benefit-truck", icon: "truck", title: "Envíos", text: "" },
          { id: "benefit-unknown", icon: "icono-inexistente", title: "Raro", text: "" },
          { id: "benefit-check", icon: "check", title: "Check", text: "" },
        ],
      },
    };
    const html = renderSections(catalogModernV2Store, [section], { pageType: "home" });
    const icons = [
      ...html.matchAll(/<li class="catalog-hero-benefit" data-hero-benefit><svg[\s\S]*?<\/svg>/g),
    ].map((match) => match[0] ?? "");

    expect(icons).toHaveLength(6);
    expect(icons[1]).toBe(icons[2]);
    expect(icons[1]).not.toBe(icons[0]);
  });

  it("valida en el schema id obligatorio, tope de 3 ítems y defaults comerciales", () => {
    const schema = getTypedModule("catalog-hero")?.settingsSchema;
    if (!schema) throw new Error("Falta el módulo catalog-hero");

    const defaults = schema.parse({});
    expect(defaults.benefits).toHaveLength(3);
    expect(defaults.benefitIconRadius).toBe(8);
    expect(defaults.benefits[0]?.icon).toBe("truck");
    expect(defaults.benefits[0]?.title).toBe("Envíos a todo el país");
    expect(schema.safeParse({ benefits: [{ icon: "truck", title: "Sin id" }] }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        benefits: [
          { id: "a", title: "A" },
          { id: "b", title: "B" },
          { id: "c", title: "C" },
          { id: "d", title: "D" },
        ],
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ benefits: [{ id: "a", title: "A" }] }).success).toBe(true);

    const custom = renderSections(
      catalogModernV2Store,
      [
        {
          ...heroSection(catalogModernV2Store),
          settings: {
            ...heroSection(catalogModernV2Store).settings,
            benefitIconRadius: 18,
          },
        },
      ],
      { pageType: "home" },
    );
    expect(custom).toContain('--catalog-hero-benefit-icon-radius:18px');
  });
});

describe("auditoría Resumen — fixes Ola 3 (navegación y footer moderno)", () => {
  const headerSection = createModuleSection({
    id: "section-modern-header-resumen-test" as StoreSection["id"],
    slot: "header",
    moduleId: "catalog-header",
  });
  const footerSection = createModuleSection({
    id: "section-modern-footer-resumen-test" as StoreSection["id"],
    slot: "footer",
    moduleId: "catalog-footer",
  });

  it("en mode automatic los ítems del editor tienen prioridad sobre las categorías", () => {
    const project = structuredClone(catalogModernStore);
    project.navigation = { ...project.navigation, mode: "automatic", items: [] };

    // Sin items editados: la navegación deriva de las categorías raíz.
    const automaticHtml = renderSections(project, [headerSection], { pageType: "home" });
    expect(automaticHtml).toContain('class="catalog-mega-group__link" href="/categorias/remeras/"');

    // Con items editados: el renderer los usa aunque el modo siga automatic.
    project.navigation.items = [
      { id: "nav-manual", label: "Enlace manual", href: "/envios/" },
      { id: "nav-manual-2", label: "Segundo enlace", href: "/buscar/" },
    ];
    const editorHtml = renderSections(project, [headerSection], { pageType: "home" });
    expect(editorHtml).toContain('class="catalog-mega-group__link" href="/envios/"');
    expect(editorHtml).toContain('class="catalog-mega-group__link" href="/buscar/"');
    expect(editorHtml).toContain("Enlace manual");
    expect(editorHtml).not.toContain('href="/categorias/remeras/"');
  });

  it("V2 enlaza Contacto directamente al bloque de Home", () => {
    const project = structuredClone(catalogModernV2Store);
    project.navigation = {
      ...project.navigation,
      mode: "curated",
      items: [
        { id: "nav-contact-v2", label: "Contacto", href: "/#contact-form" },
        { id: "nav-help-v2", label: "Ayuda", href: "/envios/" },
      ],
    };

    const headerSection = createModuleSection({
      id: "section-modern-header-v2-archived-pages" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const html = renderSections(project, [headerSection], { pageType: "home" });

    expect(html).toContain('href="/#contact-form"');
    expect(html).not.toContain('href="/envios/"');
    expect(html).not.toContain('href="/contacto/"');
    expect(html).not.toContain('href="/nosotros/"');
    expect(html).not.toContain('href="/compra/"');
  });

  it("la plantilla limpia (automatic, sin items ni categorías) conserva el fallback a /buscar/", () => {
    const html = renderSections(catalogModernCleanStore, [headerSection], { pageType: "home" });
    expect(html).toContain('class="catalog-nav-empty" href="/buscar/"');
    expect(html).not.toContain("catalog-mega-group__link");
  });

  it("incluye la dirección de identidad en el footer moderno (paridad con legacy)", () => {
    const project = structuredClone(catalogModernStore);
    project.identity.address = "Av. Siempre Viva 123";
    const html = renderSections(project, [footerSection], { pageType: "home" });

    expect(html).toContain("<span>Av. Siempre Viva 123</span>");
    expect(html).toContain("mailto:");
    expect(html).toContain("tel:");
  });

  it("separa las categorías públicas del resto de Explorar y enlaza el carrito", () => {
    const html = renderSections(catalogModernV2Store, [footerSection], { pageType: "home" });
    const exploreStart = html.indexOf('class="catalog-footer-nav catalog-footer-nav--explore"');
    const exploreEnd = html.indexOf("</nav>", exploreStart);
    const explore = html.slice(exploreStart, exploreEnd);
    const publicCategories = catalogModernV2Store.categories.filter(
      (category) => category.status !== "hidden",
    );

    expect(explore).toContain('href="/"');
    expect(explore).toContain('href="/buscar/"');
    expect(explore).toContain(
      `href="/carrito/" data-solara-cart-open data-open-cart data-cart-label="${catalogModernV2Store.publicCopy.navigation.cart}"`,
    );
    expect(explore.match(/<a /g) ?? []).toHaveLength(3);
    expect(html).toContain('class="catalog-footer-nav catalog-footer-nav--categories"');
    for (const category of publicCategories) {
      expect(html).toContain(`href="/categorias/${category.slug}/">${category.title}</a>`);
    }
  });

  it("conecta el footer con la identidad y la paleta activa", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(styles).toContain("border-top: 2px solid var(--solara-accent);");
    expect(styles).toContain("border-inline-start: 2px solid var(--solara-accent);");
    expect(styles).toContain(".catalog-footer-whatsapp");
    expect(styles).toContain("var(--solara-accent-text)");
  });

  it("comparte el tratamiento temático del footer con búsqueda y carrito", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");

    expect(styles).toMatch(
      /\.solara-search-form \.solara-primary-action,\s*\[data-solara-store\]\.catalog-modern \.catalog-search-dialog-controls \.catalog-primary-action,\s*\[data-solara-store\]\.catalog-modern \.catalog-cart-drawer \.catalog-drawer-footer \.catalog-primary-action,\s*\[data-solara-store\]\.catalog-modern \.solara-cart-page \.catalog-primary-action \{[^}]*border: 1px solid var\(--solara-accent\);[^}]*background: transparent;[^}]*color: var\(--solara-accent\);[^}]*transition: background-color var\(--solara-motion-fast/,
    );
    expect(styles).toMatch(
      /\.catalog-footer-whatsapp:hover,\s*\[data-solara-store\]\.catalog-modern \.catalog-footer-whatsapp:focus-visible,\s*\[data-solara-store\]\.catalog-modern \.solara-search-form \.solara-primary-action:hover,\s*\[data-solara-store\]\.catalog-modern \.solara-search-form \.solara-primary-action:focus-visible,\s*\[data-solara-store\]\.catalog-modern \.catalog-search-dialog-controls \.catalog-primary-action:hover,\s*\[data-solara-store\]\.catalog-modern \.catalog-search-dialog-controls \.catalog-primary-action:focus-visible,\s*\[data-solara-store\]\.catalog-modern \.catalog-cart-drawer \.catalog-drawer-footer \.catalog-primary-action:hover,\s*\[data-solara-store\]\.catalog-modern \.catalog-cart-drawer \.catalog-drawer-footer \.catalog-primary-action:focus-visible,\s*\[data-solara-store\]\.catalog-modern \.solara-cart-page \.catalog-primary-action:hover,\s*\[data-solara-store\]\.catalog-modern \.solara-cart-page \.catalog-primary-action:focus-visible \{[^}]*background: var\(--solara-accent\);[^}]*color: var\(--solara-accent-text\);/,
    );
    expect(styles).toMatch(
      /\.solara-search-form \.solara-primary-action:hover,\s*\[data-solara-store\]\.catalog-modern \.solara-search-form \.solara-primary-action:focus-visible,\s*\[data-solara-store\]\.catalog-modern \.catalog-search-dialog-controls \.catalog-primary-action:hover,\s*\[data-solara-store\]\.catalog-modern \.catalog-search-dialog-controls \.catalog-primary-action:focus-visible \{[^}]*transform: none;[^}]*box-shadow: none;/,
    );
    expect(styles).toMatch(
      /\.catalog-product-add \{[^}]*border: 1px solid var\(--solara-accent\);[^}]*background: transparent;[^}]*color: var\(--solara-accent\);[^}]*transition: background-color/,
    );
    expect(styles).toMatch(
      /\.catalog-product-add:hover,\s*\[data-solara-store\]\.catalog-modern \.catalog-product-add:focus-visible \{[^}]*background: var\(--solara-accent\);[^}]*color: var\(--solara-accent-text\);[^}]*transform: none;[^}]*box-shadow: none;/,
    );
  });

  it("mantiene el botón de agregar al carrito en el flujo en mobile", () => {
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!v2Styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    expect(v2Styles).not.toMatch(/\.cm\.v2 \.catalog-product-add \{[^}]*position: fixed/);
    expect(v2Styles).not.toMatch(
      /\.cm\.v2 \.catalog-product-detail-shell \{[^}]*padding-bottom: calc\(4\.75rem/,
    );
    expect(v2Styles).not.toMatch(/body:has\([^)]*\) \.cm\.v2 \.catalog-product-add/);
    expect(v2Styles).toMatch(/\.cm\.v2 \.catalog-product-add \{[^}]*width: 100%;/);
  });

  it("deja sólo el subrayado animado en el acceso a todos los productos", () => {
    const styles = MODULE_STYLE_BLOCKS["catalog-modern"];
    const v2Styles = MODULE_STYLE_BLOCKS["catalog-modern-v2"];
    if (!styles) throw new Error("Falta el bloque de estilos catalog-modern");
    if (!v2Styles) throw new Error("Falta el bloque de estilos catalog-modern-v2");

    const baseRule = styles.match(
      /\.catalog-mega-menu__all \{[^}]*text-decoration: none;[^}]*\}/,
    )?.[0];
    expect(baseRule).toBeDefined();
    expect(baseRule).not.toContain("border-top");
    expect(v2Styles).toContain(".cm.v2 .catalog-mega-menu__all::after");
    expect(v2Styles).toContain(".cm.v2 .catalog-mega-menu__all:hover::after");
  });

  it("ofrece un acceso de WhatsApp desde el bloque de identidad del footer", () => {
    const project = structuredClone(catalogModernStore);
    project.whatsapp.phone = "5492804558845";
    const html = renderSections(project, [footerSection], { pageType: "home" });

    expect(html).toContain('class="catalog-footer-whatsapp"');
    expect(html).toContain('href="https://wa.me/5492804558845"');
    expect(html).toContain(project.publicCopy.contact.whatsappAction);
  });

  it("usa navigation.catalogLabel como eyebrow del diálogo de búsqueda", () => {
    const project = structuredClone(catalogModernStore);
    project.navigation.catalogLabel = "Explorar";
    const html = renderSections(project, [headerSection], { pageType: "home" });

    expect(html).toContain('<p class="catalog-eyebrow">Explorar</p>');
    expect(html).not.toContain('<p class="catalog-eyebrow">Catálogo</p>');

    const cleanHtml = renderSections(catalogModernCleanStore, [headerSection], {
      pageType: "home",
    });
    expect(cleanHtml).toContain('<p class="catalog-eyebrow">Categorías</p>');
  });
});

describe("pattern de teléfono válido en regex v-mode (auditoría #9)", () => {
  const PATTERN = "[\\d\\+\\(\\)\\- ]{8,}";
  function phonePattern(html: string): string {
    const match = html.match(/name="phone"[^>]*pattern="([^"]+)"/);
    if (!match?.[1]) throw new Error("El input de teléfono no declara pattern");
    return match[1];
  }
  it("drawer legacy emite el pattern nuevo compilable con flag v", () => {
    const section = createModuleSection({
      id: "section-cart-pattern" as StoreSection["id"],
      slot: "cart",
      moduleId: "cart-drawer",
    });
    const html = renderSections(referenceStore, [section], { pageType: "home" });
    const pattern = phonePattern(html);
    expect(pattern).toBe(PATTERN);
    expect(html).not.toContain("[0-9+ ()-]{8,}");
    expect(() => new RegExp(pattern, "v")).not.toThrow();
    expect(new RegExp(pattern, "v").test("11 5555-0142")).toBe(true);
  });
  it("drawer catalog-modern emite el pattern nuevo compilable con flag v", () => {
    const section = catalogModernV2Store.sections.find(
      (candidate) => candidate.moduleId === "catalog-cart-drawer",
    );
    if (!section) throw new Error("Fixture V2 sin drawer de carrito");
    const html = renderSections(catalogModernV2Store, [section], { pageType: "home" });
    const pattern = phonePattern(html);
    expect(pattern).toBe(PATTERN);
    expect(html).not.toContain("[0-9+ ()-]{8,}");
    expect(() => new RegExp(pattern, "v")).not.toThrow();
  });
});

describe("nombre accesible del carrito coincide con el texto visible (axe label-content-name)", () => {
  function headerCartButton(html: string): string {
    const start = html.indexOf('<button class="catalog-cart-link"');
    if (start === -1) throw new Error("El header no renderiza el botón del carrito");
    const end = html.indexOf("</button>", start);
    return html.slice(start, end + "</button>".length);
  }

  it("el header moderno mantiene un espacio visible entre el label y el contador", () => {
    const headerSection = createModuleSection({
      id: "section-modern-header-axe-cart" as StoreSection["id"],
      slot: "header",
      moduleId: "catalog-header",
    });
    const html = renderSections(catalogModernStore, [headerSection], { pageType: "home" });
    const button = headerCartButton(html);

    // El runtime arma aria-label como `${data-cart-label} ${count}`; axe exige
    // que el texto visible normalizado esté contenido en ese nombre accesible.
    const label = button.match(/data-cart-label="([^"]*)"/)?.[1] ?? "";
    const visible = button
      .slice(button.indexOf(">") + 1)
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    expect(`${label} 0`).toBe("Carrito 0");
    expect(visible).toBe("Carrito 0");
    // El espacio debe ser un nodo de texto real entre los inline elements.
    expect(button).toContain("</span> <strong");
  });

  it("el trigger legacy ya separa label y contador con un nodo de texto", () => {
    const headerSection = referenceStore.sections.find(
      (candidate) => candidate.moduleId === "editorial-header",
    );
    if (!headerSection) throw new Error("Fixture legacy sin header editorial");
    const html = renderSections(referenceStore, [headerSection], { pageType: "home" });
    const start = html.indexOf('<button class="solara-cart-trigger"');
    if (start === -1) throw new Error("El header legacy no renderiza el botón del carrito");
    const end = html.indexOf("</button>", start);
    const button = html.slice(start, end + "</button>".length);
    const visible = button
      .slice(button.indexOf(">") + 1)
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(visible).toBe("Carrito 0");
  });
});
