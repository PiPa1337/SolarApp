import { ArrowCounterClockwise, FloppyDisk, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import {
  GRAVITY_ANIMATION_SPEED_MAX,
  GRAVITY_ANIMATION_SPEED_MIN,
  GRAVITY_PRESET_IDS,
  GRAVITY_PRESET_META,
  GRAVITY_PRESETS,
  GRAVITY_TAA_QUALITY_IDS,
  GRAVITY_TAA_QUALITY_META,
  type GravityPresetId,
  type GravitySettings,
  type GravityTaaQuality,
  isGravityPresetActive,
  type NumericGravitySetting,
} from "./gravitySettings";

interface GravitySettingsPanelProps {
  id: string;
  open: boolean;
  settings: GravitySettings;
  customPresets: Array<GravitySettings | null>;
  selectedCustomPreset: number;
  activeCustomPreset: number | null;
  onChange(setting: NumericGravitySetting, value: number): void;
  onSelectBuiltInPreset(settings: GravitySettings): void;
  onSelectCustomPreset(index: number): void;
  onSaveCustomPreset(): void;
  onTaaQualityChange(value: GravityTaaQuality): void;
  onToggleStaticDiskDetails(value: boolean): void;
  onToggleDustBelt(value: boolean): void;
  onToggleProceduralDetail(value: boolean): void;
  onToggleDiskWarp(value: boolean): void;
  onToggleLensedSecondary(value: boolean): void;
  onToggleCloudEnvelope(value: boolean): void;
  onToggleErosion(value: boolean): void;
  onToggleLaneBrightness(value: boolean): void;
  onToggleStreamers(value: boolean): void;
  onToggleHotRim(value: boolean): void;
  onToggleGasCloudBrightness(value: boolean): void;
  onToggleStreaks(value: boolean): void;
  onToggleTemperatureCloudModulation(value: boolean): void;
  onToggleDensityEnvelope(value: boolean): void;
  onToggleDensityLaneAbsorption(value: boolean): void;
  onToggleLensedErosionClouds(value: boolean): void;
  onToggleGasCloudStructure(value: boolean): void;
  onToggleOrbitalLanePattern(value: boolean): void;
  onToggleLensedBreakup(value: boolean): void;
  onToggleLensedBaseEmission(value: boolean): void;
  onToggleLensedDensityMask(value: boolean): void;
  onToggleBroadWisps(value: boolean): void;
  onToggleLensedStaticEnvelope(value: boolean): void;
  onToggleLensedGlowCloud(value: boolean): void;
  onToggleRimCloudModulation(value: boolean): void;
  onToggleFarSideDisk(value: boolean): void;
  onToggleNearSideDisk(value: boolean): void;
  onToggleThermalColor(value: boolean): void;
  onToggleRadialHeat(value: boolean): void;
  onToggleDepthAbsorption(value: boolean): void;
  onToggleLayerCorrugation(value: boolean): void;
  onTogglePauseWhenHidden(value: boolean): void;
  onReset(): void;
  onClose(): void;
}

interface RangeSettingProps {
  setting: NumericGravitySetting;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(value: number): string;
  onChange(setting: NumericGravitySetting, value: number): void;
}

const CUSTOM_PRESET_SLOTS = [
  { id: "gravity-custom-preset-0", index: 0 },
  { id: "gravity-custom-preset-1", index: 1 },
  { id: "gravity-custom-preset-2", index: 2 },
] as const;

function getActivePreset(settings: GravitySettings): GravityPresetId | undefined {
  return GRAVITY_PRESET_IDS.find((presetId) => {
    return isGravityPresetActive(settings, GRAVITY_PRESETS[presetId]);
  });
}

function RangeSetting({
  setting,
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: RangeSettingProps) {
  const id = useId();

  return (
    <div className="dashboard-gargantua-settings__range">
      <div className="dashboard-gargantua-settings__range-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        data-testid={`gravity-setting-${setting}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(setting, Number(event.target.value))}
      />
      <p>{hint}</p>
    </div>
  );
}

export function GravitySettingsPanel({
  id,
  open,
  settings,
  customPresets,
  selectedCustomPreset,
  activeCustomPreset,
  onChange,
  onSelectBuiltInPreset,
  onSelectCustomPreset,
  onSaveCustomPreset,
  onTaaQualityChange,
  onToggleStaticDiskDetails,
  onToggleDustBelt,
  onToggleProceduralDetail,
  onToggleDiskWarp,
  onToggleLensedSecondary,
  onToggleCloudEnvelope,
  onToggleErosion,
  onToggleLaneBrightness,
  onToggleStreamers,
  onToggleHotRim,
  onToggleGasCloudBrightness,
  onToggleStreaks,
  onToggleTemperatureCloudModulation,
  onToggleDensityEnvelope,
  onToggleDensityLaneAbsorption,
  onToggleLensedErosionClouds,
  onToggleGasCloudStructure,
  onToggleOrbitalLanePattern,
  onToggleLensedBreakup,
  onToggleLensedBaseEmission,
  onToggleLensedDensityMask,
  onToggleBroadWisps,
  onToggleLensedStaticEnvelope,
  onToggleLensedGlowCloud,
  onToggleRimCloudModulation,
  onToggleFarSideDisk,
  onToggleNearSideDisk,
  onToggleThermalColor,
  onToggleRadialHeat,
  onToggleDepthAbsorption,
  onToggleLayerCorrugation,
  onTogglePauseWhenHidden,
  onReset,
  onClose,
}: GravitySettingsPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const activePreset = activeCustomPreset === null ? getActivePreset(settings) : undefined;
  const activePresetLabel =
    activeCustomPreset === null
      ? activePreset
        ? GRAVITY_PRESET_META[activePreset].label
        : "Personalizada"
      : `Usuario ${activeCustomPreset + 1}`;

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <aside
      id={id}
      className="dashboard-gargantua-settings"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="dashboard-gargantua-settings__header">
        <div>
          <h1 id={titleId}>Ajustes del fondo</h1>
          <p id={descriptionId}>
            Afiná la calidad del campo gravitacional en vivo. Los presets incorporados ajustan
            rendimiento y apariencia base, pero no modifican la cinemática avanzada. El resto del
            dashboard queda oculto mientras ajustás estos valores.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          className="dashboard-gargantua-settings__close"
          type="button"
          aria-label="Cerrar ajustes del fondo"
          title="Cerrar ajustes"
          onClick={onClose}
        >
          <X aria-hidden size={18} />
        </button>
      </header>

      <div className="dashboard-gargantua-settings__body">
        <div className="dashboard-gargantua-settings__body-main">
          <section
            className="dashboard-gargantua-settings__section"
            aria-labelledby={`${titleId}-quality`}
          >
            <div className="dashboard-gargantua-settings__section-head">
              <h2 id={`${titleId}-quality`}>Calidad de render</h2>
              <span className="dashboard-gargantua-settings__status">{activePresetLabel}</span>
            </div>
            <div className="dashboard-gargantua-settings__presets">
              {GRAVITY_PRESET_IDS.map((presetId) => {
                const preset = GRAVITY_PRESET_META[presetId];
                return (
                  <button
                    key={presetId}
                    className="dashboard-gargantua-settings__preset"
                    type="button"
                    aria-pressed={activePreset === presetId}
                    onClick={() => onSelectBuiltInPreset(GRAVITY_PRESETS[presetId])}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="dashboard-gargantua-settings__taa">
              <div className="dashboard-gargantua-settings__taa-head">
                <div>
                  <strong>Antialias temporal (TAA)</strong>
                  <p>
                    Combina entre 1 y 16 cuadros consecutivos para suavizar bordes y filamentos. No
                    cambia la resolución interna; los niveles altos usan más GPU.
                  </p>
                </div>
                <span>{GRAVITY_TAA_QUALITY_META[settings.taaQuality].label}</span>
              </div>
              <fieldset
                className="dashboard-gargantua-settings__taa-options"
                aria-label="Calidad de antialias temporal"
              >
                {GRAVITY_TAA_QUALITY_IDS.map((quality) => {
                  const meta = GRAVITY_TAA_QUALITY_META[quality];
                  return (
                    <button
                      key={quality}
                      className="dashboard-gargantua-settings__taa-option"
                      type="button"
                      data-testid={`gravity-taa-quality-${quality}`}
                      aria-pressed={settings.taaQuality === quality}
                      title={meta.description}
                      onClick={() => onTaaQualityChange(quality)}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </fieldset>
              <p className="dashboard-gargantua-settings__taa-hint">
                Sólo afecta la animación WebGL del fondo; no cambia tus tiendas ni su contenido.
              </p>
            </div>
            <RangeSetting
              setting="renderScaleMultiplier"
              label="Resolución interna"
              hint="Define los píxeles del canvas: más resolución conserva más detalle, pero procesa más carga de GPU."
              value={settings.renderScaleMultiplier}
              min={0.1}
              max={2.5}
              step={0.01}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="maxFps"
              label="Límite de cuadros"
              hint="Limita cuántos cuadros dibuja por segundo; baja el consumo sin cambiar el detalle de cada cuadro."
              value={settings.maxFps}
              min={1}
              max={120}
              step={1}
              format={(value) => `${Math.round(value)} FPS`}
              onChange={onChange}
            />
            <RangeSetting
              setting="diskLayers"
              label="Capas del disco"
              hint="Repite el gas en 1–6 planos de profundidad; más planos dan volumen y exigen más pasadas de GPU."
              value={settings.diskLayers}
              min={1}
              max={6}
              step={1}
              format={(value) => `${Math.round(value)} ${value === 1 ? "capa" : "capas"}`}
              onChange={onChange}
            />
          </section>

          <section
            className="dashboard-gargantua-settings__section"
            aria-labelledby={`${titleId}-saved`}
          >
            <div className="dashboard-gargantua-settings__section-head">
              <h2 id={`${titleId}-saved`}>Presets guardados</h2>
              <span className="dashboard-gargantua-settings__status">
                Ranura {selectedCustomPreset + 1}
              </span>
            </div>
            <div className="dashboard-gargantua-settings__presets">
              {CUSTOM_PRESET_SLOTS.map(({ id, index }) => {
                const preset = customPresets[index];
                return (
                  <button
                    key={id}
                    className="dashboard-gargantua-settings__preset"
                    type="button"
                    data-testid={id}
                    aria-pressed={activeCustomPreset === index}
                    onClick={() => onSelectCustomPreset(index)}
                  >
                    <strong>Usuario {index + 1}</strong>
                    <span>
                      {preset ? "Guardado y disponible" : "Vacío · guardar configuración"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="dashboard-gargantua-settings__custom-save">
              <span>Guardá la configuración actual en la ranura seleccionada.</span>
              <button
                className="dashboard-gargantua-settings__save"
                type="button"
                data-testid="gravity-save-preset"
                onClick={onSaveCustomPreset}
              >
                <FloppyDisk aria-hidden size={16} />
                Guardar preset {selectedCustomPreset + 1}
              </button>
            </div>
          </section>

          <section
            className="dashboard-gargantua-settings__section"
            aria-labelledby={`${titleId}-motion`}
          >
            <div className="dashboard-gargantua-settings__section-head">
              <h2 id={`${titleId}-motion`}>Movimiento</h2>
            </div>
            <RangeSetting
              setting="animationSpeed"
              label="Velocidad de animación"
              hint="Ajusta la velocidad del zoom al abrir la app y al entrar a una tienda."
              value={settings.animationSpeed}
              min={GRAVITY_ANIMATION_SPEED_MIN}
              max={GRAVITY_ANIMATION_SPEED_MAX}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={onChange}
            />
            <RangeSetting
              setting="materialSpeed"
              label="Velocidad del material"
              hint="Multiplica el reloj del shader: acelera o frena el flujo del gas, el polvo, las estrellas y el halo."
              value={settings.materialSpeed}
              min={0.1}
              max={4}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={onChange}
            />
            <RangeSetting
              setting="pointerResponse"
              label="Respuesta al puntero"
              hint="Amplía o reduce cuánto se desplaza el centro y el parallax del fondo cuando movés el puntero."
              value={settings.pointerResponse}
              min={0.1}
              max={4}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Pausar con la pestaña oculta</strong>
                <small>
                  Detiene nuevos cuadros al ocultar la pestaña y retoma la misma fase al volver.
                </small>
              </span>
              <input
                data-testid="gravity-setting-pauseWhenHidden"
                type="checkbox"
                checked={settings.pauseWhenHidden}
                onChange={(event) => onTogglePauseWhenHidden(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Manchas estables del disco</strong>
                <small>
                  Conserva las formas grandes y lentas del gas; desactivá esta opción para que
                  toda esa envolvente siga el movimiento del disco.
                </small>
              </span>
              <input
                data-testid="gravity-setting-staticDiskDetails"
                type="checkbox"
                checked={settings.staticDiskDetails}
                onChange={(event) => onToggleStaticDiskDetails(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Cinturón de polvo de fondo</strong>
                <small>
                  Muestra la nube diagonal de polvo, con sus grietas y grano, detrás del agujero
                  negro.
                </small>
              </span>
              <input
                data-testid="gravity-setting-dustBeltEnabled"
                type="checkbox"
                checked={settings.dustBeltEnabled}
                onChange={(event) => onToggleDustBelt(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Detalle fino del gas</strong>
                <small>
                  Activa los filamentos y detalles procedurales finos que forman las pequeñas
                  estructuras del disco.
                </small>
              </span>
              <input
                data-testid="gravity-setting-proceduralDetailEnabled"
                type="checkbox"
                checked={settings.proceduralDetailEnabled}
                onChange={(event) => onToggleProceduralDetail(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Ondulación del disco</strong>
                <small>
                  Activa la deformación local y la corrugación de las capas del gas durante su
                  recorrido orbital.
                </small>
              </span>
              <input
                data-testid="gravity-setting-diskWarpEnabled"
                type="checkbox"
                checked={settings.diskWarpEnabled}
                onChange={(event) => onToggleDiskWarp(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Imagen secundaria por lente</strong>
                <small>
                  Muestra la imagen doblada del lado lejano del disco y el resplandor que la
                  acompaña alrededor de la sombra.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedSecondaryEnabled"
                type="checkbox"
                checked={settings.lensedSecondaryEnabled}
                onChange={(event) => onToggleLensedSecondary(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Envolvente de nubes</strong>
                <small>
                  Mezcla la envolvente amplia y lenta con el gas local que define las manchas de
                  gran escala del disco.
                </small>
              </span>
              <input
                data-testid="gravity-setting-cloudEnvelopeEnabled"
                type="checkbox"
                checked={settings.cloudEnvelopeEnabled}
                onChange={(event) => onToggleCloudEnvelope(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Erosión del gas</strong>
                <small>
                  Activa el recorte de densidad y brillo que abre huecos irregulares dentro de las
                  nubes del disco.
                </small>
              </span>
              <input
                data-testid="gravity-setting-erosionEnabled"
                type="checkbox"
                checked={settings.erosionEnabled}
                onChange={(event) => onToggleErosion(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Manchas de erosión lenteadas</strong>
                <small>
                  Controla las grandes manchas fijas de erosión que aparecen en la imagen inferior
                  lenteada del disco.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedErosionCloudsEnabled"
                type="checkbox"
                checked={settings.lensedErosionCloudsEnabled}
                onChange={(event) => onToggleLensedErosionClouds(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Estructura base de nubes</strong>
                <small>
                  Controla la textura amplia que alimenta brillo, temperatura y densidad; desactivá
                  esta opción para comprobar si las manchas nacen de la nube base.
                </small>
              </span>
              <input
                data-testid="gravity-setting-gasCloudStructureEnabled"
                type="checkbox"
                checked={settings.gasCloudStructureEnabled}
                onChange={(event) => onToggleGasCloudStructure(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Patrón de carriles orbitales</strong>
                <small>
                  Controla el ruido que oscurece y separa carriles del gas, incluso cuando los
                  filamentos finos están apagados.
                </small>
              </span>
              <input
                data-testid="gravity-setting-orbitalLanePatternEnabled"
                type="checkbox"
                checked={settings.orbitalLanePatternEnabled}
                onChange={(event) => onToggleOrbitalLanePattern(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Fragmentación de la imagen lenteada · manchas inferiores</strong>
                <small>
                  Opción confirmada: al desactivarla desaparecen las formas estáticas encerradas en
                  rojo, sin ocultar el disco entero.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedBreakupEnabled"
                type="checkbox"
                checked={settings.lensedBreakupEnabled}
                onChange={(event) => onToggleLensedBreakup(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Emisión base de la imagen lenteada</strong>
                <small>
                  Opción confirmada para el residuo: al desactivarla desaparece la emisión estática
                  restante bajo el disco, sin ocultar el disco directo.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedBaseEmissionEnabled"
                type="checkbox"
                checked={settings.lensedBaseEmissionEnabled}
                onChange={(event) => onToggleLensedBaseEmission(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Máscara de densidad lenteada</strong>
                <small>
                  Aísla la segunda máscara que modula la fragmentación según la densidad del gas
                  doblado.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedDensityMaskEnabled"
                type="checkbox"
                checked={settings.lensedDensityMaskEnabled}
                onChange={(event) => onToggleLensedDensityMask(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Wisps amplios de nubes</strong>
                <small>
                  Aísla el aporte de baja frecuencia que puede conservar la forma estática después
                  de quitar la fragmentación.
                </small>
              </span>
              <input
                data-testid="gravity-setting-broadWispsEnabled"
                type="checkbox"
                checked={settings.broadWispsEnabled}
                onChange={(event) => onToggleBroadWisps(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Envolvente estática lenteada</strong>
                <small>
                  Aísla la envolvente lenta reutilizada por la imagen doblada, sin cambiar la
                  envolvente del disco directo.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedStaticEnvelopeEnabled"
                type="checkbox"
                checked={settings.lensedStaticEnvelopeEnabled}
                onChange={(event) => onToggleLensedStaticEnvelope(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Nube del halo lenteado</strong>
                <small>
                  Controla la nube de baja frecuencia que modula el resplandor alrededor de la
                  imagen doblada.
                </small>
              </span>
              <input
                data-testid="gravity-setting-lensedGlowCloudEnabled"
                type="checkbox"
                checked={settings.lensedGlowCloudEnabled}
                onChange={(event) => onToggleLensedGlowCloud(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Modulación irregular del anillo</strong>
                <small>
                  Controla la variación lenta del brillo en el borde crítico, separada de la forma
                  geométrica del agujero negro.
                </small>
              </span>
              <input
                data-testid="gravity-setting-rimCloudModulationEnabled"
                type="checkbox"
                checked={settings.rimCloudModulationEnabled}
                onChange={(event) => onToggleRimCloudModulation(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Cara lejana del disco</strong>
                <small>
                  Aísla la emisión directa que llega desde la parte posterior del disco, antes de
                  la imagen secundaria por lente.
                </small>
              </span>
              <input
                data-testid="gravity-setting-farSideDiskEnabled"
                type="checkbox"
                checked={settings.farSideDiskEnabled}
                onChange={(event) => onToggleFarSideDisk(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Cara cercana del disco</strong>
                <small>
                  Aísla las capas que cruzan por delante de la sombra y su absorción de profundidad;
                  sirve para separar volumen de fragmentación.
                </small>
              </span>
              <input
                data-testid="gravity-setting-nearSideDiskEnabled"
                type="checkbox"
                checked={settings.nearSideDiskEnabled}
                onChange={(event) => onToggleNearSideDisk(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Color térmico del gas</strong>
                <small>
                  Desactiva el mapa cobre/crema/caliente para comprobar si lo señalado es sólo una
                  variación cromática.
                </small>
              </span>
              <input
                data-testid="gravity-setting-thermalColorEnabled"
                type="checkbox"
                checked={settings.thermalColorEnabled}
                onChange={(event) => onToggleThermalColor(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Caída radial de calor</strong>
                <small>
                  Controla el oscurecimiento y la concentración de energía según la distancia al
                  horizonte.
                </small>
              </span>
              <input
                data-testid="gravity-setting-radialHeatEnabled"
                type="checkbox"
                checked={settings.radialHeatEnabled}
                onChange={(event) => onToggleRadialHeat(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Absorción por profundidad</strong>
                <small>
                  Controla las diferencias de densidad que oscurecen carriles y separan manchas entre
                  capas.
                </small>
              </span>
              <input
                data-testid="gravity-setting-depthAbsorptionEnabled"
                type="checkbox"
                checked={settings.depthAbsorptionEnabled}
                onChange={(event) => onToggleDepthAbsorption(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Corrugación de capas</strong>
                <small>
                  Desactiva la deformación local de los planos de profundidad para separar volumen de
                  textura.
                </small>
              </span>
              <input
                data-testid="gravity-setting-layerCorrugationEnabled"
                type="checkbox"
                checked={settings.layerCorrugationEnabled}
                onChange={(event) => onToggleLayerCorrugation(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Brillo de carriles</strong>
                <small>
                  Conserva la variación de luminosidad causada por los carriles de ruido que
                  atraviesan el gas.
                </small>
              </span>
              <input
                data-testid="gravity-setting-laneBrightnessEnabled"
                type="checkbox"
                checked={settings.laneBrightnessEnabled}
                onChange={(event) => onToggleLaneBrightness(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Corrientes exteriores</strong>
                <small>
                  Activa las corrientes largas que alteran la forma y el brillo del borde exterior
                  del disco.
                </small>
              </span>
              <input
                data-testid="gravity-setting-streamersEnabled"
                type="checkbox"
                checked={settings.streamersEnabled}
                onChange={(event) => onToggleStreamers(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Borde caliente interior</strong>
                <small>
                  Muestra la franja de emisión concentrada junto al borde interno del disco de
                  acreción.
                </small>
              </span>
              <input
                data-testid="gravity-setting-hotRimEnabled"
                type="checkbox"
                checked={settings.hotRimEnabled}
                onChange={(event) => onToggleHotRim(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Brillo amplio de nubes</strong>
                <small>
                  Activa el aporte luminoso de baja frecuencia de las nubes, tanto en el fondo como
                  sobre las estelas.
                </small>
              </span>
              <input
                data-testid="gravity-setting-gasCloudBrightnessEnabled"
                type="checkbox"
                checked={settings.gasCloudBrightnessEnabled}
                onChange={(event) => onToggleGasCloudBrightness(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Estelas luminosas</strong>
                <small>
                  Activa las bandas finas de alta frecuencia que recorren el gas y forman vetas
                  brillantes.
                </small>
              </span>
              <input
                data-testid="gravity-setting-streaksEnabled"
                type="checkbox"
                checked={settings.streaksEnabled}
                onChange={(event) => onToggleStreaks(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Temperatura modulada por nubes</strong>
                <small>
                  Deja que la textura de nubes empuje zonas del gas hacia tonos más calientes cerca
                  del horizonte.
                </small>
              </span>
              <input
                data-testid="gravity-setting-temperatureCloudModulationEnabled"
                type="checkbox"
                checked={settings.temperatureCloudModulationEnabled}
                onChange={(event) => onToggleTemperatureCloudModulation(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Densidad de la envolvente</strong>
                <small>
                  Incluye la envolvente amplia en la opacidad del gas, capaz de formar masas oscuras
                  o compactas.
                </small>
              </span>
              <input
                data-testid="gravity-setting-densityEnvelopeEnabled"
                type="checkbox"
                checked={settings.densityEnvelopeEnabled}
                onChange={(event) => onToggleDensityEnvelope(event.target.checked)}
              />
            </label>
            <label className="dashboard-gargantua-settings__toggle">
              <span>
                <strong>Absorción de carriles oscuros</strong>
                <small>
                  Activa la opacidad extra de los carriles oscuros que pueden verse como bandas o
                  manchas sobre el disco inferior.
                </small>
              </span>
              <input
                data-testid="gravity-setting-densityLaneAbsorptionEnabled"
                type="checkbox"
                checked={settings.densityLaneAbsorptionEnabled}
                onChange={(event) => onToggleDensityLaneAbsorption(event.target.checked)}
              />
            </label>
          </section>

          <section
            className="dashboard-gargantua-settings__section"
            aria-labelledby={`${titleId}-presence`}
          >
            <div className="dashboard-gargantua-settings__section-head">
              <h2 id={`${titleId}-presence`}>Presencia</h2>
            </div>
            <RangeSetting
              setting="starDensity"
              label="Densidad de estrellas"
              hint="Controla cuántas estrellas pasan el umbral de visibilidad en las tres escalas del fondo; no cambia su tamaño."
              value={settings.starDensity}
              min={0.1}
              max={10}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={onChange}
            />
            <RangeSetting
              setting="dustIntensity"
              label="Nube de polvo"
              hint="Multiplica la banda de polvo detrás del disco: textura, grietas y granos; no agrega nuevas capas."
              value={settings.dustIntensity}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="haloIntensity"
              label="Intensidad del halo"
              hint="Multiplica los halos suaves del arco, la sombra y el borde exterior sin cambiar el gas interno."
              value={settings.haloIntensity}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
          </section>

          <section
            className="dashboard-gargantua-settings__section"
            aria-labelledby={`${titleId}-finish`}
          >
            <div className="dashboard-gargantua-settings__section-head">
              <h2 id={`${titleId}-finish`}>Acabado</h2>
            </div>
            <RangeSetting
              setting="warmth"
              label="Temperatura de color"
              hint="Desplaza el color final: menos de 1 enfría la imagen y más de 1 la vuelve dorada."
              value={settings.warmth}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="contrast"
              label="Contraste de salida"
              hint="Separa los tonos alrededor del punto medio: más contraste marca el negro y los detalles luminosos."
              value={settings.contrast}
              min={0.1}
              max={2.8}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
          </section>

          <section
            className="dashboard-gargantua-settings__section"
            aria-labelledby={`${titleId}-advanced`}
          >
            <div className="dashboard-gargantua-settings__section-head">
              <h2 id={`${titleId}-advanced`}>Cinemática avanzada</h2>
            </div>
            <RangeSetting
              setting="turbulence"
              label="Turbulencia orbital"
              hint="Aumenta los remolinos locales del gas y vuelve más irregular el flujo, sin mover el encuadre general."
              value={settings.turbulence}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="filamentDetail"
              label="Detalle de filamentos"
              hint="Multiplica las vetas finas que genera el gas: más detalle dibuja filamentos más visibles y marcados."
              value={settings.filamentDetail}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="gasAbsorption"
              label="Absorción del gas"
              hint="Aumenta la opacidad óptica de cada capa: el gas frontal oculta más las capas que están detrás."
              value={settings.gasAbsorption}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="diskTilt"
              label="Inclinación del disco"
              hint="Inclina el plano orbital frente a la cámara: cambia el ángulo aparente, no la posición del centro."
              value={settings.diskTilt}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="lensStrength"
              label="Fuerza de lente"
              hint="Multiplica la desviación alrededor de la sombra: curva más el arco y el fondo, hasta 10.00×."
              value={settings.lensStrength}
              min={0.1}
              max={10}
              step={0.05}
              format={(value) => `${value.toFixed(2)}×`}
              onChange={onChange}
            />
            <RangeSetting
              setting="bloomSpread"
              label="Extensión del bloom"
              hint="Amplía o concentra el ancho del resplandor del arco y del halo exterior, sin mover la geometría."
              value={settings.bloomSpread}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="causticIntensity"
              label="Intensidad de caústicas"
              hint="Multiplica los destellos donde la capa frontal cruza el arco inferior; afecta su brillo, no su posición."
              value={settings.causticIntensity}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="galaxyIntensity"
              label="Galaxia de fondo"
              hint="Multiplica la espiral distante del lado izquierdo; no modifica las estrellas cercanas ni el disco."
              value={settings.galaxyIntensity}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="starTwinkle"
              label="Centelleo estelar"
              hint="Amplía o reduce la oscilación temporal del brillo de cada estrella; no cambia cuántas aparecen."
              value={settings.starTwinkle}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
            <RangeSetting
              setting="vignette"
              label="Viñeta cinematográfica"
              hint="Oscurece los bordes cuando supera 1.00×; por debajo de 1.00× los abre y 1.00× deja el borde neutro."
              value={settings.vignette}
              min={0.1}
              max={3}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={onChange}
            />
          </section>
        </div>
      </div>

      <footer className="dashboard-gargantua-settings__footer">
        <span>Los cambios se aplican al instante y sólo afectan este dashboard.</span>
        <button className="dashboard-gargantua-settings__reset" type="button" onClick={onReset}>
          <ArrowCounterClockwise aria-hidden size={16} />
          Restablecer actual
        </button>
      </footer>
    </aside>
  );
}
