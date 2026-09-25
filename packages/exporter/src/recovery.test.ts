/** Bóveda de recuperación flaca: contrato de split/restore sin bytes duplicados. */

import type { StoreProjectV1 } from "@solara/project-schema";
import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import { publicMediaUsage } from "./index.js";
import {
  buildRecoveryAssetRefs,
  newRecoveryDir,
  parseRecoveryManifest,
  REF_PREFIX,
  type RecoveryManifest,
  restoreAssetSources,
  splitSlimProject,
} from "./recovery.js";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type TestAsset = StoreProjectV1["assets"][number];

function hiddenAsset(id: string): TestAsset {
  return {
    kind: "image",
    id: id as TestAsset["id"],
    name: "Oculta de prueba",
    alt: "",
    mimeType: "image/png",
    source: PNG_1PX,
    width: 1,
    height: 1,
    hash: `test-${id}`,
  } as TestAsset;
}

/** Clona la tienda con un producto archivado (PMU lo ignora) + asset sin uso. */
function projectWithHidden(): { project: StoreProjectV1; hiddenId: TestAsset["id"] } {
  const project = structuredClone(referenceStore) as StoreProjectV1;
  const base = project.products.find((product) => product.status === "active");
  if (!base) throw new Error("El fixture no tiene productos activos.");
  const hiddenId = "asset-oculta-test" as TestAsset["id"];
  project.assets.push(hiddenAsset(hiddenId));
  project.products.push({
    ...structuredClone(base),
    id: "prod-oculto-test" as (typeof base)["id"],
    slug: "oculto-test",
    title: "Producto oculto de prueba",
    status: "archived",
    categoryIds: [],
    collectionIds: [],
    imageIds: [hiddenId],
    variants: base.variants.map(
      (variant, index) =>
        ({ ...variant, id: `${variant.id}-oculto-${index}` }) as (typeof base)["variants"][number],
    ),
  });
  return { project, hiddenId };
}

describe("newRecoveryDir", () => {
  it("genera rutas solara-recovery/<64 hex> únicas", () => {
    const first = newRecoveryDir();
    const second = newRecoveryDir();
    expect(first).toMatch(/^solara-recovery\/[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });
});

describe("parseRecoveryManifest", () => {
  const valid: RecoveryManifest = {
    format: "solara-recovery",
    version: 1,
    projectId: "store-demo",
    exportedAt: "2026-01-01T00:00:00.000Z",
    schemaVersion: 2,
    templateVersion: 1,
    rendererFingerprint: null,
    assetBasePath: "/",
    slimFile: "solara-recovery/abc/slim.json.gz",
    assetsFile: "solara-recovery/abc/assets.json",
    slimSha256: "0".repeat(64),
    slimGzipBytes: 10,
    slimRawBytes: 20,
    assetsSha256: "1".repeat(64),
    coverage: "published-only",
    missing: [],
  };

  it("acepta un manifiesto válido", () => {
    expect(parseRecoveryManifest(structuredClone(valid)).projectId).toBe("store-demo");
  });

  it("rechaza formato, versión o projectId inválidos", () => {
    expect(() => parseRecoveryManifest({ ...valid, format: "otro" })).toThrow(/compatible/);
    expect(() => parseRecoveryManifest({ ...valid, version: 999 })).toThrow(/compatible/);
    expect(() => parseRecoveryManifest({ ...valid, projectId: 42 })).toThrow(/compatible/);
    expect(() => parseRecoveryManifest(null)).toThrow(/compatible/);
  });
});

describe("splitSlimProject", () => {
  it("reemplaza sources data: usados por refs y no deja data: en el slim", () => {
    const used = publicMediaUsage(referenceStore);
    const { slimProject } = splitSlimProject(referenceStore, used);
    expect(JSON.stringify(slimProject)).not.toContain("data:");
    const refIds = slimProject.assets
      .filter((asset) => asset.source.startsWith(REF_PREFIX))
      .map((asset) => asset.id);
    expect(refIds.length).toBeGreaterThan(0);
    for (const asset of slimProject.assets) {
      if (asset.source.startsWith(REF_PREFIX)) {
        expect(used.assetIds.has(asset.id)).toBe(true);
        expect(asset.responsiveSources).toBeUndefined();
        expect(asset.fallbackSource).toBeUndefined();
      }
    }
  });

  it("conserva verbatim las sources http (no pesan, no se listan)", () => {
    const project = structuredClone(referenceStore) as StoreProjectV1;
    const remoteId = "asset-remota-test" as TestAsset["id"];
    project.assets.push({
      ...hiddenAsset(remoteId),
      mimeType: "image/jpeg",
      source: "https://ejemplo.test/foto.jpg",
      hash: "test-remota",
    });
    const used = publicMediaUsage(project);
    const { slimProject, missing } = splitSlimProject(project, used);
    expect(slimProject.assets.find((asset) => asset.id === remoteId)?.source).toBe(
      "https://ejemplo.test/foto.jpg",
    );
    expect(missing.some((item) => item.assetId === remoteId)).toBe(false);
  });

  it("elimina el asset del producto archivado y lo lista con usedBy", () => {
    const { project, hiddenId } = projectWithHidden();
    const used = publicMediaUsage(project);
    expect(used.assetIds.has(hiddenId)).toBe(false);
    const { slimProject, missing } = splitSlimProject(project, used);
    expect(slimProject.assets.some((asset) => asset.id === hiddenId)).toBe(false);
    const entry = missing.find((item) => item.assetId === hiddenId);
    expect(entry?.kind).toBe("image");
    expect(entry?.usedBy.some((path) => path.includes("products"))).toBe(true);
    const hidden = slimProject.products.find((product) => product.id === "prod-oculto-test");
    expect(hidden?.imageIds).toEqual([]);
  });

  it("lista sin usedBy el asset que nadie referencia", () => {
    const project = structuredClone(referenceStore) as StoreProjectV1;
    const lonelyId = "asset-sola-test" as TestAsset["id"];
    project.assets.push(hiddenAsset(lonelyId));
    const used = publicMediaUsage(project);
    const { missing } = splitSlimProject(project, used);
    expect(missing.find((item) => item.assetId === lonelyId)?.usedBy).toEqual([]);
  });

  it("crea referencias solo para medios data: publicados", () => {
    const used = publicMediaUsage(referenceStore);
    const paths = new Map(
      referenceStore.assets
        .filter((asset) => used.assetIds.has(asset.id) && /^data:/i.test(asset.source))
        .map((asset) => [asset.id, `assets/${asset.hash}.webp`]),
    );
    const refs = buildRecoveryAssetRefs(referenceStore, used, paths);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((ref) => ref.file.startsWith("assets/"))).toBe(true);
    expect(refs.every((ref) => ref.kind === "image")).toBe(true);
  });

  it("limpia posterAssetId del video cuyo poster quedó fuera", () => {
    const { project, hiddenId } = projectWithHidden();
    project.videos.push({
      kind: "video",
      id: "video-test" as StoreProjectV1["videos"][number]["id"],
      name: "Video de prueba",
      alt: "",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,QUJD",
      posterAssetId: hiddenId,
      width: 640,
      height: 480,
      durationSeconds: 5,
      hash: "test-video",
    });
    const used = publicMediaUsage(project);
    const { slimProject } = splitSlimProject(project, used);
    expect(slimProject.videos.find((video) => video.id === "video-test")).toBeUndefined();
  });
});

describe("restoreAssetSources", () => {
  it("reconstruye data: idénticos y el proyecto valida contra Zod", async () => {
    const { StoreProjectV2Schema } = await import("@solara/project-schema");
    const used = publicMediaUsage(referenceStore);
    const { slimProject } = splitSlimProject(referenceStore, used);
    const blobs = new Map<string, { bytes: Uint8Array; mimeType: string }>();
    for (const asset of referenceStore.assets) {
      if (!slimProject.assets.some((slim) => slim.id === asset.id)) continue;
      const slim = slimProject.assets.find((item) => item.id === asset.id);
      if (!slim || !slim.source.startsWith(REF_PREFIX)) continue;
      const bytes = dataUrlToBytes(asset.source);
      if (!bytes) throw new Error(`El fixture trae data URL inválida: ${asset.id}.`);
      blobs.set(asset.id, { bytes, mimeType: asset.mimeType });
    }
    const restored = restoreAssetSources(slimProject, blobs);
    for (const asset of restored.assets) {
      const original = referenceStore.assets.find((item) => item.id === asset.id);
      if (original && /^data:/i.test(original.source)) {
        expect(asset.source).toBe(original.source);
      }
    }
    expect(StoreProjectV2Schema.safeParse(restored).success).toBe(true);
  });

  it("lanza nombrando el id cuando falta un blob", () => {
    const used = publicMediaUsage(referenceStore);
    const { slimProject } = splitSlimProject(referenceStore, used);
    const ref = slimProject.assets.find((asset) => asset.source.startsWith(REF_PREFIX));
    expect(ref).toMatchObject({
      id: expect.any(String),
      source: expect.stringContaining(REF_PREFIX),
    });
    expect(() => restoreAssetSources(slimProject, new Map())).toThrow(ref?.id);
  });
});

function dataUrlToBytes(source: string): Uint8Array | undefined {
  const comma = source.indexOf(",");
  if (comma < 0) return undefined;
  try {
    return Buffer.from(source.slice(comma + 1), "base64");
  } catch {
    return undefined;
  }
}
