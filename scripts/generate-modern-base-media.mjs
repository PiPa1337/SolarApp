import crypto from "node:crypto";
import { chromium } from "@playwright/test";

const definitions = [
  ["product", 1254, 1254, "#eee9df", "#d6c7b5"],
  ["category", 1200, 900, "#e6ece8", "#bdcec4"],
  ["hero", 1800, 1200, "#e7e3ec", "#c9bed8"],
  ["social", 1200, 628, "#eee5e0", "#d4b9ac"],
];

function base64Bytes(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

function sha256(dataUrl) {
  return crypto.createHash("sha256").update(base64Bytes(dataUrl)).digest("hex");
}

function toIco(pngDataUrl, width, height) {
  const png = base64Bytes(pngDataUrl);
  const bytes = new Uint8Array(22 + png.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  bytes[6] = width === 256 ? 0 : width;
  bytes[7] = height === 256 ? 0 : height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  bytes.set(png, 22);
  return `data:image/x-icon;base64,${Buffer.from(bytes).toString("base64")}`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const rendered = await page.evaluate(async (items) => {
  async function render(width, height, fill, accent, type, quality) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo crear el contexto 2D.");
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
    context.fillStyle = accent;
    context.beginPath();
    context.moveTo(0, Math.round(height * 0.76));
    context.lineTo(Math.round(width * 0.25), Math.round(height * 0.42));
    context.lineTo(Math.round(width * 0.47), Math.round(height * 0.64));
    context.lineTo(Math.round(width * 0.7), Math.round(height * 0.3));
    context.lineTo(width, Math.round(height * 0.7));
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
    context.fill();
    context.globalAlpha = 0.55;
    context.beginPath();
    context.arc(
      Math.round(width * 0.78),
      Math.round(height * 0.2),
      Math.max(12, Math.round(Math.min(width, height) * 0.08)),
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 1;
    const blob = await canvas.convertToBlob({ type, quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${blob.type};base64,${btoa(binary)}`;
  }

  const qualityFor = (width, type) =>
    type === "image/webp" ? (width >= 1200 ? 0.75 : 0.82) : width >= 1200 ? 0.8 : 0.88;
  return Object.fromEntries(
    await Promise.all(
      items.map(async ([key, width, height, fill, accent]) => {
        const widths = [...new Set([480, 768, width].filter((candidate) => candidate <= width))];
        const responsiveSources = await Promise.all(
          widths.map(async (responsiveWidth) => ({
            width: responsiveWidth,
            source: await render(
              responsiveWidth,
              Math.round((responsiveWidth * height) / width),
              fill,
              accent,
              "image/webp",
              qualityFor(responsiveWidth, "image/webp"),
            ),
          })),
        );
        return [
          key,
          {
            source: responsiveSources.at(-1).source,
            fallbackSource: await render(
              Math.min(width, 768),
              Math.round((Math.min(width, 768) * height) / width),
              fill,
              accent,
              "image/jpeg",
              0.88,
            ),
            responsiveSources,
            width,
            height,
          },
        ];
      }),
    ),
  );
}, definitions);

const faviconPng = await page.evaluate(async () => {
  const canvas = new OffscreenCanvas(32, 32);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo crear el contexto del favicon.");
  context.fillStyle = "#a63d2f";
  context.fillRect(0, 0, 32, 32);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(16, 16, 9, 0, Math.PI * 2);
  context.fill();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
});
await browser.close();

const quote = (value) => JSON.stringify(value);
const lines = [
  "// Generado con las mismas calidades, dimensiones y fallback del worker de Studio.",
  "// Son placeholders neutrales; no contienen imágenes ni datos de RM.",
  "export const MODERN_BASE_TEMPLATE_MEDIA = ",
  "{",
];
for (const [key, media] of Object.entries(rendered)) {
  lines.push(`  ${key}: {`);
  lines.push(`    source: ${quote(media.source)},`);
  lines.push(`    fallbackSource: ${quote(media.fallbackSource)},`);
  lines.push("    responsiveSources: [");
  for (const responsive of media.responsiveSources) {
    lines.push(`      { width: ${responsive.width}, source: ${quote(responsive.source)} },`);
  }
  lines.push("    ],");
  lines.push(`    width: ${media.width},`);
  lines.push(`    height: ${media.height},`);
  lines.push(`    hash: ${quote(sha256(media.source))},`);
  lines.push("  },");
}
const faviconSource = toIco(faviconPng, 32, 32);
lines.push("  favicon: {");
lines.push(`    source: ${quote(faviconSource)},`);
lines.push(`    fallbackSource: ${quote(faviconPng)},`);
lines.push("    responsiveSources: [{ width: 32, source: " + quote(faviconPng) + " }],");
lines.push("    width: 32,");
lines.push("    height: 32,");
lines.push(`    hash: ${quote(sha256(faviconSource))},`);
lines.push("  },", "} as const;", "");
console.log(lines.join("\n"));
