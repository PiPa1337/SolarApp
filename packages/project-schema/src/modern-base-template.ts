import {
  IMAGE_ASSET_RECIPE,
  isValidIcoDataUrl,
  type StoreProjectV2,
  type StoreSection,
  StoreProjectV2Schema,
} from "./index";
import { defaultHomeContactSections } from "./catalog-modern-contact";
import { MODERN_BASE_TEMPLATE_MEDIA } from "./modern-base-template-media";

/** Revisión de contenido independiente de schemaVersion. */
export const MODERN_BASE_TEMPLATE_CONTENT_VERSION = 2 as const;

const FIXED_DATE = "2026-09-16T00:00:00.000Z";
const BASE_ID = "store-modo-sur-demo";
const BASE_NAME = "Predeterminado";
const BASE_SLUG = "demo-catalogo-jerarquico";
const BASE_URL = "https://demo-catalogo-jerarquico.example";

// La selección es fija para que la derivación desde RM sea auditable. Estos
// slugs sólo documentan la fuente de selección; nunca se persisten en la base.
export const MODERN_BASE_TEMPLATE_SOURCE_SLUGS = [
  "caja-microcorrugada-empanadas",
  "caja-microcorrugada-hamburguesa-con-papas",
  "pote-bisagra-pet-1150-zaplast-350cc-x-100",
  "pote-micro-pp-work-250cc-x-100-u",
  "vaso-traslucido-amcor-300cc-x-100",
  "sorbete-flexible-color-en-blister-x-100-u",
  "bolsa-camiseta-30x40-cm-mamut-blanca",
  "bolsa-consorcio-45x60-x-10-u",
  "bolsa-de-papel-kraft-n1",
  "bolsa-polipropileno-20x30-x-100-u",
  "bolsa-rinon-fantasia-terlizzi-15x20-cm-x-50-u",
  "bolsa-kraft-con-manija-rubi-22x10x24",
  "banda-elastica-40mm-bag-x-100g",
  "bobina-de-papel-kraft-40cm-x-kilo",
  "cinta-adhesiva-48x40-auca",
  "film-pvc-15m-x-30cm-por-unidad",
  "rollo-papel-termico-80x30",
  "mangas-reposteras-n5-x-10-u",
  "molde-de-rosca-22cm-hores-x-100",
  "molde-pan-dulce-fantasia-500g-hores-x-100",
  "molde-para-budin-300g-hores-x-100",
  "pirotin-fantasia-n4-x-1000",
  "bandeja-101-pp-gualco-x-50-con-tapa",
  "bandeja-de-carton-blanca-n3",
  "bandeja-expandido-eco-618-x-100",
  "bandeja-redonda-de-carton-n13",
  "plato-de-aluminio-alpac-p26",
  "plato-dorado-new-24-cm",
  "guantes-de-polietileno-caja-x-200-u",
  "guantes-nitrilo-medium-azul-x-100",
  "cuchara-blanca-koval-x-50-u",
  "tenedor-blanco-koval-x-50-u",
  "toalla-en-rollo-blanca-fenix-eco-20x200-pack-x-4",
] as const;

const CATEGORY_BLUEPRINTS = [
  ["hogar", "Hogar"],
  ["cocina", "Cocina"],
  ["decoracion", "Decoración"],
  ["textiles", "Textiles"],
  ["organizacion", "Organización"],
  ["limpieza", "Limpieza"],
] as const;

const PRODUCT_CATEGORY_INDEX = [
  0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4,
  4, 4, 4, 4, 5, 5, 5, 5, 5,
] as const;

const VARIANT_BLUEPRINTS: Record<number, Array<{ title: string; optionValues: Record<string, string>; priceDelta: number }>> = {
  2: [
    { title: "Medida estándar", optionValues: { Medida: "Estándar" }, priceDelta: 0 },
    { title: "Medida grande", optionValues: { Medida: "Grande" }, priceDelta: 20000 },
  ],
  4: [
    { title: "Pack de 1 unidad", optionValues: { Pack: "1 unidad" }, priceDelta: 0 },
    { title: "Pack de 5 unidades", optionValues: { Pack: "5 unidades" }, priceDelta: 30000 },
  ],
  7: [
    { title: "Color claro", optionValues: { Color: "Claro" }, priceDelta: 0 },
    { title: "Color oscuro", optionValues: { Color: "Oscuro" }, priceDelta: 15000 },
  ],
  11: [
    { title: "Medida estándar", optionValues: { Medida: "Estándar" }, priceDelta: 0 },
    { title: "Medida grande", optionValues: { Medida: "Grande" }, priceDelta: 25000 },
  ],
  15: [
    { title: "Pack de 1 unidad", optionValues: { Pack: "1 unidad" }, priceDelta: 0 },
    { title: "Pack de 3 unidades", optionValues: { Pack: "3 unidades" }, priceDelta: 22000 },
  ],
  22: [
    { title: "Medida estándar", optionValues: { Medida: "Estándar" }, priceDelta: 0 },
    { title: "Medida grande", optionValues: { Medida: "Grande" }, priceDelta: 18000 },
  ],
  28: [
    { title: "Color claro", optionValues: { Color: "Claro" }, priceDelta: 0 },
    { title: "Color oscuro", optionValues: { Color: "Oscuro" }, priceDelta: 12000 },
  ],
  33: [
    { title: "Pack de 1 unidad", optionValues: { Pack: "1 unidad" }, priceDelta: 0 },
    { title: "Pack de 4 unidades", optionValues: { Pack: "4 unidades" }, priceDelta: 26000 },
  ],
};

function motion(preset: StoreSection["motion"]["preset"]): StoreSection["motion"] {
  return {
    preset,
    intensity: preset === "none" ? 0 : 4,
    direction: "up",
    distance: preset === "none" ? 0 : 18,
    duration: preset === "none" ? 0 : 0.45,
    delay: 0,
    stagger: preset === "stagger" ? 0.08 : 0,
    easing: "cubic-bezier(.16,1,.3,1)",
    entryPoint: 0.2,
    once: true,
  };
}

function imageAsset(
  id: string,
  name: string,
  alt: string,
  mediaKey: keyof typeof MODERN_BASE_TEMPLATE_MEDIA,
){
  const media = MODERN_BASE_TEMPLATE_MEDIA[mediaKey];
  return {
    kind: "image",
    id,
    name,
    alt,
    mimeType: "image/webp",
    optimizationRecipe: IMAGE_ASSET_RECIPE,
    source: media.source,
    fallbackSource: media.fallbackSource,
    responsiveSources: media.responsiveSources,
    width: media.width,
    height: media.height,
    hash: `template-${id}`,
  };
}

function faviconAsset() {
  const media = MODERN_BASE_TEMPLATE_MEDIA.favicon;
  return {
    kind: "image",
    id: "asset-template-favicon",
    name: "Favicon de plantilla",
    alt: "Imagen de ejemplo para reemplazar",
    mimeType: "image/x-icon",
    optimizationRecipe: IMAGE_ASSET_RECIPE,
    source: media.source,
    fallbackSource: media.fallbackSource,
    responsiveSources: media.responsiveSources,
    width: media.width,
    height: media.height,
    hash: "template-asset-template-favicon",
  };
}

function templateAssets() {
  return [
    imageAsset(
      "asset-template-product",
      "Imagen de plantilla - producto",
      "Imagen de ejemplo para reemplazar",
      "product",
    ),
    imageAsset(
      "asset-template-category",
      "Imagen de plantilla - categoría",
      "Imagen de ejemplo para reemplazar",
      "category",
    ),
    imageAsset(
      "asset-template-hero",
      "Imagen de plantilla - portada",
      "Imagen de ejemplo para reemplazar",
      "hero",
    ),
    imageAsset(
      "asset-template-social",
      "Imagen de plantilla - social",
      "Imagen de ejemplo para reemplazar",
      "social",
    ),
    faviconAsset(),
  ];
}

function templateProducts(categories: readonly { id: string; slug: string }[], date: string) {
  return MODERN_BASE_TEMPLATE_SOURCE_SLUGS.map((_, index) => {
    const number = index + 1;
    const categoryIndex = PRODUCT_CATEGORY_INDEX[index] ?? 0;
    const category = categories[categoryIndex];
    if (!category) throw new Error(`Falta la categoría base ${categoryIndex + 1}.`);
    const basePrice = 129900 + index * 17500;
    const variants = (VARIANT_BLUEPRINTS[number] ?? [
      { title: "Única", optionValues: {}, priceDelta: 0 },
    ]).map((blueprint, variantIndex) => {
      const price = basePrice + blueprint.priceDelta;
      const available = !(number === 11 && variantIndex === 1);
      return {
        id: `variant-template-${String(number).padStart(2, "0")}-${String(variantIndex + 1).padStart(2, "0")}`,
        sku: `TPL-PRD-${String(number).padStart(2, "0")}-V${String(variantIndex + 1).padStart(2, "0")}`,
        title: blueprint.title,
        optionValues: blueprint.optionValues,
        price,
        ...(number % 4 === 0 && variantIndex === 0 ? { compareAtPrice: price + 30000 } : {}),
        available,
        stockStatus: available ? "in_stock" as const : "out_of_stock" as const,
        imageId: "asset-template-product",
      };
    });
    return {
      id: `product-template-${String(number).padStart(2, "0")}`,
      slug: `producto-${String(number).padStart(2, "0")}`,
      title: `Producto ${String(number).padStart(2, "0")}`,
      description: `Descripcion del producto ${String(number).padStart(2, "0")}.`,
      status: "active" as const,
      brand: "Marca de ejemplo",
      categoryIds: [category.id],
      collectionIds: [],
      tags: [category.slug, "producto-ejemplo"],
      imageIds: ["asset-template-product"],
      videoIds: [],
      variants,
      createdAt: date,
      updatedAt: date,
    };
  });
}

function templateCategories() {
  return CATEGORY_BLUEPRINTS.map(([slug, title], index) => ({
    id: `category-template-${String(index + 1).padStart(2, "0")}`,
    slug,
    title,
    description: `Descripcion de la categoria ${String(index + 1).padStart(2, "0")}.`,
    status: "active" as const,
    imageId: "asset-template-category",
    productIds: [],
  }));
}

function templateSections() {
  return [
    {
      id: "modo-section-announcement",
      slot: "announcement",
      moduleId: "catalog-announcement",
      enabled: true,
      settings: { text: "Tu tienda online, lista para empezar.", linkLabel: "", linkHref: "" },
      motion: motion("none"),
    },
    {
      id: "modo-section-header",
      slot: "header",
      moduleId: "catalog-header",
      enabled: true,
      settings: { cartLabel: "Carrito", searchLabel: "Buscar productos" },
      motion: motion("none"),
    },
    {
      id: "modo-section-hero",
      slot: "hero",
      moduleId: "catalog-hero",
      enabled: true,
      settings: {
        mode: "image",
        eyebrow: "Tu nueva colección",
        title: "Una tienda hecha para tu marca.",
        body: "Cargá tus productos, imágenes y textos para empezar a vender.",
        actionLabel: "Ver productos",
        actionHref: "/buscar/",
        secondaryActionLabel: "Contacto",
        secondaryActionHref: "#contact-form",
        posterAssetId: "asset-template-hero",
        videoAssetId: "",
        backgroundImageId: "asset-template-hero",
        backgroundDarkness: 24,
        benefitIconRadius: 8,
        slides: [],
        autoplay: false,
        intervalMs: 6000,
        showCatalogStats: true,
      },
      motion: motion("fade-up"),
    },
    {
      id: "modo-section-brands",
      slot: "content",
      moduleId: "catalog-brand-strip",
      enabled: false,
      settings: { title: "Marcas", limit: 5 },
      motion: motion("fade-up"),
    },
    {
      id: "modo-section-new",
      slot: "catalog",
      moduleId: "catalog-product-grid",
      enabled: true,
      settings: {
        title: "Productos",
        source: "all",
        sourceId: "",
        limit: 12,
        showRating: false,
        showViewAll: true,
        viewAllHref: "/buscar/",
      },
      motion: motion("stagger"),
    },
    {
      id: "modo-section-top",
      slot: "catalog",
      moduleId: "catalog-product-grid",
      enabled: true,
      settings: {
        title: "Más productos",
        source: "all",
        sourceId: "",
        limit: 8,
        showRating: false,
        showViewAll: true,
        viewAllHref: "/buscar/",
      },
      motion: motion("stagger"),
    },
    {
      id: "modo-section-categories",
      slot: "catalog",
      moduleId: "catalog-category-bento",
      enabled: true,
      settings: { title: "Categorías", items: [] },
      motion: motion("stagger"),
    },
    {
      id: "modo-section-testimonials",
      slot: "trust",
      moduleId: "catalog-testimonials",
      enabled: false,
      settings: { title: "Testimonios", items: [] },
      motion: motion("none"),
    },
    {
      id: "modo-section-newsletter",
      slot: "content",
      moduleId: "catalog-newsletter-cta",
      enabled: true,
      settings: {
        title: "Sección editable",
        body: "Seccion de novedades editable.",
        actionLabel: "Contacto",
        actionHref: "#contact-form",
      },
      motion: motion("none"),
    },
    ...defaultHomeContactSections(),
    {
      id: "modo-section-cart",
      slot: "cart",
      moduleId: "catalog-cart-drawer",
      enabled: true,
      settings: {},
      motion: motion("none"),
    },
    {
      id: "modo-section-footer",
      slot: "footer",
      moduleId: "catalog-footer",
      enabled: true,
      settings: { note: "Nota del pie editable.", showPolicies: true },
      motion: motion("none"),
    },
  ];
}

export interface ModernBaseTemplateOptions {
  id?: string;
  name?: string;
  slug?: string;
  baseUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Construye la única fuente de la plantilla protegida y de los clones nuevos. */
export function buildModernBaseTemplateProject(options: ModernBaseTemplateOptions = {}): StoreProjectV2 {
  const createdAt = options.createdAt ?? FIXED_DATE;
  const updatedAt = options.updatedAt ?? createdAt;
  const categories = templateCategories();
  const products = templateProducts(categories, createdAt);
  const categoriesWithProducts = categories.map((category) => ({
    ...category,
    productIds: products
      .filter((product) => product.categoryIds.includes(category.id))
      .map((product) => product.id),
  }));
  const assets = templateAssets();
  return StoreProjectV2Schema.parse({
    schemaVersion: 2,
    id: options.id ?? BASE_ID,
    name: options.name?.trim() || BASE_NAME,
    slug: options.slug ?? BASE_SLUG,
    status: "active",
    locale: "es-AR",
    currency: "ARS",
    priceFractionDisplay: "always",
    baseUrl: options.baseUrl ?? BASE_URL,
    createdAt,
    updatedAt,
    origin: {
      templateId: "catalog-modern",
      templateVersion: 2,
      seed: "placeholder",
      role: "base-template",
      updatePolicy: "pinned",
    },
    identity: {
      legalName: "Razon social",
      brandName: "Mi tienda",
      description: "Descripcion corta de tu tienda.",
      email: "",
      phone: "",
      address: "",
      instagramUrl: "",
      facebookUrl: "",
      tiktokUrl: "",
      twitterHandle: "",
    },
    whatsapp: {
      phone: "",
      greeting: "Hola {storeName}, quiero hacer este pedido:",
      includeSku: true,
    },
    seo: {
      title: "Mi tienda",
      description: "Descripcion SEO de tu tienda.",
      searchConsoleVerification: "",
      merchantVerification: "",
      faviconAssetId: "asset-template-favicon",
      socialImageId: "asset-template-social",
    },
    theme: {
      colors: {
        background: "#f7f5f0",
        surface: "#e9e5dd",
        text: "#11110f",
        muted: "#6d6961",
        accent: "#a63d2f",
        accentText: "#ffffff",
        border: "#d8d2c7",
      },
      typography: {
        display: "Georgia, serif",
        body: "system-ui, sans-serif",
        scale: 1,
        lineHeightTight: 1.1,
        lineHeightBody: 1.6,
        letterSpacingDisplay: "-0.02em",
        fontWeightDisplay: 500,
        fontWeightBody: 400,
      },
      spacingScale: 1,
      radius: 2,
      container: 1760,
    },
    navigation: {
      catalogLabel: "Categorías",
      items: [],
      mode: "automatic",
      showHome: true,
      showSearch: true,
      showCart: true,
    },
    siteShell: { announcement: true, header: true, footer: true, cart: true },
    pages: [
      {
        id: "page-home",
        kind: "home",
        slug: "inicio",
        title: "Titulo del hero",
        seoTitle: "Mi tienda",
        seoDescription: "Descripcion SEO de tu tienda.",
        sections: [],
      },
    ],
    commerceTemplates: {
      designFamily: "catalog-modern-v2",
      category: { productsPerPage: 24 },
      search: { enabled: true },
      product: { showRelated: true },
      cart: { enabled: true },
      checkout: { enabled: true },
    },
    policies: {
      shipping: {
        summary: "Información de entrega pendiente.",
        details: "Completá las condiciones de entrega de tu tienda.",
        countries: ["AR"],
        handlingDaysMin: 1,
        handlingDaysMax: 3,
        transitDaysMin: 2,
        transitDaysMax: 7,
        returnDays: 10,
      },
      returns: {
        summary: "Condiciones de cambio pendientes.",
        details: "Completá las condiciones de cambio de tu tienda.",
        countries: ["AR"],
        handlingDaysMin: 1,
        handlingDaysMax: 3,
        transitDaysMin: 2,
        transitDaysMax: 7,
        returnDays: 10,
      },
      privacy: "Completá la política de privacidad de tu tienda.",
      terms: "Completá los términos de tu tienda.",
      countryNames: { AR: "Argentina" },
    },
    products,
    categories: categoriesWithProducts,
    collections: [],
    assets,
    videos: [],
    sections: templateSections(),
  });
}

export function isModernBaseTemplateContent(project: StoreProjectV2): boolean {
  const optimizedRasterAsset = (id: string, width: number, height: number): boolean => {
    const asset = project.assets.find((candidate) => candidate.id === id);
    if (!asset) return false;
    if (asset.mimeType !== "image/webp" && asset.mimeType !== "image/avif") return false;
    if (!/^data:image\/(?:webp|avif);base64,/i.test(asset.source)) return false;
    if (!/^data:image\/(?:jpeg|png);base64,/i.test(asset.fallbackSource ?? "")) return false;
    if (asset.width !== width || asset.height !== height) return false;
    const responsive = asset.responsiveSources ?? [];
    const widths = responsive.map((source) => source.width);
    if (!widths.includes(768) || !widths.includes(width)) return false;
    return responsive.every((source) =>
      /^data:image\/(?:webp|avif);base64,/i.test(source.source),
    );
  };
  const favicon = project.assets.find((candidate) => candidate.id === "asset-template-favicon");
  const optimizedFavicon =
    favicon?.mimeType === "image/x-icon" &&
    isValidIcoDataUrl(favicon.source) &&
    /^data:image\/png;base64,/i.test(favicon.fallbackSource ?? "") &&
    favicon.width === 32 &&
    favicon.height === 32 &&
    favicon.responsiveSources?.some(
      (source) => source.width === 32 && /^data:image\/png;base64,/i.test(source.source),
    ) === true;
  return (
    project.id === BASE_ID &&
    project.origin?.templateId === "catalog-modern" &&
    project.origin.role === "base-template" &&
    project.origin.updatePolicy === "pinned" &&
    project.origin.seed === "placeholder" &&
    project.commerceTemplates.designFamily === "catalog-modern-v2" &&
    project.products.length === 33 &&
    project.categories.length === 6 &&
    project.collections.length === 0 &&
    project.assets.length === 5 &&
    optimizedRasterAsset("asset-template-product", 1254, 1254) &&
    optimizedRasterAsset("asset-template-category", 1200, 900) &&
    optimizedRasterAsset("asset-template-hero", 1800, 1200) &&
    optimizedRasterAsset("asset-template-social", 1200, 628) &&
    optimizedFavicon &&
    project.sections.findIndex((section) => section.moduleId === "contact-form") <
      project.sections.findIndex((section) => section.moduleId === "catalog-footer") &&
    project.sections.at(-1)?.moduleId === "catalog-footer" &&
    project.sections.some(
      (section) =>
        section.id === "modo-section-cart" &&
        section.moduleId === "catalog-cart-drawer" &&
        section.enabled,
    )
  );
}

/** Reemplaza sólo el contenido reservado y conserva identidad de ruta/tiempo. */
export function replaceModernBaseTemplateContent(
  project: StoreProjectV2,
  options: Pick<ModernBaseTemplateOptions, "updatedAt"> = {},
): StoreProjectV2 {
  const name = project.name.trim() || BASE_NAME;
  return buildModernBaseTemplateProject({
    id: BASE_ID,
    name,
    slug: project.slug,
    baseUrl: project.baseUrl,
    createdAt: project.createdAt,
    updatedAt: options.updatedAt ?? project.updatedAt,
  });
}
