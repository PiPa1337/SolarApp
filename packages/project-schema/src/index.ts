/**
 * Contrato persistido de una tienda. Zod es la autoridad para IDs, referencias,
 * jerarquía, assets, páginas y schemaVersion; exporter, core y Studio importan
 * estos tipos para evitar modelos paralelos.
 */
import { z } from "zod";
import {
  categoryAncestorIds,
  categoryDescendantIds,
  categoryProductIds,
} from "./category-helpers.js";
import { ARGENTINA_LEGAL_PROFILE, LegalProfileSchema } from "./legal-profile.js";
import {
  compactResponsiveSources,
  IMAGE_ASSET_RECIPE,
  IMAGE_ASSET_RECIPE_V2,
  ImageAssetSchema,
  isValidIco,
  isValidIcoDataUrl,
  MediaAssetSchema,
  RESPONSIVE_IMAGE_INTERMEDIATE_WIDTH,
  RESPONSIVE_IMAGE_MAX_WIDTH,
  RESPONSIVE_IMAGE_WIDTHS,
  responsiveImageWidths,
  VideoAssetSchema,
} from "./media.js";
import { PUBLIC_COPY_DEFAULTS } from "./public-copy-defaults.js";
import {
  DEFAULT_THEME_TEXT_SHADOW_BLUR,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_X,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y,
  DEFAULT_THEME_TEXT_SHADOW_OPACITY,
  buildThemeTextShadow,
  THEME_TEXT_SHADOW_BLUR_MAX,
  THEME_TEXT_SHADOW_BLUR_MIN,
  THEME_TEXT_SHADOW_DIRECTION_MAX,
  THEME_TEXT_SHADOW_DIRECTION_MIN,
  THEME_TEXT_SHADOW_OFFSET_MAX,
  THEME_TEXT_SHADOW_OFFSET_MIN,
} from "./theme-text-shadow.js";

export {
  compactResponsiveSources,
  IMAGE_ASSET_RECIPE,
  IMAGE_ASSET_RECIPE_V2,
  ImageAssetSchema,
  isValidIco,
  isValidIcoDataUrl,
  MediaAssetSchema,
  RESPONSIVE_IMAGE_INTERMEDIATE_WIDTH,
  RESPONSIVE_IMAGE_MAX_WIDTH,
  RESPONSIVE_IMAGE_WIDTHS,
  responsiveImageWidths,
  VideoAssetSchema,
};

export { PUBLIC_COPY_DEFAULTS };
export {
  ARGENTINA_LEGAL_PROFILE,
  formatLegalCountryCoverage,
  formatLegalRevisionAt,
  LegalProfileSchema,
  resolveLegalCountryName,
  resolveLegalRevisionAt,
  unresolvedLegalCountryCodes,
} from "./legal-profile.js";

import {
  AssetIdSchema,
  CategoryIdSchema,
  CollectionIdSchema,
  MoneySchema,
  ProductIdSchema,
  SectionIdSchema,
  StoreIdSchema,
  VariantIdSchema,
} from "./ids.js";

export {
  AssetIdSchema,
  CategoryIdSchema,
  CollectionIdSchema,
  MoneySchema,
  ProductIdSchema,
  SectionIdSchema,
  StoreIdSchema,
  VariantIdSchema,
};

const WINDOWS_RESERVED_SLUGS = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

export const SlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((value) => !WINDOWS_RESERVED_SLUGS.has(value.toLowerCase()), {
    message:
      "El slug usa un nombre reservado del sistema (Windows). Elegí otro nombre para la ruta.",
  })
  .brand<"Slug">();

export type StoreId = z.infer<typeof StoreIdSchema>;
export type ProductId = z.infer<typeof ProductIdSchema>;
export type VariantId = z.infer<typeof VariantIdSchema>;
export type CategoryId = z.infer<typeof CategoryIdSchema>;
export type CollectionId = z.infer<typeof CollectionIdSchema>;
export type SectionId = z.infer<typeof SectionIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type Slug = z.infer<typeof SlugSchema>;

export const NavigationItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(80),
  href: z.string().optional(),
  children: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(80),
        href: z.string().optional(),
      }),
    )
    .max(12)
    .optional(),
});

export const NavigationConfigSchema = z.object({
  catalogLabel: z.string().min(1).max(40).default("Colecciones"),
  items: z.array(NavigationItemSchema).max(20).default([]),
  mode: z.enum(["automatic", "curated"]).default("curated"),
  showHome: z.boolean().default(true),
  showSearch: z.boolean().default(true),
  showCart: z.boolean().default(true),
});

export const PublicCopySchema = z.object({
  navigation: z
    .object({
      home: z.string().min(1).default("Inicio"),
      catalog: z.string().min(1).default("Categorías"),
      contact: z.string().min(1).default("Contacto"),
      about: z.string().min(1).default("Nosotros"),
      search: z.string().min(1).default("Buscar productos"),
      cart: z.string().min(1).default("Carrito"),
      viewAll: z.string().min(1).default("Ver todos los productos"),
      openMenu: z.string().min(1).default("Abrir menú"),
      closeMenu: z.string().min(1).default("Cerrar menú"),
      close: z.string().min(1).default("Cerrar"),
    })
    .default(PUBLIC_COPY_DEFAULTS.navigation),
  search: z
    .object({
      title: z.string().min(1).default("Buscar productos"),
      placeholder: z.string().min(1).default("Buscar productos..."),
      queryLabel: z.string().min(1).default("Buscá por nombre, marca, categoría o etiqueta."),
      submit: z.string().min(1).default("Buscar"),
      close: z.string().min(1).default("Cerrar búsqueda"),
      empty: z.string().min(1).default("Elegí una búsqueda"),
      queryTooShort: z.string().min(1).default("Escribí al menos 2 caracteres para buscar."),
      loading: z.string().min(1).default("Cargando resultados…"),
      noResults: z.string().min(1).default("No encontramos productos para esa búsqueda."),
      suggestion: z
        .string()
        .min(1)
        .default("No encontramos resultados para “{query}”. ¿Quisiste decir"),
      error: z.string().min(1).default("No se pudo cargar la búsqueda. Intentá nuevamente."),
    })
    .default(PUBLIC_COPY_DEFAULTS.search),
  filters: z
    .object({
      title: z.string().min(1).default("Filtros"),
      availability: z.string().min(1).default("Disponibilidad"),
      availableOnly: z.string().min(1).default("Sólo disponibles"),
      tag: z.string().min(1).default("Etiqueta"),
      filterByTag: z.string().min(1).default("Filtrar por etiqueta"),
      all: z.string().min(1).default("Todas"),
      price: z.string().min(1).default("Precio"),
      minimum: z.string().min(1).default("Mínimo"),
      maximum: z.string().min(1).default("Máximo"),
      sort: z.string().min(1).default("Ordenar"),
      recommended: z.string().min(1).default("Recomendados"),
      priceAsc: z.string().min(1).default("Precio menor"),
      priceDesc: z.string().min(1).default("Precio mayor"),
      name: z.string().min(1).default("Nombre"),
      resultCount: z.string().min(1).default("productos"),
    })
    .default(PUBLIC_COPY_DEFAULTS.filters),
  hero: z
    .object({
      benefits: z.string().min(1).default("Beneficios"),
      activeProducts: z.string().min(1).default("productos activos"),
      categories: z.string().min(1).default("categorías"),
      whatsapp: z.string().min(1).default("WhatsApp"),
      contact: z.string().min(1).default("Contacto"),
      directOrder: z.string().min(1).default("pedido directo"),
      inquiries: z.string().min(1).default("consultas"),
      whatsappAction: z.string().min(1).default("Escribir por WhatsApp"),
      pauseVideo: z.string().min(1).default("Pausar video"),
      resumeVideo: z.string().min(1).default("Reanudar video"),
      slidePrev: z.string().min(1).default("Slide anterior"),
      slideNext: z.string().min(1).default("Slide siguiente"),
    })
    .default(PUBLIC_COPY_DEFAULTS.hero),
  product: z
    .object({
      available: z.string().min(1).default("Disponible"),
      outOfStock: z.string().min(1).default("Agotado"),
      from: z.string().min(1).default("Desde"),
      variant: z.string().min(1).default("Variante"),
      quantity: z.string().min(1).default("Cantidad"),
      sku: z.string().min(1).default("SKU"),
      availability: z.string().min(1).default("Disponibilidad"),
      details: z.string().min(1).default("Detalles"),
      policies: z.string().min(1).default("Envíos y cambios"),
      shipping: z.string().min(1).default("Envíos"),
      returns: z.string().min(1).default("Cambios y devoluciones"),
      askWhatsApp: z.string().min(1).default("Consultar por WhatsApp"),
      addToCart: z.string().min(1).default("Agregar al carrito"),
      noStock: z.string().min(1).default("Sin stock"),
      related: z.string().min(1).default("También puede interesarte"),
      options: z.string().min(1).default("Opciones del producto"),
      reviews: z.string().min(1).default("Reseñas"),
      reviewEyebrow: z.string().min(1).default("Experiencias reales"),
      reviewTitle: z.string().min(1).default("Lo que dicen quienes compraron"),
      verifiedPurchase: z.string().min(1).default("Compra verificada"),
    })
    .default(PUBLIC_COPY_DEFAULTS.product),
  contact: z
    .object({
      whatsappFallback: z
        .string()
        .min(1)
        .default("Configurá un teléfono de WhatsApp para recibir consultas."),
      emailFallback: z.string().min(1).default("Configurá un email para recibir consultas."),
      emailAction: z.string().min(1).default("Enviar consulta por email"),
      success: z.string().min(1).default("Listo"),
      reasonLabel: z.string().min(1).default("Tema de consulta"),
      optionsAction: z.string().min(1).default("Ver opciones de contacto"),
      email: z.string().min(1).default("Email"),
      phone: z.string().min(1).default("Teléfono"),
      whatsapp: z.string().min(1).default("WhatsApp"),
      address: z.string().min(1).default("Dirección"),
      hours: z.string().min(1).default("Horarios de atención"),
      directions: z.string().min(1).default("Cómo llegar"),
      javascriptFallback: z
        .string()
        .min(1)
        .default("Activá JavaScript o usá los enlaces para enviar la consulta."),
      whatsappAction: z.string().min(1).default("Escribir por WhatsApp"),
      reason: z.string().min(1).default("Motivo"),
      orderNumber: z.string().min(1).default("Número de pedido"),
      message: z.string().min(1).default("Mensaje"),
      emailSubject: z.string().min(1).default("Consulta para {storeName}"),
    })
    .default(PUBLIC_COPY_DEFAULTS.contact),
  cart: z
    .object({
      close: z.string().min(1).default("Cerrar carrito"),
      continueShopping: z.string().min(1).default("Seguir comprando"),
      subtotal: z.string().min(1).default("Subtotal"),
      delivery: z.string().min(1).default("Entrega"),
      deliveryToCoordinate: z.string().min(1).default("A coordinar"),
      estimatedTotal: z.string().min(1).default("Total estimado"),
      name: z.string().min(1).default("Nombre"),
      phone: z.string().min(1).default("Teléfono"),
      address: z.string().min(1).default("Dirección o punto de entrega"),
      locality: z.string().min(1).default("Localidad / Provincia"),
      postalCode: z.string().min(1).default("Código postal"),
      notes: z.string().min(1).default("Notas opcionales"),
      remove: z.string().min(1).default("Eliminar"),
      unavailable: z.string().min(1).default("Ya no disponible"),
      exploreCategories: z.string().min(1).default("Explorar categorías"),
      phoneInvalid: z.string().min(1).default("Ingresá un teléfono válido"),
    })
    .default(PUBLIC_COPY_DEFAULTS.cart),
  checkout: z
    .object({
      submit: z.string().min(1).default("Preparar pedido"),
      sendWhatsApp: z.string().min(1).default("Enviar pedido en WhatsApp"),
      coordinate: z.string().min(1).default("Escribinos para coordinar"),
      continue: z.string().min(1).default("Continuar a compra"),
      summary: z.string().min(1).default("Resumen del pedido"),
      selection: z.string().min(1).default("Tu selección"),
      prepare: z
        .string()
        .min(1)
        .default("Prepará el pedido para revisar productos y total antes de abrir WhatsApp."),
      invalidItems: z
        .string()
        .min(1)
        .default("Retirá los productos no disponibles del carrito antes de enviar el pedido."),
      emptyCart: z
        .string()
        .min(1)
        .default("Tu carrito está vacío: agregá productos antes de preparar el pedido."),
      total: z.string().min(1).default("Total estimado"),
      delivery: z.string().min(1).default("Entrega"),
      verificationWarning: z
        .string()
        .min(1)
        .default(
          "Solicitud sin confirmar; precio, stock, envío y pago deben verificarse con la tienda",
        ),
      disclaimer: z
        .string()
        .min(1)
        .default("Entiendo que precio, disponibilidad, envío y pago se confirman por este medio."),
    })
    .default(PUBLIC_COPY_DEFAULTS.checkout),
  footer: z
    .object({
      explore: z.string().min(1).default("Explorar"),
      help: z.string().min(1).default("Ayuda"),
      contact: z.string().min(1).default("Contacto"),
      policies: z.string().min(1).default("Políticas"),
      shipping: z.string().min(1).default("Envíos"),
      returns: z.string().min(1).default("Cambios"),
      privacy: z.string().min(1).default("Privacidad"),
      terms: z.string().min(1).default("Términos"),
      copyright: z.string().min(1).default("Todos los derechos reservados."),
      madeWith: z.string().min(1).default("Hecho con ❤️ en solara.com.ar"),
    })
    .default(PUBLIC_COPY_DEFAULTS.footer),
  empty: z
    .object({
      products: z.string().min(1).default("No hay productos para mostrar."),
      collections: z.string().min(1).default("Todavía no hay colecciones publicadas."),
      cart: z.string().min(1).default("Tu carrito está vacío."),
      categories: z.string().min(1).default("Todavía no hay categorías para mostrar."),
      page: z.string().min(1).default("No hay contenido publicado."),
      filteredProducts: z
        .string()
        .min(1)
        .default("No hay productos que coincidan con estos filtros."),
    })
    .default(PUBLIC_COPY_DEFAULTS.empty),
  errors: z
    .object({
      catalogLoad: z.string().min(1).default("No se pudo cargar el catálogo."),
      searchIndexLoad: z.string().min(1).default("No se pudo cargar el índice de búsqueda."),
    })
    .default(PUBLIC_COPY_DEFAULTS.errors),
  pages: z
    .object({
      home: z.string().min(1).default("Inicio"),
      catalog: z.string().min(1).default("Catálogo"),
      products: z.string().min(1).default("Productos"),
      categories: z.string().min(1).default("Categorías"),
      search: z.string().min(1).default("Buscar"),
      cart: z.string().min(1).default("Carrito"),
      shipping: z.string().min(1).default("Envíos"),
      returns: z.string().min(1).default("Cambios y devoluciones"),
      privacy: z.string().min(1).default("Privacidad"),
      terms: z.string().min(1).default("Términos"),
      notFound: z.string().min(1).default("Página no encontrada"),
      notFoundEyebrow: z.string().min(1).default("Página no encontrada"),
      notFoundTitle: z.string().min(1).default("No encontramos esa página."),
      notFoundDescription: z
        .string()
        .min(1)
        .default("Podés volver al inicio o explorar nuestras colecciones."),
      returnHome: z.string().min(1).default("Volver al inicio"),
      viewCategories: z.string().min(1).default("Ver categorías"),
      shippingDeliveryInfo: z.string().min(1).default("Información de entrega"),
      shippingPreparation: z.string().min(1).default("Preparación del pedido"),
      shippingTransit: z.string().min(1).default("Tiempo estimado de tránsito"),
      policyCoverage: z.string().min(1).default("Cobertura"),
      returnsConditions: z.string().min(1).default("Condiciones de cambio"),
      returnsInformedPeriod: z.string().min(1).default("Plazo informado"),
      privacyDataUsage: z.string().min(1).default("Uso de tus datos"),
      privacyDescription: z
        .string()
        .min(1)
        .default("Cómo usamos los datos compartidos al realizar un pedido."),
      termsSubtitle: z.string().min(1).default("Información vigente para coordinar una compra."),
      termsDescription: z.string().min(1).default("Condiciones comerciales de la tienda."),
    })
    .default(PUBLIC_COPY_DEFAULTS.pages),
  whatsapp: z
    .object({
      ask: z.string().min(1).default("Hola {storeName}, quiero hacer una consulta."),
      purchase: z.string().min(1).default("Hola {storeName}, quiero coordinar una compra."),
      orderGreeting: z.string().min(1).default("Hola {storeName}, quiero hacer este pedido:"),
      product: z.string().min(1).default("Producto"),
      variant: z.string().min(1).default("Variante"),
      price: z.string().min(1).default("Precio"),
      total: z.string().min(1).default("Total estimado"),
      customerName: z.string().min(1).default("Nombre"),
      customerPhone: z.string().min(1).default("Teléfono"),
      delivery: z.string().min(1).default("Entrega"),
      notes: z.string().min(1).default("Notas"),
      confirmation: z
        .string()
        .min(1)
        .default("Entiendo que precio, disponibilidad, envío y pago se confirman por este medio."),
    })
    .default(PUBLIC_COPY_DEFAULTS.whatsapp),
  export: z
    .object({
      skipToContent: z.string().min(1).default("Ir al contenido"),
      breadcrumbs: z.string().min(1).default("Migas de pan"),
      pagination: z.string().min(1).default("Paginación"),
      previous: z.string().min(1).default("Anterior"),
      next: z.string().min(1).default("Siguiente"),
      pageOf: z.string().min(1).default("Página {page} de {total}"),
      categoryChildren: z.string().min(1).default("Subcategorías de {category}"),
      exploreCategory: z.string().min(1).default("Explorar {category}"),
      categoryProducts: z.string().min(1).default("productos"),
      viewCollection: z.string().min(1).default("Ver colección"),
      viewImage: z.string().min(1).default("Ver imagen {index}"),
      variantLinks: z.string().min(1).default("Enlaces directos a variantes"),
      policyDetailsTitle: z.string().min(1).default("Qué necesitás saber"),
      policyQuestionsTitle: z.string().min(1).default("¿Tenés dudas?"),
      policyQuestionsBody: z
        .string()
        .min(1)
        .default("Escribinos antes de coordinar tu pedido y revisamos esta información con vos."),
    })
    .default(PUBLIC_COPY_DEFAULTS.export),
  accessibility: z
    .object({
      benefits: z.string().min(1).default("Beneficios"),
      productInfo: z.string().min(1).default("Información del producto"),
      catalogSummary: z.string().min(1).default("Resumen del catálogo"),
      mobileNavigation: z.string().min(1).default("Navegación móvil"),
      mainNavigation: z.string().min(1).default("Navegación principal"),
      announcements: z.string().min(1).default("Avisos"),
      testimonials: z.string().min(1).default("Testimonios de clientes"),
      testimonialsControls: z.string().min(1).default("Controles de testimonios"),
      previousTestimonial: z.string().min(1).default("Testimonio anterior"),
      nextTestimonial: z.string().min(1).default("Testimonio siguiente"),
      heroSlides: z.string().min(1).default("Slides del hero"),
      goToSlide: z.string().min(1).default("Ir al slide {index}"),
    })
    .default(PUBLIC_COPY_DEFAULTS.accessibility),
});

export type PublicCopy = z.infer<typeof PublicCopySchema>;

export const EditablePageSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("home"),
  slug: SlugSchema,
  title: z.string().min(1),
  seoTitle: z.string().min(1).max(70),
  seoDescription: z.string().min(1).max(180),
  sections: z.array(z.lazy(() => StoreSectionSchema)).default([]),
});

export const CommerceTemplatesSchema = z.object({
  designFamily: z
    .enum(["legacy-editorial-v1", "catalog-modern-v1", "catalog-modern-v2"])
    .optional(),
  category: z
    .object({ productsPerPage: z.number().int().min(1).max(48).default(24) })
    .default({ productsPerPage: 24 }),
  search: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
  product: z.object({ showRelated: z.boolean().default(true) }).default({ showRelated: true }),
  cart: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
  checkout: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
});

export const SiteShellSchema = z.object({
  announcement: z.boolean().default(true),
  header: z.boolean().default(true),
  footer: z.boolean().default(true),
  cart: z.boolean().default(true),
});

export const ProjectOriginSchema = z
  .object({
    templateId: z.literal("catalog-modern"),
    templateVersion: z.number().int().positive(),
    seed: z.enum(["clean", "demo", "duplicate", "placeholder"]),
    // Los dos campos son opcionales para aceptar respaldos V2 anteriores. La
    // política de mutabilidad aplica una compatibilidad explícita para esos
    // respaldos antes de permitir una escritura.
    role: z.enum(["base-template", "store"]).optional(),
    updatePolicy: z.enum(["managed", "pinned"]).optional(),
  })
  .optional();

export const VariantSchema = z.object({
  id: VariantIdSchema,
  sku: z.string(),
  title: z.string().min(1),
  optionValues: z.record(z.string(), z.string()),
  price: MoneySchema,
  compareAtPrice: MoneySchema.optional(),
  available: z.boolean(),
  stockStatus: z.enum(["in_stock", "out_of_stock", "preorder"]),
  gtin: z.string().optional(),
  mpn: z.string().optional(),
  availabilityDate: z.string().datetime().optional(),
  imageId: AssetIdSchema.optional(),
});

export const ProductReviewSchema = z.object({
  id: z.string().min(1),
  authorName: z.string().min(1).max(120),
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(1000),
  rating: z.number().int().min(1).max(5),
  publishedAt: z.string().datetime(),
  verifiedPurchase: z.boolean(),
  origin: z.enum(["example", "merchant"]),
  visible: z.boolean(),
});

export const ProductSchema = z.object({
  id: ProductIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string(),
  richDescription: z.string().optional(),
  status: z.enum(["active", "hidden", "archived"]),
  brand: z.string(),
  categoryIds: z.array(CategoryIdSchema),
  collectionIds: z.array(CollectionIdSchema),
  tags: z.array(z.string()),
  imageIds: z.array(AssetIdSchema),
  videoIds: z.array(AssetIdSchema).max(3).default([]),
  variants: z.array(VariantSchema).min(1),
  reviews: z.array(ProductReviewSchema).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CategorySchema = z.object({
  id: CategoryIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string(),
  // "hidden" retira la categoría de la navegación automática y del listado
  // público sin borrar su historial de productos (retrocompatible: default
  // "active", sin bump de schemaVersion).
  status: z.enum(["active", "hidden"]).default("active"),
  // Texto editorial extendido para SEO (200-300 palabras recomendadas).
  seoIntro: z.string().max(4000).optional(),
  imageId: AssetIdSchema.optional(),
  parentId: CategoryIdSchema.optional(),
  productIds: z.array(ProductIdSchema),
});

export const CollectionSchema = z.object({
  id: CollectionIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
  description: z.string(),
  status: z.enum(["active", "hidden"]).default("active"),
  imageId: AssetIdSchema.optional(),
  productIds: z.array(ProductIdSchema),
});

export const MotionPresetSchema = z.enum([
  "none",
  "fade",
  "fade-up",
  "slide",
  "scale",
  "stagger",
  "parallax",
  "scroll-progress",
  "layer-stack",
]);

export const MotionSettingsSchema = z.object({
  preset: MotionPresetSchema,
  intensity: z.number().min(0).max(10),
  direction: z.enum(["up", "down", "left", "right"]),
  distance: z.number().min(0).max(160),
  duration: z.number().min(0).max(5),
  delay: z.number().min(0).max(5),
  stagger: z.number().min(0).max(2),
  easing: z.string().min(1),
  entryPoint: z.number().min(0).max(1),
  once: z.boolean(),
});

export const StoreSectionSchema = z.object({
  id: SectionIdSchema,
  slot: z.enum([
    "announcement",
    "header",
    "hero",
    "catalog",
    "product",
    "content",
    "trust",
    "cart",
    "footer",
  ]),
  moduleId: z.string().min(1),
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  motion: MotionSettingsSchema,
});

export const ThemeColorsSchema = z.object({
  background: z.string(),
  surface: z.string(),
  text: z.string(),
  muted: z.string(),
  accent: z.string(),
  accentText: z.string(),
  /** Optional for old projects; the exporter derives a theme-aware fallback. */
  accentAlt: z.string().optional(),
  border: z.string(),
  sale: z.string().default("#d94a55"),
  rating: z.string().default("#d99a12"),
});

export const ThemeTypographySchema = z.object({
  display: z.string(),
  body: z.string(),
  scale: z.number().min(0.8).max(1.4),
  lineHeightTight: z.number().min(0.9).max(2).default(1.15),
  lineHeightBody: z.number().min(1).max(2.5).default(1.6),
  letterSpacingDisplay: z.string().default("-0.02em"),
  fontWeightDisplay: z.number().int().min(300).max(900).default(500),
  fontWeightBody: z.number().int().min(300).max(900).default(400),
});

export const ThemeSpacingSchema = z.object({
  sectionY: z.string().default("clamp(3rem, 6vw, 6rem)"),
  cardGap: z.string().default("clamp(1rem, 2vw, 2rem)"),
  containerPaddingX: z.string().default("1rem"),
});

export const ThemeTextShadowSchema = z.object({
  enabled: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(DEFAULT_THEME_TEXT_SHADOW_OPACITY),
  offsetX: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_OFFSET_MIN)
    .max(THEME_TEXT_SHADOW_OFFSET_MAX)
    .default(DEFAULT_THEME_TEXT_SHADOW_OFFSET_X),
  offsetY: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_OFFSET_MIN)
    .max(THEME_TEXT_SHADOW_OFFSET_MAX)
    .default(DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y),
  // Campos opcionales para que los respaldos existentes sigan usando offsetX/offsetY.
  offsetTop: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_DIRECTION_MIN)
    .max(THEME_TEXT_SHADOW_DIRECTION_MAX)
    .optional(),
  offsetRight: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_DIRECTION_MIN)
    .max(THEME_TEXT_SHADOW_DIRECTION_MAX)
    .optional(),
  offsetBottom: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_DIRECTION_MIN)
    .max(THEME_TEXT_SHADOW_DIRECTION_MAX)
    .optional(),
  offsetLeft: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_DIRECTION_MIN)
    .max(THEME_TEXT_SHADOW_DIRECTION_MAX)
    .optional(),
  blur: z
    .number()
    .int()
    .min(THEME_TEXT_SHADOW_BLUR_MIN)
    .max(THEME_TEXT_SHADOW_BLUR_MAX)
    .default(DEFAULT_THEME_TEXT_SHADOW_BLUR),
});

export const ThemeShadowsSchema = z.object({
  card: z.string().default("none"),
  elevated: z.string().default("none"),
  overlay: z.string().default("0 24px 70px rgba(0,0,0,.14)"),
  text: ThemeTextShadowSchema.optional(),
});

export const ThemeBordersSchema = z.object({
  width: z.string().default("1px"),
  style: z.enum(["solid", "dashed", "none"]).default("solid"),
});

export const ThemeMotionSchema = z.object({
  durationFast: z.string().default("150ms"),
  durationNormal: z.string().default("280ms"),
  easing: z.string().default("cubic-bezier(.16,1,.3,1)"),
});

/**
 * Fondo con imagen por tienda (opcional, no rompe persistencia: ausente por
 * defecto). `size` admite el mismo vocabulario que background-size CSS pero
 * sin caracteres de control, para no inyectar reglas ajenas.
 */
export const ThemeBackgroundSchema = z.object({
  imageAssetId: AssetIdSchema,
  repeat: z.enum(["repeat", "repeat-x", "repeat-y", "no-repeat"]).default("repeat"),
  size: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9%. ,/()-]+$/)
    .default("480px"),
  opacity: z.number().min(0).max(1).default(1),
});

export const ThemeSchema = z.object({
  colors: ThemeColorsSchema,
  typography: ThemeTypographySchema,
  spacingScale: z.number().min(0.75).max(1.5),
  spacing: ThemeSpacingSchema.optional(),
  shadows: ThemeShadowsSchema.optional(),
  borders: ThemeBordersSchema.optional(),
  motion: ThemeMotionSchema.optional(),
  background: ThemeBackgroundSchema.optional(),
  radius: z.number().min(0).max(40),
  container: z.number().int().min(960).max(1800),
});

export const CommercePolicySchema = z.object({
  summary: z.string(),
  details: z.string(),
  countries: z.array(z.string().length(2)),
  handlingDaysMin: z.number().int().nonnegative(),
  handlingDaysMax: z.number().int().nonnegative(),
  transitDaysMin: z.number().int().nonnegative(),
  transitDaysMax: z.number().int().nonnegative(),
  returnDays: z.number().int().nonnegative(),
});

export const PriceFractionDisplaySchema = z.enum(["always", "auto"]).default("always");
export type PriceFractionDisplay = z.infer<typeof PriceFractionDisplaySchema>;

const StoreProjectV2ShapeSchema = z.object({
  schemaVersion: z.literal(2),
  id: StoreIdSchema,
  name: z.string().min(1),
  slug: SlugSchema,
  status: z.enum(["active", "archived"]),
  locale: z.literal("es-AR"),
  currency: z.literal("ARS"),
  priceFractionDisplay: PriceFractionDisplaySchema,
  baseUrl: z.string().url(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  origin: ProjectOriginSchema,
  publicCopy: PublicCopySchema.default(PUBLIC_COPY_DEFAULTS),
  legalProfile: LegalProfileSchema.default({
    countryCode: ARGENTINA_LEGAL_PROFILE.countryCode,
    taxId: "",
    jurisdiction: "",
    paymentMethods: [],
    salesChannels: [],
    consumerRights: { enabled: true },
    privacyOverride: "",
    termsOverride: "",
  }),
  identity: z.object({
    legalName: z.string().min(1),
    brandName: z.string().min(1),
    description: z.string(),
    logoAssetId: AssetIdSchema.optional(),
    email: z.string().email().or(z.literal("")),
    phone: z.string(),
    address: z.string(),
    // Redes sociales para sameAs (JSON-LD) y links de footer. URLs absolutas.
    instagramUrl: z.string().url().or(z.literal("")).default(""),
    facebookUrl: z.string().url().or(z.literal("")).default(""),
    tiktokUrl: z.string().url().or(z.literal("")).default(""),
    twitterHandle: z
      .string()
      .regex(/^@?[a-zA-Z0-9_]{0,15}$/)
      .default(""),
  }),
  whatsapp: z.object({
    // A clean project has no WhatsApp number yet; configured numbers remain
    // strict international digits without a leading plus sign.
    phone: z.string().regex(/^(?:\d{8,15})?$/),
    greeting: z.string(),
    includeSku: z.boolean(),
  }),
  seo: z.object({
    title: z.string().min(1).max(70),
    description: z.string().min(1).max(180),
    searchConsoleVerification: z.string(),
    merchantVerification: z.string(),
    faviconAssetId: AssetIdSchema.optional(),
    socialImageId: AssetIdSchema.optional(),
  }),
  theme: ThemeSchema,
  navigation: NavigationConfigSchema.default({
    catalogLabel: "Colecciones",
    items: [],
    mode: "curated",
    showHome: true,
    showSearch: true,
    showCart: true,
  }),
  siteShell: SiteShellSchema.default({
    announcement: true,
    header: true,
    footer: true,
    cart: true,
  }),
  pages: z.array(EditablePageSchema).default([]),
  commerceTemplates: CommerceTemplatesSchema.default({
    category: { productsPerPage: 24 },
    search: { enabled: true },
    product: { showRelated: true },
    cart: { enabled: true },
    checkout: { enabled: true },
  }),
  policies: z.object({
    shipping: CommercePolicySchema,
    returns: CommercePolicySchema,
    privacy: z.string(),
    terms: z.string(),
    countryNames: z.record(z.string(), z.string()).default({ AR: "Argentina" }),
  }),
  products: z.array(ProductSchema),
  categories: z.array(CategorySchema),
  collections: z.array(CollectionSchema),
  assets: z.array(ImageAssetSchema),
  videos: z.array(VideoAssetSchema).default([]),
  sections: z.array(StoreSectionSchema),
});

function addDuplicateIssues(
  values: readonly string[],
  path: Array<string | number>,
  label: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message: `${label} duplicado: ${value}.`,
        path: [...path, index],
      });
    }
    seen.add(value);
  });
}

function addMissingReferenceIssue(
  exists: boolean,
  path: Array<string | number>,
  label: string,
  value: string,
  context: z.RefinementCtx,
): void {
  if (exists) return;
  context.addIssue({
    code: "custom",
    message: `${label} inexistente: ${value}.`,
    path,
  });
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightMembers = new Set(right);
  return left.every((value) => rightMembers.has(value));
}

export const StoreProjectV2Schema = StoreProjectV2ShapeSchema.superRefine((project, context) => {
  addDuplicateIssues(
    project.products.map((product) => product.id),
    ["products"],
    "ID de producto",
    context,
  );
  addDuplicateIssues(
    project.products.map((product) => product.slug),
    ["products"],
    "Slug de producto",
    context,
  );
  addDuplicateIssues(
    project.categories.map((category) => category.id),
    ["categories"],
    "ID de categoría",
    context,
  );
  addDuplicateIssues(
    project.categories.map((category) => category.slug),
    ["categories"],
    "Slug de categoría",
    context,
  );
  addDuplicateIssues(
    project.collections.map((collection) => collection.id),
    ["collections"],
    "ID de colección",
    context,
  );
  addDuplicateIssues(
    project.collections.map((collection) => collection.slug),
    ["collections"],
    "Slug de colección",
    context,
  );
  addDuplicateIssues(
    project.assets.map((asset) => asset.id),
    ["assets"],
    "ID de recurso",
    context,
  );
  addDuplicateIssues(
    project.videos.map((asset) => asset.id),
    ["videos"],
    "ID de video",
    context,
  );
  const editablePageSections = project.pages.flatMap((page) => page.sections);
  addDuplicateIssues(
    [...project.sections, ...editablePageSections].map((section) => section.id),
    ["sections"],
    "ID de sección",
    context,
  );

  const variantIds = project.products.flatMap((product) =>
    product.variants.map((variant) => variant.id),
  );
  addDuplicateIssues(variantIds, ["products"], "ID de variante", context);

  const categoryIds = new Set(project.categories.map((category) => category.id));
  const collectionIds = new Set(project.collections.map((collection) => collection.id));
  const assetIds = new Set<string>(project.assets.map((asset) => asset.id));
  const mediaIds = new Set([...assetIds, ...project.videos.map((asset) => asset.id)]);

  project.categories.forEach((category, categoryIndex) => {
    if (category.parentId === undefined) return;
    if (!categoryIds.has(category.parentId)) {
      context.addIssue({
        code: "custom",
        message: `El padre de la categoría ${category.id} no existe: ${category.parentId}.`,
        path: ["categories", categoryIndex, "parentId"],
      });
      return;
    }

    const visited = new Set<string>([category.id]);
    let currentId: string | undefined = category.parentId;
    let depth = 1;
    while (currentId) {
      if (visited.has(currentId)) {
        context.addIssue({
          code: "custom",
          message: `La jerarquía de categorías contiene un ciclo en ${category.id}.`,
          path: ["categories", categoryIndex, "parentId"],
        });
        break;
      }
      visited.add(currentId);
      const parent = project.categories.find((candidate) => candidate.id === currentId);
      if (!parent?.parentId) break;
      depth += 1;
      if (depth > 1) {
        context.addIssue({
          code: "custom",
          message: "Las categorías sólo pueden tener un nivel de subcategorías.",
          path: ["categories", categoryIndex, "parentId"],
        });
        break;
      }
      currentId = parent.parentId;
    }
  });

  project.products.forEach((product, productIndex) => {
    addDuplicateIssues(
      product.categoryIds,
      ["products", productIndex, "categoryIds"],
      `Categoría del producto ${product.id}`,
      context,
    );
    addDuplicateIssues(
      product.collectionIds,
      ["products", productIndex, "collectionIds"],
      `Colección del producto ${product.id}`,
      context,
    );
    addDuplicateIssues(
      product.imageIds,
      ["products", productIndex, "imageIds"],
      `Imagen del producto ${product.id}`,
      context,
    );
    addDuplicateIssues(
      product.videoIds ?? [],
      ["products", productIndex, "videoIds"],
      `Video del producto ${product.id}`,
      context,
    );

    product.categoryIds.forEach((categoryId, referenceIndex) => {
      addMissingReferenceIssue(
        categoryIds.has(categoryId),
        ["products", productIndex, "categoryIds", referenceIndex],
        `Categoría del producto ${product.id}`,
        categoryId,
        context,
      );
    });
    product.collectionIds.forEach((collectionId, referenceIndex) => {
      addMissingReferenceIssue(
        collectionIds.has(collectionId),
        ["products", productIndex, "collectionIds", referenceIndex],
        `Colección del producto ${product.id}`,
        collectionId,
        context,
      );
    });
    product.imageIds.forEach((assetId, referenceIndex) => {
      addMissingReferenceIssue(
        assetIds.has(assetId),
        ["products", productIndex, "imageIds", referenceIndex],
        `Imagen del producto ${product.id}`,
        assetId,
        context,
      );
    });
    (product.videoIds ?? []).forEach((videoId, referenceIndex) => {
      addMissingReferenceIssue(
        project.videos.some((video) => video.id === videoId),
        ["products", productIndex, "videoIds", referenceIndex],
        `Video del producto ${product.id}`,
        videoId,
        context,
      );
    });
    product.variants.forEach((variant, variantIndex) => {
      if (variant.imageId === undefined) return;
      addMissingReferenceIssue(
        assetIds.has(variant.imageId),
        ["products", productIndex, "variants", variantIndex, "imageId"],
        `Imagen de la variante ${variant.id}`,
        variant.imageId,
        context,
      );
    });

    if (Date.parse(product.createdAt) > Date.parse(product.updatedAt)) {
      context.addIssue({
        code: "custom",
        message: `El producto ${product.id} tiene updatedAt anterior a createdAt.`,
        path: ["products", productIndex, "updatedAt"],
      });
    }
  });

  project.videos.forEach((video, videoIndex) => {
    if (video.posterAssetId !== undefined) {
      addMissingReferenceIssue(
        assetIds.has(video.posterAssetId),
        ["videos", videoIndex, "posterAssetId"],
        `Poster del video ${video.id}`,
        video.posterAssetId,
        context,
      );
    }
  });

  const validateSectionMedia = (
    section: z.infer<typeof StoreSectionSchema>,
    path: Array<string | number>,
  ): void => {
    const settings = section.settings;
    for (const key of ["imageId", "posterAssetId"]) {
      const value = settings[key];
      if (typeof value === "string" && value.length > 0) {
        addMissingReferenceIssue(
          assetIds.has(value),
          [...path, "settings", key],
          `Recurso de la sección ${section.id}`,
          value,
          context,
        );
      }
    }
    const videoId = settings.videoAssetId;
    if (typeof videoId === "string" && videoId.length > 0) {
      addMissingReferenceIssue(
        project.videos.some((video) => video.id === videoId),
        [...path, "settings", "videoAssetId"],
        `Video de la sección ${section.id}`,
        videoId,
        context,
      );
    }
    const slides = settings.slides;
    if (Array.isArray(slides)) {
      slides.forEach((slide, slideIndex) => {
        if (typeof slide !== "object" || slide === null) return;
        const imageId = (slide as { imageId?: unknown }).imageId;
        if (typeof imageId !== "string" || imageId.length === 0) return;
        addMissingReferenceIssue(
          assetIds.has(imageId),
          [...path, "settings", "slides", slideIndex, "imageId"],
          `Imagen del slide de la sección ${section.id}`,
          imageId,
          context,
        );
      });
    }
  };

  project.sections.forEach((section, sectionIndex) => {
    validateSectionMedia(section, ["sections", sectionIndex]);
  });
  project.pages.forEach((page, pageIndex) => {
    page.sections.forEach((section, sectionIndex) => {
      validateSectionMedia(section, ["pages", pageIndex, "sections", sectionIndex]);
    });
  });

  const validateNavigation = (
    items: readonly z.infer<typeof NavigationItemSchema>[],
    path: Array<string | number>,
  ): void => {
    const ids = items.map((item) => item.id);
    addDuplicateIssues(ids, path, "ID de navegación", context);
    items.forEach((item, index) => {
      const validateHref = (href: string | undefined, hrefPath: Array<string | number>): void => {
        if (!href) return;
        const internal = href.startsWith("/") && !href.startsWith("//");
        let allowed = internal;
        if (!allowed) {
          try {
            allowed = ["http:", "https:", "mailto:", "tel:"].includes(new URL(href).protocol);
          } catch {
            allowed = false;
          }
        }
        if (!allowed) {
          context.addIssue({
            code: "custom",
            message: "La navegación contiene un enlace inseguro.",
            path: hrefPath,
          });
        }
      };
      validateHref(item.href, [...path, index, "href"]);
      for (const [childIndex, child] of (item.children ?? []).entries()) {
        validateHref(child.href, [...path, index, "children", childIndex, "href"]);
      }
    });
  };
  validateNavigation(project.navigation.items, ["navigation", "items"]);

  const knownPageSlugs = new Set<string>(project.pages.map((page) => page.slug));
  const knownCategorySlugs = new Set<string>(project.categories.map((category) => category.slug));
  const knownCollectionSlugs = new Set<string>(
    project.collections.map((collection) => collection.slug),
  );
  const knownProductSlugs = new Set<string>(
    project.products
      .filter((product) => product.status === "active")
      .map((product) => product.slug),
  );
  const validInternalDestination = (href: string): boolean => {
    if (!href.startsWith("/") || href.startsWith("//")) return true;
    const pathname = href.split(/[?#]/, 1)[0] ?? "/";
    if (pathname === "/") return true;
    if (pathname === "/buscar/") return project.commerceTemplates.search.enabled;
    if (pathname === "/carrito/") return project.commerceTemplates.cart.enabled;
    if (["/envios/", "/devoluciones/", "/privacidad/", "/terminos/"].includes(pathname))
      return true;
    const categoryMatch = /^\/categorias\/([^/]+)\/$/.exec(pathname);
    if (categoryMatch?.[1] && knownCategorySlugs.has(categoryMatch[1])) return true;
    const collectionMatch = /^\/colecciones\/([^/]+)\/$/.exec(pathname);
    if (collectionMatch?.[1] && knownCollectionSlugs.has(collectionMatch[1])) return true;
    const productMatch = /^\/productos\/([^/]+)\/$/.exec(pathname);
    if (productMatch?.[1] && knownProductSlugs.has(productMatch[1])) {
      const variantId = new URLSearchParams(href.split("?")[1] ?? "").get("variant");
      if (!variantId) return true;
      const product = project.products.find((candidate) => candidate.slug === productMatch[1]);
      return Boolean(product?.variants.some((variant) => variant.id === variantId));
    }
    return pathname === "/paginas/" || [...knownPageSlugs].some((slug) => pathname === `/${slug}/`);
  };
  const allNavigationIds = project.navigation.items.flatMap((item) => [
    item.id,
    ...(item.children ?? []).map((child) => child.id),
  ]);
  addDuplicateIssues(allNavigationIds, ["navigation", "items"], "ID de navegación", context);
  const validateNavigationTargets = (
    items: readonly z.infer<typeof NavigationItemSchema>[],
    path: Array<string | number>,
  ): void => {
    items.forEach((item, index) => {
      if (item.href?.startsWith("/") && !validInternalDestination(item.href)) {
        context.addIssue({
          code: "custom",
          message: "El destino interno de navegación no existe en el proyecto.",
          path: [...path, index, "href"],
        });
      }
      if (item.children) validateNavigationTargets(item.children, [...path, index, "children"]);
    });
  };
  validateNavigationTargets(project.navigation.items, ["navigation", "items"]);

  if (project.pages.filter((page) => page.kind === "home").length !== 1) {
    context.addIssue({
      code: "custom",
      message: "El proyecto debe tener exactamente una página home.",
      path: ["pages"],
    });
  }
  addDuplicateIssues(
    project.pages.map((page) => page.id),
    ["pages"],
    "ID de página",
    context,
  );
  addDuplicateIssues(
    project.pages.map((page) => page.slug),
    ["pages"],
    "Slug de página",
    context,
  );

  project.categories.forEach((category, categoryIndex) => {
    addDuplicateIssues(
      category.productIds,
      ["categories", categoryIndex, "productIds"],
      `Producto de la categoría ${category.id}`,
      context,
    );
    const expected = categoryProductIds(project.categories, project.products, category.id);
    if (!sameMembers(category.productIds, expected)) {
      context.addIssue({
        code: "custom",
        message: `La categoría ${category.id} no coincide con las asignaciones de productos.`,
        path: ["categories", categoryIndex, "productIds"],
      });
    }
    if (category.imageId !== undefined) {
      addMissingReferenceIssue(
        assetIds.has(category.imageId),
        ["categories", categoryIndex, "imageId"],
        `Imagen de la categoría ${category.id}`,
        category.imageId,
        context,
      );
    }
  });

  project.collections.forEach((collection, collectionIndex) => {
    addDuplicateIssues(
      collection.productIds,
      ["collections", collectionIndex, "productIds"],
      `Producto de la colección ${collection.id}`,
      context,
    );
    const expected = project.products
      .filter((product) => product.collectionIds.includes(collection.id))
      .map((product) => product.id);
    if (!sameMembers(collection.productIds, expected)) {
      context.addIssue({
        code: "custom",
        message: `La colección ${collection.id} no coincide con las asignaciones de productos.`,
        path: ["collections", collectionIndex, "productIds"],
      });
    }
    if (collection.imageId !== undefined) {
      addMissingReferenceIssue(
        assetIds.has(collection.imageId),
        ["collections", collectionIndex, "imageId"],
        `Imagen de la colección ${collection.id}`,
        collection.imageId,
        context,
      );
    }
  });

  if (project.identity.logoAssetId !== undefined) {
    addMissingReferenceIssue(
      mediaIds.has(project.identity.logoAssetId),
      ["identity", "logoAssetId"],
      "Logo",
      project.identity.logoAssetId,
      context,
    );
  }
  if (project.seo.socialImageId !== undefined) {
    addMissingReferenceIssue(
      mediaIds.has(project.seo.socialImageId),
      ["seo", "socialImageId"],
      "Imagen social",
      project.seo.socialImageId,
      context,
    );
  }
  if (project.seo.faviconAssetId !== undefined) {
    addMissingReferenceIssue(
      mediaIds.has(project.seo.faviconAssetId),
      ["seo", "faviconAssetId"],
      "Favicon",
      project.seo.faviconAssetId,
      context,
    );
  }
  if (project.theme.background !== undefined) {
    addMissingReferenceIssue(
      mediaIds.has(project.theme.background.imageAssetId),
      ["theme", "background", "imageAssetId"],
      "Fondo del tema",
      project.theme.background.imageAssetId,
      context,
    );
  }
  if (Date.parse(project.createdAt) > Date.parse(project.updatedAt)) {
    context.addIssue({
      code: "custom",
      message: "El proyecto tiene updatedAt anterior a createdAt.",
      path: ["updatedAt"],
    });
  }
});

export type ImageAsset = z.infer<typeof ImageAssetSchema>;
export type VideoAsset = z.infer<typeof VideoAssetSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type NavigationItem = z.infer<typeof NavigationItemSchema>;
export type NavigationConfig = z.infer<typeof NavigationConfigSchema>;
export type EditablePage = z.infer<typeof EditablePageSchema>;
export type CommerceTemplates = z.infer<typeof CommerceTemplatesSchema>;
export type SiteShell = z.infer<typeof SiteShellSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type ProductReview = z.infer<typeof ProductReviewSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type MotionSettings = z.infer<typeof MotionSettingsSchema>;
export type StoreSection = z.infer<typeof StoreSectionSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type ProjectOrigin = z.infer<typeof ProjectOriginSchema>;
export type StoreProjectV2 = z.infer<typeof StoreProjectV2Schema>;
// Alias temporal para los paquetes existentes; el contrato persistido ya es v2.
export type StoreProjectV1 = StoreProjectV2;
export const StoreProjectV1Schema = StoreProjectV2Schema;

/**
 * Keeps the default order greeting aligned with the storefront identity while
 * preserving the configured punctuation and the rest of a custom greeting.
 */
export function personalizeWhatsAppGreeting(greeting: string, brandName: string): string {
  const configured = greeting.trim();
  const brand = brandName.trim();
  if (!configured || !brand || !/^hola\b/i.test(configured)) return configured;
  const separator = configured.search(/[,:]/);
  if (separator < 0) {
    return `Hola ${brand}, ${configured.replace(/^hola\s*/i, "").trim()}`.trim();
  }
  return `Hola ${brand}${configured[separator]}${configured.slice(separator + 1)}`.trim();
}

/** Devuelve la cadena raíz-padre sin mutar el proyecto. */
export function getCategoryAncestors(
  project: Pick<StoreProjectV2, "categories">,
  categoryId: CategoryId,
): Category[] {
  const byId = new Map<string, Category>(
    project.categories.map((category) => [category.id, category]),
  );
  return categoryAncestorIds(project.categories, categoryId)
    .map((id) => byId.get(id))
    .filter((category): category is Category => Boolean(category));
}

export function getCategoryDescendants(
  project: Pick<StoreProjectV2, "categories">,
  categoryId: CategoryId,
): Category[] {
  const byId = new Map<string, Category>(
    project.categories.map((category) => [category.id, category]),
  );
  return categoryDescendantIds(project.categories, categoryId)
    .map((id) => byId.get(id))
    .filter((category): category is Category => Boolean(category));
}

/**
 * Resolves direct products plus descendants for a parent category. This is the
 * shared rule used by breadcrumbs, search, exporter and Studio counts.
 */
export function getCategoryProductIds(
  project: Pick<StoreProjectV2, "categories" | "products">,
  categoryId: CategoryId,
): ProductId[] {
  return categoryProductIds(project.categories, project.products, categoryId) as ProductId[];
}

export function getCategoryBreadcrumb(
  project: Pick<StoreProjectV2, "categories">,
  categoryId: CategoryId,
): Category[] {
  const category = project.categories.find((candidate) => candidate.id === categoryId);
  return category ? [...getCategoryAncestors(project, categoryId), category] : [];
}

export * from "./catalog-modern-guidance";
export {
  isProductVideoLightEnough,
  PRODUCT_VIDEO_LONG_DIMENSION,
  PRODUCT_VIDEO_MAX_BYTES,
  PRODUCT_VIDEO_MAX_COUNT,
  PRODUCT_VIDEO_MAX_DIMENSION,
  PRODUCT_VIDEO_RECOMMENDED_SECONDS,
  PRODUCT_VIDEO_SOFT_MAX_SECONDS,
  PRODUCT_VIDEO_TARGET_BYTES,
  productVideoIds,
  productVideos,
  productVideoTarget,
} from "./product-video.js";

const legacyStandalonePath = (href: unknown): string | null => {
  if (typeof href !== "string") return null;
  const pathname = href.split(/[?#]/, 1)[0]?.toLowerCase().replace(/\/$/, "") ?? "";
  if (pathname === "/contacto" || pathname === "/compra") return "contact";
  if (pathname === "/nosotros") return "about";
  return null;
};

function normalizeLegacyStandaloneLinks(value: unknown): unknown {
  if (typeof value === "string") {
    const legacy = legacyStandalonePath(value);
    if (legacy === "contact") return "/#contact-form";
    if (legacy === "about") return "/";
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeLegacyStandaloneLinks);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeLegacyStandaloneLinks(entry)]),
  );
}

/**
 * Lee proyectos v2 históricos y elimina capacidades que dejaron de formar
 * parte del producto: modo de color y páginas independientes editoriales.
 */
function normalizeLegacyProjectInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const normalized = normalizeLegacyStandaloneLinks(input);
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    return normalized;
  }

  const project = { ...(normalized as Record<string, unknown>) };
  if (
    typeof project.theme === "object" &&
    project.theme !== null &&
    !Array.isArray(project.theme)
  ) {
    const {
      colorMode: _colorMode,
      darkColors: _darkColors,
      ...theme
    } = project.theme as Record<string, unknown>;
    project.theme = theme;
  }
  if (
    typeof project.navigation === "object" &&
    project.navigation !== null &&
    !Array.isArray(project.navigation)
  ) {
    const {
      showContact: _showContact,
      showAbout: _showAbout,
      ...navigation
    } = project.navigation as Record<string, unknown>;
    project.navigation = navigation;
  }
  if (Array.isArray(project.pages)) {
    project.pages = project.pages.filter(
      (page) =>
        typeof page === "object" &&
        page !== null &&
        !Array.isArray(page) &&
        (page as Record<string, unknown>).kind === "home",
    );
  }
  return project;
}

/** Valida una entrada desconocida y agrega contexto al error de schema. */
export function parseProject(input: unknown): StoreProjectV2 {
  return StoreProjectV2Schema.parse(normalizeLegacyProjectInput(input));
}

export function migrateProject(input: unknown): StoreProjectV2 {
  if (typeof input !== "object" || input === null) {
    throw new Error("El proyecto no tiene un formato válido.");
  }

  const version = "schemaVersion" in input ? input.schemaVersion : undefined;
  if (version !== 2) {
    throw new Error(`Versión de proyecto incompatible: ${String(version)}.`);
  }

  return parseProject(input);
}

export {
  applyPreset,
  PAO_BLANQUERIA_COLORS,
  THEME_PRESETS,
  type ThemePreset,
} from "./theme-presets.js";
export {
  buildThemeTextShadow,
  DEFAULT_THEME_TEXT_SHADOW_BLUR,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_X,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y,
  DEFAULT_THEME_TEXT_SHADOW_OPACITY,
  deriveThemeTextShadowColor,
  THEME_TEXT_SHADOW_BLUR_MAX,
  THEME_TEXT_SHADOW_BLUR_MIN,
  THEME_TEXT_SHADOW_DIRECTION_MAX,
  THEME_TEXT_SHADOW_DIRECTION_MIN,
  THEME_TEXT_SHADOW_OFFSET_MAX,
  THEME_TEXT_SHADOW_OFFSET_MIN,
} from "./theme-text-shadow.js";
