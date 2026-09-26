# Recorte inicial de la suite E2E — histórico 2026-09-25

> Snapshot histórico del recorte inicial. Las cifras y el inventario de specs
> retenidos corresponden al 25/09; la poda posterior está en
> [`TEST_SUITE_PRUNING_PLAN_2026-09-26.md`](TEST_SUITE_PRUNING_PLAN_2026-09-26.md)
> y el alcance vigente en [`TEST_SUITE_SCOPE_2026-09-26.md`](TEST_SUITE_SCOPE_2026-09-26.md).

## Resultado

- Base funcional del rollback: `2ba4ddf0` (Store-only). El saneamiento de la suite se cerró sobre `2df046f5`, que sólo suma cambios de checks de GitHub.
- Inventario antes del recorte: 161 specs E2E activos.
- Eliminados: 81/161 (50,3%). Conservados: 80/161.
- De los eliminados, 68 eran auditorías manuales (test:e2e:audit) y 13 pertenecían a la suite funcional.
- Suite funcional: 88 -> 75 specs (14,8% menos archivos). La reducción porcentual de archivos no predice el tiempo de ejecución.
- Smoke quick (5) y smoke full (15) permanecen sin cambios. Los 15 specs listados en scripts/e2e-smoke.mjs siguen presentes.
- Validación runtime posterior al recorte: smoke quick 14/14 PASS. Una muestra de 45 tests recuperados de `a3a9bd8a` dio 39 PASS, 1 skipped y 5 fallos; al contrastarlos con la suite actual, tres ya estaban corregidos y los dos restantes eran expectativas obsoletas del test (copy demo antiguo y geometría del workbench).

## Criterio

Se priorizó retirar barridos históricos repetitivos, auditorías manuales/report-only, comprobaciones visuales estrechas y duplicados evidentes. Se preservaron los recorridos de editor, catálogo/producto, carrito/exportación, no-JavaScript, accesibilidad y los 15 specs de cierre. Las cinco auditorías manuales retenidas cubren alineación visual, exportación y límites responsive.

### Specs funcionales retirados y motivo

| Spec | Motivo de retiro |
| --- | --- |
| tests/e2e/about-v2.spec.ts | El contrato de rutas editoriales retiradas y Contacto en Home está cubierto en builder-coverage.spec.ts. |
| tests/e2e/brand-appear.spec.ts | Sólo fija visibilidad de dos medios con presets de carga; los recorridos de catálogo conservan cobertura de render e imágenes. |
| tests/e2e/cart-empty-align.spec.ts | Una aserción geométrica del carrito vacío V1; el recorrido de carrito conserva estados y acciones de mayor valor. |
| tests/e2e/dashboard-viewport-fit.spec.ts | Subconjunto del chequeo de ajuste del dashboard presente en dashboard-gargantua.spec.ts. |
| tests/e2e/focus-app.spec.ts | Duplicaba el chequeo aislado de foco visible que forma parte de editor-a11y.spec.ts. |
| tests/e2e/gravity-cinematic.spec.ts | Barrido GPU/animación sensible al hardware; quedan los recorridos funcionales del dashboard y las verificaciones de movimiento reducido. |
| tests/e2e/scale-demo.spec.ts | Repetía el arranque de Predeterminado y la apertura de Catálogo cubiertos por recorridos de smoke/editor. |
| tests/e2e/shell-editor.spec.ts | Sus dos casos de scroll/reapertura del panel se solapan con ui-shell.spec.ts y editor-shell.spec.ts. |
| tests/e2e/ui-dashboard-v2.spec.ts | El fixture, render del dashboard y ajuste móvil se solapan con otros specs; se acepta perder la aserción separada de persistencia tras recargar para vista de lista y filtro de estado. |
| tests/e2e/ui-shutdown.spec.ts | La parada y el estado terminal se verifican en local-shutdown.spec.ts, que también cubre servidores no administrados. |
| tests/e2e/preview-cart-images.spec.ts | La hidratación y carga de imágenes de líneas del carrito también se comprueba en preview-cart.spec.ts; el transporte parent se cubre en tests del exporter. |
| tests/e2e/__bugs__/content-edge-cases.spec.ts | Caza manual de textos extremos, precios enormes y productos sin imagen; los casos de precio cero/categoría vacía siguen en site-edgecases.spec.ts. |
| tests/e2e/__bugs__/navigation-matrix.spec.ts | Crawl manual de enlaces/rutas; permanecen las verificaciones focales de export, SEO y despliegue en subcarpeta. |

### Límites aceptados

- La cantidad de archivos de la suite funcional cae 14,8%, no 50%; el resto del umbral global se obtiene retirando auditorías que no corrían en el gate funcional normal. No se afirma una reducción de 50% en minutos de desarrollo.
- Se deja de verificar de forma aislada que la vista de lista y el filtro de estado del dashboard persistan tras recargar. Se pueden restaurar esos dos casos si reaparece una regresión de preferencias.
- Se retiran del árbol las mediciones E2E de CPU/LCP y parte de la evidencia visual/perf histórica. Las cifras citadas en TECHNICAL_DEBT.md quedan históricas; repetir benchmarks manualmente antes de recalibrar presupuestos.
- El crawler manual y el stress E2E de contenido dejan de ser regresiones automáticas. Los specs funcionales y de paquete retenidos siguen cubriendo rutas, SEO, render y casos comerciales centrales.
- La suite reducida no está runtime-verificada en esta sesión; un fallo futuro puede requerir ajustar el recorte o restaurar un caso concreto.

## Inventario completo

### Eliminados - auditorías (68)

- tests/e2e/__vision__/real-stores-vision.spec.ts
- tests/e2e/__vision__/store-metrics.spec.ts
- tests/e2e/__vision__/storefront-deep-vision.spec.ts
- tests/e2e/__vision__/studio-vision.spec.ts
- tests/e2e/axe-app.spec.ts
- tests/e2e/axe-site.spec.ts
- tests/e2e/cdp-site.spec.ts
- tests/e2e/editor-perf.spec.ts
- tests/e2e/editor-responsive.spec.ts
- tests/e2e/layout-fit.spec.ts
- tests/e2e/lcp-cold.spec.ts
- tests/e2e/perf-app.spec.ts
- tests/e2e/perf-idle.spec.ts
- tests/e2e/qa-visual-modern.spec.ts
- tests/e2e/qa-visual-sweep.spec.ts
- tests/e2e/quality-forge-visual.spec.ts
- tests/e2e/rm-performance.spec.ts
- tests/e2e/studio-visual.spec.ts
- tests/e2e/theme-preset-visual.spec.ts
- tests/e2e/ui-preparar-pr1.spec.ts
- tests/e2e/ui-preparar-pr2.spec.ts
- tests/e2e/ui-preparar-pr3.spec.ts
- tests/e2e/ui-preparar-pr4.spec.ts
- tests/e2e/ui-preparar-pr5.spec.ts
- tests/e2e/ui-preparar-pr6.spec.ts
- tests/e2e/ui-preparar-pr7.spec.ts
- tests/e2e/ui-preparar-pr8.spec.ts
- tests/e2e/ui-resumen-r1.spec.ts
- tests/e2e/ui-resumen-r2.spec.ts
- tests/e2e/ui-resumen-r3.spec.ts
- tests/e2e/ui-resumen-r4.spec.ts
- tests/e2e/ui-resumen-r5.spec.ts
- tests/e2e/ui-resumen-r6.spec.ts
- tests/e2e/ui-resumen-r7.spec.ts
- tests/e2e/ui-resumen-r8.spec.ts
- tests/e2e/ui-sweep-a01.spec.ts
- tests/e2e/ui-sweep-a02.spec.ts
- tests/e2e/ui-sweep-a03.spec.ts
- tests/e2e/ui-sweep-a04.spec.ts
- tests/e2e/ui-sweep-a05.spec.ts
- tests/e2e/ui-sweep-a06.spec.ts
- tests/e2e/ui-sweep-a07.spec.ts
- tests/e2e/ui-sweep-a08.spec.ts
- tests/e2e/ui-sweep-a09.spec.ts
- tests/e2e/ui-sweep-a10.spec.ts
- tests/e2e/ui-sweep-a11.spec.ts
- tests/e2e/ui-sweep-a12.spec.ts
- tests/e2e/ui-sweep-a14.spec.ts
- tests/e2e/ui-sweep-a15.spec.ts
- tests/e2e/ui-sweep-a16.spec.ts
- tests/e2e/ui-sweep-a17.spec.ts
- tests/e2e/ui-sweep-a18.spec.ts
- tests/e2e/ui-sweep-a19.spec.ts
- tests/e2e/ui-sweep-a20.spec.ts
- tests/e2e/ui-sweep-a21.spec.ts
- tests/e2e/ui-sweep-a22.spec.ts
- tests/e2e/ui-sweep-a23.spec.ts
- tests/e2e/ui-sweep-a24.spec.ts
- tests/e2e/ui-sweep-a25.spec.ts
- tests/e2e/ui-sweep-a26.spec.ts
- tests/e2e/ui-tema-t1.spec.ts
- tests/e2e/ui-tema-t2.spec.ts
- tests/e2e/ui-tema-t3.spec.ts
- tests/e2e/ui-tema-t4.spec.ts
- tests/e2e/ui-tema-t5.spec.ts
- tests/e2e/ui-tema-t6.spec.ts
- tests/e2e/ui-tema-t8.spec.ts
- tests/e2e/ux-audit.spec.ts

### Eliminados - funcionales (13)

- tests/e2e/__bugs__/content-edge-cases.spec.ts
- tests/e2e/__bugs__/navigation-matrix.spec.ts
- tests/e2e/about-v2.spec.ts
- tests/e2e/brand-appear.spec.ts
- tests/e2e/cart-empty-align.spec.ts
- tests/e2e/dashboard-viewport-fit.spec.ts
- tests/e2e/focus-app.spec.ts
- tests/e2e/gravity-cinematic.spec.ts
- tests/e2e/preview-cart-images.spec.ts
- tests/e2e/scale-demo.spec.ts
- tests/e2e/shell-editor.spec.ts
- tests/e2e/ui-dashboard-v2.spec.ts
- tests/e2e/ui-shutdown.spec.ts

### Conservados - funcionales (75)

- tests/e2e/__bugs__/forms-adversarial.spec.ts
- tests/e2e/__bugs__/runtime-draft.spec.ts
- tests/e2e/__bugs__/runtime-failures.spec.ts
- tests/e2e/__bugs__/seo-integrity.spec.ts
- tests/e2e/a11y-comprehensive.spec.ts
- tests/e2e/assets.spec.ts
- tests/e2e/bugfix-audit-failure.spec.ts
- tests/e2e/bugfix-crashes.spec.ts
- tests/e2e/bugfix-csv-dupes.spec.ts
- tests/e2e/bugfix-export.spec.ts
- tests/e2e/builder-coverage.spec.ts
- tests/e2e/cart-drawer-responsive.spec.ts
- tests/e2e/cart-target-size.spec.ts
- tests/e2e/catalog-guided.spec.ts
- tests/e2e/catalog-modern-v2-commerce.spec.ts
- tests/e2e/catalog-modern-v2-navigation.spec.ts
- tests/e2e/catalog-modern-v2-polish.spec.ts
- tests/e2e/catalog-modern-v2.spec.ts
- tests/e2e/catalog-modern.spec.ts
- tests/e2e/catalog-package.spec.ts
- tests/e2e/catalog.spec.ts
- tests/e2e/contact-anchors.spec.ts
- tests/e2e/contact-v2.spec.ts
- tests/e2e/dashboard-actions.spec.ts
- tests/e2e/dashboard-gargantua.spec.ts
- tests/e2e/editor-a11y.spec.ts
- tests/e2e/editor-builder.spec.ts
- tests/e2e/editor-catalog.spec.ts
- tests/e2e/editor-console.spec.ts
- tests/e2e/editor-motion.spec.ts
- tests/e2e/editor-persistence.spec.ts
- tests/e2e/editor-product.spec.ts
- tests/e2e/editor-scroll.spec.ts
- tests/e2e/editor-shell.spec.ts
- tests/e2e/editor-smoke.spec.ts
- tests/e2e/editor-states.spec.ts
- tests/e2e/editor-workbench.spec.ts
- tests/e2e/editor-workers.spec.ts
- tests/e2e/exported-store.spec.ts
- tests/e2e/exporter-sentinel.spec.ts
- tests/e2e/flujo-crear.spec.ts
- tests/e2e/focus-visible.spec.ts
- tests/e2e/interacciones.spec.ts
- tests/e2e/live-canvas-coverage.spec.ts
- tests/e2e/live-canvas.spec.ts
- tests/e2e/local-shutdown.spec.ts
- tests/e2e/local-storage.spec.ts
- tests/e2e/nojs-coverage.spec.ts
- tests/e2e/offline-reload.spec.ts
- tests/e2e/preview-cart.spec.ts
- tests/e2e/preview-navbar.spec.ts
- tests/e2e/product-list.spec.ts
- tests/e2e/product-video.spec.ts
- tests/e2e/release-a11y.spec.ts
- tests/e2e/responsive-breakpoints.spec.ts
- tests/e2e/scale-store.spec.ts
- tests/e2e/search-catalog.spec.ts
- tests/e2e/seo-media.spec.ts
- tests/e2e/site-edgecases.spec.ts
- tests/e2e/storefront-nojs.spec.ts
- tests/e2e/studio-builder.spec.ts
- tests/e2e/subfolder-site.spec.ts
- tests/e2e/ui-assets.spec.ts
- tests/e2e/ui-catalogo.spec.ts
- tests/e2e/ui-categorias.spec.ts
- tests/e2e/ui-guiado.spec.ts
- tests/e2e/ui-matriz-interaccion.spec.ts
- tests/e2e/ui-producto.spec.ts
- tests/e2e/ui-shell.spec.ts
- tests/e2e/ui-sweep-a27.spec.ts
- tests/e2e/ui-sweep-a28.spec.ts
- tests/e2e/ui-sweep-a29.spec.ts
- tests/e2e/ui-sweep-a30.spec.ts
- tests/e2e/ui-tema-seo.spec.ts
- tests/e2e/ui-tema-styles.spec.ts

### Conservados - auditoría manual (5)

- tests/e2e/calculator-visual-audit.spec.ts
- tests/e2e/__vision__/alignment.spec.ts
- tests/e2e/__vision__/storefront-alignment.spec.ts
- tests/e2e/ui-export.spec.ts
- tests/e2e/visual-break.spec.ts
