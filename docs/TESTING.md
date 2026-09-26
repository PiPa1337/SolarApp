# Estrategia de testing

La suite está organizada por riesgo: funciones puras y schemas rápidos primero,
integración de paquetes después y navegador al cerrar una fase. No se debe
ejecutar Lighthouse o todos los navegadores después de cada cambio pequeño.

## Capas

### Unitarias

Vitest cubre schemas, migraciones, reducer de dominio, historial, seguridad de
módulos, runtime de carrito/WhatsApp, renderer/exporter y optimizer. Cada
paquete contiene sus pruebas junto al código. Es la primera verificación para
cualquier transformación determinista.

```powershell
corepack pnpm --filter @solara/project-schema test
corepack pnpm --filter @solara/core test
corepack pnpm --filter @solara/exporter test
corepack pnpm --filter @solara/storefront-runtime test
```

### Integración

`corepack pnpm check` es el alias rápido de `check:fast`: ejecuta repository scan,
formato, typecheck y tests diarios de todos los paquetes con concurrencia acotada.
`check:full` agrega mutation, fuzz reducido, QA representativo, gates de
corrección, build y check post-build. Los perfiles de memoria extrema quedan
fuera del cierre habitual.

Para iteración post-cambio usar `check:micro` — diff + repository + typecheck/test
solo de paquetes afectados (mapeo en `scripts/test-affected-map.mjs`).
`check:quick` queda para cierre o cambio amplio (todos los paquetes con
concurrencia acotada a 2):

```powershell
corepack pnpm check:micro   # post-cambio: solo afectados
corepack pnpm check:quick   # cierre o cambio amplio
corepack pnpm check         # alias de check:fast
corepack pnpm check:full    # cobertura extendida + gates lentos + build, cierre/CI
corepack pnpm build
```

### Capas de tests de paquetes

Los `test` normales están pensados para iteración y `check:micro`. Los escenarios
que consumen decenas de segundos o cientos de MiB mantienen cobertura explícita:

```powershell
corepack pnpm test:fuzz       # carreras/fuzz de Core + navegación de Studio
corepack pnpm test:stress     # serialización/hash >536 MB; sólo manual
corepack pnpm test:qa         # 3 tiendas representativas por el canal oficial
corepack pnpm test:extended   # mutation + fuzz reducido + QA; incluido en check:full
corepack pnpm test:diagnostic # dump manual de placeholders; no corre en cierre
corepack pnpm test:postbuild  # verifica lazy fixture contra dist de Studio
```

Core excluye de `test` los cuatro archivos fuzz y los ejecuta mediante
`test:fuzz`. Studio usa 8 workers locales y 2 en `test:ci`. Exporter también
usa 2 workers en `test:ci`; el caso JSON de más de 536 MB y el hash de snapshot
sobre un payload equivalente se reservan a `test:stress` manual.
`fixture-lazy.test.ts` queda fuera de la suite unitaria y se ejecuta después de
`build` dentro de `check:full`.

El [snapshot de alcance y cargas](TEST_SUITE_SCOPE_2026-09-26.md) registra los
archivos excluidos, el tamaño real de fixtures y la frecuencia por comando. Es una
fotografía fechada que puede cambiar al editar tests o scripts.

### Exportación y presupuestos

```powershell
corepack pnpm check:budgets
corepack pnpm check:optimization
```

Los fixtures pequeños verifican render visual; `catalogScaleStore` verifica 50
productos, jerarquía y 60 variantes. El renderer también conserva pruebas de
producción y paridad preview/export en esa escala.

### Auditoría read-only de RM Descartables

La auditoría integral de rendimiento usa el snapshot actual de RM Descartables
como fuente externa de sólo lectura y no guarda, migra, exporta ni modifica la
tienda original. El loader sólo abre `manifest.json` y
`manifest.current.projectPath`; los reportes machine-readable se escriben en
`test-results/performance/rm-descartables/`, que no se versiona.

```powershell
corepack pnpm audit:performance:rm:readonly  # mock administrado writable:false
corepack pnpm audit:performance:rm:node      # Node/exporter, 1 fría + 5 calientes
corepack pnpm audit:performance:rm:browser   # Studio + storefront, Chromium aislado
corepack pnpm audit:performance:rm:merge     # agrega las capas en report.json
corepack pnpm audit:performance:rm           # build + capas actuales + merge
```

La auditoría mide rutas del preview y storefront, feeds, bundles, recursos,
requests, imágenes, long tasks, CDP, heap, RSS, CPU de Node, storage de lectura,
reaperturas y reposo visible/oculto. Antes y después compara hash SHA-256,
tamaño, versión, fechas y el inventario metadata-only de RM. Una optimización
posterior debe repetir el mismo instrumento y demostrar paridad antes de
considerarse segura.

### Playwright

`test:e2e` compila Studio y ejecuta la suite funcional de Chromium (74 specs y
450 casos enumerados el 26/09/2026; 3 workers por defecto en local,
override con `PLAYWRIGHT_WORKERS=8` en máquinas 8C/16T) contra
un servidor local. Las cinco auditorías manuales retenidas se
separan en `test:e2e:audit`. El comando `test:e2e:ci` sigue disponible para uso
manual; GitHub Actions no ejecuta sus cinco specs smoke ni valida el producto.
La suite funcional completa sigue disponible localmente con `test:e2e`.

El recorte del 2026-09-25 retiró 81 de 161 specs E2E activos (50,3%). El inventario
completo, los criterios y el conjunto retenido están en
[`TEST_SUITE_REDUCTION_2026-09-25.md`](TEST_SUITE_REDUCTION_2026-09-25.md).

Para iteración post-cambio usar smoke quick con caché de build:

```powershell
corepack pnpm playwright:install:chromium
corepack pnpm test:e2e:smoke       # smoke quick + build cacheado
corepack pnpm test:e2e:smoke:full  # smoke completo + build cacheado (cierre)
corepack pnpm test:e2e             # suite funcional Chromium
corepack pnpm test:e2e:audit       # cinco auditorías manuales, sin gate diario
corepack pnpm test:e2e:ci     # cinco specs / 13 casos, sin build
```

La enumeración del 26/09/2026 registró smoke quick con 13 casos en 5 specs,
smoke full con 109 casos en 15 specs y auditoría manual con 33 casos en 5 specs.
La matriz release enumera 505 casos en local (483 Chromium y 11 en cada uno de
Firefox y WebKit) y 479 con `CI=true` (457 Chromium y 11 por navegador). CI omite
`__vision__/alignment`, `__vision__/storefront-alignment` y `visual-break`.
Playwright puede repetir intentos fallidos con el retry configurado en CI. El
desglose y la fecha de enumeración están en
[`TEST_SUITE_SCOPE_2026-09-26.md`](TEST_SUITE_SCOPE_2026-09-26.md).

La auditoría manual actual contiene `calculator-visual-audit`, `__vision__/alignment`,
`__vision__/storefront-alignment`, `ui-export` y `visual-break`. Los barridos
históricos de controles, auditorías report-only y benchmarks E2E se retiraron
del árbol activo en el recorte del 2026-09-25.
`ui-sweep-a27..a30` permanece en la suite funcional porque forma parte del
contrato actual de smoke full.

El contrato responsive del storefront usa tres checkpoints visuales: 390×844,
1024×900 y 1440×900. Las fronteras 767/768 y 1199/1200 se prueban de ambos
lados, incluyendo capturas en 762/773 y 1194/1205 para revisión visual real.
Las pruebas deben conservar exactamente los tres modos unificados Mobile,
Tablet y Desktop; un cuarto breakpoint de layout o tuning visual intermedio es
una regresión del contrato.
Las excepciones de drawer y entrega de imágenes se conservan como tests
funcionales, no como nuevos modos de diseño. El spec focal es
`tests/e2e/responsive-breakpoints.spec.ts`.

Para el **Studio** (dashboard y editor), el viewport visual de referencia es
**1920×912 px**: corresponde al área útil habitual de una pantalla 1920×1080 16:9
con la interfaz de Chrome y la barra de tareas de Windows visibles. Se espera que
aproximadamente el **99% del uso del Studio** ocurra en ese tamaño. Las capturas,
ajustes de composición y revisiones visuales rutinarias del Studio deben priorizar
1920×912; no es necesario dedicar tiempo a optimizar otras relaciones de aspecto
del Studio salvo requerimiento explícito o regresión funcional. Esta prioridad no
reduce la cobertura responsive del storefront ni cambia sus tres checkpoints.

Smoke quick cubre: exported-store, storefront-nojs, catalog, assets, interacciones.
Smoke full agrega: catalog-modern-v2, exporter-sentinel, scale-store,
ui-sweep-a27..30, release-a11y, nojs-coverage y focus-visible.
El smoke full no incluye visual sweep (`VISUAL_REVIEW_STAGE`) ni LCP pesado.

La matriz de release instala Chromium, Firefox y WebKit mediante
`PLAYWRIGHT_MULTI_BROWSER=1`. Chromium ejecuta la cobertura funcional prevista
por el script de release; Firefox y WebKit repiten el subconjunto explícito del
storefront exportado definido por la configuración vigente. Los conteos exactos
se derivan de los specs y scripts actuales, no se fijan en esta guía. Los tests
visuales se activan sólo con `VISUAL_REVIEW_STAGE=...` y escriben en
`test-results/visual-review/`, que no se versiona.

### Impeccable: revisión visual complementaria

El skill proyecto-local de Impeccable ejecuta un detector automático sobre las
ediciones de UI mediante el hook de Codex y permite elegir revisiones como
`audit`, `critique` y `polish`. Sus hallazgos son evidencia adicional: no
reemplazan los contratos de este documento ni los gates del repositorio.

Para una modificación visual, conservar la secuencia proporcional vigente:

```powershell
corepack pnpm check:micro
corepack pnpm test:e2e:smoke
```

Usar `corepack pnpm test:e2e:smoke:full` y la suite responsive al cerrar cambios
en módulos públicos, renderer, storefront o Preview. No versionar screenshots,
caches ni sesiones producidas bajo `.impeccable/`; sólo se comparten sus
artefactos de contexto y revisión que estén expresamente documentados.

## Política de estabilidad E2E (2026-08-21)

Un gate que falla intermitentemente entrena al equipo a ignorar el rojo.
Estas reglas son obligatorias y existen porque el smoke llegó a acumular ~7
specs inestables bajo carga paralela (verificado contra baseline `c4d71ae`;
detalle en `TECHNICAL_DEBT.md`; el plan histórico
`2026-08-21-flaky-e2e-runtime-debuggeable.md` quedó en el historial de git).

1. **Incorporación**: un spec nuevo entra al smoke sólo después de 5 corridas
   consecutivas limpias (local, misma máquina, workers por defecto).
2. **Sincronización**: prohibido usar `waitForTimeout` fijo como espera
   primaria. Esperar señales: roles/atributos visibles, respuestas de red
   (`page.waitForResponse`), o el helper compartido de "runtime listo".
3. **Presupuesto de duración**: specs con timeout declarado >10s no van a smoke;
   specs >15s van directo a `test:e2e` full con timeout dedicado.
4. **Gate rojo**: ante un fallo, correr el spec aislado 3×. Si pasa, registrar
   el spec en `tests/e2e/unstable.json` (con fecha y baseline) y abrir fila en
   `TECHNICAL_DEBT.md`. Nunca ignorar un rojo sin registro escrito.
5. **Re-inclusión**: un spec excluido vuelve al gate tras 10/10 corridas limpias
   verificadas con `scripts/e2e-stability.mjs` (o su sucesor), nunca a ojo.
6. **Runtime listo**: si se agrega una señal nueva de inicialización del
   storefront, actualizar el helper compartido (`waitForStorefrontReady`);
   prohibido copiar esperas locales por spec.

## Debugging del draft (2026-08-23)

El modo draft marca su bundle con `// DEBUG: modo draft` para distinguirlo del
runtime de producción, que sigue inline y byte-idéntico. El exporter publica el
runtime bajo un nombre con fingerprint reproducible; para depurar contra el
código fuente:

1. generar el bundle externo + mapa local:
   `node packages/storefront-runtime/scripts/build-runtime.mjs`
   (salida: `packages/storefront-runtime/dist/storefront-runtime.js.map`);
2. abrir DevTools en la página draft e inspeccionar el bundle marcado DEBUG;
3. no publicar drafts: `robots.txt` los bloquea y el runtime de producción es
   la única variante soportada en hosting.

Pendiente documentado: emitir un source map desde el exporter si el debugging
del draft lo requiere (la validación actual exige sólo la marca DEBUG).

## Flujos críticos que deben conservarse

- crear una tienda limpia desde la plantilla Catalog Modern;
- crear/duplicar/archivar/restaurar una tienda;
- editar identidad, navegación, productos, categorías, assets y secciones;
- importar y exportar CSV;
- deshacer/rehacer y recuperar un draft;
- abrir preview home, categoría, producto, búsqueda, carrito y compra;
- guardar en `proyectos/` y recuperar después de reiniciar el servidor;
- generar HTML sin JavaScript, JSON-LD, sitemap, Merchant y contexto IA;
- seleccionar una variante, agregar al carrito y generar el mensaje WhatsApp.

## Qué probar ante cada tipo de cambio

> Validación post-cambio = `check:micro` + `test:e2e:smoke`. Cierre = `check:full` + smoke full + E2E funcional. `test:e2e:audit` y `test:stress` quedan manual/on-demand. El comando `release` reutiliza el build de `check:full` y ejecuta una sola vez la matriz completa; Node 24.x es el único runtime soportado.

| Cambio | Mínimo (post-cambio) | Cierre recomendado |
| --- | --- | --- |
| Schema/migración | `check:micro` + tests de schema | `check:full`, `build`, E2E persistencia |
| Reducer/CSV | `check:micro` + tests de `core` | `check:full`; benchmark sólo si se fija un SLA de producto |
| Módulo/estilo público | `check:micro` + tests de módulo | `test:e2e:smoke:full` + E2E responsive |
| Preview/Studio | `check:micro` (typecheck) | `test:e2e:smoke:full` / `test:e2e` |
| Guardado local | `check:micro` | ciclo real launcher + `test:e2e` |
| SEO/exporter | `check:micro` + tests de exporter | `check:budgets`, E2E sin JS |

## Diagnóstico

- Un test E2E fallido deja reportes en `playwright-report/` y traces según la
  configuración de Playwright.
- Fuera de CI, `check:quick` opera automáticamente en modo `advisory`: los
  diagnósticos de formato y el exceso de bytes se informan sin
  bloquear el flujo. `CI=true` o `SOLARA_VALIDATION_MODE=strict` conserva el
  gate estricto.
- `test:e2e:release` requiere Node 24.x y los navegadores instalados. La salida
  identifica el runtime validado.
- El servidor de tests usa loopback; no debe apuntarse a una tienda publicada.
- La matriz canónica de validación post-cambio/cierre está en **Qué probar ante cada tipo de cambio**; no duplicar aquí comandos ni duraciones.
- Playwright usa 3 workers por defecto; `PLAYWRIGHT_WORKERS=N` permite un override explícito cuando el entorno lo justifica.
- Para inspeccionar una exportación, usar `pnpm reference:export` o
  `pnpm pilot:export` y revisar el directorio indicado por el script.

## Gates del sitio generado y sus enganches (run acotado, 2026-08-14)

- `scripts/enganches.test.ts`: features del manifest vs atributo html,
  consistencia snapshot↔feed/sitemap/search/catalog-index, criticalCount del
  audit, reproducibilidad byte-a-byte (production y draft).
- `scripts/contratos.test.ts`: todo `moduleId` de las secciones existe en el
  registry de módulos.
- `scripts/contratos-profundos.test.ts`: design-family en el html, `productIds`
  derivados de categorías/colecciones, assets sin huérfanos, features
  declaradas, CSS de familias aislado, sitemap sin duplicados.
- `scripts/sitio-consistencia.test.ts`: draft útil con noindex/robots, robots
  draft vs production, preload LCP en todas las páginas con imagen.
- `scripts/seo-check.test.ts`: JSON-LD válido con URLs absolutas en páginas
  comerciales.
- `scripts/recursos-check.test.ts`: duplicación CSS V2 y videos con poster.
- `packages/exporter/src/scale.test.ts`: producción, paginación y paridad del
  renderer con la fixture compartida de 50 productos.
- `tests/e2e/nojs-coverage.spec.ts`: 6 rutas × 2 fixtures × con/sin JS, con
  contenido útil y 0 errores de consola/red.
- `tests/e2e/focus-visible.spec.ts`: el foco del teclado es visible.
- `tests/e2e/interacciones.spec.ts`: agregar al carrito → carrito → checkout
  sin errores de consola.
- La lista completa de E2E manuales retirados y retenidos figura en
  [`TEST_SUITE_REDUCTION_2026-09-25.md`](TEST_SUITE_REDUCTION_2026-09-25.md).
- `scripts/dedup-studio-css.mjs`: elimina reglas duplicadas exactas del CSS
  del Studio al construir (postbuild de `@solara/studio`).

## Estrategia futura

La suite local cubre límites de upload y del mapa de archivos del sitio,
rechazo de rutas relativas inválidas (traversal), interrupción antes de
publicar el manifest y recuperación de la versión anterior. Los fallos de
escritura se simulan de forma determinista con `writeGuard` (disco lleno,
permisos revocados y reintento tras fallo transitorio) y la matriz de reparse
points fija el rechazo de junctions/symlinks dentro de `proyectos/`. La
simulación OS real (disco lleno y permisos a nivel de volumen) queda reservada
para un job Windows de release, donde puede aislarse el volumen temporal sin
tocar proyectos confirmados.

## Runtime local Windows

Los tests del servidor, storage, layout y agente deben usar directorios
temporales o fixtures explícitas. Nunca deben sembrar, reemplazar ni modificar el
`proyectos/` raíz, que contiene la data comercial activa de los launchers
`Abrir SolaraCommerce.cmd` y `Abrir SolaraCommerce.exe`.

Las protecciones de traversal, rutas absolutas, nombres reservados y reparse
points se validan en los tests de `local-layout.mjs`, storage y seguridad del
exporter. JSONL/MCP se validan contra el host Node de `scripts/agent-host.mjs`.

El tray Windows tiene un gate reproducible propio:

```bash
corepack pnpm test:tray
```

Ese comando compila `Abrir SolaraCommerce.exe` con el `csc.exe` de .NET
Framework disponible y ejecuta `scripts/tray-smoke.mjs`. El smoke usa una raíz
en `%TEMP%`, nunca el `proyectos/` real, y cubre sesiones preexistentes, 1/2/5
sesiones, cierre individual y total, registros corruptos, puerto reasignado,
`sessionId` exacto, rechazo de shutdown sin fallback a PID, retirada del registro
al cerrar el servidor, reinicio de una sesión mediante el launcher y ocupación
de los puertos 4173–4180 con fallo limpio de una novena sesión. Los tests
unitarios de apoyo viven en
`packages/exporter/scripts/session-registry.test.mjs` y
`session-handler.test.mjs`.

La evidencia histórica de suites Electron/portable anteriores a la migración se
conserva en documentos fechados y no forma parte de los gates activos.
