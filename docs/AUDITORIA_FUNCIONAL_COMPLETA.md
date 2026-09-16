# Auditoría funcional completa de SolaraCommerce

Fecha: 2026-09-07  
Alcance: aplicación Studio, dominio, módulos, renderer/exporter, storefront público, persistencia local, protocolo de agentes, PWA, optimización y tooling de QA.  
Horizontes usados: **corto plazo = 1–2 semanas**; **mediano plazo = 2–8 semanas**.

## 1. Criterio de clasificación

- **Completa**: la función existe y la evidencia ejecutada o los tests actuales permiten considerarla operativa dentro del alcance auditado.
- **Deficiente**: existe, pero tiene una limitación, deuda, desalineación de contrato, riesgo funcional o falta una validación importante.
- **Faltante**: la capacidad esperada no está disponible en la superficie correspondiente.
- **No aplica por diseño**: la ausencia está decidida para esa familia o superficie y no debe abrirse como hallazgo.
- **P0**: riesgo de pérdida/corrupción de datos o bloqueo crítico.
- **P1**: impacto alto en flujo principal, publicación o contrato funcional.
- **P2**: impacto medio, deuda relevante o experiencia incompleta.
- **P3**: mejora menor, consistencia o mantenibilidad.

Una función implementada sólo por presencia estática de código no se considera automáticamente completa. Cuando esta auditoría no ejecutó una validación de navegador/release específica, se indica expresamente.

## 2. Evidencia ejecutada en esta auditoría

- Se realizó una primera pasada de inventario y una segunda pasada específica para encontrar superficies omitidas y contradicciones entre UI, dominio, exporter, persistencia, SDK, documentación y tests.
- Se ejecutó `corepack pnpm check:quick` hasta finalizar. Los 6 gates terminaron correctamente; `check:repository`, `check:hardcoded-content`, `check:image-budget`, typecheck y tests de paquetes completaron.
- Tests observados como aprobados en esa corrida: `agent-contracts` 7, `project-schema` 97, `agent-sdk` 1, `module-sdk` 22, `site-optimizer` 17, `storefront-runtime` 170, `modules` 120, `core` 78, `exporter` 417 aprobados + 1 omitido, `agent-control` 33 y `studio` 417. Total observado: **1379 aprobados y 1 omitido**.
- Se ejecutó una revisión responsive fresca: `editor-responsive.spec.ts` pasó 4/4 cubriendo 390×844, 768×1024, 1024×768, 1366×768, 1440×900, 1920×968 y 1920×1080; `catalog-modern.spec.ts` pasó 6 pruebas y dejó 1 captura visual omitida de forma intencional por requerir `VISUAL_REVIEW_STAGE`. La matriz release completa, `test:e2e:release` y Lighthouse siguen pendientes.
- La remediación de deficientes cerró con `corepack pnpm check:micro` aprobado, `corepack pnpm test:e2e:smoke` 16/16 y `corepack pnpm test:e2e:smoke:full` 163/163. El spec `nojs-coverage` se verificó además 2/2 consecutivas con un único worker después de eliminar una carrera de navegación del propio test.
- `corepack pnpm format:check` quedó sin errores; permanecen warnings no bloqueantes que no cambian el contrato funcional auditado.
- Se preservó el worktree existente. Esta tarea no requiere modificar datos reales de `proyectos/`.

### 2.1 Estado de remediación posterior a la auditoría — 07/09/2026

**Resuelto con evidencia:**

- F-001 / AUD-038 / AUD-100: cierre neutral del diálogo conserva RecoveryDraft; descarte explícito usa segunda confirmación y es la única vía que ejecuta `clearRecoveryDraft`.
- F-002 / AUD-039: `Exportar borrador` descarga una copia `.solara.json` sin cerrar ni borrar el recovery.
- F-004 / AUD-122: `AgentClient` cubre 34/34 métodos públicos y el test compara las llamadas contra `AgentProtocolJsonSchema.methods`.
- AUD-144: Playwright responsive fresco pasó `editor-responsive.spec.ts` 4/4 en 7 viewports; Catalog Modern pasó 6 pruebas y dejó 1 captura omitida por requerir `VISUAL_REVIEW_STAGE`.
- AUD-032 / AUD-034 / AUD-143: se corrigió la deuda que hacía fallar Biome; `format:check` pasa sin errores.
- AUD-065 / AUD-066: header móvil, foco, responsive, hero carousel, autoplay y reduced motion quedaron cubiertos en browser; `smoke:full` cerró 163/163.
- AUD-071 / AUD-130: `whatsapp.includeSku` quedó fuera de UI/export/runtime activo y explícitamente tratado como campo legado tolerado/ignorado por compatibilidad de schema V2.
- AUD-095 / AUD-137: PWA/offline se verificó en Chromium, incluida installability y recarga offline.
- AUD-106: la integración Windows de abrir sitio/carpeta quedó endurecida y cubierta por tests deterministas del request handler.
- Validación focal y global proporcional: `check:micro` pasó completo; `test:e2e:smoke` 16/16; `test:e2e:smoke:full` 163/163; el cheque focal `nojs-coverage` pasó 2/2 consecutivas.

**Pendiente para un cierre release completo:**

1. Reanudar/completar `corepack pnpm check:full`. La ejecución previa llegó hasta `check:runtime-serialization`; el gate aislado luego pasó 4/4 fuera del sandbox.
2. Ejecutar `corepack pnpm test:e2e` funcional completo.
3. Ejecutar `corepack pnpm test:e2e:release` bajo Node 24 con Chromium, Firefox y WebKit según `scripts/release-e2e.mjs`.
4. Ejecutar Lighthouse/LHCI sobre `.release/reference-site` según `docs/release-candidate.md`, incluyendo `/` y `/productos/manta-bruma/`.
5. Sólo después de esos cuatro pasos se puede cambiar AUD-145 de `Faltante` a `Completa` y afirmar cierre release 100%.

## 3. Hallazgos críticos

### F-001 — P0 — RESUELTO — cierre neutral de RecoveryDraft seguro

Se separó la decisión de recuperación en `recover`, `keep` y `discard`. Escape, X, cancel nativo y `Cerrar sin borrar` resuelven como `keep` y conservan el RecoveryDraft; sólo el descarte explícito ejecuta `clearRecoveryDraft`, con una segunda confirmación destructiva.

La regresión queda cubierta por `recoveryDraftDecision.test.ts`: conservar al cerrar, recuperar sin borrar y borrar únicamente ante descarte explícito. `check:micro` volvió a pasar con 420/420 tests de Studio.

**Corto plazo: RESUELTO.** Cierre neutral y descarte destructivo quedaron separados y cubiertos por regresión.  
**Mediano plazo:** pantalla/centro de recuperación con fecha, baseDiskVersion, diferencias resumidas y exportación `.solara.json` antes de cualquier descarte.

### F-002 — P1 — RESUELTO — exportación segura de RecoveryDraft

El diálogo ahora ofrece **Exportar borrador** sin cerrar ni eliminar el recovery. Genera `${draft.slug}-recovery.solara.json` usando el worker de archivo existente y conserva el borrador para decidir después.

**Corto plazo: RESUELTO.** `Exportar borrador` descarga una copia sin borrar el recovery.  
**Mediano plazo:** historial de recovery con varias versiones o snapshots manuales.

### F-003 — P1 — RESUELTO POR DISEÑO — sin páginas independientes de Compra, Nosotros ni Contacto

El contrato público quedó explícito: no se generan páginas independientes de Compra, Nosotros ni Contacto. Contacto existe únicamente como sección de Inicio (`#contact-form` y `contact-channels`); el flujo de carrito, datos del cliente y pedido por WhatsApp continúa sin `/compra/`. La suite dedicada de Nosotros fue retirada.

Los proyectos heredados se normalizan al abrirse: enlaces antiguos de Contacto apuntan a la sección de Inicio y las páginas antiguas de Nosotros/Contacto no forman parte del modelo activo.

**Corto plazo: RESUELTO.** Código, tests y documentación reflejan el contrato actual.  
**Mediano plazo:** mantener una regresión de ausencia de rutas y la normalización de proyectos heredados.

### F-004 — P1 — RESUELTO — paridad completa entre protocolo y `AgentClient`

`packages/agent-sdk/src/index.ts` expone wrappers para los 34 métodos públicos declarados por `AgentProtocolJsonSchema`, incluyendo restauración, upgrades de plantilla, rollouts, `plans.createAndCommit`, placeholder y los 9 métodos `qa.*`.

**Corto plazo: RESUELTO.** El SDK cubre 34/34 métodos públicos.  
**Mediano plazo:** evaluar generación automática del cliente desde el contrato. El test de paridad ya compara el orden completo de wrappers contra `AgentProtocolJsonSchema.methods`.

### F-005 — P2 — RESUELTO POR DISEÑO — tema único

La aplicación usa un único tema editable mediante tokens y presets. El selector `auto/light/dark`, `theme.colorMode` y `darkColors` fueron retirados del contrato activo, del editor y del renderer. La lectura de proyectos heredados descarta esos campos para conservar compatibilidad de apertura sin reintroducir la función.

**Corto plazo: RESUELTO.** No queda una capability parcial de modo de color.  
**Mediano plazo:** mejorar contraste, presets y validación visual dentro del único tema soportado.

### F-006 — P2 — RESUELTO — `format:check` sin errores

Los errores Biome observados originalmente en el editor de productos, su modelo y el helper de optimización de video fueron corregidos. `corepack pnpm format:check` finaliza sin errores; los warnings restantes son no bloqueantes y no representan funciones incompletas.

**Corto plazo: RESUELTO.** Mantener `format:check` sin errores.  
**Mediano plazo:** reducir warnings de manera incremental y volverlos estrictos sólo cuando exista una baseline estable.

### F-007 — P3 — RESUELTO POR CONTRATO — `whatsapp.includeSku` es sólo compatibilidad legado

`StoreProjectV2Schema` sigue tolerando la propiedad para abrir proyectos heredados sin migración destructiva, pero las superficies activas de UI, exporter y runtime no la exponen ni dependen de ella. Las pruebas fijan explícitamente ese comportamiento.

**Corto plazo: RESUELTO.** Mantenerla documentada como legacy/deprecated/ignored y fuera de las superficies activas.  
**Mediano plazo:** retirarla físicamente sólo mediante una migración explícita de schema.

## 4. Matriz maestra de funcionalidades

| ID | Área | Funcionalidad | Estado | Nota /10 | Prioridad | Evidencia | Problema actual | Mejora corta | Mejora mediana |
|---|---|---|---:|---:|---:|---|---|---|---|
| AUD-001 | Inicio | Arranque de Studio y montaje de `App` | Completa | 9 | P3 | typecheck + tests Studio | Sin validación visual fresca | Smoke de arranque administrado/no administrado | Telemetría local de fallos de bootstrap |
| AUD-002 | Inicio | Detección de servidor administrado `/__solara/session` | Completa | 9 | P2 | código + tests de storage/session | Depende del lanzador local | Mensaje de diagnóstico más accionable | Estado de sesión centralizado |
| AUD-003 | Inicio | Fuente de verdad en disco bajo `proyectos/` | Completa | 9 | P1 | storage tests + arquitectura | Riesgo principal queda en recuperación local | Mostrar versión de disco siempre | Visor de historial/versiones |
| AUD-004 | Inicio | Fallback IndexedDB cuando no hay servidor | Completa | 8 | P2 | repository tests | Menor equivalencia con modo administrado | Indicador persistente de modo | Unificar UX de backup/import |
| AUD-005 | Inicio | Tienda `Predeterminado` y plantilla limpia | Completa | 9 | P2 | schema/repository tests | Debe mantenerse protegida | Test de invariantes en cada cambio de template | Versionado visible de plantilla |
| AUD-006 | Dashboard | Listado de tiendas | Completa | 9 | P3 | Studio tests | Sin revisión visual fresca | Smoke de 100+ tiendas | Virtualización si escala mucho |
| AUD-007 | Dashboard | Buscar tiendas | Completa | 9 | P3 | Dashboard implementation/tests | Sin hallazgo funcional | Resaltar match | Búsqueda fuzzy opcional |
| AUD-008 | Dashboard | Filtrar por estado | Completa | 9 | P3 | Dashboard tests | Sin hallazgo funcional | Recordar último filtro | Filtros combinables |
| AUD-009 | Dashboard | Ordenar tiendas | Completa | 9 | P3 | Dashboard tests | Sin hallazgo funcional | Mostrar criterio activo | Orden personalizado persistente |
| AUD-010 | Dashboard | Vista grilla/lista | Completa | 8 | P3 | implementación + tests | Falta validación responsive fresca | Smoke responsive focal | Preferencia sincronizada por usuario local |
| AUD-011 | Dashboard | Selección persistente | Completa | 9 | P3 | Dashboard model/tests | Sin hallazgo funcional | Clear selection visible | Multiacción por selección |
| AUD-012 | Dashboard | Pins/favoritos | Completa | 8 | P3 | implementación | Sin validación visual fresca | Test de persistencia | Secciones fijadas |
| AUD-013 | Dashboard | Comparar exactamente dos tiendas | Completa | 8 | P3 | `compareModel` + tests | Comparación principalmente informativa | Exportar diff | Diff estructural profundo y accionable |
| AUD-014 | Dashboard | Comparar disco/productos/variantes/categorías/colecciones/assets/theme/secciones/motion | Completa | 8 | P3 | `compareModel` | Puede crecer en densidad | Agrupar cambios | Navegar desde diff al editor |
| AUD-015 | Dashboard | Archivar/restaurar tienda desde Studio | Completa | 9 | P2 | tests + persistencia | Acción sensible pero cubierta | Mejor resumen previo | Historial de archivados |
| AUD-016 | Dashboard | Duplicar tienda | Completa | 9 | P2 | repository tests | Debe preservar remapeos | Mostrar nombre destino antes | Clonado selectivo de contenido |
| AUD-017 | Dashboard | Eliminar tienda | Completa | 8 | P1 | implementación storage local | Acción destructiva; depende de confirmaciones UI | Mostrar backup disponible | Papelera con retención temporal |
| AUD-018 | Dashboard | Backup individual | Completa | 9 | P1 | App + storage tests | Distinto flujo según modo | Homogeneizar copy | Centro de backups |
| AUD-019 | Dashboard | Backup de todas las tiendas | Completa | 8 | P1 | Dashboard flow | No se revalidó con dataset real | Test temporal con múltiples fixtures | Backup incremental |
| AUD-020 | Dashboard | Auditoría/health panel | Completa | 8 | P2 | implementación + optimizer | Cobertura visual no revalidada | Exponer origen de cada hallazgo | Acciones de reparación guiadas |
| AUD-021 | Dashboard | Calculadora de tarifa | Completa | 9 | P3 | summary/simulation/config implementation | Sin hallazgo crítico | Tests de límites de tiers | Escenarios guardados |
| AUD-022 | Dashboard | Configuración base, incluidos, tiers, descuento, reset y validación | Completa | 9 | P3 | tests/model | Sin hallazgo crítico | Mostrar fórmula exacta | Historial de configuraciones |
| AUD-023 | Edición | HistoryState undo/redo | Completa | 9 | P2 | core + Studio tests | No cubre recovery destructivo | Indicador de cambios sin guardar | Timeline de acciones |
| AUD-024 | Edición | Mutaciones validadas con Zod | Completa | 10 | P1 | schema/core tests | Sin hallazgo | Mantener parse en fronteras | Contratos generados para plugins |
| AUD-025 | Edición | Identidad de tienda | Completa | 9 | P2 | schema + editor + exporter tests | Sin UI visual fresca | Validación contextual de URL/contacto | Perfiles reutilizables |
| AUD-026 | Edición | Textos públicos `publicCopy` | Completa | 9 | P2 | schema/exporter tests | Superficie muy amplia | Buscar texto por página | Editor de copy con preview contextual |
| AUD-027 | Edición | Perfil legal | Completa | 9 | P1 | schema/exporter SEO/legal tests | Requiere mantenimiento normativo manual | Checklist de campos legales | Profiles legales versionados |
| AUD-028 | Edición | SEO general | Completa | 9 | P1 | exporter/SEO tests | Publicación externa sigue manual | Previsualizar SERP/social | Integraciones de verificación opcionales |
| AUD-029 | Edición | Tema/tokens/presets | Completa | 9 | P2 | theme tests | Tema único por diseño | Auditoría automática de contraste | Presets versionados |
| AUD-031 | Edición | Navegación y site shell | Completa | 9 | P2 | schema/modules/exporter tests | Sin revisión browser fresca | Test de navegación por teclado | Builder visual de navegación |
| AUD-032 | Edición | Editor de productos | Completa | 9 | P2 | Studio tests + `format:check` sin errores | Sin hallazgo funcional actual | Mantener regresiones y formato | Simplificar modelo/editor si sigue creciendo |
| AUD-033 | Edición | Imágenes/assets | Completa | 9 | P1 | workers/exporter tests | Riesgo de peso controlado por budget | Mostrar costo de export por asset | Pipeline de variantes más visible |
| AUD-034 | Edición | Video de producto/hero | Completa | 9 | P2 | tests de video + `format:check` sin errores | Sin hallazgo funcional actual | Mantener diagnostics | Métricas por codec/tamaño |
| AUD-035 | Edición | Categorías y jerarquía | Completa | 9 | P1 | core/schema/exporter tests | Índices derivados requieren dominio | Mantener invariantes visibles | Drag/drop jerárquico con validación |
| AUD-036 | Edición | Colecciones | Completa | 9 | P2 | core/schema/exporter tests | Menor set de comandos que productos | Batch assign en UI | Reglas dinámicas opcionales |
| AUD-037 | Edición | Importación CSV/catalog package | Completa | 8 | P1 | core/workers/tests | No se hizo import E2E fresco | Preview de cambios más explícito | Mapeo reusable de columnas |
| AUD-038 | Edición | RecoveryDraft autosave | Completa | 9 | P0 | repository tests + recovery decision regression + Studio 420/420 | Cierre neutral conserva el borrador; descarte requiere acción explícita | Mantener regresión | Centro de recuperación versionado |
| AUD-039 | Edición | Exportar RecoveryDraft antes de descartar | Completa | 9 | P1 | App + archive worker + recovery decision tests | Exporta `.solara.json` sin cerrar ni borrar el recovery | Mantener smoke del flujo | Historial/recovery manager |
| AUD-040 | Dominio | Crear/editar/eliminar/archivar/restaurar productos | Completa | 9 | P1 | core tests | Sin hallazgo | Mantener tests de invariantes | Operaciones bulk transaccionales más ricas |
| AUD-041 | Dominio | Ajustar precios masivamente | Completa | 9 | P1 | core tests | Dinero correcto en centavos | Preview de delta | Reglas programables offline |
| AUD-042 | Dominio | Asignar categorías/colecciones/tags/status masivamente | Completa | 9 | P1 | core tests | Sin hallazgo | Deshacer con resumen | Selecciones guardadas |
| AUD-043 | Dominio | `products.replaceAll` | Completa | 8 | P1 | core tests | Operación amplia | Confirmación con diff | Import transaccional por chunks |
| AUD-044 | Dominio | `catalog.applyImport` | Completa | 8 | P1 | core/import tests | Requiere cuidado con payloads grandes | Métricas de import | Resume/retry de import |
| AUD-045 | Dominio | CRUD/reparent de categorías | Completa | 9 | P1 | core tests | Sin hallazgo | Validar ciclos en UI antes de enviar | Reorganización masiva |
| AUD-046 | Dominio | Crear/editar colecciones | Completa | 9 | P2 | core tests | No hay delete domain command equivalente listado | Definir si delete es requerido | Completar lifecycle uniforme |
| AUD-048 | Módulos | Catalog Modern (11 módulos) | Completa | 9 | P1 | 120 tests modules + exporter | Sin revisión visual fresca | Visual smoke por módulo | Matriz visual automática |
| AUD-049 | Módulos | Contacto en Home (`contact-form` + `contact-channels`) | Completa | 10 | P1 | modules + exporter tests | Sin página dedicada por diseño | Mantener anclas y WhatsApp cubiertos | Mejoras de UX dentro de la sección Home |
| AUD-051 | Builder | Inspector generado desde metadata de módulos | Completa | 9 | P2 | Builder/module SDK tests | Superficie grande | Añadir búsqueda de settings | Schema-driven editor más uniforme |
| AUD-052 | Builder | Repetidores/settings/defaults | Completa | 9 | P2 | repeater/default tests | Sin hallazgo | Mejor feedback de límites | Presets por módulo |
| AUD-053 | Preview | Renderer compartido Preview↔Export | Completa | 10 | P0 | exporter parity tests | Contrato crítico; mantener | Gate focal obligatorio | Hash/fingerprint visible en Studio |
| AUD-054 | Preview | Bridge de edición con session/nonce/source | Completa | 9 | P1 | architecture/tests | Sin browser security audit fresco | Fuzz de mensajes | Capability manifest firmado localmente |
| AUD-055 | Preview | Assets via postMessage | Completa | 9 | P1 | preview/export tests | Sin stress fresco | Test de asset faltante | Cache de preview medible |
| AUD-056 | Storefront | Carrito local | Completa | 9 | P0 | 170 runtime tests | Persistencia depende de navegador | Mostrar estado reconciliado | Versionar formato de carrito |
| AUD-057 | Storefront | Cantidad, eliminar, foco y subtotal | Completa | 9 | P1 | runtime tests | Sin hallazgo | E2E teclado focal | Announcements ARIA más ricos |
| AUD-058 | Storefront | Variantes/opciones | Completa | 9 | P1 | runtime tests | Sin hallazgo | Test combinatorio acotado | Matriz de opciones más explícita |
| AUD-059 | Storefront | Galería y video | Completa | 8 | P2 | runtime/exporter tests | Sin visual/reduced-motion fresco | Smoke móvil | Lazy media adaptativo |
| AUD-060 | Storefront | Precio/SKU/disponibilidad dinámica | Completa | 9 | P1 | runtime tests | `includeSku` legado no forma parte de la capability activa | Mantener contrato explícito | Evolucionar SKU sólo con una necesidad de producto |
| AUD-061 | Storefront | Tabs/testimonios | Completa | 8 | P3 | runtime/modules tests | Sin visual fresca | Test keyboard | Navegación semántica mejorada |
| AUD-062 | Storefront | Búsqueda | Completa | 9 | P1 | runtime + exporter tests | Depende de `search-index.json` | Estado offline más claro | Ranking/configuración por tienda |
| AUD-063 | Storefront | Filtros, orden y paginación | Completa | 9 | P1 | runtime tests | Sin hallazgo | Persistir query state | URLs compartibles por filtros |
| AUD-064 | Storefront | Dismiss announcement | Completa | 9 | P3 | runtime tests | Sin hallazgo | Expiración opcional | Versionar campañas |
| AUD-065 | Storefront | Header/mobile menu | Completa | 9 | P2 | runtime + `smoke:full` 163/163 | Browser responsive y foco verificados | Mantener E2E mobile/tablet | Visual regression estable |
| AUD-066 | Storefront | Hero slides/video | Completa | 9 | P2 | modules/runtime + autoplay/reduced-motion E2E + `smoke:full` | Carousel y framing mobile verificados | Mantener smoke autoplay/reduced-motion | Presupuesto de media por hero |
| AUD-067 | Storefront | Motion + reduced motion | Completa | 8 | P2 | runtime tests | No se revalidó en browser real | E2E prefers-reduced-motion | Auditoría de motion por módulo |
| AUD-068 | Checkout | Formulario de datos del pedido | Completa | 9 | P0 | exporter/runtime tests | Sin validación manual fresca | E2E de campos inválidos | Persistencia opcional local de datos no sensibles |
| AUD-069 | Checkout | Preparación de pedido WhatsApp | Completa | 9 | P0 | runtime tests | Depende de WhatsApp externo | Mejor fallback copy | Destinos alternativos configurables |
| AUD-070 | Checkout | Multipart/fallback para mensajes largos | Completa | 10 | P1 | tests específicos runtime | Sin hallazgo | Mostrar cantidad de partes | Estrategia de compresión textual |
| AUD-072 | Exporter | Home | Completa | 10 | P0 | exporter tests | Sin hallazgo | Mantener parity | Componentización interna de `buildPages` |
| AUD-073 | Exporter | Categorías paginadas | Completa | 10 | P0 | exporter tests | Sin hallazgo | Test de jerarquías extremas | Separar builder de ruta |
| AUD-074 | Exporter | Colecciones paginadas | Completa | 9 | P1 | exporter tests | Sin hallazgo | Edge cases de colecciones vacías | Builder específico |
| AUD-075 | Exporter | Producto | Completa | 10 | P0 | exporter tests | Sin hallazgo | Mantener no-JS | Builder específico |
| AUD-076 | Exporter | `/buscar/` | Completa | 9 | P1 | runtime/exporter tests | Sin hallazgo | E2E sin query | URLs con estado de filtros |
| AUD-077 | Exporter | `/carrito/` | Completa | 9 | P1 | exporter/runtime tests | En V2 continúa al contacto embebido | Documentar flujo V2 | Configurar estrategia de checkout |
| AUD-081 | Exporter | `/envios/` independiente | No aplica por diseño en V2 | — | — | exporter test V2 + renderer | Ruta deprecated en V2; la información vive en la ficha de producto | No abrir como faltante de Pao/V2 | Mantener sólo compatibilidad V1 |
| AUD-082 | Exporter | `/devoluciones/` independiente | No aplica por diseño en V2 | — | — | exporter test V2 + renderer | Ruta deprecated en V2; la información vive en la ficha de producto | No abrir como faltante de Pao/V2 | Mantener sólo compatibilidad V1 |
| AUD-083 | Exporter | `/privacidad/` | Completa | 9 | P1 | exporter tests | Override/manual legal | Validación de contenido vacío | Plantillas legales versionadas |
| AUD-084 | Exporter | `/terminos/` | Completa | 9 | P1 | exporter tests | Override/manual legal | Validación de contenido vacío | Plantillas legales versionadas |
| AUD-085 | Exporter | `404.html` | Completa | 9 | P2 | exporter tests | Sin hallazgo | Test de enlaces | 404 configurable |
| AUD-086 | Exporter | HTML inicial útil sin JavaScript | Completa | 10 | P0 | parity/no-JS tests | No se hizo browser manual fresco | Smoke no-JS periódico | Gate release automático |
| AUD-087 | Exporter | SEO canonical/robots/JSON-LD | Completa | 10 | P0 | SEO tests | Requiere Search Console manual | Preflight visible | Integración opcional de inspección |
| AUD-088 | Exporter | Sitemap/image sitemap/video sitemap | Completa | 10 | P1 | exporter tests | Sin hallazgo | Validación XML externa en release | Reporte de cobertura por asset |
| AUD-089 | Exporter | Merchant feed | Completa | 9 | P1 | exporter tests | Elegibilidad externa no garantizada | Mostrar advertencias de elegibilidad | Perfil Merchant por tienda |
| AUD-090 | Exporter | `feed.xml` editorial | Completa | 9 | P3 | exporter tests | Sin hallazgo | Validar consumidores RSS | Configuración editorial |
| AUD-091 | Exporter | `ai-context.json`, `llms.txt`, `llms-full.txt` | Completa | 9 | P2 | exporter tests | Sin validación externa de agentes | Inspector local | Versionar contrato IA |
| AUD-092 | Exporter | `_headers`, `_redirects`, `_worker.js` | Completa | 9 | P1 | Cloudflare worker tests | Específico de hosting | Preflight por destino | Adaptadores de hosting |
| AUD-093 | Exporter | `deployment-manifest.json` | Completa | 10 | P1 | exporter/Cloudflare tests | Sin hallazgo | Mostrar revision en UI | Historial de despliegues |
| AUD-094 | Exporter | Favicon, icons, manifest PWA | Completa | 9 | P2 | PWA/exporter tests | Sin browser install fresco | Test de installability | Maskable safe-zone preview |
| AUD-095 | Exporter | Service worker/offline page | Completa | 9 | P2 | PWA tests + E2E offline Chromium + `smoke:full` | Offline verificado en browser | Mantener E2E offline | Estrategia de actualización/versiones |
| AUD-096 | Exporter | Responsive images | Completa | 9 | P1 | exporter tests | Sin visual/network audit fresca | Revisar 390/1024 con network | Art direction configurable |
| AUD-097 | Exporter | Determinismo de export | Completa | 10 | P0 | determinism tests | Sin hallazgo | Mantener fixture grande | Fingerprint por subartefacto |
| AUD-098 | Exporter | Budgets y escala | Completa | 8 | P1 | image budget + scale/export tests | Release/perf completo no ejecutado hoy | Benchmark focal periódico | Presupuestos por tipo de tienda |
| AUD-099 | Exporter | Draft vs production | Completa | 9 | P1 | exporter tests | Publicación real es manual | Copy más claro de bloqueo | Pipeline de publicación opcional |
| AUD-100 | Persistencia | RecoveryDraft en IndexedDB | Completa | 9 | P0 | repository tests + F-001 resuelto + Studio 420/420 | Cierre neutral ya no borra | Mantener regresión | Centro recovery |
| AUD-101 | Persistencia | Guardar versión editable en disco | Completa | 10 | P0 | local storage tests | Flujo crítico | Mostrar hash/version | Verificación incremental |
| AUD-102 | Persistencia | Releer y validar backup tras guardar | Completa | 10 | P0 | storage tests | Sin hallazgo | Mantener gate | Firma local opcional |
| AUD-103 | Persistencia | Versionado y manifest de tienda | Completa | 10 | P0 | storage tests | Sin hallazgo | UI de historial | Retención configurable |
| AUD-104 | Persistencia | Conservar último sitio válido | Completa | 9 | P0 | storage tests | Sin hallazgo | Mostrar rollback disponible | Rollback desde Studio |
| AUD-105 | Persistencia | Manual backup | Completa | 9 | P1 | storage tests | Sin hallazgo | Fecha/nombre más visible | Política de retención |
| AUD-106 | Persistencia | Open site/open folder | Completa | 9 | P3 | endpoints + App + `request-handler.test.mjs` | Integración Windows endurecida y cubierta de forma determinista | Mantener test por plataforma | Abstracción por plataforma |
| AUD-107 | Persistencia | Delete local project | Completa | 8 | P1 | storage endpoint/tests | Acción destructiva | Backup previo sugerido | Papelera transaccional |
| AUD-108 | Persistencia | Transacción save start/project/site/commit/abort | Completa | 10 | P0 | storage tests | Sin hallazgo | Chaos test puntual | Journal transaccional explícito |
| AUD-110 | Persistencia | QA/status de storage | Completa | 9 | P2 | endpoints/tests | Sin hallazgo | Mostrarlo en UI de diagnóstico | Exportar reporte de salud |
| AUD-111 | Agentes | Health/protocol describe | Completa | 10 | P1 | agent-control/contracts tests | Sin hallazgo | Mantener conformance | Version negotiation avanzada |
| AUD-112 | Agentes | Stores list/get/restore | Completa | 9 | P1 | agent-control + SDK parity test | Sin hallazgo | Mantener conformance | Cliente generado |
| AUD-113 | Agentes | Templates get/preview/commit upgrade | Completa | 9 | P1 | host/contracts + SDK parity test | Sin hallazgo | Mantener conformance | Cliente generado |
| AUD-114 | Agentes | Rollouts preview/commit/get/rollback | Completa | 9 | P0 | host/contracts + SDK parity test | Sin hallazgo | Mantener conformance | Cliente generado |
| AUD-115 | Agentes | Plans create/get/commit/discard/heartbeat | Completa | 10 | P0 | agent-control tests | Sin hallazgo host | Mejor UX en CLI | Declarative plan diff |
| AUD-116 | Agentes | `plans.createAndCommit` | Completa | 9 | P1 | host/contracts + SDK parity test | Sin hallazgo | Mantener conformance | Generación automática |
| AUD-118 | Agentes | Audit list | Completa | 9 | P1 | host/SDK | Sin hallazgo | Filtros SDK | Export auditoría |
| AUD-119 | Agentes | Assets stage/upload begin/chunk/finish | Completa | 9 | P1 | host/contracts/SDK | Sin hallazgo | Resume upload | Checksum por chunk |
| AUD-120 | Agentes | Placeholder generation | Completa | 9 | P2 | host/contracts + SDK parity test | Sin hallazgo | Mantener conformance | Providers opcionales |
| AUD-121 | Agentes | QA runExport/runGates/detectFlaky/writeTest/readBacklog/logProgress/updateState/runCycle/status | Completa | 9 | P1 | host/contracts/conformance + SDK parity test | Sin hallazgo | Mantener conformance | SDK generado desde contrato |
| AUD-122 | Agentes | Paridad `AgentClient` ↔ protocolo | Completa | 10 | P1 | test de paridad 34/34 contra `AgentProtocolJsonSchema.methods` | Sin hallazgo | Mantener test como gate | Generar cliente desde contrato |
| AUD-123 | Workers | image.worker | Completa | 9 | P2 | Studio tests | Sin stress fresco | Cancelación/timeout visible | Cola con prioridad |
| AUD-124 | Workers | export.worker | Completa | 9 | P1 | exporter/Studio tests | Export grande merece benchmark periódico | Reportar progreso | Streaming/chunking si escala |
| AUD-125 | Workers | csv.worker | Completa | 9 | P1 | import tests | Sin hallazgo | Mejor error por fila | Parser incremental |
| AUD-126 | Workers | catalog-package.worker | Completa | 8 | P2 | implementation/tests | No se hizo E2E fresco | Smoke de paquete | Import/export incremental |
| AUD-127 | Workers | social-crop helper | Completa | 8 | P2 | media/export tests | Sin UI visual fresca | Preview de crop | Presets por red |
| AUD-128 | Schema | `schemaVersion = 2` y validación global | Completa | 10 | P0 | 97 schema tests | Contrato persistido sensible | Mantener sin cambios implícitos | Migración explícita para V3 |
| AUD-129 | Schema | IDs, nombre, status, locale, currency, money, base URL, timestamps, origin | Completa | 10 | P0 | schema tests | Sin hallazgo | Mantener invariantes | Versionar constraints |
| AUD-130 | Schema | identity/WhatsApp/SEO/theme/navigation/siteShell | Completa | 10 | P2 | schema tests + regresiones de tema único/includeSku legado | Contrato activo alineado; campos heredados sólo se toleran por compatibilidad | Mantener regresiones | Limpiar campos legacy sólo mediante migración futura |
| AUD-131 | Schema | pages/commerceTemplates/policies | Completa | 9 | P1 | schema/exporter tests | Disponibilidad V2 de páginas está dispersa | Capability explícita | Page registry declarativo |
| AUD-132 | Schema | products/categories/collections | Completa | 10 | P0 | schema/core tests | Índices derivados son sensibles | Mantener helpers únicos | Índices calculados fuera de payload futuro |
| AUD-133 | Schema | assets/videos/sections | Completa | 9 | P1 | schema/modules/exporter tests | Sin hallazgo | Herramientas de depuración de refs | Garbage collector seguro de assets |
| AUD-134 | Optimizer | Auditoría SEO/media/Merchant/contexto IA | Completa | 9 | P1 | 17 optimizer tests | Sin verificación externa de buscadores | UI con severidad/solución | Profiles por industria |
| AUD-135 | Cloudflare | Verificación HTTPS/manifest/runtime hashed/fetch/headers | Completa | 9 | P1 | implementation/tests | CORS puede impedir chequeo directo | Mensaje y curl copy mejorados | Verificador multi-hosting |
| AUD-138 | QA | `check:repository` | Completa | 10 | P1 | ejecutado OK en quick | Sin hallazgo | Mantener | Extender sólo con reglas de alto valor |
| AUD-139 | QA | `check:hardcoded-content` | Completa | 10 | P1 | ejecutado OK en quick | Sin hallazgo | Mantener | Detectar copy duplicado por schema |
| AUD-140 | QA | `check:image-budget` | Completa | 10 | P1 | ejecutado OK en quick | Sin hallazgo | Mantener | Budget por clase de asset |
| AUD-141 | QA | Typecheck workspace | Completa | 10 | P0 | ejecutado OK en quick | Sin hallazgo | Mantener | Project refs si escala |
| AUD-142 | QA | Tests de paquetes | Completa | 9 | P0 | 1379 pass, 1 skipped observados | No equivale a E2E/release completo | Mantener suite focal | Reducir tiempos sin perder señal |
| AUD-143 | QA | `format:check` | Completa | 9 | P2 | comando ejecutado sin errores | Persisten warnings no bloqueantes | Mantener cero errores | Reducir warnings con baseline estable |
| AUD-144 | QA | E2E visual/responsive fresco | Completa | 9 | P2 | `editor-responsive.spec.ts` 4/4 en 7 viewports + `catalog-modern.spec.ts` 6 pass/1 skip condicional | Captura visual dedicada requiere `VISUAL_REVIEW_STAGE` | Mantener matriz responsive | Visual regression estable |
| AUD-145 | QA | Matriz release completa Node 24 + browsers/Lighthouse | Faltante | 5 | P1 | Node v24.18.0; `check:quick` OK; `test:e2e:smoke:full` 163/163; runtime serialization 4/4 aislado | Falta completar `check:full`, `test:e2e`, `test:e2e:release` y Lighthouse | Ejecutar cierre release completo | Automatizar nightly/on-demand |

## 5. Inventario exhaustivo y mapeo

Esta sección es el gate de exhaustividad. Cada elemento concreto queda asociado a uno o más IDs de la matriz.

### 5.1 Comandos de dominio `@solara/core`

Mapeados principalmente a AUD-040…AUD-046:

1. `product.create` → AUD-040
2. `product.update` → AUD-040
3. `product.delete` → AUD-040
4. `product.archive` → AUD-040
5. `product.restore` → AUD-040
6. `products.adjustPrices` → AUD-041
7. `products.setCategories` → AUD-042
8. `products.setCollections` → AUD-042
9. `products.addTags` → AUD-042
10. `products.removeTags` → AUD-042
11. `products.setStatus` → AUD-042
12. `products.replaceAll` → AUD-043
13. `catalog.applyImport` → AUD-044
14. `category.create` → AUD-045
15. `category.update` → AUD-045
16. `category.delete` → AUD-045
17. `category.reparent` → AUD-045
18. `collection.create` → AUD-046
19. `collection.update` → AUD-046

El contrato de agentes también permite operaciones de mutación adicionales como `product.createBatch`; se auditan bajo planes/protocolo de agentes y no se confunden con comandos directos del reducer.

### 5.2 Registro completo de módulos — 42 módulos

**Legacy editorial — compatibilidad interna (fuera de matriz funcional)**

1. `announcement-bar`
2. `editorial-header`
3. `hero-media`
4. `split-hero`
5. `editorial-hero`
6. `collection-grid`
7. `editorial-product-grid`
8. `compact-product-grid`
9. `product-detail`
10. `image-text-content`
11. `trust-strip`
12. `cart-drawer`
13. `editorial-footer`

**Catalog Modern — 11 → AUD-048**

1. `catalog-announcement`
2. `catalog-header`
3. `catalog-hero`
4. `catalog-brand-strip`
5. `catalog-product-grid`
6. `catalog-product-detail`
7. `catalog-category-bento`
8. `catalog-testimonials`
9. `catalog-newsletter-cta`
10. `catalog-cart-drawer`
11. `catalog-footer`

**Contacto en Home — decisión de arquitectura de navegación**

1. `contact-form`
2. `contact-channels`

No existe una suite modular ni una página independiente de Nosotros por decisión de producto.

### 5.3 Protocolo público de agentes — 34 métodos

Mapeados a AUD-111…AUD-122:

1. `health`
2. `protocol.describe`
3. `stores.list`
4. `stores.get`
5. `stores.restore`
6. `templates.get`
7. `templates.previewUpgrade`
8. `templates.commitUpgrade`
9. `rollouts.preview`
10. `rollouts.commit`
11. `rollouts.get`
12. `rollouts.rollback`
13. `plans.create`
14. `plans.get`
15. `plans.commit`
16. `plans.createAndCommit`
17. `plans.discard`
18. `plans.heartbeat`
19. `jobs.get`
20. `audit.list`
21. `assets.stage`
22. `assets.generatePlaceholder`
23. `assets.upload.begin`
24. `assets.upload.chunk`
25. `assets.upload.finish`
26. `qa.runExport`
27. `qa.runGates`
28. `qa.detectFlaky`
29. `qa.writeTest`
30. `qa.readBacklog`
31. `qa.logProgress`
32. `qa.updateState`
33. `qa.runCycle`
34. `qa.status`

Nota: la lista declarada contiene 34 nombres concretos en el bloque actual del contrato inspeccionado. El conteo queda normalizado a 34 en esta auditoría.

**Cobertura actual de `AgentClient`:** 34/34 métodos públicos de `AgentProtocolJsonSchema.methods`, verificados por un test de paridad que invoca los wrappers en el orden declarado por el protocolo. Se mantienen además helpers como `createStore` y `waitForJob`. AUD-122 queda cerrado.

### 5.4 Endpoints/operaciones de persistencia local

Mapeados a AUD-002, AUD-101…AUD-110:

- `/__solara/session`
- `/__solara/shutdown`
- `/__solara/storage/status`
- `/__solara/storage/qa-status`
- `/__solara/storage/projects`
- lectura de proyecto/current
- backup manual por proyecto
- abrir sitio
- abrir carpeta
- eliminar proyecto
- retiro/migración de demo legacy
- `save transaction start`
- `save project`
- `save site`
- `save commit`
- `save abort`

### 5.5 Workers y helpers asíncronos

- `image.worker.ts` → AUD-123
- `export.worker.ts` → AUD-124
- `csv.worker.ts` → AUD-125
- `catalog-package.worker.ts` → AUD-126
- social crop helper → AUD-127

### 5.6 Grupos de capability de StoreProjectV2

- `schemaVersion` → AUD-128
- ids/names/status/locale/currency/money → AUD-129
- base URL/timestamps/origin → AUD-129
- `publicCopy` → AUD-026
- `legalProfile` → AUD-027
- `identity` → AUD-025
- WhatsApp → AUD-069/AUD-071/AUD-130
- SEO → AUD-028/AUD-087/AUD-130
- theme → AUD-029/AUD-030/AUD-130
- navigation → AUD-031/AUD-130
- siteShell → AUD-031/AUD-130
- pages → AUD-131
- commerceTemplates → AUD-131
- policies → AUD-027/AUD-131
- products → AUD-132
- categories → AUD-132
- collections → AUD-132
- assets → AUD-133
- videos → AUD-133
- sections → AUD-133

### 5.7 Rutas públicas generadas

- `/` → AUD-072
- `/categorias/<slug>/` + `/pagina/N/` → AUD-073
- `/colecciones/<slug>/` + `/pagina/N/` → AUD-074
- `/productos/<slug>/` → AUD-075
- `/buscar/` cuando search está habilitado → AUD-076
- `/carrito/` cuando cart está habilitado → AUD-077
- El checkout vive dentro del carrito/drawer y termina en WhatsApp, sin ruta independiente → AUD-068/AUD-069/AUD-078
- Contacto se resuelve dentro de Inicio con `/#contact-form` → AUD-049/AUD-080
- `/compra/`, `/nosotros/` y `/contacto/` no se generan por decisión de producto; se documentan como exclusiones intencionales
- `/envios/` y `/devoluciones/` no se generan en `catalog-modern-v2`: sus
  políticas se muestran dentro de cada ficha de producto. En
  `catalog-modern-v1` siguen existiendo únicamente por compatibilidad legacy;
  esta ausencia no es un hallazgo de exportación → AUD-081/AUD-082
- `/privacidad/` → AUD-083
- `/terminos/` → AUD-084
- `/404.html` → AUD-085

### 5.8 Runtime público y subcapacidades

- carrito persistente y reconciliación con `catalog-index.json` → AUD-056
- cantidades/eliminar/foco/subtotales → AUD-057
- variantes/opciones → AUD-058
- galería/video → AUD-059
- precio/SKU/disponibilidad dinámica → AUD-060
- tabs/testimonios → AUD-061
- búsqueda desde `search-index.json` → AUD-062
- filtros/orden/paginación → AUD-063
- dismissal de announcement → AUD-064
- header/menu móvil → AUD-065
- hero slides/video → AUD-066
- motion/reduced motion → AUD-067
- checkout/formulario → AUD-068
- construcción de pedido WhatsApp → AUD-069
- multipart/fallback → AUD-070

### 5.9 Artefactos de exportación

Todos quedan cubiertos por AUD-087…AUD-099:

- `search-index.json`
- `catalog-index.json`
- `robots.txt`
- `sitemap.xml`
- `image-sitemap.xml`
- `video-sitemap.xml`
- `google-merchant.xml`
- `ai-context.json`
- `llms.txt`
- `llms-full.txt`
- `feed.xml`
- `_headers`
- `_worker.js`
- `_redirects`
- `.well-known/security.txt`
- `deployment-manifest.json`
- `manifest.webmanifest`
- `sw.js`
- página offline
- favicon e icons
- archivos de recuperación cuando correspondan
- assets públicos optimizados/copied

## Decisiones de producto fuera de la matriz funcional

Estas entradas no representan capacidades faltantes ni funcionalidades auditables. Se mantienen como documentación de alcance para evitar interpretar decisiones de diseño como deuda:

- Tema único sin selector `auto/light/dark`.
- Contacto integrado dentro de Inicio mediante `/#contact-form`.
- Sin páginas independientes `/nosotros/`, `/contacto/` o `/compra/`.
- Sin páginas independientes `/envios/` o `/devoluciones/` en V2: entrega y
  cambios se muestran dentro de las fichas de producto y sus datos siguen
  siendo configurables. Las rutas independientes sólo se conservan en V1 por
  compatibilidad legacy.
- Checkout basado en carrito/drawer con salida a WhatsApp.

## Compatibilidad, legado e infraestructura interna

Estas áreas se documentan separadas porque existen por soporte técnico, migración o herramientas internas:

- Módulos legacy editoriales y las páginas independientes de envíos/cambios de
  V1 conservados por compatibilidad.
- `catalog-modern-v2` no debe generar, enlazar ni indexar `/envios/` o
  `/devoluciones/`; el test del exporter verifica que no existan sus archivos
  HTML. Privacidad y términos sí permanecen como páginas independientes.
- Campos legacy tolerados por schema como `whatsapp.includeSku`.
- Migraciones antiguas como `.solara.zip`.
- Helpers internos de agentes, diagnósticos y validaciones manuales.

## 6. Priorización P0/P1

### P0

1. **RESUELTO — F-001 / AUD-038 / AUD-100:** Escape/X/cierre neutral conserva RecoveryDraft; sólo el descarte explícito lo elimina.
2. Mantener sin regresión los contratos de persistencia transaccional, schema V2, renderer compartido, carrito y determinismo que hoy aparecen completos.

### P1

1. **RESUELTO — F-002 / AUD-039:** el borrador se puede exportar antes de descartarlo sin eliminar el recovery.
2. **RESUELTO POR DISEÑO — F-003 / AUD-078/AUD-079/AUD-080:** Compra, Nosotros y Contacto no existen como páginas independientes; Contacto queda en Inicio y el checkout interno se conserva.
3. **RESUELTO — F-004 / AUD-122:** `AgentClient` cubre 34/34 métodos y tiene test automático de paridad.
4. **PENDIENTE — AUD-145:** terminar `check:full` y ejecutar `test:e2e`, `test:e2e:release` y Lighthouse bajo Node 24. `test:e2e:smoke:full` ya pasó 163/163.

## 7. Quick wins

1. ~~Separar cierre y descarte de RecoveryDraft.~~ **Resuelto:** decisión `recover/keep/discard` + regresión.
2. ~~Agregar `Exportar borrador` al diálogo.~~ **Resuelto.**
3. ~~Corregir los errores de Biome.~~ **Resuelto:** `format:check` pasa sin errores; queda reducción incremental de warnings.
4. ~~Agregar paridad automática entre protocolo y `AgentClient`.~~ **Resuelto:** test 34/34 contra `AgentProtocolJsonSchema.methods`.
5. ~~Documentar en un único lugar la decisión de rutas V2 y hacer que el test la exprese.~~ **Resuelto por diseño:** no hay Compra/Nosotros/Contacto independientes y tampoco hay Envios/Devoluciones independientes en V2; las políticas se integran en la ficha de producto.
6. ~~Marcar `includeSku` como deprecated/ignored para no prometer comportamiento inexistente.~~ **Resuelto:** sólo se tolera por compatibilidad de schema.
7. ~~Hacer una pasada Playwright responsive fresca.~~ **Resuelto para AUD-144:** 7 viewports en Studio y cobertura responsive de Catalog Modern.

## 8. Deuda aceptada o intencional

- Los módulos `legacy-editorial-v1` se conservan por compatibilidad; no deben recibir features nuevas.
- La migración `.solara.zip` con `fflate` es temporal y de una sola vez.
- La publicación real, DNS, Search Console y Merchant Center siguen siendo tareas manuales externas al runtime.
- El checkout prepara un pedido y abre WhatsApp; no confirma venta, no cobra online y no administra stock remoto.
- `whatsapp.includeSku` se tolera únicamente para compatibilidad de proyectos heredados; permanece fuera de UI, exporter y runtime activo hasta una migración explícita de schema.
- `/envios/` y `/devoluciones/` independientes son rutas deprecated para V2; no deben volver a aparecer como requisito de las tiendas actuales. La compatibilidad V1 se mantiene hasta una migración explícita.

## 9. Roadmap corto — 1 a 2 semanas

1. ~~Corregir RecoveryDraft P0 y agregar exportación previa al descarte.~~ **Resuelto.**
2. ~~Resolver decisión de rutas V2 y alinear navegación/docs/tests.~~ **Resuelto por diseño.**
3. ~~Llevar `format:check` a cero errores.~~ **Resuelto.**
4. ~~Completar paridad de `AgentClient` con protocolo.~~ **Resuelto 34/34.**
5. **Resuelto:** AUD-095, AUD-137 y AUD-144 tienen cobertura browser fresca; la matriz release total sigue separada en AUD-145.
6. Mantener regresiones focales de recovery, tema único y ausencia de rutas retiradas.

## 10. Roadmap mediano — 2 a 8 semanas

1. Centro de Recovery/Backups con historial, diff y export seguro.
2. Registro declarativo de capabilities por template para páginas/rutas/runtime en lugar de condicionales por familia.
3. Cliente de agentes generado desde el protocolo con conformance automático.
4. Auditoría automática de contraste y evolución de presets dentro del único tema soportado.
5. Matriz visual estable por módulos y viewports, más release multi-browser/Lighthouse on-demand.
6. Descomponer gradualmente `buildPages` por builders de ruta sin cambiar el renderer público, priorizando mantenibilidad y tests de paridad.

## 11. Conclusión de auditoría

SolaraCommerce tiene una base funcional amplia y bien cubierta por tests en schema, dominio, módulos, exporter, runtime, persistencia y agentes. La principal debilidad encontrada no es una función ausente general de ecommerce sino un **riesgo real de pérdida de cambios locales en RecoveryDraft**, seguido por desalineaciones de contrato en páginas V2 y paridad del SDK de agentes.

La corrida rápida actual aporta buena evidencia de typecheck/tests y gates estructurales, pero no debe confundirse con cierre release: `format:check` mantiene deuda explícita y faltó una validación visual/browser/release fresca. Esos puntos quedan deliberadamente clasificados como deficientes/faltantes de evidencia en vez de presentarlos como verificados.

