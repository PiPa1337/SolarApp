export type GravityTaaQuality = "off" | "low" | "medium" | "high" | "very-high" | "extreme";

export const GRAVITY_TAA_QUALITY_IDS: GravityTaaQuality[] = [
  "off",
  "low",
  "medium",
  "high",
  "very-high",
  "extreme",
];

export const GRAVITY_TAA_QUALITY_META: Record<
  GravityTaaQuality,
  { label: string; description: string }
> = {
  off: {
    label: "Off",
    description: "1 muestra: sin acumulación temporal y con el menor coste de GPU",
  },
  low: {
    label: "Bajo",
    description: "2 muestras: suaviza bordes con un aumento mínimo de carga",
  },
  medium: {
    label: "Medio",
    description: "4 muestras: equilibrio entre bordes limpios y uso de GPU",
  },
  high: {
    label: "Alto",
    description: "8 muestras: reduce más el parpadeo de filamentos y bordes dentados",
  },
  "very-high": {
    label: "Muy alto",
    description: "12 muestras: estabiliza detalles finos con mayor coste de GPU",
  },
  extreme: {
    label: "Extremo",
    description: "16 muestras: máxima estabilidad temporal y mayor uso de GPU",
  },
};

export const GRAVITY_ANIMATION_SPEED_MIN = 0.25;
export const GRAVITY_ANIMATION_SPEED_MAX = 2;
export const DEFAULT_GRAVITY_ANIMATION_SPEED = 1;

export interface GravitySettings {
  renderScaleMultiplier: number;
  maxFps: number;
  diskLayers: number;
  animationSpeed: number;
  materialSpeed: number;
  pointerResponse: number;
  starDensity: number;
  dustIntensity: number;
  haloIntensity: number;
  warmth: number;
  contrast: number;
  turbulence: number;
  filamentDetail: number;
  gasAbsorption: number;
  diskTilt: number;
  lensStrength: number;
  bloomSpread: number;
  causticIntensity: number;
  galaxyIntensity: number;
  starTwinkle: number;
  vignette: number;
  staticDiskDetails: boolean;
  dustBeltEnabled: boolean;
  proceduralDetailEnabled: boolean;
  diskWarpEnabled: boolean;
  lensedSecondaryEnabled: boolean;
  cloudEnvelopeEnabled: boolean;
  erosionEnabled: boolean;
  laneBrightnessEnabled: boolean;
  streamersEnabled: boolean;
  hotRimEnabled: boolean;
  gasCloudBrightnessEnabled: boolean;
  streaksEnabled: boolean;
  temperatureCloudModulationEnabled: boolean;
  densityEnvelopeEnabled: boolean;
  densityLaneAbsorptionEnabled: boolean;
  lensedErosionCloudsEnabled: boolean;
  gasCloudStructureEnabled: boolean;
  orbitalLanePatternEnabled: boolean;
  lensedBreakupEnabled: boolean;
  lensedBaseEmissionEnabled: boolean;
  lensedDensityMaskEnabled: boolean;
  lensedGlowCloudEnabled: boolean;
  broadWispsEnabled: boolean;
  lensedStaticEnvelopeEnabled: boolean;
  rimCloudModulationEnabled: boolean;
  farSideDiskEnabled: boolean;
  nearSideDiskEnabled: boolean;
  thermalColorEnabled: boolean;
  radialHeatEnabled: boolean;
  depthAbsorptionEnabled: boolean;
  layerCorrugationEnabled: boolean;
  pauseWhenHidden: boolean;
  taaQuality: GravityTaaQuality;
}

export type NumericGravitySetting = Exclude<
  keyof GravitySettings,
  | "staticDiskDetails"
  | "dustBeltEnabled"
  | "proceduralDetailEnabled"
  | "diskWarpEnabled"
  | "lensedSecondaryEnabled"
  | "cloudEnvelopeEnabled"
  | "erosionEnabled"
  | "laneBrightnessEnabled"
  | "streamersEnabled"
  | "hotRimEnabled"
  | "gasCloudBrightnessEnabled"
  | "streaksEnabled"
  | "temperatureCloudModulationEnabled"
  | "densityEnvelopeEnabled"
  | "densityLaneAbsorptionEnabled"
  | "lensedErosionCloudsEnabled"
  | "gasCloudStructureEnabled"
  | "orbitalLanePatternEnabled"
  | "lensedBreakupEnabled"
  | "lensedBaseEmissionEnabled"
  | "lensedDensityMaskEnabled"
  | "lensedGlowCloudEnabled"
  | "broadWispsEnabled"
  | "lensedStaticEnvelopeEnabled"
  | "rimCloudModulationEnabled"
  | "farSideDiskEnabled"
  | "nearSideDiskEnabled"
  | "thermalColorEnabled"
  | "radialHeatEnabled"
  | "depthAbsorptionEnabled"
  | "layerCorrugationEnabled"
  | "pauseWhenHidden"
  | "taaQuality"
>;

export const GRAVITY_NUMERIC_SETTINGS: NumericGravitySetting[] = [
  "renderScaleMultiplier",
  "maxFps",
  "diskLayers",
  "materialSpeed",
  "pointerResponse",
  "starDensity",
  "dustIntensity",
  "haloIntensity",
  "warmth",
  "contrast",
  "turbulence",
  "filamentDetail",
  "gasAbsorption",
  "diskTilt",
  "lensStrength",
  "bloomSpread",
  "causticIntensity",
    "galaxyIntensity",
    "starTwinkle",
    "vignette",
  ];

export const GRAVITY_CINEMATIC_SETTINGS: readonly NumericGravitySetting[] = [
  "animationSpeed",
  "turbulence",
  "filamentDetail",
  "gasAbsorption",
  "diskTilt",
  "lensStrength",
  "bloomSpread",
  "causticIntensity",
  "galaxyIntensity",
  "starTwinkle",
  "vignette",
];

const GRAVITY_PRESET_NUMERIC_SETTINGS = GRAVITY_NUMERIC_SETTINGS.filter(
  (setting) => !GRAVITY_CINEMATIC_SETTINGS.includes(setting),
);

export function applyBuiltInGravityPreset(
  current: GravitySettings,
  preset: GravitySettings,
): GravitySettings {
  const next = { ...preset };
  for (const setting of GRAVITY_CINEMATIC_SETTINGS) {
    next[setting] = current[setting];
  }
  next.staticDiskDetails = current.staticDiskDetails;
  next.dustBeltEnabled = current.dustBeltEnabled;
  next.proceduralDetailEnabled = current.proceduralDetailEnabled;
  next.diskWarpEnabled = current.diskWarpEnabled;
  next.lensedSecondaryEnabled = current.lensedSecondaryEnabled;
  next.cloudEnvelopeEnabled = current.cloudEnvelopeEnabled;
  next.erosionEnabled = current.erosionEnabled;
  next.laneBrightnessEnabled = current.laneBrightnessEnabled;
  next.streamersEnabled = current.streamersEnabled;
  next.hotRimEnabled = current.hotRimEnabled;
  next.gasCloudBrightnessEnabled = current.gasCloudBrightnessEnabled;
  next.streaksEnabled = current.streaksEnabled;
  next.temperatureCloudModulationEnabled = current.temperatureCloudModulationEnabled;
  next.densityEnvelopeEnabled = current.densityEnvelopeEnabled;
  next.densityLaneAbsorptionEnabled = current.densityLaneAbsorptionEnabled;
  next.lensedErosionCloudsEnabled = current.lensedErosionCloudsEnabled;
  next.gasCloudStructureEnabled = current.gasCloudStructureEnabled;
  next.orbitalLanePatternEnabled = current.orbitalLanePatternEnabled;
  next.lensedBreakupEnabled = current.lensedBreakupEnabled;
  next.lensedBaseEmissionEnabled = current.lensedBaseEmissionEnabled;
  next.lensedDensityMaskEnabled = current.lensedDensityMaskEnabled;
  next.lensedGlowCloudEnabled = current.lensedGlowCloudEnabled;
  next.broadWispsEnabled = current.broadWispsEnabled;
  next.lensedStaticEnvelopeEnabled = current.lensedStaticEnvelopeEnabled;
  next.rimCloudModulationEnabled = current.rimCloudModulationEnabled;
  next.farSideDiskEnabled = current.farSideDiskEnabled;
  next.nearSideDiskEnabled = current.nearSideDiskEnabled;
  next.thermalColorEnabled = current.thermalColorEnabled;
  next.radialHeatEnabled = current.radialHeatEnabled;
  next.depthAbsorptionEnabled = current.depthAbsorptionEnabled;
  next.layerCorrugationEnabled = current.layerCorrugationEnabled;
  return next;
}

export function isGravityPresetActive(settings: GravitySettings, preset: GravitySettings): boolean {
  return (
    GRAVITY_PRESET_NUMERIC_SETTINGS.every((setting) => settings[setting] === preset[setting]) &&
    settings.pauseWhenHidden === preset.pauseWhenHidden &&
    settings.taaQuality === preset.taaQuality
  );
}

export const DEFAULT_GRAVITY_SETTINGS: GravitySettings = {
  renderScaleMultiplier: 1,
  maxFps: 60,
  diskLayers: 3,
  animationSpeed: DEFAULT_GRAVITY_ANIMATION_SPEED,
  materialSpeed: 1,
  pointerResponse: 1,
  starDensity: 1,
  dustIntensity: 1,
  haloIntensity: 1,
  warmth: 1,
  contrast: 1,
  turbulence: 1,
  filamentDetail: 1,
  gasAbsorption: 1,
  diskTilt: 1,
  lensStrength: 1,
  bloomSpread: 1,
  causticIntensity: 1,
  galaxyIntensity: 1,
  starTwinkle: 1,
  vignette: 1,
  staticDiskDetails: true,
  dustBeltEnabled: true,
  proceduralDetailEnabled: true,
  diskWarpEnabled: true,
  lensedSecondaryEnabled: true,
  cloudEnvelopeEnabled: true,
  erosionEnabled: true,
  laneBrightnessEnabled: true,
  streamersEnabled: true,
  hotRimEnabled: true,
  gasCloudBrightnessEnabled: true,
  streaksEnabled: true,
  temperatureCloudModulationEnabled: true,
  densityEnvelopeEnabled: true,
  densityLaneAbsorptionEnabled: true,
  lensedErosionCloudsEnabled: true,
  gasCloudStructureEnabled: true,
  orbitalLanePatternEnabled: true,
  lensedBreakupEnabled: true,
  lensedBaseEmissionEnabled: true,
  lensedDensityMaskEnabled: true,
  lensedGlowCloudEnabled: true,
  broadWispsEnabled: true,
  lensedStaticEnvelopeEnabled: true,
  rimCloudModulationEnabled: true,
  farSideDiskEnabled: true,
  nearSideDiskEnabled: true,
  thermalColorEnabled: true,
  radialHeatEnabled: true,
  depthAbsorptionEnabled: true,
  layerCorrugationEnabled: true,
  pauseWhenHidden: true,
  taaQuality: "off",
};

export type GravityPresetId = "efficiency" | "current" | "maximum";

export const GRAVITY_PRESETS: Record<GravityPresetId, GravitySettings> = {
  efficiency: {
    renderScaleMultiplier: 0.1,
    maxFps: 30,
    diskLayers: 1,
    animationSpeed: DEFAULT_GRAVITY_ANIMATION_SPEED,
    materialSpeed: 0.1,
    pointerResponse: 0.1,
    starDensity: 0.1,
    dustIntensity: 0.1,
    haloIntensity: 0.1,
    warmth: 0.1,
    contrast: 0.1,
    turbulence: 0.1,
    filamentDetail: 0.1,
    gasAbsorption: 0.1,
    diskTilt: 0.1,
    lensStrength: 0.1,
    bloomSpread: 0.1,
    causticIntensity: 0.1,
    galaxyIntensity: 0.1,
    starTwinkle: 0.1,
    vignette: 0.1,
    staticDiskDetails: true,
    dustBeltEnabled: true,
    proceduralDetailEnabled: true,
    diskWarpEnabled: true,
    lensedSecondaryEnabled: true,
    cloudEnvelopeEnabled: true,
    erosionEnabled: true,
    laneBrightnessEnabled: true,
    streamersEnabled: true,
    hotRimEnabled: true,
    gasCloudBrightnessEnabled: true,
    streaksEnabled: true,
    temperatureCloudModulationEnabled: true,
    densityEnvelopeEnabled: true,
    densityLaneAbsorptionEnabled: true,
    lensedErosionCloudsEnabled: true,
    gasCloudStructureEnabled: true,
    orbitalLanePatternEnabled: true,
    lensedBreakupEnabled: true,
    lensedBaseEmissionEnabled: true,
    lensedDensityMaskEnabled: true,
    lensedGlowCloudEnabled: true,
    broadWispsEnabled: true,
    lensedStaticEnvelopeEnabled: true,
    rimCloudModulationEnabled: true,
    farSideDiskEnabled: true,
    nearSideDiskEnabled: true,
    thermalColorEnabled: true,
    radialHeatEnabled: true,
    depthAbsorptionEnabled: true,
    layerCorrugationEnabled: true,
    pauseWhenHidden: true,
    taaQuality: "off",
  },
  current: DEFAULT_GRAVITY_SETTINGS,
  maximum: {
    renderScaleMultiplier: 2.5,
    maxFps: 120,
    diskLayers: 6,
    animationSpeed: DEFAULT_GRAVITY_ANIMATION_SPEED,
    materialSpeed: 4,
    pointerResponse: 4,
    starDensity: 3,
    dustIntensity: 3,
    haloIntensity: 3,
    warmth: 3,
    contrast: 2.8,
    turbulence: 3,
    filamentDetail: 3,
    gasAbsorption: 3,
    diskTilt: 3,
    lensStrength: 3,
    bloomSpread: 3,
    causticIntensity: 3,
    galaxyIntensity: 3,
    starTwinkle: 3,
    vignette: 3,
    staticDiskDetails: true,
    dustBeltEnabled: true,
    proceduralDetailEnabled: true,
    diskWarpEnabled: true,
    lensedSecondaryEnabled: true,
    cloudEnvelopeEnabled: true,
    erosionEnabled: true,
    laneBrightnessEnabled: true,
    streamersEnabled: true,
    hotRimEnabled: true,
    gasCloudBrightnessEnabled: true,
    streaksEnabled: true,
    temperatureCloudModulationEnabled: true,
    densityEnvelopeEnabled: true,
    densityLaneAbsorptionEnabled: true,
    lensedErosionCloudsEnabled: true,
    gasCloudStructureEnabled: true,
    orbitalLanePatternEnabled: true,
    lensedBreakupEnabled: true,
    lensedBaseEmissionEnabled: true,
    lensedDensityMaskEnabled: true,
    lensedGlowCloudEnabled: true,
    broadWispsEnabled: true,
    lensedStaticEnvelopeEnabled: true,
    rimCloudModulationEnabled: true,
    farSideDiskEnabled: true,
    nearSideDiskEnabled: true,
    thermalColorEnabled: true,
    radialHeatEnabled: true,
    depthAbsorptionEnabled: true,
    layerCorrugationEnabled: true,
    pauseWhenHidden: true,
    taaQuality: "extreme",
  },
};

export const GRAVITY_PRESET_META: Record<GravityPresetId, { label: string; description: string }> =
  {
    efficiency: {
      label: "Eficiencia",
      description: "Baja resolución, FPS y capas para reducir el uso de GPU",
    },
    current: {
      label: "Actual",
      description: "Mantiene 100% de resolución, 60 FPS y 3 capas",
    },
    maximum: {
      label: "Máxima",
      description: "Sube resolución, FPS, capas y densidad de estrellas; usa más GPU",
    },
  };

export const GRAVITY_PRESET_IDS: GravityPresetId[] = ["efficiency", "current", "maximum"];

export const GRAVITY_PREFERENCES_STORAGE_KEY = "solara-commerce-gravity-preferences-v1";
export const GRAVITY_PREFERENCES_ENDPOINT = "/__solara/storage/preferences/gravity";
export const CUSTOM_GRAVITY_PRESET_COUNT = 3;

export interface GravityPreferences {
  customPresets: Array<GravitySettings | null>;
  activeSettings: GravitySettings;
  activeCustomPreset: number | null;
  selectedCustomPreset: number;
}

function createDefaultGravityPreferences(): GravityPreferences {
  return {
    customPresets: Array.from({ length: CUSTOM_GRAVITY_PRESET_COUNT }, () => null),
    activeSettings: DEFAULT_GRAVITY_SETTINGS,
    activeCustomPreset: null,
    selectedCustomPreset: 0,
  };
}

function isGravityPresetIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < CUSTOM_GRAVITY_PRESET_COUNT
  );
}

function isGravityTaaQuality(value: unknown): value is GravityTaaQuality {
  return typeof value === "string" && GRAVITY_TAA_QUALITY_IDS.includes(value as GravityTaaQuality);
}

function parseGravitySettings(value: unknown): GravitySettings | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const animationSpeed =
    candidate.animationSpeed === undefined
      ? DEFAULT_GRAVITY_ANIMATION_SPEED
      : candidate.animationSpeed;
  if (
    !GRAVITY_NUMERIC_SETTINGS.every(
      (setting) => typeof candidate[setting] === "number" && Number.isFinite(candidate[setting]),
    ) ||
    typeof animationSpeed !== "number" ||
    !Number.isFinite(animationSpeed) ||
    animationSpeed < GRAVITY_ANIMATION_SPEED_MIN ||
    animationSpeed > GRAVITY_ANIMATION_SPEED_MAX ||
    typeof candidate.pauseWhenHidden !== "boolean"
  ) {
    return null;
  }
  const staticDiskDetails =
    candidate.staticDiskDetails === undefined ? true : candidate.staticDiskDetails;
  const dustBeltEnabled = candidate.dustBeltEnabled === undefined ? true : candidate.dustBeltEnabled;
  const proceduralDetailEnabled =
    candidate.proceduralDetailEnabled === undefined ? true : candidate.proceduralDetailEnabled;
  const diskWarpEnabled = candidate.diskWarpEnabled === undefined ? true : candidate.diskWarpEnabled;
  const lensedSecondaryEnabled =
    candidate.lensedSecondaryEnabled === undefined ? true : candidate.lensedSecondaryEnabled;
  const cloudEnvelopeEnabled =
    candidate.cloudEnvelopeEnabled === undefined ? true : candidate.cloudEnvelopeEnabled;
  const erosionEnabled = candidate.erosionEnabled === undefined ? true : candidate.erosionEnabled;
  const laneBrightnessEnabled =
    candidate.laneBrightnessEnabled === undefined ? true : candidate.laneBrightnessEnabled;
  const streamersEnabled =
    candidate.streamersEnabled === undefined ? true : candidate.streamersEnabled;
  const hotRimEnabled = candidate.hotRimEnabled === undefined ? true : candidate.hotRimEnabled;
  const gasCloudBrightnessEnabled =
    candidate.gasCloudBrightnessEnabled === undefined ? true : candidate.gasCloudBrightnessEnabled;
  const streaksEnabled = candidate.streaksEnabled === undefined ? true : candidate.streaksEnabled;
  const temperatureCloudModulationEnabled =
    candidate.temperatureCloudModulationEnabled === undefined
      ? true
      : candidate.temperatureCloudModulationEnabled;
  const densityEnvelopeEnabled =
    candidate.densityEnvelopeEnabled === undefined ? true : candidate.densityEnvelopeEnabled;
  const densityLaneAbsorptionEnabled =
    candidate.densityLaneAbsorptionEnabled === undefined
      ? true
      : candidate.densityLaneAbsorptionEnabled;
  const lensedErosionCloudsEnabled =
    candidate.lensedErosionCloudsEnabled === undefined
      ? true
      : candidate.lensedErosionCloudsEnabled;
  const gasCloudStructureEnabled =
    candidate.gasCloudStructureEnabled === undefined ? true : candidate.gasCloudStructureEnabled;
  const orbitalLanePatternEnabled =
    candidate.orbitalLanePatternEnabled === undefined ? true : candidate.orbitalLanePatternEnabled;
  const lensedBreakupEnabled =
    candidate.lensedBreakupEnabled === undefined ? true : candidate.lensedBreakupEnabled;
  const lensedBaseEmissionEnabled =
    candidate.lensedBaseEmissionEnabled === undefined ? true : candidate.lensedBaseEmissionEnabled;
  const lensedDensityMaskEnabled =
    candidate.lensedDensityMaskEnabled === undefined ? true : candidate.lensedDensityMaskEnabled;
  const lensedGlowCloudEnabled =
    candidate.lensedGlowCloudEnabled === undefined ? true : candidate.lensedGlowCloudEnabled;
  const broadWispsEnabled = candidate.broadWispsEnabled === undefined ? true : candidate.broadWispsEnabled;
  const lensedStaticEnvelopeEnabled =
    candidate.lensedStaticEnvelopeEnabled === undefined ? true : candidate.lensedStaticEnvelopeEnabled;
  const rimCloudModulationEnabled =
    candidate.rimCloudModulationEnabled === undefined ? true : candidate.rimCloudModulationEnabled;
  const farSideDiskEnabled = candidate.farSideDiskEnabled === undefined ? true : candidate.farSideDiskEnabled;
  const nearSideDiskEnabled = candidate.nearSideDiskEnabled === undefined ? true : candidate.nearSideDiskEnabled;
  const thermalColorEnabled = candidate.thermalColorEnabled === undefined ? true : candidate.thermalColorEnabled;
  const radialHeatEnabled = candidate.radialHeatEnabled === undefined ? true : candidate.radialHeatEnabled;
  const depthAbsorptionEnabled = candidate.depthAbsorptionEnabled === undefined ? true : candidate.depthAbsorptionEnabled;
  const layerCorrugationEnabled = candidate.layerCorrugationEnabled === undefined ? true : candidate.layerCorrugationEnabled;
  if (
    typeof staticDiskDetails !== "boolean" ||
    typeof dustBeltEnabled !== "boolean" ||
    typeof proceduralDetailEnabled !== "boolean" ||
    typeof diskWarpEnabled !== "boolean" ||
    typeof lensedSecondaryEnabled !== "boolean" ||
    typeof cloudEnvelopeEnabled !== "boolean" ||
    typeof erosionEnabled !== "boolean" ||
    typeof laneBrightnessEnabled !== "boolean" ||
    typeof streamersEnabled !== "boolean" ||
    typeof hotRimEnabled !== "boolean" ||
    typeof gasCloudBrightnessEnabled !== "boolean" ||
    typeof streaksEnabled !== "boolean" ||
    typeof temperatureCloudModulationEnabled !== "boolean" ||
    typeof densityEnvelopeEnabled !== "boolean" ||
    typeof densityLaneAbsorptionEnabled !== "boolean" ||
    typeof lensedErosionCloudsEnabled !== "boolean" ||
    typeof gasCloudStructureEnabled !== "boolean" ||
    typeof orbitalLanePatternEnabled !== "boolean" ||
    typeof lensedBreakupEnabled !== "boolean" ||
    typeof lensedBaseEmissionEnabled !== "boolean" ||
    typeof lensedDensityMaskEnabled !== "boolean" ||
    typeof lensedGlowCloudEnabled !== "boolean" ||
    typeof broadWispsEnabled !== "boolean" ||
    typeof lensedStaticEnvelopeEnabled !== "boolean" ||
    typeof rimCloudModulationEnabled !== "boolean" ||
    typeof farSideDiskEnabled !== "boolean" ||
    typeof nearSideDiskEnabled !== "boolean" ||
    typeof thermalColorEnabled !== "boolean" ||
    typeof radialHeatEnabled !== "boolean" ||
    typeof depthAbsorptionEnabled !== "boolean" ||
    typeof layerCorrugationEnabled !== "boolean"
  ) {
    return null;
  }
  const taaQuality = candidate.taaQuality === undefined ? "off" : candidate.taaQuality;
  if (!isGravityTaaQuality(taaQuality)) return null;
  return {
    ...DEFAULT_GRAVITY_SETTINGS,
    ...candidate,
    animationSpeed,
    staticDiskDetails,
    dustBeltEnabled,
    proceduralDetailEnabled,
    diskWarpEnabled,
    lensedSecondaryEnabled,
    cloudEnvelopeEnabled,
    erosionEnabled,
    laneBrightnessEnabled,
    streamersEnabled,
    hotRimEnabled,
    gasCloudBrightnessEnabled,
    streaksEnabled,
    temperatureCloudModulationEnabled,
    densityEnvelopeEnabled,
    densityLaneAbsorptionEnabled,
    lensedErosionCloudsEnabled,
    gasCloudStructureEnabled,
    orbitalLanePatternEnabled,
    lensedBreakupEnabled,
    lensedBaseEmissionEnabled,
    lensedDensityMaskEnabled,
    lensedGlowCloudEnabled,
    broadWispsEnabled,
    lensedStaticEnvelopeEnabled,
    rimCloudModulationEnabled,
    farSideDiskEnabled,
    nearSideDiskEnabled,
    thermalColorEnabled,
    radialHeatEnabled,
    depthAbsorptionEnabled,
    layerCorrugationEnabled,
    taaQuality,
  } as GravitySettings;
}

export function isGravitySettings(value: unknown): value is GravitySettings {
  return parseGravitySettings(value) !== null;
}

function parseGravityPreferences(value: unknown): GravityPreferences | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const storedPresets = Array.isArray(candidate.customPresets) ? candidate.customPresets : [];
  const customPresets = Array.from({ length: CUSTOM_GRAVITY_PRESET_COUNT }, (_, index) => {
    const preset = storedPresets[index];
    return parseGravitySettings(preset);
  });
  const storedActiveCustomPreset = candidate.activeCustomPreset;
  const activeCustomPreset =
    isGravityPresetIndex(storedActiveCustomPreset) && customPresets[storedActiveCustomPreset]
      ? storedActiveCustomPreset
      : null;
  return {
    customPresets,
    activeSettings: parseGravitySettings(candidate.activeSettings) ?? DEFAULT_GRAVITY_SETTINGS,
    activeCustomPreset,
    selectedCustomPreset: isGravityPresetIndex(candidate.selectedCustomPreset)
      ? candidate.selectedCustomPreset
      : 0,
  };
}

export function loadGravityPreferences(): GravityPreferences {
  const fallback = createDefaultGravityPreferences();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(GRAVITY_PREFERENCES_STORAGE_KEY);
    if (!raw) return fallback;
    return parseGravityPreferences(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadGravityPreferencesFromDisk(): Promise<GravityPreferences | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(GRAVITY_PREFERENCES_ENDPOINT, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return parseGravityPreferences((body as Record<string, unknown>).preferences);
  } catch {
    return null;
  }
}

export async function persistGravityPreferencesToDisk(
  preferences: GravityPreferences,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch(GRAVITY_PREFERENCES_ENDPOINT, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferences),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function persistGravityPreferences(preferences: GravityPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAVITY_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // La preferencia es opcional: el dashboard sigue funcionando si el navegador bloquea storage.
  }
}
