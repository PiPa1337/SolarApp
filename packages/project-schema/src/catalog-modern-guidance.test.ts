import { describe, expect, it } from "vitest";
import {
  CATALOG_MODERN_PLACEHOLDER_PHONE,
  catalogModernPhoneValue,
  catalogModernTemplateManifest,
  evaluateCatalogModernReadiness,
  getCatalogModernContentRequirements,
  isCatalogModernPlaceholderAsset,
} from "./catalog-modern-guidance";
import { buildCatalogModernProject } from "./catalog-modern-template";
import type { StoreProjectV2 } from "./index";

/** Resuelve un target del checklist en el proyecto real: secciones/páginas/productos por id o kind. */
function resolveTarget(project: StoreProjectV2, target: string): unknown {
  let current: unknown = project;
  for (const part of target.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    if (Array.isArray(current)) {
      if (/^\d+$/.test(part)) {
        current = current[Number(part)];
        continue;
      }
      const items = current as Array<Record<string, unknown>>;
      const byId = items.find((item) => item.id === part);
      current = byId ?? items.find((item) => item.kind === part);
      continue;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Normaliza un valor del proyecto a la serialización que usa el checklist (join/string). */
function asRequirementValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

describe("Catalog Modern guidance", () => {
  it("expone la base protegida con versión estable", () => {
    expect(catalogModernTemplateManifest.id).toBe("catalog-modern");
    expect(catalogModernTemplateManifest.version).toBe(2);
    expect(catalogModernTemplateManifest.protectedSectionIds).toContain("modo-section-hero");
  });

  it("detecta placeholders y campos críticos en una tienda limpia", () => {
    const project = buildCatalogModernProject({ seed: "clean" });
    const readiness = evaluateCatalogModernReadiness(project);
    expect(readiness.criticalPending).toBeGreaterThan(0);
    expect(readiness.requirements.some((item) => item.id === "home.hero.title")).toBe(true);
    expect(readiness.requirements.find((item) => item.id === "home.hero.title")?.status).toBe(
      "placeholder",
    );
  });

  it("incluye requisitos dinámicos de productos y categorías", () => {
    const project = buildCatalogModernProject({ seed: "demo" });
    const requirements = getCatalogModernContentRequirements(project);
    expect(requirements.some((item) => item.id === "product.modo-product-01.title")).toBe(true);
    expect(requirements.some((item) => item.scope === "category")).toBe(true);
    expect(evaluateCatalogModernReadiness(project).criticalPending).toBe(0);
  });

  it("trata el teléfono de la plantilla limpia como no configurado", () => {
    expect(catalogModernPhoneValue(CATALOG_MODERN_PLACEHOLDER_PHONE)).toBe("");
    expect(catalogModernPhoneValue("5491123456789")).toBe("5491123456789");
    const clean = buildCatalogModernProject({ seed: "clean" });
    const whatsapp = evaluateCatalogModernReadiness(clean).requirements.find(
      (item) => item.id === "identity.whatsapp",
    );
    expect(whatsapp?.status).toBe("missing");
    expect(whatsapp?.severity).toBe("recommended");
    const demo = buildCatalogModernProject({ seed: "demo" });
    const demoWhatsapp = evaluateCatalogModernReadiness(demo).requirements.find(
      (item) => item.id === "identity.whatsapp",
    );
    expect(demoWhatsapp?.status).toBe("ready");
  });

  it("mantiene pendiente una imagen de plantilla aunque solo se corrija su alt", () => {
    const clean = buildCatalogModernProject({ seed: "clean" });
    clean.assets.forEach((asset) => {
      asset.alt = "Texto alternativo real";
    });

    const assetRequirements = getCatalogModernContentRequirements(clean).filter(
      (item) => item.scope === "asset",
    );
    expect(assetRequirements).toHaveLength(clean.assets.length);
    expect(assetRequirements.every((item) => item.status === "placeholder")).toBe(true);
    expect(clean.assets.every((asset) => isCatalogModernPlaceholderAsset(clean, asset))).toBe(true);
  });

  it("todo target del checklist existe en los seeds con páginas editoriales (sin typos)", () => {
    for (const seed of ["demo", "placeholder"] as const) {
      const project = buildCatalogModernProject({ seed });
      for (const requirement of getCatalogModernContentRequirements(project)) {
        const resolved = resolveTarget(project, requirement.target);
        const message = `${seed}: ${requirement.id} -> ${requirement.target}`;
        expect(resolved, message).toBeDefined();
        const expected =
          requirement.target === "whatsapp.phone" && seed === "demo"
            ? requirement.value === ""
              ? CATALOG_MODERN_PLACEHOLDER_PHONE
              : requirement.value
            : requirement.value;
        expect(asRequirementValue(resolved), message).toBe(expected);
      }
    }
  });

  it("el seed limpio sin Nosotros/Contacto no genera targets muertos en el checklist", () => {
    const clean = buildCatalogModernProject({ seed: "clean" });
    const editorialTargets = getCatalogModernContentRequirements(clean).filter(
      (requirement) =>
        requirement.target.startsWith("pages.about") ||
        requirement.target.startsWith("pages.contact"),
    );
    // El seed clean filtra pages a sólo home; el guidance no debe emitir
    // requisitos para rutas inexistentes (serían targets muertos).
    expect(editorialTargets).toHaveLength(0);
  });

  it("detecta los sentinels de la plantilla aunque el clon sea seed duplicate", () => {
    // Simula el clon base-template del canal agente: hereda los placeholders
    // tipados pero su origen ya no es "clean", así que el detector de frases
    // del seed limpio no aplica. Los sentinels exactos deben igual marcarlos.
    const clone = {
      ...buildCatalogModernProject({ seed: "placeholder" }),
      origin: {
        templateId: "catalog-modern" as const,
        templateVersion: 2,
        seed: "duplicate" as const,
        role: "store" as const,
        updatePolicy: "managed" as const,
      },
    };
    const requirements = getCatalogModernContentRequirements(clone);
    const byId = (id: string) => requirements.find((item) => item.id === id);
    expect(byId("identity.description")?.status).toBe("placeholder");
    // El template de código emite email vacío (los valores tipados sólo
    // existen en respaldos on-disk): el requisito honesto es "missing".
    expect(byId("identity.email")?.status).toBe("missing");
    expect(byId("seo.description")?.status).toBe("placeholder");
    expect(byId("product.product-template-01.title")?.status).toBe("placeholder");
    expect(byId("product.product-template-01.description")?.status).toBe("placeholder");
    expect(byId("category.category-template-01.title")?.status).toBe("placeholder");
  });

  it("el contenido real de una tienda customizada no dispara ningún sentinel", () => {
    const clone = {
      ...buildCatalogModernProject({ seed: "placeholder" }),
      origin: {
        templateId: "catalog-modern" as const,
        templateVersion: 2,
        seed: "duplicate" as const,
        role: "store" as const,
        updatePolicy: "managed" as const,
      },
      identity: {
        ...buildCatalogModernProject({ seed: "placeholder" }).identity,
        legalName: "RM Descartables",
        brandName: "RM Descartables",
        description:
          "Trabajamos exclusivamente en la provincia de Chubut, con atención personalizada.",
        email: "rmventas85@gmail.com",
        phone: "+54 9 280 466-2332",
        address: "Trelew, Chubut, Argentina",
      },
      seo: {
        ...buildCatalogModernProject({ seed: "placeholder" }).seo,
        title: "RM Descartables | Descartables y packaging en Chubut",
        description:
          "Descartables y packaging en Chubut, con entregas rápidas en Trelew, Rawson, Dolavon, Gaiman y zonas cercanas.",
      },
    };
    const requirements = getCatalogModernContentRequirements(clone);
    const byId = (id: string) => requirements.find((item) => item.id === id);
    expect(byId("identity.description")?.status).toBe("ready");
    expect(byId("identity.email")?.status).toBe("ready");
    expect(byId("seo.description")?.status).toBe("ready");
  });
});
