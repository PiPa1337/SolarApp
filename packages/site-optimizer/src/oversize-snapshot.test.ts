/**
 * Regresión: `normalizeForHash` serializaba el proyecto completo en UNA sola
 * cadena antes de hashearla. Con proyectos reales cuyos recursos embebidos
 * superan el límite de cadena de V8 (536.870.888 caracteres), la auditoría
 * moría con `RangeError: Invalid string length` y el panel de exportación
 * mostraba "No se pudo cargar la auditoría: Invalid string length".
 *
 * El hash del snapshot es ahora incremental, acotado por cadena y estable.
 * El proyecto de prueba comparte las mismas cadenas entre casos para no
 * clonar gigabytes en cada test.
 */

import type { ImageAsset, StoreProjectV1 } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { describe, expect, it } from "vitest";
import { optimizeProject } from "./index";

/** Un asset embebido de ~1 MiB por fuente, igual que los del editor. */
function oversizeAsset(index: number): ImageAsset {
  const source = `data:image/png;base64,${"A".repeat(1_000_000)}`;
  return {
    kind: "image",
    id: `asset-oversize-${index}`,
    name: `oversize-${index}.png`,
    alt: "",
    mimeType: "image/png",
    source,
    fallbackSource: source,
    responsiveSources: [
      { width: 480, source },
      { width: 1800, source },
    ],
    width: 1800,
    height: 1200,
    hash: `oversize-${index}`,
  };
}

/** 135 assets × ~4 copias de 1 MiB ≈ 540 M caracteres > límite de V8. */
let oversize: StoreProjectV1 | undefined;
function oversizeProject(): StoreProjectV1 {
  oversize ??= {
    ...structuredClone(catalogModernStore),
    assets: Array.from({ length: 135 }, (_, index) => oversizeAsset(index)),
  };
  return oversize;
}

describe("optimizeProject con proyectos que exceden el límite de cadena de V8", () => {
  it(
    "audita sin lanzar Invalid string length y produce un hash acotado",
    { timeout: 30_000 },
    () => {
      const project = oversizeProject();
      const embeddedChars = project.assets.reduce((total, asset) => {
        const sources = [
          asset.source,
          asset.fallbackSource ?? "",
          ...(asset.responsiveSources?.map((responsive) => responsive.source) ?? []),
        ];
        return total + sources.reduce((sum, source) => sum + source.length, 0);
      }, 0);
      // La serialización plana del proyecto DEBERÍA superar el límite de V8:
      // si este guard se debilita, el test deja de ejercitar la regresión.
      expect(embeddedChars).toBeGreaterThan(536_870_888);

      const report = optimizeProject(project, { mode: "production", publicAiContext: true });
      expect(report.snapshotHash).toMatch(/^[0-9a-f]{8}$/);
      expect(report.counts.assets).toBe(project.assets.length);
    },
  );

  it("mantiene el hash determinista y sensible a cambios del proyecto", { timeout: 30_000 }, () => {
    const project = oversizeProject();
    const first = optimizeProject(project, { mode: "production", publicAiContext: true });
    const second = optimizeProject(project, { mode: "production", publicAiContext: true });
    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first).toEqual(second);

    // Mismo peso, distinto contenido observable del snapshot.
    const changed: StoreProjectV1 = {
      ...project,
      assets: [...project.assets, oversizeAsset(999_999)],
    };
    const third = optimizeProject(changed, { mode: "production", publicAiContext: true });
    expect(third.snapshotHash).not.toBe(first.snapshotHash);
  });
});
