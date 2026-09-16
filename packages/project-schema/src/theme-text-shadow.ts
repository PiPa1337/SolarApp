import type { Theme } from "./index.js";

/** Intensidad inicial visible, sin convertir el texto del hero en un contorno. */
export const DEFAULT_THEME_TEXT_SHADOW_OPACITY = 0.65;
export const DEFAULT_THEME_TEXT_SHADOW_OFFSET_X = 1;
export const DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y = 1;
export const DEFAULT_THEME_TEXT_SHADOW_BLUR = 0;
export const THEME_TEXT_SHADOW_OFFSET_MIN = -48;
export const THEME_TEXT_SHADOW_OFFSET_MAX = 48;
export const THEME_TEXT_SHADOW_BLUR_MIN = 0;
export const THEME_TEXT_SHADOW_BLUR_MAX = 48;

function parseThemeHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const token = match[1];
  if (!token) return null;
  const hex =
    token.length === 3
      ? token
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : token;
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function themeLuminance([red, green, blue]: [number, number, number]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function themeContrastRatio(first: string, second: string): number | null {
  const firstRgb = parseThemeHex(first);
  const secondRgb = parseThemeHex(second);
  if (!firstRgb || !secondRgb) return null;
  const firstLuminance = themeLuminance(firstRgb);
  const secondLuminance = themeLuminance(secondRgb);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Deriva el color de sombra del token más contrastante con la letra real. */
export function deriveThemeTextShadowColor(
  colors: Theme["colors"],
  foreground = colors.text,
): string {
  const saleColor = colors.sale ?? "#d94a55";
  const ratingColor = colors.rating ?? "#d99a12";
  const accentAltColor =
    colors.accentAlt ?? `color-mix(in srgb, ${colors.accent} 68%, ${colors.background})`;
  const candidates = [
    colors.text,
    accentAltColor,
    colors.accent,
    colors.background,
    colors.surface,
    colors.border,
    colors.muted,
    colors.accentText,
    saleColor,
    ratingColor,
  ];
  let selected = colors.background;
  let selectedContrast = -1;
  for (const candidate of candidates) {
    const contrast = themeContrastRatio(foreground, candidate);
    if (contrast !== null && contrast > selectedContrast) {
      selected = candidate;
      selectedContrast = contrast;
    }
  }
  return selected;
}
