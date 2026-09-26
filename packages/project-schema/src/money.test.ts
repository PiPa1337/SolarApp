import { describe, expect, it } from "vitest";
import { referenceStore } from "./fixture";
import { StoreProjectV2Schema } from "./index";
import { formatPrice } from "./money";

describe("formatPrice", () => {
  const cases: Array<[number, string, string]> = [
    [0, "always", "$ 0,00"],
    [0, "auto", "$ 0"],
    [1, "always", "$ 0,01"],
    [1, "auto", "$ 0,01"],
    [99, "always", "$ 0,99"],
    [99, "auto", "$ 0,99"],
    [100, "always", "$ 1,00"],
    [100, "auto", "$ 1"],
    [150000, "always", "$ 1.500,00"],
    [150000, "auto", "$ 1.500"],
    [150050, "always", "$ 1.500,50"],
    [150050, "auto", "$ 1.500,50"],
    [150001, "always", "$ 1.500,01"],
    [150001, "auto", "$ 1.500,01"],
    [150010, "always", "$ 1.500,10"],
    [150010, "auto", "$ 1.500,10"],
    [99999900, "always", "$ 999.999,00"],
    [99999900, "auto", "$ 999.999"],
    [123456789, "always", "$ 1.234.567,89"],
    [123456789, "auto", "$ 1.234.567,89"],
  ];

  for (const [cents, display, expected] of cases) {
    it(`formatea ${cents} centavos con ${display} → ${expected}`, () => {
      const got = formatPrice(cents, { priceFractionDisplay: display as any });
      // Normalizar espacio: algunos locales usan NBSP
      expect(got.replace("\u00A0", " ")).toBe(expected);
    });
  }

  it("rechaza valores que no son enteros seguros", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatPrice(value), `value=${String(value)}`).toThrow(/entero en centavos/i);
    }
  });

  it("nunca redondea ni trunca centavos distintos de 00", () => {
    expect(formatPrice(150001, { priceFractionDisplay: "auto" }).replace("\u00A0", " ")).toBe(
      "$ 1.500,01",
    );
    expect(formatPrice(150099, { priceFractionDisplay: "auto" }).replace("\u00A0", " ")).toBe(
      "$ 1.500,99",
    );
    expect(formatPrice(1, { priceFractionDisplay: "auto" }).replace("\u00A0", " ")).toBe("$ 0,01");
  });

  it("usa default always para proyectos existentes sin campo", () => {
    const legacy = structuredClone(referenceStore);
    // @ts-expect-error: simular proyecto viejo sin campo
    delete (legacy as any).priceFractionDisplay;
    const parsed = StoreProjectV2Schema.parse(legacy);
    expect((parsed as any).priceFractionDisplay).toBe("always");
    expect(
      formatPrice(150000, { priceFractionDisplay: (parsed as any).priceFractionDisplay }).replace(
        "\u00A0",
        " ",
      ),
    ).toBe("$ 1.500,00");
  });

  it("preserva always como default explicito", () => {
    const parsed = StoreProjectV2Schema.parse(referenceStore);
    expect((parsed as any).priceFractionDisplay).toBe("always");
  });
});
