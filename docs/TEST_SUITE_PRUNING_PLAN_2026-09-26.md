# Poda profunda de la suite — revisión 2026-09-26

> Estado del árbol de trabajo, no política permanente. La última enumeración
> Playwright (26/09/2026) registró 450 casos funcionales en 74 specs y 33 de
> auditoría. Tras la poda base y las pasadas actuales de storefront, Studio y
> robustez y la consolidación de catálogo, quedan 120 casos funcionales en 52 specs y 26 de auditoría, todos por
> diferencia estática. No se ejecutaron tests ni `playwright --list` después de
> estos cambios. Las verificaciones del CHANGELOG son de la poda anterior.

## Decisión

La suite debía comprobar contratos de producto con ejemplos representativos y
reservar los payloads que necesitan cientos de megabytes para ejecución manual.
Los perfiles que sólo escribían métricas se borraron. También se retiraron dos
mediciones de 2.000 productos: el exporter ya verifica producción, paginación y
paridad Preview/export con la fixture común de 50 productos; no hay un SLA
vigente que obligue a crear miles de páginas en cada revisión.

En este árbol quedan **223 archivos de test**: 140 de Studio/paquetes, 26 scripts y
57 specs E2E (52 funcionales y 5 de auditoría). El recorte inicial de 81 specs E2E documentado en
[`TEST_SUITE_REDUCTION_2026-09-25.md`](TEST_SUITE_REDUCTION_2026-09-25.md) ya forma
parte del checkout inspeccionado.

## Recortes aplicados

| Superficie | Antes | Ahora | Motivo y cobertura que queda |
| --- | ---: | ---: | --- |
| Perfiles manuales sin aserciones | 5 archivos; hasta 17.550 productos / 35.100 variantes en un perfil y 3.250 / 6.460 en otro | 0 | Sólo imprimían tiempos, tamaños y memoria. No verificaban una salida correcta. Se borraron `audit-2000`, `audit-2000-repeat`, `perf-benchmark`, `perf-detailed` y `perf-flows`. |
| Escala de exportación/audit | Dos pruebas de 2.000 productos; export de ~48 MB y un umbral temporal de 500 ms | Eliminadas | El renderer mantiene pruebas funcionales con 50 productos y rutas paginadas. Los budgets de runtime/CSS siguen activos. No había un requisito funcional de 2.000 productos ni un SLA de latencia vigente. |
| Fábrica de tiendas | 20 tiendas, 1.086 productos y 55 lotes | 3 tiendas, 96 productos y 6 lotes | Conserva mini/normal/mediana (6/30/60), protocolo create-plan-commit-export, IDs únicos y no mutación de plantilla. Reduce productos 91,2% y tiendas 85%. El CLI también queda en 3 tiendas por defecto. |
| Core: CSV, generador y acción masiva | Tres casos de 1.000 productos cada uno: 3.000 instancias y 6.000 variantes | Tres casos de 50: 150 instancias y 300 variantes | Conserva round-trip, determinismo y resultado de la acción. Se quitó una medición de tiempo de pared, sensible al equipo, que no era una regla comercial. Reducción de datos: 95%. |
| Importación E2E de catálogo | Caso de 200 productos / 400 variantes, además de otro caso de 60 / 120 | Se borró el caso de 200; queda el de 60 / 120 | El caso restante cruza la página de 50 filas, revisa, cancela, vuelve a importar, confirma y aplica acciones entre páginas. |
| Worker CSV E2E | Dos recorridos CSV separados, más el import de 60 productos de `catalog.spec.ts` | Un recorrido combinado en `catalog.spec.ts`; conserva 60 / 120 | El mismo flujo cubre errores por fila, progreso real del Worker, cancelación, confirmación, resultado y selección/acción masiva entre páginas. Se borraron los dos imports E2E duplicados de `editor-workers.spec.ts`. |
| Fuzz determinista | 29.750 operaciones | 1.200 | Core general: 500; carreras: 100; operaciones combinadas válidas/invalidas: 100; navegación Studio: 500. Conserva semillas e invariantes; se quita la repetición de 1.000 cambios de tags/categorías. Reducción total: 96%. |
| Matriz visual | 10 viewports, 53 registros, 100 productos por viewport | 3 viewports oficiales, 12 registros | Mantiene Mobile 390×844, Tablet 1024×900 y Desktop 1440×900. Conserva home, categoría con un producto, textos largos, zoom en Tablet/Desktop, proporciones de imágenes, sticky y modales. Se elimina el export repetido de 50 productos y el carrito de 20 líneas en cada viewport. |
| WhatsApp, corte en tandas | 60 líneas → 50 + 10 | 60 → 50 + 10, sin cambio | Se conserva esta frontera obligatoria, con subtotales y total final. |
| WhatsApp, tope de partes | 2.000 líneas | 601 líneas | `maxLines=50` y `maxParts=12`: 600 líneas llenan el tope; la línea 601 obliga a resumir el excedente en la parte 12. Es la entrada mínima que prueba el límite sin procesar 2.000. |
| Stress de serialización | 150/560 assets y hasta ~2.240 millones de caracteres, incluido en `test:extended` | Un único caso >536 millones de caracteres, sólo `test:stress` manual; hash normal con 4 MB | Se borró el round-trip de archivo de 600 millones. Streaming JSON conserva el único caso extremo; el hash del optimizer mantiene determinismo y sensibilidad a cambios en la suite normal con un snapshot de 4 MB. |
| Release E2E | Smoke full de 118 casos y después matriz `all`, que volvía a incluir esos specs; segundo build de Studio | Una sola matriz `all`; reutiliza el build de `check:full` | Se quitó una repetición exacta de smoke y el build duplicado. `test:e2e:release` invocado por separado conserva su build autónomo. |
| E2E redundante A27/A28/A30 y microestilos V2 | A27–A30: 65 casos; `catalog-modern-v2-polish`: 17 casos | Se borraron 8 casos solapados y los 17 de microestilos | A27: se quitaron carrito básico, galería, diálogo de búsqueda y estado `inert`; se conservó el checkout real a WhatsApp. A28: se quitó la navegación de paginación duplicada con A30 y exporter. A30: se quitaron tres regresiones A29 repetidas. Se retiró el spec de radios, hover, separadores y animaciones. |
| Primera pasada profunda de storefront | 25 specs / 179 casos | 24 specs / 73 casos proyectados | Se redujeron V2, A27–A30, búsqueda, catálogo, video y responsividad a los contratos retenidos; `interacciones.spec.ts` se retiró y sus errores/404 quedaron en `exported-store`. Smoke y CI dejan de apuntar al archivo eliminado. Visual-break exporta 3 productos por caso y conserva sus 12 registros manuales. |
| Segunda pasada profunda de Studio/dashboard | 30 specs / 223 casos | 18 specs / 45 casos proyectados | Se retiraron 12 specs de matriz, estados visuales y recorridos duplicados, además del caso de movimiento reducido duplicado entre Gargantua y editor-motion. En los specs conservados queda un caso representativo de creación, edición, recuperación, workers, Canvas, accesibilidad y teclado. Gargantua baja a un viewport 1920×912; la inspección extensa de paneles y scroll pasa a revisión manual. |
| Continuación de poda en storefront | 24 specs / 73 casos | 24 specs / 64 casos proyectados | `product-list` pasa de 3 a 2 viewports; Preview conserva 4 de 6 contratos; A28 queda con compra legacy y variante disponible; A29 elimina normalización/inert ya cubiertos por runtime unitario; el cero se conserva en pruebas directas de formato. |
| Consolidación de catálogo y Preview | 24 specs / 64 casos | 23 specs / 59 casos proyectados | `search-catalog` pasa de 4 a 2 casos sin perder listado de 50, paginación, deep-link, clamp ni noindex; `product-list` queda en 390 px más el viewport amplio del caso normal; se retira el smoke aislado de mega-menú en Preview y el no-JS de video, que ya tiene fallback común y test de runtime. |
| Poda de duplicados de robustez/exportación | 19 specs / 46 casos | 11 specs / 16 casos proyectados | Se retiran 8 specs redundantes de Core/runtime/exporter (crashes, builder output, release-a11y, runtime-draft, runtime-failures, SEO integrity, seo-media y a11y comprehensive). PWA conserva navegador offline y actualización de cache; formas conserva payload hostil sin 10k caracteres; la privacidad de teléfono mantiene un sentinel para Firefox/WebKit. |
| Matrices E2E responsive repetidas | 46 navegaciones en `responsive-breakpoints` + 6/5/4 anchos en tres loops de catálogo y carrito | 22 + 4/3/2 | Se conservan los límites exactos 767/768 y 1199/1200, los tres checkpoints Home, las cuatro rutas críticas en móvil, V1/V2 para media y los dos lados del breakpoint de drawer 600px. Ahorro estático: 30 navegaciones/mediciones de viewport. |
| Carga del modelo de dashboard | 164 productos sintéticos para comprobar agregación | 100 productos / 108 facturables | El límite anterior no probaba una regla especial; 100 es el techo normal propuesto y conserva dos productos con cinco variantes para comprobar los extras. |
| Límite de undo/redo | 520 cambios en cuatro casos: 200 + 200 + 60 + 60 | 153 cambios en tres casos, 51 cada uno | Se elimina el caso que sólo repetía el límite de snapshots; FIFO ya comprueba `MAX_HISTORY_LENGTH`. Undo, redo y descarte FIFO usan el mínimo `MAX_HISTORY_LENGTH + 1`. |
| WhatsApp, lote exacto de 100 | 100 líneas para comprobar 50+50 y ausencia de resumen | Eliminado; la prueba obligatoria de 60 comprueba cada línea en 50+10 y que no haya resumen | El caso de 60 ya prueba la frontera de dos tandas y ahora comprueba contenido de ambas; se conservan la prueba de URL larga y la frontera de 601 líneas. |
| Importación de respaldo inválido duplicada en auditoría | 1 E2E de `ui-export` con envelope inválido | 0 | El E2E de `editor-workers` mantiene la respuesta de la interfaz ante JSON corrupto; `apps/studio/src/lib/projectArchive.test.ts` conserva rechazos unitarios de JSON corrupto y proyecto no compatible. Se elimina el segundo recorrido E2E de confirmación/error. |
| Mutaciones del formato de moneda | `money.property.test.ts` corría 500 muestras en baseline y en cada uno de dos mutantes (1.500 muestras repetidas) | El test de mutación usa sólo `money.test.ts` | La propiedad de 500 valores sigue una vez en la suite normal; la prueba pequeña de enteros seguros se mueve a `money.test.ts`, que mata la mutación del guard sin volver a lanzar el recorrido aleatorio completo. |

El único payload V8 que permanece supera por poco el límite de 536.870.888
caracteres: 135 assets × cuatro referencias de aproximadamente 1 MiB ≈ 540
millones. Se conserva en streaming JSON porque `docs/TECHNICAL_DEBT.md` registra
una tienda real con 418 data URLs y unos 326 MB serializados, y el archive del
agente todavía usa una cadena completa. El hash incremental mantiene sus
comprobaciones normales con 4 MB, sin repetir el caso extremo. El payload V8
queda fuera de `check:full` y sólo se ejecuta manualmente.

## Qué ejecuta ahora cada gate

- `check:full`: `check:fast`, mutation, fuzz reducido, QA de tres tiendas,
  optimización, serialización normal, budgets, build y post-build. No corre
  `test:stress` ni benchmarks de catálogos de miles de productos.
- `test:stress`: manual; ejecuta un único caso de streaming JSON sobre el límite
  de V8. El hash de snapshot usa 4 MB en la suite normal. El round-trip gigante
  de `projectArchive` fue eliminado; quedan round-trips normales en su test unitario.
- `benchmark:export` y `benchmark:export:ci`: eliminados junto con su test de
  2.000 productos. Para comprobar salida y paginación se usa
  `packages/exporter/src/scale.test.ts` con `catalogScaleStore`.
- `release`: primero completa `check:full`; luego lanza la matriz E2E `all` una
  sola vez y le indica que reutilice el build recién creado.
- Proyección estática actual: 120 casos funcionales en 52 specs, 26 de auditoría
  y 146 en Chromium para `release`; Firefox y WebKit suman tres sentinels cada
  uno (152 total). Con `CI=true`, el total proyectado es 132. No se volvió a
  ejecutar `playwright --list`.

## Cobertura que no se debe podar por volumen

- WhatsApp 60 → 50+10: confirma que un pedido de más de una tanda no pierde
  líneas ni reparte mal los importes.
- WhatsApp 601: verifica el tope de doce partes y que el remanente se resuma.
- `catalogScaleStore`: 50 productos, 15 categorías y 60 variantes. Es el ejemplo
  común suficiente para paginación y jerarquía sin multiplicar fixtures grandes.
- Worker de CSV: un caso real debe comprobar que el editor sigue usable mientras
  procesa y que el reemplazo ocurre sólo después de confirmar.
- Frontera de imágenes: 501 entradas sigue siendo necesaria para comprobar un
  máximo de 500; no es repetición artificial.
- Schema, centavos enteros, recuperación, seguridad, no-JS, rutas y paridad
  Preview/export son contratos; reducir datos no debe borrar esas aserciones.

## Resultado de la poda y límite restante

La meta de **80–120 casos funcionales** queda en su techo: 120 proyectados. La
meta de **30–40 specs** no se alcanza: el inventario conserva 52 archivos
funcionales. Ese segundo número cuenta archivos; fusionarlos no reduce
ejecuciones. Borrar 12–22 archivos para cumplirlo exigiría retirar recorridos de
producto distintos. La última revisión quitó un caso E2E duplicado y redujo
30 navegaciones por viewport; no apareció otra duplicación exacta en los
contratos revisados. Por eso no se fuerza una poda numérica que sacrifique
cobertura.

| Superficie | Volumen actual | Meta propuesta | Estado |
| --- | ---: | ---: | --- |
| Storefront | 23 specs / 59 casos | 12–16 / 35–45 | Se ahorran 30 navegaciones responsive; los casos restantes cubren rutas, compra, listado/paginación, no-JS, teclado, video y las dos familias V1/V2. Reducir más requiere decidir qué contrato eliminar. |
| Studio/dashboard | 18 / 45 | 12–16 / 30–45 | El volumen de casos está dentro del rango. Los archivos separados mantienen recorridos de creación, recuperación, edición, workers, Canvas, shell y accesibilidad. |
| Robustez/exportación | 11 / 16 | 6–8 / 15–25 | Los casos están dentro del rango. Se conservan seguridad, CSV, auditoría, exportación, no-JS, apagado y persistencia, cada uno con una falla distinta. |
| Auditoría manual | 5 / 26 | Separada | `visual-break` conserva 12 casos en los tres checkpoints; no integra el conteo funcional. |

La lectura test por test no halló otra prueba E2E que ejercite exactamente el
mismo recorrido con el mismo resultado esperado. Algunas aserciones comparten
dominio con pruebas unitarias —por ejemplo, parseo del respaldo—, pero el E2E
restante comprueba la respuesta visible del Studio. Las cifras de archivos son
un inventario, no una meta de tiempo.

La revisión de mutación conservó los cuatro mutantes: límite de precio, piso de
porcentaje, entero seguro y fracción automática prueban reglas distintas. El
test de moneda usa ahora sólo `money.test.ts`; la propiedad de 500 valores queda
una vez en la suite normal en vez de repetirse dentro de baseline y dos mutantes.

El stress V8 sigue fuera del gate frecuente. Si cambia el límite de carga de
assets o el serializador, se vuelve a ejecutar manualmente el único caso extremo.

La reducción de E2E debe medirse en casos ejecutados y minutos, no en archivos
borrados. `check:full`, smoke full (109/109) y la investigación de 63 fallos
corresponden a la poda previa; no validan el árbol actual. La suite funcional
proyectada de 120 casos y el smoke actualizado no se ejecutaron ni enumeraron.
