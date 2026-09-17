import {
  buildCatalogModernProject,
  CATALOG_MODERN_TEMPLATE_VERSION,
  isModernBaseTemplateContent,
  replaceModernBaseTemplateContent,
} from "./catalog-modern-template";
import { type StoreProjectV2, StoreProjectV2Schema, type StoreSection } from "./index";
import { BASE_TEMPLATE_STORE_ID, isBaseTemplate } from "./project-policy";

export interface TemplateChange {
  id: string;
  label: string;
  kind: "version" | "section-add" | "field" | "content-replacement";
  sectionId?: string;
  next?: StoreSection;
  path?: string;
  from?: string;
  to?: string;
}

export interface TemplateConflict {
  id: string;
  path: string;
  label: string;
  reason: string;
}

export interface TemplateUpgradePlan {
  fromVersion: number;
  toVersion: number;
  safeChanges: TemplateChange[];
  conflicts: TemplateConflict[];
  preservedUserChanges: string[];
}

export function planCatalogModernUpgrade(project: StoreProjectV2): TemplateUpgradePlan {
  if (project.id === BASE_TEMPLATE_STORE_ID && isBaseTemplate(project)) {
    return {
      fromVersion: project.origin?.templateVersion ?? 1,
      toVersion: CATALOG_MODERN_TEMPLATE_VERSION,
      safeChanges: isModernBaseTemplateContent(project)
        ? []
        : [
            {
              id: "base-template.content.v2",
              label: "Reemplazar el contenido heredado por la plantilla moderna neutral",
              kind: "content-replacement",
            },
          ],
      conflicts: [],
      preservedUserChanges: [],
    };
  }
  const fromVersion = project.origin?.templateVersion ?? CATALOG_MODERN_TEMPLATE_VERSION;
  const seed =
    project.origin?.seed === "demo"
      ? "demo"
      : project.origin?.seed === "placeholder"
        ? "placeholder"
        : "clean";
  const latest = buildCatalogModernProject({ seed });
  const currentIds = new Set(project.sections.map((section) => section.id));
  const safeChanges: TemplateChange[] = [];
  const conflicts: TemplateConflict[] = [];
  const preservedUserChanges: string[] = [];

  if (fromVersion < CATALOG_MODERN_TEMPLATE_VERSION) {
    safeChanges.push({
      id: "template.version",
      label: `Actualizar Catalog Modern a la versión ${CATALOG_MODERN_TEMPLATE_VERSION}`,
      kind: "version",
    });
  }

  // Diferencia real v1→v2: el nombre del catálogo sembrado cambió de
  // "Colecciones" a "Categorías". Solo se ofrece cuando el valor actual es el
  // default v1 (el usuario no lo personalizó).
  if (
    project.origin?.seed !== undefined &&
    project.navigation.catalogLabel === "Colecciones" &&
    latest.navigation.catalogLabel !== "Colecciones"
  ) {
    safeChanges.push({
      id: "template.field.navigation.catalogLabel",
      label: `Nombre del catálogo: "${project.navigation.catalogLabel}" → "${latest.navigation.catalogLabel}"`,
      kind: "field",
      path: "navigation.catalogLabel",
      from: project.navigation.catalogLabel,
      to: latest.navigation.catalogLabel,
    });
  }

  latest.sections.forEach((section) => {
    if (currentIds.has(section.id)) {
      const current = project.sections.find((candidate) => candidate.id === section.id);
      if (current && JSON.stringify(current.settings) !== JSON.stringify(section.settings)) {
        preservedUserChanges.push(`sections.${section.id}.settings`);
      }
      return;
    }
    safeChanges.push({
      id: `section.add.${section.id}`,
      label: `Agregar sección base: ${section.moduleId}`,
      kind: "section-add",
      sectionId: section.id,
      next: section,
    });
  });

  project.sections.forEach((section) => {
    if (latest.sections.some((candidate) => candidate.id === section.id)) return;
    if (section.id.startsWith("modo-section-")) {
      conflicts.push({
        id: `section.removed.${section.id}`,
        path: `sections.${section.id}`,
        label: `Sección no presente en la plantilla actual: ${section.moduleId}`,
        reason: "Se conserva porque puede contener una decisión del usuario.",
      });
    }
  });

  return {
    fromVersion,
    toVersion: CATALOG_MODERN_TEMPLATE_VERSION,
    safeChanges,
    conflicts,
    preservedUserChanges,
  };
}

export function applyCatalogModernUpgrade(
  project: StoreProjectV2,
  acceptedChangeIds: readonly string[],
): StoreProjectV2 {
  const plan = planCatalogModernUpgrade(project);
  const accepted = new Set(acceptedChangeIds);
  if (accepted.has("base-template.content.v2")) {
    return replaceModernBaseTemplateContent(project);
  }
  const sections = [...project.sections];
  let navigation = project.navigation;
  for (const change of plan.safeChanges) {
    if (!accepted.has(change.id)) continue;
    if (change.kind === "section-add" && change.next) {
      if (sections.some((section) => section.id === change.next?.id)) continue;
      sections.push(structuredClone(change.next));
    }
    if (change.kind === "field" && change.path === "navigation.catalogLabel" && change.to) {
      navigation = { ...navigation, catalogLabel: change.to };
    }
  }
  const origin =
    accepted.has("template.version") && project.origin
      ? { ...project.origin, templateVersion: plan.toVersion }
      : project.origin;
  return StoreProjectV2Schema.parse({ ...project, origin, sections, navigation });
}
