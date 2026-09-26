import { describe, expect, test } from "vitest";
import {
  getCatalogModernExport,
  getCatalogModernV2Export,
  getReferenceDraftExport,
} from "./export-shared-fixture";

describe("export-shared-fixture", () => {
  test("el export chico modern se comparte (misma referencia)", () => {
    expect(getCatalogModernExport()).toBe(getCatalogModernExport());
  });

  test("el export draft de referencia se comparte (misma referencia)", () => {
    const draft = getReferenceDraftExport();
    expect(draft).toBe(getReferenceDraftExport());
    expect(String(draft.files.get("robots.txt"))).toContain("Disallow: /");
  });

  test("el export chico modern-v2 se comparte (misma referencia)", () => {
    expect(getCatalogModernV2Export()).toBe(getCatalogModernV2Export());
  });
});
