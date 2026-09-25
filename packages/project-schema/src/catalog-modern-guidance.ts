import type { Category, ImageAsset, Product, StoreProjectV2, StoreSection } from "./index";

export type ContentRequirementScope =
  | "identity"
  | "home"
  | "navigation"
  | "category"
  | "product"
  | "seo"
  | "asset"
  | "domain"
  | "policy";

export type ContentRequirementRole =
  | "eyebrow"
  | "headline"
  | "subheadline"
  | "body"
  | "cta-label"
  | "seo-title"
  | "seo-description"
  | "alt"
  | "contact"
  | "domain"
  | "policy";

export type ContentStatus = "ready" | "missing" | "placeholder" | "invalid";

export interface ContentRequirement {
  id: string;
  scope: ContentRequirementScope;
  role: ContentRequirementRole;
  label: string;
  target: string;
  severity: "critical" | "recommended";
  value: string;
  status: ContentStatus;
  active: boolean;
}

export interface CatalogModernReadiness {
  requirements: ContentRequirement[];
  ready: number;
  pending: number;
  criticalPending: number;
  recommendedPending: number;
  percent: number;
}

export interface CatalogModernTemplateManifest {
  id: "catalog-modern";
  version: number;
  baseSectionIds: readonly string[];
  protectedSectionIds: readonly string[];
  optionalSectionIds: readonly string[];
}

export const CATALOG_MODERN_GUIDANCE_VERSION = 2 as const;

/** Número de WhatsApp con el que nace la plantilla limpia: la guía lo trata como no configurado. */
export const CATALOG_MODERN_PLACEHOLDER_PHONE = "5491100000000" as const;

/**
 * Valores exactos que la plantilla base siembra en un clon (identity, seo,
 * catálogo demo). Un clon `duplicate`/`store` no es cubierto por el detector
 * de frases del seed limpio, así que estos valores se marcan como placeholder
 * con igual match normalizado, sin importar el seed. Contenido real nunca
 * coincide con ellos.
 */
const CATALOG_MODERN_SENTINEL_VALUES: ReadonlySet<string> = new Set([
  "email@gmail.com",
  "15412345",
  "direccion",
  "razonsocial",
  "descripcion corta de tu tienda.",
  "descripcion seo de tu tienda.",
  "coleccion 1",
]);

export function isCatalogModernSentinelValue(value: string): boolean {
  const normalized = value
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return false;
  if (CATALOG_MODERN_SENTINEL_VALUES.has(normalized)) return true;
  return (
    /^producto \d+$/.test(normalized) ||
    /^descripcion del producto \d+\.$/.test(normalized) ||
    /^descripcion de la categoria \d+\.$/.test(normalized) ||
    /^categoria \d+$/.test(normalized) ||
    /^producto de .+ pensado para ofrecer calidad, practicidad y una excelente experiencia de compra\.$/i.test(
      value.trim(),
    ) ||
    /^.+: una propuesta pensada para mostrar calidad, practicidad y una experiencia simple de compra\. adaptá este texto con la información real de tu negocio\.$/i.test(
      value.trim(),
    ) ||
    /^(hogar|cocina|decoracion|textiles|organizacion|limpieza|exterior|oficina|regalos|novedades) \d+$/.test(
      normalized,
    ) ||
    /^(hogar|cocina|decoracion|textiles|organizacion|limpieza|exterior|oficina|regalos|novedades)$/.test(
      normalized,
    )
  );
}

/** Valor visible del teléfono para la guía: el placeholder de la plantilla equivale a vacío. */
export function catalogModernPhoneValue(phone: string): string {
  return phone === CATALOG_MODERN_PLACEHOLDER_PHONE ? "" : phone;
}

export const catalogModernTemplateManifest: CatalogModernTemplateManifest = {
  id: "catalog-modern",
  version: CATALOG_MODERN_GUIDANCE_VERSION,
  baseSectionIds: [
    "modo-section-announcement",
    "modo-section-header",
    "modo-section-hero",
    "modo-section-brands",
    "modo-section-new",
    "modo-section-top",
    "modo-section-categories",
    "modo-section-testimonials",
    "modo-section-newsletter",
    "modo-section-cart",
    "modo-section-footer",
  ],
  protectedSectionIds: [
    "modo-section-announcement",
    "modo-section-header",
    "modo-section-hero",
    "modo-section-brands",
    "modo-section-new",
    "modo-section-categories",
    "modo-section-cart",
    "modo-section-footer",
  ],
  optionalSectionIds: ["modo-section-top", "modo-section-testimonials", "modo-section-newsletter"],
};

function section(project: StoreProjectV2, id: string): StoreSection | undefined {
  return project.sections.find((candidate) => candidate.id === id);
}

function setting(project: StoreProjectV2, sectionId: string, key: string): string {
  const value = section(project, sectionId)?.settings[key];
  return typeof value === "string" ? value : "";
}

function isCleanTemplate(project: StoreProjectV2): boolean {
  return (
    project.origin?.templateId === "catalog-modern" &&
    ["clean", "placeholder", "duplicate"].includes(project.origin.seed)
  );
}

/** El exporter bloquea las imagenes de plantilla por nombre o por alt. */
export function isCatalogModernPlaceholderAsset(
  project: StoreProjectV2,
  asset: Pick<ImageAsset, "name" | "alt">,
): boolean {
  return (
    isCleanTemplate(project) &&
    (asset.name === "Imagen de plantilla" ||
      asset.name.startsWith("Imagen de plantilla - ") ||
      asset.name === "Favicon de plantilla" ||
      asset.alt === "Imagen de ejemplo para reemplazar")
  );
}

function isPlaceholder(value: string, project: StoreProjectV2): boolean {
  if (!isCleanTemplate(project)) return false;
  const normalized = value.trim().toLocaleLowerCase("es-AR");
  if (!normalized) return false;
  return [
    "tu nueva colección",
    "una tienda lista para contar tu historia",
    "cargá tus productos",
    "tu tienda online, lista para empezar",
    "una tienda hecha para tu marca",
    "una tienda online preparada para mostrar tus productos",
    "descubrí nuestra selección de productos",
    "conocé nuestra historia",
    "estamos para ayudarte",
    "descripcion corta de tu tienda",
    "imagen de plantilla",
    "imagen de ejemplo para reemplazar",
  ].some((candidate) => normalized.includes(candidate));
}

function statusFor(value: string, project: StoreProjectV2, invalid = false): ContentStatus {
  if (invalid) return "invalid";
  if (!value.trim()) return "missing";
  if (isCatalogModernSentinelValue(value)) return "placeholder";
  if (isPlaceholder(value, project)) return "placeholder";
  return "ready";
}

function requirement(
  project: StoreProjectV2,
  input: Omit<ContentRequirement, "value" | "status" | "active"> & {
    value?: string;
    active?: boolean;
    invalid?: boolean;
  },
): ContentRequirement {
  const value = input.value ?? "";
  return {
    id: input.id,
    scope: input.scope,
    role: input.role,
    label: input.label,
    target: input.target,
    severity: input.severity,
    value,
    status: statusFor(value, project, input.invalid),
    active: input.active ?? true,
  };
}

function activeProducts(project: StoreProjectV2): Product[] {
  return project.products.filter((product) => product.status === "active");
}

function activeCategories(project: StoreProjectV2): Category[] {
  return project.categories;
}

function imageRequirement(project: StoreProjectV2, asset: ImageAsset): ContentRequirement {
  const result = requirement(project, {
    id: `asset.${asset.id}.alt`,
    scope: "asset",
    role: "alt",
    label: `Texto alternativo: ${asset.name}`,
    target: `assets.${asset.id}.alt`,
    // recommended: el audit del export lo trata como warning, no crítico.
    severity: "recommended",
    value: asset.alt,
  });
  return isCatalogModernPlaceholderAsset(project, asset)
    ? { ...result, status: "placeholder" }
    : result;
}

export function getCatalogModernContentRequirements(project: StoreProjectV2): ContentRequirement[] {
  const requirements: ContentRequirement[] = [
    requirement(project, {
      id: "identity.brand-name",
      scope: "identity",
      role: "headline",
      label: "Nombre de marca",
      target: "identity.brandName",
      severity: "critical",
      value: project.identity.brandName,
    }),
    requirement(project, {
      id: "identity.description",
      scope: "identity",
      role: "body",
      label: "Descripción de marca",
      target: "identity.description",
      // recommended: solo alimenta JSON-LD/Nosotros; el export pasa sin ella.
      severity: "recommended",
      value: project.identity.description,
    }),
    requirement(project, {
      id: "identity.email",
      scope: "identity",
      role: "contact",
      label: "Email de contacto",
      target: "identity.email",
      severity: "recommended",
      value: project.identity.email,
      invalid: Boolean(project.identity.email) && !project.identity.email.includes("@"),
    }),
    requirement(project, {
      id: "identity.whatsapp",
      scope: "identity",
      role: "contact",
      label: "WhatsApp de pedidos",
      target: "whatsapp.phone",
      // recommended: el sentinel se sanea en el sitio y el export pasa sin él.
      severity: "recommended",
      value: catalogModernPhoneValue(project.whatsapp.phone),
    }),
    requirement(project, {
      id: "navigation.catalog-label",
      scope: "navigation",
      role: "headline",
      label: "Nombre del catálogo",
      target: "navigation.catalogLabel",
      severity: "critical",
      value: project.navigation.catalogLabel,
    }),
    requirement(project, {
      id: "home.hero.eyebrow",
      scope: "home",
      role: "eyebrow",
      label: "Antetítulo del hero",
      target: "sections.modo-section-hero.settings.eyebrow",
      severity: "recommended",
      value: setting(project, "modo-section-hero", "eyebrow"),
    }),
    requirement(project, {
      id: "home.hero.title",
      scope: "home",
      role: "headline",
      label: "Título principal",
      target: "sections.modo-section-hero.settings.title",
      // recommended: los textos de plantilla no bloquean producción.
      severity: "recommended",
      value: setting(project, "modo-section-hero", "title"),
    }),
    requirement(project, {
      id: "home.hero.body",
      scope: "home",
      role: "body",
      label: "Descripción del hero",
      target: "sections.modo-section-hero.settings.body",
      severity: "recommended",
      value: setting(project, "modo-section-hero", "body"),
    }),
    requirement(project, {
      id: "home.hero.primary-cta",
      scope: "home",
      role: "cta-label",
      label: "CTA principal del hero",
      target: "sections.modo-section-hero.settings.actionLabel",
      severity: "recommended",
      value: setting(project, "modo-section-hero", "actionLabel"),
    }),
    requirement(project, {
      id: "home.products.title",
      scope: "home",
      role: "headline",
      label: "Título de productos",
      target: "sections.modo-section-new.settings.title",
      severity: "recommended",
      value: setting(project, "modo-section-new", "title"),
      active: activeProducts(project).length > 0,
    }),
    requirement(project, {
      id: "home.categories.title",
      scope: "home",
      role: "headline",
      label: "Título de categorías",
      target: "sections.modo-section-categories.settings.title",
      severity: "recommended",
      value: setting(project, "modo-section-categories", "title"),
      active: activeCategories(project).length > 0,
    }),
    requirement(project, {
      id: "seo.title",
      scope: "seo",
      role: "seo-title",
      label: "Título SEO principal",
      target: "seo.title",
      severity: "critical",
      value: project.seo.title,
    }),
    requirement(project, {
      id: "seo.description",
      scope: "seo",
      role: "seo-description",
      label: "Descripción SEO principal",
      target: "seo.description",
      severity: "critical",
      value: project.seo.description,
    }),
  ];

  activeProducts(project).forEach((product) => {
    const primaryVariant = product.variants[0];
    requirements.push(
      requirement(project, {
        id: `product.${product.id}.title`,
        scope: "product",
        role: "headline",
        label: `Título: ${product.title}`,
        target: `products.${product.id}.title`,
        severity: "critical",
        value: product.title,
      }),
      requirement(project, {
        id: `product.${product.id}.description`,
        scope: "product",
        role: "body",
        label: `Descripción: ${product.title}`,
        target: `products.${product.id}.description`,
        severity: "critical",
        value: product.description,
      }),
      requirement(project, {
        id: `product.${product.id}.category`,
        scope: "product",
        role: "body",
        label: `Categoría: ${product.title}`,
        target: `products.${product.id}.categoryIds`,
        // recommended: un producto sin categoría sigue siendo exportable.
        severity: "recommended",
        value: product.categoryIds.join(","),
      }),
      requirement(project, {
        id: `product.${product.id}.image`,
        scope: "product",
        role: "alt",
        label: `Imagen principal: ${product.title}`,
        target: `products.${product.id}.imageIds`,
        severity: "critical",
        value: product.imageIds.join(","),
      }),
      requirement(project, {
        id: `product.${product.id}.price`,
        scope: "product",
        role: "body",
        label: `Precio: ${product.title}`,
        target: `products.${product.id}.variants.0.price`,
        severity: "critical",
        value: primaryVariant && primaryVariant.price > 0 ? String(primaryVariant.price) : "",
      }),
    );
  });

  activeCategories(project).forEach((category) => {
    requirements.push(
      requirement(project, {
        id: `category.${category.id}.title`,
        scope: "category",
        role: "headline",
        label: `Nombre de categoría: ${category.title}`,
        target: `categories.${category.id}.title`,
        severity: "critical",
        value: category.title,
      }),
    );
  });

  requirements.push(
    requirement(project, {
      id: "domain.https",
      scope: "domain",
      role: "domain",
      label: "URL pública con HTTPS",
      target: "baseUrl",
      severity: "critical",
      value: project.baseUrl,
      invalid: Boolean(project.baseUrl) && !project.baseUrl.startsWith("https://"),
    }),
  );

  project.assets.forEach((asset) => {
    requirements.push(imageRequirement(project, asset));
  });
  return requirements;
}

export function evaluateCatalogModernReadiness(project: StoreProjectV2): CatalogModernReadiness {
  const requirements = getCatalogModernContentRequirements(project).filter(
    (requirement) => requirement.active,
  );
  const pendingRequirements = requirements.filter((requirement) => requirement.status !== "ready");
  const ready = requirements.length - pendingRequirements.length;
  const criticalPending = pendingRequirements.filter(
    (requirement) => requirement.severity === "critical",
  ).length;
  const recommendedPending = pendingRequirements.length - criticalPending;
  return {
    requirements,
    ready,
    pending: pendingRequirements.length,
    criticalPending,
    recommendedPending,
    percent: requirements.length === 0 ? 0 : Math.round((ready / requirements.length) * 100),
  };
}

export function hasCatalogModernCriticalPending(project: StoreProjectV2): boolean {
  return evaluateCatalogModernReadiness(project).criticalPending > 0;
}
