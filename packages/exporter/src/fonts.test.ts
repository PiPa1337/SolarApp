import { describe, expect, it } from "vitest";
import { activeFonts, FONT_OPTIONS, fontCssFor, fontFilesFor, fontOptionForStack } from "./fonts";

const WOFF2_MAGIC = [0x77, 0x4f, 0x46, 0x32];
const ARCHIVO_STACK = 'Archivo, "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const INTER_STACK = 'Inter, system-ui, "Segoe UI", Arial, sans-serif';

describe("fonts", () => {
  it("registra 3 familias OFL con woff2 variable válido y dentro de presupuesto", () => {
    expect(FONT_OPTIONS.map((option) => option.id)).toEqual(["gf-archivo", "gf-inter", "gf-lora"]);
    for (const option of FONT_OPTIONS) {
      expect(option.license).toBe("OFL-1.1");
      expect(option.woff2Path).toBe(`assets/fonts/${option.family.toLowerCase()}.woff2`);
      const bytes = fontFilesFor(option.stack, option.stack).get(option.woff2Path);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect([...(bytes?.subarray(0, 4) ?? new Uint8Array())]).toEqual(WOFF2_MAGIC);
      expect(bytes?.length).toBeLessThan(60 * 1024);
    }
  });

  it("detecta la familia por el primer nombre del stack, con o sin comillas", () => {
    expect(fontOptionForStack(ARCHIVO_STACK)?.id).toBe("gf-archivo");
    expect(fontOptionForStack("'Inter', system-ui, Arial, sans-serif")?.id).toBe("gf-inter");
    expect(fontOptionForStack('"Lora", Georgia, serif')?.id).toBe("gf-lora");
    expect(fontOptionForStack("Archivo, Arial Narrow, Helvetica Neue, Arial, sans-serif")?.id).toBe(
      "gf-archivo",
    );
    expect(fontOptionForStack("Palatino, 'Palatino Linotype', Georgia, serif")).toBeUndefined();
    expect(fontOptionForStack("'Segoe UI', Aptos, Arial, sans-serif")).toBeUndefined();
    expect(fontOptionForStack("MiFuente")).toBeUndefined();
    expect(fontOptionForStack("")).toBeUndefined();
    expect(fontOptionForStack(undefined)).toBeUndefined();
  });

  it("deduplica display === body a un solo @font-face y un solo archivo", () => {
    expect(activeFonts(ARCHIVO_STACK, ARCHIVO_STACK).map((option) => option.id)).toEqual([
      "gf-archivo",
    ]);
    expect(activeFonts(ARCHIVO_STACK, INTER_STACK).map((option) => option.id)).toEqual([
      "gf-archivo",
      "gf-inter",
    ]);
  });

  it("emite URLs relativas con transporte file y data URI con transporte inline", () => {
    const file = fontCssFor(ARCHIVO_STACK, INTER_STACK, "file");
    expect(file).toContain(
      '@font-face{font-family:"Archivo";src:url("/assets/fonts/archivo.woff2")',
    );
    expect(file).toContain('format("woff2");font-display:swap;font-weight:400 900');
    expect(file).toContain('font-family:"Inter"');
    expect(file).not.toContain("data:font/woff2");

    const inline = fontCssFor(ARCHIVO_STACK, INTER_STACK, "inline");
    expect(inline).toContain('font-family:"Archivo"');
    expect(inline).toContain('src:url("data:font/woff2;base64,');
    expect(inline).not.toContain('url("/assets/fonts/');
  });

  it("tolera stacks personalizados sin emitir @font-face ni archivos", () => {
    expect(fontCssFor("MiFuente", "Palatino, 'Palatino Linotype', Georgia, serif")).toBe("");
    expect(fontFilesFor("MiFuente", "MiFuente").size).toBe(0);
  });
});
