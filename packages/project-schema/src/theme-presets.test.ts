import { describe, expect, it } from "vitest";
import type { Theme } from "./index";
import { applyPreset, PAO_BLANQUERIA_COLORS, THEME_PRESETS } from "./theme-presets";

const baseTheme: Theme = {
  colors: {
    background: "#fcfcfb",
    surface: "#f0f0ee",
    text: "#0b0b0c",
    muted: "#696966",
    accent: "#0b0b0c",
    accentText: "#ffffff",
    border: "#dededa",
    sale: "#d94a55",
    rating: "#d99a12",
  },
  typography: {
    display: "Georgia, serif",
    body: "system-ui, sans-serif",
    scale: 1.2,
    lineHeightTight: 1.15,
    lineHeightBody: 1.6,
    letterSpacingDisplay: "-0.02em",
    fontWeightDisplay: 500,
    fontWeightBody: 400,
  },
  spacingScale: 1,
  spacing: {
    sectionY: "clamp(3rem, 6vw, 6rem)",
    cardGap: "clamp(1rem, 2vw, 2rem)",
    containerPaddingX: "1rem",
  },
  shadows: { card: "none", elevated: "none", overlay: "0 24px 70px rgba(0,0,0,.14)" },
  borders: { width: "1px", style: "solid" },
  motion: { durationFast: "150ms", durationNormal: "280ms", easing: "cubic-bezier(.16,1,.3,1)" },
  radius: 8,
  container: 1240,
};

describe("theme presets", () => {
  it("define al menos 5 presets con id y label unicos", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(5);
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applyPreset no muta el tema original", () => {
    const original = structuredClone(baseTheme);
    applyPreset(baseTheme, "editorial");
    expect(baseTheme).toEqual(original);
  });

  it("cada preset produce colores validos para cada campo", () => {
    for (const preset of THEME_PRESETS) {
      if (!preset.tokens.colors) continue;
      for (const [key, value] of Object.entries(preset.tokens.colors)) {
        expect(value, `${preset.id}.${key}`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
      }
    }
  });

  it("la paleta Pao Blanquería conserva contraste WCAG AA", () => {
    const palette = THEME_PRESETS.find((preset) => preset.id === "pao-blanqueria");
    if (!palette?.tokens.colors) throw new Error("Falta la paleta Pao Blanquería.");
    const colors = palette.tokens.colors;
    expect(colors).toEqual(PAO_BLANQUERIA_COLORS);
    const luminance = (color: string) => {
      const channels = [1, 3, 5]
        .map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
        .map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        );
      const [red = 0, green = 0, blue = 0] = channels;
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const ratio = (foreground: string, background: string) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    const { text, muted, background, accentText, accent, accentAlt } = colors;
    if (!text || !muted || !background || !accentText || !accent || !accentAlt) {
      throw new Error("La paleta Pao Blanquería no tiene todos sus colores.");
    }
    expect(ratio(text, background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(muted, background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(accentText, accent)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(accentText, accentAlt)).toBeGreaterThanOrEqual(4.5);
  });

  it("applyPreset cambia los colores del tema", () => {
    const themed = applyPreset(baseTheme, "minimal");
    expect(themed.colors.background).not.toBe(baseTheme.colors.background);
    expect(themed.radius).toBe(0);
  });

  it("applyPreset con id desconocido retorna el tema original", () => {
    const themed = applyPreset(baseTheme, "no-existe");
    expect(themed).toEqual(baseTheme);
  });
});
