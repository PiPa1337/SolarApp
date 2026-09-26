import { referenceStore } from "@solara/project-schema/fixture";
import { describe, expect, it } from "vitest";
import type { CartLine, WhatsAppMessageProject } from "./index";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  formatMoney,
  orderFingerprint,
  STOREFRONT_RUNTIME_JS,
  splitOrderParts,
} from "./index";

function makeProduct(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: "p1",
    variantId: "v1",
    title: "Producto Base",
    variantTitle: "Variante Base",
    sku: "SKU-001",
    unitPrice: 150000,
    quantity: 1,
    ...overrides,
  };
}
function makeStore(): WhatsAppMessageProject {
  return referenceStore;
}
const customer = {
  name: "Malena Ortiz",
  phone: "11 5555 0142",
  address: "Av. Forest 842",
  notes: "",
};
const PHONE = "5491123456789";

describe("WhatsApp multiparte - builder v2", () => {
  it("renglon con cantidad, variante y subtotal exacto en centavos", () => {
    const msg = buildWhatsAppMessage(
      makeStore(),
      [makeProduct({ title: "Vaso", variantTitle: "x50", unitPrice: 19650, quantity: 3 })],
      customer,
    );
    expect(msg).toContain(`- 3x Vaso (x50) = ${formatMoney(19650 * 3)}`);
    expect(msg).toContain(formatMoney(19650 * 3));
  });
  it("cantidad 1 omite el prefijo y variante Unica se oculta", () => {
    const msg = buildWhatsAppMessage(
      makeStore(),
      [makeProduct({ title: "Papel", variantTitle: "Única", unitPrice: 17550, quantity: 1 })],
      customer,
    );
    expect(msg).toContain(`- Papel = ${formatMoney(17550)}`);
    expect(msg).not.toContain("1x Papel");
    expect(msg).not.toContain("(Única)");
  });
  it("una sola parte: sin headers de parte, sin ID, con total y cliente", () => {
    const parts = splitOrderParts(
      makeStore(),
      [makeProduct({ title: "A", variantTitle: "V1", unitPrice: 100000, quantity: 2 })],
      customer,
    );
    expect(parts.length).toBe(1);
    expect(parts[0]).not.toContain("Parte 1 de 1");
    expect(parts[0]).not.toContain("Pedido #");
    expect(parts[0]).not.toContain("Subtotal de esta parte");
    expect(parts[0]).toContain(formatMoney(200000));
    expect(parts[0]).toContain("Malena Ortiz");
    expect(buildWhatsAppUrl(PHONE, parts[0] as string).length).toBeLessThanOrEqual(3900);
  });
  it("sanitiza titulos: colapsa whitespace y elimina asteriscos", () => {
    const msg = buildWhatsAppMessage(
      makeStore(),
      [makeProduct({ title: "Remera\n*Con*  Salto", variantTitle: "V1\nV2" })],
      customer,
    );
    expect(msg).toContain("- Remera Con Salto (V1 V2) = ");
    expect(msg).not.toContain("Remera\n");
    expect(msg).not.toContain("*Con*");
  });
  it("translitera acentos en titulos pero preserva la enie y los datos del cliente", () => {
    const msg = buildWhatsAppMessage(
      makeStore(),
      [makeProduct({ title: "Copa térmica", variantTitle: "Niño" })],
      { ...customer, name: "José García", notes: "año 2026" },
    );
    expect(msg).toContain("Copa termica (Niño)");
    expect(msg).toContain("José García");
    expect(msg).toContain("año 2026");
  });
  it("dedupe: lineas identicas se fusionan sumando cantidad", () => {
    const parts = splitOrderParts(
      makeStore(),
      [makeProduct({ quantity: 1 }), makeProduct({ quantity: 2 })],
      customer,
    );
    expect(parts.length).toBe(1);
    expect(parts[0]).toContain(`3x Producto Base (Variante Base) = ${formatMoney(150000 * 3)}`);
  });
});

describe("WhatsApp multiparte - split", () => {
  function cart60(): CartLine[] {
    return Array.from({ length: 60 }, (_, i) =>
      makeProduct({
        productId: `p${i}`,
        variantId: `v${i}`,
        title: `Producto ${i}`,
        variantTitle: `V${i}`,
        unitPrice: 10000 + i,
        quantity: 1 + (i % 3),
      }),
    );
  }
  it("60 renglones: 2 partes 50+10 con headers, subtotales que suman el total", () => {
    const lines = cart60();
    const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const parts = splitOrderParts(makeStore(), lines, customer);
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/\*Pedido #[0-9A-F]{4} · Parte 1 de 2\*/);
    expect(parts[1]).toMatch(/\*Pedido #[0-9A-F]{4} · Parte 2 de 2\*/);
    const fp = (parts[0] as string).match(/Pedido #([0-9A-F]{4})/)?.[1];
    expect(parts[1] as string).toContain(`Pedido #${fp}`);
    const sub1 = lines.slice(0, 50).reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    expect(parts[0]).toContain(`Subtotal de esta parte: ${formatMoney(sub1)}`);
    expect(parts[0]).toContain("Sigue en la parte 2 →");
    expect(parts[0]).not.toContain("Malena Ortiz");
    expect(parts[0]).not.toContain("Total del pedido");
    expect(parts[1]).toContain(`Total del pedido: ${formatMoney(total)}`);
    expect(parts[1]).toContain("Malena Ortiz");
    expect(parts[1]).toContain("✓ Fin del pedido (2/2)");
    expect(parts[1]).not.toContain("Sigue en la parte");
    for (const p of parts) {
      expect(buildWhatsAppUrl(PHONE, p as string).length).toBeLessThanOrEqual(3900);
    }
  });
  it("tope de 12 partes: el excedente vuelve a renglon de resumen", () => {
    const lines = Array.from({ length: 601 }, (_, i) =>
      makeProduct({
        productId: `q${i}`,
        variantId: `w${i}`,
        title: "X",
        variantTitle: "Única",
        unitPrice: 100,
        quantity: 1,
      }),
    );
    const parts = splitOrderParts(makeStore(), lines, customer);
    expect(parts.length).toBe(12);
    expect(parts[11]).toContain("productos mas (incluidos en el total)");
    expect(parts[11]).toContain("✓ Fin del pedido (12/12)");
    for (const p of parts) {
      expect(buildWhatsAppUrl(PHONE, p as string).length).toBeLessThanOrEqual(3900);
    }
  });
  it("orderFingerprint estable ante reorden y sensible a cambios", () => {
    const a = [
      makeProduct({ quantity: 1 }),
      makeProduct({ productId: "p2", variantId: "v2", quantity: 2 }),
    ];
    const b = [
      makeProduct({ productId: "p2", variantId: "v2", quantity: 2 }),
      makeProduct({ quantity: 1 }),
    ];
    const c = [
      makeProduct({ quantity: 3 }),
      makeProduct({ productId: "p2", variantId: "v2", quantity: 2 }),
    ];
    expect(orderFingerprint(a)).toMatch(/^[0-9A-F]{4}$/);
    expect(orderFingerprint(a)).toBe(orderFingerprint(b));
    expect(orderFingerprint(a)).not.toBe(orderFingerprint(c));
  });
});

describe("WhatsApp multiparte - drawer serializado", () => {
  it("el runtime serializado incluye split, fingerprint, copiar y reinicio", () => {
    expect(STOREFRONT_RUNTIME_JS).toContain("splitOrderParts(");
    expect(STOREFRONT_RUNTIME_JS).toContain("orderFingerprint(");
    expect(STOREFRONT_RUNTIME_JS).toContain("Copiar pedido completo");
    expect(STOREFRONT_RUNTIME_JS).toContain("Empezar de nuevo");
    expect(STOREFRONT_RUNTIME_JS).toContain("El pedido se envía en");
    expect(STOREFRONT_RUNTIME_JS).toContain("El total viaja en la última parte");
    expect(STOREFRONT_RUNTIME_JS).toContain("El carrito cambió: reenviá desde la parte 1");
    expect(STOREFRONT_RUNTIME_JS).toContain('setAttribute("role", "status")');
    expect(STOREFRONT_RUNTIME_JS).toContain("const splitOrderParts = function splitOrderParts");
    expect(STOREFRONT_RUNTIME_JS).toContain("const orderFingerprint = function orderFingerprint");
  });
});
