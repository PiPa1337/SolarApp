/**
 * Presets de tema pre-definidos. Cada uno sobreescribe un subconjunto de
 * tokens sobre el tema actual sin tocar los demas.
 */
import type { Theme } from "./index";

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  tokens: {
    colors?: Partial<Theme["colors"]>;
    typography?: Partial<Theme["typography"]>;
    spacingScale?: number;
    spacing?: Partial<Theme["spacing"]>;
    radius?: number;
    shadows?: Partial<Theme["shadows"]>;
    borders?: Partial<Theme["borders"]>;
    motion?: Partial<Theme["motion"]>;
  };
}

/** Paleta de marca de Pao, compartida por Studio y el canal del agente. */
export const PAO_BLANQUERIA_COLORS = {
  background: "#fffcf8",
  surface: "#f0c9bf",
  text: "#8e5e45",
  muted: "#8e5e45",
  accent: "#d95c52",
  accentText: "#2a120e",
  accentAlt: "#e19a8b",
  border: "#e19a8b",
  sale: "#b6271f",
  rating: "#785500",
} as const satisfies Theme["colors"];

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "editorial",
    label: "Editorial",
    description: "Serif elegante, espaciado amplio, lineas finas.",
    tokens: {
      colors: {
        background: "#faf9f7",
        surface: "#f2f0ed",
        text: "#2c2825",
        muted: "#8c8578",
        accent: "#8b6914",
        accentText: "#ffffff",
        accentAlt: "#6d3c74",
        border: "#e0dbd3",
      },
      typography: {
        display: "Lora, Georgia, serif",
        body: "Inter, system-ui, sans-serif",
        scale: 1.333,
        fontWeightDisplay: 500,
        letterSpacingDisplay: "-0.01em",
      },
      spacingScale: 1.25,
      spacing: {
        sectionY: "clamp(4rem, 8vw, 8rem)",
        cardGap: "clamp(1.25rem, 2.5vw, 2.5rem)",
        containerPaddingX: "1.5rem",
      },
      radius: 4,
      shadows: { card: "none", elevated: "none", overlay: "0 12px 40px rgba(44,40,37,.08)" },
      borders: { width: "1px", style: "solid" },
    },
  },
  {
    id: "pao-blanqueria",
    label: "Pao Blanquería",
    description: "Rosa viejo, taupe cálido y crema marfil con contraste accesible.",
    tokens: {
      colors: PAO_BLANQUERIA_COLORS,
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Sans-serif limpia, mucho blanco, sin decoracion.",
    tokens: {
      colors: {
        background: "#ffffff",
        surface: "#f8f8f8",
        text: "#111111",
        muted: "#777777",
        accent: "#000000",
        accentText: "#ffffff",
        accentAlt: "#a33d32",
        border: "#eeeeee",
      },
      typography: {
        display: "Inter, system-ui, sans-serif",
        body: "Inter, system-ui, sans-serif",
        scale: 1.25,
        fontWeightDisplay: 600,
        letterSpacingDisplay: "-0.03em",
      },
      spacingScale: 1,
      spacing: {
        sectionY: "clamp(5rem, 10vw, 10rem)",
        cardGap: "clamp(1.5rem, 3vw, 3rem)",
        containerPaddingX: "1rem",
      },
      radius: 0,
      shadows: { card: "none", elevated: "none", overlay: "none" },
      borders: { width: "1px", style: "solid" },
    },
  },
  {
    id: "calido",
    label: "Calido",
    description: "Tonos tierra, bordes redondeados, ambiente acogedor.",
    tokens: {
      colors: {
        background: "#fdf6ee",
        surface: "#f7ead9",
        text: "#3d2b1f",
        muted: "#a08464",
        accent: "#c17817",
        accentText: "#ffffff",
        accentAlt: "#286b63",
        border: "#e8d5be",
      },
      typography: {
        display: "Archivo, sans-serif",
        body: "Inter, system-ui, sans-serif",
        scale: 1.2,
        fontWeightDisplay: 600,
      },
      spacingScale: 1.15,
      radius: 16,
      shadows: {
        card: "0 2px 12px rgba(193,120,23,.08)",
        elevated: "0 6px 24px rgba(193,120,23,.12)",
        overlay: "0 16px 50px rgba(61,43,31,.15)",
      },
      borders: { width: "1px", style: "solid" },
    },
  },
  {
    id: "industrial",
    label: "Industrial",
    description: "Contraste alto, estructura visible, detalles monospace.",
    tokens: {
      colors: {
        background: "#1a1a1a",
        surface: "#2a2a2a",
        text: "#e0e0e0",
        muted: "#888888",
        accent: "#00ff88",
        accentText: "#000000",
        accentAlt: "#ff6f61",
        border: "#333333",
      },
      typography: {
        display: "system-ui, sans-serif",
        body: "system-ui, sans-serif",
        scale: 1.2,
        fontWeightDisplay: 700,
        letterSpacingDisplay: "0em",
      },
      spacingScale: 1,
      radius: 2,
      shadows: { card: "none", elevated: "none", overlay: "0 0 30px rgba(0,255,136,.05)" },
      borders: { width: "1px", style: "solid" },
    },
  },
  {
    id: "botanico",
    label: "Botanico",
    description: "Verdes naturales, serif suave, ambiente organico.",
    tokens: {
      colors: {
        background: "#f5f7f0",
        surface: "#e8ede3",
        text: "#1a2e1a",
        muted: "#5c735c",
        accent: "#2d6a2d",
        accentText: "#ffffff",
        accentAlt: "#a84336",
        border: "#c5d1c0",
      },
      typography: {
        display: "Lora, Georgia, serif",
        body: "Source Sans Pro, system-ui, sans-serif",
        scale: 1.25,
        fontWeightDisplay: 500,
      },
      spacingScale: 1.2,
      radius: 10,
      shadows: {
        card: "0 2px 8px rgba(26,46,26,.06)",
        elevated: "0 8px 28px rgba(26,46,26,.1)",
        overlay: "0 20px 60px rgba(26,46,26,.14)",
      },
      borders: { width: "1px", style: "solid" },
    },
  },
] as const;

export function applyPreset(current: Theme, presetId: string): Theme {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) return current;
  return {
    ...structuredClone(current),
    ...preset.tokens,
    colors: { ...current.colors, ...preset.tokens.colors },
    typography: { ...current.typography, ...preset.tokens.typography },
    spacing: { ...current.spacing, ...preset.tokens.spacing },
    shadows: { ...current.shadows, ...preset.tokens.shadows },
    borders: { ...current.borders, ...preset.tokens.borders },
    motion: { ...current.motion, ...preset.tokens.motion },
  } as Theme;
}
