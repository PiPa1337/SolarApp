import { catalogModernStore } from "@solara/project-schema/catalog-modern-fixture";
import { unzlibSync, zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportProject } from "./index";
import {
  buildFaviconIco,
  buildOfflinePage,
  buildServiceWorker,
  buildWebManifest,
  generateIconPng,
} from "./pwa";
import { decodePngRgba, encodePngRgba, quantizeRgba, scaleRgbaBilinear } from "./pwa-png";

function extractRuntimeCacheable(sw: string): RegExp {
  const source = /const RUNTIME_CACHEABLE = new RegExp\('(.*)'\);/.exec(sw)?.[1];
  if (!source) throw new Error("Falta RUNTIME_CACHEABLE en el service worker generado");
  return new RegExp(source);
}

function extractPrecacheUrls(sw: string): string[] {
  const match = /const PRECACHE_URLS = (\[[^\]]*\]);/.exec(sw);
  if (!match) throw new Error("Falta PRECACHE_URLS en el service worker generado");
  return JSON.parse(match[1] as string) as string[];
}

function stylesheetHrefs(html: string): string[] {
  return [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
    (match) => match[1] as string,
  );
}

describe("service worker", () => {
  it("deriva el CACHE_NAME del revision del deployment-manifest cuando viene", () => {
    const sw = buildServiceWorker(catalogModernStore, { revision: "73bceb2667d42713" });
    expect(sw).toContain("const CACHE_NAME = 'solara-73bceb2667d42713-");
  });

  it("mantiene el formato solara-<hash16> cuando no hay revision", () => {
    const sw = buildServiceWorker(catalogModernStore);
    expect(sw).toMatch(/const CACHE_NAME = 'solara-[0-9a-f]{16}';/);
  });

  it("acota el runtime cache a la allowlist de assets, índices y offline", () => {
    const sw = buildServiceWorker(catalogModernStore);
    expect(sw).toContain("const RUNTIME_CACHEABLE = new RegExp(");
    expect(sw).toContain("RUNTIME_CACHEABLE.test(pathname)");
    const guardIndex = sw.indexOf("RUNTIME_CACHEABLE.test(pathname)");
    const putIndex = sw.indexOf("cache.put(event.request, clone)");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(putIndex).toBeGreaterThan(guardIndex);
    expect(sw).not.toContain("if (response.ok) {");
    const runtimeCacheable = extractRuntimeCacheable(sw);
    expect(runtimeCacheable.test("/assets/storefront.abc123.css")).toBe(true);
    expect(runtimeCacheable.test("/assets/storefront.def456.js")).toBe(true);
    expect(runtimeCacheable.test("/assets/copy.0123abcd.json")).toBe(true);
    expect(runtimeCacheable.test("/search-index.json")).toBe(true);
    expect(runtimeCacheable.test("/catalog-index.json")).toBe(true);
    expect(runtimeCacheable.test("/offline/")).toBe(true);
    expect(runtimeCacheable.test("/offline/index.html")).toBe(true);
    expect(runtimeCacheable.test("/index.html")).toBe(false);
    expect(runtimeCacheable.test("/productos/manta-bruma/")).toBe(false);
    expect(runtimeCacheable.test("/ai-context.json")).toBe(false);
    expect(runtimeCacheable.test("/llms.txt")).toBe(false);
    expect(runtimeCacheable.test("/feed.xml")).toBe(false);
    expect(runtimeCacheable.test("/sitemap.xml")).toBe(false);
    expect(runtimeCacheable.test("/google-merchant.xml")).toBe(false);
  });

  it("respeta la subcarpeta de baseUrl en la allowlist del runtime cache", () => {
    const project = { ...catalogModernStore, baseUrl: "https://example.test/tienda/" };
    const sw = buildServiceWorker(project);
    const runtimeCacheable = extractRuntimeCacheable(sw);
    expect(runtimeCacheable.test("/tienda/assets/storefront.abc123.css")).toBe(true);
    expect(runtimeCacheable.test("/tienda/assets/copy.0123abcd.json")).toBe(true);
    expect(runtimeCacheable.test("/tienda/search-index.json")).toBe(true);
    expect(runtimeCacheable.test("/tienda/catalog-index.json")).toBe(true);
    expect(runtimeCacheable.test("/tienda/offline/index.html")).toBe(true);
    expect(runtimeCacheable.test("/assets/storefront.abc123.css")).toBe(false);
    expect(runtimeCacheable.test("/search-index.json")).toBe(false);
  });

  it("embebe el revision del deployment-manifest en el CACHE_NAME del sw exportado", () => {
    const result = exportProject(catalogModernStore, { mode: "production" });
    const manifest = JSON.parse(String(result.files.get("deployment-manifest.json"))) as {
      revision: string;
    };
    expect(manifest.revision).toMatch(/^[0-9a-f]{16}$/);
    const sw = String(result.files.get("sw.js"));
    expect(sw).toContain(`const CACHE_NAME = 'solara-${manifest.revision}-`);
  });

  it("precachea exactamente la CSS que enlaza la home (coherencia export↔precache)", () => {
    const result = exportProject(catalogModernStore, { mode: "production" });
    const home = String(result.files.get("index.html"));
    const homeHrefs = stylesheetHrefs(home);
    expect(homeHrefs.length).toBeGreaterThan(0);
    const sw = String(result.files.get("sw.js"));
    const precacheUrls = extractPrecacheUrls(sw);
    for (const href of homeHrefs) {
      expect(precacheUrls).toContain(href);
      expect(result.files.has(href.slice(1))).toBe(true);
    }
    expect(new Set(precacheUrls).size).toBe(precacheUrls.length);
    void new Function(sw);
  });
});

interface ParsedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  hasPlte: boolean;
  plte: Uint8Array;
  idat: Uint8Array;
}

function parsePng(bytes: Uint8Array): ParsedPng | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < 8; index += 1) {
    if (bytes[index] !== signature[index]) return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let header: ParsedPng | undefined;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: view.getUint32(offset + 8, false),
        height: view.getUint32(offset + 12, false),
        bitDepth: data[8] ?? 0,
        colorType: data[9] ?? 0,
        interlace: data[12] ?? 0,
        hasPlte: false,
        plte: new Uint8Array(),
        idat: new Uint8Array(),
      };
    } else if (type === "PLTE") {
      header = header ? { ...header, hasPlte: true, plte: data } : header;
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  if (!header) return undefined;
  const total = idat.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const part of idat) {
    merged.set(part, cursor);
    cursor += part.length;
  }
  return { ...header, idat: merged };
}

function palettePixel(bytes: Uint8Array, x: number, y: number): [number, number, number] {
  const parsed = parsePng(bytes);
  if (!parsed || !parsed.hasPlte || parsed.colorType !== 3) {
    throw new Error("El PNG no es de paleta");
  }
  const raw = unzlibSync(parsed.idat);
  const index = raw[y * (parsed.width + 1) + 1 + x] ?? 0;
  return [
    parsed.plte[index * 3] ?? 0,
    parsed.plte[index * 3 + 1] ?? 0,
    parsed.plte[index * 3 + 2] ?? 0,
  ];
}

describe("web manifest", () => {
  it("declara id, description y propósito any/maskable en los iconos", () => {
    const manifest = JSON.parse(buildWebManifest(catalogModernStore)) as {
      id: string;
      start_url: string;
      description: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };
    expect(manifest.id).toBe(manifest.start_url);
    expect(manifest.description).toBe(
      catalogModernStore.identity.description.replace(/\s+/g, " ").trim(),
    );
    expect(manifest.icons).toHaveLength(3);
    expect(manifest.icons[0]).toMatchObject({
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    });
    expect(manifest.icons[1]).toMatchObject({
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    });
    expect(manifest.icons[2]).toMatchObject({
      src: manifest.icons[1]?.src,
      sizes: "512x512",
      purpose: "maskable",
    });
  });

  it("acota la description a 200 caracteres sin saltos de línea", () => {
    const project = structuredClone(catalogModernStore);
    project.identity.description = `Texto con "comillas", saltos\nnuevos y ${"m".repeat(300)}`;
    const manifest = JSON.parse(buildWebManifest(project)) as { description: string };
    expect(manifest.description.length).toBeLessThanOrEqual(200);
    expect(manifest.description).not.toContain("\n");
  });
});

describe("generateIconPng", () => {
  it("emite un png de paleta colorType 3 comprimido y determinista", () => {
    const first = generateIconPng("tienda-512", 512);
    const second = generateIconPng("tienda-512", 512);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    const parsed = parsePng(first);
    expect(parsed).toMatchObject({ width: 512, height: 512, bitDepth: 8, colorType: 3 });
    expect(parsed?.interlace).toBe(0);
    expect(parsed?.hasPlte).toBe(true);
    const raw = unzlibSync(parsed?.idat ?? new Uint8Array());
    expect(raw.length).toBe(512 * (1 + 512));
    expect(raw[1]).toBe(raw[2]);
    expect(raw[600]).toBe(raw[900]);
  });

  it("mantiene icon-512 y favicon.ico por debajo de 60 kb", () => {
    expect(generateIconPng("tienda-512", 512).byteLength).toBeLessThan(60 * 1024);
    expect(generateIconPng("tienda-192", 192).byteLength).toBeLessThan(30 * 1024);
    expect(buildFaviconIco("tienda").byteLength).toBeLessThan(60 * 1024);
  });

  it("exporta iconos pwa comprimidos y validos en el sitio", () => {
    const result = exportProject(catalogModernStore, { mode: "production" });
    const icon512 = result.files.get("icons/icon-512.png") as Uint8Array;
    const icon192 = result.files.get("icons/icon-192.png") as Uint8Array;
    expect(icon512.byteLength).toBeLessThan(60 * 1024);
    expect(icon192.byteLength).toBeLessThan(30 * 1024);
    const parsed = parsePng(icon512);
    expect(parsed?.colorType).toBe(3);
    expect(parsed?.hasPlte).toBe(true);
    expect(parsed?.width).toBe(512);
  });
});

describe("favicon", () => {
  it("linkea /favicon.ico en la raíz del sitio exportado", () => {
    const result = exportProject(catalogModernStore, { mode: "production" });
    const home = String(result.files.get("index.html"));
    expect(home).toContain('<link rel="icon" href="/favicon.ico"');
    expect(result.files.has("favicon.ico")).toBe(true);
  });

  it("marca offline/index.html como noindex", () => {
    expect(buildOfflinePage(catalogModernStore)).toContain("<meta name=robots content=noindex>");
    const result = exportProject(catalogModernStore, { mode: "production" });
    const offline = String(result.files.get("offline/index.html"));
    expect(offline).toContain("name=robots");
    expect(offline).toContain("noindex");
  });
});

describe("iconos pwa desde el logo", () => {
  function createLogoProject(
    logoBytes: Uint8Array,
    mimeType = "image/png",
  ): typeof catalogModernStore {
    const project = structuredClone(catalogModernStore);
    const logo = {
      kind: "image" as const,
      id: "asset-logo-icono" as (typeof catalogModernStore.assets)[number]["id"],
      name: "Logo",
      alt: "Logo",
      mimeType,
      source: `data:${mimeType};base64,${Buffer.from(logoBytes).toString("base64")}`,
      width: 64,
      height: 64,
      hash: "logo-icono-v1",
    };
    project.assets = [...project.assets, logo];
    project.identity.logoAssetId = logo.id;
    return project;
  }

  function solidLogoRgba(size: number): Uint8Array {
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const red = x < size / 2;
        rgba[offset] = red ? 255 : 0;
        rgba[offset + 1] = 0;
        rgba[offset + 2] = red ? 0 : 255;
        rgba[offset + 3] = 255;
      }
    }
    return rgba;
  }

  it("deriva icon-512 del logo png con safe zone y fondo del tema", () => {
    const project = createLogoProject(encodePngRgba(solidLogoRgba(64), 64, 64));
    const result = exportProject(project, { mode: "production" });
    const icon = result.files.get("icons/icon-512.png") as Uint8Array;
    expect(icon.byteLength).toBeLessThan(60 * 1024);
    const parsed = parsePng(icon);
    expect(parsed?.width).toBe(512);
    expect(parsed?.height).toBe(512);
    const [leftR, leftG, leftB] = palettePixel(icon, 154, 256);
    expect(leftR).toBeGreaterThan(200);
    expect(leftG).toBeLessThan(60);
    expect(leftB).toBeLessThan(60);
    const [rightR, rightG, rightB] = palettePixel(icon, 358, 256);
    expect(rightR).toBeLessThan(60);
    expect(rightG).toBeLessThan(60);
    expect(rightB).toBeGreaterThan(200);
    const [cornerR, cornerG, cornerB] = palettePixel(icon, 5, 5);
    expect(cornerR).toBeGreaterThan(200);
    expect(cornerG).toBeGreaterThan(200);
    expect(cornerB).toBeGreaterThan(200);
  });

  it("deriva icon-192 del mismo logo", () => {
    const project = createLogoProject(encodePngRgba(solidLogoRgba(64), 64, 64));
    const result = exportProject(project, { mode: "production" });
    const icon = result.files.get("icons/icon-192.png") as Uint8Array;
    const parsed = parsePng(icon);
    expect(parsed?.width).toBe(192);
    expect(parsed?.height).toBe(192);
    const [centerR, , centerB] = palettePixel(icon, 60, 96);
    expect(centerR).toBeGreaterThan(200);
    expect(centerB).toBeLessThan(60);
  });

  it("cae al color solido cuando el logo no es un png decodificable", () => {
    const jpegBytes = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const project = createLogoProject(jpegBytes, "image/jpeg");
    const result = exportProject(project, { mode: "production" });
    const icon = result.files.get("icons/icon-512.png") as Uint8Array;
    const fallback = generateIconPng(`${project.identity.brandName}-512`, 512);
    expect(Buffer.from(icon).equals(Buffer.from(fallback))).toBe(true);
  });
});

describe("pwa-png", () => {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  function crc32Test(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      const entry = crcTable[(crc ^ byte) & 0xff];
      if (entry !== undefined) crc = entry ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunkTest(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type);
    const payload = new Uint8Array(typeBytes.length + data.length);
    payload.set(typeBytes);
    payload.set(data, typeBytes.length);
    const result = new Uint8Array(payload.length + 8);
    new DataView(result.buffer).setUint32(0, data.length, false);
    result.set(typeBytes, 4);
    result.set(data, 8);
    new DataView(result.buffer).setUint32(payload.length + 4, crc32Test(payload), false);
    return result;
  }
  function ihdrTest(
    width: number,
    height: number,
    bitDepth: number,
    colorType: number,
    interlace: number,
  ): Uint8Array {
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, width, false);
    new DataView(ihdr.buffer).setUint32(4, height, false);
    ihdr[8] = bitDepth;
    ihdr[9] = colorType;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = interlace;
    return ihdr;
  }
  function buildPngTest(ihdr: Uint8Array, rawScanlines: Uint8Array): Uint8Array {
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return new Uint8Array([
      ...signature,
      ...chunkTest("IHDR", ihdr),
      ...chunkTest("IDAT", zlibSync(rawScanlines)),
      ...chunkTest("IEND", new Uint8Array()),
    ]);
  }
  function paethTest(a: number, b: number, c: number): number {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  function filterRowTest(
    type: number,
    row: Uint8Array,
    previous: Uint8Array | undefined,
    bpp: number,
  ): Uint8Array {
    const out = new Uint8Array(row.length);
    for (let index = 0; index < row.length; index += 1) {
      const x = row[index] ?? 0;
      const left = index >= bpp ? (row[index - bpp] ?? 0) : 0;
      const up = previous ? (previous[index] ?? 0) : 0;
      const upLeft = previous && index >= bpp ? (previous[index - bpp] ?? 0) : 0;
      let pred = 0;
      if (type === 1) pred = left;
      else if (type === 2) pred = up;
      else if (type === 3) pred = Math.floor((left + up) / 2);
      else if (type === 4) pred = paethTest(left, up, upLeft);
      out[index] = (x - pred) & 0xff;
    }
    return out;
  }

  it("decodePngRgba hace round-trip con el encoder", () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
      120,
    ]);
    const decoded = decodePngRgba(encodePngRgba(rgba, 3, 2));
    expect(decoded).toMatchObject({ width: 3, height: 2 });
    expect([...(decoded?.rgba ?? new Uint8Array())]).toEqual([...rgba]);
  });

  it("decodePngRgba reconstruye los filtros de scanline 0-4", () => {
    const width = 3;
    const height = 5;
    const rows = [
      Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]),
      Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      Uint8Array.from([200, 150, 100, 50, 1, 2, 3, 4, 250, 251, 252, 253]),
      Uint8Array.from([128, 128, 128, 128, 0, 0, 0, 0, 255, 255, 255, 0]),
      Uint8Array.from([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
    ];
    const bpp = 4;
    const scanlines: number[] = [];
    let previous: Uint8Array | undefined;
    rows.forEach((row, index) => {
      scanlines.push(index % 5);
      scanlines.push(...filterRowTest(index, row, previous, bpp));
      previous = row;
    });
    const png = buildPngTest(ihdrTest(width, height, 8, 6, 0), Uint8Array.from(scanlines));
    const decoded = decodePngRgba(png);
    expect(decoded).toMatchObject({ width, height });
    const expected = rows.flatMap((row) => [...row]);
    expect([...(decoded?.rgba ?? new Uint8Array())]).toEqual(expected);
  });

  it("decodePngRgba rechaza entradas no soportadas", () => {
    expect(decodePngRgba(new Uint8Array([1, 2, 3]))).toBeUndefined();
    const pixel = Uint8Array.from([0, 255, 0, 0, 255]);
    const validInterlace = buildPngTest(ihdrTest(1, 1, 8, 6, 1), pixel);
    expect(decodePngRgba(validInterlace)).toBeUndefined();
    const gray = buildPngTest(ihdrTest(1, 1, 8, 0, 0), Uint8Array.from([0, 128]));
    expect(decodePngRgba(gray)).toBeUndefined();
    const deep = buildPngTest(
      ihdrTest(1, 1, 16, 6, 0),
      Uint8Array.from([0, 0, 255, 0, 0, 255, 0, 0, 255]),
    );
    expect(decodePngRgba(deep)).toBeUndefined();
    const valid = buildPngTest(ihdrTest(1, 1, 8, 6, 0), pixel);
    expect(decodePngRgba(valid)).toMatchObject({ width: 1, height: 1 });
    expect(decodePngRgba(valid.slice(0, valid.length - 9))).toBeUndefined();
  });

  it("scaleRgbaBilinear conserva esquinas e interpola el centro", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255,
    ]);
    const scaled = scaleRgbaBilinear(source, 2, 2, 4, 4);
    const sample = (x: number, y: number): [number, number, number] => {
      const offset = (y * 4 + x) * 4;
      return [scaled[offset] ?? 0, scaled[offset + 1] ?? 0, scaled[offset + 2] ?? 0];
    };
    expect(sample(0, 0)).toEqual([255, 0, 0]);
    expect(sample(3, 0)).toEqual([0, 0, 255]);
    expect(sample(0, 3)).toEqual([0, 255, 0]);
    expect(sample(3, 3)).toEqual([255, 255, 255]);
    const [centerR, centerG, centerB] = sample(1, 1);
    expect(centerR).toBeGreaterThan(140);
    expect(centerR).toBeLessThan(180);
    expect(centerG).toBeGreaterThan(45);
    expect(centerG).toBeLessThan(90);
    expect(centerB).toBeGreaterThan(45);
    expect(centerB).toBeLessThan(90);
  });

  it("quantizeRgba respeta el tope de paleta y mapea todos los pixeles", () => {
    const width = 16;
    const height = 20;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        rgba[offset] = x * 16;
        rgba[offset + 1] = y * 12;
        rgba[offset + 3] = 255;
      }
    }
    const quantized = quantizeRgba(rgba, 256);
    expect(quantized.palette.length).toBeLessThanOrEqual(256 * 3);
    expect(quantized.palette.length % 3).toBe(0);
    for (const index of quantized.indices) {
      expect(index).toBeLessThan(quantized.palette.length / 3);
    }
    const simple = Uint8Array.from([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
    ]);
    const exact = quantizeRgba(simple, 256);
    expect(exact.palette.length / 3).toBe(2);
    const entries: Array<[number, number, number]> = [];
    for (let index = 0; index < exact.palette.length; index += 3) {
      entries.push([
        exact.palette[index] ?? 0,
        exact.palette[index + 1] ?? 0,
        exact.palette[index + 2] ?? 0,
      ]);
    }
    expect(entries).toContainEqual([255, 0, 0]);
    expect(entries).toContainEqual([0, 0, 255]);
  });
});
