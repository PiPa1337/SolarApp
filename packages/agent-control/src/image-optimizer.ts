import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { IMAGE_ASSET_RECIPE_V2 } from "@solara/project-schema";

export interface AgentOptimizedImage {
  mimeType: "image/avif" | "image/webp";
  source: string;
  fallbackSource: string;
  responsiveSources: Array<{ width: number; source: string }>;
  width: number;
  height: number;
  primaryBytes: Uint8Array;
  hash: string;
  optimizationRecipe: typeof IMAGE_ASSET_RECIPE_V2;
}

export interface AgentOptimizedFavicon {
  mimeType: "image/x-icon";
  source: string;
  fallbackSource: string;
  responsiveSources: Array<{ width: number; source: string }>;
  width: number;
  height: number;
  primaryBytes: Uint8Array;
  hash: string;
  optimizationRecipe: typeof IMAGE_ASSET_RECIPE_V2;
}

type Browser = Awaited<ReturnType<typeof chromium.launch>>;

let browserPromise: Promise<Browser> | undefined;

function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ headless: true });
  return browserPromise;
}

function dataUrlBytes(source: string): Uint8Array {
  const separator = source.indexOf(",");
  if (separator < 0) throw new Error("El optimizador generó una fuente inválida.");
  return new Uint8Array(Buffer.from(source.slice(separator + 1), "base64"));
}

/**
 * Usa el mismo contrato del worker de Studio en el canal MCP: fuente WebP o
 * AVIF, fallback a 768 px y responsive sin upscaling. El navegador se usa
 * sólo como encoder interno; nunca se expone al usuario.
 */
export async function optimizeRasterImage(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/avif" | "image/gif",
): Promise<AgentOptimizedImage> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const processed = await page.evaluate(
      async ({ base64: encoded, mime }) => {
        const source = `data:${mime};base64,${encoded}`;
        const image = new Image();
        image.src = source;
        await image.decode();
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;
        if (!sourceWidth || !sourceHeight) throw new Error("La imagen no tiene dimensiones reales.");
        if (sourceWidth * sourceHeight > 50_000_000) {
          throw new Error("La imagen supera el límite de 50 megapíxeles.");
        }

        const alphaProbeWidth = Math.max(
          1,
          Math.round(sourceWidth * Math.min(1, 128 / Math.max(sourceWidth, sourceHeight))),
        );
        const alphaProbeHeight = Math.max(
          1,
          Math.round(sourceHeight * Math.min(1, 128 / Math.max(sourceWidth, sourceHeight))),
        );
        const alphaCanvas = document.createElement("canvas");
        alphaCanvas.width = alphaProbeWidth;
        alphaCanvas.height = alphaProbeHeight;
        const alphaContext = alphaCanvas.getContext("2d", { willReadFrequently: true });
        if (!alphaContext) throw new Error("El navegador no pudo inspeccionar el alfa.");
        alphaContext.drawImage(image, 0, 0, alphaProbeWidth, alphaProbeHeight);
        const alpha = alphaContext.getImageData(0, 0, alphaProbeWidth, alphaProbeHeight).data;
        let preserveAlpha = false;
        for (let index = 3; index < alpha.length; index += 4) {
          if ((alpha[index] ?? 0) < 255) {
            preserveAlpha = true;
            break;
          }
        }

        const width = Math.min(sourceWidth, 1800);
        const height = Math.max(1, Math.round((sourceHeight / sourceWidth) * width));
        const widths = [480, 768, width].filter(
          (candidate, index, values) => candidate <= width && values.indexOf(candidate) === index,
        );

        const render = (targetWidth: number, type: string, quality?: number): string => {
          const targetHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth));
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d", { alpha: preserveAlpha });
          if (!context) throw new Error("El navegador no pudo procesar la imagen.");
          if (!preserveAlpha) {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, targetWidth, targetHeight);
          }
          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          const rendered = canvas.toDataURL(type, quality);
          if (!rendered.startsWith(`data:${type};base64,`)) {
            throw new Error(`El navegador no pudo generar ${type}.`);
          }
          return rendered;
        };

        let primaryType: "image/avif" | "image/webp" = "image/avif";
        let responsive: Array<{ width: number; source: string }>;
        try {
          responsive = widths.map((targetWidth) => ({
            width: targetWidth,
            source: render(targetWidth, "image/avif", targetWidth >= 1200 ? 0.5 : 0.55),
          }));
        } catch {
          primaryType = "image/webp";
          responsive = widths.map((targetWidth) => ({
            width: targetWidth,
            source: render(targetWidth, "image/webp", targetWidth >= 1200 ? 0.75 : 0.82),
          }));
        }
        const fallbackWidth = Math.min(width, 768);
        const fallbackSource = render(
          fallbackWidth,
          preserveAlpha ? "image/png" : "image/jpeg",
          preserveAlpha ? undefined : 0.88,
        );
        return {
          mimeType: primaryType,
          source: responsive.at(-1)?.source,
          fallbackSource,
          responsiveSources: responsive,
          width,
          height,
        };
      },
      { base64, mime: mimeType },
    );
    if (!processed.source) throw new Error("El optimizador no generó una fuente principal.");
    const primaryBytes = dataUrlBytes(processed.source);
    return {
      ...processed,
      source: processed.source!,
      primaryBytes,
      // Studio identifica el asset por el archivo original, no por cada
      // derivado WebP/AVIF que materializa el navegador.
      hash: createHash("sha256").update(bytes).digest("hex"),
      optimizationRecipe: IMAGE_ASSET_RECIPE_V2,
    };
  } finally {
    await page.close();
  }
}

/** Conserva el ICO como fuente pública y materializa sus PNG de respaldo. */
export async function optimizeFavicon(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<AgentOptimizedFavicon> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const processed = await page.evaluate(
      async ({ base64: encoded, width: sourceWidth, height: sourceHeight }) => {
        const source = `data:image/x-icon;base64,${encoded}`;
        const image = new Image();
        image.src = source;
        await image.decode();
        const widths = [
          ...new Set([16, 32, 48, 64, 128, sourceWidth].filter((item) => item <= sourceWidth)),
        ];
        if (widths.length === 0) throw new Error("El favicon no tiene tamaños utilizables.");
        const render = (targetWidth: number): string => {
          const targetHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * targetWidth));
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d", { alpha: true });
          if (!context) throw new Error("El navegador no pudo procesar el favicon.");
          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          const rendered = canvas.toDataURL("image/png");
          if (!rendered.startsWith("data:image/png;base64,")) {
            throw new Error("El navegador no pudo generar el PNG del favicon.");
          }
          return rendered;
        };
        const responsiveSources = widths.map((targetWidth) => ({
          width: targetWidth,
          source: render(targetWidth),
        }));
        return {
          fallbackSource: render(Math.min(sourceWidth, 256)),
          responsiveSources,
        };
      },
      { base64, width, height },
    );
    return {
      mimeType: "image/x-icon",
      source: `data:image/x-icon;base64,${base64}`,
      fallbackSource: processed.fallbackSource,
      responsiveSources: processed.responsiveSources,
      width,
      height,
      primaryBytes: bytes,
      hash: createHash("sha256").update(bytes).digest("hex"),
      optimizationRecipe: IMAGE_ASSET_RECIPE_V2,
    };
  } finally {
    await page.close();
  }
}
