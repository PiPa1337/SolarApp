/** Contrato de publicAssetPaths: cada ruta existe y guarda los bytes exactos. */

import type { StoreProjectV1 } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import { dataUrlBytes, exportProject, publicAssetPaths, publicMediaUsage } from "./index.js";
import { buildFaviconIco } from "./pwa.js";

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

function expectMapMatchesFiles(project: StoreProjectV1, semanticNames: boolean): void {
  const result = exportProject(project, { mode: "production", useSemanticNames: semanticNames });
  const paths = publicAssetPaths(project, publicMediaUsage(project), semanticNames);
  expect(paths.size).toBeGreaterThan(0);
  for (const [id, path] of paths) {
    const file = result.files.get(path);
    expect(file, `falta el archivo mapeado ${path} (${id})`).toBeInstanceOf(Uint8Array);
    if (typeof file === "string") throw new Error(`Se esperaba binario en ${path}.`);
    const entity = [...project.assets, ...project.videos].find((item) => item.id === id);
    const original = dataUrlBytes(entity?.source ?? "");
    if (!original) throw new Error(`El fixture trae data URL inválida: ${id}.`);
    expect(sameBytes(file, original), `bytes distintos en ${path}`).toBe(true);
  }
}

describe("publicAssetPaths", () => {
  it("mapea bytes exactos en fixtures reales (nombres simples)", () => {
    expectMapMatchesFiles(referenceStore, false);
  });

  it("mapea bytes exactos en fixtures reales (nombres semánticos)", () => {
    expectMapMatchesFiles(catalogModernStore, true);
  });

  it("omite sources http (no tienen archivo, se conservan tal cual)", () => {
    const project = structuredClone(referenceStore) as StoreProjectV1;
    project.assets.push({
      kind: "image",
      id: "asset-remota-map" as StoreProjectV1["assets"][number]["id"],
      name: "Remota",
      alt: "",
      mimeType: "image/jpeg",
      source: "https://ejemplo.test/foto.jpg",
      width: 800,
      height: 600,
      hash: "test-remota-map",
    });
    expect(publicAssetPaths(project, publicMediaUsage(project)).has("asset-remota-map")).toBe(
      false,
    );
  });

  it("mapea el favicon x-icon a favicon.ico con bytes exactos", () => {
    const project = structuredClone(referenceStore) as StoreProjectV1;
    const icoId = "asset-favicon-ico" as StoreProjectV1["assets"][number]["id"];
    const icoBytes = buildFaviconIco("favicon-map-test");
    let binary = "";
    for (const byte of icoBytes) binary += String.fromCharCode(byte);
    project.assets.push({
      kind: "image",
      id: icoId,
      name: "Favicon",
      alt: "",
      mimeType: "image/x-icon",
      source: `data:image/x-icon;base64,${btoa(binary)}`,
      width: 256,
      height: 256,
      hash: "test-favicon-ico",
    });
    project.seo.faviconAssetId = icoId;
    const paths = publicAssetPaths(project, publicMediaUsage(project));
    expect(paths.get(icoId)).toBe("favicon.ico");
    const result = exportProject(project, { mode: "production" });
    const file = result.files.get("favicon.ico");
    if (!(file instanceof Uint8Array)) throw new Error("favicon.ico no es binario.");
    expect(sameBytes(file, icoBytes)).toBe(true);
  });

  it("mapea videos data: a assets/<hash>.mp4 presentes en el sitio", () => {
    const project = structuredClone(referenceStore) as StoreProjectV1;
    const videoId = "video-map-test" as StoreProjectV1["videos"][number]["id"];
    project.videos.push({
      kind: "video",
      id: videoId,
      name: "Video de prueba",
      alt: "",
      mimeType: "video/mp4",
      source: "data:video/mp4;base64,QUJD",
      posterAssetId: "asset-manta" as StoreProjectV1["assets"][number]["id"],
      width: 640,
      height: 480,
      durationSeconds: 5,
      hash: "test-video-map",
    });
    const host = project.products.find((product) => product.status === "active");
    if (!host) throw new Error("El fixture no tiene productos activos.");
    host.videoIds = [videoId];
    const paths = publicAssetPaths(project, publicMediaUsage(project));
    expect(paths.get(videoId)).toBe("assets/test-video-map.mp4");
    const result = exportProject(project, { mode: "production" });
    expect(result.files.has("assets/test-video-map.mp4")).toBe(true);
  });
});
