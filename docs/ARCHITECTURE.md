# Arquitectura de SolaraCommerce

Este documento explica cómo se relacionan Studio, el dominio, el schema, los
módulos, el exporter y el storefront. La fuente de verdad del contrato comercial
es `packages/project-schema/src/index.ts`; los nombres de los archivos de este
documento son intencionalmente concretos para que una IA pueda saltar directo al
punto de extensión.

## Vista general

```mermaid
flowchart LR
  User[Usuario] --> Studio[apps/studio<br/>React + Vite]
  Studio --> History[HistoryState<br/>undo/redo]
  History --> Core[@solara/core<br/>DomainCommand reducer]
  History --> Schema[@solara/project-schema<br/>Zod StoreProjectV2]
  Studio --> Workers[Web Workers<br/>CSV / imágenes / exportación]
  Workers --> Exporter[@solara/exporter]
  Exporter --> Modules[@solara/modules + module-sdk]
  Exporter --> Runtime[@solara/storefront-runtime]
  Exporter --> Public[HTML/CSS/JS + SEO + mapa de archivos]
  Studio --> Dexie[Dexie / IndexedDB<br/>cache + RecoveryDraft]
  Studio --> LocalAPI[Servidor local Node<br/>127.0.0.1]
  LocalAPI --> Disk[proyectos/<br/>manifest + versiones + sitios]
  Public --> Browser[Hosting estático / navegador]
  Browser --> WhatsApp[Enlace WhatsApp]
  Agent[IA MCP/JSONL stdio] --> AgentControl[@solara/agent-control<br/>planes tipados]
  AgentControl --> Core
  AgentControl --> Schema
  AgentControl --> Exporter
  AgentControl --> AgentState[.solara-runtime/agent<br/>planes + jobs + audit + locks + assets]
  AgentControl --> Disk
```

No existe un backend remoto. El único servidor es el proceso Node local iniciado
por `Abrir SolaraCommerce.cmd`; su API está protegida por una cookie de sesión y
queda limitada a `127.0.0.1`.

El modo agente comparte el mismo servicio de almacenamiento y las mismas
transacciones que Studio. `SolaraCommerce-Agent.cmd` inicia directamente el
agente Node por JSONL o MCP stdio, sin abrir navegador ni puerto HTTP, y sólo
expone operaciones cerradas de `@solara/agent-control`. `plans.create`
  persiste un snapshot y adquiere un lock con TTL; devuelve un diff acotado para
  revisión. `plans.commit` vuelve a leer la versión del disco y delega en la misma
  transacción de `local-project-storage.mjs` que Studio. Planes, jobs, assets,
  auditoría e idempotencias viven en `.solara-runtime/agent/`. El agente no puede
  escribir HTML, JavaScript ni parches genéricos.

## Capas y responsabilidades

### `apps/studio`

`src/main.tsx` monta React y registra el service worker sólo en producción.
`src/App.tsx` decide si trabaja con IndexedDB o con la persistencia administrada
en disco, inicializa fixtures y coordina el dashboard y el editor.

Las vistas principales son:

- `features/Dashboard.tsx`: biblioteca de tiendas, filtros, creación, duplicado,
  archivo, respaldo, apertura del sitio local y cierre del servidor administrado.
- `features/Studio.tsx`: shell del editor, historial, tabs, preview, undo/redo,
  guardado y advertencia de salida.
- `features/GuidedOverview.tsx`: checklist `Preparar` de la plantilla Catalog
  Modern.
- `features/Overview.tsx`: identidad, contacto, WhatsApp y textos editables.
- `features/Catalog.tsx` y `features/catalog/ProductEditor.tsx`: productos,
  variantes, acciones masivas, CSV y categorías.
- `features/Builder.tsx`: secciones, inspector generado desde metadata y modo
  avanzado.
- `features/ThemeEditor.tsx`, `Assets.tsx`, `Seo.tsx` y `Export.tsx`: tema,
  recursos, auditoría y exportación.
- `features/Preview.tsx`: iframe con el mismo renderer público y transporte de
  assets por `postMessage`. En modo editor consume el manifest Live Canvas,
  escucha Ctrl/Ctrl+clic dentro del iframe y aplica cambios mediante el núcleo
  semántico de mutaciones.

El estado de edición vive en React (`HistoryState`). No hay Redux ni un store
global externo. El historial guarda snapshots completos validados, por lo que una
operación de dominio debe ser determinista y reversible.

### `packages/project-schema`

Define schemas Zod, tipos inferidos, primitivas branded, validación de referencias,
jerarquía de categorías y migración. El proyecto persistido siempre es
`schemaVersion: 2`. `StoreProjectV1Schema` es un alias de compatibilidad usado por
paquetes que conservan el nombre histórico.

También contiene:

- `fixture.ts`: `referenceStore`, fixture pequeño de Casa Luma;
- `scale-fixture.ts`: `catalogScaleStore`, 50 productos, 9 raíces, 15 categorías
  y 60 variantes;
- `catalog-modern-fixture.ts`: `catalogModernStore`, fixture visual legacy para
  regresión con 50 productos, 14 categorías y 60 variantes; no se siembra como
  una tienda adicional;
- `catalog-modern-v2-fixture.ts`: `catalogModernV2Store`, clon determinista
  aislado para evolucionar la familia V2 sin mutar proyectos V1;
- `catalog-modern-template.ts`: fábrica `clean`/`demo`;
- `catalog-modern-guidance.ts`: requisitos de contenido y checklist;
- `catalog-modern-upgrade.ts`: plan de actualización de plantilla sin sobrescribir
  settings del usuario.

### `packages/core`

Es el dominio sin navegador. `reduceProject` aplica `DomainCommand`, recalcula
índices derivados de categorías/colecciones y valida el snapshot completo. Incluye
ajustes monetarios con enteros y `bigint`, importación/exportación CSV técnica y
comercial, y `HistoryState` para undo/redo.

### `packages/module-sdk` y `packages/modules`

`module-sdk` define `ModuleDefinition`, slots, metadata del inspector, escape de
HTML, URLs seguras, assets, rich text sanitizado y helpers de imagen/video.
`modules` registra las definiciones legacy y Catalog Modern. El registry valida
compatibilidad de slot, crea defaults y conserva sólo settings declarados como
compatibles al reemplazar un módulo.

### `packages/exporter`

Es el renderer público y el origen de todos los artefactos exportados. El flujo
principal es:

```text
StoreProjectV2
  -> parseProject
  -> buildCommerceSnapshot
  -> optimizeProject / auditProject
  -> createPublicExportManifest
  -> buildPages
  -> renderDocument + renderSections
  -> buildFiles
```

`buildPages` genera home, categorías paginadas, colecciones, productos, búsqueda,
contacto, nosotros, carrito, compra y políticas. `buildFiles` produce el mapa de
archivos del sitio (CSS, runtime, assets, `robots.txt`, sitemaps, JSON-LD,
Merchant y contexto público para agentes); cada exportación de producción
incluye `ai-context.json`, `llms.txt` y `llms-full.txt`. Studio lo envía al
servidor local, que escribe la carpeta `sitios/<versión>/`. Production bloquea
errores críticos; draft mantiene `noindex` y permite revisar sin publicar esos
archivos de contexto.

`renderPreviewHtml` usa las mismas páginas y módulos con un transporte especial de
assets para el iframe. No debe crearse un renderer alternativo dentro de Studio.
El modo editor agrega bindings sólo al HTML del preview: un bridge con sesión,
nonce de un solo uso, `event.source` y manifest limita la selección. Los valores
confirmados vuelven a `applyMutation`, por lo que el DOM del iframe nunca es la
fuente de persistencia. El exportador público omite esos atributos.
Cada sitio guarda `rendererFingerprint` en su metadata. Un cambio de CSS, módulo o
renderer no muta proyectos: se aplica con `rollouts.preview/commit` de tipo
`site-rebuild`, que reconstruye sitios no protegidos, conserva el proyecto y
mantiene el sitio anterior para rollback.

### Protección, clones y rollouts

`packages/project-schema/src/project-policy.ts` es la política central de origen
y mutabilidad. Studio, `@solara/agent-control` y el storage local rechazan toda
escritura normal sobre la plantilla. `cloneProjectFromTemplate` crea snapshots
independientes y remapea referencias internas.

Los upgrades de la plantilla y las migraciones persistidas son flujos separados:
primero generan diff, luego exigen la versión base y confirmación, crean backup y
publican de forma atómica. `rollouts` persiste previews, jobs, locks cooperativos,
resultados por tienda y auditoría en `.solara-runtime/agent/rollouts`. Una tienda
conflictiva o fallida no detiene las demás; rollback exige que no haya cambiado la
versión esperada.

### `packages/storefront-runtime`

El archivo exportado contiene una cadena de JavaScript y otra de CSS generadas a
partir de este paquete. `storefrontBoot` detecta capabilities en el documento y
activa sólo lo necesario: carrito, variantes, galería, búsqueda, filtros, menú,
hero/video y motion. El carrito usa `localStorage` con clave
`solara-cart:{storeId}` y reconcilia datos contra `catalog-index.json`.

En páginas grandes el atributo de copy del runtime se reduce a los grupos que
esa ruta necesita, para evitar repetir todo el copy público en cada HTML.

### `packages/site-optimizer`

Es una auditoría pura y determinista. No modifica el proyecto. Calcula hallazgos,
score, rutas, cobertura de contenido, media, Merchant y contexto IA. El exporter
usa ese mismo snapshot para no producir divergencias entre HTML, JSON-LD, feed y
archivos para agentes.

## Ciclo de vida de una tienda

```mermaid
sequenceDiagram
  participant D as Dashboard
  participant S as Studio
  participant I as IndexedDB
  participant L as Local API
  participant W as Workers
  participant E as Exporter
  participant F as Filesystem

  D->>S: Abrir o crear tienda
  S->>L: Consultar sesión y proyectos (si launcher administrado)
  alt disco administrado disponible
    L->>F: Leer manifest y actual/*.solara.json
    F-->>S: Snapshot validado
    S->>I: Cachear snapshot y detectar RecoveryDraft
  else desarrollo/manual
    S->>I: Leer proyecto local
  end
  S->>S: Editar HistoryState
  S->>I: Guardar RecoveryDraft con debounce
  S->>W: Crear respaldo y exportar sitio
  W->>E: Validar y renderizar snapshot
  E-->>W: Mapa de archivos, auditoría y reportes
  W-->>S: Bytes verificados
  S->>L: Abrir transacción y subir streams
  L->>F: Staging, mapa de archivos, versiones y manifest atómico
  F-->>S: Recibo de commit
```

### Creación

`createProject` llama a `buildCatalogModernProject({ seed: "clean" })`, asigna un
ID/slug y embebe los assets de plantilla como data URLs para que la tienda nueva
sea autocontenida. No copia productos, categorías ni colecciones de la demo.

### Migración al disco

Cuando se usa el servidor administrado, `App` lee primero `proyectos/`. Los IDs que
sólo existen en IndexedDB se migran como primera versión; si un mismo ID difiere,
la versión de disco gana y la versión del navegador se guarda como
`RecoveryDraft`. La migración conserva los registros de IndexedDB porque allí aún
pueden existir borradores o caché.

### Guardado

`ManagedPersistenceControls` distingue cambios confirmados de borradores. El flujo
no informa “Guardado” hasta recibir el recibo del servidor. Si production falla,
se confirma el respaldo `.solara.json` y el manifest queda `site-outdated`, sin
reemplazar el último sitio válido.

## Persistencia

En modo administrado, la estructura es:

```text
proyectos/<slug-inicial>--<id-corto>/
├── manifest.json
├── recovery.json             (sidecar de diagnóstico, sólo si hay error)
├── actual/<version>.solara.json
├── respaldos/<version>.solara.json
├── respaldos-manuales/
└── sitios/<version>/index.html ...
```

`manifest.json` es el puntero autoritativo. El servidor usa staging bajo
`.solara-runtime/storage`, hashes SHA-256, límites de tamaño/archivos del mapa
del sitio, validación de rutas relativas y rename atómico del manifest. Conserva
como máximo cinco históricos automáticos en `respaldos/` por tienda, podándolos
después del commit y al iniciar el servidor; la versión actual y los respaldos
manuales quedan fuera de esa política. El sitio se escribe desde un mapa de
archivos JSON sin descompresión, por lo que no existe superficie Zip Slip. El
almacenamiento expone además:

- `writeGuard` (sólo tests): simula fallos deterministas de escritura
  (disco lleno, permisos, reintento) sobre las ops `write-upload`,
  `write-site-files`, `rename-site`, `copy-archive`, `write-manifest` y
  `remove-old-current`; el handler nunca lo inyecta.
- matriz de reparse points: `assertNoReparsePoints` rechaza junctions/symlinks
  dentro de `proyectos/`, fijada por `reparse-points.test.mjs`.
- sidecar `recovery.json` por carpeta: persiste el diagnóstico de un manifest
  dañado entre reinicios y se elimina cuando la carpeta vuelve a estar sana.
- `POST /__solara/storage/projects/{projectId}/open-folder`: devuelve la
  carpeta de la tienda; el handler la abre en Explorer en Windows y en otras
  plataformas sólo confirma la ruta.
- sentinel de migración a disco: la tabla `migrations` de Dexie registra
  `pending`/`done` por proyecto para retomar migraciones interrumpidas.

La explicación de endpoints está en
[`docs/INTEGRATIONS.md`](INTEGRATIONS.md); recovery y rollback, en
[`docs/backup-and-recovery.md`](backup-and-recovery.md).

## Decisiones arquitectónicas

- Monolito modular pequeño, sin orquestador adicional.
- Schema como fuente única de tipos, validación, persistencia y exportación.
- HTML Light DOM y mejora progresiva en lugar de depender de JavaScript para SEO.
- Módulos precompilados; el navegador no compila código del usuario.
- Regeneración determinista completa antes de introducir caché incremental.
- Workers para CSV, imágenes y exportación pesada.
- Chromium en el bucle local; release separado para la matriz completa.

Las decisiones históricas están en [`architecture-decisions.md`](architecture-decisions.md).

## Puntos de extensión futuros

- Añadir migraciones explícitas después de `schemaVersion: 2`.
- Revisar los límites del mapa de archivos del sitio si una exportación deja de
  caber cómodamente en memoria.
- Añadir sincronización remota sólo como una capa nueva, sin convertirla en
  requisito del storefront.
- Incorporar nuevos módulos mediante el SDK y no mediante HTML arbitrario.
- Separar componentes grandes de Studio sólo con tests de comportamiento y sin
  cambiar el contrato público.
