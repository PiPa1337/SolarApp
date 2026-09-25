import { expect, test } from "@playwright/test";
import { exportProject } from "@solara/exporter";
import { catalogModernV2Store } from "@solara/project-schema/catalog-modern-v2-fixture";

test("draft: runtime marcado como debuggeable", () => {
  const result = exportProject(catalogModernV2Store, { mode: "draft" });
  const runtimePath = [...result.files.keys()].find((path) =>
    /^assets\/storefront\.[a-f0-9]+\.js$/i.test(path),
  );
  expect(runtimePath).toMatch(/^assets\/storefront\.[a-f0-9]+\.js$/i);
  const js = String(result.files.get(runtimePath ?? ""));
  expect(js).toContain("// DEBUG: modo draft");
});

test("production: runtime inline serializado sin sourcemap", () => {
  const result = exportProject(catalogModernV2Store, { mode: "production" });
  const runtimePath = [...result.files.keys()].find((path) =>
    /^assets\/storefront\.[a-f0-9]+\.js$/i.test(path),
  );
  expect(runtimePath).toMatch(/^assets\/storefront\.[a-f0-9]+\.js$/i);
  const js = String(result.files.get(runtimePath ?? ""));
  expect(js).not.toContain("sourceMappingURL");
});
