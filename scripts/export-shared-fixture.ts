import { exportProject } from "../packages/exporter/src/index";
import { catalogModernStore } from "../packages/project-schema/src/catalog-modern-fixture";
import { catalogModernV2Store } from "../packages/project-schema/src/catalog-modern-v2-fixture";
import { referenceStore } from "../packages/project-schema/src/fixture";
import { catalogScaleStore } from "../packages/project-schema/src/scale-fixture";

const cachedSmallExports = new Map<string, ReturnType<typeof exportProject>>();
const cachedSmallDraftExports = new Map<string, ReturnType<typeof exportProject>>();

function getSmallExport(key: string, project: Parameters<typeof exportProject>[0]) {
  let cached = cachedSmallExports.get(key);
  if (!cached) {
    cached = exportProject(project, { mode: "production" });
    cachedSmallExports.set(key, cached);
  }
  return cached;
}

export function getCatalogModernExport() {
  return getSmallExport("catalogModern", catalogModernStore);
}

export function getCatalogModernV2Export() {
  return getSmallExport("catalogModernV2", catalogModernV2Store);
}

export function getReferenceExport() {
  return getSmallExport("reference", referenceStore);
}

export function getCatalogScaleExport() {
  return getSmallExport("catalogScale", catalogScaleStore);
}

export function getReferenceDraftExport() {
  let cached = cachedSmallDraftExports.get("reference");
  if (!cached) {
    cached = exportProject(referenceStore, { mode: "draft" });
    cachedSmallDraftExports.set("reference", cached);
  }
  return cached;
}
