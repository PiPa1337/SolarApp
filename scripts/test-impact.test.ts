import { describe, expect, test } from "vitest";
import { contentHash, expandImpactedPackages, selectQuickSmokeSpecs } from "./test-impact.mjs";

describe("test impact", () => {
  test("expande dependientes transitivos sin perder el paquete directo", () => {
    const impacted = expandImpactedPackages(["@solara/core"]);
    expect(impacted).toEqual(
      expect.arrayContaining([
        "@solara/core",
        "@solara/exporter",
        "@solara/studio",
        "@solara/agent-control",
      ]),
    );
    expect(impacted).not.toContain("@solara/project-schema");
  });

  test("un cambio de Studio reduce el smoke quick a specs relevantes más sentinel", () => {
    expect(selectQuickSmokeSpecs(["apps/studio/src/App.tsx"], ["fallback.spec.ts"])).toEqual([
      "tests/e2e/editor-smoke.spec.ts",
      "tests/e2e/focus-visible.spec.ts",
      "tests/e2e/exporter-sentinel.spec.ts",
    ]);
  });

  test("un cambio raíz vuelve al smoke quick completo", () => {
    expect(selectQuickSmokeSpecs(["package.json"], ["a.spec.ts", "b.spec.ts"])).toEqual([
      "a.spec.ts",
      "b.spec.ts",
    ]);
  });

  test("el hash de contenido es determinista e invalida por contexto", () => {
    const first = contentHash(["scripts/test-impact.mjs"], ["context-a"]);
    expect(contentHash(["scripts/test-impact.mjs"], ["context-a"])).toBe(first);
    expect(contentHash(["scripts/test-impact.mjs"], ["context-b"])).not.toBe(first);
  });
  test("un spec E2E modificado se incluye directamente", () => {
    expect(selectQuickSmokeSpecs(["tests/e2e/dashboard-landings.spec.ts"], [])).toEqual([
      "tests/e2e/dashboard-landings.spec.ts",
      "tests/e2e/exporter-sentinel.spec.ts",
    ]);
  });
});
