import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyBuiltInGravityPreset,
  DEFAULT_GRAVITY_SETTINGS,
  GRAVITY_CINEMATIC_SETTINGS,
  GRAVITY_PRESETS,
  type GravityPreferences,
  type GravitySettings,
  isGravityPresetActive,
  loadGravityPreferencesFromDisk,
  persistGravityPreferencesToDisk,
} from "./gravitySettings";

afterEach(() => vi.unstubAllGlobals());

describe("presets de cinemática del dashboard", () => {
  it("mantiene la cinemática avanzada al aplicar un preset incorporado", () => {
    const current: GravitySettings = {
      ...DEFAULT_GRAVITY_SETTINGS,
      turbulence: 2.1,
      filamentDetail: 2.2,
      gasAbsorption: 2.3,
      diskTilt: 2.4,
      lensStrength: 2.5,
      bloomSpread: 2.6,
      causticIntensity: 2.7,
      galaxyIntensity: 2.8,
      starTwinkle: 2.9,
      vignette: 1.8,
      staticDiskDetails: false,
      dustBeltEnabled: false,
      proceduralDetailEnabled: false,
      diskWarpEnabled: false,
      lensedSecondaryEnabled: false,
      cloudEnvelopeEnabled: false,
      erosionEnabled: false,
      laneBrightnessEnabled: false,
      streamersEnabled: false,
      hotRimEnabled: false,
      gasCloudBrightnessEnabled: false,
      streaksEnabled: false,
      temperatureCloudModulationEnabled: false,
      densityEnvelopeEnabled: false,
      densityLaneAbsorptionEnabled: false,
      lensedErosionCloudsEnabled: false,
      gasCloudStructureEnabled: false,
      orbitalLanePatternEnabled: false,
      lensedBreakupEnabled: false,
      lensedBaseEmissionEnabled: false,
      lensedDensityMaskEnabled: false,
      lensedGlowCloudEnabled: false,
      broadWispsEnabled: false,
      lensedStaticEnvelopeEnabled: false,
      rimCloudModulationEnabled: false,
      farSideDiskEnabled: false,
      nearSideDiskEnabled: false,
      thermalColorEnabled: false,
      radialHeatEnabled: false,
      depthAbsorptionEnabled: false,
      layerCorrugationEnabled: false,
    };

    const next = applyBuiltInGravityPreset(current, GRAVITY_PRESETS.maximum);

    expect(next).toMatchObject({
      renderScaleMultiplier: 2.5,
      maxFps: 120,
      diskLayers: 6,
      taaQuality: "extreme",
    });
    for (const setting of GRAVITY_CINEMATIC_SETTINGS) {
      expect(next[setting], setting).toBe(current[setting]);
    }
    expect(next.staticDiskDetails).toBe(false);
    expect(next.dustBeltEnabled).toBe(false);
    expect(next.proceduralDetailEnabled).toBe(false);
    expect(next.diskWarpEnabled).toBe(false);
    expect(next.lensedSecondaryEnabled).toBe(false);
    expect(next.cloudEnvelopeEnabled).toBe(false);
    expect(next.erosionEnabled).toBe(false);
    expect(next.laneBrightnessEnabled).toBe(false);
    expect(next.streamersEnabled).toBe(false);
    expect(next.hotRimEnabled).toBe(false);
    expect(next.gasCloudBrightnessEnabled).toBe(false);
    expect(next.streaksEnabled).toBe(false);
    expect(next.temperatureCloudModulationEnabled).toBe(false);
    expect(next.densityEnvelopeEnabled).toBe(false);
    expect(next.densityLaneAbsorptionEnabled).toBe(false);
    expect(next.lensedErosionCloudsEnabled).toBe(false);
    expect(next.gasCloudStructureEnabled).toBe(false);
    expect(next.orbitalLanePatternEnabled).toBe(false);
    expect(next.lensedBreakupEnabled).toBe(false);
    expect(next.lensedBaseEmissionEnabled).toBe(false);
    expect(next.lensedDensityMaskEnabled).toBe(false);
    expect(next.lensedGlowCloudEnabled).toBe(false);
    expect(next.broadWispsEnabled).toBe(false);
    expect(next.lensedStaticEnvelopeEnabled).toBe(false);
    expect(next.rimCloudModulationEnabled).toBe(false);
    expect(next.farSideDiskEnabled).toBe(false);
    expect(next.nearSideDiskEnabled).toBe(false);
    expect(next.thermalColorEnabled).toBe(false);
    expect(next.radialHeatEnabled).toBe(false);
    expect(next.depthAbsorptionEnabled).toBe(false);
    expect(next.layerCorrugationEnabled).toBe(false);
    expect(isGravityPresetActive(next, GRAVITY_PRESETS.maximum)).toBe(true);
  });
});

describe("preferencias persistentes de Gargantua", () => {
  it("lee y guarda mediante el API de archivo local", async () => {
    const activeSettings = {
      ...DEFAULT_GRAVITY_SETTINGS,
      filamentDetail: 2.75,
      staticDiskDetails: false,
      lensedErosionCloudsEnabled: false,
    };
    const preferences: GravityPreferences = {
      customPresets: [activeSettings, null, null],
      activeSettings,
      activeCustomPreset: 0,
      selectedCustomPreset: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, preferences }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadGravityPreferencesFromDisk()).resolves.toEqual(preferences);
    await expect(persistGravityPreferencesToDisk(preferences)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/__solara/storage/preferences/gravity",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(preferences) }),
    );
  });

  it("mantiene activados los nuevos controles al leer preferencias anteriores", async () => {
    const legacySettings = { ...DEFAULT_GRAVITY_SETTINGS } as Record<string, unknown>;
    delete legacySettings.animationSpeed;
    delete legacySettings.dustBeltEnabled;
    delete legacySettings.proceduralDetailEnabled;
    delete legacySettings.diskWarpEnabled;
    delete legacySettings.lensedSecondaryEnabled;
    delete legacySettings.cloudEnvelopeEnabled;
    delete legacySettings.erosionEnabled;
    delete legacySettings.laneBrightnessEnabled;
    delete legacySettings.streamersEnabled;
    delete legacySettings.hotRimEnabled;
    delete legacySettings.gasCloudBrightnessEnabled;
    delete legacySettings.streaksEnabled;
    delete legacySettings.temperatureCloudModulationEnabled;
    delete legacySettings.densityEnvelopeEnabled;
    delete legacySettings.densityLaneAbsorptionEnabled;
    delete legacySettings.lensedErosionCloudsEnabled;
    delete legacySettings.gasCloudStructureEnabled;
    delete legacySettings.orbitalLanePatternEnabled;
    delete legacySettings.lensedBreakupEnabled;
    delete legacySettings.lensedBaseEmissionEnabled;
    delete legacySettings.lensedDensityMaskEnabled;
    delete legacySettings.lensedGlowCloudEnabled;
    delete legacySettings.broadWispsEnabled;
    delete legacySettings.lensedStaticEnvelopeEnabled;
    delete legacySettings.rimCloudModulationEnabled;
    delete legacySettings.farSideDiskEnabled;
    delete legacySettings.nearSideDiskEnabled;
    delete legacySettings.thermalColorEnabled;
    delete legacySettings.radialHeatEnabled;
    delete legacySettings.depthAbsorptionEnabled;
    delete legacySettings.layerCorrugationEnabled;
    const legacyPreferences = {
      customPresets: [legacySettings, null, null],
      activeSettings: legacySettings,
      activeCustomPreset: 0,
      selectedCustomPreset: 0,
    };
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, preferences: legacyPreferences }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const loaded = await loadGravityPreferencesFromDisk();

    expect(loaded?.activeSettings).toMatchObject({
      animationSpeed: 1,
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
    });
    expect(loaded?.customPresets[0]).toMatchObject({
      animationSpeed: 1,
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
    });
  });
});
