# Guardianes automáticos de calidad

Este documento describe cada spec que actúa como guardián: qué valida, cómo
ejecutarlo y qué rompería si fallara.

## Guardianes geométricos

Miden el layout real con `getBoundingClientRect()`. No dependen de screenshots.

| Spec | Qué valida | Ejecutar |
| --- | --- | --- |
| `__vision__/alignment.spec.ts` | Tabs del nav con misma X/Y; columnas del builder alineadas; section-row con alto acotado; cards del dashboard consistentes | `pnpm exec playwright test tests/e2e/__vision__/alignment.spec.ts` |
| `__vision__/storefront-alignment.spec.ts` | Cards por grilla con ancho uniforme; módulos centrados; sin overflow en 320px | `pnpm exec playwright test tests/e2e/__vision__/storefront-alignment.spec.ts` |
| `visual-break.spec.ts` | 12 casos en Mobile 390×844, Tablet 1024×900 y Desktop 1440×900, con pocos productos y estados representativos | `pnpm exec playwright test tests/e2e/visual-break.spec.ts` |
| `responsive-breakpoints.spec.ts` | Modo correcto, overflow y rutas críticas en 762/773 y 1194/1205, con capturas cinco píxeles antes/después de cada frontera | `node_modules\\.bin\\playwright.CMD test tests/e2e/responsive-breakpoints.spec.ts --workers=1 --retries=0` |

## Guardianes adversariales

Simulan condiciones hostiles o entradas maliciosas.

| Spec | Qué valida | Ejecutar |
| --- | --- | --- |
| `__bugs__/content-edge-cases.spec.ts` | Textos extremos (RTL, emoji, 5000 chars), precios $0.01/$99999999.99, sin imágenes | `pnpm exec playwright test tests/e2e/__bugs__/content-edge-cases.spec.ts` |
| `__bugs__/navigation-matrix.spec.ts` | Todo link interno responde 200; sin duplicados por trailing slash | `pnpm exec playwright test tests/e2e/__bugs__/navigation-matrix.spec.ts` |
| `packages/storefront-runtime/src/redteam-functional.test.ts` | localStorage bloqueado, catálogo corrupto o desactualizado, imágenes rotas y texto hostil | `corepack pnpm --filter @solara/storefront-runtime test` |
| `__bugs__/forms-adversarial.spec.ts` | Payloads hostiles del checkout no ejecutan ni inyectan HTML; se retiró la repetición de 10k caracteres | `corepack pnpm exec playwright test tests/e2e/__bugs__/forms-adversarial.spec.ts` |
| `packages/exporter/src/seo-audit.test.ts` y `seo-deep.test.ts` | Canonical, JSON-LD, noindex y sitemap comprobados directamente sobre el HTML exportado | `corepack pnpm --filter @solara/exporter test` |

## Guardianes de presupuesto

| Script | Qué valida | Límite |
| --- | --- | --- |
| `check-budgets.mjs` | Studio JS/CSS iniciales | JS ≤720 KiB; CSS ≤135 KiB |
| `check-image-budget.mjs` | PNG en `apps/studio/public/fixtures` | ≤200 KiB por archivo |
| `public-storefront-budget.test.ts` | CSS público genérico, CSS V2 y JS runtime | CSS genérico ≤780 KiB; CSS V2 ≤212 KiB; JS ≤80 KiB |
| `storefront-runtime-budget.test.ts` | Runtime público y CSS exportado comprimido | JS ≤80 KiB; CSS gzip ≤32 KiB |

Los límites exactos son autoridad de los scripts anteriores; este cuadro sólo
resume el contrato vigente para navegación humana.

## Guardian de contrato responsive

`corepack pnpm check:responsive` revisa las condiciones de ancho del renderer,
runtime, module-sdk y exporter. Sólo permite `767/768` y `1199/1200` como
fronteras de layout, que forman exactamente los tres modos Mobile, Tablet y
Desktop. Un cuarto breakpoint de diseño o tuning visual intermedio debe fallar
la revisión; sólo se admiten las excepciones técnicas documentadas en el ledger.
Los umbrales de assets se conservan separados y se validan por paridad de
`<picture>`/preload.

## Guardianes de seguridad

| Spec | Qué valida |
| --- | --- |
| `packages/exporter/src/security-redteam.test.ts` | Path traversal, XSS en settings, CSV formula injection, auth de handler |
| `packages/exporter/src/chaos-storage.test.mjs` | Disco lleno, locks transitorios, staging huérfano |


## Specs de visión (diagnóstico manual)

No son gate. Generan capturas para inspección visual.

| Spec | Captura | Output |
| --- | --- | --- |
| `storefront-deep-vision.spec.ts` | Rutas y viewports declarados por el propio spec + estados interactivos | `testInfo.outputPath("storefront-vision")` dentro del output de Playwright |
| `responsive-breakpoints.spec.ts` | Capturas reales del home en checkpoints y cinco píxeles antes/después de `767/768` y `1199/1200` | `testInfo.outputPath("responsive-breakpoints-vision")` |
| `studio-vision.spec.ts` | Dashboard, tabs del Studio y galería en los viewports declarados por el spec | `test-results/studio-vision/` |
