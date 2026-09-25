import { describe, expect, test } from "vitest";
import { findChangedScriptTests, mapFilesToPackages } from "./test-affected-map.mjs";

describe("mapFilesToPackages post-cambio", () => {
  test("un archivo de core mapea solo a core", () => {
    expect(mapFilesToPackages(["packages/core/src/index.ts"])).toEqual(["@solara/core"]);
  });

  test("scripts/*.mjs no dispara todos los paquetes", () => {
    // Un cambio en un script de infra no debe correr toda la suite
    expect(mapFilesToPackages(["scripts/check-quick.mjs"])).toEqual([]);
  });

  test("scripts/*.test.ts no dispara paquetes y se detecta para ejecución directa", () => {
    expect(mapFilesToPackages(["scripts/enganches.test.ts"])).toEqual([]);
    expect(findChangedScriptTests(["scripts/enganches.test.ts", "scripts/check-quick.mjs"])).toEqual([
      "scripts/enganches.test.ts",
    ]);
  });

  test("tests/e2e mapea al paquete relacionado, no a todos", () => {
    const pkgs = mapFilesToPackages(["tests/e2e/catalog.spec.ts"]);
    expect(pkgs).not.toBeNull();
    expect(pkgs?.length).toBeGreaterThan(0);
    expect(pkgs?.length).toBeLessThanOrEqual(4);
  });

  test("root config sigue disparando todo (null)", () => {
    expect(mapFilesToPackages(["package.json"])).toBeNull();
    expect(mapFilesToPackages(["pnpm-workspace.yaml"])).toBeNull();
  });

  test("varios paquetes (<=4) no disparan todo", () => {
    expect(
      mapFilesToPackages(["packages/core/src/index.ts", "packages/modules/src/index.ts"]),
    ).toEqual(expect.arrayContaining(["@solara/core", "@solara/modules"]));
  });
});
