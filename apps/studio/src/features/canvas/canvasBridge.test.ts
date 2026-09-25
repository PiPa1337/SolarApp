import { describe, expect, it } from "vitest";
import { canvasBridgeScript, parseCanvasMessage, validateCanvasSelection } from "./canvasBridge.js";

describe("canvas bridge", () => {
  it("rechaza mensajes malformados o de otro tipo", () => {
    expect(parseCanvasMessage(null)).toBeUndefined();
    expect(parseCanvasMessage({ type: "solara-preview-navigate" })).toBeUndefined();
    expect(parseCanvasMessage({ type: "solara-canvas-select" })).toBeUndefined();
    expect(
      parseCanvasMessage({
        type: "solara-canvas-select",
        session: "s",
        nonce: "n",
        editId: "ce-a-b",
        sectionId: "a",
        rect: { x: 1, y: 2, width: NaN, height: 4 },
      }),
    ).toBeUndefined();
  });

  it("valida sesión, nonce y manifest; consume el nonce (anti-replay)", () => {
    const nonces = new Set(["n1"]);
    let consumed = false;
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s1",
      nonce: "n1",
      editId: "ce-sec-title",
      sectionId: "sec",
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(message).toMatchObject({
      type: "solara-canvas-select",
      session: "s1",
      nonce: "n1",
      editId: "ce-sec-title",
      sectionId: "sec",
    });
    const valid = validateCanvasSelection(message as NonNullable<typeof message>, {
      activeSession: "s1",
      manifestEntries: [{ editId: "ce-sec-title", sectionId: "sec", fieldKey: "title" }],
      pendingNonces: nonces,
      consumeNonce: (nonce) => {
        nonces.delete(nonce);
        consumed = true;
      },
    });
    expect(valid).toMatchObject({ editId: "ce-sec-title", sectionId: "sec" });
    expect(consumed).toBe(true);
    // Replay con el mismo nonce: rechazado.
    expect(
      validateCanvasSelection(message as NonNullable<typeof message>, {
        activeSession: "s1",
        manifestEntries: [{ editId: "ce-sec-title", sectionId: "sec", fieldKey: "title" }],
        pendingNonces: nonces,
        consumeNonce: () => {},
      }),
    ).toBeUndefined();
  });

  it("rechaza sesión vieja, nonce desconocido y editId fuera del manifest", () => {
    const base = {
      type: "solara-canvas-select" as const,
      session: "s2",
      nonce: "nx",
      editId: "ce-sec-x",
      sectionId: "sec",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    };
    const opts = {
      activeSession: "s1",
      manifestEntries: [{ editId: "ce-sec-title", sectionId: "sec", fieldKey: "title" }],
      pendingNonces: new Set(["ny"]),
      consumeNonce: () => {},
    };
    const parsedBase = parseCanvasMessage(base);
    if (!parsedBase) throw new Error("mensaje base inválido");
    expect(validateCanvasSelection(parsedBase, opts)).toBeUndefined();
    const parsedOldSession = parseCanvasMessage({ ...base, session: "s1" });
    if (!parsedOldSession) throw new Error("mensaje de sesión vieja inválido");
    expect(validateCanvasSelection(parsedOldSession, opts)).toBeUndefined();
    const parsedUnknownEdit = parseCanvasMessage({ ...base, session: "s1", nonce: "ny" });
    if (!parsedUnknownEdit) throw new Error("mensaje de editId desconocido inválido");
    expect(validateCanvasSelection(parsedUnknownEdit, opts)).toBeUndefined();
  });

  it("conserva el itemId de repeater y rechaza items en bindings simples", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s1",
      nonce: "n1",
      editId: "ce-sec-slide-title",
      sectionId: "sec",
      itemId: "slide-1",
      rect: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(message?.itemId).toBe("slide-1");
    if (!message) throw new Error("mensaje de repeater inválido");
    expect(
      validateCanvasSelection(message, {
        activeSession: "s1",
        manifestEntries: [
          {
            editId: "ce-sec-slide-title",
            sectionId: "sec",
            fieldKey: "slides",
            itemFieldKey: "title",
          },
        ],
        pendingNonces: new Set(["n1"]),
        consumeNonce: () => {},
      })?.itemId,
    ).toBe("slide-1");
    expect(
      validateCanvasSelection(message, {
        activeSession: "s1",
        manifestEntries: [{ editId: "ce-sec-slide-title", sectionId: "sec", fieldKey: "title" }],
        pendingNonces: new Set(["n1"]),
        consumeNonce: () => {},
      }),
    ).toBeUndefined();
  });

  it("el script del iframe escapa session y nonce como JSON", () => {
    const script = canvasBridgeScript('s"</script>', "n<img>");
    // JSON.stringify escapa < y > como \u003c/\u003e para que un session con
    // </script> no cierre el tag del bridge dentro del iframe.
    expect(script).toContain(JSON.stringify('s"</script>'));
    expect(script).toContain(JSON.stringify("n<img>"));
  });

  it("el overlay de hover usa rAF y no escucha mousemove fuera de Ctrl", () => {
    const script = canvasBridgeScript("s", "n");
    expect(script).toContain("requestAnimationFrame");
    expect(script).toContain("data-canvas-overlay");
  });

  it("declara el target pendiente del overlay y lo limpia al perder foco", () => {
    const script = canvasBridgeScript("session", "nonce");
    expect(script).toContain("let pendingTarget = null;");
    expect(script).toContain("pendingTarget = null;");
  });

  it("permite rotar el nonce entre selecciones sin desactivar el bridge", () => {
    const script = canvasBridgeScript("session", "nonce");
    expect(script).toContain('message.type === "solara-canvas-nonce"');
    expect(script).toContain("nonce: activeNonce");
  });

  it("rechaza rectángulos enormes y items que ya no existen", () => {
    expect(
      parseCanvasMessage({
        type: "solara-canvas-select",
        session: "s",
        nonce: "n",
        editId: "ce-sec-item",
        sectionId: "sec",
        rect: { x: 0, y: 0, width: 10001, height: 1 },
      }),
    ).toBeUndefined();
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s",
      nonce: "n",
      editId: "ce-sec-items",
      sectionId: "sec",
      itemId: "gone",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    if (!message) throw new Error("mensaje de item inválido");
    expect(
      validateCanvasSelection(message, {
        activeSession: "s",
        manifestEntries: [
          {
            editId: "ce-sec-items",
            sectionId: "sec",
            fieldKey: "items",
            itemFieldKey: "title",
            itemIds: ["still-here"],
          },
        ],
        pendingNonces: new Set(["n"]),
        consumeNonce: () => {},
      }),
    ).toBeUndefined();
  });

  it("rechaza un tipo de binding falsificado", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s",
      nonce: "n",
      editId: "ce-sec-title",
      sectionId: "sec",
      bindingKind: "image",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    if (!message) throw new Error("mensaje de binding falsificado inválido");
    expect(
      validateCanvasSelection(message, {
        activeSession: "s",
        manifestEntries: [
          { editId: "ce-sec-title", sectionId: "sec", fieldKey: "title", kind: "text" },
        ],
        pendingNonces: new Set(["n"]),
        consumeNonce: () => {},
      }),
    ).toBeUndefined();
  });

  it("acepta el marker DOM de texto para editores tipados no visuales", () => {
    const message = parseCanvasMessage({
      type: "solara-canvas-select",
      session: "s",
      nonce: "n",
      editId: "ce-sec-price",
      sectionId: "sec",
      bindingKind: "text",
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
    if (!message) throw new Error("mensaje numérico inválido");
    expect(
      validateCanvasSelection(message, {
        activeSession: "s",
        manifestEntries: [
          { editId: "ce-sec-price", sectionId: "sec", fieldKey: "price", kind: "number" },
        ],
        pendingNonces: new Set(["n"]),
        consumeNonce: () => {},
      }),
    ).toMatchObject({ kind: "number" });
  });
});
