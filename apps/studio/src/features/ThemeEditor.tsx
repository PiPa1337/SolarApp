/** Inspector de tokens visuales persistidos; no introduce estilos públicos paralelos. */
import {
  ArrowCounterClockwise,
  Image as ImageIcon,
  PaintBrush,
  TextT,
  Wrench,
} from "@phosphor-icons/react";
import {
  DEFAULT_THEME_TEXT_SHADOW_BLUR,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_X,
  DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y,
  DEFAULT_THEME_TEXT_SHADOW_OPACITY,
  deriveThemeTextShadowColor,
  type ImageAsset,
  PAO_BLANQUERIA_COLORS,
  type StoreProjectV1,
  THEME_TEXT_SHADOW_BLUR_MAX,
  THEME_TEXT_SHADOW_BLUR_MIN,
  THEME_TEXT_SHADOW_OFFSET_MAX,
  THEME_TEXT_SHADOW_OFFSET_MIN,
  type Theme,
} from "@solara/project-schema";
import { useEffect, useRef, useState } from "react";
import { ImageAssetPicker } from "../components/ImageAssetPicker";
import { Button, Field, SectionHeader } from "../components/Ui";
import { WorkspaceGroups } from "./workbench/WorkspaceNav";

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COLOR_ERROR = "Ingresá un color hex como #1a2b3c.";
const CONTAINER_ERROR = "Ingresá un ancho de 960 a 1800 px.";
const CONTAINER_MIN = 960;
const CONTAINER_MAX = 1800;

/**
 * Opciones reales del selector de fuentes. El valor persistido es el stack
 * completo (typography.display/body siguen strings); las familias del sistema
 * no cargan nada y las de Google Fonts son las que el exporter materializa
 * con @font-face en el sitio y el preview.
 */
interface FontOption {
  id: string;
  label: string;
  stack: string;
  group: "sistema" | "google";
}

const FONT_OPTIONS: FontOption[] = [
  { id: "georgia", label: "Georgia", group: "sistema", stack: `Georgia, "Times New Roman", serif` },
  {
    id: "verdana",
    label: "Verdana",
    group: "sistema",
    stack: `Verdana, Geneva, Tahoma, sans-serif`,
  },
  {
    id: "arial",
    label: "Arial",
    group: "sistema",
    stack: `Arial, "Helvetica Neue", Helvetica, sans-serif`,
  },
  { id: "tahoma", label: "Tahoma", group: "sistema", stack: `Tahoma, Verdana, Geneva, sans-serif` },
  {
    id: "trebuchet",
    label: "Trebuchet MS",
    group: "sistema",
    stack: `"Trebuchet MS", "Segoe UI", Tahoma, sans-serif`,
  },
  {
    id: "times",
    label: "Times New Roman",
    group: "sistema",
    stack: `"Times New Roman", Times, Georgia, serif`,
  },
  {
    id: "courier",
    label: "Courier New",
    group: "sistema",
    stack: `"Courier New", Courier, "Lucida Console", monospace`,
  },
  {
    id: "monospace",
    label: "Monospace",
    group: "sistema",
    stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
  },
  { id: "sans-serif", label: "Sans serif", group: "sistema", stack: `sans-serif` },
  { id: "serif", label: "Serif", group: "sistema", stack: `serif` },
  {
    id: "system-ui",
    label: "System UI",
    group: "sistema",
    stack: `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`,
  },
  {
    id: "archivo",
    label: "Archivo",
    group: "google",
    stack: `Archivo, Arial Narrow, Helvetica Neue, Arial, sans-serif`,
  },
  {
    id: "inter",
    label: "Inter",
    group: "google",
    stack: `Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  },
  { id: "lora", label: "Lora", group: "google", stack: `Lora, Georgia, "Times New Roman", serif` },
];

/** Primera familia de un stack, sin comillas y en minúsculas. */
function firstFamilyOf(stack: string): string {
  return (stack.split(",")[0] ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
}

/**
 * Migración tolerante: resuelve el valor guardado por stack exacto o por la
 * primera familia del stack. Si no matchea ninguna opción devuelve undefined:
 * el select muestra una opción "Personalizada" con el valor tal cual y el
 * proyecto no se reescribe.
 */
function matchFontOption(value: string): FontOption | undefined {
  const trimmed = value.trim();
  const exact = FONT_OPTIONS.find((option) => option.stack === trimmed);
  if (exact) return exact;
  const first = firstFamilyOf(trimmed);
  if (first === "") return undefined;
  return FONT_OPTIONS.find((option) => firstFamilyOf(option.stack) === first);
}

/** Normaliza a #rrggbb en minúsculas, el formato que acepta el input nativo. */
function normalizeHexColor(color: string): string | null {
  const match = HEX_COLOR_RE.exec(color.trim());
  if (!match) return null;
  const channels = match[0].slice(1);
  const expanded =
    channels.length === 3
      ? channels
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : channels;
  return `#${expanded.toLowerCase()}`;
}

const colorLabels: Record<keyof Theme["colors"], string> = {
  background: "Fondo",
  surface: "Superficie",
  text: "Texto",
  muted: "Texto secundario",
  accent: "Acento",
  accentText: "Texto sobre acento",
  accentAlt: "Acento alternativo",
  border: "Borde",
  sale: "Descuento",
  rating: "Rating",
};

/**
 * Los proyectos anteriores todavía no guardan el token alternativo. El
 * editor muestra el acento principal como valor editable hasta que la persona
 * elija o confirme un valor alternativo explícito.
 */
function editableThemeColor(colors: Theme["colors"], key: keyof Theme["colors"]): string {
  return colors[key] ?? (key === "accentAlt" ? colors.accent : "");
}

/** Paletas curadas derivadas de los tokens existentes. */
const THEME_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  colors: Theme["colors"];
}> = [
  {
    id: "marfil-editorial",
    name: "Marfil editorial",
    description: "Neutros cálidos y acento tinta para una base limpia.",
    colors: {
      background: "#fcfcfb",
      surface: "#f0f0ee",
      text: "#0b0b0c",
      muted: "#696966",
      accent: "#0b0b0c",
      accentText: "#ffffff",
      accentAlt: "#9b4332",
      border: "#dededa",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "pao-blanqueria",
    name: "Pao Blanquería",
    description: "Rosa viejo, taupe cálido y crema marfil con contraste accesible.",
    colors: PAO_BLANQUERIA_COLORS,
  },
  {
    id: "jardin-salvia",
    name: "Jardín de salvia",
    description: "Verdes suaves para una identidad natural y serena.",
    colors: {
      background: "#f1f6f0",
      surface: "#e0ece0",
      text: "#1b2a20",
      muted: "#526457",
      accent: "#356248",
      accentText: "#f6fff7",
      accentAlt: "#9e4b38",
      border: "#c7d8c7",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "terracota-solar",
    name: "Terracota solar",
    description: "Barro cálido y arena para una tienda cercana y luminosa.",
    colors: {
      background: "#fff5ee",
      surface: "#f8e4d4",
      text: "#3a2118",
      muted: "#76584b",
      accent: "#9a442c",
      accentText: "#fff8f3",
      accentAlt: "#176b68",
      border: "#e8c8b3",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "azul-mediterraneo",
    name: "Azul mediterráneo",
    description: "Azules frescos para una presencia confiable y abierta.",
    colors: {
      background: "#eff6fb",
      surface: "#ddebf5",
      text: "#172b3a",
      muted: "#4a6272",
      accent: "#1d5b7a",
      accentText: "#f7fcff",
      accentAlt: "#8a4c15",
      border: "#c5d8e5",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "lavanda-suave",
    name: "Lavanda suave",
    description: "Lavandas ligeras para una estética delicada y moderna.",
    colors: {
      background: "#f6f2fb",
      surface: "#e9e0f3",
      text: "#29213a",
      muted: "#655978",
      accent: "#6d4a92",
      accentText: "#fbf8ff",
      accentAlt: "#944064",
      border: "#d8c9e7",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "rosa-petalo",
    name: "Rosa pétalo",
    description: "Rosas empolvados con contraste para una marca cálida.",
    colors: {
      background: "#fce9ed",
      surface: "#f6e0e5",
      text: "#3a2028",
      muted: "#76515c",
      accent: "#9a3f56",
      accentText: "#fff7f9",
      accentAlt: "#176b68",
      border: "#e6c5cf",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "menta-fresca",
    name: "Menta fresca",
    description: "Verdes agua para una sensación liviana y actual.",
    colors: {
      background: "#effaf7",
      surface: "#ddf1ea",
      text: "#17352f",
      muted: "#4d6a62",
      accent: "#1e6b59",
      accentText: "#f4fffc",
      accentAlt: "#a8443a",
      border: "#c2ded5",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "mostaza-clara",
    name: "Mostaza clara",
    description: "Amarillos suaves para destacar con energía sin saturar.",
    colors: {
      background: "#fff9e8",
      surface: "#f6edc7",
      text: "#332c18",
      muted: "#756b43",
      accent: "#766018",
      accentText: "#fffbef",
      accentAlt: "#3d4f86",
      border: "#e7d9a8",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "coral-suave",
    name: "Coral suave",
    description: "Coral cálido para comunicar cercanía y movimiento.",
    colors: {
      background: "#fff4f1",
      surface: "#f6dfd8",
      text: "#3b201d",
      muted: "#765651",
      accent: "#a64034",
      accentText: "#fff8f6",
      accentAlt: "#2e5d82",
      border: "#e6c6be",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "azul-lavanda",
    name: "Azul lavanda",
    description: "Azules violetas para una identidad tranquila y precisa.",
    colors: {
      background: "#eef1fa",
      surface: "#dce2f2",
      text: "#202b4a",
      muted: "#56627d",
      accent: "#3d5592",
      accentText: "#f8faff",
      accentAlt: "#80406f",
      border: "#c8d0e5",
      sale: "#d94a55",
      rating: "#d99a12",
    },
  },
  {
    id: "blanco-naranja",
    name: "Blanco y naranja",
    description: "Blanco luminoso con naranja profundo para acciones visibles.",
    colors: {
      background: "#fffaf5",
      surface: "#fff0e5",
      text: "#2a170f",
      muted: "#755043",
      accent: "#b84d12",
      accentText: "#ffffff",
      accentAlt: "#12656b",
      border: "#edcdb8",
      sale: "#a52e32",
      rating: "#9b6800",
    },
  },
  {
    id: "grafito-lima",
    name: "Grafito lima",
    description: "Grafito profundo con lima eléctrica y texto de alto contraste.",
    colors: {
      background: "#111416",
      surface: "#1b2023",
      text: "#f5f7f6",
      muted: "#bac3c6",
      accent: "#b4e34a",
      accentText: "#182000",
      accentAlt: "#e67269",
      border: "#3a464a",
      sale: "#ff8f87",
      rating: "#f6c84d",
    },
  },
  {
    id: "azul-noche",
    name: "Azul noche",
    description: "Azul profundo con celeste eléctrico para una presencia tecnológica.",
    colors: {
      background: "#101828",
      surface: "#18243a",
      text: "#f3f7ff",
      muted: "#b8c5d9",
      accent: "#57b8ff",
      accentText: "#062036",
      accentAlt: "#f27d78",
      border: "#344766",
      sale: "#ff918d",
      rating: "#ffd36b",
    },
  },
  {
    id: "ciruela-nocturna",
    name: "Ciruela nocturna",
    description: "Ciruela oscura con rosa suave para una identidad expresiva.",
    colors: {
      background: "#1b1220",
      surface: "#291a31",
      text: "#fff5fc",
      muted: "#d3b7ce",
      accent: "#ed8bc3",
      accentText: "#351326",
      accentAlt: "#efb64d",
      border: "#55345e",
      sale: "#ff9e9b",
      rating: "#f5cb65",
    },
  },
  {
    id: "cafe-espresso",
    name: "Café espresso",
    description: "Marrón espresso con ámbar cálido para una tienda acogedora.",
    colors: {
      background: "#1a120e",
      surface: "#2a1d17",
      text: "#fff3e8",
      muted: "#d9bca7",
      accent: "#f0a35b",
      accentText: "#2b1709",
      accentAlt: "#55c7a4",
      border: "#5a3d2c",
      sale: "#ff958c",
      rating: "#f4c75c",
    },
  },
  {
    id: "bosque-profundo",
    name: "Bosque profundo",
    description: "Verde bosque con menta clara para una estética natural y premium.",
    colors: {
      background: "#0d1b17",
      surface: "#142923",
      text: "#effaf4",
      muted: "#b1cfc0",
      accent: "#6fdbad",
      accentText: "#06261c",
      accentAlt: "#e1ac4e",
      border: "#31564a",
      sale: "#ff958d",
      rating: "#f2c65d",
    },
  },
  {
    id: "azul-petroleo",
    name: "Azul petróleo",
    description: "Turquesa mineral y fondo claro para una marca fresca y confiable.",
    colors: {
      background: "#eef8fa",
      surface: "#dceff1",
      text: "#12333a",
      muted: "#4d6970",
      accent: "#087f86",
      accentText: "#f5ffff",
      accentAlt: "#a84436",
      border: "#c2dfe2",
      sale: "#b73542",
      rating: "#936600",
    },
  },
  {
    id: "arena-azul",
    name: "Arena y azul",
    description: "Arena cálida con azul marino para una identidad sobria y versátil.",
    colors: {
      background: "#fbf7ed",
      surface: "#eee6d5",
      text: "#232c3a",
      muted: "#5f6874",
      accent: "#2c4c7a",
      accentText: "#f8fbff",
      accentAlt: "#a64b3d",
      border: "#d9ccb2",
      sale: "#a93638",
      rating: "#8a6100",
    },
  },
  {
    id: "uva-crema",
    name: "Uva crema",
    description: "Violeta profundo sobre crema para una propuesta delicada y distintiva.",
    colors: {
      background: "#fbf7ff",
      surface: "#eee5fa",
      text: "#281a3d",
      muted: "#635577",
      accent: "#70459e",
      accentText: "#ffffff",
      accentAlt: "#b74b65",
      border: "#d9c8ec",
      sale: "#b23d55",
      rating: "#956600",
    },
  },
  {
    id: "durazno-mineral",
    name: "Durazno mineral",
    description: "Durazno suave con ladrillo para una energía cálida y equilibrada.",
    colors: {
      background: "#fff6f0",
      surface: "#f7e5da",
      text: "#3a211b",
      muted: "#76584d",
      accent: "#a7472e",
      accentText: "#fffaf7",
      accentAlt: "#2f5c85",
      border: "#e8c9b9",
      sale: "#a83239",
      rating: "#956600",
    },
  },
];

const PRESET_SWATCH_KEYS: Array<keyof Theme["colors"]> = [
  "background",
  "text",
  "accent",
  "accentAlt",
  "accentText",
];

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  let hex = match[1] ?? "";
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance([red, green, blue]: [number, number, number]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** Ratio WCAG 2.x entre dos colores; null si alguno no es un hex válido. */
function contrastRatio(first: string, second: string): number | null {
  const firstRgb = parseHex(first);
  const secondRgb = parseHex(second);
  if (!firstRgb || !secondRgb) return null;
  const firstLuminance = luminance(firstRgb);
  const secondLuminance = luminance(secondRgb);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const CONTRAST_PAIRS: Array<{
  id: string;
  label: string;
  foreground: keyof Theme["colors"];
  background: keyof Theme["colors"];
}> = [
  { id: "text", label: "Texto sobre fondo", foreground: "text", background: "background" },
  {
    id: "muted",
    label: "Texto secundario sobre fondo",
    foreground: "muted",
    background: "background",
  },
  { id: "accent", label: "Texto sobre acento", foreground: "accentText", background: "accent" },
  {
    id: "accent-alt",
    label: "Texto sobre acento alternativo",
    foreground: "accentText",
    background: "accentAlt",
  },
];

const CONTRAST_THRESHOLD = 4.5;

type ThemeBackground = NonNullable<Theme["background"]>;
type ThemeTextShadow = NonNullable<NonNullable<Theme["shadows"]>["text"]>;
type ThemeTextShadowLengthKey = "offsetX" | "offsetY" | "blur";

const BACKGROUND_REPEAT_OPTIONS: Array<ThemeBackground["repeat"]> = [
  "repeat",
  "repeat-x",
  "repeat-y",
  "no-repeat",
];
const BACKGROUND_SIZE_OPTIONS = [
  "auto",
  "240px",
  "320px",
  "480px",
  "640px",
  "768px",
  "1024px",
  "cover",
  "contain",
] as const;

type ThemeGroup = "colors" | "typography" | "geometry" | "background" | "textShadow";

const groupLabels: Record<ThemeGroup, string> = {
  colors: "colores",
  typography: "tipografía",
  geometry: "geometría",
  background: "fondo decorativo",
  textShadow: "sombra del hero mobile",
};

export function ThemeEditor({
  project,
  onChange,
}: {
  project: StoreProjectV1;
  onChange(project: StoreProjectV1): void;
}) {
  /** El tema al abrir la pestaña es la referencia para los resets por grupo. */
  const originalTheme = useRef(project.theme);

  /**
   * Borradores de los campos de color: mientras el texto no es un hex válido
   * no se commitea (patrón de SettingsInspector/Overview); el draft sobrevive
   * a la escritura y se descarta al cambiar los colores confirmados.
   */
  const [colorDrafts, setColorDrafts] = useState<Partial<Record<keyof Theme["colors"], string>>>(
    {},
  );
  const [colorErrors, setColorErrors] = useState<Partial<Record<keyof Theme["colors"], boolean>>>(
    {},
  );

  /**
   * Borrador del ancho del contenedor: escribirlo tecleando pasa por valores
   * inválidos a mitad de camino (p. ej. "1"), que el schema rechazaría y
   * haría rebotar el input sin mostrar lo escrito. El draft sólo se commitea
   * con un número dentro del rango del schema (mismo patrón que los colores).
   */
  const [containerDraft, setContainerDraft] = useState<string | null>(null);
  const [containerError, setContainerError] = useState<boolean>(false);
  const [textShadowLengthDrafts, setTextShadowLengthDrafts] = useState<
    Partial<Record<ThemeTextShadowLengthKey, string>>
  >({});
  const [textShadowLengthErrors, setTextShadowLengthErrors] = useState<
    Partial<Record<ThemeTextShadowLengthKey, boolean>>
  >({});

  const textShadowEnabled = project.theme.shadows?.text?.enabled ?? true;
  const textShadowOpacity =
    project.theme.shadows?.text?.opacity ?? DEFAULT_THEME_TEXT_SHADOW_OPACITY;
  const textShadowOffsetX =
    project.theme.shadows?.text?.offsetX ?? DEFAULT_THEME_TEXT_SHADOW_OFFSET_X;
  const textShadowOffsetY =
    project.theme.shadows?.text?.offsetY ?? DEFAULT_THEME_TEXT_SHADOW_OFFSET_Y;
  const textShadowBlur = project.theme.shadows?.text?.blur ?? DEFAULT_THEME_TEXT_SHADOW_BLUR;
  const isCatalogModernV2 = project.commerceTemplates.designFamily === "catalog-modern-v2";
  const heroPreviewTextColor = isCatalogModernV2
    ? project.theme.colors.background
    : project.theme.colors.text;
  const textShadowColor = isCatalogModernV2
    ? deriveThemeTextShadowColor(project.theme.colors, project.theme.colors.background)
    : deriveThemeTextShadowColor(project.theme.colors);
  const previewTextShadow = textShadowEnabled
    ? `${textShadowOffsetX}px ${textShadowOffsetY}px ${textShadowBlur}px color-mix(in srgb, ${textShadowColor} ${Math.round(textShadowOpacity * 100)}%, transparent)`
    : "none";

  /* biome-ignore lint/correctness/useExhaustiveDependencies: al cambiar los colores confirmados (commit, preset o reset) los borradores de texto deben volver a partir de esos valores. */
  useEffect(() => {
    setColorDrafts({});
    setColorErrors({});
  }, [project.theme.colors]);

  useEffect(() => {
    setContainerDraft(null);
    setContainerError(false);
  }, []);

  /* biome-ignore lint/correctness/useExhaustiveDependencies: al cambiar de tienda, los borradores de la sombra deben volver a partir de los valores persistidos. */
  useEffect(() => {
    setTextShadowLengthDrafts({});
    setTextShadowLengthErrors({});
  }, [project.id]);

  const updateTheme = (theme: Theme, assets: StoreProjectV1["assets"] = project.assets) =>
    onChange({ ...project, assets, theme, updatedAt: new Date().toISOString() });

  const commitColor = (key: keyof Theme["colors"], raw: string) => {
    const next = normalizeHexColor(raw);
    if (next === null) {
      setColorDrafts((current) => ({ ...current, [key]: raw }));
      setColorErrors((current) => ({ ...current, [key]: true }));
      return;
    }
    setColorDrafts((current) => ({ ...current, [key]: next }));
    setColorErrors((current) => ({ ...current, [key]: false }));
    if (next !== project.theme.colors[key]) {
      updateTheme({
        ...project.theme,
        colors: { ...project.theme.colors, [key]: next },
      });
    }
  };

  const applyPreset = (preset: (typeof THEME_PRESETS)[number]) =>
    updateTheme({ ...project.theme, colors: preset.colors });

  const resetGroup = (group: ThemeGroup) => {
    const base = originalTheme.current;
    if (group === "colors") {
      // Limpiar borradores explícitamente: si los colores confirmados ya eran
      // los de apertura, el efecto de [project.theme.colors] no se dispara y el
      // texto inválido tecleado seguiría visible tras "Restaurar".
      setColorDrafts({});
      setColorErrors({});
      updateTheme({ ...project.theme, colors: base.colors });
      return;
    }
    if (group === "typography") {
      updateTheme({ ...project.theme, typography: base.typography });
      return;
    }
    if (group === "background") {
      const nextTheme = { ...project.theme };
      if (base.background) nextTheme.background = base.background;
      else delete nextTheme.background;
      updateTheme(nextTheme);
      return;
    }
    if (group === "textShadow") {
      setTextShadowLengthDrafts({});
      setTextShadowLengthErrors({});
      const currentShadows = project.theme.shadows;
      if (!currentShadows) return;
      const shadows = { ...currentShadows };
      if (base.shadows?.text) shadows.text = base.shadows.text;
      else delete shadows.text;
      updateTheme({
        ...project.theme,
        shadows,
      });
      return;
    }
    setContainerDraft(null);
    setContainerError(false);
    updateTheme({
      ...project.theme,
      spacingScale: base.spacingScale,
      radius: base.radius,
      container: base.container,
    });
  };

  const commitContainer = (raw: string) => {
    const next = Number(raw.trim());
    if (raw.trim() === "" || !Number.isFinite(next)) {
      setContainerDraft(raw);
      setContainerError(true);
      return;
    }
    const rounded = Math.round(next);
    if (rounded < CONTAINER_MIN || rounded > CONTAINER_MAX) {
      setContainerDraft(raw);
      setContainerError(true);
      return;
    }
    setContainerDraft(String(rounded));
    setContainerError(false);
    if (rounded !== project.theme.container) {
      updateTheme({ ...project.theme, container: rounded });
    }
  };

  const commitFont = (key: "display" | "body", stack: string) => {
    if (stack !== project.theme.typography[key]) {
      updateTheme({
        ...project.theme,
        typography: { ...project.theme.typography, [key]: stack },
      });
    }
  };

  const updateTextShadow = (changes: Partial<ThemeTextShadow>) =>
    updateTheme({
      ...project.theme,
      shadows: {
        card: project.theme.shadows?.card ?? "none",
        elevated: project.theme.shadows?.elevated ?? "none",
        overlay: project.theme.shadows?.overlay ?? "0 24px 70px rgba(0,0,0,.14)",
        ...project.theme.shadows,
        text: {
          enabled: textShadowEnabled,
          opacity: textShadowOpacity,
          offsetX: textShadowOffsetX,
          offsetY: textShadowOffsetY,
          blur: textShadowBlur,
          ...changes,
        },
      },
    });

  const commitTextShadowLength = (
    key: ThemeTextShadowLengthKey,
    raw: string,
    min: number,
    max: number,
  ) => {
    const trimmed = raw.trim();
    const numeric = Number(trimmed);
    if (trimmed === "" || !/^-?\d+$/.test(trimmed) || !Number.isSafeInteger(numeric)) {
      setTextShadowLengthDrafts((current) => ({ ...current, [key]: raw }));
      setTextShadowLengthErrors((current) => ({ ...current, [key]: true }));
      return;
    }
    if (numeric < min || numeric > max) {
      setTextShadowLengthDrafts((current) => ({ ...current, [key]: raw }));
      setTextShadowLengthErrors((current) => ({ ...current, [key]: true }));
      return;
    }
    setTextShadowLengthDrafts((current) => ({ ...current, [key]: String(numeric) }));
    setTextShadowLengthErrors((current) => ({ ...current, [key]: false }));
    if (key === "offsetX" && numeric !== textShadowOffsetX) updateTextShadow({ offsetX: numeric });
    if (key === "offsetY" && numeric !== textShadowOffsetY) updateTextShadow({ offsetY: numeric });
    if (key === "blur" && numeric !== textShadowBlur) updateTextShadow({ blur: numeric });
  };

  const setBackgroundImage = (assetId: string) => {
    const nextTheme = { ...project.theme };
    const selectedAsset = project.assets.find((asset) => asset.id === assetId);
    if (!selectedAsset) {
      delete nextTheme.background;
    } else {
      const current = project.theme.background;
      nextTheme.background = {
        imageAssetId: selectedAsset.id,
        repeat: current?.repeat ?? "repeat",
        size: current?.size ?? "480px",
        opacity: current?.opacity ?? 1,
      };
    }
    updateTheme(nextTheme);
  };

  const applyUploadedBackground = (asset: ImageAsset) => {
    const assets = project.assets.some((current) => current.id === asset.id)
      ? project.assets
      : [...project.assets, asset];
    const current = project.theme.background;
    updateTheme(
      {
        ...project.theme,
        background: {
          imageAssetId: asset.id,
          repeat: current?.repeat ?? "repeat",
          size: current?.size ?? "480px",
          opacity: current?.opacity ?? 1,
        },
      },
      assets,
    );
  };

  const updateBackground = (changes: Partial<ThemeBackground>) => {
    const current = project.theme.background;
    if (!current) return;
    updateTheme({ ...project.theme, background: { ...current, ...changes } });
  };

  const contrastChecks = CONTRAST_PAIRS.map((pair) => ({
    ...pair,
    ratio: contrastRatio(
      editableThemeColor(project.theme.colors, pair.foreground),
      editableThemeColor(project.theme.colors, pair.background),
    ),
  }));
  const background = project.theme.background;
  const backgroundSizeIsCustom =
    background !== undefined &&
    !BACKGROUND_SIZE_OPTIONS.includes(background.size as (typeof BACKGROUND_SIZE_OPTIONS)[number]);

  return (
    <section className="workspace-section">
      <SectionHeader
        title="Tema de la tienda"
        description="Un sistema de tokens consistente para todos los módulos de la tienda."
      />

      <WorkspaceGroups
        label="Opciones del tema"
        groups={[
          {
            id: "palette",
            label: "Paleta y contraste",
            content: (
              <>
                {project.commerceTemplates.designFamily?.startsWith("catalog-modern") ? (
                  <fieldset className="theme-presets-panel theme-family-panel">
                    <legend>Familia visual</legend>
                    <div className="theme-presets">
                      <div
                        className="theme-preset"
                        data-testid="ui-design-family-v2"
                        data-active={
                          project.commerceTemplates.designFamily === "catalog-modern-v2" ||
                          undefined
                        }
                      >
                        <strong>Editorial V2</strong>
                        <small>Familia visual actual de SolaraCommerce.</small>
                      </div>
                    </div>
                    <p className="inspector-note">
                      La familia visual actual es única. Catálogo, contenido, SEO y configuración
                      comercial se conservan.
                    </p>
                  </fieldset>
                ) : null}

                <fieldset className="theme-presets-panel">
                  <legend>Paletas</legend>
                  <div className="theme-presets">
                    {THEME_PRESETS.map((preset) => {
                      const active = Object.keys(project.theme.colors).every(
                        (key) =>
                          project.theme.colors[key as keyof Theme["colors"]] ===
                          preset.colors[key as keyof Theme["colors"]],
                      );
                      return (
                        <button
                          type="button"
                          key={preset.id}
                          className="theme-preset"
                          data-testid="ui-theme-preset"
                          aria-label={`Aplicar paleta ${preset.name}`}
                          aria-pressed={active}
                          data-active={active || undefined}
                          onClick={() => applyPreset(preset)}
                        >
                          <span className="theme-preset__swatches" aria-hidden>
                            {PRESET_SWATCH_KEYS.map((key) => (
                              <span
                                key={key}
                                className="theme-preset__swatch"
                                style={{ background: preset.colors[key] }}
                              />
                            ))}
                          </span>
                          <strong>{preset.name}</strong>
                          <small>{preset.description}</small>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>
                    <PaintBrush aria-hidden size={19} /> Color
                  </legend>
                  <div className="fieldset-toolbar">
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={ArrowCounterClockwise}
                      data-testid="ui-reset-colors"
                      onClick={() => resetGroup("colors")}
                    >
                      Restaurar colores
                    </Button>
                  </div>
                  <div className="color-grid">
                    {(Object.keys(colorLabels) as Array<keyof Theme["colors"]>).map((key) => (
                      <Field
                        label={colorLabels[key]}
                        key={key}
                        {...(colorErrors[key]
                          ? { error: COLOR_ERROR, errorId: `theme-color-error-${key}` }
                          : {})}
                      >
                        <span className="color-input">
                          <input
                            type="color"
                            value={editableThemeColor(project.theme.colors, key)}
                            aria-label={`${colorLabels[key]} selector de color`}
                            data-testid={`ui-color-native-${key}`}
                            onChange={(event) => commitColor(key, event.target.value)}
                          />
                          <input
                            type="text"
                            value={
                              colorDrafts[key] ?? editableThemeColor(project.theme.colors, key)
                            }
                            aria-label={`${colorLabels[key]} valor hexadecimal`}
                            aria-invalid={colorErrors[key] ? true : undefined}
                            aria-describedby={
                              colorErrors[key] ? `theme-color-error-${key}` : undefined
                            }
                            data-testid={`ui-color-text-${key}`}
                            onChange={(event) => commitColor(key, event.target.value)}
                          />
                        </span>
                      </Field>
                    ))}
                  </div>
                  <div className="contrast-check" aria-live="polite">
                    <strong className="contrast-check__title">Contraste (WCAG)</strong>
                    {contrastChecks.map((check) => {
                      const ratio = check.ratio;
                      const invalid = ratio === null;
                      const passing = !invalid && ratio >= CONTRAST_THRESHOLD;
                      const testid = invalid
                        ? "ui-contrast-warn"
                        : passing
                          ? "ui-contrast-ok"
                          : "ui-contrast-warning";
                      return (
                        <div
                          className={`contrast-check__row${passing ? "" : " is-failing"}`}
                          data-testid={testid}
                          key={check.id}
                        >
                          <span>{check.label}</span>
                          <span className="contrast-check__ratio">
                            {check.ratio === null
                              ? "color no válido"
                              : `${check.ratio.toFixed(2)}:1${passing ? "" : ` — inferior a ${CONTRAST_THRESHOLD}:1`}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            ),
          },
          {
            id: "type",
            label: "Tipografía",
            content: (
              <>
                <fieldset>
                  <legend>
                    <TextT aria-hidden size={19} /> Tipografía
                  </legend>
                  <div className="fieldset-toolbar">
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={ArrowCounterClockwise}
                      data-testid="ui-reset-typography"
                      onClick={() => resetGroup("typography")}
                    >
                      Restaurar tipografía
                    </Button>
                  </div>
                  <Field label="Familia de títulos">
                    <FontSelect
                      value={project.theme.typography.display}
                      testId="ui-font-display"
                      label="Familia de títulos"
                      onChange={(stack) => commitFont("display", stack)}
                    />
                  </Field>
                  <Field label="Familia de texto">
                    <FontSelect
                      value={project.theme.typography.body}
                      testId="ui-font-body"
                      label="Familia de texto"
                      onChange={(stack) => commitFont("body", stack)}
                    />
                  </Field>
                  <Field label={`Escala ${project.theme.typography.scale.toFixed(2)}`}>
                    <input
                      type="range"
                      min={0.8}
                      max={1.4}
                      step={0.05}
                      value={project.theme.typography.scale}
                      onChange={(event) =>
                        updateTheme({
                          ...project.theme,
                          typography: {
                            ...project.theme.typography,
                            scale: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                </fieldset>
              </>
            ),
          },
          {
            id: "surfaces",
            label: "Superficies y espacio",
            content: (
              <>
                <fieldset className="theme-background-panel">
                  <legend>
                    <ImageIcon aria-hidden size={19} /> Fondo decorativo
                  </legend>
                  <p className="inspector-note">
                    Opcional: elegí una imagen de Recursos para repetirla detrás del sitio. Las
                    tiendas nuevas comienzan sin fondo.
                  </p>
                  <div className="fieldset-toolbar">
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={ArrowCounterClockwise}
                      data-testid="ui-reset-background"
                      onClick={() => resetGroup("background")}
                    >
                      Restaurar fondo
                    </Button>
                  </div>
                  <div className="theme-background-grid">
                    <Field
                      label="Imagen del patrón"
                      hint="Podés elegir un asset existente o subir uno nuevo."
                    >
                      <ImageAssetPicker
                        value={background?.imageAssetId ?? ""}
                        assets={project.assets}
                        knownAssets={project.assets}
                        noneLabel="Sin fondo decorativo"
                        ariaLabel="Imagen del fondo decorativo"
                        onChange={setBackgroundImage}
                        onUpload={applyUploadedBackground}
                      />
                    </Field>
                    <Field label="Repetición">
                      <select
                        value={background?.repeat ?? "repeat"}
                        disabled={!background}
                        data-testid="ui-theme-background-repeat"
                        aria-label="Repetición del fondo decorativo"
                        onChange={(event) =>
                          updateBackground({
                            repeat: event.target.value as ThemeBackground["repeat"],
                          })
                        }
                      >
                        {BACKGROUND_REPEAT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option === "repeat"
                              ? "En ambas direcciones"
                              : option === "repeat-x"
                                ? "Horizontal"
                                : option === "repeat-y"
                                  ? "Vertical"
                                  : "Una sola vez"}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tamaño">
                      <select
                        value={background?.size ?? "480px"}
                        disabled={!background}
                        data-testid="ui-theme-background-size"
                        aria-label="Tamaño del fondo decorativo"
                        onChange={(event) => updateBackground({ size: event.target.value })}
                      >
                        {backgroundSizeIsCustom ? (
                          <option value={background.size}>{background.size}</option>
                        ) : null}
                        {BACKGROUND_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={`Presencia ${Math.round((background?.opacity ?? 1) * 100)}%`}
                      hint="Menor presencia deja ver más el color de fondo."
                    >
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={background?.opacity ?? 1}
                        disabled={!background}
                        data-testid="ui-theme-background-opacity"
                        aria-label="Presencia del fondo decorativo"
                        onChange={(event) =>
                          updateBackground({ opacity: Number(event.target.value) })
                        }
                      />
                    </Field>
                  </div>
                </fieldset>

                <fieldset>
                  <legend>
                    <Wrench aria-hidden size={19} /> Geometría
                  </legend>
                  <div className="fieldset-toolbar">
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={ArrowCounterClockwise}
                      data-testid="ui-reset-geometry"
                      onClick={() => resetGroup("geometry")}
                    >
                      Restaurar geometría
                    </Button>
                  </div>
                  <Field label={`Espaciado ${project.theme.spacingScale.toFixed(2)}`}>
                    <input
                      type="range"
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      value={project.theme.spacingScale}
                      onChange={(event) =>
                        updateTheme({ ...project.theme, spacingScale: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field label={`Radio ${project.theme.radius}px`}>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={project.theme.radius}
                      onChange={(event) =>
                        updateTheme({ ...project.theme, radius: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field
                    label="Ancho del contenedor"
                    {...(containerError ? { error: CONTAINER_ERROR } : {})}
                  >
                    <input
                      type="number"
                      min={CONTAINER_MIN}
                      max={CONTAINER_MAX}
                      value={containerDraft ?? String(project.theme.container)}
                      aria-invalid={containerError ? true : undefined}
                      onChange={(event) => commitContainer(event.target.value)}
                    />
                  </Field>
                </fieldset>
                <fieldset className="theme-text-shadow-panel">
                  <legend>
                    <TextT aria-hidden size={19} /> Sombra del hero mobile
                  </legend>
                  <p className="theme-text-shadow-meta">
                    Sólo aparece hasta 767 px. Ajustá la distancia horizontal/vertical, el
                    desenfoque y la intensidad; el color se deriva automáticamente del token de
                    mayor contraste de la paleta y no afecta el botón. Valores positivos desplazan
                    la sombra hacia la derecha/abajo y negativos hacia la izquierda/arriba.
                  </p>
                  <label className="theme-text-shadow-toggle">
                    <input
                      type="checkbox"
                      checked={textShadowEnabled}
                      data-testid="ui-text-shadow-enabled"
                      onChange={(event) => updateTextShadow({ enabled: event.target.checked })}
                    />
                    <span>Activar sombra en el texto del hero</span>
                  </label>
                  <div className="theme-text-shadow-controls">
                    <Field
                      label={`Horizontal ${textShadowOffsetX}px`}
                      {...(textShadowLengthErrors.offsetX
                        ? {
                            error: `Usá un entero entre ${THEME_TEXT_SHADOW_OFFSET_MIN} y ${THEME_TEXT_SHADOW_OFFSET_MAX}.`,
                          }
                        : {})}
                    >
                      <input
                        type="number"
                        min={THEME_TEXT_SHADOW_OFFSET_MIN}
                        max={THEME_TEXT_SHADOW_OFFSET_MAX}
                        step={1}
                        value={textShadowLengthDrafts.offsetX ?? String(textShadowOffsetX)}
                        disabled={!textShadowEnabled}
                        aria-label="Desplazamiento horizontal de la sombra del hero mobile"
                        data-testid="ui-text-shadow-offset-x"
                        onChange={(event) =>
                          commitTextShadowLength(
                            "offsetX",
                            event.target.value,
                            THEME_TEXT_SHADOW_OFFSET_MIN,
                            THEME_TEXT_SHADOW_OFFSET_MAX,
                          )
                        }
                      />
                    </Field>
                    <Field
                      label={`Vertical ${textShadowOffsetY}px`}
                      {...(textShadowLengthErrors.offsetY
                        ? {
                            error: `Usá un entero entre ${THEME_TEXT_SHADOW_OFFSET_MIN} y ${THEME_TEXT_SHADOW_OFFSET_MAX}.`,
                          }
                        : {})}
                    >
                      <input
                        type="number"
                        min={THEME_TEXT_SHADOW_OFFSET_MIN}
                        max={THEME_TEXT_SHADOW_OFFSET_MAX}
                        step={1}
                        value={textShadowLengthDrafts.offsetY ?? String(textShadowOffsetY)}
                        disabled={!textShadowEnabled}
                        aria-label="Desplazamiento vertical de la sombra del hero mobile"
                        data-testid="ui-text-shadow-offset-y"
                        onChange={(event) =>
                          commitTextShadowLength(
                            "offsetY",
                            event.target.value,
                            THEME_TEXT_SHADOW_OFFSET_MIN,
                            THEME_TEXT_SHADOW_OFFSET_MAX,
                          )
                        }
                      />
                    </Field>
                    <Field
                      label={`Desenfoque ${textShadowBlur}px`}
                      {...(textShadowLengthErrors.blur
                        ? {
                            error: `Usá un entero entre ${THEME_TEXT_SHADOW_BLUR_MIN} y ${THEME_TEXT_SHADOW_BLUR_MAX}.`,
                          }
                        : {})}
                    >
                      <input
                        type="number"
                        min={THEME_TEXT_SHADOW_BLUR_MIN}
                        max={THEME_TEXT_SHADOW_BLUR_MAX}
                        step={1}
                        value={textShadowLengthDrafts.blur ?? String(textShadowBlur)}
                        disabled={!textShadowEnabled}
                        aria-label="Desenfoque de la sombra del hero mobile"
                        data-testid="ui-text-shadow-blur"
                        onChange={(event) =>
                          commitTextShadowLength(
                            "blur",
                            event.target.value,
                            THEME_TEXT_SHADOW_BLUR_MIN,
                            THEME_TEXT_SHADOW_BLUR_MAX,
                          )
                        }
                      />
                    </Field>
                  </div>
                  <Field label={`Intensidad ${Math.round(textShadowOpacity * 100)}%`}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={textShadowOpacity}
                      disabled={!textShadowEnabled}
                      aria-label="Intensidad de la sombra del hero mobile"
                      data-testid="ui-text-shadow-opacity"
                      onChange={(event) =>
                        updateTextShadow({ opacity: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <div
                    className="theme-text-shadow-preview"
                    data-testid="ui-text-shadow-preview"
                    style={{
                      backgroundColor: isCatalogModernV2
                        ? project.theme.colors.text
                        : project.theme.colors.background,
                      color: heroPreviewTextColor,
                      textShadow: previewTextShadow,
                    }}
                  >
                    <small>VISTA PREVIA DEL HERO MOBILE</small>
                    <strong>Texto del hero</strong>
                    <span>La sombra no se aplica al botón.</span>
                    <i style={{ background: textShadowColor }} aria-hidden />
                  </div>
                  <div className="fieldset-toolbar">
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={ArrowCounterClockwise}
                      data-testid="ui-reset-text-shadow"
                      onClick={() => resetGroup("textShadow")}
                    >
                      Restaurar sombra
                    </Button>
                  </div>
                </fieldset>
              </>
            ),
          },
        ]}
      />
      <p className="inspector-note">
        Los resets vuelven cada grupo al tema que tenía la tienda al abrir esta pestaña (
        {groupLabels.colors}, {groupLabels.typography}, {groupLabels.geometry},
        {groupLabels.background} y {groupLabels.textShadow} por separado).
      </p>
    </section>
  );
}

/**
 * Selector de fuentes real: familias del sistema + Google Fonts curadas. Un
 * valor guardado fuera de las opciones se muestra como "Personalizada" sin
 * reescribir el proyecto (migración tolerante sin cambios de schema).
 */
function FontSelect({
  value,
  testId,
  label,
  onChange,
}: {
  value: string;
  testId: string;
  label: string;
  onChange(stack: string): void;
}) {
  const matched = matchFontOption(value);
  const custom = matched === undefined;
  return (
    <select
      aria-label={label}
      value={custom ? value : matched.stack}
      data-testid={testId}
      onChange={(event) => onChange(event.target.value)}
    >
      <optgroup label="Sistema">
        {FONT_OPTIONS.filter((option) => option.group === "sistema").map((option) => (
          <option key={option.id} value={option.stack}>
            {option.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Google Fonts">
        {FONT_OPTIONS.filter((option) => option.group === "google").map((option) => (
          <option key={option.id} value={option.stack}>
            {option.label}
          </option>
        ))}
      </optgroup>
      {custom ? (
        <optgroup label="Personalizada">
          <option value={value}>
            {value === "" ? "Personalizada" : `Personalizada: ${value}`}
          </option>
        </optgroup>
      ) : null}
    </select>
  );
}
