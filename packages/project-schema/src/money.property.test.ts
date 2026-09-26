import { describe, expect, it } from "vitest";
import { formatPrice } from "./money";

function mulberry32(seed: number) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromEnv() {
  const raw = process.env.SOLARA_TEST_SEED ?? "20260923";
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`SOLARA_TEST_SEED debe ser un entero; recibido: ${raw}`);
  }
  return parsed;
}

function normalize(value: string) {
  return value.replace("\u00A0", " ");
}

describe("formatPrice properties", () => {
  it("mantiene determinismo y la cantidad de decimales para 500 valores reproducibles", () => {
    const seed = seedFromEnv();
    const rand = mulberry32(seed);
    for (let index = 0; index < 500; index++) {
      const cents = Math.floor(rand() * 20_000_001) - 10_000_000;
      const always = normalize(formatPrice(cents, { priceFractionDisplay: "always" }));
      const auto = normalize(formatPrice(cents, { priceFractionDisplay: "auto" }));
      expect(
        normalize(formatPrice(cents, { priceFractionDisplay: "always" })),
        `seed=${seed} index=${index} cents=${cents}`,
      ).toBe(always);
      expect(always, `seed=${seed} index=${index} cents=${cents}`).toMatch(/,\d{2}$/);
      if (cents % 100 === 0)
        expect(auto, `seed=${seed} index=${index} cents=${cents}`).not.toMatch(/,\d{2}$/);
      else expect(auto, `seed=${seed} index=${index} cents=${cents}`).toMatch(/,\d{2}$/);
    }
  });

});
