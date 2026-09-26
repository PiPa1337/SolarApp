import { catalogScaleStore } from "@solara/project-schema/scale-fixture";
import { describe, expect, it } from "vitest";
import { createHistory, executeCommand, MAX_HISTORY_LENGTH, redo, undo } from "./index.js";

const timestamp = "2026-08-21T03:00:00.000Z";

function editTitle(history: ReturnType<typeof createHistory>, index: number) {
  const product = history.present.products[index % history.present.products.length];
  if (!product) throw new Error("fixture sin productos");
  return executeCommand(history, {
    type: "product.update",
    productId: product.id,
    changes: { title: `Título v${index}` },
    at: timestamp,
  });
}

describe("límite de historial", () => {
  it("exporta MAX_HISTORY_LENGTH como contrato público", () => {
    expect(MAX_HISTORY_LENGTH).toBe(50);
  });

  it("undo sigue funcionando dentro del límite", () => {
    let history = createHistory(catalogScaleStore);
    for (let i = 0; i < MAX_HISTORY_LENGTH + 1; i += 1) {
      history = editTitle(history, i);
    }
    const undone = undo(history);
    // Con el historial lleno, undo restaura el estado tras la edición 49.
    expect(undone.present.products[49]?.title).toBe("Título v49");
  });

  it("redo tras undo restaura el estado", () => {
    let history = createHistory(catalogScaleStore);
    for (let i = 0; i < MAX_HISTORY_LENGTH + 1; i += 1) {
      history = editTitle(history, i);
    }
    const undone = undo(history);
    const redone = redo(undone);
    // El comando que supera el límite edita products[0]; redo lo restaura.
    expect(redone.present.products[0]?.title).toBe("Título v50");
  });

  it("los estados más antiguos se descartan primero (FIFO)", () => {
    let history = createHistory(catalogScaleStore);
    for (let i = 0; i < MAX_HISTORY_LENGTH + 1; i += 1) {
      history = editTitle(history, i);
    }
    expect(history.past).toHaveLength(MAX_HISTORY_LENGTH);
    // past conserva las ediciones 0 a 49 y descarta el estado inicial.
    expect(history.past.at(-1)?.products[49]?.title).toBe("Título v49");
    expect(history.past[0]?.products[0]?.title).toBe("Título v0");
  });
});
