# Alcance y cargas de la suite — revisión 2026-09-26

> El inventario del árbol y los conteos E2E se verificaron el 26/09/2026. Playwright `--list` registró 450 casos funcionales en 74 specs, 33 casos de auditoría en 5 specs, smoke quick 13/5 y smoke full 109/15. La matriz release enumera 505 casos local y 479 con `CI=true`. Los resultados de ejecución focal y smoke se detallan en el CHANGELOG; no se repitió la suite funcional completa.

## Conteo del árbol inspeccionado

Quedan 245 archivos con sufijos de test en las carpetas activas:

| Capa | Archivos | Qué representa |
| --- | ---: | --- |
| Paquetes | 140 | Vitest junto al código de Studio y packages |
| Scripts | 26 | Contratos, budgets, exportaciones y diagnósticos |
| E2E | 79 | Specs Playwright: 74 funcionales y 5 auditorías manuales |

El conteo de archivos no equivale al número de casos ejecutados. Algunas suites generan tests dinámicamente; otras recorren varios datos o viewports dentro de un solo caso. Por eso se informan por separado casos Playwright, repeticiones explícitas y tamaños de fixtures. No se publica un total global de casos Vitest inferido por búsqueda de texto.

## Frecuencia por comando

| Comando | Alcance configurado en este snapshot | Repetición |
| --- | --- | --- |
| test / test:normal | Tests normales de los paquetes: 130 archivos | Cada caso una vez por invocación; no incluye E2E |
| check:quick | Los 130 archivos normales, más formato, typecheck y checks estáticos | Una vez; la concurrencia limita paralelismo y no multiplica ejecuciones |
| test:extended | Mutación, fuzz reducido y QA de fábrica | Una ejecución de cada capa; stress queda manual |
| check:full | check:fast + test:extended + check:slow + build + postbuild | No ejecuta payloads >536 MB |
| test:full | Suite normal + contratos + test:extended | No incluye check:slow, build ni Playwright |
| test:e2e:smoke | 5 specs / 13 casos enumerados | Chromium; local: 0 reintentos |
| test:e2e:smoke:full | 15 specs / 109 casos enumerados | Chromium; loops de viewport dentro de un caso no suman casos nuevos |
| test:e2e | 74 specs / 450 casos enumerados | Chromium; no equivale a una ejecución completa reciente |
| test:e2e:audit | 5 specs / 33 casos enumerados | La matriz visual pasó de 53 a 18; auditorías fuera del gate funcional |
| test:e2e:ci | 5 specs / 13 casos | Sin build; comando disponible, no ejecutado por GitHub Actions |
| test:e2e:release, local con CI sin definir | 79 specs / 483 Chromium + 11 por navegador adicional (505 total enumerado) | Firefox y WebKit sólo usan exported-store, exporter-sentinel y storefront-nojs |
| test:e2e:release, con CI=true | 457 Chromium + 11 por navegador adicional (479 total enumerado) | CI excluye alignment, storefront-alignment y los 18 casos de visual-break; conserva un retry para fallos |

Playwright usa 3 workers por defecto en local. Los workers ejecutan archivos en paralelo; no triplican los casos. En CI se configura un retry, de modo que el número de intentos puede aumentar si hay fallos. El workflow de GitHub Actions inspeccionado contiene pasos placeholder y ejecuta 0 tests de producto.

La receta `release` ya no repite los casos de smoke full antes de correr la matriz `all`; esa matriz contiene los specs smoke. También reutiliza el build producido por `check:full`. Los casos exactos deben volver a contarse cuando se autorice una enumeración Playwright.

### Tests de paquete fuera de la corrida normal

De los 140 archivos de paquetes, 130 entran en el test normal. Los otros 10 están separados por carga o por dependencia del build:

| Archivo | Comando | Motivo |
| --- | --- | --- |
| apps/studio/src/lib/fuzz-navigation.test.ts | test:fuzz | 100 semillas por 100 pasos |
| packages/agent-control/src/store-factory.test.ts | test:qa | Crea tiendas de manera secuencial por el protocolo oficial |
| packages/core/src/cross-surface-race.test.ts | test:fuzz | 100 semillas por 100 pasos |
| packages/core/src/fuzz100.test.ts | test:fuzz | 40 semillas por 200 pasos |
| packages/core/src/fuzz.test.ts | test:fuzz | Corridas deterministas de 250 y 1.000 pasos |
| packages/core/src/fuzz-comprehensive.test.ts | test:fuzz | 500 pasos con operaciones válidas e inválidas |
| packages/exporter/src/json-stream.stress.test.ts | test:stress | JSON mayor que el límite de una cadena de V8 |
| packages/site-optimizer/src/oversize-snapshot.test.ts | test:stress | Snapshot con payloads grandes |
| packages/project-schema/src/placeholder-diag.test.ts | test:diagnostic | Dump para inspección manual |
| packages/project-schema/src/fixture-lazy.test.ts | test:postbuild | Comprueba la fixture lazy después del build |

## Cargas explícitas

| Prueba / fixture | Volumen observado en el código | Cuándo y para qué |
| --- | --- | --- |
| store-factory | 3 tiendas: 6, 30 y 120 productos; total 156 productos en 8 lotes | Una vez por test:qa, test:extended, test:full o check:full. Recorre creación, planificación, commit y export draft en almacenamiento temporal |
| core/index.test.ts | Tres casos usan 50 productos / 100 variantes: round-trip CSV, determinismo del generador y acción masiva | En la suite normal. Comprueba contenido y operación de dominio; ya no cronometra 1.000 productos |
| catalogScaleStore | 50 productos, 15 categorías y 60 variantes | Fixture compartida por schema, exporter, optimizer y E2E. Reutilizarla no crea una tienda adicional cada vez que otro test la importa |
| catalog.spec.ts | Un caso procesa 60 productos / 120 variantes dos veces: previsualiza y cancela, luego confirma el reemplazo | Una vez en E2E funcional; se retiró el caso redundante de 200 productos |
| editor-workers.spec.ts | Un CSV con 60 productos / 120 variantes | Un caso E2E; cubre worker, estado de progreso y confirmación |
| fuzz de Core + Studio | 3.850 pasos deterministas: Core 3.250 y Studio 600 | Una vez por test:fuzz / test:extended / check:full |
| json-stream.stress.test.ts | 135 assets con 4 referencias de ~1 millón de caracteres; ~540 millones de caracteres serializados | Sólo `test:stress` manual; justo por encima del límite de cadena de V8 |
| oversize-snapshot.test.ts | Snapshot con 135 assets × 4 referencias (~540 millones de caracteres); tres auditorías sobre el payload | Sólo `test:stress` manual; comprueba hash acotado, determinista y sensible a cambios |
| visual-break.spec.ts | 3 viewports oficiales; 5 casos por viewport y 3 adicionales = 18 casos. Exporta 50 productos por viewport y abre un carrito de 20 líneas | Sólo test:e2e:audit o modo release que incluya auditorías visuales |
| dashboard-gargantua.spec.ts | El caso de comparación usa 6 tiendas visibles: tienda base + 5 copias. Un loop de 4 tamaños registra 4 casos donde el código fuente muestra 1 | Una vez en suite funcional; usa IndexedDB aislada |
| product-list.spec.ts | 4 fixtures generan 2 casos cada uno; suma 3 casos independientes y 7 tamaños responsive: 18 casos registrados. El módulo exporta los 5 sitios de fixture una vez al cargar el spec | Suite funcional; compara demo limpia, legacy, V2, escala y títulos largos en listado, no-JS y Preview |
| WhatsApp multiparte | Casos con 60 y 601 líneas; otras pruebas con 30, 50 y 100 productos/líneas, cantidad 99 y texto largo | Una vez por caso del paquete normal; genera texto/URL, no envía mensajes |
| money.property.test.ts | 500 valores reproducibles | Una vez en tests normales de schema; verifica formato y determinismo |
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
- site-optimizer — 2: index y oversize-snapshot.
- storefront-runtime — 9: frame-rate, gallery-video, index, mutation-killers, price-format, redteam-functional, search, whatsapp-checkout-audit y whatsapp-multipart.

## Archivos de scripts — 26

- Contratos, ejecutados por test:contracts: codex-collaboration, contratos-profundos, contratos, enganches, parity-sweep, seo-check, sitio-consistencia, test-affected-map, test-impact y test-runner-guard.
- Gates lentos: site-optimizer-check y optimization-baseline (check:optimization); runtime-serialization; storefront-runtime-budget y public-storefront-budget (check:budgets).
- Manuales, auxiliares o seleccionados por impacto: check-budgets.regression, check-chunks, codex-subagent-smoke, export-doctor, export-shared-fixture, pilot-preflight, recursos-check, rm-performance-node, rm-performance-readonly, write-pilot-export y write-reference-export. Se retiraron los perfiles sin aserciones y dos benchmarks de escala sin requisito de producto el 26/09/2026.

La ejecución de estas últimas no se infiere por su sufijo .test.ts: el script que las invoca determina si corren. Por ejemplo, test:contracts ejecuta 10 de ellas; check:full ejecuta los gates lentos; los diagnósticos de 5.000/10.000 productos y RM requieren invocación propia.

## Inventario E2E por spec

Los números entre paréntesis combinan la lista `--list` del 25/09 con restas estáticas de registros borrados; no se volvió a enumerar el runner. Los loops que generan tests en dashboard-gargantua y product-list permanecen. Los loops dentro de un test, como navegar varias rutas o viewports, cuentan como un caso pero aumentan las interacciones realizadas.

La proyección funcional se reparte en 25 specs de storefront (179 casos), 30
de Studio/dashboard (225) y 19 de robustez/exportación (46): **74 specs y 450
casos**. Las cinco auditorías manuales, con 33 casos, se informan aparte.

| Familia | Specs y casos | Cobertura |
| --- | --- | --- |
| Storefront, catálogo y navegación | catalog-modern (7), catalog-modern-v2 (26), catalog-modern-v2-commerce (17), catalog-modern-v2-navigation (8), scale-store (7), catalog (2), catalog-package (1), product-list (18), search-catalog (6), exported-store (4), storefront-nojs (4), preview-cart (6), preview-navbar (1), ui-sweep-a27 (9), ui-sweep-a28 (10), ui-sweep-a29 (18), ui-sweep-a30 (20), interacciones (1), cart-drawer-responsive (4), cart-target-size (1), product-video (3), contact-anchors (1), contact-v2 (1), subfolder-site (1), site-edgecases (3) | V1/V2, rutas, filtros, búsqueda, paginación, carrito, WhatsApp, no-JS, video y responsive |
| Dashboard, Studio y edición | dashboard-actions (7), dashboard-gargantua (27), flujo-crear (6), catalog-guided (4), editor-a11y (24), editor-builder (23), editor-catalog (12), editor-console (3), editor-motion (5), editor-persistence (6), editor-product (6), editor-scroll (1), editor-shell (5), editor-smoke (2), editor-states (7), editor-workbench (4), editor-workers (7), studio-builder (4), live-canvas (3), live-canvas-coverage (12), assets (2), ui-assets (2), ui-catalogo (1), ui-categorias (4), ui-guiado (3), ui-matriz-interaccion (13), ui-producto (5), ui-shell (11), ui-tema-seo (11), ui-tema-styles (5) | Crear/duplicar/archivar, edición, Canvas, persistencia, workers, teclado, estados y accesibilidad |
| Errores, exportación y robustez | bugfix-audit-failure (1), bugfix-crashes (2), bugfix-csv-dupes (2), bugfix-export (3), builder-coverage (3), exporter-sentinel (3), local-shutdown (2), local-storage (2), nojs-coverage (1), offline-reload (5), seo-media (1), release-a11y (1), focus-visible (1), responsive-breakpoints (2), a11y-comprehensive (7), __bugs__/forms-adversarial (2), __bugs__/runtime-draft (2), __bugs__/runtime-failures (3), __bugs__/seo-integrity (3) | Fallos conocidos, límites, SEO, datos hostiles, shutdown administrado, export y accesibilidad |
| Auditoría manual | calculator-visual-audit (1), __vision__/alignment (4), __vision__/storefront-alignment (4), ui-export (6), visual-break (18 tras limitarlo a tres viewports) | Geometría visual, exportación y matriz de viewport; no forma parte del smoke funcional |

## Herramienta de estabilidad E2E

scripts/e2e-stability.mjs es manual. Su valor predeterminado es 5 rondas y permite configurar 1–20 mediante STABILITY_RUNS. En este snapshot la extracción de rutas encuentra referencias en las listas smoke quick y smoke full: 20 argumentos de ruta, 15 nombres únicos y 5 repetidos. El script no está conectado a check:quick ni a GitHub Actions. Confirmar el comportamiento de deduplicación de Playwright antes de interpretar esos argumentos como ejecuciones únicas.

## Mantenimiento de este snapshot

Actualizar esta ficha si cambia cualquiera de estas fuentes:

1. scripts de package.json raíz o de los paquetes;
2. listas quick/full, filtros o proyectos de scripts/e2e-smoke.mjs, scripts/e2e-run.mjs, scripts/release-e2e.mjs y playwright.config.ts;
3. fixtures de tamaño, loops, semillas, límites o cardinalidades de los tests citados;
4. archivos E2E funcionales/auditados o inventario de la suite.

Al actualizar, registrar la fecha nueva, recalcular casos con generación dinámica y distinguir siempre: archivos, casos Playwright, iteraciones dentro de cada caso y volumen de datos. La existencia de un archivo .test no prueba que un comando habitual lo ejecute.
