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
  type CategoryId,
  getCategoryBreadcrumb,
  getCategoryProductIds,
  type Product,
  type ProductReview,
  personalizeWhatsAppGreeting,
  productVideos,
  type StoreProjectV1,
} from "@solara/project-schema";
import { z } from "zod";
import { lowestPrice, renderBrand, scopedAssetId } from "./helpers";

const modernRevealZone = [
  {
    id: "content",
    label: "Contenido",
    selector: '[data-motion-zone="content"]',
    allowedPresets: ["none", "fade", "fade-up", "slide", "scale"] as const,
  },
] as const;

const modernItemsZone = [
  {
    id: "items",
    label: "Elementos",
    selector: '[data-motion-zone="items"]',
    allowedPresets: ["none", "fade", "fade-up", "stagger"] as const,
  },
] as const;

const modernManifest = <Id extends string>(input: {
  id: Id;
  name: string;
  description: string;
  slots: readonly (
    | "announcement"
    | "header"
    | "hero"
    | "catalog"
    | "product"
    | "content"
    | "trust"
    | "cart"
    | "footer"
  )[];
  compatibleSettings: readonly string[];
}) => ({
  ...input,
  version: 1 as const,
  family: "catalog-modern-v1" as const,
  availability: "default" as const,
});

function canvasContext(
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

function formatPublicWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("54")) {
    return `+54 ${digits.slice(2, 5)} ${digits.slice(5, 8)}-${digits.slice(8)}`;
  }
  return phone;
}

function textBinding(
  id: string,
  label: string,
  fieldKey: string,
  maxLength?: number,
): CanvasBinding {
  return {
    id,
    label,
    kind: "text",
    source: { kind: "section-setting", fieldKey },
    capabilities: ["edit-text"],
    ...(maxLength === undefined ? {} : { maxLength }),
  };
}

const announcementSettings = z.object({
  text: z.string().default("Envíos a todo el país"),
  linkLabel: z.string().default(""),
  linkHref: z.string().default(""),
});

export const catalogAnnouncement: ModuleDefinition<
  "catalog-announcement",
  z.infer<typeof announcementSettings>
> = {
  manifest: modernManifest({
    id: "catalog-announcement",
    name: "Barra informativa moderna",
    description: "Mensaje breve de la tienda con enlace opcional.",
    slots: ["announcement"],
    compatibleSettings: ["text", "linkLabel", "linkHref"],
  }),
  settingsSchema: announcementSettings,
  settingsFields: [
    { key: "text", type: "text", label: "Mensaje" },
    { key: "linkLabel", type: "text", label: "Texto del enlace" },
    { key: "linkHref", type: "url", label: "Destino del enlace" },
  ],
  motionZones: modernRevealZone,
  canvasBindings: [
    textBinding("text", "Mensaje", "text", 180),
    textBinding("linkLabel", "Texto del enlace", "linkLabel", 100),
    {
      id: "linkHref",
      label: "Destino del enlace",
      kind: "link",
      source: { kind: "section-setting", fieldKey: "linkHref" },
      capabilities: ["edit-link"],
    },
  ],
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const isV2 = context.project.commerceTemplates.designFamily === "catalog-modern-v2";
    const normalizeV2Href = (href: string): string => {
      if (!isV2) return href;
      if (/^\/(contacto|nosotros|compra|envios|devoluciones)\/?$/i.test(href)) {
        return "#contact-form";
      }
      return href;
    };
    const link =
      context.settings.linkLabel && context.settings.linkHref
        ? `<a href="${escapeAttribute(safeUrl(normalizeV2Href(context.settings.linkHref)))}"${canvasTextAttributes(canvasContext(context), "linkLabel", 100)}>${escapeHtml(context.settings.linkLabel)}</a>`
        : "";
    return moduleRoot(
      "catalog-announcement",
      context.section,
      safeHtml(
        `<div class="catalog-announcement-inner" data-motion-zone="content"><span${canvasTextAttributes(canvasContext(context), "text", 180)}>${escapeHtml(context.settings.text)}</span>${link}<button type="button" data-catalog-announcement-close aria-label="${escapeAttribute(`${copy.navigation.close} anuncio`)}">×</button></div>`,
      ),
      { tag: "section", ariaLabel: copy.accessibility.announcements },
    );
  },
};

const headerSettings = z.object({
  cartLabel: z.string().default("Carrito"),
  searchLabel: z.string().default("Buscar productos"),
  showDivider: z.boolean().default(true),
});

export const catalogHeader: ModuleDefinition<"catalog-header", z.infer<typeof headerSettings>> = {
  manifest: modernManifest({
    id: "catalog-header",
    name: "Navbar de catálogo",
    description: "Header compacto con menú de dos niveles, búsqueda y carrito.",
    slots: ["header"],
    compatibleSettings: ["cartLabel", "searchLabel", "showDivider"],
  }),
  settingsSchema: headerSettings,
  settingsFields: [
    { key: "cartLabel", type: "text", label: "Texto del carrito" },
    { key: "searchLabel", type: "text", label: "Texto de búsqueda" },
    { key: "showDivider", type: "boolean", label: "Mostrar divisor inferior" },
  ],
  motionZones: modernRevealZone,
  canvasBindings: [
    textBinding("cartLabel", "Texto del carrito", "cartLabel", 80),
    textBinding("searchLabel", "Texto de búsqueda", "searchLabel", 80),
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
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const navigation = context.project.navigation;
    const isV2 = context.project.commerceTemplates.designFamily === "catalog-modern-v2";
    const automaticItems = context.project.categories
      .filter((category) => !category.parentId && category.status !== "hidden")
      .map((category) => ({
        id: `automatic-nav-${category.id}`,
        label: category.title,
        href: `/categorias/${category.slug}/`,
        children: context.project.categories
          .filter((child) => child.parentId === category.id && child.status !== "hidden")
          .map((child) => ({
            id: `automatic-nav-${child.id}`,
            label: child.title,
            href: `/categorias/${child.slug}/`,
          })),
      }));
    // Los ítems editados en el Resumen tienen prioridad sobre la navegación
    // derivada de categorías aunque el modo sea "automatic"; con items vacíos
    // se conserva el comportamiento previo (categorías en automatic).
    const configuredNavigationItems =
      navigation.mode === "automatic" && navigation.items.length === 0
        ? automaticItems
        : navigation.items;
    const normalizeV2NavigationHref = (href: string | undefined): string | undefined => {
      if (!isV2) return href;
      if (/^\/contacto\/?$/i.test(href ?? "")) return "/#contact-form";
      if (/^\/nosotros\/?$/i.test(href ?? "")) return undefined;
      if (/^\/compra\/?$/i.test(href ?? "")) return "/#contact-form";
      if (/^\/(envios|devoluciones)\/?$/i.test(href ?? "")) return undefined;
      return href;
    };
    const navigationItems = configuredNavigationItems.flatMap((item) => {
      const href = normalizeV2NavigationHref(item.href);
      if ((isV2 && !href) || !isPublicNavigationHref(context.project, href)) return [];
      const children = item.children
        ?.map((child) => ({ ...child, href: normalizeV2NavigationHref(child.href) }))
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
    const current = (types: string[]) =>
      types.includes(context.pageType ?? "") ? ' aria-current="page"' : "";
    const configuredCatalogLabel = navigation.catalogLabel.trim();
    // "Tienda" was the previous default; keep it readable while preserving other custom labels.
    const catalogLabel =
      configuredCatalogLabel && configuredCatalogLabel.toLowerCase() !== "tienda"
        ? configuredCatalogLabel
        : copy.navigation.catalog;
    const icon = (name: "home" | "categories" | "contact" | "about"): string => {
      const paths = {
        home: '<path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"></path>',
        categories:
          '<path d="m4 7 8-4 8 4-8 4z"></path><path d="m4 12 8 4 8-4"></path><path d="m4 17 8 4 8-4"></path>',
        contact:
          '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path>',
        about:
          '<circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 19a5.5 5.5 0 0 1 11 0"></path><path d="M13 18a4.5 4.5 0 0 1 8.5 1"></path>',
      } as const;
      return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
    };
    const chevron =
      '<span class="catalog-nav-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"></path></svg></span>';
    const forwardChevron =
      '<span class="catalog-nav-chevron catalog-nav-chevron--forward" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m9 6 6 6-6 6"></path></svg></span>';
    const desktopMenuItems = navigationItems
      .map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const children = hasChildren
          ? `<ul class="catalog-mega-group__children" aria-label="${escapeAttribute(copy.export.categoryChildren.replace("{category}", item.label))}">${item.children
              ?.map(
                (child) =>
                  `<li><a href="${escapeAttribute(safeUrl(child.href ?? "#"))}">${escapeHtml(child.label)}</a></li>`,
              )
              .join("")}</ul>`
          : "";
        return `<li class="catalog-mega-group${hasChildren ? " catalog-mega-group--has-children" : ""}"><a class="catalog-mega-group__link" href="${escapeAttribute(safeUrl(item.href ?? "#"))}"><span>${escapeHtml(item.label)}</span></a>${children}</li>`;
      })
      .join("");
    const searchEnabled = navigation.showSearch && context.project.commerceTemplates.search.enabled;
    const desktopMenu = navigationItems.length
      ? `<div id="catalog-category-menu" class="catalog-mega-menu" role="group" aria-label="${escapeAttribute(catalogLabel)}"><ul class="catalog-mega-menu__groups">${desktopMenuItems}</ul>${searchEnabled ? `<a class="catalog-mega-menu__all" href="/buscar/">${escapeHtml(copy.navigation.viewAll)} <span aria-hidden="true">→</span></a>` : ""}</div>`
      : "";
    const catalog = navigationItems.length
      ? `<details class="catalog-nav-menu"><summary class="catalog-nav-trigger" aria-controls="catalog-category-menu" aria-haspopup="true" aria-expanded="false"${current(["category", "collection"])}>${escapeHtml(catalogLabel)}${chevron}</summary>${desktopMenu}</details>`
      : searchEnabled
        ? `<a class="catalog-nav-empty" href="/buscar/"${current(["category", "collection"])}>${escapeHtml(catalogLabel)}</a>`
        : "";
    const mobileCategoryItems = navigationItems
      .map((item, index) => {
        const children = item.children ?? [];
        if (children.length === 0) {
          return `<a class="catalog-mobile-category-link" href="${escapeAttribute(safeUrl(item.href ?? "#"))}"><span class="catalog-mobile-nav-icon" aria-hidden="true">${icon("categories")}</span><span>${escapeHtml(item.label)}</span>${forwardChevron}</a>`;
        }
        const panelId = `catalog-mobile-category-${index}-panel`;
        return `<details class="catalog-mobile-category"><summary aria-controls="${panelId}" aria-expanded="false"><span class="catalog-mobile-nav-icon" aria-hidden="true">${icon("categories")}</span><span>${escapeHtml(item.label)}</span>${chevron}</summary><ul id="${panelId}" class="catalog-mobile-category__children"><li><a class="catalog-mobile-category__parent" href="${escapeAttribute(safeUrl(item.href ?? "#"))}">${escapeHtml(copy.export.exploreCategory.replace("{category}", item.label))}</a></li>${children
          .map(
            (child) =>
              `<li><a href="${escapeAttribute(safeUrl(child.href ?? "#"))}">${escapeHtml(child.label)}</a></li>`,
          )
          .join("")}</ul></details>`;
      })
      .join("");
    const mobileCategories = navigationItems.length
      ? `<details class="catalog-mobile-categories"><summary aria-controls="catalog-mobile-categories-panel" aria-expanded="false"${current(["category", "collection"])}><span class="catalog-mobile-nav-icon" aria-hidden="true">${icon("categories")}</span><span>${escapeHtml(catalogLabel)}</span>${chevron}</summary><div id="catalog-mobile-categories-panel" class="catalog-mobile-categories__panel">${mobileCategoryItems}</div></details>`
      : searchEnabled
        ? `<a class="catalog-mobile-nav-link" href="/buscar/"><span class="catalog-mobile-nav-icon" aria-hidden="true">${icon("categories")}</span><span>${escapeHtml(catalogLabel)}</span>${forwardChevron}</a>`
        : "";
    const nav = `${navigation.showHome ? `<a href="/"${current(["home"])}>${escapeHtml(copy.navigation.home)}</a>` : ""}${catalog}`;
    const mobileNav = `${navigation.showHome ? `<a class="catalog-mobile-nav-link" href="/"${current(["home"])}><span class="catalog-mobile-nav-icon" aria-hidden="true">${icon("home")}</span><span>${escapeHtml(copy.navigation.home)}</span>${forwardChevron}</a>` : ""}${mobileCategories}`;
    const search = searchEnabled
      ? `<button class="catalog-search-link" type="button" data-catalog-search-open aria-controls="catalog-search-dialog" aria-expanded="false" aria-label="${escapeAttribute(context.settings.searchLabel || copy.navigation.search)}"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><span${canvasTextAttributes(canvasContext(context), "searchLabel", 80)}>${escapeHtml(context.settings.searchLabel || copy.navigation.search)}</span></button><noscript><a class="catalog-search-noscript" href="/buscar/">${escapeHtml(context.settings.searchLabel || copy.navigation.search)}</a></noscript>`
      : "";
    const cart =
      navigation.showCart &&
      context.project.siteShell.cart &&
      (context.project.commerceTemplates.cart.enabled ||
        context.project.commerceTemplates.checkout.enabled)
        ? `<button class="catalog-cart-link" type="button" data-solara-cart-open data-open-cart data-cart-label="${escapeAttribute(context.settings.cartLabel || copy.navigation.cart)}" aria-controls="solara-cart" aria-expanded="false"><span${canvasTextAttributes(canvasContext(context), "cartLabel", 80)}>${escapeHtml(context.settings.cartLabel || copy.navigation.cart)}</span> <strong data-solara-cart-count data-cart-count aria-live="polite">0</strong></button>`
        : "";
    return moduleRoot(
      "catalog-header",
      context.section,
      safeHtml(`<div class="catalog-header-inner${context.settings.showDivider === false ? " catalog-header-inner--no-divider" : ""}" data-motion-zone="content">
        <button class="catalog-mobile-menu-button" type="button" data-catalog-menu-open aria-controls="catalog-mobile-menu" aria-expanded="false"><span class="sr-only">${escapeHtml(copy.navigation.openMenu)}</span><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"></path></svg></button>
        <a class="catalog-brand" href="/" aria-label="${escapeAttribute(`${copy.navigation.home} de ${context.project.identity.brandName}`)}">${renderBrand(context.project, canvasContext(context))}</a>
        <nav class="catalog-desktop-nav" aria-label="${escapeAttribute(copy.accessibility.mainNavigation)}">${nav}</nav>
        <div class="catalog-header-actions">${search}${cart}</div>
        <noscript><style>[data-solara-store].catalog-modern .catalog-search-link{display:none}[data-solara-store].catalog-modern .catalog-search-noscript{display:inline-flex;align-items:center;min-height:44px;padding:.55rem 1rem;border:1px solid var(--catalog-border);border-radius:0;background:var(--catalog-surface);color:var(--catalog-muted);text-decoration:none;font-size:.82rem}@media (max-width:767px){[data-solara-store].catalog-modern .catalog-mobile-menu[hidden]{display:grid}[data-solara-store].catalog-modern .catalog-mobile-menu[hidden] .catalog-mobile-menu__backdrop{display:none}[data-solara-store].catalog-modern .catalog-mobile-menu[hidden] .catalog-mobile-menu__panel{transform:none}}@media print{[data-solara-store].catalog-modern .catalog-mobile-menu{display:none!important}}</style></noscript>
        <div id="catalog-mobile-menu" class="catalog-mobile-menu" data-catalog-menu data-state="closed" hidden role="dialog" aria-modal="true" aria-hidden="true" aria-label="${escapeAttribute(copy.accessibility.mobileNavigation)}">
          <div class="catalog-mobile-menu__backdrop" data-catalog-menu-backdrop data-catalog-menu-dismiss aria-hidden="true"></div>
          <div class="catalog-mobile-menu__panel">
            <div class="catalog-mobile-menu__header"><a class="catalog-mobile-brand" href="/" aria-label="${escapeAttribute(`${copy.navigation.home} de ${context.project.identity.brandName}`)}">${renderBrand(context.project, canvasContext(context))}</a><button type="button" class="catalog-mobile-menu__close" data-catalog-menu-close aria-label="${escapeAttribute(copy.navigation.closeMenu)}"><span class="sr-only">${escapeHtml(copy.navigation.closeMenu)}</span><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="m6 6 12 12M18 6 6 18"></path></svg></button></div>
            ${searchEnabled ? `<form class="catalog-mobile-search" action="/buscar/" method="get" role="search"><label class="sr-only" for="catalog-mobile-search-input">${escapeHtml(copy.navigation.search)}</label><div class="catalog-mobile-search__field"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 12 6"></path></svg><input id="catalog-mobile-search-input" name="q" type="search" placeholder="${escapeAttribute(copy.search.placeholder)}" autocomplete="off"><button type="submit" aria-label="${escapeAttribute(copy.search.submit)}"><span aria-hidden="true">→</span></button></div></form>` : ""}
            <nav aria-label="${escapeAttribute(copy.accessibility.mobileNavigation)}">${mobileNav}</nav>
          </div>
        </div>
        ${
          searchEnabled
            ? `<dialog id="catalog-search-dialog" class="catalog-search-dialog" data-catalog-search-dialog aria-labelledby="catalog-search-title">
          <form class="catalog-search-dialog-form" action="/buscar/" method="get" role="search">
            <div class="catalog-search-dialog-heading"><div><p class="catalog-eyebrow">${escapeHtml(catalogLabel)}</p><h2 id="catalog-search-title">${escapeHtml(copy.search.title)}</h2></div><button type="button" data-catalog-search-close aria-label="${escapeAttribute(copy.search.close)}">${escapeHtml(copy.navigation.close)}</button></div>
          <label for="catalog-search-input">${escapeHtml(copy.search.queryLabel)}</label>
            <div class="catalog-search-dialog-controls"><input id="catalog-search-input" name="q" type="search" autocomplete="off" enterkeyhint="search"><button class="catalog-primary-action" type="submit">${escapeHtml(copy.search.submit)}</button></div>
          </form>
        </dialog>`
            : ""
        }
      </div>`),
      { tag: "header" },
    );
  },
};

const heroSlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().default(""),
  actionLabel: z.string().default("Ver colección"),
  actionHref: z.string().default("/"),
  imageId: z.string().default(""),
});

const catalogHeroBenefitSchema = z.object({
  id: z.string().min(1),
  icon: z.string().default("truck"),
  title: z.string().min(1),
  text: z.string().default(""),
});

const heroSettings = z.object({
  mode: z.enum(["image", "carousel", "video"]).default("image"),
  eyebrow: z.string().default("Nueva temporada"),
  title: z.string().default("Vestite con lo que te representa."),
  body: z.string().default("Prendas elegidas para acompañarte todos los días."),
  actionLabel: z.string().default("Explorar cat\u00e1logo"),
  actionHref: z.string().default("/buscar/"),
  secondaryActionLabel: z.string().default("Explorar tienda"),
  secondaryActionHref: z.string().default("/categorias/remeras/"),
  posterAssetId: z.string().default(""),
  videoAssetId: z.string().default(""),
  backgroundImageId: z.string().default(""),
  backgroundDarkness: z.number().int().min(0).max(90).default(60),
  benefitIconRadius: z.number().int().min(0).max(18).default(8),
  slides: z.array(heroSlideSchema).default([]),
  autoplay: z.boolean().default(false),
  intervalMs: z.number().int().min(3000).max(15000).default(6000),
  showCatalogStats: z.boolean().default(true),
  benefits: z
    .array(catalogHeroBenefitSchema)
    .max(3)
    .default([
      {
        id: "hero-benefit-envios",
        icon: "truck",
        title: "Envíos a todo el país",
        text: "Coordinamos la entrega por WhatsApp",
      },
      {
        id: "hero-benefit-pedido",
        icon: "chat",
        title: "Pedido directo",
        text: "Comprá conversando con la marca",
      },
      {
        id: "hero-benefit-compra",
        icon: "shield",
        title: "Compra cuidada",
        text: "Confirmamos todo antes de enviar",
      },
    ]),
});

export const catalogHeroBenefitIcons: Record<string, string> = {
  truck:
    '<path d="M2 6.5h10.5V15H2z"></path><path d="M12.5 9.5H17l3.5 3.5v2h-8"></path><circle cx="6.5" cy="15.5" r="1.7"></circle><circle cx="16.5" cy="15.5" r="1.7"></circle>',
  chat: '<path d="M4 5h16v11H9.5L4 19.5z"></path>',
  shield: '<path d="M12 3l7 2.5v5.5c0 4.2-2.9 7.2-7 8.5-4.1-1.3-7-4.3-7-8.5V5.5z"></path>',
  tag: '<path d="M3 11.5V4h7.5L20 13.5 13.5 20z"></path><circle cx="7.8" cy="7.8" r="1.1"></circle>',
  gift: '<path d="M3.5 8.5h17v4h-17z"></path><path d="M5 12.5v7.5h14v-7.5"></path><path d="M12 8.5v11.5"></path><path d="M12 8.5C12 8.5 11 4.5 8.6 4.5S5.8 7 8.2 8.3z"></path><path d="M12 8.5c0-4 .9-4 2.6-4s2.9 2.5 1.2 3.8z"></path>',
  clock: '<circle cx="12" cy="12" r="8.2"></circle><path d="M12 7.2V12l3.4 2"></path>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="1.5"></rect><path d="M2.5 9.5h19"></path>',
  check: '<path d="m4.5 12.5 5 5 10-11"></path>',
};

/** Divide sólo los saltos que el editor dejó explícitos; el navegador resuelve
 * el wrapping responsive dentro del ancho disponible del hero. */
function heroTitleLines(title: string): string[] {
  const lines = title
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  return lines.length > 0 ? lines : [""];
}

export interface CatalogModernEditorialHeroOptions {
  moduleId: string;
  rootClassName: string;
  innerClassName: string;
  eyebrow: string;
  title: string;
  body: string;
  imageAssetId: string;
  imageClassName?: string;
  backgroundImageId?: string;
  backgroundDarkness?: number;
  benefits?: ReadonlyArray<{ icon: string; title: string; text: string }>;
  actions: SafeHtml | string;
  trailing?: SafeHtml | string;
  canvasBindingIds?: readonly string[];
}

export function renderCatalogModernEditorialHero(
  context: Pick<RenderContext<unknown>, "project" | "section" | "canvas">,
  options: CatalogModernEditorialHeroOptions,
): SafeHtml {
  const copy = context.project.publicCopy;
  const editorContext = canvasContext(context);
  const hasCanvasBinding = (bindingId: string): boolean =>
    options.canvasBindingIds?.includes(bindingId) === true;
  const image = renderImage(context.project, options.imageAssetId, {
    className: ["catalog-hero-image", options.imageClassName].filter(Boolean).join(" "),
    loading: "eager",
    fetchPriority: "high",
    sizes: "(max-width: 767px) 100vw, 45vw",
    responsiveMode: "cover",
    fallbackAlt: options.title,
  });
  const imageMarkup = hasCanvasBinding("imageAssetId")
    ? image.replace(
        "<img",
        `<img${hasCanvasBinding("asset-alt") ? canvasEntityAttributes(editorContext, "asset-alt", "asset", options.imageAssetId, "alt") : ""}`,
      )
    : image;
  const mediaBinding = hasCanvasBinding("imageAssetId")
    ? canvasImageAttributes(editorContext, "imageAssetId")
    : "";
  const backgroundImageId = options.backgroundImageId ?? options.imageAssetId;
  const background = renderImage(context.project, backgroundImageId, {
    className: "catalog-hero-background-image",
    loading: "lazy",
    sizes: "100vw",
    fallbackAlt: `${options.title} — fondo editorial`,
  });
  const backgroundWrap = `<div class="catalog-hero-background" data-hero-background aria-hidden="true" style="--catalog-hero-bg-dark:${Math.min(Math.max(options.backgroundDarkness ?? 60, 0), 90) / 100}">${background}</div>`;
  const benefits = options.benefits ?? [];
  const benefitsCopy = renderHeroBenefits(
    benefits,
    "catalog-hero-benefits--copy",
    copy.hero.benefits,
  );
  const benefitsBand = renderHeroBenefits(
    benefits,
    "catalog-hero-benefits--band",
    copy.hero.benefits,
  );
  const titleLines = heroTitleLines(options.title)
    .map(
      (line) =>
        `<span class="catalog-hero-line" data-hero-line><span class="catalog-hero-line-inner" data-hero-line-inner>${escapeHtml(line)}</span></span>`,
    )
    .join(" ");
  const rootClassName = [
    "catalog-hero-page",
    "catalog-hero-editorial",
    "catalog-hero-editorial--has-background",
    options.rootClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const innerClassName = ["catalog-hero-inner", options.innerClassName].filter(Boolean).join(" ");
  const mediaClassName = ["catalog-hero-media", `${options.innerClassName}-media`]
    .filter(Boolean)
    .join(" ");
  return moduleRoot(
    options.moduleId,
    context.section,
    safeHtml(
      `<div class="${escapeAttribute(innerClassName)}" data-motion-zone="content">${backgroundWrap}<div class="catalog-hero-copy"><div class="catalog-hero-reveal catalog-hero-reveal--eyebrow"><p class="catalog-eyebrow"${hasCanvasBinding("eyebrow") ? canvasTextAttributes(editorContext, "eyebrow", 100) : ""}>${escapeHtml(options.eyebrow)}</p></div><h1 class="catalog-hero-title" data-hero-title${hasCanvasBinding("title") ? canvasTextAttributes(editorContext, "title", 180) : ""}>${titleLines}</h1><div class="catalog-hero-rule" data-hero-rule aria-hidden="true"></div><div class="catalog-hero-reveal catalog-hero-reveal--body"><p class="catalog-hero-body"${hasCanvasBinding("body") ? canvasTextAttributes(editorContext, "body", 300) : ""}>${escapeHtml(options.body)}</p></div><div class="catalog-hero-reveal catalog-hero-reveal--actions"><div class="catalog-hero-actions">${options.actions}</div></div>${benefitsCopy}</div><figure class="${escapeAttribute(mediaClassName)}" data-motion-zone="media" data-hero-media${mediaBinding}>${imageMarkup}</figure></div>${benefitsBand}${options.trailing ?? ""}`,
    ),
    { className: rootClassName },
  );
}

function renderHeroBenefits(
  benefits: ReadonlyArray<{ icon: string; title: string; text: string }>,
  extraClass = "",
  ariaLabel = "Beneficios",
  editorContext?: CanvasEditorContext,
  inlineStyle?: string,
): string {
  if (benefits.length === 0) return "";
  const styleAttribute = inlineStyle ? ` style="${escapeAttribute(inlineStyle)}"` : "";
  return `<ul class="catalog-hero-benefits ${extraClass}" data-hero-benefits aria-label="${escapeAttribute(ariaLabel)}"${styleAttribute}>${benefits
    .map((benefit) => {
      const icon = catalogHeroBenefitIcons[benefit.icon] ?? catalogHeroBenefitIcons.check ?? "";
      const itemId = "id" in benefit && typeof benefit.id === "string" ? benefit.id : undefined;
      const titleAttributes =
        editorContext && itemId
          ? canvasRepeaterItemAttributes(editorContext, "benefit-title", itemId)
          : "";
      const textAttributes =
        editorContext && itemId
          ? canvasRepeaterItemAttributes(editorContext, "benefit-text", itemId)
          : "";
      return `<li class="catalog-hero-benefit" data-hero-benefit><svg class="catalog-hero-benefit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${icon}</svg><span class="catalog-hero-benefit-copy"><strong${titleAttributes}>${escapeHtml(benefit.title)}</strong>${benefit.text ? `<small${textAttributes}>${escapeHtml(benefit.text)}</small>` : ""}</span></li>`;
    })
    .join("")}</ul>`;
}

function modernFallbackAsset(
  context: { project: import("@solara/project-schema").StoreProjectV1 },
  requested?: string,
): string {
  return (
    requested ||
    context.project.seo.socialImageId ||
    context.project.products.find((product) => product.status === "active")?.imageIds[0] ||
    ""
  );
}

function catalogSearchHref(searchEnabled: boolean, href: string, project: StoreProjectV1): string {
  if (searchEnabled || !href.startsWith("/buscar")) return href;
  const firstRootCategory = project.categories.find(
    (category) => !category.parentId && category.status !== "hidden",
  );
  return firstRootCategory ? `/categorias/${firstRootCategory.slug}/` : "/";
}

function renderCatalogHeroMedia(
  context: Parameters<NonNullable<(typeof catalogHero)["render"]>>[0],
  settings: z.infer<typeof heroSettings>,
  title: string,
): string {
  const fallback = modernFallbackAsset(context, settings.posterAssetId);
  if (settings.mode === "video" && settings.videoAssetId) {
    const video = renderVideo(context.project, settings.videoAssetId, {
      className: "catalog-hero-video",
      ...(settings.posterAssetId ? { posterAssetId: settings.posterAssetId } : {}),
      preload: "none",
      // La media 9:16 es loop mudo de fondo: en modo video siempre autoplay
      // (el setting `autoplay` del hero era para el carrusel).
      autoplay: settings.mode === "video" ? true : settings.autoplay,
      fallbackAlt: title,
    });
    if (video) return video;
  }
  const image = renderImage(context.project, fallback, {
    className: "catalog-hero-image",
    loading: "eager",
    fetchPriority: "high",
    sizes: "(max-width: 767px) 100vw, 52vw",
    responsiveMode: "cover",
    fallbackAlt: title,
  });
  return image.replace(
    "<img",
    `<img${canvasImageAttributes(canvasContext(context), "posterAssetId")}`,
  );
}

export const catalogHero: ModuleDefinition<"catalog-hero", z.infer<typeof heroSettings>> = {
  manifest: modernManifest({
    id: "catalog-hero",
    name: "Hero de catálogo",
    description: "Hero dividido con imagen, carrusel o video local.",
    slots: ["hero"],
    compatibleSettings: [
      "mode",
      "eyebrow",
      "title",
      "body",
      "actionLabel",
      "actionHref",
      "secondaryActionLabel",
      "secondaryActionHref",
      "posterAssetId",
      "videoAssetId",
      "backgroundImageId",
      "backgroundDarkness",
      "benefitIconRadius",
      "slides",
      "autoplay",
      "intervalMs",
      "showCatalogStats",
      "benefits",
    ],
  }),
  settingsSchema: heroSettings,
  settingsFields: [
    {
      key: "mode",
      type: "select",
      label: "Modo",
      options: [
        { value: "image", label: "Imagen" },
        { value: "carousel", label: "Carrusel" },
        { value: "video", label: "Video" },
      ],
    },
    { key: "eyebrow", type: "text", label: "Antetítulo" },
    { key: "title", type: "text", label: "Título" },
    { key: "body", type: "text", label: "Descripción" },
    { key: "actionLabel", type: "text", label: "Botón principal" },
    { key: "actionHref", type: "url", label: "Destino principal" },
    { key: "secondaryActionLabel", type: "text", label: "Botón secundario" },
    { key: "secondaryActionHref", type: "url", label: "Destino secundario" },
    { key: "posterAssetId", type: "asset", label: "Imagen de portada" },
    { key: "videoAssetId", type: "asset", label: "Video local" },
    {
      key: "backgroundImageId",
      type: "asset",
      label: "Fondo del hero (desktop)",
    },
    {
      key: "backgroundDarkness",
      type: "number",
      label: "Velo del fondo (%)",
      min: 0,
      max: 90,
      step: 5,
    },
    {
      key: "benefitIconRadius",
      type: "number",
      label: "Radio de íconos mobile (px)",
      min: 0,
      max: 18,
      step: 1,
    },
    {
      key: "slides",
      type: "repeater",
      label: "Slides",
      maxItems: 8,
      itemLabelKey: "title",
      fields: [
        { key: "title", label: "Título", type: "text" },
        { key: "body", label: "Descripción", type: "text" },
        { key: "actionLabel", label: "Botón", type: "text" },
        { key: "actionHref", label: "Destino", type: "url" },
        { key: "imageId", label: "Imagen", type: "asset" },
      ],
    },
    { key: "autoplay", type: "boolean", label: "Reproducción automática" },
    { key: "intervalMs", type: "number", label: "Intervalo", min: 3000, max: 15000, step: 500 },
    { key: "showCatalogStats", type: "boolean", label: "Mostrar estadísticas del catálogo" },
    {
      key: "benefits",
      type: "repeater",
      label: "Beneficios",
      maxItems: 3,
      itemLabelKey: "title",
      fields: [
        {
          key: "icon",
          type: "select",
          label: "Ícono",
          options: [
            { value: "truck", label: "Envío" },
            { value: "chat", label: "WhatsApp" },
            { value: "shield", label: "Protección" },
            { value: "tag", label: "Etiqueta" },
            { value: "gift", label: "Regalo" },
            { value: "clock", label: "Reloj" },
            { value: "card", label: "Tarjeta" },
            { value: "check", label: "Check" },
          ],
        },
        { key: "title", type: "text", label: "Título" },
        { key: "text", type: "text", label: "Descripción" },
      ],
    },
  ],
  motionZones: [
    ...modernRevealZone,
    {
      id: "media",
      label: "Media",
      selector: '[data-motion-zone="media"]',
      allowedPresets: ["none", "fade", "scale", "parallax"] as const,
    },
  ],
  canvasBindings: [
    textBinding("title", "Título del hero", "title", 180),
    textBinding("eyebrow", "Antetítulo del hero", "eyebrow", 100),
    textBinding("body", "Descripción del hero", "body", 300),
    {
      id: "whatsappAction",
      label: "Texto de WhatsApp del hero",
      kind: "text",
      source: { kind: "public-copy", group: "hero", field: "whatsappAction" },
      capabilities: ["edit-text"],
      maxLength: 100,
    },
    textBinding("actionLabel", "Texto del botón principal", "actionLabel", 100),
    {
      id: "actionHref",
      label: "Destino del botón principal",
      kind: "link",
      source: { kind: "section-setting", fieldKey: "actionHref" },
      capabilities: ["edit-link"],
    },
    textBinding("secondaryActionLabel", "Texto del botón secundario", "secondaryActionLabel", 100),
    {
      id: "secondaryActionHref",
      label: "Destino del botón secundario",
      kind: "link",
      source: { kind: "section-setting", fieldKey: "secondaryActionHref" },
      capabilities: ["edit-link"],
    },
    {
      id: "posterAssetId",
      label: "Imagen principal del hero",
      kind: "image",
      source: { kind: "section-setting", fieldKey: "posterAssetId" },
      capabilities: ["edit-image"],
    },
    {
      id: "backgroundImageId",
      label: "Imagen de fondo del hero",
      kind: "image",
      source: { kind: "section-setting", fieldKey: "backgroundImageId" },
      capabilities: ["edit-image"],
    },
    {
      id: "slide-title",
      label: "Título de slide",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "title" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 180,
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
      id: "slide-action-label",
      label: "Texto del botón de slide",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "actionLabel" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 100,
    },
    {
      id: "slide-action-href",
      label: "Destino del botón de slide",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "actionHref" },
      capabilities: ["edit-repeater-item", "edit-link"],
    },
    {
      id: "slide-image",
      label: "Imagen de slide",
      kind: "image",
      source: { kind: "section-repeater-item", fieldKey: "slides", itemFieldKey: "imageId" },
      capabilities: ["edit-repeater-item", "edit-image"],
    },
    {
      id: "benefit-title",
      label: "Título del beneficio",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "benefits", itemFieldKey: "title" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 120,
    },
    {
      id: "benefit-text",
      label: "Descripción del beneficio",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "benefits", itemFieldKey: "text" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 240,
    },
  ],
  clientAsset: "storefront-hero" as AssetId,
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const settings = context.settings;
    const normalizeV2Href = (href: string): string => {
      if (
        context.project.commerceTemplates.designFamily === "catalog-modern-v2" &&
        /^\/(contacto|nosotros|compra|envios|devoluciones)\/?$/i.test(href)
      ) {
        return "#contact-form";
      }
      return href;
    };
    const searchEnabled =
      context.project.navigation.showSearch && context.project.commerceTemplates.search.enabled;
    const activeSlide = settings.mode === "carousel" ? settings.slides[0] : undefined;
    const title = activeSlide?.title ?? settings.title;
    const body = activeSlide?.body ?? settings.body;
    const actionLabel = activeSlide?.actionLabel ?? settings.actionLabel;
    const actionHref = normalizeV2Href(
      catalogSearchHref(
        searchEnabled,
        activeSlide?.actionHref ?? settings.actionHref,
        context.project,
      ),
    );
    const configuredSecondaryActionHref = safeUrl(settings.secondaryActionHref);
    const secondaryActionHref = normalizeV2Href(configuredSecondaryActionHref);
    const media = renderCatalogHeroMedia(context, settings, title);
    const slidePanels =
      settings.mode === "carousel"
        ? settings.slides
            .map((slide, index) => {
              const slideImage = renderImage(
                context.project,
                slide.imageId || modernFallbackAsset(context, settings.posterAssetId),
                {
                  className: "catalog-hero-image",
                  loading: index === 0 ? "eager" : "lazy",
                  fetchPriority: index === 0 ? "high" : "auto",
                  sizes: "(max-width: 767px) 100vw, 45vw",
                  responsiveMode: "cover",
                  fallbackAlt: slide.title,
                },
              );
              const slideImageMarkup = slideImage.replace(
                "<img",
                `<img${canvasRepeaterItemAttributes(canvasContext(context), "slide-image", slide.id)}`,
              );
              return `<figure data-catalog-hero-slide-panel data-title="${escapeAttribute(slide.title)}" data-body="${escapeAttribute(slide.body)}" data-action-label="${escapeAttribute(slide.actionLabel)}" data-action-href="${escapeAttribute(normalizeV2Href(safeUrl(catalogSearchHref(searchEnabled, slide.actionHref, context.project))))}"${canvasRepeaterItemAttributes(canvasContext(context), "slide-title", slide.id)}${index === 0 ? "" : " hidden"}>${slideImageMarkup}</figure>`;
            })
            .join("")
        : "";
    const heroMedia = slidePanels
      ? `<div class="catalog-hero-slide-stage">${slidePanels}</div>`
      : String(media);
    const stats = settings.showCatalogStats
      ? `<dl class="catalog-hero-stats" aria-label="${escapeAttribute(copy.accessibility.catalogSummary)}"><div data-stat="products"><dt>${context.project.products.filter((product) => product.status === "active").length}</dt><dd>${escapeHtml(copy.hero.activeProducts)}</dd></div><div data-stat="categories"><dt>${context.project.categories.filter((category) => !category.parentId && category.status !== "hidden").length}</dt><dd>${escapeHtml(copy.hero.categories)}</dd></div><div data-stat="whatsapp"><dt>${context.project.whatsapp.phone ? escapeHtml(copy.hero.whatsapp) : escapeHtml(copy.hero.contact)}</dt><dd>${context.project.whatsapp.phone ? escapeHtml(copy.hero.directOrder) : escapeHtml(copy.hero.inquiries)}</dd></div></dl>`
      : "";
    // La familia V2 (fuera del modo carousel) expone el contrato de markup que
    // la tarea de motion usa para entrada cinematográfica, máscaras y parallax:
    // reveal zones, líneas del título y beneficios configurables. El modo
    // carousel y la familia V1 conservan exactamente la estructura previa.
    const isV2Hero =
      context.project.commerceTemplates.designFamily === "catalog-modern-v2" &&
      settings.mode !== "carousel";
    // Fondo editorial del hero (sólo desktop, detrás del texto): imagen
    // oscurecida por el editor. En mobile se oculta; la media (foto o video)
    // es el fondo full-bleed.
    const heroBackground = isV2Hero
      ? ""
      : settings.backgroundImageId
        ? renderImage(context.project, settings.backgroundImageId, {
            className: "catalog-hero-background-image",
            loading: "lazy",
            fetchPriority: "auto",
            sizes: "100vw",
            fallbackAlt: `${title} — fondo editorial`,
          })
        : "";
    const heroBackgroundWithBinding = heroBackground.replace(
      "<img",
      `<img${canvasImageAttributes(canvasContext(context), "backgroundImageId")}`,
    );
    const heroBackgroundWrap = heroBackground
      ? `<div class="catalog-hero-background" data-hero-background style="--catalog-hero-bg-dark:${
          Math.min(Math.max(settings.backgroundDarkness, 0), 90) / 100
        }">${heroBackgroundWithBinding}</div>`
      : "";
    const benefitsMarkup = isV2Hero
      ? settings.benefits.length > 0
        ? renderHeroBenefits(
            settings.benefits,
            "catalog-hero-benefits--copy",
            copy.hero.benefits,
            canvasContext(context),
          )
        : stats
      : "";
    // La banda de beneficios del hero V2 se renderiza tras el contenedor del
    // hero para que en mobile (foto como fondo full-bleed) quede debajo de la
    // imagen; en desktop la banda se oculta y se muestra la copia interna.
    const benefitsBand =
      isV2Hero && settings.benefits.length > 0
        ? renderHeroBenefits(
            settings.benefits,
            "catalog-hero-benefits--band",
            copy.hero.benefits,
            canvasContext(context),
            `--catalog-hero-benefit-icon-radius:${Math.min(Math.max(settings.benefitIconRadius, 0), 18)}px`,
          )
        : "";
    const titleLinesMarkup = isV2Hero
      ? heroTitleLines(title)
          .map(
            (line) =>
              `<span class="catalog-hero-line" data-hero-line><span class="catalog-hero-line-inner" data-hero-line-inner>${escapeHtml(line)}</span></span>`,
          )
          .join(" ")
      : "";
    const slides =
      settings.mode === "carousel"
        ? settings.slides
            .map(
              (_slide, index) =>
                `<button type="button" role="tab" data-catalog-hero-slide="${index}" aria-label="${escapeAttribute(copy.accessibility.goToSlide.replace("{index}", String(index + 1)))}" aria-selected="${String(index === 0)}"></button>`,
            )
            .join("")
        : "";
    // La familia V2 reemplaza las acciones del hero por un único enlace directo
    // a WhatsApp (sin mensaje precargado) cuando la tienda tiene teléfono público.
    const whatsappPhone =
      context.project.commerceTemplates.designFamily === "catalog-modern-v2" &&
      hasPublicWhatsApp(context.project.whatsapp)
        ? context.project.whatsapp.phone.replace(/\D/g, "")
        : "";
    const actions = whatsappPhone
      ? `<a class="catalog-primary-action solara-primary-action" href="https://wa.me/${escapeAttribute(whatsappPhone)}" target="_blank" rel="noopener noreferrer"><span class="catalog-hero-cta-label"${canvasEntityAttributes(canvasContext(context), "whatsappAction", "public-copy", "hero", "whatsappAction")}>${escapeHtml(copy.hero.whatsappAction)}</span><svg class="catalog-hero-cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${catalogHeroBenefitIcons.chat}</svg></a>`
      : `<a class="catalog-primary-action" href="${escapeAttribute(safeUrl(actionHref))}"${canvasTextAttributes(canvasContext(context), "actionHref")}><span${canvasTextAttributes(canvasContext(context), "actionLabel", 100)}>${escapeHtml(actionLabel)}</span></a>${settings.secondaryActionLabel ? `<a class="catalog-secondary-action" href="${escapeAttribute(secondaryActionHref)}"${canvasTextAttributes(canvasContext(context), "secondaryActionHref")}><span${canvasTextAttributes(canvasContext(context), "secondaryActionLabel", 100)}>${escapeHtml(settings.secondaryActionLabel)}</span></a>` : ""}`;
    const titleCanvasAttributes = activeSlide
      ? canvasRepeaterItemAttributes(canvasContext(context), "slide-title", activeSlide.id)
      : canvasTextAttributes(canvasContext(context), "title", 180);
    const bodyCanvasAttributes = activeSlide
      ? canvasRepeaterItemAttributes(canvasContext(context), "slide-body", activeSlide.id)
      : canvasTextAttributes(canvasContext(context), "body", 300);
    const heroInner = isV2Hero
      ? `<div class="catalog-hero-inner" data-motion-zone="content" data-autoplay="${String(settings.autoplay)}" data-interval="${settings.intervalMs}">${heroBackgroundWrap}<div class="catalog-hero-copy"><div class="catalog-hero-reveal catalog-hero-reveal--eyebrow"><p class="catalog-eyebrow"${canvasTextAttributes(canvasContext(context), "eyebrow", 100)}>${escapeHtml(settings.eyebrow)}</p></div><h1 class="catalog-hero-title" data-hero-title${titleCanvasAttributes}>${titleLinesMarkup}</h1><div class="catalog-hero-rule" data-hero-rule aria-hidden="true"></div><div class="catalog-hero-reveal catalog-hero-reveal--body"><p class="catalog-hero-body"${bodyCanvasAttributes}>${escapeHtml(body)}</p></div><div class="catalog-hero-reveal catalog-hero-reveal--actions"><div class="catalog-hero-actions">${actions}</div></div>${benefitsMarkup}</div><figure class="catalog-hero-media" data-motion-zone="media" data-hero-media>${heroMedia}</figure>${slides ? `<div class="catalog-hero-controls" role="tablist" aria-label="${escapeAttribute(copy.accessibility.heroSlides)}">${slides}</div>` : ""}</div>${benefitsBand}`
      : `<div class="catalog-hero-inner" data-motion-zone="content" data-autoplay="${String(settings.autoplay)}" data-interval="${settings.intervalMs}"><div class="catalog-hero-copy"><p class="catalog-eyebrow"${canvasTextAttributes(canvasContext(context), "eyebrow", 100)}>${escapeHtml(settings.eyebrow)}</p><h1${titleCanvasAttributes}>${escapeHtml(title)}</h1><p class="catalog-hero-body"${bodyCanvasAttributes}>${escapeHtml(body)}</p><div class="catalog-hero-actions">${actions}</div>${stats}</div><figure class="catalog-hero-media" data-motion-zone="media">${heroMedia}</figure>${slides ? `<div class="catalog-hero-controls" role="tablist" aria-label="${escapeAttribute(copy.accessibility.heroSlides)}">${slides}</div>` : ""}</div>`;
    const heroRootClass = [
      isV2Hero ? "catalog-hero-editorial" : "",
      heroBackgroundWrap ? "catalog-hero-editorial--has-background" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return moduleRoot(
      "catalog-hero",
      context.section,
      safeHtml(heroInner),
      heroRootClass ? { className: heroRootClass } : undefined,
    );
  },
};

const brandStripSettings = z.object({
  title: z.string().default("Marcas que nos acompañan"),
  limit: z.number().int().min(1).max(12).default(5),
});

export const catalogBrandStrip: ModuleDefinition<
  "catalog-brand-strip",
  z.infer<typeof brandStripSettings>
> = {
  manifest: modernManifest({
    id: "catalog-brand-strip",
    name: "Franja de marcas",
    description: "Marcas presentes en el catálogo de la tienda.",
    slots: ["content"],
    compatibleSettings: ["title", "limit"],
  }),
  settingsSchema: brandStripSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "limit", type: "number", label: "Cantidad", min: 1, max: 12, step: 1 },
  ],
  motionZones: modernItemsZone,
  canvasBindings: [textBinding("title", "Título de marcas", "title", 120)],
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const brands = [
      ...new Set(
        context.project.products
          .filter((product) => product.status === "active")
          .map((product) => product.brand)
          .filter(Boolean),
      ),
    ].slice(0, context.settings.limit);
    if (!brands.length) return moduleRoot("catalog-brand-strip", context.section, safeHtml(""));
    return moduleRoot(
      "catalog-brand-strip",
      context.section,
      safeHtml(
        `<div class="catalog-brand-strip-inner"><h2${canvasTextAttributes(canvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</h2><ul data-motion-zone="items">${brands.map((brand) => `<li>${escapeHtml(brand)}</li>`).join("")}</ul></div>`,
      ),
    );
  },
};

const productGridSettings = z.object({
  title: z.string().default("Productos destacados"),
  source: z.enum(["all", "collection", "category"]).default("all"),
  sourceId: z.string().default(""),
  limit: z.number().int().min(1).max(48).default(12),
  showRating: z.boolean().default(true),
  showViewAll: z.boolean().default(true),
  viewAllHref: z.string().default("/buscar/"),
});

function modernProducts(
  context: Parameters<NonNullable<(typeof catalogProductGrid)["render"]>>[0],
  settings: z.infer<typeof productGridSettings>,
): Product[] {
  let products = context.products
    ? [...context.products]
    : context.project.products.filter((product) => product.status === "active");
  if (settings.source === "collection" && settings.sourceId) {
    const collection = context.project.collections.find((item) => item.id === settings.sourceId);
    const ids = new Set(collection?.status === "hidden" ? [] : (collection?.productIds ?? []));
    products = context.project.products.filter(
      (product) => ids.has(product.id) && product.status === "active",
    );
  }
  if (settings.source === "category" && settings.sourceId) {
    const category = context.project.categories.find((item) => item.id === settings.sourceId);
    const ids = new Set(category?.status === "hidden" ? [] : (category?.productIds ?? []));
    products = context.project.products.filter(
      (product) => ids.has(product.id) && product.status === "active",
    );
  }
  return products.slice(0, settings.limit);
}

function productCategory(
  context: Parameters<NonNullable<(typeof catalogProductGrid)["render"]>>[0],
  product: Product,
): { id: string; title: string } | undefined {
  const categories = product.categoryIds
    .map((categoryId) => context.project.categories.find((category) => category.id === categoryId))
    .filter((category): category is (typeof context.project.categories)[number] =>
      Boolean(category && category.status !== "hidden"),
    );
  return [...categories].sort((left, right) => {
    const depthDifference =
      getCategoryBreadcrumb(context.project, right.id).length -
      getCategoryBreadcrumb(context.project, left.id).length;
    if (depthDifference !== 0) return depthDifference;
    return context.project.categories.indexOf(left) - context.project.categories.indexOf(right);
  })[0];
}

function modernProductCardImageSizes(
  context: Parameters<NonNullable<(typeof catalogProductGrid)["render"]>>[0],
): string {
  if (context.project.commerceTemplates.designFamily !== "catalog-modern-v2") {
    return "(max-width: 640px) 44vw, (max-width: 1024px) 30vw, 23vw";
  }
  return "(max-width: 767px) calc((100vw - 2.2rem) / 2), (max-width: 1199px) min(22vw, 11.5rem), min(20vw, 13rem)";
}

export function catalogReviewSummary(
  product: Product,
): { average: number; count: number } | undefined {
  const reviews = product.reviews?.filter((review: ProductReview) => review.visible) ?? [];
  if (!reviews.length) return undefined;
  return {
    average: reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length,
    count: reviews.length,
  };
}

function modernProductCard(
  context: Parameters<NonNullable<(typeof catalogProductGrid)["render"]>>[0],
  product: Product,
  index: number,
  _showRating: boolean,
): string {
  const variant = product.variants.find((item) => item.available) ?? product.variants[0];
  const price = lowestPrice(product);
  const compare = variant?.compareAtPrice;
  const category = productCategory(context, product);
  const _reviewSummary: { average: number; count: number } | undefined = undefined; // reviews eliminated
  const imageId = variant?.imageId ?? product.imageIds[0];
  const image = renderImage(context.project, imageId, {
    className: "catalog-product-card-image",
    loading: index < 6 ? "eager" : "lazy",
    fetchPriority: index < 6 ? "high" : "auto",
    sizes: modernProductCardImageSizes(context),
    // Alt semantico: producto + categoria + marca para Google Images.
    fallbackAlt: [product.title, category?.title, context.project.identity.brandName]
      .filter(Boolean)
      .join(" - "),
  });
  const editorContext = canvasContext(context);
  const imageMarkup = image.replace(
    "<img",
    `<img${canvasEntityAttributes(editorContext, "product-image", "product", product.id, "imageIds", "image")}`,
  );
  const titleAttributes = canvasEntityAttributes(
    editorContext,
    "product-title",
    "product",
    product.id,
    "title",
  );
  return `<article class="catalog-product-card" data-product-card data-product-id="${escapeAttribute(product.id)}" data-product-title="${escapeAttribute(product.title)}"${category ? ` data-product-category="${escapeAttribute(category.id)}"` : ""}><a class="catalog-product-media" href="/productos/${escapeAttribute(product.slug)}/" aria-label="Ver ${escapeAttribute(product.title)}">${imageMarkup}</a><div class="catalog-product-card-copy">${category ? `<p class="catalog-product-category">${escapeHtml(category.title)}</p>` : ""}<h3><a href="/productos/${escapeAttribute(product.slug)}/"${titleAttributes}>${escapeHtml(product.title)}</a></h3><p class="catalog-product-price"><strong>${escapeHtml(formatMoneyForProject(price, context.project))}</strong>${compare && compare > price ? ` <del>${escapeHtml(formatMoneyForProject(compare, context.project))}</del><span class="catalog-discount">-${Math.round((1 - price / compare) * 100)}%</span>` : ""}</p></div></article>`;
}

export const catalogProductGrid: ModuleDefinition<
  "catalog-product-grid",
  z.infer<typeof productGridSettings>
> = {
  manifest: modernManifest({
    id: "catalog-product-grid",
    name: "Grilla moderna de productos",
    description: "Grilla densa para home, colecciones y categorías.",
    slots: ["catalog"],
    compatibleSettings: [
      "title",
      "source",
      "sourceId",
      "limit",
      "showRating",
      "showViewAll",
      "viewAllHref",
    ],
  }),
  settingsSchema: productGridSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    {
      key: "source",
      type: "select",
      label: "Origen",
      options: [
        { value: "all", label: "Todos" },
        { value: "collection", label: "Colección" },
        { value: "category", label: "Categoría" },
      ],
    },
    { key: "sourceId", type: "text", label: "Origen (ID)" },
    { key: "limit", type: "number", label: "Cantidad", min: 1, max: 48, step: 1 },
    { key: "showRating", type: "boolean", label: "Mostrar valoración" },
    { key: "showViewAll", type: "boolean", label: "Mostrar enlace" },
    { key: "viewAllHref", type: "url", label: "Destino del enlace" },
  ],
  motionZones: modernItemsZone,
  canvasBindings: [
    textBinding("title", "Título de productos", "title", 120),
    {
      id: "product-title",
      label: "Título de producto",
      kind: "text",
      source: { kind: "product", entityId: "*", field: "title" },
      capabilities: ["edit-text"],
      maxLength: 200,
    },
    {
      id: "product-image",
      label: "Imagen de producto",
      kind: "image",
      source: { kind: "product", entityId: "*", field: "imageIds" },
      capabilities: ["edit-image"],
    },
  ],
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const products = modernProducts(context, context.settings);
    const isCategoryPage = context.pageType === "category";
    const sectionTitle = isCategoryPage
      ? context.category
        ? `Productos de ${context.category.title}`
        : "Productos"
      : context.settings.title;
    const searchEnabled =
      context.project.navigation.showSearch && context.project.commerceTemplates.search.enabled;
    const viewAllHref = catalogSearchHref(
      searchEnabled,
      context.settings.viewAllHref,
      context.project,
    );
    const viewAllAriaLabel = `${context.project.publicCopy.navigation.viewAll} de ${sectionTitle}`;
    const categoryGrid = context.pageType === "category" ? " data-category-grid" : "";
    const cards = products
      .map((product, index) => {
        const card = modernProductCard(context, product, index, context.settings.showRating);
        // El runtime reutiliza estos datos para filtros y ordenamiento sin duplicar el catálogo.
        const optionValues = [
          ...new Set(
            product.variants.flatMap((variant) =>
              Object.entries(variant.optionValues).map(([key, value]) => `${key}=${value}`),
            ),
          ),
        ];
        const attributes = ` data-product-price="${lowestPrice(product)}" data-product-tags="${escapeAttribute(product.tags.join(" "))}" data-product-variants="${escapeAttribute(product.variants.map((variant) => variant.title).join(" "))}" data-product-options="${escapeAttribute(optionValues.join("|"))}" data-product-available="${String(product.variants.some((variant) => variant.available))}"`;
        return card.replace(
          `data-product-title="${escapeAttribute(product.title)}"`,
          `data-product-title="${escapeAttribute(product.title)}"${attributes}`,
        );
      })
      .join("");
    return moduleRoot(
      "catalog-product-grid",
      context.section,
      safeHtml(
        `<div class="catalog-product-grid-section"><header><h2${isCategoryPage ? "" : canvasTextAttributes(canvasContext(context), "title", 120)}>${escapeHtml(sectionTitle)}</h2>${context.settings.showViewAll && !isCategoryPage ? `<a class="catalog-view-all" href="${escapeAttribute(safeUrl(viewAllHref))}" aria-label="${escapeAttribute(viewAllAriaLabel)}">${escapeHtml(context.project.publicCopy.navigation.viewAll)}</a>` : ""}</header><div class="catalog-product-grid" data-motion-zone="items" data-product-count="${products.length}"${categoryGrid}>${cards || `<p class="catalog-empty">${escapeHtml(context.project.publicCopy.empty.products)}</p>`}</div></div>`,
      ),
    );
  },
};

const productDetailSettings = z.object({
  actionLabel: z.string().default("Agregar al carrito"),
  showDescription: z.boolean().default(true),
  showCompareAtPrice: z.boolean().default(true),
  deliveryNote: z.string().default("Coordinamos entrega y pago por WhatsApp."),
});

function hasPublicWhatsApp(whatsapp: { phone: string }): boolean {
  const rawPhone = whatsapp.phone;
  return rawPhone !== CATALOG_MODERN_PLACEHOLDER_PHONE && rawPhone.replace(/\D/g, "").length > 0;
}

function buildWhatsAppInquiryLink(
  context: Parameters<NonNullable<(typeof catalogProductDetail)["render"]>>[0],
  product: Product,
): string {
  const rawPhone = context.project.whatsapp.phone;
  const phone = rawPhone.replace(/\D/g, "");
  if (!phone || rawPhone === CATALOG_MODERN_PLACEHOLDER_PHONE) return "";
  const firstVariant = product.variants.find((variant) => variant.available) ?? product.variants[0];
  const message = [
    personalizeWhatsAppGreeting(
      context.project.whatsapp.greeting,
      context.project.identity.brandName,
    ),
    `Producto: ${product.title}`,
    firstVariant ? `Variante: ${firstVariant.title}` : "",
    `Precio: ${formatMoneyForProject(firstVariant?.price ?? lowestPrice(product), context.project)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const catalogProductDetail: ModuleDefinition<
  "catalog-product-detail",
  z.infer<typeof productDetailSettings>
> = {
  manifest: modernManifest({
    id: "catalog-product-detail",
    name: "Detalle moderno de producto",
    description: "Galería, variantes, precio, reseñas y acción de compra.",
    slots: ["product"],
    compatibleSettings: ["actionLabel", "showDescription", "showCompareAtPrice", "deliveryNote"],
  }),
  settingsSchema: productDetailSettings,
  settingsFields: [
    { key: "actionLabel", type: "text", label: "Texto de la acción" },
    { key: "showDescription", type: "boolean", label: "Mostrar descripción" },
    { key: "showCompareAtPrice", type: "boolean", label: "Mostrar precio anterior" },
    { key: "deliveryNote", type: "text", label: "Nota de entrega" },
  ],
  motionZones: [...modernRevealZone, ...modernItemsZone],
  canvasBindings: [
    textBinding("actionLabel", "Texto de compra", "actionLabel", 100),
    textBinding("deliveryNote", "Nota de entrega", "deliveryNote", 240),
    {
      id: "product-title",
      label: "Título del producto",
      kind: "text",
      source: { kind: "product", entityId: "*", field: "title" },
      capabilities: ["edit-text"],
      maxLength: 200,
    },
    {
      id: "product-description",
      label: "Descripción del producto",
      kind: "text",
      source: { kind: "product", entityId: "*", field: "description" },
      capabilities: ["edit-text"],
      multiline: true,
      maxLength: 10000,
    },
    {
      id: "product-rich-description",
      label: "Descripción enriquecida",
      kind: "rich-text",
      source: { kind: "product", entityId: "*", field: "richDescription" },
      capabilities: ["edit-rich-text"],
      multiline: true,
      maxLength: 10000,
    },
    {
      id: "product-image",
      label: "Imagen del producto",
      kind: "image",
      source: { kind: "product", entityId: "*", field: "imageIds" },
      capabilities: ["edit-image"],
    },
    {
      id: "product-price",
      label: "Precio del producto",
      kind: "number",
      source: { kind: "product", entityId: "*", field: "price" },
      capabilities: ["edit-number"],
    },
    {
      id: "asset-alt",
      label: "Texto alternativo de imagen",
      kind: "text",
      source: { kind: "asset", entityId: "*", field: "alt" },
      capabilities: ["edit-alt", "edit-text"],
      maxLength: 500,
    },
  ],
  clientAsset: "storefront-cart" as AssetId,
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const product = context.product;
    if (!product) {
      return moduleRoot(
        "catalog-product-detail",
        context.section,
        safeHtml(`<p class="catalog-empty">${escapeHtml(copy.empty.products)}</p>`),
        { className: "catalog-product-detail" },
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
          className: "catalog-product-gallery-image",
          loading: index === 0 && galleryVideos.length === 0 ? "eager" : "lazy",
          fetchPriority: index === 0 && galleryVideos.length === 0 ? "high" : "auto",
          sizes:
            context.project.commerceTemplates.designFamily === "catalog-modern-v2"
              ? "(max-width: 767px) 92vw, (max-width: 1199px) 94vw, 60vw"
              : "(max-width: 767px) 92vw, 54vw",
          fallbackAlt: product.title,
        });
        const imageWithAlt = image.replace(
          "<img",
          `<img${canvasEntityAttributes(canvasContext(context), "asset-alt", "asset", assetId, "alt")}`,
        );
        const imageBinding = canvasEntityAttributes(
          canvasContext(context),
          "product-image",
          "product",
          product.id,
          "imageIds",
          "image",
        );
        return `<figure data-gallery-image-id="${escapeAttribute(assetId)}" data-gallery-media-id="${escapeAttribute(assetId)}" data-media-kind="image" data-gallery-active="${String(index === 0)}"${imageBinding}>${imageWithAlt}</figure>`;
      }),
      ...galleryVideos.map((video, videoIndex) => {
        const posterUrl = video.posterAssetId
          ? assetUrl(context.project, video.posterAssetId, "")
          : "";
        const isActive = galleryAssetIds.length === 0 && videoIndex === 0;
        const caption = video.alt || video.name;
        const posterImg = renderImage(context.project, video.posterAssetId, {
          className: "catalog-product-gallery-image",
          loading: "lazy",
          sizes: "(max-width: 767px) 92vw, 54vw",
          fallbackAlt: `${product.title}, video ${videoIndex + 1}`,
        });
        return `<figure data-gallery-media-id="${escapeAttribute(video.id)}" data-media-kind="video" data-gallery-active="${String(isActive)}"><video class="catalog-product-gallery-video" width="${video.width}" height="${video.height}"${posterUrl ? ` poster="${escapeAttribute(posterUrl)}"` : ""} preload="none" playsinline controls aria-label="${escapeAttribute(caption)}"><source src="${escapeAttribute(safeAssetUrl(video.source, ""))}" type="${escapeAttribute(video.mimeType)}">${posterImg}<span>${escapeHtml(caption)}</span></video></figure>`;
      }),
    ].join("");
    const galleryThumbs = [
      ...galleryAssetIds.map((assetId, index) => {
        const image = renderImage(context.project, assetId, {
          className: "catalog-product-gallery-thumb",
          loading: "lazy",
          sizes:
            context.project.commerceTemplates.designFamily === "catalog-modern-v2"
              ? "5.5rem"
              : "5rem",
          fallbackAlt: `${product.title}, imagen ${index + 1}`,
        });
        return `<button type="button" data-gallery-thumb="${escapeAttribute(assetId)}" aria-label="${escapeAttribute(copy.export.viewImage.replace("{index}", String(index + 1)))}" aria-current="${String(index === 0)}">${image}</button>`;
      }),
      ...galleryVideos.map((video, videoIndex) => {
        const thumb = renderImage(context.project, video.posterAssetId, {
          className: "catalog-product-gallery-thumb",
          loading: "lazy",
          sizes: "5rem",
          fallbackAlt: `${product.title}, video ${videoIndex + 1}`,
        });
        return `<button type="button" data-gallery-thumb="${escapeAttribute(video.id)}" data-media-kind="video" aria-label="${escapeAttribute(`Ver video ${videoIndex + 1}`)}" aria-current="${String(galleryAssetIds.length === 0 && videoIndex === 0)}">${thumb}<span class="catalog-product-thumb-badge" aria-hidden="true">▶ ${Math.round(video.durationSeconds)}s</span></button>`;
      }),
    ].join("");
    const gallery =
      galleryAssetIds.length > 0 || galleryVideos.length > 0
        ? `<div class="catalog-product-gallery" data-product-gallery><div class="catalog-product-gallery-main">${galleryFigures}</div><div class="catalog-product-gallery-thumbs">${galleryThumbs}</div></div>`
        : `<p class="catalog-empty">${escapeHtml(copy.empty.products)}</p>`;
    const variants = product.variants
      .map((variant) => {
        const variantImage = context.project.assets.find(
          (asset) => asset.id === (variant.imageId ?? product.imageIds[0]),
        );
        const imageUrl = variantImage ? safeAssetUrl(variantImage.source, "") : "";
        return `<option value="${escapeAttribute(variant.id)}" data-variant-data="${escapeAttribute(variant.id)}" data-variant-id="${escapeAttribute(variant.id)}" data-variant-title="${escapeAttribute(variant.title)}" data-sku="${escapeAttribute(variant.sku)}" data-image-id="${escapeAttribute(variant.imageId ?? product.imageIds[0] ?? "")}"${imageUrl ? ` data-image-url="${escapeAttribute(imageUrl)}" data-image-width="${variantImage?.width ?? ""}" data-image-height="${variantImage?.height ?? ""}"` : ""} data-price="${variant.price}" data-compare-at="${variant.compareAtPrice ?? ""}" data-available="${String(variant.available)}"${variant.available ? "" : " disabled"}${variant.id === firstVariant?.id ? " selected" : ""}>${escapeHtml(variant.title)} · ${escapeHtml(formatMoneyForProject(variant.price, context.project))}${variant.available ? "" : ` · ${escapeHtml(copy.product.outOfStock)}`}</option>`;
      })
      .join("");
    const whatsappFallback = buildWhatsAppInquiryLink(context, product);
    const compareAt =
      context.settings.showCompareAtPrice && firstVariant?.compareAtPrice
        ? formatMoneyForProject(firstVariant.compareAtPrice, context.project)
        : "";
    const detailsPanelId = `catalog-product-details-${context.section.id}`;
    const descriptionPanelId = `catalog-product-description-${context.section.id}`;
    const description = context.settings.showDescription
      ? `<div id="${escapeAttribute(descriptionPanelId)}" class="catalog-rich-text"${canvasEntityAttributes(canvasContext(context), "product-rich-description", "product", product.id, "richDescription")}>${product.richDescription ? sanitizeRichText(product.richDescription) : `<p${canvasEntityAttributes(canvasContext(context), "product-description", "product", product.id, "description")}>${escapeHtml(product.description)}</p>`}</div>`
      : "";
    const policiesPanelId = `catalog-product-policies-${context.section.id}`;
    const isV2 = context.project.commerceTemplates.designFamily === "catalog-modern-v2";
    const descriptionBeforePurchase = isV2 ? "" : description;
    const descriptionAfterPurchase = isV2 ? description : "";
    const variantLabel = copy.product.variant;
    const monoVariant = product.variants.length === 1;
    return moduleRoot(
      "catalog-product-detail",
      context.section,
      safeHtml(`<div class="catalog-product-detail-shell"><div class="catalog-product-detail-inner" data-motion-zone="content" data-product data-product-id="${escapeAttribute(product.id)}" data-product-title="${escapeAttribute(product.title)}" data-default-variant="${escapeAttribute(firstVariant?.id ?? "")}" >
        ${gallery}
        <div class="catalog-product-info">
          <p class="catalog-product-brand">${escapeHtml(product.brand)}</p>
          <h1${canvasEntityAttributes(canvasContext(context), "product-title", "product", product.id, "title")}>${escapeHtml(product.title)}</h1>
          <p class="catalog-detail-price"><span data-product-price${canvasEntityAttributes(canvasContext(context), "product-price", "product", product.id, "price")}>${escapeHtml(formatMoneyForProject(lowestPrice(product), context.project))}</span><del data-product-compare${compareAt ? "" : " hidden"}>${escapeHtml(compareAt)}</del></p>
          ${descriptionBeforePurchase}
          <form class="catalog-add-form" action="/carrito/" method="get" data-solara-add-form>
            <input type="hidden" name="product" value="${escapeAttribute(product.id)}">
            <label for="catalog-variant-${escapeAttribute(context.section.id)}"${monoVariant ? " hidden" : ""}>${escapeHtml(variantLabel)}</label>
            <select id="catalog-variant-${escapeAttribute(context.section.id)}" name="variant" data-variant-select required${monoVariant ? " hidden" : ""}>${variants}</select>
            <div class="catalog-quantity-row"><label for="catalog-quantity-${escapeAttribute(context.section.id)}">${escapeHtml(copy.product.quantity)}</label><input id="catalog-quantity-${escapeAttribute(context.section.id)}" name="quantity" type="number" min="1" max="99" value="1" inputmode="numeric"></div>
            <button class="catalog-product-add" type="submit" data-add-to-cart${canvasTextAttributes(canvasContext(context), "actionLabel", 100)}>${escapeHtml(context.settings.actionLabel)}</button>
            ${whatsappFallback ? `<noscript><style>[data-solara-store].catalog-modern .catalog-add-form .catalog-add-fallback{display:inline-flex}[data-solara-store].catalog-modern .catalog-add-form .catalog-product-add{display:none}</style><a class="catalog-add-fallback" href="${escapeAttribute(whatsappFallback)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.product.askWhatsApp)}</a></noscript>` : ""}
          </form>
          ${descriptionAfterPurchase}
          <p class="catalog-delivery-note"${canvasTextAttributes(canvasContext(context), "deliveryNote", 240)}>${escapeHtml(context.settings.deliveryNote)}</p>
          <dl id="${escapeAttribute(detailsPanelId)}" class="catalog-product-specs"><div><dt>${escapeHtml(copy.product.sku)}</dt><dd data-product-sku>${escapeHtml(firstVariant?.sku ?? "")}</dd></div><div><dt>${escapeHtml(copy.product.availability)}</dt><dd data-product-availability>${firstVariant?.available ? escapeHtml(copy.product.available) : escapeHtml(copy.product.outOfStock)}</dd></div></dl>
          <div id="${escapeAttribute(policiesPanelId)}" class="catalog-product-policies"><details open><summary>${escapeHtml(copy.product.shipping)}</summary><p>${escapeHtml(context.project.policies.shipping.details)}</p></details><details open><summary>${escapeHtml(copy.product.returns)}</summary><p>${escapeHtml(context.project.policies.returns.details)}</p></details></div>
        </div>
      </div></div>`),
      { className: "catalog-product-detail" },
    );
  },
};

const categoryBentoSettings = z.object({
  title: z.string().default("Explorá por categoría"),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        categoryId: z.string().min(1),
        imageId: z.string().default(""),
        size: z.enum(["wide", "tall", "compact"]).default("wide"),
      }),
    )
    .default([]),
});

type CategoryBentoLayout = z.infer<typeof categoryBentoSettings>["items"][number]["size"];

function automaticCategoryBentoLayout(count: number): CategoryBentoLayout[] {
  if (count <= 0) return [];
  if (count === 1) return ["wide"];
  if (count === 2) return ["wide", "wide"];
  if (count === 3) return ["wide", "compact", "compact"];

  if (count === 4) return ["wide", "tall", "compact", "compact"];
  if (count === 5) return ["wide", "tall", "tall", "compact", "compact"];
  if (count === 6) return ["wide", "wide", "compact", "compact", "compact", "compact"];
  if (count === 7) return ["wide", "wide", "compact", "compact", "compact", "compact", "compact"];

  const repeatedLayouts: CategoryBentoLayout[] = [];
  let remaining = count;
  while (remaining >= 8) {
    repeatedLayouts.push(
      "wide",
      "tall",
      "tall",
      "wide",
      "compact",
      "compact",
      "compact",
      "compact",
    );
    remaining -= 8;
  }
  return [...repeatedLayouts, ...automaticCategoryBentoLayout(remaining)];
}

function categoryBentoImageSizes(layout: CategoryBentoLayout, count: number): string {
  if (count === 1) {
    return "(max-width: 767px) calc(100vw - 3.5rem), (max-width: 1199px) calc(100vw - 3rem), min(88vw, 100rem)";
  }
  if (layout === "wide") {
    return "(max-width: 767px) calc(100vw - 3.5rem), (max-width: 1199px) calc(100vw - 3rem - 10vw), min(43vw, 50rem)";
  }
  return "(max-width: 767px) calc((100vw - 4.25rem) / 2), (max-width: 1199px) calc((100vw - 3.75rem - 10vw) / 2), min(21vw, 25rem)";
}

export const catalogCategoryBento: ModuleDefinition<
  "catalog-category-bento",
  z.infer<typeof categoryBentoSettings>
> = {
  manifest: modernManifest({
    id: "catalog-category-bento",
    name: "Mosaico de categorías",
    description: "Categorías visuales en una composición responsive.",
    slots: ["catalog", "content"],
    compatibleSettings: ["title", "items"],
  }),
  settingsSchema: categoryBentoSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    {
      key: "items",
      type: "repeater",
      label: "Categorías",
      itemLabelKey: "categoryId",
      fields: [
        { key: "categoryId", label: "ID de categoría", type: "text" },
        { key: "imageId", label: "Imagen", type: "asset" },
        {
          key: "size",
          label: "Tamaño",
          type: "select",
          options: [
            { value: "wide", label: "Ancha" },
            { value: "tall", label: "Alta" },
            { value: "compact", label: "Compacta" },
          ],
        },
      ],
    },
  ],
  motionZones: modernItemsZone,
  canvasBindings: [
    textBinding("title", "Título de categorías", "title", 120),
    {
      id: "category-title",
      label: "Título de categoría",
      kind: "text",
      source: { kind: "category", entityId: "*", field: "title" },
      capabilities: ["edit-text"],
      maxLength: 160,
    },
    {
      id: "category-image",
      label: "Imagen de categoría",
      kind: "image",
      source: { kind: "category", entityId: "*", field: "imageId" },
      capabilities: ["edit-image"],
    },
    {
      id: "item-category",
      label: "Categoría del mosaico",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "items", itemFieldKey: "categoryId" },
      capabilities: ["edit-repeater-item", "edit-text"],
    },
    {
      id: "item-image",
      label: "Imagen de categoría",
      kind: "image",
      source: { kind: "section-repeater-item", fieldKey: "items", itemFieldKey: "imageId" },
      capabilities: ["edit-image", "edit-repeater-item"],
    },
  ],
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const activeProducts = new Set(
      context.project.products
        .filter((product) => product.status === "active")
        .map((product) => product.id),
    );
    const rootCategories = context.project.categories.filter(
      (category) => !category.parentId && category.status !== "hidden",
    );
    const automaticLayout = automaticCategoryBentoLayout(rootCategories.length);
    const automaticItems = rootCategories.map((category, index) => ({
      id: `automatic-category-${category.id}`,
      categoryId: category.id,
      imageId: "",
      size: automaticLayout[index] ?? "compact",
    }));
    const configuredItems = context.settings.items
      .filter((item) => rootCategories.some((category) => category.id === item.categoryId))
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.categoryId === item.categoryId) === index,
      );
    const sourceItems = configuredItems.length ? configuredItems : automaticItems;
    const items = sourceItems
      .map((item) => {
        const category = context.project.categories.find(
          (candidate) => candidate.id === item.categoryId,
        );
        if (!category) return "";
        const categoryProduct = context.project.products.find(
          (product) =>
            product.status === "active" &&
            getCategoryProductIds(context.project, category.id as CategoryId).includes(product.id),
        );
        const productImageId =
          categoryProduct?.variants.find((variant) => variant.available)?.imageId ??
          categoryProduct?.imageIds[0];
        const imageId = item.imageId || category.imageId || productImageId;
        const image = imageId
          ? renderImage(context.project, imageId, {
              className: "catalog-category-bento-image",
              loading: "lazy",
              sizes: categoryBentoImageSizes(item.size, sourceItems.length),
              fallbackAlt: category.title,
            })
          : `<div class="solara-category-placeholder" aria-hidden="true">${escapeHtml(category.title.charAt(0).toUpperCase())}</div>`;
        const imageMarkup = imageId
          ? image.replace(
              "<img",
              `<img${canvasRepeaterItemAttributes(canvasContext(context), "item-image", item.id)}`,
            )
          : image;
        const categoryImageMarkup = imageMarkup.replace(
          `<img${canvasRepeaterItemAttributes(canvasContext(context), "item-image", item.id)}`,
          `<img${canvasEntityAttributes(canvasContext(context), "category-image", "category", category.id, "imageId", "image")}`,
        );
        const layout = item.size;
        const productCount = getCategoryProductIds(
          context.project,
          category.id as CategoryId,
        ).filter((id) => activeProducts.has(id)).length;
        const productCountLabel = `${productCount} ${copy.export.categoryProducts}`;
        return `<a class="catalog-category-bento-item catalog-category-bento-item--${layout}"${canvasRepeaterItemAttributes(canvasContext(context), "item-category", item.id)} href="/categorias/${escapeAttribute(category.slug)}/" aria-label="${escapeAttribute(copy.export.exploreCategory.replace("{category}", category.title))}"><div class="catalog-category-bento-media"${canvasRepeaterItemAttributes(canvasContext(context), "item-image", item.id)}>${categoryImageMarkup}</div><div class="catalog-category-bento-copy"><span class="catalog-category-bento-label"><span class="catalog-category-bento-title"${canvasEntityAttributes(canvasContext(context), "category-title", "category", category.id, "title")}>${escapeHtml(category.title)}</span><small class="catalog-category-bento-count">${productCountLabel}</small></span><svg class="catalog-category-bento-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></div></a>`;
      })
      .filter(Boolean)
      .join("");
    const searchEnabled =
      context.project.navigation.showSearch && context.project.commerceTemplates.search.enabled;
    return moduleRoot(
      "catalog-category-bento",
      context.section,
      safeHtml(
        `<div class="catalog-category-bento-section"><header><h2 class="catalog-category-bento-heading"><span class="catalog-category-bento-heading-inner"${canvasTextAttributes(canvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</span></h2>${items && searchEnabled ? `<a class="catalog-category-bento-all" href="/buscar/">${escapeHtml(context.project.publicCopy.navigation.viewAll)}</a>` : ""}</header><div class="catalog-category-bento-grid" data-category-count="${sourceItems.length}" data-motion-zone="items">${items || `<p class="catalog-empty">${escapeHtml(context.project.publicCopy.empty.categories)}</p>`}</div></div>`,
      ),
    );
  },
};

const testimonialSchema = z.object({
  id: z.string().min(1),
  author: z.string().min(1),
  context: z.string().default(""),
  body: z.string().min(1),
  rating: z.number().int().min(1).max(5).default(5),
  example: z.boolean().default(true),
});
const testimonialSettings = z.object({
  title: z.string().default("Lo que dicen quienes nos eligen"),
  items: z.array(testimonialSchema).max(12).default([]),
});

export const catalogTestimonials: ModuleDefinition<
  "catalog-testimonials",
  z.infer<typeof testimonialSettings>
> = {
  manifest: modernManifest({
    id: "catalog-testimonials",
    name: "Testimonios",
    description: "Testimonios editables en una fila controlada.",
    slots: ["trust", "content"],
    compatibleSettings: ["title", "items"],
  }),
  settingsSchema: testimonialSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    {
      key: "items",
      type: "repeater",
      label: "Testimonios",
      maxItems: 12,
      itemLabelKey: "author",
      fields: [
        { key: "author", label: "Nombre", type: "text" },
        { key: "context", label: "Contexto", type: "text" },
        { key: "body", label: "Texto", type: "text" },
        { key: "rating", label: "Valoración", type: "number", min: 1, max: 5, step: 1 },
      ],
    },
  ],
  motionZones: modernItemsZone,
  canvasBindings: [
    textBinding("title", "Título de testimonios", "title", 120),
    {
      id: "item-author",
      label: "Nombre del testimonio",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "items", itemFieldKey: "author" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 100,
    },
    {
      id: "item-body",
      label: "Texto del testimonio",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "items", itemFieldKey: "body" },
      capabilities: ["edit-repeater-item", "edit-text"],
      multiline: true,
      maxLength: 400,
    },
    {
      id: "item-context",
      label: "Contexto del testimonio",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "items", itemFieldKey: "context" },
      capabilities: ["edit-repeater-item", "edit-text"],
      maxLength: 160,
    },
    {
      id: "item-rating",
      label: "Valoración del testimonio",
      kind: "repeater-item",
      source: { kind: "section-repeater-item", fieldKey: "items", itemFieldKey: "rating" },
      capabilities: ["edit-repeater-item", "edit-number"],
    },
  ],
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const items = context.settings.items;
    if (!items.length) return safeHtml("");
    const trackId = `catalog-testimonials-track-${context.section.id}`;
    const controls =
      context.project.commerceTemplates.designFamily === "catalog-modern-v2"
        ? ""
        : `<div class="catalog-testimonials-controls" role="group" aria-label="${escapeAttribute(context.project.publicCopy.accessibility.testimonialsControls)}"><button type="button" data-testimonials-prev aria-controls="${escapeAttribute(trackId)}" aria-label="${escapeAttribute(context.project.publicCopy.accessibility.previousTestimonial)}">←</button><button type="button" data-testimonials-next aria-controls="${escapeAttribute(trackId)}" aria-label="${escapeAttribute(context.project.publicCopy.accessibility.nextTestimonial)}">→</button></div>`;
    return moduleRoot(
      "catalog-testimonials",
      context.section,
      safeHtml(
        `<div class="catalog-testimonials-section"><header><h2${canvasTextAttributes(canvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</h2>${controls}</header><div id="${escapeAttribute(trackId)}" class="catalog-testimonials-track" data-motion-zone="items" aria-label="${escapeAttribute(context.project.publicCopy.accessibility.testimonials)}" role="region" tabindex="0">${items.map((item) => `<article class="catalog-testimonial"><p class="catalog-testimonial-rating"${canvasRepeaterItemAttributes(canvasContext(context), "item-rating", item.id)} aria-label="${item.rating} de 5">${"★".repeat(item.rating)}</p><h3${canvasRepeaterItemAttributes(canvasContext(context), "item-author", item.id)}>${escapeHtml(item.author)}</h3>${item.context ? `<p class="catalog-testimonial-context"${canvasRepeaterItemAttributes(canvasContext(context), "item-context", item.id)}>${escapeHtml(item.context)}</p>` : ""}<blockquote${canvasRepeaterItemAttributes(canvasContext(context), "item-body", item.id)}>“${escapeHtml(item.body)}”</blockquote></article>`).join("")}</div></div>`,
      ),
    );
  },
};

const newsletterSettings = z.object({
  title: z.string().default("Recibí las próximas novedades"),
  body: z.string().default("Escribinos y te avisamos cuando llegue una nueva selección."),
  actionLabel: z.string().default("Escribir por WhatsApp"),
  actionHref: z.string().default("#contact-form"),
});

export const catalogNewsletterCta: ModuleDefinition<
  "catalog-newsletter-cta",
  z.infer<typeof newsletterSettings>
> = {
  manifest: modernManifest({
    id: "catalog-newsletter-cta",
    name: "CTA de novedades",
    description: "Bloque final de contacto sin formulario falso.",
    slots: ["content", "trust", "footer"],
    compatibleSettings: ["title", "body", "actionLabel", "actionHref"],
  }),
  settingsSchema: newsletterSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "body", type: "text", label: "Texto" },
    { key: "actionLabel", type: "text", label: "Botón" },
    { key: "actionHref", type: "url", label: "Destino" },
  ],
  motionZones: modernRevealZone,
  canvasBindings: [
    textBinding("title", "Título de novedades", "title", 120),
    textBinding("body", "Texto de novedades", "body", 300),
    textBinding("actionLabel", "Texto del enlace", "actionLabel", 100),
    {
      id: "actionHref",
      label: "Destino del enlace",
      kind: "link",
      source: { kind: "section-setting", fieldKey: "actionHref" },
      capabilities: ["edit-link"],
    },
  ],
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const configuredActionHref = safeUrl(context.settings.actionHref);
    const actionHref =
      context.project.commerceTemplates.designFamily === "catalog-modern-v2" &&
      (configuredActionHref === "#contact-form" ||
        /^\/(contacto|nosotros|compra|envios|devoluciones)\/?$/i.test(configuredActionHref))
        ? "/#contact-form"
        : configuredActionHref;
    const configuredActionLabel = context.settings.actionLabel.trim();
    const actionLabel =
      (/^\/contacto\/?$/i.test(actionHref) ||
        actionHref === "#contact-form" ||
        actionHref === "/#contact-form") &&
      configuredActionLabel.toLowerCase() === "escribir por whatsapp"
        ? context.project.publicCopy.contact.optionsAction
        : configuredActionLabel || context.project.publicCopy.contact.optionsAction;
    return moduleRoot(
      "catalog-newsletter-cta",
      context.section,
      safeHtml(
        `<div class="catalog-newsletter-inner" data-motion-zone="content"><div><h2${canvasTextAttributes(canvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</h2><p${canvasTextAttributes(canvasContext(context), "body", 300)}>${escapeHtml(context.settings.body)}</p></div><a class="catalog-newsletter-action" href="${escapeAttribute(actionHref)}"${canvasTextAttributes(canvasContext(context), "actionHref")}><span${canvasTextAttributes(canvasContext(context), "actionLabel", 100)}>${escapeHtml(actionLabel)}</span></a></div>`,
      ),
      { ariaLabel: "Novedades" },
    );
  },
};

const modernFooterSettings = z.object({
  note: z.string().default(""),
  showPolicies: z.boolean().default(true),
  instagramUrl: z.string().default(""),
  facebookUrl: z.string().default(""),
  googleUrl: z.string().default(""),
});

export const catalogFooter: ModuleDefinition<
  "catalog-footer",
  z.infer<typeof modernFooterSettings>
> = {
  manifest: modernManifest({
    id: "catalog-footer",
    name: "Footer de catálogo",
    description: "Footer comercial con marca, enlaces y contacto.",
    slots: ["footer"],
    compatibleSettings: ["note", "showPolicies", "instagramUrl", "facebookUrl", "googleUrl"],
  }),
  settingsSchema: modernFooterSettings,
  settingsFields: [
    { key: "note", type: "text", label: "Descripción" },
    { key: "showPolicies", type: "boolean", label: "Mostrar políticas" },
    { key: "instagramUrl", type: "text", label: "Instagram" },
    { key: "facebookUrl", type: "text", label: "Facebook" },
    { key: "googleUrl", type: "text", label: "Google" },
  ],
  motionZones: modernRevealZone,
  canvasBindings: [
    textBinding("note", "Descripción del footer", "note", 300),
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
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const isV2 = context.project.commerceTemplates.designFamily === "catalog-modern-v2";
    const policyLinks = context.settings.showPolicies
      ? isV2
        ? `<a href="/privacidad/">${escapeHtml(copy.footer.privacy)}</a><a href="/terminos/">${escapeHtml(copy.footer.terms)}</a>`
        : `<a href="/envios/">${escapeHtml(copy.footer.shipping)}</a><a href="/devoluciones/">${escapeHtml(copy.footer.returns)}</a><a href="/privacidad/">${escapeHtml(copy.footer.privacy)}</a><a href="/terminos/">${escapeHtml(copy.footer.terms)}</a>`
      : "";
    const note = context.settings.note || context.project.identity.description;
    const socialLinks = [
      context.settings.instagramUrl
        ? `<a href="${escapeAttribute(context.settings.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a>`
        : "",
      context.settings.facebookUrl
        ? `<a href="${escapeAttribute(context.settings.facebookUrl)}" target="_blank" rel="noopener noreferrer">Facebook</a>`
        : "",
      context.settings.googleUrl
        ? `<a href="${escapeAttribute(context.settings.googleUrl)}" target="_blank" rel="noopener noreferrer">Google</a>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const rawWhatsapp = (context.project.whatsapp.phone ?? "").replace(/\D/g, "");
    const placeholderDigits = CATALOG_MODERN_PLACEHOLDER_PHONE.replace(/\D/g, "");
    const hasWhatsapp = rawWhatsapp.length >= 8 && rawWhatsapp !== placeholderDigits;
    const whatsappDisplay = formatPublicWhatsAppPhone(context.project.whatsapp.phone ?? "");
    const whatsappAction = hasWhatsapp
      ? `<a class="catalog-footer-whatsapp" href="https://wa.me/${escapeAttribute(rawWhatsapp)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(copy.contact.whatsappAction)}</span><span aria-hidden="true">→</span></a>`
      : "";
    const contact = [
      context.project.identity.email
        ? `<a href="mailto:${escapeAttribute(context.project.identity.email)}">${escapeHtml(context.project.identity.email)}</a>`
        : "",
      hasWhatsapp
        ? `<a href="https://wa.me/${escapeAttribute(rawWhatsapp)}" target="_blank" rel="noopener noreferrer">${escapeHtml(whatsappDisplay)}</a>`
        : "",
      context.project.identity.phone
        ? `<a href="tel:${escapeAttribute(context.project.identity.phone)}">${escapeHtml(context.project.identity.phone)}</a>`
        : "",
      context.project.identity.address
        ? `<span>${escapeHtml(context.project.identity.address)}</span>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const publicCategories = context.project.categories.filter(
      (category) => category.status !== "hidden",
    );
    const categoryLinks = publicCategories
      .map(
        (category) =>
          `<a href="/categorias/${escapeAttribute(category.slug)}/">${escapeHtml(category.title)}</a>`,
      )
      .join("");
    const categoriesNav = publicCategories.length
      ? `<nav class="catalog-footer-nav catalog-footer-nav--categories" aria-label="${escapeAttribute(copy.navigation.catalog)}"><strong>${escapeHtml(copy.navigation.catalog)}</strong>${categoryLinks}</nav>`
      : "";
    const searchEnabled =
      context.project.navigation.showSearch && context.project.commerceTemplates.search.enabled;
    const searchLink = searchEnabled
      ? `<a href="/buscar/">${escapeHtml(copy.navigation.search)}</a>`
      : "";
    const cartEnabled =
      context.project.siteShell.cart &&
      (context.project.commerceTemplates.cart.enabled ||
        context.project.commerceTemplates.checkout.enabled);
    const openCartLink = cartEnabled
      ? `<a class="catalog-footer-cart-link" href="/carrito/" data-solara-cart-open data-open-cart data-cart-label="${escapeAttribute(copy.navigation.cart)}" aria-controls="solara-cart" aria-expanded="false" aria-haspopup="dialog">${escapeHtml(copy.navigation.cart)}</a>`
      : "";
    const helpPageLinks = "";
    const productListLink = `<a href="/listado/">${escapeHtml(copy.productList.title)}</a>`;
    return moduleRoot(
      "catalog-footer",
      context.section,
      safeHtml(
        `<div class="catalog-footer-inner" data-motion-zone="content"><div class="catalog-footer-brand"><a class="catalog-brand" href="/">${renderBrand(context.project, canvasContext(context))}</a><p${canvasTextAttributes(canvasContext(context), "note", 300)}>${escapeHtml(note)}</p>${whatsappAction}</div><nav class="catalog-footer-nav catalog-footer-nav--explore" aria-label="${escapeAttribute(copy.footer.explore)}"><strong>${escapeHtml(copy.footer.explore)}</strong><a href="/">${escapeHtml(copy.navigation.home)}</a>${productListLink}${searchLink}${openCartLink}</nav>${categoriesNav}<nav class="catalog-footer-nav catalog-footer-nav--help" aria-label="${escapeAttribute(copy.footer.help)}"><strong>${escapeHtml(copy.footer.help)}</strong>${helpPageLinks}${policyLinks}</nav><address class="catalog-footer-contact"><strong>${escapeHtml(copy.footer.contact)}</strong>${contact}${socialLinks}</address><div class="catalog-footer-meta"><small>© ${new Date(context.project.updatedAt).getUTCFullYear()} ${escapeHtml(context.project.identity.brandName)}. ${escapeHtml(copy.footer.copyright)}</small><p class="catalog-footer-made"><a href="https://solara.com.ar" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.footer.madeWith)}</a></p></div></div>`,
      ),
      { tag: "footer" },
    );
  },
};

const modernCartSettings = z.object({
  title: z.string().default("Tu carrito"),
  emptyText: z.string().default("Todavía no agregaste productos."),
  checkoutLabel: z.string().default("Continuar por WhatsApp"),
});

export const catalogCartDrawer: ModuleDefinition<
  "catalog-cart-drawer",
  z.infer<typeof modernCartSettings>
> = {
  manifest: modernManifest({
    id: "catalog-cart-drawer",
    name: "Carrito moderno",
    description: "Drawer accesible para revisar el pedido y continuar por WhatsApp.",
    slots: ["cart"],
    compatibleSettings: ["title", "emptyText", "checkoutLabel"],
  }),
  settingsSchema: modernCartSettings,
  settingsFields: [
    { key: "title", type: "text", label: "Título" },
    { key: "emptyText", type: "text", label: "Mensaje de carrito vacío" },
    { key: "checkoutLabel", type: "text", label: "Texto de checkout" },
  ],
  motionZones: modernRevealZone,
  canvasBindings: [
    textBinding("title", "Título del carrito", "title", 120),
    textBinding("emptyText", "Mensaje de carrito vacío", "emptyText", 240),
    textBinding("checkoutLabel", "Texto de checkout", "checkoutLabel", 120),
  ],
  clientAsset: "storefront-cart" as AssetId,
  styleAsset: scopedAssetId("catalog-modern"),
  render(context) {
    const copy = context.project.publicCopy;
    const checkoutVerificationMarkup = `<p data-order-verification-warning role="note">${escapeHtml(copy.checkout.verificationWarning)}</p>`;
    return moduleRoot(
      "catalog-cart-drawer",
      context.section,
      safeHtml(
        `<div class="solara-cart-backdrop catalog-cart-backdrop" data-solara-cart-close data-close-cart hidden></div><aside id="solara-cart" class="catalog-cart-drawer" data-cart-drawer data-cart-step="review" role="dialog" aria-label="${escapeAttribute(context.settings.title)}" aria-modal="true" aria-hidden="true" inert tabindex="-1"><header><div class="catalog-cart-heading"><span class="catalog-cart-step-label"><span data-cart-review-label>${escapeHtml(copy.checkout.selection)}</span><span data-cart-checkout-label>${escapeHtml(copy.checkout.submit)}</span></span><h2${canvasTextAttributes(canvasContext(context), "title", 120)}>${escapeHtml(context.settings.title)}</h2></div><button type="button" data-solara-cart-close data-close-cart aria-label="${escapeAttribute(copy.cart.close)}">${escapeHtml(copy.navigation.close)}</button></header><section id="catalog-cart-review" class="catalog-cart-review" data-cart-review-panel aria-hidden="false"><div class="catalog-cart-scroll"><div class="catalog-cart-items" data-solara-cart-items data-cart-lines><p class="catalog-empty"${canvasTextAttributes(canvasContext(context), "emptyText", 240)}>${escapeHtml(context.settings.emptyText || copy.empty.cart)}</p></div></div><div class="catalog-cart-summary"><p><span>${escapeHtml(copy.cart.subtotal)}</span><strong data-cart-subtotal aria-live="polite">${escapeHtml(formatMoneyForProject(0, context.project))}</strong></p><p><span>${escapeHtml(copy.cart.delivery)}</span><strong>${escapeHtml(copy.cart.deliveryToCoordinate)}</strong></p><p class="catalog-cart-total"><span>${escapeHtml(copy.cart.estimatedTotal)}</span><strong data-solara-cart-total data-cart-total aria-live="polite">${escapeHtml(formatMoneyForProject(0, context.project))}</strong></p></div></section><section id="catalog-cart-checkout" class="catalog-cart-checkout-panel" data-cart-checkout-panel aria-hidden="true" hidden inert><button class="catalog-cart-review-back" type="button" data-cart-review-back aria-controls="catalog-cart-review">← ${escapeHtml(copy.checkout.selection)}</button><p class="catalog-cart-checkout-intro">${escapeHtml(copy.checkout.prepare)}</p><form class="catalog-checkout-form" data-solara-checkout data-checkout-form id="catalog-drawer-checkout"><label for="catalog-drawer-name">${escapeHtml(copy.cart.name)}</label><input id="catalog-drawer-name" name="name" autocomplete="name" required><label for="catalog-drawer-phone">${escapeHtml(copy.cart.phone)}</label><input id="catalog-drawer-phone" name="phone" autocomplete="tel" inputmode="tel" pattern="[\\d\\+\\(\\)\\- ]{8,}" title="${escapeAttribute(copy.cart.phoneInvalid)}" required><label for="catalog-drawer-address">${escapeHtml(copy.cart.address)}</label><textarea id="catalog-drawer-address" name="address" autocomplete="street-address" required></textarea><label for="catalog-drawer-locality">${escapeHtml(copy.cart.locality)}</label><input id="catalog-drawer-locality" name="locality" autocomplete="address-level2" required><label for="catalog-drawer-postal-code">${escapeHtml(copy.cart.postalCode)}</label><input id="catalog-drawer-postal-code" name="postalCode" autocomplete="postal-code" required><label for="catalog-drawer-notes">${escapeHtml(copy.cart.notes)}</label><textarea id="catalog-drawer-notes" name="notes"></textarea><pre data-order-preview aria-live="polite" role="status"></pre></form></section><div class="catalog-drawer-footer"><button class="catalog-primary-action" type="button" data-cart-checkout-next aria-controls="catalog-cart-checkout">${escapeHtml(copy.checkout.continue)}</button><button class="catalog-primary-action" type="submit" form="catalog-drawer-checkout" data-cart-checkout-submit${canvasTextAttributes(canvasContext(context), "checkoutLabel", 120)}>${escapeHtml(context.settings.checkoutLabel)}</button>${checkoutVerificationMarkup}</div></aside>`,
      ),
    );
  },
};

export const catalogModernModules = [
  catalogAnnouncement,
  catalogHeader,
  catalogHero,
  catalogBrandStrip,
  catalogProductGrid,
  catalogProductDetail,
  catalogCategoryBento,
  catalogTestimonials,
  catalogNewsletterCta,
  catalogCartDrawer,
  catalogFooter,
] as const;
