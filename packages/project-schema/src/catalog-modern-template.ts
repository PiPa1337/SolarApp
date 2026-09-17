import { defaultHomeContactSections } from "./catalog-modern-contact";
import { catalogModernStore } from "./catalog-modern-fixture";
import { CATALOG_MODERN_GUIDANCE_VERSION } from "./catalog-modern-guidance";
import { type StoreProjectV1, type StoreProjectV2, StoreProjectV2Schema } from "./index";
import { buildModernBaseTemplateProject } from "./modern-base-template";

export {
  buildModernBaseTemplateProject,
  isModernBaseTemplateContent,
  MODERN_BASE_TEMPLATE_CONTENT_VERSION,
  MODERN_BASE_TEMPLATE_SOURCE_SLUGS,
  replaceModernBaseTemplateContent,
} from "./modern-base-template";

const CLEAN_TEMPLATE_IMAGE_SOURCE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900' viewBox='0 0 1200 900'%3E%3Crect width='1200' height='900' fill='%23e8e8e3'/%3E%3Cpath d='M0 700 280 470l170 130 210-250 540 350v200H0z' fill='%23d2d2cb'/%3E%3C/svg%3E";

/** Version of the guided Catalog Modern template. Increase only when its persisted shape changes. */
export const CATALOG_MODERN_TEMPLATE_VERSION = CATALOG_MODERN_GUIDANCE_VERSION;

/** Reemplaza textos heredados de una fixture sin tocar claves ni la forma del proyecto. */
export function replaceCatalogBrandText<T>(value: T, source: string, target: string): T {
  if (!source || source === target) return value;
  if (typeof value === "string") return value.split(source).join(target) as T;
  if (Array.isArray(value)) {
    return value.map((item) => replaceCatalogBrandText(item, source, target)) as T;
  }
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      replaceCatalogBrandText(item, source, target),
    ]),
  ) as T;
}

function ensureHomeContactV2Sections(project: StoreProjectV1): StoreProjectV1 {
  if (project.commerceTemplates.designFamily !== "catalog-modern-v2") return project;

  const defaults = defaultHomeContactSections();
  const existingModuleIds = new Set(project.sections.map((section) => section.moduleId));
  const missing = defaults.filter((section) => !existingModuleIds.has(section.moduleId));
  if (missing.length === 0) return project;

  const insertAt = project.sections.findIndex(
    (section) => section.slot === "cart" || section.slot === "footer",
  );
  const sections = [...project.sections];
  sections.splice(insertAt < 0 ? sections.length : insertAt, 0, ...missing);
  return { ...project, sections };
}

function ensureHomeV2ContactLinks(project: StoreProjectV1): StoreProjectV1 {
  if (project.commerceTemplates.designFamily !== "catalog-modern-v2") return project;

  let changed = false;
  const sections = project.sections.map((section) => {
    const settings = { ...section.settings };
    let sectionChanged = false;
    if (
      section.moduleId === "catalog-hero" &&
      typeof settings.secondaryActionHref === "string" &&
      /^\/nosotros\/?$/i.test(settings.secondaryActionHref)
    ) {
      settings.secondaryActionHref = "#contact-form";
      sectionChanged = true;
    }
    if (
      section.moduleId === "catalog-newsletter-cta" &&
      typeof settings.actionHref === "string" &&
      /^\/contacto\/?$/i.test(settings.actionHref)
    ) {
      settings.actionHref = "#contact-form";
      sectionChanged = true;
    }
    if (sectionChanged) changed = true;
    return sectionChanged ? { ...section, settings } : section;
  });
  return changed ? { ...project, sections } : project;
}

function ensureNewsletterCtaMotion(project: StoreProjectV1): StoreProjectV1 {
  if (project.commerceTemplates.designFamily !== "catalog-modern-v2") return project;

  let changed = false;
  const sections = project.sections.map((section) => {
    if (section.moduleId !== "catalog-newsletter-cta" || section.motion.preset === "none") {
      return section;
    }
    changed = true;
    return { ...section, motion: { ...section.motion, preset: "none" as const } };
  });
  return changed ? { ...project, sections } : project;
}

export function ensureCatalogModernV2Sections(project: StoreProjectV1): StoreProjectV1 {
  return ensureNewsletterCtaMotion(ensureHomeV2ContactLinks(ensureHomeContactV2Sections(project)));
}

export type CatalogModernSeed = "clean" | "demo" | "placeholder";

export interface BuildCatalogModernProjectOptions {
  seed: CatalogModernSeed;
  id?: string;
  name?: string;
  slug?: string;
  baseUrl?: string;
  brandName?: string;
}

function cleanProject(options: BuildCatalogModernProjectOptions): StoreProjectV2 {
  const name = options.name?.trim() || "Nueva tienda";
  const brandName = options.brandName?.trim() || name;
  const slug = options.slug || "nueva-tienda";
  // Base V2 construida localmente (sin importar el v2-fixture, que depende de
  // esta plantilla): trae designFamily v2 y la estructura de Home. Las páginas
  // editoriales y sus imágenes sólo viven en los fixtures de desarrollo.
  const project = replaceCatalogBrandText(
    ensureCatalogModernV2Sections({
      ...structuredClone(catalogModernStore),
      commerceTemplates: {
        ...catalogModernStore.commerceTemplates,
        designFamily: "catalog-modern-v2",
      },
    }),
    catalogModernStore.identity.brandName,
    brandName,
  );
  const sections = project.sections.map((section) => {
    if (section.moduleId === "catalog-product-grid" && section.id.endsWith("-new")) {
      return {
        ...section,
        settings: {
          ...section.settings,
          title: "Productos",
          source: "all",
          sourceId: "",
          limit: 12,
          viewAllHref: "/buscar/",
        },
      };
    }
    if (
      section.moduleId === "catalog-product-grid" ||
      section.moduleId === "catalog-category-bento" ||
      section.moduleId === "catalog-testimonials"
    ) {
      return { ...section, enabled: false };
    }
    if (section.moduleId === "catalog-hero") {
      return {
        ...section,
        settings: {
          ...section.settings,
          eyebrow: "Tu nueva colección",
          title: "Una tienda lista para contar tu historia.",
          body: "Cargá tus productos, imágenes y textos para empezar a vender.",
          actionLabel: "Abrir búsqueda",
          actionHref: "/buscar/",
          secondaryActionLabel: "Conocé la marca",
          secondaryActionHref: "#contact-form",
        },
      };
    }
    if (section.moduleId === "catalog-announcement") {
      return {
        ...section,
        settings: { ...section.settings, text: "Tu tienda online, lista para empezar." },
      };
    }
    if (section.moduleId === "catalog-newsletter-cta") {
      return {
        ...section,
        settings: {
          ...section.settings,
          title: "Hacé crecer tu catálogo",
          body: "Cuando estés listo, compartí tu tienda y recibí pedidos por WhatsApp.",
          actionLabel: "Configurar contacto",
          actionHref: "#contact-form",
        },
      };
    }
    if (section.moduleId === "catalog-footer") {
      return {
        ...section,
        settings: {
          ...section.settings,
          note: "Una tienda clara para que tus productos encuentren a su gente.",
        },
      };
    }
    return section;
  });

  const clean = StoreProjectV2Schema.parse({
    ...project,
    id: options.id || "store-catalog-modern-clean",
    name,
    slug,
    baseUrl: options.baseUrl || `https://${slug}.example`,
    origin: {
      templateId: "catalog-modern",
      templateVersion: CATALOG_MODERN_TEMPLATE_VERSION,
      seed: "clean",
      role: "store",
      updatePolicy: "managed",
    },
    identity: {
      ...project.identity,
      legalName: brandName,
      brandName,
      description: "Una tienda online preparada para mostrar tus productos.",
      email: "",
      phone: "",
      address: "",
    },
    whatsapp: {
      ...project.whatsapp,
      // Una tienda limpia no tiene un número configurado. El sentinel
      // histórico se conserva sólo para migrar respaldos antiguos; no debe
      // volver a persistirse porque puede confundirse con un número real.
      phone: "",
      greeting: `Hola ${brandName}, quiero hacer este pedido:`,
    },
    seo: {
      ...project.seo,
      title: brandName,
      description: "Descubrí nuestra selección de productos y escribinos para coordinar tu pedido.",
      searchConsoleVerification: "",
      merchantVerification: "",
    },
    assets: project.assets
      .filter((asset) => !/^asset-(?:about|contact)-/i.test(asset.id))
      .map((asset) => ({
        ...asset,
        name: "Imagen de plantilla",
        alt: "Imagen de ejemplo para reemplazar",
        source: CLEAN_TEMPLATE_IMAGE_SOURCE,
        fallbackSource: undefined,
        responsiveSources: undefined,
        hash: `template-${asset.id}`,
      })),
    navigation: {
      ...project.navigation,
      mode: "automatic",
      catalogLabel: "Categorías",
      items: [],
    },
    pages: project.pages
      .filter((page) => page.kind === "home")
      .map((page) => ({
        ...page,
        title: "Una tienda hecha para tu marca.",
        seoTitle: brandName,
        seoDescription: "Descubrí nuestros productos y novedades.",
      })),
    products: [],
    categories: [],
    collections: [],
    sections,
  });
  return clean;
}

export function buildCatalogModernProject(
  options: BuildCatalogModernProjectOptions,
): StoreProjectV2 {
  if (options.seed === "placeholder") {
    return buildModernBaseTemplateProject({
      ...(options.id ? { id: options.id } : {}),
      ...(options.name ? { name: options.name } : {}),
      ...(options.slug ? { slug: options.slug } : {}),
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });
  }
  if (options.seed === "clean") return cleanProject(options);
  const project = options.brandName?.trim()
    ? replaceCatalogBrandText(
        structuredClone(catalogModernStore),
        catalogModernStore.identity.brandName,
        options.brandName.trim(),
      )
    : structuredClone(catalogModernStore);
  return StoreProjectV2Schema.parse({
    ...project,
    ...(options.id ? { id: options.id } : {}),
    ...(options.name ? { name: options.name } : {}),
    ...(options.slug ? { slug: options.slug } : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    origin: {
      templateId: "catalog-modern",
      templateVersion: CATALOG_MODERN_TEMPLATE_VERSION,
      seed: "demo",
      role: "base-template",
      updatePolicy: "pinned",
    },
  });
}

export const catalogModernCleanStore = buildCatalogModernProject({ seed: "clean" });
