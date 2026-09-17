import {
  assetUrl,
  type CanvasBinding,
  type CanvasEditorContext,
  canvasEntityAttributes,
  canvasImageAttributes,
  canvasRepeaterItemAttributes,
  canvasTextAttributes,
  escapeAttribute,
  escapeHtml,
  findVideo,
  formatMoneyForProject,
  type ModuleDefinition,
  moduleRoot,
  type RenderContext,
  renderImage,
  renderVideo,
  type SafeHtml,
  safeAssetUrl,
  safeHtml,
  safeUrl,
  sanitizeRichText,
} from "@solara/module-sdk";
import {
  type AssetId,
  CATALOG_MODERN_PLACEHOLDER_PHONE,
  type Product,
  productVideos,
  type StoreProjectV1,
} from "@solara/project-schema";
import { z } from "zod";
import {
  lowestPrice,
  renderBrand,
  renderProductCards,
  scopedAssetId,
  visibleProducts,
} from "./helpers";

const revealZone = [
  {
    id: "content",
    label: "Contenido",
    selector: '[data-motion-zone="content"]',
    allowedPresets: ["none", "fade", "fade-up", "slide", "scale"] as const,
  },
] as const;

const staggerZone = [
  {
    id: "items",
    label: "Elementos",
    selector: '[data-motion-zone="items"]',
    allowedPresets: ["none", "fade", "fade-up", "stagger"] as const,
  },
] as const;

function legacyCanvasContext(
  context: Pick<RenderContext<unknown>, "canvas" | "section">,
): CanvasEditorContext {
  return {
    editorMode: context.canvas?.editorMode === true,
    sectionId: context.section.id,
  };
}

function isPublicNavigationHref(project: StoreProjectV1, href: string | undefined): boolean {
  if (!href) return false;
  const path = href.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  return (
    !project.categories.some(
      (category) => category.status === "hidden" && path === `/categorias/${category.slug}`,
    ) &&
    !project.collections.some(
      (collection) => collection.status === "hidden" && path === `/colecciones/${collection.slug}`,
    )
  );
}

function sectionTextBinding(
  id: string,
  label: string,
  fieldKey: string,
  maxLength = 240,
): CanvasBinding {
  return {
    id,
    label,
    kind: "text",
    source: { kind: "section-setting", fieldKey },
    capabilities: ["edit-text"],
    maxLength,
  };
}

function sectionRichTextBinding(id: string, label: string, fieldKey: string): CanvasBinding {
  return {
    id,
    label,
    kind: "rich-text",
    source: { kind: "section-setting", fieldKey },
    capabilities: ["edit-rich-text"],
    multiline: true,
    maxLength: 4000,
  };
}

function sectionImageBinding(id: string, label: string, fieldKey: string): CanvasBinding {
  return {
    id,
    label,
    kind: "image",
    source: { kind: "section-setting", fieldKey },
    capabilities: ["edit-image"],
  };
}

function sectionLinkBinding(id: string, label: string, fieldKey: string): CanvasBinding {
  return {
    id,
    label,
    kind: "link",
    source: { kind: "section-setting", fieldKey },
    capabilities: ["edit-link"],
  };
}

function instrumentImage(
  image: SafeHtml | string,
  context: CanvasEditorContext,
  bindingId: string,
  itemId?: string,
): string {
  const item = itemId === undefined ? "" : ` data-canvas-item="${escapeAttribute(itemId)}"`;
  return String(image).replace("<img", `<img${canvasImageAttributes(context, bindingId)}${item}`);
}

function productCanvasBinding(
  id: string,
  label: string,
  field: "title" | "description" | "richDescription" | "brand" | "imageIds" | "price",
  kind: CanvasBinding["kind"],
  capabilities: CanvasBinding["capabilities"],
): CanvasBinding {
  return {
    id,
    label,
    kind,
    source: { kind: "product", entityId: "*", field },
    capabilities,
    ...(kind === "rich-text" ? { multiline: true, maxLength: 4000 } : {}),
  };
}

function taxonomyCanvasBinding(
  id: string,
  label: string,
  entityKind: "category" | "collection",
  field: "title" | "description" | "imageId",
  kind: CanvasBinding["kind"],
  capabilities: CanvasBinding["capabilities"],
): CanvasBinding {
  return {
    id,
    label,
    kind,
    source:
      entityKind === "category"
        ? { kind: "category", entityId: "*", field }
        : { kind: "collection", entityId: "*", field },
    capabilities,
  };
}

const announcementSettings = z.object({
  text: z.string().default("Envíos a todo el país"),
  linkLabel: z.string().default(""),
  linkHref: z.string().default(""),
});

export const announcementBar: ModuleDefinition<
  "announcement-bar",
  z.infer<typeof announcementSettings>
> = {
  manifest: {
    id: "announcement-bar",
    name: "Barra informativa",
    description: "Mensaje comercial breve con enlace opcional.",
    version: 1,
    slots: ["announcement"],
    compatibleSettings: ["text", "linkLabel", "linkHref"],
  },
  settingsSchema: announcementSettings,
  settingsFields: [
    { key: "text", type: "text", label: "Mensaje" },
    { key: "linkLabel", type: "text", label: "Texto del enlace" },
    { key: "linkHref", type: "url", label: "Destino del enlace" },
  ],
  motionZones: revealZone,
  canvasBindings: [
    sectionTextBinding("text", "Mensaje", "text", 180),
    sectionTextBinding("linkLabel", "Texto del enlace", "linkLabel", 100),
    sectionLinkBinding("linkHref", "Destino del enlace", "linkHref"),
  ],
  styleAsset: scopedAssetId("announcement-bar"),
  render(context) {
    const copy = context.project.publicCopy;
    const canvas = legacyCanvasContext(context);
    const link =
      context.settings.linkLabel && context.settings.linkHref
        ? `<a href="${escapeAttribute(safeUrl(context.settings.linkHref))}"${canvasTextAttributes(canvas, "linkLabel", 100)}>${escapeHtml(context.settings.linkLabel)}</a>`
        : "";
    return moduleRoot(
      "announcement-bar",
      context.section,
      safeHtml(
        `<div class="solara-announcement" data-motion-zone="content"><p${canvasTextAttributes(canvas, "text", 180)}>${escapeHtml(context.settings.text)}</p>${link}</div>`,
      ),
      { ariaLabel: copy.accessibility.announcements },
    );
  },
};

const headerSettings = z.object({
  catalogLabel: z.string().default("Categorías"),
  catalogHref: z.string().default("/#productos"),
  showCategories: z.boolean().default(true),
  cartLabel: z.string().default("Carrito"),
});

export const editorialHeader: ModuleDefinition<
  "editorial-header",
  z.infer<typeof headerSettings>
> = {
  manifest: {
    id: "editorial-header",
    name: "Header editorial",
    description: "Navegación compacta de una sola línea con menú móvil nativo.",
    version: 1,
    slots: ["header"],
    compatibleSettings: ["catalogLabel", "catalogHref", "showCategories", "cartLabel"],
  },
  settingsSchema: headerSettings,
  settingsFields: [
    { key: "catalogLabel", type: "text", label: "Texto del catálogo" },
    { key: "catalogHref", type: "url", label: "Destino del catálogo" },
    { key: "showCategories", type: "boolean", label: "Mostrar categorías" },
    { key: "cartLabel", type: "text", label: "Texto del carrito" },
  ],
  motionZones: revealZone,
  canvasBindings: [
    sectionTextBinding("catalogLabel", "Texto del catálogo", "catalogLabel", 100),
    sectionLinkBinding("catalogHref", "Destino del catálogo", "catalogHref"),
    {
      id: "showCategories",
      label: "Mostrar categorías",
      kind: "boolean",
      source: { kind: "section-setting", fieldKey: "showCategories" },
      capabilities: ["toggle-boolean"],
    },
    sectionTextBinding("cartLabel", "Texto del carrito", "cartLabel", 80),
    {
      id: "identity-brand",
      label: "Nombre de marca",
      kind: "text",
      source: { kind: "identity", field: "brandName" },
      capabilities: ["edit-text"],
      maxLength: 120,
    },
    {
      id: "identity-logo",
      label: "Logo de la marca",
      kind: "image",
      source: { kind: "identity", field: "logoAssetId" },
      capabilities: ["edit-image"],
    },
  ],
  clientAsset: "storefront-cart" as AssetId,
  styleAsset: scopedAssetId("editorial-header"),
  render(context) {
    const copy = context.project.publicCopy;
    const canvas = legacyCanvasContext(context);
    const navigation = context.project.navigation;
    const isV2 = context.project.commerceTemplates.designFamily === "catalog-modern-v2";
    const publishedNavigationItems = navigation.items.flatMap((item) => {
      const normalizeHref = (href: string | undefined): string | undefined => {
        if (/^\/contacto\/?$/i.test(href ?? "")) return "/#contact-form";
        if (/^\/nosotros\/?$/i.test(href ?? "")) return undefined;
        if (isV2 && /^\/compra\/?$/i.test(href ?? "")) return "/#contact-form";
        if (isV2 && /^\/(envios|devoluciones)\/?$/i.test(href ?? "")) return undefined;
        return href;
      };
      const href = normalizeHref(item.href);
      if ((isV2 && !href) || !isPublicNavigationHref(context.project, href)) return [];
      const children = item.children
        ?.map((child) => ({ ...child, href: normalizeHref(child.href) }))
        .filter(
          (child): child is typeof child & { href: string } =>
            Boolean(child.href) && isPublicNavigationHref(context.project, child.href),
        );
      return [
        {
          ...item,
          href,
          ...(children ? { children } : {}),
        },
      ];
    });
    const nestedItems = publishedNavigationItems
      .map(
        (item) =>
          `<li><a href="${escapeAttribute(safeUrl(item.href ?? "#"))}">${escapeHtml(item.label)}</a>${
            item.children?.length
              ? `<ul>${item.children
                  .map(
                    (child) =>
                      `<li><a href="${escapeAttribute(safeUrl(child.href ?? "#"))}">${escapeHtml(child.label)}</a></li>`,
                  )
                  .join("")}</ul>`
              : ""
          }</li>`,
      )
      .join("");
    const homeCurrent = context.pageType === "home" ? ' aria-current="page"' : "";
    const catalogCurrent = ["category", "collection"].includes(context.pageType)
      ? ' aria-current="page"'
      : "";
    const searchCurrent = context.pageType === "search" ? ' aria-current="page"' : "";
    const cartCurrent = context.pageType === "cart" ? ' aria-current="page"' : "";
    const catalogClass =
      publishedNavigationItems.length > 6
        ? "solara-nav-dropdown solara-nav-dropdown--wide"
        : "solara-nav-dropdown";
    const catalog = context.settings.showCategories
      ? `<details class="${catalogClass}"><summary${catalogCurrent}${canvasTextAttributes(canvas, "catalogLabel", 100)}>${escapeHtml(navigation.catalogLabel || context.settings.catalogLabel)}</summary><ul>${nestedItems || `<li><a href="${escapeAttribute(safeUrl(context.settings.catalogHref))}">${escapeHtml(context.settings.catalogLabel)}</a></li>`}</ul></details>`
      : `<a href="${escapeAttribute(safeUrl(context.settings.catalogHref))}"${catalogCurrent}${canvasTextAttributes(canvas, "catalogLabel", 100)}>${escapeHtml(navigation.catalogLabel || context.settings.catalogLabel)}</a>`;
    const nav = `${navigation.showHome ? `<a href="/"${homeCurrent}>${escapeHtml(copy.navigation.home)}</a>` : ""}${catalog}`;
    const actions = `${navigation.showSearch && context.project.commerceTemplates.search.enabled ? `<a class="solara-search-trigger" href="/buscar/" aria-label="${escapeAttribute(copy.navigation.search)}"${searchCurrent}>${escapeHtml(copy.navigation.search)}</a>` : ""}${navigation.showCart && context.project.siteShell.cart && (context.project.commerceTemplates.cart.enabled || context.project.commerceTemplates.checkout.enabled) ? `<button class="solara-cart-trigger" type="button" data-solara-cart-open data-open-cart data-cart-label="${escapeAttribute(context.settings.cartLabel || copy.navigation.cart)}" aria-controls="solara-cart" aria-expanded="false"${cartCurrent}${canvasTextAttributes(canvas, "cartLabel", 80)}>${escapeHtml(context.settings.cartLabel || copy.navigation.cart)} <span data-solara-cart-count data-cart-count aria-live="polite">0</span></button>` : ""}`;
    return moduleRoot(
      "editorial-header",
      context.section,
      safeHtml(`<div class="solara-header" data-motion-zone="content">
        <a class="solara-brand" href="/" aria-label="${escapeAttribute(`${copy.navigation.home} de ${context.project.identity.brandName}`)}">${renderBrand(context.project, canvas)}</a>
        <nav class="solara-desktop-nav" aria-label="${escapeAttribute(copy.accessibility.mainNavigation)}">${nav}</nav>
        <div class="solara-header-actions">${actions}</div>
        <details class="solara-mobile-nav">
          <summary>${escapeHtml(copy.navigation.openMenu)}</summary>
          <nav aria-label="${escapeAttribute(copy.accessibility.mobileNavigation)}">${nav}</nav>
        </details>
      </div>`),
      { tag: "header" },
    );
  },
};

const heroSettings = z.object({
  eyebrow: z.string().default(""),
  title: z.string().default("Objetos hechos para acompañarte"),
  body: z.string().default("Una selección precisa para el uso cotidiano."),
  actionLabel: z.string().default("Ver colección"),
  actionHref: z.string().default("/#productos"),
  imageId: z.string().default(""),
  imagePosition: z.enum(["left", "right"]).default("right"),
});

const heroSlideSchema = z.object({
  id: z.string().min(1),
  eyebrow: z.string().default(""),
  title: z.string().min(1),
  body: z.string().default(""),
  actionLabel: z.string().default("Ver colección"),
  actionHref: z.string().default("/categorias/mesa/"),
  imageId: z.string().default(""),
});

const heroMediaSettings = z.object({
  mode: z.enum(["image", "carousel", "video"]).default("image"),
  eyebrow: z.string().default(""),
  title: z.string().default("Objetos hechos para acompañarte"),
  body: z.string().default("Una selección precisa para el uso cotidiano."),
  actionLabel: z.string().default("Ver colección"),
  actionHref: z.string().default("/categorias/mesa/"),
  posterAssetId: z.string().default(""),
  videoAssetId: z.string().default(""),
  slides: z.array(heroSlideSchema).default([]),
  autoplay: z.boolean().default(true),
  intervalMs: z.number().int().min(3000).max(15000).default(6000),
  overlay: z.enum(["light", "dark", "none"]).default("dark"),
  alignment: z.enum(["left", "center"]).default("left"),
});

type HeroSettings = z.infer<typeof heroSettings>;

function heroFallbackImageId(context: RenderContext<HeroSettings>): string | undefined {
  return (
    context.settings.imageId ||
    context.project.seo.socialImageId ||
    context.project.collections.find((collection) => collection.status !== "hidden")?.imageId ||
    context.project.products.find((product) => product.status === "active")?.imageIds[0]
  );
}

function renderHeroCopy(
  settings: HeroSettings,
  className = "solara-hero-copy",
  canvas?: CanvasEditorContext,
): string {
  return `<div class="${className}" data-motion-zone="content">
    ${settings.eyebrow ? `<p class="solara-eyebrow"${canvas ? canvasTextAttributes(canvas, "eyebrow", 100) : ""}>${escapeHtml(settings.eyebrow)}</p>` : ""}
    <h1${canvas ? canvasTextAttributes(canvas, "title", 180) : ""}>${escapeHtml(settings.title)}</h1>
    <p class="solara-hero-body"${canvas ? canvasTextAttributes(canvas, "body", 300) : ""}>${escapeHtml(settings.body)}</p>
    <a class="solara-primary-action" href="${escapeAttribute(safeUrl(settings.actionHref))}"${canvas ? canvasTextAttributes(canvas, "actionLabel", 100) : ""}>${escapeHtml(settings.actionLabel)}</a>
  </div>`;
}

function renderEditorialHeroMedia(
  context: RenderContext<HeroSettings>,
  bindingId = "imageId",
): string {
  const image = renderImage(context.project, heroFallbackImageId(context), {
    className: "solara-hero-image",
    loading: "eager",
    fetchPriority: "high",
    sizes: "(max-width: 767px) 100vw, 64vw",
    fallbackAlt: context.settings.title,
  });
  return `<figure class="solara-hero-media" data-motion-zone="media">${instrumentImage(image, legacyCanvasContext(context), bindingId)}</figure>`;
}

export const heroMedia: ModuleDefinition<"hero-media", z.infer<typeof heroMediaSettings>> = {
  manifest: {
    id: "hero-media",
    name: "Hero audiovisual",
    description: "Hero editorial con imagen, carrusel o video local autocontenido.",
    version: 1,
    slots: ["hero"],
    compatibleSettings: [
      "mode",
      "eyebrow",
      "title",
      "body",
      "actionLabel",
      "actionHref",
      "posterAssetId",
      "videoAssetId",
      "slides",
      "autoplay",
      "intervalMs",
      "overlay",
      "alignment",
    ],
  },
  settingsSchema: heroMediaSettings,
  settingsFields: [
    {
      key: "mode",
      type: "select",
      label: "Modo del hero",
      options: [
        { value: "image", label: "Imagen" },
        { value: "carousel", label: "Carrusel" },
        { value: "video", label: "Video local" },
      ],
    },
    { key: "eyebrow", type: "text", label: "Antetítulo" },
    { key: "title", type: "text", label: "Título" },
    { key: "body", type: "text", label: "Descripción" },
    { key: "actionLabel", type: "text", label: "Texto de la acción" },
    { key: "actionHref", type: "url", label: "Destino de la acción" },
    { key: "posterAssetId", type: "asset", label: "Poster / imagen" },
    { key: "videoAssetId", type: "asset", label: "Video local" },
    { key: "slides", type: "array", label: "Slides del carrusel" },
    { key: "autoplay", type: "boolean", label: "Reproducción automática" },
    {
      key: "intervalMs",
      type: "number",
      label: "Intervalo (ms)",
      min: 3000,
      max: 15000,
      step: 500,
    },
    {
      key: "overlay",
      type: "select",
      label: "Overlay",
      options: [
        { value: "light", label: "Claro" },
        { value: "dark", label: "Oscuro" },
        { value: "none", label: "Sin overlay" },
      ],
    },
    {
      key: "alignment",
      type: "select",
      label: "Alineación",
      options: [
        { value: "left", label: "Izquierda" },
        { value: "center", label: "Centro" },
      ],
    },
  ],
  motionZones: [
    ...revealZone,
    {
      id: "media",
      label: "Media",
      selector: '[data-motion-zone="media"]',
      allowedPresets: ["none", "fade", "scale", "parallax"] as const,
    },
  ],
  canvasBindings: [
    sectionTextBinding("eyebrow", "Antetítulo", "eyebrow", 100),
    sectionTextBinding("title", "Título", "title", 180),
    sectionTextBinding("body", "Descripción", "body", 300),
    sectionTextBinding("actionLabel", "Texto de la acción", "actionLabel", 100),
    sectionLinkBinding("actionHref", "Destino de la acción", "actionHref"),
    sectionImageBinding("posterAssetId", "Poster / imagen", "posterAssetId"),
    {
      id: "slide-title",
      label: "Título de slide",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "title" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 180,
    },
    {
      id: "slide-eyebrow",
      label: "Antetítulo de slide",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "eyebrow" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 100,
    },
    {
      id: "slide-body",
      label: "Descripción de slide",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "body" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 300,
    },
    {
      id: "slide-image",
      label: "Imagen de slide",
      kind: "image",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "imageId" },
      capabilities: ["edit-repeater-item", "edit-image"],
    },
  ],
  clientAsset: "storefront-hero" as AssetId,
  styleAsset: scopedAssetId("hero-media"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const settings = context.settings;
    const copy = context.project.publicCopy;
    const fallbackImageId =
      settings.posterAssetId ||
      context.project.seo.socialImageId ||
      context.project.collections.find((collection) => collection.status !== "hidden")?.imageId ||
      context.project.products.find((product) => product.status === "active")?.imageIds[0];
    const slide = settings.slides[0];
    const title = slide?.title || settings.title;
    const body = slide?.body || settings.body;
    const eyebrow = slide?.eyebrow || settings.eyebrow;
    const actionLabel = slide?.actionLabel || settings.actionLabel;
    const actionHref = slide?.actionHref || settings.actionHref;
    const imageId = slide?.imageId || fallbackImageId;
    const image = renderImage(context.project, imageId, {
      className: "solara-hero-media-image",
      loading: "eager",
      fetchPriority: "high",
      sizes: "100vw",
      fallbackAlt: title,
    });
    const video =
      settings.mode === "video"
        ? renderVideo(context.project, settings.videoAssetId, {
            className: "solara-hero-media-video",
            posterAssetId: settings.posterAssetId,
            preload: "none",
            autoplay: settings.autoplay,
            fallbackAlt: title,
          })
        : "";
    const videoAsset = findVideo(context.project, settings.videoAssetId);
    const posterImage =
      settings.mode === "video"
        ? renderImage(context.project, settings.posterAssetId || videoAsset?.posterAssetId, {
            className: "solara-hero-media-poster",
            loading: "eager",
            fetchPriority: "high",
            sizes: "100vw",
            fallbackAlt: title,
          })
        : "";
    const media =
      settings.mode === "video" && video
        ? safeHtml(`${instrumentImage(posterImage, canvas, "posterAssetId")}${video}`)
        : safeHtml(instrumentImage(image, canvas, "posterAssetId"));
    const slides = settings.mode === "carousel" ? settings.slides : [];
    const slidePanels = slides
      .map((item, index) => {
        const slideImage = renderImage(context.project, item.imageId || fallbackImageId, {
          className: "solara-hero-media-image",
          loading: index === 0 ? "eager" : "lazy",
          sizes: "100vw",
          fallbackAlt: item.title,
        });
        return `<div id="hero-slide-${escapeAttribute(context.section.id)}-${index}" class="solara-hero-slide-panel" data-hero-slide-panel="${index}" data-hero-active="${String(index === 0)}" aria-hidden="${String(index !== 0)}" data-hero-title="${escapeAttribute(item.title)}" data-hero-body="${escapeAttribute(item.body)}" data-hero-eyebrow="${escapeAttribute(item.eyebrow)}" data-hero-action-label="${escapeAttribute(item.actionLabel)}" data-hero-action-href="${escapeAttribute(safeUrl(item.actionHref))}">${instrumentImage(slideImage, canvas, "slide-image", item.id)}</div>`;
      })
      .join("");
    const indicators = slides.length
      ? `<div class="solara-hero-indicators" role="tablist" aria-label="${escapeAttribute(copy.accessibility.heroSlides)}">${slides
          .map(
            (_item, index) =>
              `<button type="button" data-hero-slide="${index}" role="tab" aria-controls="hero-slide-${escapeAttribute(context.section.id)}-${index}" aria-label="${escapeAttribute(copy.accessibility.goToSlide.replace("{index}", String(index + 1)))}" aria-selected="${index === 0 ? "true" : "false"}"></button>`,
          )
          .join("")}</div>`
      : "";
    const controls =
      slides.length > 1
        ? `<div class="solara-hero-controls"><button type="button" data-hero-prev aria-label="${escapeAttribute(copy.hero.slidePrev)}">${escapeHtml(copy.hero.slidePrev)}</button><button type="button" data-hero-next aria-label="${escapeAttribute(copy.hero.slideNext)}">${escapeHtml(copy.hero.slideNext)}</button>${indicators}</div>`
        : "";
    const titleAttributes = slide
      ? canvasRepeaterItemAttributes(canvas, "slide-title", slide.id)
      : canvasTextAttributes(canvas, "title", 180);
    const bodyAttributes = slide
      ? canvasRepeaterItemAttributes(canvas, "slide-body", slide.id)
      : canvasTextAttributes(canvas, "body", 300);
    const eyebrowAttributes = slide
      ? canvasRepeaterItemAttributes(canvas, "slide-eyebrow", slide.id)
      : canvasTextAttributes(canvas, "eyebrow", 100);
    const actionAttributes = slide
      ? canvasRepeaterItemAttributes(canvas, "slide-action-label", slide.id)
      : canvasTextAttributes(canvas, "actionLabel", 100);
    return moduleRoot(
      "hero-media",
      context.section,
      safeHtml(`<div class="solara-hero-media-shell solara-hero-media-shell--${settings.alignment} solara-hero-media-shell--overlay-${settings.overlay}" data-hero-mode="${settings.mode}" data-hero-autoplay="${String(settings.autoplay)}" data-hero-interval="${settings.intervalMs}" data-motion-zone="media"${slides.length > 1 ? ` role="region" aria-roledescription="carousel" aria-label="${escapeAttribute(copy.accessibility.heroSlides)}"` : ""}>
        <div class="solara-hero-media-backdrop">${settings.mode === "carousel" && slidePanels ? slidePanels : media}</div>
        <div class="solara-hero-media-copy" data-motion-zone="content">
          ${eyebrow ? `<p class="solara-eyebrow"${eyebrowAttributes}>${escapeHtml(eyebrow)}</p>` : ""}
          <h1${titleAttributes}>${escapeHtml(title)}</h1>
          <p class="solara-hero-body"${bodyAttributes}>${escapeHtml(body)}</p>
          <a class="solara-primary-action" href="${escapeAttribute(safeUrl(actionHref))}"${actionAttributes}>${escapeHtml(actionLabel)}</a>
        </div>
        ${settings.mode === "video" && video ? `<button type="button" class="solara-hero-video-toggle" data-hero-video-toggle aria-pressed="false">${escapeHtml(copy.hero.pauseVideo)}</button>` : ""}
        ${controls}
      </div>`),
    );
  },
};

export const splitHero: ModuleDefinition<"split-hero", z.infer<typeof heroSettings>> = {
  manifest: {
    id: "split-hero",
    name: "Hero dividido",
    description: "Composición asimétrica de contenido y fotografía.",
    version: 1,
    slots: ["hero"],
    compatibleSettings: [
      "eyebrow",
      "title",
      "body",
      "actionLabel",
      "actionHref",
      "imageId",
      "imagePosition",
    ],
  },
  settingsSchema: heroSettings,
  settingsFields: [
    { key: "eyebrow", type: "text", label: "Antetítulo" },
    { key: "title", type: "text", label: "Título" },
    { key: "body", type: "text", label: "Descripción" },
    { key: "actionLabel", type: "text", label: "Texto de la acción" },
    { key: "actionHref", type: "url", label: "Destino de la acción" },
    { key: "imageId", type: "asset", label: "Imagen" },
    {
      key: "imagePosition",
      type: "select",
      label: "Posición de la imagen",
      options: [
        { value: "left", label: "Izquierda" },
        { value: "right", label: "Derecha" },
      ],
    },
  ],
  motionZones: [
    ...revealZone,
    {
      id: "media",
      label: "Imagen",
      selector: '[data-motion-zone="media"]',
      allowedPresets: ["none", "fade", "scale", "parallax"] as const,
    },
  ],
  canvasBindings: [
    sectionTextBinding("eyebrow", "Antetítulo", "eyebrow", 100),
    sectionTextBinding("title", "Título", "title", 180),
    sectionTextBinding("body", "Descripción", "body", 300),
    sectionTextBinding("actionLabel", "Texto de la acción", "actionLabel", 100),
    sectionLinkBinding("actionHref", "Destino de la acción", "actionHref"),
    sectionImageBinding("imageId", "Imagen", "imageId"),
  ],
  styleAsset: scopedAssetId("split-hero"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const media = renderEditorialHeroMedia(context);
    const copy = renderHeroCopy(context.settings, "solara-hero-copy", canvas);
    const content =
      context.settings.imagePosition === "left" ? `${media}${copy}` : `${copy}${media}`;
    return moduleRoot(
      "split-hero",
      context.section,
      safeHtml(
        `<div class="solara-split-hero solara-split-hero--${context.settings.imagePosition}">${content}</div>`,
      ),
    );
  },
};

export const editorialHero: ModuleDefinition<"editorial-hero", z.infer<typeof heroSettings>> = {
  manifest: {
    id: "editorial-hero",
    name: "Hero editorial",
    description: "Titular manifiesto con la imagen integrada al ritmo de lectura.",
    version: 1,
    slots: ["hero"],
    compatibleSettings: [
      "eyebrow",
      "title",
      "body",
      "actionLabel",
      "actionHref",
      "imageId",
      "imagePosition",
    ],
  },
  settingsSchema: heroSettings,
  settingsFields: [
    { key: "eyebrow", type: "text", label: "Antetítulo" },
    { key: "title", type: "text", label: "Título" },
    { key: "body", type: "text", label: "Descripción" },
    { key: "actionLabel", type: "text", label: "Texto de la acción" },
    { key: "actionHref", type: "url", label: "Destino de la acción" },
    { key: "imageId", type: "asset", label: "Imagen" },
    {
      key: "imagePosition",
      type: "select",
      label: "Posición de la imagen",
      options: [
        { value: "left", label: "Izquierda" },
        { value: "right", label: "Derecha" },
      ],
    },
  ],
  motionZones: [
    ...revealZone,
    {
      id: "media",
      label: "Imagen",
      selector: '[data-motion-zone="media"]',
      allowedPresets: ["none", "fade", "scale", "parallax"] as const,
    },
  ],
  canvasBindings: [
    sectionTextBinding("eyebrow", "Antetítulo", "eyebrow", 100),
    sectionTextBinding("title", "Título", "title", 180),
    sectionTextBinding("body", "Descripción", "body", 300),
    sectionTextBinding("actionLabel", "Texto de la acción", "actionLabel", 100),
    sectionLinkBinding("actionHref", "Destino de la acción", "actionHref"),
    sectionImageBinding("imageId", "Imagen", "imageId"),
  ],
  styleAsset: scopedAssetId("editorial-hero"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const media = renderEditorialHeroMedia(context);
    const copy = renderHeroCopy(context.settings, "solara-editorial-head", canvas);
    const content =
      context.settings.imagePosition === "left" ? `${media}${copy}` : `${copy}${media}`;
    return moduleRoot(
      "editorial-hero",
      context.section,
      safeHtml(
        `<div class="solara-editorial-hero solara-editorial-hero--${context.settings.imagePosition}">${content}</div>`,
      ),
    );
  },
};

const collectionSettings = z.object({
  title: z.string().default("Colecciones"),
  limit: z.number().int().min(1).max(12).default(6),
});

export const collectionGrid: ModuleDefinition<
  "collection-grid",
  z.infer<typeof collectionSettings>
> = {
  manifest: {
    id: "collection-grid",
    name: "Grilla de colecciones",
    description: "Colecciones visuales con jerarquía asimétrica.",
    version: 1,
    slots: ["catalog"],
    compatibleSettings: ["title", "limit"],
  },
  settingsSchema: collectionSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "limit", type: "number", label: "Cantidad", min: 1, max: 12, step: 1 },
  ],
  motionZones: staggerZone,
  canvasBindings: [
    sectionTextBinding("title", "Título", "title", 120),
    taxonomyCanvasBinding(
      "collection-title",
      "Título de colección",
      "collection",
      "title",
      "text",
      ["edit-text"],
    ),
    taxonomyCanvasBinding(
      "collection-description",
      "Descripción de colección",
      "collection",
      "description",
      "text",
      ["edit-text"],
    ),
    taxonomyCanvasBinding(
      "collection-image",
      "Imagen de colección",
      "collection",
      "imageId",
      "image",
      ["edit-image"],
    ),
  ],
  styleAsset: scopedAssetId("collection-grid"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const collections = context.project.collections
      .filter((collection) => collection.status !== "hidden")
      .slice(0, context.settings.limit);
    const items = collections.map((collection) => {
      const image = renderImage(context.project, collection.imageId, {
        className: "solara-collection-image",
        sizes: "(max-width: 767px) 92vw, 48vw",
        fallbackAlt: collection.title,
      });
      return `<article class="solara-collection-card">
        <a href="/colecciones/${escapeAttribute(collection.slug)}/">
          <figure>${instrumentImage(image, canvas, "collection-image")}</figure>
          <div><h3${canvasEntityAttributes(canvas, "collection-title", "collection", collection.id, "title")}>${escapeHtml(collection.title)}</h3><p${canvasEntityAttributes(canvas, "collection-description", "collection", collection.id, "description")}>${escapeHtml(collection.description)}</p></div>
        </a>
      </article>`;
    });
    return moduleRoot(
      "collection-grid",
      context.section,
      safeHtml(`<div class="solara-section-shell">
        <h2${canvasTextAttributes(canvas, "title", 120)}>${escapeHtml(context.settings.title)}</h2>
        <div class="solara-collection-grid" data-motion-zone="items">${items.join("") || '<p class="solara-empty-state">Todavía no hay colecciones publicadas.</p>'}</div>
      </div>`),
    );
  },
};

const productGridSettings = z.object({
  title: z.string().default("Productos"),
  limit: z.number().int().min(1).max(48).default(12),
});

export const editorialProductGrid: ModuleDefinition<
  "editorial-product-grid",
  z.infer<typeof productGridSettings>
> = {
  manifest: {
    id: "editorial-product-grid",
    name: "Grilla editorial de productos",
    description: "Catálogo espacioso orientado a fotografía y relato.",
    version: 1,
    slots: ["catalog"],
    compatibleSettings: ["title", "limit"],
  },
  settingsSchema: productGridSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "limit", type: "number", label: "Cantidad", min: 1, max: 48, step: 1 },
  ],
  motionZones: staggerZone,
  canvasBindings: [
    sectionTextBinding("title", "Título", "title", 120),
    productCanvasBinding("product-title", "Título de producto", "title", "text", ["edit-text"]),
    productCanvasBinding("product-description", "Descripción de producto", "description", "text", [
      "edit-text",
    ]),
    productCanvasBinding("product-image", "Imagen de producto", "imageIds", "image", [
      "edit-image",
    ]),
  ],
  styleAsset: scopedAssetId("editorial-product-grid"),
  render(context) {
    const listing = ["category", "collection"].includes(context.pageType);
    const products = listing
      ? visibleProducts(context)
      : visibleProducts(context).slice(0, context.settings.limit);
    return moduleRoot(
      "editorial-product-grid",
      context.section,
      safeHtml(`<div class="solara-section-shell" id="productos">
        <h2${canvasTextAttributes(legacyCanvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</h2>
        <div class="solara-editorial-products" data-motion-zone="items"${context.pageType === "category" ? " data-category-grid" : ""}>${renderProductCards(context.project, products, "editorial", legacyCanvasContext(context)) || `<p class="solara-empty-state">${escapeHtml(context.project.publicCopy.empty.products)}</p>`}</div>
      </div>`),
    );
  },
};

export const compactProductGrid: ModuleDefinition<
  "compact-product-grid",
  z.infer<typeof productGridSettings>
> = {
  manifest: {
    id: "compact-product-grid",
    name: "Grilla compacta de productos",
    description: "Vista de mayor densidad para catálogos extensos.",
    version: 1,
    slots: ["catalog"],
    compatibleSettings: ["title", "limit"],
  },
  settingsSchema: productGridSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "limit", type: "number", label: "Cantidad", min: 1, max: 48, step: 1 },
  ],
  motionZones: staggerZone,
  canvasBindings: [
    sectionTextBinding("title", "Título", "title", 120),
    productCanvasBinding("product-title", "Título de producto", "title", "text", ["edit-text"]),
    productCanvasBinding("product-description", "Descripción de producto", "description", "text", [
      "edit-text",
    ]),
    productCanvasBinding("product-image", "Imagen de producto", "imageIds", "image", [
      "edit-image",
    ]),
  ],
  styleAsset: scopedAssetId("compact-product-grid"),
  render(context) {
    const listing = ["category", "collection"].includes(context.pageType);
    const products = listing
      ? visibleProducts(context)
      : visibleProducts(context).slice(0, context.settings.limit);
    return moduleRoot(
      "compact-product-grid",
      context.section,
      safeHtml(`<div class="solara-section-shell" id="productos">
        <h2${canvasTextAttributes(legacyCanvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</h2>
        <div class="solara-compact-products" data-motion-zone="items"${context.pageType === "category" ? " data-category-grid" : ""}>${renderProductCards(context.project, products, "compact", legacyCanvasContext(context)) || `<p class="solara-empty-state">${escapeHtml(context.project.publicCopy.empty.products)}</p>`}</div>
      </div>`),
    );
  },
};

const productDetailSettings = z.object({
  actionLabel: z.string().default("Agregar al carrito"),
  showDescription: z.boolean().default(true),
  showCompareAtPrice: z.boolean().default(true),
  deliveryNote: z.string().default("Coordinamos entrega y pago por WhatsApp."),
});

function buildWhatsAppInquiryLink(
  context: Parameters<NonNullable<(typeof productDetail)["render"]>>[0],
  product: Product,
): string {
  const rawPhone = context.project.whatsapp.phone;
  const phone = rawPhone.replace(/\D/g, "");
  if (!phone || rawPhone === CATALOG_MODERN_PLACEHOLDER_PHONE) return "";
  const firstVariant = product.variants.find((variant) => variant.available) ?? product.variants[0];
  const message = [
    context.project.whatsapp.greeting,
    `Producto: ${product.title}`,
    firstVariant ? `Variante: ${firstVariant.title}` : "",
    `Precio: ${formatMoneyForProject(firstVariant?.price ?? lowestPrice(product), context.project)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const productDetail: ModuleDefinition<
  "product-detail",
  z.infer<typeof productDetailSettings>
> = {
  manifest: {
    id: "product-detail",
    name: "Detalle de producto",
    description: "Galería, variantes, precio y acción de compra semánticos.",
    version: 1,
    slots: ["product"],
    compatibleSettings: ["actionLabel", "showDescription", "showCompareAtPrice", "deliveryNote"],
  },
  settingsSchema: productDetailSettings,
  settingsFields: [
    { key: "actionLabel", type: "text", label: "Texto de la acción" },
    { key: "showDescription", type: "boolean", label: "Mostrar descripción" },
    { key: "showCompareAtPrice", type: "boolean", label: "Mostrar precio anterior" },
    { key: "deliveryNote", type: "text", label: "Nota de entrega" },
  ],
  motionZones: revealZone,
  canvasBindings: [
    sectionTextBinding("actionLabel", "Texto de la acción", "actionLabel", 100),
    sectionTextBinding("deliveryNote", "Nota de entrega", "deliveryNote", 240),
    {
      id: "showDescription",
      label: "Mostrar descripción",
      kind: "boolean",
      source: { kind: "section-setting", fieldKey: "showDescription" },
      capabilities: ["toggle-boolean"],
    },
    productCanvasBinding("product-title", "Título de producto", "title", "text", ["edit-text"]),
    productCanvasBinding("product-brand", "Marca de producto", "brand", "text", ["edit-text"]),
    productCanvasBinding("product-description", "Descripción de producto", "description", "text", [
      "edit-text",
    ]),
    productCanvasBinding(
      "product-rich-description",
      "Descripción enriquecida",
      "richDescription",
      "rich-text",
      ["edit-rich-text"],
    ),
    productCanvasBinding("product-image", "Imagen de producto", "imageIds", "image", [
      "edit-image",
    ]),
    productCanvasBinding("product-price", "Precio de producto", "price", "number", ["edit-number"]),
    {
      id: "asset-alt",
      label: "Texto alternativo de imagen",
      kind: "text",
      source: { kind: "asset", entityId: "*", field: "alt" },
      capabilities: ["edit-alt", "edit-text"],
      maxLength: 180,
    },
  ],
  clientAsset: "storefront-cart" as AssetId,
  styleAsset: scopedAssetId("product-detail"),
  render(context) {
    const copy = context.project.publicCopy;
    const canvas = legacyCanvasContext(context);
    const product = context.product ?? visibleProducts(context)[0];
    if (!product) {
      return moduleRoot(
        "product-detail",
        context.section,
        safeHtml(`<p class="solara-empty-state">${escapeHtml(copy.empty.products)}</p>`),
      );
    }
    const firstVariant =
      product.variants.find((variant) => variant.available) ?? product.variants[0];
    const galleryAssetIds = [
      ...product.variants.map((variant) => variant.imageId),
      ...product.imageIds,
    ].filter(
      (assetId, index, all): assetId is AssetId =>
        Boolean(assetId) && all.indexOf(assetId) === index,
    );
    const galleryVideos = productVideos(product, context.project);
    const galleryFigures = [
      ...galleryAssetIds.map((assetId, index) => {
        const image = renderImage(context.project, assetId, {
          className: "solara-product-gallery-image",
          loading: index === 0 && galleryVideos.length === 0 ? "eager" : "lazy",
          sizes: "(max-width: 767px) 92vw, 58vw",
          fallbackAlt: product.title,
        });
        return `<figure data-gallery-image-id="${escapeAttribute(assetId)}" data-gallery-media-id="${escapeAttribute(assetId)}" data-media-kind="image" data-gallery-active="${String(index === 0)}"${canvasEntityAttributes(canvas, "product-image", "product", product.id, "imageIds", "image")}>${instrumentImage(image, canvas, "asset-alt")}</figure>`;
      }),
      ...galleryVideos.map((video, videoIndex) => {
        const posterUrl = video.posterAssetId
          ? assetUrl(context.project, video.posterAssetId, "")
          : "";
        const isActive = galleryAssetIds.length === 0 && videoIndex === 0;
        const caption = video.alt || video.name;
        const posterImg = renderImage(context.project, video.posterAssetId, {
          className: "solara-product-gallery-image",
          loading: "lazy",
          sizes: "(max-width: 767px) 92vw, 58vw",
          fallbackAlt: `${product.title}, video ${videoIndex + 1}`,
        });
        return `<figure data-gallery-media-id="${escapeAttribute(video.id)}" data-media-kind="video" data-gallery-active="${String(isActive)}"><video class="solara-product-gallery-video" width="${video.width}" height="${video.height}"${posterUrl ? ` poster="${escapeAttribute(posterUrl)}"` : ""} preload="none" playsinline controls aria-label="${escapeAttribute(caption)}"><source src="${escapeAttribute(safeAssetUrl(video.source, ""))}" type="${escapeAttribute(video.mimeType)}">${posterImg}<span>${escapeHtml(caption)}</span></video></figure>`;
      }),
    ].join("");
    const galleryThumbs = [
      ...galleryAssetIds.map((assetId, index) => {
        const image = renderImage(context.project, assetId, {
          className: "solara-product-gallery-thumb",
          loading: "lazy",
          sizes: "5rem",
          fallbackAlt: `${product.title}, imagen ${index + 1}`,
        });
        return `<button type="button" data-gallery-thumb="${escapeAttribute(assetId)}" aria-label="${escapeAttribute(copy.export.viewImage.replace("{index}", String(index + 1)))}" aria-current="${String(index === 0)}">${image}</button>`;
      }),
      ...galleryVideos.map((video, videoIndex) => {
        const thumb = renderImage(context.project, video.posterAssetId, {
          className: "solara-product-gallery-thumb",
          loading: "lazy",
          sizes: "5rem",
          fallbackAlt: `${product.title}, video ${videoIndex + 1}`,
        });
        return `<button type="button" data-gallery-thumb="${escapeAttribute(video.id)}" data-media-kind="video" aria-label="${escapeAttribute(`Ver video ${videoIndex + 1}`)}" aria-current="${String(galleryAssetIds.length === 0 && videoIndex === 0)}">${thumb}<span class="solara-product-thumb-badge" aria-hidden="true">▶ ${Math.round(video.durationSeconds)}s</span></button>`;
      }),
    ].join("");
    const gallery =
      galleryAssetIds.length > 0 || galleryVideos.length > 0
        ? `<div class="solara-product-gallery" data-product-gallery><div class="solara-product-gallery-main">${galleryFigures}</div><div class="solara-product-gallery-thumbs">${galleryThumbs}</div></div>`
        : `<p class="solara-empty-state">${escapeHtml(copy.empty.products)}</p>`;
    const variants = product.variants
      .map((variant) => {
        const variantImage = context.project.assets.find(
          (asset) => asset.id === (variant.imageId ?? product.imageIds[0]),
        );
        return `<option value="${escapeAttribute(variant.id)}" data-variant-data="${escapeAttribute(variant.id)}" data-variant-id="${escapeAttribute(variant.id)}" data-variant-title="${escapeAttribute(variant.title)}" data-sku="${escapeAttribute(variant.sku)}" data-image-id="${escapeAttribute(variant.imageId ?? product.imageIds[0] ?? "")}"${variantImage ? ` data-image-url="${escapeAttribute(safeAssetUrl(variantImage.source, ""))}" data-image-width="${variantImage.width}" data-image-height="${variantImage.height}"` : ""} data-price="${variant.price}" data-compare-at="${variant.compareAtPrice ?? ""}" data-available="${String(variant.available)}" ${variant.available ? "" : "disabled"}${variant.id === firstVariant?.id ? " selected" : ""}>${escapeHtml(variant.title)} - ${escapeHtml(formatMoneyForProject(variant.price, context.project))}${variant.available ? "" : ` - ${escapeHtml(copy.product.outOfStock)}`}</option>`;
      })
      .join("");
    const monoVariant = product.variants.length === 1;
    const whatsappFallback = buildWhatsAppInquiryLink(context, product);
    const compareAt =
      context.settings.showCompareAtPrice && firstVariant?.compareAtPrice
        ? formatMoneyForProject(firstVariant.compareAtPrice, context.project)
        : "";
    const description = context.settings.showDescription
      ? product.richDescription
        ? `<div class="solara-rich-text"${canvasEntityAttributes(canvas, "product-rich-description", "product", product.id, "richDescription")}>${sanitizeRichText(product.richDescription)}</div>`
        : `<div class="solara-rich-text"${canvasEntityAttributes(canvas, "product-description", "product", product.id, "description")}><p>${escapeHtml(product.description)}</p></div>`
      : "";

    return moduleRoot(
      "product-detail",
      context.section,
      safeHtml(`<div class="solara-product-detail" data-motion-zone="content" data-product data-product-id="${escapeAttribute(product.id)}" data-product-title="${escapeAttribute(product.title)}" data-default-variant="${escapeAttribute(firstVariant?.id ?? "")}">
        ${gallery}
        <div class="solara-product-info">
          <p class="solara-product-brand"${canvasEntityAttributes(canvas, "product-brand", "product", product.id, "brand")}>${escapeHtml(product.brand)}</p>
          <h1${canvasEntityAttributes(canvas, "product-title", "product", product.id, "title")}>${escapeHtml(product.title)}</h1>
          <p class="solara-detail-price" data-solara-product-price><span data-product-price${canvasEntityAttributes(canvas, "product-price", "product", product.id, "price")}>${escapeHtml(formatMoneyForProject(lowestPrice(product), context.project))}</span><del data-product-compare${compareAt ? "" : " hidden"}>${escapeHtml(compareAt)}</del></p>
          ${description}
          <form action="/carrito/" method="get" data-solara-add-form>
            <input type="hidden" name="product" value="${escapeAttribute(product.id)}">
            <label for="variant-${escapeAttribute(context.section.id)}"${monoVariant ? " hidden" : ""}>${escapeHtml(copy.product.variant)}</label>
            <select id="variant-${escapeAttribute(context.section.id)}" name="variant" data-variant-select required${monoVariant ? " hidden" : ""}>${variants}</select>
            <label for="quantity-${escapeAttribute(context.section.id)}">${escapeHtml(copy.product.quantity)}</label>
            <input id="quantity-${escapeAttribute(context.section.id)}" name="quantity" type="number" min="1" max="99" value="1" inputmode="numeric">
            <button type="submit" data-add-to-cart${canvasTextAttributes(canvas, "actionLabel", 100)}>${escapeHtml(context.settings.actionLabel)}</button>
            ${whatsappFallback ? `<noscript><style>[data-solara-add-form] .solara-add-fallback{display:inline-flex}[data-solara-add-form] [data-add-to-cart]{display:none}</style><a class="solara-add-fallback" href="${escapeAttribute(whatsappFallback)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.product.askWhatsApp)}</a></noscript>` : ""}
          </form>
          <p class="solara-delivery-note"${canvasTextAttributes(canvas, "deliveryNote", 240)}>${escapeHtml(context.settings.deliveryNote)}</p>
          <dl class="solara-product-specs">
            <div><dt>${escapeHtml(copy.product.sku)}</dt><dd data-product-sku>${escapeHtml(firstVariant?.sku ?? "")}</dd></div>
            <div><dt>${escapeHtml(copy.product.availability)}</dt><dd data-product-availability>${firstVariant?.available ? escapeHtml(copy.product.available) : escapeHtml(copy.product.outOfStock)}</dd></div>
          </dl>
          <div class="solara-product-policies">
            <details><summary>${escapeHtml(copy.product.shipping)}</summary><p>${escapeHtml(context.project.policies.shipping.details)}</p></details>
            <details><summary>${escapeHtml(copy.product.returns)}</summary><p>${escapeHtml(context.project.policies.returns.details)}</p></details>
          </div>
        </div>
      </div>`),
    );
  },
};

const imageTextSettings = z.object({
  title: z.string().default("Materiales que se sienten"),
  body: z.string().default("<p>Elegimos piezas útiles, honestas y duraderas.</p>"),
  imageId: z.string().default(""),
  imageSide: z.enum(["left", "right"]).default("left"),
  actionLabel: z.string().default(""),
  actionHref: z.string().default(""),
});

export const imageTextContent: ModuleDefinition<
  "image-text-content",
  z.infer<typeof imageTextSettings>
> = {
  manifest: {
    id: "image-text-content",
    name: "Contenido imagen y texto",
    description: "Bloque narrativo con texto enriquecido sanitizado.",
    version: 1,
    slots: ["content"],
    compatibleSettings: ["title", "body", "imageId", "imageSide", "actionLabel", "actionHref"],
  },
  settingsSchema: imageTextSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "body", type: "rich-text", label: "Contenido" },
    { key: "imageId", type: "asset", label: "Imagen" },
    {
      key: "imageSide",
      type: "select",
      label: "Posición de la imagen",
      options: [
        { value: "left", label: "Izquierda" },
        { value: "right", label: "Derecha" },
      ],
    },
    { key: "actionLabel", type: "text", label: "Texto de la acción" },
    { key: "actionHref", type: "url", label: "Destino de la acción" },
  ],
  motionZones: [
    ...revealZone,
    {
      id: "media",
      label: "Imagen",
      selector: '[data-motion-zone="media"]',
      allowedPresets: ["none", "fade", "scale", "parallax"] as const,
    },
  ],
  canvasBindings: [
    sectionTextBinding("title", "Título", "title", 180),
    sectionRichTextBinding("body", "Contenido", "body"),
    sectionImageBinding("imageId", "Imagen", "imageId"),
    sectionTextBinding("actionLabel", "Texto de la acción", "actionLabel", 100),
    sectionLinkBinding("actionHref", "Destino de la acción", "actionHref"),
  ],
  styleAsset: scopedAssetId("image-text-content"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const action =
      context.settings.actionLabel && context.settings.actionHref
        ? `<a class="solara-secondary-action" href="${escapeAttribute(safeUrl(context.settings.actionHref))}">${escapeHtml(context.settings.actionLabel)}</a>`
        : "";
    const imageId =
      context.settings.imageId ||
      context.project.seo.socialImageId ||
      context.project.collections.find((collection) => collection.status !== "hidden")?.imageId ||
      context.project.products.find((product) => product.status === "active")?.imageIds[0];
    const image = renderImage(context.project, imageId, {
      className: "solara-content-image",
      sizes: "(max-width: 767px) 92vw, 50vw",
      fallbackAlt: context.settings.title,
    });
    return moduleRoot(
      "image-text-content",
      context.section,
      safeHtml(`<div class="solara-image-text solara-image-text--${context.settings.imageSide}">
        <figure data-motion-zone="media">${instrumentImage(image, canvas, "imageId")}</figure>
        <div data-motion-zone="content">
          <h2${canvasTextAttributes(canvas, "title", 180)}>${escapeHtml(context.settings.title)}</h2>
          <div class="solara-rich-text"${canvasTextAttributes(canvas, "body", 4000)}>${sanitizeRichText(context.settings.body)}</div>
          ${action.replace("<a ", `<a ${canvasTextAttributes(canvas, "actionLabel", 100).trim()} `)}
        </div>
      </div>`),
    );
  },
};

const trustSettings = z.object({
  title: z.string().default("Comprar con claridad"),
  deliveryTitle: z.string().default("Entrega coordinada"),
  returnsTitle: z.string().default("Cambios simples"),
  contactTitle: z.string().default("Atención directa"),
});

export const trustStrip: ModuleDefinition<"trust-strip", z.infer<typeof trustSettings>> = {
  manifest: {
    id: "trust-strip",
    name: "Beneficios y confianza",
    description: "Información operativa de entrega, cambios y contacto.",
    version: 1,
    slots: ["trust"],
    compatibleSettings: ["title", "deliveryTitle", "returnsTitle", "contactTitle"],
  },
  settingsSchema: trustSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "deliveryTitle", type: "text", label: "Título de entrega" },
    { key: "returnsTitle", type: "text", label: "Título de cambios" },
    { key: "contactTitle", type: "text", label: "Título de contacto" },
  ],
  motionZones: staggerZone,
  canvasBindings: [
    sectionTextBinding("title", "Título", "title", 140),
    sectionTextBinding("deliveryTitle", "Título de entrega", "deliveryTitle", 120),
    sectionTextBinding("returnsTitle", "Título de cambios", "returnsTitle", 120),
    sectionTextBinding("contactTitle", "Título de contacto", "contactTitle", 120),
  ],
  styleAsset: scopedAssetId("trust-strip"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const contactDetails = [context.project.identity.email, context.project.identity.phone]
      .filter(Boolean)
      .join(" · ");
    const benefits = [
      {
        bindingId: "deliveryTitle",
        title: context.settings.deliveryTitle,
        body: context.project.policies.shipping.summary,
      },
      {
        bindingId: "returnsTitle",
        title: context.settings.returnsTitle,
        body: context.project.policies.returns.summary,
      },
      {
        bindingId: "contactTitle",
        title: context.settings.contactTitle,
        body: contactDetails,
      },
    ].filter((benefit) => benefit.title.trim() && benefit.body.trim());
    if (benefits.length === 0) {
      return moduleRoot("trust-strip", context.section, safeHtml(""));
    }
    const benefitMarkup = benefits
      .map(
        (benefit) =>
          `<article><h3${canvasTextAttributes(canvas, benefit.bindingId, 120)}>${escapeHtml(benefit.title)}</h3><p>${escapeHtml(benefit.body)}</p></article>`,
      )
      .join("");
    return moduleRoot(
      "trust-strip",
      context.section,
      safeHtml(`<div class="solara-trust">
        <h2${canvasTextAttributes(canvas, "title", 140)}>${escapeHtml(context.settings.title)}</h2>
        <div class="solara-trust-grid" data-motion-zone="items">
          ${benefitMarkup}
        </div>
      </div>`),
      { ariaLabel: "Beneficios y confianza" },
    );
  },
};

const cartSettings = z.object({
  title: z.string().default("Tu carrito"),
  emptyText: z.string().default("Todavía no agregaste productos."),
  checkoutLabel: z.string().default("Continuar por WhatsApp"),
});

export const cartDrawer: ModuleDefinition<"cart-drawer", z.infer<typeof cartSettings>> = {
  manifest: {
    id: "cart-drawer",
    name: "Carrito lateral",
    description: "Shell accesible para carrito y checkout por WhatsApp.",
    version: 1,
    slots: ["cart"],
    compatibleSettings: ["title", "emptyText", "checkoutLabel"],
  },
  settingsSchema: cartSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "emptyText", type: "text", label: "Mensaje de carrito vacío" },
    { key: "checkoutLabel", type: "text", label: "Texto de checkout" },
  ],
  motionZones: revealZone,
  canvasBindings: [
    sectionTextBinding("title", "Título", "title", 140),
    sectionTextBinding("emptyText", "Mensaje de carrito vacío", "emptyText", 240),
    sectionTextBinding("checkoutLabel", "Texto de checkout", "checkoutLabel", 120),
  ],
  clientAsset: "storefront-cart" as AssetId,
  styleAsset: scopedAssetId("cart-drawer"),
  render(context) {
    const copy = context.project.publicCopy;
    const canvas = legacyCanvasContext(context);
    return moduleRoot(
      "cart-drawer",
      context.section,
      safeHtml(`<div class="solara-cart-backdrop" data-solara-cart-close data-close-cart hidden></div>
        <aside id="solara-cart" class="solara-cart-drawer" data-cart-drawer aria-label="${escapeAttribute(context.settings.title)}" aria-hidden="true" inert tabindex="-1">
          <header><h2${canvasTextAttributes(canvas, "title", 140)}>${escapeHtml(context.settings.title)}</h2><button type="button" data-solara-cart-close data-close-cart aria-label="${escapeAttribute(copy.cart.close)}">${escapeHtml(copy.navigation.close)}</button></header>
          <div data-solara-cart-items data-cart-lines><p class="solara-empty-state"${canvasTextAttributes(canvas, "emptyText", 240)}>${escapeHtml(context.settings.emptyText)}</p></div>
          <div class="solara-cart-total"><span>${escapeHtml(copy.cart.estimatedTotal)}</span><strong data-solara-cart-total data-cart-total>${escapeHtml(formatMoneyForProject(0, context.project))}</strong></div>
          <form data-solara-checkout data-checkout-form>
            <label for="solara-drawer-customer-name">${escapeHtml(copy.cart.name)}</label>
            <input id="solara-drawer-customer-name" name="name" autocomplete="name" required>
            <label for="solara-drawer-customer-phone">${escapeHtml(copy.cart.phone)}</label>
            <input id="solara-drawer-customer-phone" name="phone" autocomplete="tel" inputmode="tel" pattern="[\\d\\+\\(\\)\\- ]{8,}" title="${escapeHtml(copy.cart.phoneInvalid)}" required>
            <label for="solara-drawer-customer-address">${escapeHtml(copy.cart.address)}</label>
            <textarea id="solara-drawer-customer-address" name="address" autocomplete="street-address" required></textarea>
            <label for="solara-drawer-customer-locality">${escapeHtml(copy.cart.locality)}</label>
            <input id="solara-drawer-customer-locality" name="locality" autocomplete="address-level2" required>
            <label for="solara-drawer-customer-postal-code">${escapeHtml(copy.cart.postalCode)}</label>
            <input id="solara-drawer-customer-postal-code" name="postalCode" autocomplete="postal-code" required>
            <label for="solara-drawer-customer-notes">${escapeHtml(copy.cart.notes)}</label>
            <textarea id="solara-drawer-customer-notes" name="notes"></textarea>
            <button type="submit"${canvasTextAttributes(canvas, "checkoutLabel", 120)}>${escapeHtml(context.settings.checkoutLabel)}</button>
            <p data-order-verification-warning role="note">${escapeHtml(copy.checkout.verificationWarning)}</p>
            <pre data-order-preview aria-live="polite"></pre>
          </form>
        </aside>`),
    );
  },
};

const footerSettings = z.object({
  note: z.string().default(""),
  showPolicies: z.boolean().default(true),
});

export const editorialFooter: ModuleDefinition<
  "editorial-footer",
  z.infer<typeof footerSettings>
> = {
  manifest: {
    id: "editorial-footer",
    name: "Footer editorial",
    description: "Cierre de marca, contacto y políticas comerciales.",
    version: 1,
    slots: ["footer"],
    compatibleSettings: ["note", "showPolicies"],
  },
  settingsSchema: footerSettings,
  settingsFields: [
    { key: "note", type: "text", label: "Nota" },
    { key: "showPolicies", type: "boolean", label: "Mostrar políticas" },
  ],
  motionZones: revealZone,
  canvasBindings: [
    sectionTextBinding("note", "Nota", "note", 240),
    {
      id: "identity-brand",
      label: "Nombre de marca",
      kind: "text",
      source: { kind: "identity", field: "brandName" },
      capabilities: ["edit-text"],
      maxLength: 120,
    },
    {
      id: "identity-logo",
      label: "Logo de la marca",
      kind: "image",
      source: { kind: "identity", field: "logoAssetId" },
      capabilities: ["edit-image"],
    },
    {
      id: "showPolicies",
      label: "Mostrar políticas",
      kind: "boolean",
      source: { kind: "section-setting", fieldKey: "showPolicies" },
      capabilities: ["toggle-boolean"],
    },
  ],
  styleAsset: scopedAssetId("editorial-footer"),
  render(context) {
    const canvas = legacyCanvasContext(context);
    const copy = context.project.publicCopy;
    const isV2 = context.project.commerceTemplates.designFamily === "catalog-modern-v2";
    const policies = context.settings.showPolicies
      ? isV2
        ? `<nav aria-label="${escapeAttribute(copy.footer.policies)}"><a href="/privacidad/">${escapeHtml(copy.footer.privacy)}</a><a href="/terminos/">${escapeHtml(copy.footer.terms)}</a></nav>`
        : `<nav aria-label="${escapeAttribute(copy.footer.policies)}"><a href="/envios/">${escapeHtml(copy.footer.shipping)}</a><a href="/devoluciones/">${escapeHtml(copy.footer.returns)}</a><a href="/privacidad/">${escapeHtml(copy.footer.privacy)}</a><a href="/terminos/">${escapeHtml(copy.footer.terms)}</a></nav>`
      : "";
    const note = context.settings.note || context.project.identity.description;
    const email = context.project.identity.email
      ? `<a href="mailto:${escapeAttribute(context.project.identity.email)}">${escapeHtml(context.project.identity.email)}</a>`
      : "";
    const phone = context.project.identity.phone
      ? `<a href="tel:${escapeAttribute(context.project.identity.phone)}">${escapeHtml(context.project.identity.phone)}</a>`
      : "";
    const address = context.project.identity.address
      ? `<span>${escapeHtml(context.project.identity.address)}</span>`
      : "";
    return moduleRoot(
      "editorial-footer",
      context.section,
      safeHtml(`<div class="solara-footer" data-motion-zone="content">
        <div><a class="solara-brand" href="/">${renderBrand(context.project, canvas)}</a><p${canvasTextAttributes(canvas, "note", 240)}>${escapeHtml(note)}</p></div>
        ${policies}
        <address>${email}${phone}${address}</address>
         <small>© ${new Date(context.project.updatedAt).getUTCFullYear()} ${escapeHtml(context.project.identity.brandName)} · ${escapeHtml(copy.footer.copyright)}</small>
      </div>`),
      { tag: "footer" },
    );
  },
};

export const officialModules = [
  announcementBar,
  editorialHeader,
  heroMedia,
  splitHero,
  editorialHero,
  collectionGrid,
  editorialProductGrid,
  compactProductGrid,
  productDetail,
  imageTextContent,
  trustStrip,
  cartDrawer,
  editorialFooter,
] as const;
