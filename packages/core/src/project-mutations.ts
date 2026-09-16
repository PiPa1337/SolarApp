/**
 * Registro único de mutaciones semánticas del proyecto.
 *
 * Cada superficie (canvas, sidebar, catálogo, agente IA) aplica cambios por el
 * mismo applyMutation, de modo que el snapshot resultante sea idéntico byte
 * a byte sin importar el origen. Las mutaciones no aceptan paths arbitrarios:
 * cada tipo declara sus parámetros y su apply puro.
 */

import { getModuleDefinition, sanitizeRichText } from "@solara/modules";
import {
  type Category,
  type Collection,
  getCategoryProductIds,
  type ImageAsset,
  type Product,
  type PublicCopy,
  PublicCopySchema,
  type StoreProjectV1,
  StoreProjectV2Schema,
  type Theme,
  isValidIcoDataUrl,
} from "@solara/project-schema";

export type TypedIdentityChanges = Partial<
  Pick<
    StoreProjectV1["identity"],
    | "legalName"
    | "brandName"
    | "description"
    | "logoAssetId"
    | "email"
    | "phone"
    | "address"
    | "instagramUrl"
    | "facebookUrl"
    | "tiktokUrl"
    | "twitterHandle"
  >
> & { baseUrl?: StoreProjectV1["baseUrl"] };

export type TypedProductChanges = Partial<
  Pick<
    Product,
    | "slug"
    | "title"
    | "description"
    | "richDescription"
    | "brand"
    | "categoryIds"
    | "collectionIds"
    | "tags"
    | "imageIds"
    | "videoIds"
  >
> & { price?: number };

export type TypedCategoryChanges = Partial<
  Pick<Category, "slug" | "title" | "description" | "seoIntro" | "imageId" | "status">
>;

export type TypedCollectionChanges = Partial<
  Pick<Collection, "slug" | "title" | "description" | "imageId" | "status">
>;

export type TypedAssetChanges = Partial<Pick<ImageAsset, "name" | "alt">>;

export type TypedPublicCopyChange = {
  group: keyof PublicCopy;
  field: string;
  value: string;
};

export type TypedSeoChanges = Partial<
  Pick<
    StoreProjectV1["seo"],
    | "title"
    | "description"
    | "searchConsoleVerification"
    | "merchantVerification"
    | "faviconAssetId"
    | "socialImageId"
  >
>;

function assertValidFaviconChange(project: StoreProjectV1, changes: TypedSeoChanges): void {
  if (!Object.prototype.hasOwnProperty.call(changes, "faviconAssetId")) return;
  const assetId = changes.faviconAssetId;
  if (assetId === undefined) return;
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.mimeType !== "image/x-icon" || !isValidIcoDataUrl(asset.source)) {
    throw new Error("El favicon debe ser un asset ICO válido antes de guardarlo.");
  }
}

export type TypedWhatsappChanges = Partial<
  Pick<StoreProjectV1["whatsapp"], "phone" | "greeting" | "includeSku">
>;

export type TypedNavigationChanges = Partial<
  Pick<
    StoreProjectV1["navigation"],
    "mode" | "catalogLabel" | "items" | "showHome" | "showSearch" | "showCart"
  >
>;

type TypedThemeShadowsPatch = Omit<Partial<NonNullable<Theme["shadows"]>>, "text"> & {
  text?: Partial<NonNullable<NonNullable<Theme["shadows"]>["text"]>>;
};

export type TypedThemePatch = {
  spacingScale?: Theme["spacingScale"];
  radius?: Theme["radius"];
  container?: Theme["container"];
  colors?: Partial<Theme["colors"]>;
  typography?: Partial<Theme["typography"]>;
  spacing?: Partial<NonNullable<Theme["spacing"]>>;
  shadows?: TypedThemeShadowsPatch;
  borders?: Partial<NonNullable<Theme["borders"]>>;
  motion?: Partial<NonNullable<Theme["motion"]>>;
  background?: Partial<NonNullable<Theme["background"]>>;
};

export type ProjectMutation =
  | {
      type: "section.field.update";
      sectionId: string;
      fieldKey: string;
      value: unknown;
    }
  | {
      type: "section.updateSettings";
      sectionId: string;
      settings: Record<string, unknown>;
    }
  | {
      type: "section.repeater.item.update";
      sectionId: string;
      fieldKey: string;
      itemId: string;
      changes: Record<string, unknown>;
    }
  | {
      type: "section.repeater.item.reorder";
      sectionId: string;
      fieldKey: string;
      itemId: string;
      beforeItemId?: string;
    }
  | {
      type: "identity.update";
      changes: TypedIdentityChanges;
    }
  | {
      type: "product.update";
      productId: string;
      changes: TypedProductChanges;
    }
  | {
      type: "products.reorder";
      productIds: string[];
    }
  | {
      type: "category.update";
      categoryId: string;
      changes: TypedCategoryChanges;
    }
  | {
      type: "collection.update";
      collectionId: string;
      changes: TypedCollectionChanges;
    }
  | {
      type: "asset.update";
      assetId: string;
      changes: TypedAssetChanges;
    }
  | {
      type: "theme.updateTokens";
      tokens: TypedThemePatch;
    }
  | {
      type: "publicCopy.update";
      group: keyof PublicCopy;
      field: string;
      value: string;
    }
  | {
      type: "seo.update";
      changes: TypedSeoChanges;
    }
  | {
      type: "whatsapp.update";
      changes: TypedWhatsappChanges;
    }
  | {
      type: "navigation.update";
      changes: TypedNavigationChanges;
    };

export type ProjectMutationActor =
  | { kind: "canvas"; sessionId: string }
  | { kind: "sidebar" }
  | { kind: "catalog-editor" }
  | { kind: "agent"; actorId: string; requestId: string | number }
  | { kind: "template-upgrade"; upgradeId: string }
  | { kind: "rollout"; rolloutId: string };

export interface AppliedMutation {
  project: StoreProjectV1;
  mutation: ProjectMutation;
  actor?: ProjectMutationActor;
  at: string;
}

type MutationHandler = (
  project: StoreProjectV1,
  mutation: ProjectMutation,
  at: string,
) => StoreProjectV1;

function updateSectionSettings(
  project: StoreProjectV1,
  sectionId: string,
  nextSettings: Record<string, unknown>,
  at: string,
): StoreProjectV1 {
  const section = project.sections.find((item) => item.id === sectionId);
  if (!section) throw new Error(`No existe la sección ${sectionId}.`);
  // La definición del módulo es la autoridad de los campos: un campo que no
  // está en el settingsSchema del módulo se rechaza en vez de mergearse a
  // ciegas (evita settings huérfanos que el render ignora silenciosamente).
  const definition = getModuleDefinition(section.moduleId);
  if (definition) {
    // Los settings schemas de los módulos extienden ZodObject, pero el tipo
    // público RegisteredModule los declara como ZodType: el shape se accede
    // por reflexión controlada para validar claves sin exponer genéricos.
    const shape = (definition.settingsSchema as unknown as { shape: Record<string, unknown> })
      .shape;
    for (const key of Object.keys(nextSettings)) {
      if (!(key in shape)) throw new Error(`Campo desconocido para ${section.moduleId}: ${key}`);
    }
  }
  return StoreProjectV2Schema.parse({
    ...project,
    sections: project.sections.map((item) =>
      item.id === sectionId ? { ...item, settings: { ...item.settings, ...nextSettings } } : item,
    ),
    updatedAt: at,
  });
}

function updateRepeaterItem(
  project: StoreProjectV1,
  sectionId: string,
  fieldKey: string,
  itemId: string,
  changes: Record<string, unknown>,
  at: string,
): StoreProjectV1 {
  const section = project.sections.find((item) => item.id === sectionId);
  if (!section) throw new Error(`No existe la sección ${sectionId}.`);
  const definition = getModuleDefinition(section.moduleId);
  if (!definition) throw new Error(`Módulo desconocido: ${section.moduleId}`);
  // El campo debe ser un array del settings y los cambios sólo pueden tocar
  // claves ya presentes en los items (sin inventar columnas).
  const parsedSettings = definition.settingsSchema.parse(section.settings) as Record<
    string,
    unknown
  >;
  const current = parsedSettings[fieldKey];
  if (!Array.isArray(current)) throw new Error(`El campo ${fieldKey} no es un repeater.`);
  const itemIndex = current.findIndex(
    (item) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === itemId,
  );
  if (itemIndex === -1) throw new Error(`No existe el item ${itemId} en ${fieldKey}.`);
  const item = current[itemIndex] as Record<string, unknown>;
  for (const key of Object.keys(changes)) {
    if (!(key in item)) throw new Error(`Campo desconocido en item: ${key}`);
  }
  const nextItems = current.map((candidate, index) =>
    index === itemIndex ? { ...item, ...changes } : candidate,
  );
  return updateSectionSettings(project, sectionId, { [fieldKey]: nextItems }, at);
}

function updateRepeaterItemOrder(
  project: StoreProjectV1,
  sectionId: string,
  fieldKey: string,
  itemId: string,
  beforeItemId: string | undefined,
  at: string,
): StoreProjectV1 {
  const section = project.sections.find((item) => item.id === sectionId);
  if (!section) throw new Error(`No existe la sección ${sectionId}.`);
  const definition = getModuleDefinition(section.moduleId);
  if (!definition) throw new Error(`Módulo desconocido: ${section.moduleId}`);
  const parsedSettings = definition.settingsSchema.parse(section.settings) as Record<
    string,
    unknown
  >;
  const current = parsedSettings[fieldKey];
  if (!Array.isArray(current)) throw new Error(`El campo ${fieldKey} no es un repeater.`);
  const itemIndex = current.findIndex(
    (item) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === itemId,
  );
  if (itemIndex === -1) throw new Error(`No existe el item ${itemId} en ${fieldKey}.`);
  const nextItems = [...current];
  const [item] = nextItems.splice(itemIndex, 1);
  if (item === undefined) throw new Error(`No existe el item ${itemId} en ${fieldKey}.`);
  if (beforeItemId === undefined) {
    nextItems.push(item);
  } else {
    const beforeIndex = nextItems.findIndex(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        (candidate as { id?: unknown }).id === beforeItemId,
    );
    if (beforeIndex === -1) throw new Error(`No existe el item ${beforeItemId} en ${fieldKey}.`);
    nextItems.splice(beforeIndex, 0, item);
  }
  return updateSectionSettings(project, sectionId, { [fieldKey]: nextItems }, at);
}

function synchronizeEntityIndexes(project: StoreProjectV1): StoreProjectV1 {
  return {
    ...project,
    categories: project.categories.map((category) => ({
      ...category,
      productIds: getCategoryProductIds(project, category.id),
    })),
    collections: project.collections.map((collection) => ({
      ...collection,
      productIds: project.products
        .filter((product) => product.collectionIds.includes(collection.id))
        .map((product) => product.id),
    })),
  };
}

function updateIdentity(
  project: StoreProjectV1,
  changes: TypedIdentityChanges,
  at: string,
): StoreProjectV1 {
  const { baseUrl, ...identityChanges } = changes;
  return StoreProjectV2Schema.parse({
    ...project,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    identity: { ...project.identity, ...identityChanges },
    updatedAt: at,
  });
}

function updateProduct(
  project: StoreProjectV1,
  productId: string,
  changes: TypedProductChanges,
  at: string,
): StoreProjectV1 {
  const product = project.products.find((item) => item.id === productId);
  if (!product) throw new Error(`No existe el producto ${productId}.`);
  const { price, ...productChanges } = changes;
  if (price !== undefined && (!Number.isSafeInteger(price) || price < 0)) {
    throw new Error("El precio debe ser un entero seguro no negativo en centavos.");
  }
  const sanitizedChanges =
    productChanges.richDescription === undefined
      ? productChanges
      : {
          ...productChanges,
          richDescription: String(sanitizeRichText(productChanges.richDescription)),
        };
  const next = {
    ...project,
    products: project.products.map((item) =>
      item.id === productId
        ? {
            ...item,
            ...sanitizedChanges,
            ...(price === undefined
              ? {}
              : {
                  variants: item.variants.map((variant, index) =>
                    index === 0 ? { ...variant, price: price as typeof variant.price } : variant,
                  ),
                }),
            updatedAt: at,
          }
        : item,
    ),
    updatedAt: at,
  };
  return StoreProjectV2Schema.parse(synchronizeEntityIndexes(next));
}

function reorderProducts(project: StoreProjectV1, productIds: string[], at: string): StoreProjectV1 {
  const currentIds = project.products.map((product) => product.id as string);
  if (
    productIds.length !== currentIds.length ||
    new Set(productIds).size !== productIds.length ||
    productIds.some((productId) => !currentIds.includes(productId))
  ) {
    throw new Error("El reordenamiento debe incluir cada producto exactamente una vez.");
  }
  const productsById = new Map<string, Product>(
    project.products.map((product) => [product.id as string, product]),
  );
  return StoreProjectV2Schema.parse(
    synchronizeEntityIndexes({
      ...project,
      products: productIds.map((productId) => productsById.get(productId) as Product),
      updatedAt: at,
    }),
  );
}

function updateCategory(
  project: StoreProjectV1,
  categoryId: string,
  changes: TypedCategoryChanges,
  at: string,
): StoreProjectV1 {
  const category = project.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error(`No existe la categoría ${categoryId}.`);
  return StoreProjectV2Schema.parse({
    ...synchronizeEntityIndexes({
      ...project,
      categories: project.categories.map((item) =>
        item.id === categoryId ? { ...item, ...changes } : item,
      ),
      updatedAt: at,
    }),
  });
}

function updateCollection(
  project: StoreProjectV1,
  collectionId: string,
  changes: TypedCollectionChanges,
  at: string,
): StoreProjectV1 {
  const collection = project.collections.find((item) => item.id === collectionId);
  if (!collection) throw new Error(`No existe la colección ${collectionId}.`);
  return StoreProjectV2Schema.parse(
    synchronizeEntityIndexes({
      ...project,
      collections: project.collections.map((item) =>
        item.id === collectionId ? { ...item, ...changes } : item,
      ),
      updatedAt: at,
    }),
  );
}

function updateAsset(
  project: StoreProjectV1,
  assetId: string,
  changes: TypedAssetChanges,
  at: string,
): StoreProjectV1 {
  if (!project.assets.some((asset) => asset.id === assetId)) {
    throw new Error(`No existe el asset ${assetId}.`);
  }
  return StoreProjectV2Schema.parse({
    ...project,
    assets: project.assets.map((asset) =>
      asset.id === assetId ? { ...asset, ...changes } : asset,
    ),
    updatedAt: at,
  });
}

function updateTheme(project: StoreProjectV1, tokens: TypedThemePatch, at: string): StoreProjectV1 {
  const allowed = new Set([
    "spacingScale",
    "radius",
    "container",
    "colors",
    "typography",
    "spacing",
    "shadows",
    "borders",
    "motion",
    "background",
  ]);
  const unknown = Object.keys(tokens).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Tokens de tema desconocidos: ${unknown.join(", ")}.`);
  const { colors, typography, spacing, shadows, borders, motion, background, ...topLevel } = tokens;
  const nextTheme = {
    ...project.theme,
    ...topLevel,
    colors: { ...project.theme.colors, ...(colors ?? {}) },
    typography: { ...project.theme.typography, ...(typography ?? {}) },
    ...(spacing ? { spacing: { ...(project.theme.spacing ?? {}), ...spacing } } : {}),
    ...(shadows
      ? {
          shadows: {
            ...(project.theme.shadows ?? {}),
            ...shadows,
            ...(shadows.text
              ? { text: { ...(project.theme.shadows?.text ?? {}), ...shadows.text } }
              : {}),
          },
        }
      : {}),
    ...(borders ? { borders: { ...(project.theme.borders ?? {}), ...borders } } : {}),
    ...(motion ? { motion: { ...(project.theme.motion ?? {}), ...motion } } : {}),
    ...(background
      ? { background: { ...(project.theme.background ?? {}), ...background } }
      : {}),
  };
  return StoreProjectV2Schema.parse({ ...project, theme: nextTheme, updatedAt: at });
}

function updatePublicCopy(
  project: StoreProjectV1,
  group: keyof PublicCopy,
  field: string,
  value: string,
  at: string,
): StoreProjectV1 {
  const currentGroup = project.publicCopy[group];
  if (typeof currentGroup !== "object" || currentGroup === null || Array.isArray(currentGroup)) {
    throw new Error(`Grupo de copy desconocido: ${String(group)}.`);
  }
  if (!(field in currentGroup))
    throw new Error(`Campo de copy desconocido: ${String(group)}.${field}`);
  const publicCopy = PublicCopySchema.parse({
    ...project.publicCopy,
    [group]: { ...currentGroup, [field]: value },
  });
  return StoreProjectV2Schema.parse({ ...project, publicCopy, updatedAt: at });
}

export function createMutationRegistry(): Record<string, MutationHandler> {
  return {
    "section.field.update": (project, mutation, at) => {
      const m = mutation as { sectionId: string; fieldKey: string; value: unknown };
      return updateSectionSettings(project, m.sectionId, { [m.fieldKey]: m.value }, at);
    },
    "section.updateSettings": (project, mutation, at) => {
      const m = mutation as { sectionId: string; settings: Record<string, unknown> };
      return updateSectionSettings(project, m.sectionId, m.settings, at);
    },
    "section.repeater.item.update": (project, mutation, at) => {
      const m = mutation as {
        sectionId: string;
        fieldKey: string;
        itemId: string;
        changes: Record<string, unknown>;
      };
      return updateRepeaterItem(project, m.sectionId, m.fieldKey, m.itemId, m.changes, at);
    },
    "section.repeater.item.reorder": (project, mutation, at) => {
      const m = mutation as {
        sectionId: string;
        fieldKey: string;
        itemId: string;
        beforeItemId?: string;
      };
      return updateRepeaterItemOrder(
        project,
        m.sectionId,
        m.fieldKey,
        m.itemId,
        m.beforeItemId,
        at,
      );
    },
    "identity.update": (project, mutation, at) =>
      updateIdentity(project, (mutation as { changes: TypedIdentityChanges }).changes, at),
    "product.update": (project, mutation, at) => {
      const m = mutation as { productId: string; changes: TypedProductChanges };
      return updateProduct(project, m.productId, m.changes, at);
    },
    "products.reorder": (project, mutation, at) => {
      const m = mutation as { productIds: string[] };
      return reorderProducts(project, m.productIds, at);
    },
    "category.update": (project, mutation, at) => {
      const m = mutation as { categoryId: string; changes: TypedCategoryChanges };
      return updateCategory(project, m.categoryId, m.changes, at);
    },
    "collection.update": (project, mutation, at) => {
      const m = mutation as { collectionId: string; changes: TypedCollectionChanges };
      return updateCollection(project, m.collectionId, m.changes, at);
    },
    "asset.update": (project, mutation, at) => {
      const m = mutation as { assetId: string; changes: TypedAssetChanges };
      return updateAsset(project, m.assetId, m.changes, at);
    },
    "theme.updateTokens": (project, mutation, at) =>
      updateTheme(project, (mutation as { tokens: TypedThemePatch }).tokens, at),
    "publicCopy.update": (project, mutation, at) => {
      const m = mutation as TypedPublicCopyChange;
      return updatePublicCopy(project, m.group, m.field, m.value, at);
    },
    "seo.update": (project, mutation, at) => {
      const changes = (mutation as { changes: TypedSeoChanges }).changes;
      assertValidFaviconChange(project, changes);
      return StoreProjectV2Schema.parse({
        ...project,
        seo: { ...project.seo, ...changes },
        updatedAt: at,
      });
    },
    "whatsapp.update": (project, mutation, at) =>
      StoreProjectV2Schema.parse({
        ...project,
        whatsapp: {
          ...project.whatsapp,
          ...(mutation as { changes: TypedWhatsappChanges }).changes,
        },
        updatedAt: at,
      }),
    "navigation.update": (project, mutation, at) =>
      StoreProjectV2Schema.parse({
        ...project,
        navigation: {
          ...project.navigation,
          ...(mutation as { changes: TypedNavigationChanges }).changes,
        },
        updatedAt: at,
      }),
  };
}

export function applyMutation(
  project: StoreProjectV1,
  registry: Record<string, MutationHandler>,
  mutation: ProjectMutation,
  actor?: ProjectMutationActor,
  options?: { at?: string },
): AppliedMutation {
  const handler = registry[mutation.type];
  if (!handler) throw new Error(`Mutación desconocida: ${mutation.type}`);
  // El timestamp lo fija applyMutation una sola vez para que el mismo comando
  // desde cualquier superficie produzca exactamente el mismo snapshot; el
  // caller puede inyectarlo para paridad determinista en tests.
  const at = options?.at ?? new Date().toISOString();
  const next = handler(project, mutation, at);
  return {
    project: next,
    mutation,
    ...(actor === undefined ? {} : { actor }),
    at: next.updatedAt,
  };
}
