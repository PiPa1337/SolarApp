import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearExportHistory,
  EXPORT_HISTORY_KEY_PREFIX,
  readExportHistory,
  recordExport,
} from "./exportHistory";
import { formatLastExportLabel } from "./statusBar";

type MockStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStorage(): MockStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exportHistory", () => {
  it("devuelve el historial vacío cuando no hay registros", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(readExportHistory("tienda-a")).toEqual([]);
  });

  it("registra una exportación y la lee como la entrada más reciente", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const next = recordExport("tienda-a", "production", { score: 92, critical: 0 });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ mode: "production", score: 92, critical: 0 });
    expect(() => new Date(next[0]?.at ?? "").toISOString()).not.toThrow();
    expect(readExportHistory("tienda-a")).toEqual(next);
  });

  it("escribe exactamente los campos que leen el historial y la barra de estado", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const nowIso = new Date().toISOString();
    const next = recordExport("tienda-a", "draft", { score: 71, critical: 2 });
    const entry = next[0];
    expect(entry).toEqual({
      at: expect.any(String) as string,
      mode: "draft",
      score: 71,
      critical: 2,
    });
    expect(Date.parse(entry?.at ?? "")).not.toBeNaN();
    expect(formatLastExportLabel(readExportHistory("tienda-a"), null, nowIso)).toBe(
      new Date(entry?.at ?? "").toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    );
  });

  it("permite registrar sin métricas con valores por defecto", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const next = recordExport("tienda-a", "draft");
    expect(next[0]).toMatchObject({ mode: "draft", score: 0, critical: 0 });
  });

  it("aísla el historial por slug", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    recordExport("tienda-a", "draft", { score: 80, critical: 1 });
    expect(readExportHistory("tienda-b")).toEqual([]);
  });

  it("conserva hasta 8 entradas con la más reciente primero", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    for (let i = 0; i < 10; i += 1) {
      recordExport("tienda-a", "draft", { score: i, critical: 0 });
    }
    const read = readExportHistory("tienda-a");
    expect(read).toHaveLength(8);
    expect(read[0]?.score).toBe(9);
    expect(read[7]?.score).toBe(2);
  });

  it("clearExportHistory borra el historial del slug", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    recordExport("tienda-a", "draft", { score: 80, critical: 1 });
    clearExportHistory("tienda-a");
    expect(readExportHistory("tienda-a")).toEqual([]);
  });

  it("tolera JSON corrupto y formas no válidas", () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    store.setItem(`${EXPORT_HISTORY_KEY_PREFIX}tienda-a`, "{no es json");
    expect(readExportHistory("tienda-a")).toEqual([]);
    store.setItem(`${EXPORT_HISTORY_KEY_PREFIX}tienda-a`, JSON.stringify({ no: "array" }));
    expect(readExportHistory("tienda-a")).toEqual([]);
  });

  it("no falla cuando el almacenamiento no está disponible", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readExportHistory("tienda-a")).toEqual([]);
    expect(recordExport("tienda-a", "draft")).toHaveLength(1);
    expect(() => clearExportHistory("tienda-a")).not.toThrow();
  });

  it("no falla cuando el almacenamiento tira errores", () => {
    const broken: MockStorage = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("lleno");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    vi.stubGlobal("localStorage", broken);
    expect(readExportHistory("tienda-a")).toEqual([]);
    expect(recordExport("tienda-a", "draft")).toHaveLength(1);
    expect(() => clearExportHistory("tienda-a")).not.toThrow();
  });
});
