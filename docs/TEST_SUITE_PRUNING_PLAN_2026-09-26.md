# Poda profunda de la suite — revisión 2026-09-26

> Estado del árbol de trabajo, no política permanente. Se auditó el árbol y se
> enumeró Playwright el 26/09/2026: 245 archivos de test, 450 casos funcionales
> en 74 specs, 33 casos de auditoría y 13/109 casos en smoke quick/full.
> `check:micro`, `check:full`, smoke full y los 63 casos fallidos del snapshot
> funcional previo se verificaron individualmente o en selecciones focales; la
> suite funcional completa no se repitió. `check:full` toleró los diagnósticos
> Biome y los budgets Studio ya documentados. Revisar esta ficha cuando cambien
> scripts, loops o fixtures.

## Decisión

La suite debía comprobar contratos de producto con ejemplos representativos y
reservar los payloads que necesitan cientos de megabytes para ejecución manual.
Los perfiles que sólo escribían métricas se borraron. También se retiraron dos
mediciones de 2.000 productos: el exporter ya verifica producción, paginación y
paridad Preview/export con la fixture común de 50 productos; no hay un SLA
vigente que obligue a crear miles de páginas en cada revisión.

En este árbol quedan **245 archivos de test**: 140 de Studio/paquetes, 26 scripts y
79 specs E2E (74 funcionales y 5 de auditoría). El recorte inicial de 81 specs E2E documentado en
[`TEST_SUITE_REDUCTION_2026-09-25.md`](TEST_SUITE_REDUCTION_2026-09-25.md) ya forma
parte del checkout inspeccionado.

## Recortes aplicados

| Superficie | Antes | Ahora | Motivo y cobertura que queda |
| --- | ---: | ---: | --- |
| Perfiles manuales sin aserciones | 5 archivos; hasta 17.550 productos / 35.100 variantes en un perfil y 3.250 / 6.460 en otro | 0 | Sólo imprimían tiempos, tamaños y memoria. No verificaban una salida correcta. Se borraron `audit-2000`, `audit-2000-repeat`, `perf-benchmark`, `perf-detailed` y `perf-flows`. |
| Escala de exportación/audit | Dos pruebas de 2.000 productos; export de ~48 MB y un umbral temporal de 500 ms | Eliminadas | El renderer mantiene pruebas funcionales con 50 productos y rutas paginadas. Los budgets de runtime/CSS siguen activos. No había un requisito funcional de 2.000 productos ni un SLA de latencia vigente. |
| Fábrica de tiendas | 20 tiendas, 1.086 productos y 55 lotes | 3 tiendas, 156 productos y 8 lotes | Conserva mini/normal/mediana (6/30/120), protocolo create-plan-commit-export, IDs únicos y no mutación de plantilla. Reduce productos 85,6% y tiendas 85%. |
| Core: CSV, generador y acción masiva | Tres casos de 1.000 productos cada uno: 3.000 instancias y 6.000 variantes | Tres casos de 50: 150 instancias y 300 variantes | Conserva round-trip, determinismo y resultado de la acción. Se quitó una medición de tiempo de pared, sensible al equipo, que no era una regla comercial. Reducción de datos: 95%. |
| Importación E2E de catálogo | Caso de 200 productos / 400 variantes, además de otro caso de 60 / 120 | Se borró el caso de 200; queda el de 60 / 120 | El caso restante cruza la página de 50 filas, revisa, cancela, vuelve a importar, confirma y aplica acciones entre páginas. |
| Worker CSV E2E | 1.000 productos / 2.000 variantes | 60 / 120 | Mantiene el recorrido real por Worker y las aserciones de procesamiento, progreso y reemplazo. |
| Fuzz determinista | 29.750 operaciones | 3.850 | Core: 19.750 → 3.250; Studio: 10.000 → 600. Conserva semillas, invariantes y secuencias de 1.000 pasos de Core, con menos combinaciones aleatorias repetidas. Reducción total: 87,1%. |
| Matriz visual | 10 viewports, 53 registros, 100 productos por viewport | 3 viewports oficiales, 18 registros, 50 productos por viewport | Mantiene Mobile 390×844, Tablet 1024×900 y Desktop 1440×900. Conserva casos de overflow, zoom, carrito, imágenes y modales; se quitaron anchos intermedios redundantes. |
| WhatsApp, corte en tandas | 60 líneas → 50 + 10 | 60 → 50 + 10, sin cambio | Se conserva esta frontera obligatoria, con subtotales y total final. |
| WhatsApp, tope de partes | 2.000 líneas | 601 líneas | `maxLines=50` y `maxParts=12`: 600 líneas llenan el tope; la línea 601 obliga a resumir el excedente en la parte 12. Es la entrada mínima que prueba el límite sin procesar 2.000. |
| Stress de serialización | 150/560 assets y hasta ~2.240 millones de caracteres, incluido en `test:extended` | 135 assets y ~540 millones en cada frontera restante; sólo `test:stress` manual | Se borró el round-trip de archivo de 600 millones, que duplicaba el caso del parser y las pruebas normales de archive. Se conservaron streaming JSON y hash del optimizer porque cubren rutas distintas frente a `Invalid string length` de V8. |
| Release E2E | Smoke full de 118 casos y después matriz `all`, que volvía a incluir esos specs; segundo build de Studio | Una sola matriz `all`; reutiliza el build de `check:full` | Se quitó una repetición exacta de smoke y el build duplicado. `test:e2e:release` invocado por separado conserva su build autónomo. |
| E2E redundante A27/A28/A30 y microestilos V2 | A27–A30: 65 casos; `catalog-modern-v2-polish`: 17 casos | Se borraron 8 casos solapados y los 17 de microestilos | A27: se quitaron carrito básico, galería, diálogo de búsqueda y estado `inert`; se conservó el checkout real a WhatsApp. A28: se quitó la navegación de paginación duplicada con A30 y exporter. A30: se quitaron tres regresiones A29 repetidas. Se retiró el spec de radios, hover, separadores y animaciones. |

Los dos payloads V8 que permanecen superan por poco el límite de 536.870.888
caracteres: 135 assets × cuatro referencias de aproximadamente 1 MiB ≈ 540
millones. No los borré porque `docs/TECHNICAL_DEBT.md` registra una tienda real
con 418 data URLs y unos 326 MB serializados, y el canal de agente aún conserva
un camino de archive basado en una cadena completa. Los dos tests protegen
caminos distintos: parse/streaming y hash incremental. No corren en `check:full`;
quedan como diagnóstico manual hasta migrar también el archive de agente a
bytes o demostrar que el límite real de datos queda por debajo del umbral V8.

## Qué ejecuta ahora cada gate

- `check:full`: `check:fast`, mutation, fuzz reducido, QA de tres tiendas,
  optimización, serialización normal, budgets, build y post-build. No corre
  `test:stress` ni benchmarks de catálogos de miles de productos.
- `test:stress`: manual; ejecuta una vez el streaming JSON y el hash de snapshot
  sobre payloads por encima del límite de V8. El round-trip gigante de
  `projectArchive` fue eliminado; quedan round-trips normales en su test unitario.
- `benchmark:export` y `benchmark:export:ci`: eliminados junto con su test de
  2.000 productos. Para comprobar salida y paginación se usa
  `packages/exporter/src/scale.test.ts` con `catalogScaleStore`.
- `release`: primero completa `check:full`; luego lanza la matriz E2E `all` una
  sola vez y le indica que reutilice el build recién creado.
- Proyección estática actual: 450 casos funcionales, 33 de auditoría y 483 en
  Chromium para `release` (505 al sumar los 11 casos por navegador adicional).
  Parte de 476/68/544 en la lista del 25/09; resta 26 casos funcionales y 35 de
  auditoría. No se volvió a ejecutar `playwright --list`.

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

## Próxima poda recomendada

La meta extrema propuesta —todavía no alcanzada— es dejar **30–40 specs
funcionales y 80–120 casos**. Desde los 74/450 proyectados, eso exige borrar o
consolidar 34–44 specs y 330–370 registros (73–82% de los casos funcionales).
La distribución objetivo aproximada es storefront 12–16 specs / 35–45 casos,
Studio 12–16 / 30–45 y robustez/exportación 6–8 / 15–25. El smoke esencial
permanece en 5 specs / 13 casos; las auditorías visuales se mantienen aparte.

| Superficie actual | Volumen | Meta propuesta | Poda que falta |
| --- | ---: | ---: | --- |
| Storefront | 25 specs / 179 casos | 12–16 / 35–45 | Reducir regresiones repetidas entre los 51 casos V2 y los 57 de A27–A30; un contrato funcional por flujo y una comprobación visual por viewport. |
| Studio/dashboard | 30 / 225 | 12–16 / 30–45 | Agrupar alta/importación, edición, guardado/reapertura y workers; retirar recorridos que repiten el mismo resultado en varias pantallas. No quitar guardado/recovery ni teclado/accesibilidad. |
| Robustez/exportación | 19 / 46 | 6–8 / 15–25 | Mantener fallos conocidos, seguridad, CSV, no-JS y persistencia; revisar cada duplicado contra tests unitarios antes de borrar. |

Esta fase requiere mapear solapamientos test por test antes de borrar archivos;
los objetivos son una guía cuantificada, no una cuota que justifique perder un
contrato único por cumplir el número.

1. **Storefront, siguiente bloque:** revisar los 26 casos de
   `catalog-modern-v2.spec.ts` y contrastarlos con `catalog-modern-v2-commerce`,
   `-navigation`, los 57 casos restantes de A27–A30, `visual-break` y tests
   unitarios de módulos. Conservar home/categoría/PDP, variante→carrito→WhatsApp,
   búsqueda/paginación, teclado, reduced motion y un viewport móvil y desktop.
   Retirar medidas repetidas de márgenes, radios, bordes, hover y breakpoints.
2. **Studio, segundo bloque:** cruzar por flujo los 225 casos de dashboard/editor
   y dejar un recorrido por alta, edición de producto/categoría, guardado,
   reapertura, importación de worker y recuperación. Mantener una cobertura
   compartida de teclado y accesibilidad; borrar los casos repetidos por tabs o
   panel si repiten la misma transición.
3. **Auditoría visual: 5 specs y 33 casos.** `visual-break` ya bajó de 53 a 18;
   no recortar más hasta confirmar que los otros cuatro specs no cubren un
   comportamiento funcional único. El objetivo es reemplazar checks de detalle
   visual por inspección manual por viewport, sin retirar accesibilidad.
4. **Mutación:** conservar los contratos que la mutación detecta, pero revisar
   los mutantes uno por uno. Retirar un mutante sólo si otra aserción demuestra
   que detecta el mismo fallo; el número de archivos `mutation-killers` no es
   por sí mismo un objetivo de cobertura.
5. **Stress V8:** mantener fuera del gate frecuente. Si se cambia el límite de
   carga de assets o el serializador, volver a correr manualmente las dos
   fronteras conservadas; no volver a sumarles cientos de assets sin necesidad.

La reducción de E2E debe medirse en casos ejecutados y minutos, no en archivos
borrados. `check:full` y smoke full (109/109) pasaron; los 63 fallos del
snapshot anterior se reejecutaron individualmente o en selecciones focales y
pasaron. No se ejecutó una nueva corrida funcional de los 450 casos.
