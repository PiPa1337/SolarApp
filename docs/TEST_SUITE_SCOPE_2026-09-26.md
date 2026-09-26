# Alcance y cargas de la suite — revisión 2026-09-26

> La última enumeración real de Playwright fue el 26/09/2026, antes de las podas actuales. El árbol proyecta por diferencia estática 120 casos funcionales en 52 specs y 26 de auditoría en 5 specs; smoke quick 6/4 y smoke full 28/13. Release proyecta 152 casos local y 132 con `CI=true`. No se volvió a enumerar ni ejecutar Playwright después de los recortes actuales.

## Conteo del árbol inspeccionado

Quedan 223 archivos con sufijos de test en las carpetas activas:

| Capa | Archivos | Qué representa |
| --- | ---: | --- |
| Paquetes | 140 | Vitest junto al código de Studio y packages |
| Scripts | 26 | Contratos, budgets, exportaciones y diagnósticos |
| E2E | 57 | Specs Playwright: 52 funcionales y 5 auditorías manuales |

El conteo de archivos no equivale al número de casos ejecutados. Algunas suites generan tests dinámicamente; otras recorren varios datos o viewports dentro de un solo caso. Por eso se informan por separado casos Playwright, repeticiones explícitas y tamaños de fixtures. No se publica un total global de casos Vitest inferido por búsqueda de texto.

## Frecuencia por comando

| Comando | Alcance configurado en este snapshot | Repetición |
| --- | --- | --- |
| test / test:normal | Tests normales de los paquetes: 131 archivos | Cada caso una vez por invocación; no incluye E2E |
| check:quick | Los 131 archivos normales, más formato, typecheck y checks estáticos | Una vez; la concurrencia limita paralelismo y no multiplica ejecuciones |
| test:extended | Mutación, fuzz reducido y QA de fábrica | Una ejecución de cada capa; stress queda manual |
| check:full | check:fast + test:extended + check:slow + build + postbuild | No ejecuta payloads >536 MB |
| test:full | Suite normal + contratos + test:extended | No incluye check:slow, build ni Playwright |
| test:e2e:smoke | 4 specs / 6 casos proyectados | Chromium; local: 0 reintentos |
| test:e2e:smoke:full | 13 specs / 28 casos proyectados | Chromium; loops de viewport dentro de un caso no suman casos nuevos |
| test:e2e | 52 specs / 120 casos proyectados | Chromium; proyección estática, no reenumerada |
| test:e2e:audit | 5 specs / 26 casos proyectados | `visual-break` conserva 12; auditorías fuera del gate funcional |
| test:e2e:ci | 4 specs / 7 casos proyectados | Sin build; comando disponible, no ejecutado por GitHub Actions |
| test:e2e:release, local con CI sin definir | 57 specs / 146 Chromium + 3 por navegador adicional (152 total proyectado) | Firefox y WebKit sólo usan tres sentinels del storefront exportado |
| test:e2e:release, con CI=true | 126 Chromium + 3 por navegador adicional (132 total proyectado) | CI excluye alignment, storefront-alignment y los 12 casos de visual-break; conserva un retry para fallos |

Playwright usa 3 workers por defecto en local. Los workers ejecutan archivos en paralelo; no triplican los casos. En CI se configura un retry, de modo que el número de intentos puede aumentar si hay fallos. El workflow de GitHub Actions inspeccionado contiene pasos placeholder y ejecuta 0 tests de producto.

La receta `release` ya no repite los casos de smoke full antes de correr la matriz `all`; esa matriz contiene los specs smoke. También reutiliza el build producido por `check:full`. Los casos exactos deben volver a contarse cuando se autorice una enumeración Playwright.

### Tests de paquete fuera de la corrida normal

De los 140 archivos de paquetes, 131 entran en el test normal. Los otros 9 están separados por carga o por dependencia del build:

| Archivo | Comando | Motivo |
| --- | --- | --- |
| apps/studio/src/lib/fuzz-navigation.test.ts | test:fuzz | 10 semillas por 50 pasos |
| packages/agent-control/src/store-factory.test.ts | test:qa | Crea tiendas de manera secuencial por el protocolo oficial |
| packages/core/src/cross-surface-race.test.ts | test:fuzz | 5 semillas por 20 pasos |
| packages/core/src/fuzz100.test.ts | test:fuzz | 10 semillas por 25 pasos |
| packages/core/src/fuzz.test.ts | test:fuzz | 250 pasos con invariantes amplios |
| packages/core/src/fuzz-comprehensive.test.ts | test:fuzz | 100 pasos con operaciones válidas e inválidas |
| packages/exporter/src/json-stream.stress.test.ts | test:stress | JSON mayor que el límite de una cadena de V8 |
| packages/project-schema/src/placeholder-diag.test.ts | test:diagnostic | Dump para inspección manual |
| packages/project-schema/src/fixture-lazy.test.ts | test:postbuild | Comprueba la fixture lazy después del build |

## Cargas explícitas

| Prueba / fixture | Volumen observado en el código | Cuándo y para qué |
| --- | --- | --- |
| store-factory | 3 tiendas: 6, 30 y 60 productos; total 96 productos en 6 lotes | Una vez por test:qa, test:extended, test:full o check:full. Recorre creación, planificación, commit y export draft en almacenamiento temporal; el CLI también usa 3 como default |
| core/index.test.ts | Tres casos usan 50 productos / 100 variantes: round-trip CSV, determinismo del generador y acción masiva | En la suite normal. Comprueba contenido y operación de dominio; ya no cronometra 1.000 productos |
| dashboardModel.test.ts | 100 productos; dos tienen cinco variantes y 98 una; 108 facturables | Un caso normal comprueba agregación al techo propuesto de catálogo, antes generaba 164 productos |
| history-limit.test.ts | Undo, redo y FIFO usan 51 cambios cada uno (MAX_HISTORY_LENGTH + 1); antes sumaban 520 cambios en cuatro casos | Suite normal; el límite y la expulsión FIFO se comprueban en la frontera mínima |
| catalogScaleStore | 50 productos, 15 categorías y 60 variantes | Fixture compartida por schema, exporter, optimizer y E2E. Reutilizarla no crea una tienda adicional cada vez que otro test la importa |
| catalog.spec.ts | Un recorrido combina dos filas CSV inválidas, dos importaciones de 60 productos / 120 variantes (una cancelada y una confirmada), progreso del Worker y acciones masivas entre páginas | Una vez en E2E; reúne errores por fila, progreso, cancelación, confirmación, resultado, paginación, selección y undo/redo |
| editor-workers.spec.ts | Ya no procesa CSV por separado; conserva los demás escenarios de worker/export | Sus pruebas de imágenes y exportación siguen en la suite funcional |
| fuzz de Core + Studio | 1.200 pasos deterministas: Core 500, carreras 100, combinado 100 y Studio 500 | Una vez por test:fuzz / test:extended / check:full |
| json-stream.stress.test.ts | 135 assets con 4 referencias de ~1 millón de caracteres; ~540 millones de caracteres serializados | Único caso de `test:stress` manual; justo por encima del límite de cadena de V8 |
| snapshot-hash.test.ts | Dos assets con cuatro referencias de 500.000 caracteres; ~4 millones de caracteres | Suite normal de site-optimizer; verifica hash determinista y sensible a cambios |
| visual-break.spec.ts | 3 viewports oficiales; 3 casos por viewport y 3 adicionales = 12. Usa 3 productos; zoom se comprueba dentro de Home en Tablet/Desktop | Sólo test:e2e:audit o modo release que incluya auditorías visuales |
| responsive-breakpoints.spec.ts | 7 anchos × 2 familias para Home y 4 rutas críticas × 2 familias sólo en 390px: 22 navegaciones, antes 46 | Una vez en E2E funcional; cubre ambos límites exactos y los tres checkpoints sin repetir todas las rutas en Tablet/Desktop |
| catalog-modern-v2.spec.ts, alineación de media | V1 y V2 en 390px y 1440px: 4 renderizados, antes 6 | Una vez en E2E funcional; mantiene móvil y desktop como extremos |
| catalog-modern-v2-navigation.spec.ts, menú móvil | 320, 600 y 767px: 3 anchos, antes 5 | Una vez en E2E funcional; mínimo, intermedio y máximo móvil |
| cart-drawer-responsive.spec.ts, ancho del drawer | 600 y 599px: 2 anchos, antes 4 | Una vez en E2E funcional; prueba ambos lados del breakpoint propio de 600px |
| dashboard-gargantua.spec.ts | El caso de biblioteca crea 5 copias más la tienda base: 6 visibles en un único viewport 1920×912 | Una vez en suite funcional; usa IndexedDB aislada |
| product-list.spec.ts | 2 fixtures generan 2 casos cada uno; suma 3 casos independientes y 1 viewport responsive (390): 8 casos proyectados. El módulo exporta 4 proyectos una vez al cargar; demo y long-title cubren filtros/Preview y texto largo; la vista amplia se comprueba en el caso normal | Suite funcional; conserva legacy y escala, no-JS y Preview |
| WhatsApp multiparte | Casos con 60 y 601 líneas; otras pruebas con 30 y 50 productos/líneas, cantidad 99 y texto largo. Se retiró el caso redundante de 100 líneas | Una vez por caso del paquete normal; el 60 verifica cada línea en 50+10, y 601 cubre el tope; genera texto/URL, no envía mensajes |
| money.property.test.ts | 500 valores reproducibles | Una vez en tests normales de schema; verifica formato y determinismo. La guarda de enteros seguros vive en `money.test.ts` y ya no se repite durante cada mutación |
| catalog-package.worker.test.ts | 501 entradas de imagen para probar el límite de 500; también límites de 20 MB por archivo y 250 MB total | Una vez en tests normales; comprueba rechazos de frontera |
| RM performance Node | 1 corrida fría + 5 corridas calientes sobre el snapshot configurado | Auditoría manual. El acceso al snapshot es de sólo lectura; los reportes van a test-results |

Los tests normales emplean fixtures deterministas y almacenamiento aislado o temporal. La fábrica QA y las pruebas de dashboard no siembran el directorio real proyectos/. RM performance es una auditoría separada y de sólo lectura.

## Catálogo de archivos por paquete

Los grupos siguientes indican qué superficie cubre cada archivo. Los casos normales se ejecutan una vez por invocación del paquete, salvo las iteraciones indicadas arriba.

### Studio — 46 archivos

- Inicio y componentes: App.waterfall; components/primitives; components/Ui.
- Builder y módulos: features/builder/productVideoOptimize, repeaterDefaults, traza-contrato y videoUpload.
- Canvas: features/canvas/canvasBridge y canvas-security.
- Catálogo y dashboard: features/catalog/product/productEditorModel; features/dashboard/bulkBackupModel, compareModel, gravity-cinematic-shader y gravitySettings.
- Persistencia, preview y guiado: features/ManagedPersistenceControls, Preview, PreviewToolbar, Seo.preview y traza-guiado.
- Biblioteca: lib/assetUses, autosave, autosave.hidden, catalogTableModel, cloudflareVerification, dashboardModel, dashboardStorage, exportHistory, fuzz-navigation, history, image-alpha, imageAsset, localProjectRepository, mutation-killers, persist-atomic-verify, projectArchive, recoveryDraftDecision, redteam-repository, repository, seoMedia, siteExport, statusBar y workers.
- Workers: workers/catalog-package.worker, csv.worker, export.worker e image.worker.

Cubre shell/UI, edición, accesibilidad de primitivas, seguridad de mensajes Canvas, guardado, recovery, historial, imágenes, importación/exportación y workers.

### Agentes — 12 archivos

- agent-contracts/index.
- agent-control/index, image-processor, migration-registry, migration-rollout-fuzz, protocol-conformance, qa-cycle-manager, qa-methods, security-fuzz, store-factory y template-site-rebuild.
- agent-sdk/index.

Cubre contratos, 34 wrappers públicos del SDK, protocolo, seguridad, migraciones, plantillas, ciclos QA y creación de tiendas.

### Core — 10 archivos

category, cross-surface-race, fuzz-comprehensive, fuzz, fuzz100, history-limit, index, mutation-killers, normalize-search y project-mutations.

Cubre reducer/comandos, CSV, categorías, índices derivados, historial, búsqueda, límites comerciales y consistencia entre superficies.

### Exporter — 39 archivos

- src: a11y-comprehensive, agent-lock, assets, catalog-modern, cf-worker, chaos-storage, determinism, editor-metadata, fingerprint, fonts, index, json-stream, json-stream.stress, legacy-zip-migration, lighthouse-lite, local-project-storage, merchant, mutation-killers, normalize-parity, parity, price-format, product-list, public-asset-paths, pwa, recovery, redteam-persist, reparse-points, request-handler, responsive-images, runtime-debug, scale, security-redteam, seo-audit, seo-deep, storefront-static-contract y structured-data.
- scripts: local-layout, session-handler y session-registry.

Cubre exportación, rutas, HTML inicial, SEO, feeds, assets, PWA, storage local, migraciones y recuperación.

### Otros paquetes — 33 archivos

- module-sdk — 3: canvas-bindings, index y mutation-killers.
- modules — 2: contact-v2 e index.
- project-schema — 17: catalog-modern-guidance, catalog-modern-template, catalog-modern-upgrade, fixture-budget, fixture-lazy, index, media, modern-base-template, money, money.property, mutation-killers, placeholder-diag, placeholder-seed, product-video, project-policy, scale y theme-presets.
- site-optimizer — 2: index y snapshot-hash.
- storefront-runtime — 9: frame-rate, gallery-video, index, mutation-killers, price-format, redteam-functional, search, whatsapp-checkout-audit y whatsapp-multipart.

## Archivos de scripts — 26

- Contratos, ejecutados por test:contracts: codex-collaboration, contratos-profundos, contratos, enganches, parity-sweep, seo-check, sitio-consistencia, test-affected-map, test-impact y test-runner-guard.
- Gates lentos: site-optimizer-check y optimization-baseline (check:optimization); runtime-serialization; storefront-runtime-budget y public-storefront-budget (check:budgets).
- Manuales, auxiliares o seleccionados por impacto: check-budgets.regression, check-chunks, codex-subagent-smoke, export-doctor, export-shared-fixture, pilot-preflight, recursos-check, rm-performance-node, rm-performance-readonly, write-pilot-export y write-reference-export. Se retiraron los perfiles sin aserciones y dos benchmarks de escala sin requisito de producto el 26/09/2026.

La ejecución de estas últimas no se infiere por su sufijo .test.ts: el script que las invoca determina si corren. Por ejemplo, test:contracts ejecuta 10 de ellas; check:full ejecuta los gates lentos; los diagnósticos de 5.000/10.000 productos y RM requieren invocación propia.

## Inventario E2E por spec

Los números entre paréntesis combinan la lista `--list` del 25/09 con restas estáticas de registros borrados; no se volvió a enumerar el runner. Los loops que generan tests en dashboard-gargantua y product-list permanecen. Los loops dentro de un test, como navegar varias rutas o viewports, cuentan como un caso pero aumentan las interacciones realizadas.

La proyección funcional actual se reparte en 23 specs de storefront (59 casos),
18 de Studio/dashboard (45) y 11 de robustez/exportación (16): **52 specs y 120
casos**. Las cinco auditorías manuales, con 26 casos, se informan aparte.

| Familia | Specs y casos | Cobertura |
| --- | --- | --- |
| Storefront, catálogo y navegación | catalog-modern (2), catalog-modern-v2 (6), catalog-modern-v2-commerce (6), catalog-modern-v2-navigation (2), scale-store (3), catalog (2), catalog-package (1), product-list (8), search-catalog (2), exported-store (1), storefront-nojs (2), preview-cart (4), ui-sweep-a27 (1), ui-sweep-a28 (2), ui-sweep-a29 (5), ui-sweep-a30 (2), cart-drawer-responsive (3), cart-target-size (1), product-video (1), contact-anchors (1), contact-v2 (1), subfolder-site (1), site-edgecases (2) | V1/V2, rutas, filtros, búsqueda y deep-link/paginación, carrito, WhatsApp, no-JS, video y responsive; conteos actuales estáticos |
| Dashboard, Studio y edición | dashboard-actions (3), dashboard-gargantua (4), flujo-crear (1), catalog-guided (1), editor-a11y (5), editor-builder (4), editor-catalog (4), editor-motion (1), editor-persistence (3), editor-product (3), editor-smoke (1), editor-workers (4), studio-builder (1), live-canvas-coverage (4), assets (1), ui-categorias (2), ui-shell (2), ui-tema-seo (1) | Crear/duplicar/archivar, edición, Canvas, persistencia, workers, teclado, estado guiado y accesibilidad; conteos actuales estáticos |
| Errores, exportación y robustez | bugfix-audit-failure (1), bugfix-csv-dupes (2), bugfix-export (1), exporter-sentinel (1), local-shutdown (2), local-storage (2), nojs-coverage (1), offline-reload (2), focus-visible (1), responsive-breakpoints (2), __bugs__/forms-adversarial (1) | Fallo de auditoría, duplicados CSV, privacidad, persistencia local, PWA offline, no-JS, responsive, teclado y payload hostil; reglas SEO/runtime y estructura accesible pasan a tests directos de paquete |
| Auditoría manual | calculator-visual-audit (1), __vision__/alignment (4), __vision__/storefront-alignment (4), ui-export (5), visual-break (12 tras limitarlo a tres viewports) | Geometría visual, exportación y matriz de viewport; no forma parte del smoke funcional |

## Herramienta de estabilidad E2E

scripts/e2e-stability.mjs es manual. Su valor predeterminado es 5 rondas y permite configurar 1–20 mediante STABILITY_RUNS. En este snapshot la extracción de rutas encuentra referencias en las listas smoke quick y smoke full: 20 argumentos de ruta, 15 nombres únicos y 5 repetidos. El script no está conectado a check:quick ni a GitHub Actions. Confirmar el comportamiento de deduplicación de Playwright antes de interpretar esos argumentos como ejecuciones únicas.

## Mantenimiento de este snapshot

Actualizar esta ficha si cambia cualquiera de estas fuentes:

1. scripts de package.json raíz o de los paquetes;
2. listas quick/full, filtros o proyectos de scripts/e2e-smoke.mjs, scripts/e2e-run.mjs, scripts/release-e2e.mjs y playwright.config.ts;
3. fixtures de tamaño, loops, semillas, límites o cardinalidades de los tests citados;
4. archivos E2E funcionales/auditados o inventario de la suite.

Al actualizar, registrar la fecha nueva, recalcular casos con generación dinámica y distinguir siempre: archivos, casos Playwright, iteraciones dentro de cada caso y volumen de datos. La existencia de un archivo .test no prueba que un comando habitual lo ejecute.
