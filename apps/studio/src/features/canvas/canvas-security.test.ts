import { describe, expect, it } from "vitest";
import { parseCanvasMessage, validateCanvasSelection } from "./canvasBridge.js";

/**
 * Chaos y seguridad del Live Canvas (Fase 10 del plan).
 * Cobertura a nivel de contrato del bridge (la misma validación que corre en
 * el Preview): mensajes spoofed, sesión obsoleta, nonce inválido, editId
 * inexistente, payloads enormes y XSS en los valores del mensaje.
 */

const manifest = [{ editId: "ce-sec-title", sectionId: "sec", fieldKey: "title" }];

function optionsFor(overrides: Partial<{ session: string; nonces: string[] }> = {}) {
  const nonces = new Set(overrides.nonces ?? ["n1"]);
  return {
    activeSession: overrides.session ?? "s1",
    manifestEntries: manifest,
    pendingNonces: nonces,
    consumeNonce: (nonce: string) => nonces.delete(nonce),
  };
}

describe("seguridad del canvas bridge", () => {
  it("spoofing: un mensaje de otra ventana no llega a validar (source check en Preview); el schema igual rechaza basura", () => {
    expect(parseCanvasMessage("<script>alert(1)</script>")).toBeUndefined();
    expect(
      parseCanvasMessage({ type: "solara-canvas-select", __proto__: { admin: true } }),
    ).toBeUndefined();
  });

  it("sesión obsoleta: rechazada", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "vieja",
      nonce: "n1",
      editId: "ce-sec-title",
      sectionId: "sec",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(
      validateCanvasSelection(message as NonNullable<typeof message>, optionsFor()),
    ).toBeUndefined();
  });

  it("nonce inválido o reutilizado: rechazado", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s1",
      nonce: "otro",
      editId: "ce-sec-title",
      sectionId: "sec",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(
      validateCanvasSelection(message as NonNullable<typeof message>, optionsFor()),
    ).toBeUndefined();
  });

  it("editId inexistente en el manifest: rechazado", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s1",
      nonce: "n1",
      editId: "ce-otra-seccion-title",
      sectionId: "otra",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(
      validateCanvasSelection(message as NonNullable<typeof message>, optionsFor()),
    ).toBeUndefined();
  });

  it("payload enorme: rechazado por límite de editId", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s1",
      nonce: "n1",
      editId: `ce-sec-${"a".repeat(500)}`,
      sectionId: "sec",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(message).toBeUndefined();
  });

  it("XSS en sectionId/nonce: no rompe el parse pero la validación exige manifest", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s1",
      nonce: '"><img src=x onerror=alert(1)>',
      editId: "ce-sec-title",
      sectionId: '"><svg onload=alert(1)>',
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(message).toMatchObject({
      type: "solara-canvas-select",
      session: "s1",
      nonce: '"><img src=x onerror=alert(1)>',
      sectionId: '"><svg onload=alert(1)>',
    });
    // El nonce no está en los pendientes: rechazado antes de tocar el manifest.
    expect(
      validateCanvasSelection(message as NonNullable<typeof message>, optionsFor()),
    ).toBeUndefined();
  });
});
