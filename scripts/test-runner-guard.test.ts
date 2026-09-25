import { describe, expect, it } from "vitest";
import { readCliNumberOption, resolveTimeoutMs } from "./test-runner-guard.mjs";

describe("test runner guard", () => {
  it("usa fallback para valores inválidos y aplica un techo duro", () => {
    expect(resolveTimeoutMs(undefined, 10_000, 60_000)).toBe(10_000);
    expect(resolveTimeoutMs("nope", 10_000, 60_000)).toBe(10_000);
    expect(resolveTimeoutMs("120000", 10_000, 60_000)).toBe(60_000);
    expect(resolveTimeoutMs("2500", 10_000, 60_000)).toBe(2_500);
  });

  it("lee opciones numéricas con sintaxis separada o =valor", () => {
    expect(readCliNumberOption(["run", "--testTimeout", "15000"], "--testTimeout")).toBe(15_000);
    expect(readCliNumberOption(["run", "--testTimeout=30000"], "--testTimeout")).toBe(30_000);
    expect(readCliNumberOption(["run"], "--testTimeout")).toBeNull();
    expect(readCliNumberOption(["run", "--testTimeout=nan"], "--testTimeout")).toBeNull();
  });
});
