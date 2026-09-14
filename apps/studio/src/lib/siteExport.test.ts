import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseExportDirectory, writeSiteToDirectory } from "./siteExport";

function makeDirectory(
  name = "sitio",
  files = new Map<string, string | Uint8Array>(),
  prefix = "",
) {
  const directory = {
    name,
    getDirectoryHandle: vi.fn(async (childName: string) =>
      makeDirectory(childName, files, `${prefix}${childName}/`).directory,
    ),
    getFileHandle: vi.fn(async (fileName: string) => ({
      createWritable: async () => ({
        write: async (data: string | Uint8Array) => {
          files.set(`${prefix}${fileName}`, data);
        },
        close: async () => undefined,
      }),
    })),
  };
  return { directory, files };
}

describe("exportación de sitio a una carpeta elegida", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("abre el selector y permite cancelar sin error", async () => {
    const showDirectoryPicker = vi.fn(async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    vi.stubGlobal("window", { showDirectoryPicker });

    await expect(chooseExportDirectory()).resolves.toBeNull();
    expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  it("escribe rutas anidadas y binarios en la carpeta elegida", async () => {
    const { directory, files } = makeDirectory();
    const progress: Array<{ current: number; total: number }> = [];
    const result = await writeSiteToDirectory(
      directory,
      new Map([
        ["index.html", "<h1>Solara</h1>"],
        ["assets/logo.bin", new Uint8Array([0, 1, 255])],
      ]),
      "production",
      (next) => progress.push(next),
    );

    expect(result.filesWritten).toBe(2);
    expect(result.folder).toContain("producción");
    expect(files.get("index.html")).toBe("<h1>Solara</h1>");
    expect([...((files.get("assets/logo.bin") as Uint8Array) ?? [])]).toEqual([0, 1, 255]);
    expect(progress).toEqual([
      { current: 0, total: 2 },
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ]);
  });

  it("rechaza rutas que intentan salir de la carpeta elegida", async () => {
    const { directory } = makeDirectory();
    await expect(
      writeSiteToDirectory(directory, new Map([["../fuera.txt", "no"]]), "production"),
    ).rejects.toThrow(/ruta insegura/i);
  });
});
