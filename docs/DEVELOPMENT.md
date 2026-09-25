# Guía de desarrollo — SolaraCommerce

Esta guía cubre todo lo que un desarrollador (humano o agente) necesita para
ser productivo: cómo está organizado el código, qué pipeline sigue cada
cambio, y cómo las piezas se conectan entre sí.

## Requisitos

- Node.js 24.x y Corepack (pnpm 10.15.1)
- Windows 10/11 para el launcher `Abrir SolaraCommerce.cmd`; el código Node es cross-platform.
- Chromium para Playwright E2E (`corepack pnpm playwright:install:chromium`)

## Setup inicial

```bash
git clone https://github.com/PiPa1337/SolarApp.git
cd SolarApp
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm dev          # abre Studio en http://localhost:4173
```

Para el lanzador administrado con persistencia en disco:

```cmd
Abrir SolaraCommerce.cmd
```

## Estructura del monorepo

```text
apps/
  studio/            Editor React + Vite (la app que usa el merchant)
packages/
  project-schema/    Zod schemas, fixtures, template (contrato de datos)
  core/              Reducer de dominio, HistoryState, CSV (sin navegador)
  module-sdk/        Helpers compartidos: escape, URLs, renderImage, safeHtml
  modules/           Registro de módulos + CSS generado (catalog-modern V1/V2)
  exporter/          Renderer HTML/CSS/JS del sitio público + servidor local
  storefront-runtime/ JS progresivo del sitio exportado (carrito, variantes...)
  site-optimizer/    Auditoría pura de SEO, media, Merchant y contexto IA
scripts/             Gates, budgets, benchmarks, preflight, release, launcher
tests/e2e/           Playwright funcional, smoke, auditorías y visión
docs/                Documentación (este directorio)
```

### Flujo de dependencias (quién importa a quién)

```text
project-schema  ←── nada (fuente raíz)
core            ←── project-schema
module-sdk      ←── project-schema
modules         ←── project-schema, module-sdk
storefront-runtime ←── project-schema
site-optimizer  ←── project-schema
exporter        ←── TODOS los anteriores
studio          ←── exporter, core, project-schema, modules
```

**Regla:** nunca importar "hacia arriba" (ej: project-schema no importa de
exporter). Esto mantiene el schema puro y el exporter como único punto de
salida al HTML público.

## Pipeline de un cambio visual

Cuando editas cualquier texto, color o layout en Studio:

1. `HistoryState` recibe el cambio vía `executeCommand()` (@solara/core)
2. El proyecto validado se guarda como RecoveryDraft en IndexedDB (debounce)
3. Preview renderiza con `renderPreviewHtml()` usando los mismos módulos
4. Al guardar, `buildFiles()` genera el sitio completo (HTML, CSS, JS, assets)
5. El servidor local escribe a `proyectos/<tienda>/sitios/<versión>/`

El preview y el sitio exportado usan **el mismo renderer**. No hay divergencia.

## Pipeline de imágenes

Toda imagen que entra por Assets pasa automáticamente por:

```text
Upload → image.worker.ts → 2 variantes WebP responsive → responsiveSources
         (768px intermedia / 1800px máxima, quality 0.82)
         → fallback JPEG/PNG según transparencia
```

El exporter arma `<picture>` con la variante intermedia para tablet/mobile y la
máxima para desktop, más `sizes` específico por módulo. Las imágenes menores
que un ancho objetivo nunca se amplían. El favicon conserva sus resoluciones ICO.
El canal Node del agente conserva el original en formatos que no puede
redimensionar con su encoder puro-JS; sólo agrega una intermedia real para PNG.

**Guard permanente:** `scripts/check-image-budget.mjs` falla si un PNG >200KB
aparece en `public/fixtures/`. Ver `docs/UI_SCALE.md` para la escala completa.

## Seeds de tienda

| Seed | Uso | Productos | Contenido |
| --- | --- | --- | --- |
| `"placeholder"` | Predeterminado (base generadora) | 5 genericos ("Producto 1"...) | Textos instructivos |
| `"clean"` | Tienda vacía nueva (Crear tienda) | 0 | Shell + textos instructivos |
| `"demo"` | Referencia interna / tests | 62 reales | Contenido completo |

El seed se valida en el schema Zod (`origin.seed`). Agregar uno nuevo requiere
extender el enum Y el switch en `buildCatalogModernProject()`.

## Comandos oficiales

```bash
# Iteración post-cambio
corepack pnpm check:micro
corepack pnpm test:e2e:smoke

# Cierre o cambio amplio
corepack pnpm check:full
corepack pnpm test:e2e:smoke:full
corepack pnpm test:e2e

# Release completo
corepack pnpm release   # check:full + smoke full + E2E release
```

`docs/TESTING.md` es la autoridad para la matriz vigente de gates, workers,
budgets y suites on-demand.
