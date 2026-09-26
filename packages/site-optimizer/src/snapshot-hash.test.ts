import type { ImageAsset, StoreProjectV1 } from "@solara/project-schema";
import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { expect, it } from "vitest";
import { optimizeProject } from "./index";

function snapshotAsset(index: number): ImageAsset {
  const source = `data:image/png;base64,${"A".repeat(500_000)}`;
  return {
    kind: "image",
    id: `asset-snapshot-${index}`,
    name: `snapshot-${index}.png`,
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
    hash: `snapshot-${index}`,
  };
}

it("produce un hash determinista y sensible a cambios con un snapshot de 4 MB", () => {
  const project: StoreProjectV1 = {
    ...structuredClone(catalogModernStore),
    assets: Array.from({ length: 2 }, (_, index) => snapshotAsset(index)),
  };
  const embeddedChars = project.assets.reduce(
    (total, asset) =>
      total +
      [
        asset.source,
        asset.fallbackSource ?? "",
        ...(asset.responsiveSources?.map((responsive) => responsive.source) ?? []),
      ].reduce((sum, source) => sum + source.length, 0),
    0,
  );
  expect(embeddedChars).toBeGreaterThan(3_900_000);
  expect(embeddedChars).toBeLessThan(4_100_000);

  const options = { mode: "production" as const, publicAiContext: true };
  const first = optimizeProject(project, options);
  const second = optimizeProject(project, options);
  expect(first.snapshotHash).toMatch(/^[0-9a-f]{8}$/);
  expect(second).toEqual(first);
  expect(first.counts.assets).toBe(project.assets.length);

  const changed: StoreProjectV1 = {
    ...project,
    assets: project.assets.map((asset, index) =>
      index === 0 ? { ...asset, alt: "contenido modificado" } : asset,
    ),
  };
  const third = optimizeProject(changed, options);
  expect(third.snapshotHash).not.toBe(first.snapshotHash);
}, 30_000);
