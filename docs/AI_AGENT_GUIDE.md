# Guía para agentes de IA de SolaraCommerce

Esta guía describe el canal nativo para crear y mantener tiendas sin editar
archivos a mano, sin escribir HTML/JavaScript y sin depender de la interfaz
visual. El agente opera sobre el mismo almacenamiento de la aplicación y sobre el
mismo contrato `StoreProjectV2` que Studio. En la operación normal, la autoridad
comercial está en el `proyectos/` raíz usado por `Abrir SolaraCommerce.cmd`.

## Inicio

El checkout contiene `SolaraCommerce-Agent.cmd`, `proyectos/`, `.solara-runtime/`
y la carpeta opcional `agent-inbox/`. `proyectos/` en la raíz es la única fuente
comercial de verdad. El launcher inicia directamente `scripts/agent-cli.mjs` con
Node; no abre una ventana, no inicia HTTP y reserva `stdout` para el protocolo.

`SolaraCommerce-Agent.cmd` usa JSONL por defecto. Para MCP, ejecutar
`SolaraCommerce-Agent.cmd --mcp`; implementa `initialize`, `ping`, `tools/list`
y `tools/call`. MCP y JSONL exponen las mismas operaciones. Para inspección sin
mutaciones, usar `SolaraCommerce-Agent.cmd --read-only`; también se puede
restringir el proceso con `--scopes=read,audit:read` o
`SOLARA_AGENT_SCOPES`.

## Ciclo obligatorio

1. Llamar `health` y `protocol.describe`.
2. Llamar `stores.list`.
3. Llamar `stores.get` con `include: "summary"`.
4. Para una tienda existente, obtener `include: "catalog"` sólo si hacen falta
   IDs concretos y conservar la `version` recibida.
5. Crear un `plans.create` con operaciones explícitas.
6. Revisar `diff`, `warnings` y `expiresAt` en la respuesta o con `plans.get`.
7. Mantener el lock con `plans.heartbeat` si la revisión tarda.
8. Ejecutar `plans.commit` sólo si el plan coincide con la intención del usuario.
9. Para exportaciones largas, usar `async: true` y consultar `jobs.get` hasta
   `succeeded` o `failed`.
10. Volver a `stores.get` y comprobar versión, conteos y estado; usar
    `audit.list` si hace falta evidencia de la operación.

Crear un plan escribe sólo el registro durable del plan y adquiere un lock
cooperativo con TTL; no modifica la tienda. El commit vuelve a leer la versión,
valida schema e índices, exporta el sitio y publica una transacción atómica
mediante el mismo storage nativo de Studio. Si Studio intenta guardar una
tienda bloqueada por un plan, recibe `AGENT_LOCKED` y conserva su draft.

## JSONL

Cada línea es un objeto JSON:

```json
{"id":1,"method":"health"}
```

Una respuesta exitosa tiene esta forma:

```json
{"protocol":"solara-agent","version":1,"id":1,"ok":true,"result":{"writable":true,"schemaVersion":2}}
```

Una respuesta fallida conserva un código accionable:

```json
{"protocol":"solara-agent","version":1,"id":2,"ok":false,"error":{"code":"VERSION_CONFLICT","message":"La tienda cambió desde la creación del plan; generá uno nuevo."}}
```

No parsear texto humano del proceso. `stdout` es protocol-only.

## Crear una tienda desde Predeterminado

Una tienda nueva debe comenzar con `store.create` y usar explícitamente la
fuente `base-template`. El flujo normal clona Predeterminado y genera IDs,
referencias y assets independientes; no modifica la plantilla.

```json
{
  "id": "crear-1",
  "method": "plans.create",
  "params": {
    "idempotencyKey": "crear-lunaria-2026-01",
    "operations": [
      {"type":"store.create","storeId":"store-lunaria","name":"Lunaria Cerámica","brandName":"Lunaria","slug":"lunaria-ceramica","email":"hola@lunaria.example","phone":"5491122334455","source":{"kind":"base-template","templateId":"catalog-modern"}},
      {"type":"category.create","categoryId":"category-tazas","slug":"tazas","title":"Tazas","description":"Piezas para todos los días."},
      {"type":"product.create","productId":"product-taza-luna","slug":"taza-luna","title":"Taza Luna","description":"Taza esmaltada hecha a mano.","priceCents":185000,"sku":"LUN-TZA-001","categoryIds":["category-tazas"],"tags":["cerámica","hecho a mano"]}
    ]
  }
}
```

El precio siempre es un entero en centavos ARS: `185000` significa `$1.850,00`.
Nunca enviar floats. Luego enviar el `planId` devuelto:

```json
{"id":"commit-1","method":"plans.commit","params":{"planId":"PLAN_ID_DEVUELTO","idempotencyKey":"crear-lunaria-2026-01"}}
```

Comportamiento de `store.create` con `source base-template`: el clon hereda la
plantilla vigente en disco con IDs regenerados, pero **no hereda los datos de
contacto de ejemplo**: `identity.email` e `identity.phone` nacen vacíos salvo
que la operación los provea, y un `phone` provisto configura también
`whatsapp.phone` (la marca sobrescribe `identity.brandName`, `legalName` y el
greeting de WhatsApp). La plantilla actual aporta 33 productos placeholder en
6 categorías, con 5 assets genéricos y sin colecciones; se heredan con IDs
nuevos. Los planes lo advierten en `warnings` y readiness marca sus textos como
placeholder; reemplazalos antes de considerar la tienda lista.

Si la tienda recién creada todavía no puede exportarse a producción por falta
de contenido, el respaldo editable se conserva y la respuesta indica
`site-outdated`, `exportWarning` y la auditoría de draft. No fabricar datos para
ocultar esa advertencia.

La respuesta de `plans.create` contiene un diff acotado por IDs y grupos
(`products.created`, `products.updated`, `categories`, `assets`, etc.). El
snapshot completo sólo se puede pedir explícitamente con `plans.get` y
`includeProject: true`; no enviar catálogos completos a la IA por defecto.

La respuesta incluye también `blockingIssues`: los errores críticos que la
auditoría del exporter detecta sobre el proyecto planificado (por ejemplo, un
producto sin imagen). Revisarlos antes de commitear evita ciclos de
plan→commit→error→replan; el commit no se bloquea automáticamente porque
algunos errores pueden resolverse en otro plan posterior.

El origen técnico `{"kind":"clean"}` existe para fixtures o migraciones
controladas, pero no es la opción normal de Studio ni del canal nativo.

## Tienda existente y protección

Las tiendas existentes requieren `storeId` y `baseVersion`:

```json
{"method":"plans.create","params":{"storeId":"store-lunaria","baseVersion":3,"operations":[{"type":"store.updateIdentity","changes":{"description":"Objetos cerámicos para rituales cotidianos."}},{"type":"product.setStatus","productId":"product-taza-luna","status":"active"}]}}
```

Predeterminado tiene `origin.role: "base-template"` y `updatePolicy: "pinned"`.
Se puede leer, previsualizar, exportar, auditar y clonar, pero intentar editar,
guardar, importar, archivar o borrar devuelve `PROTECTED_STORE`. Los proyectos
antiguos cuyo origen no era `clean` siguen protegidos por compatibilidad. Para
trabajar sobre una referencia, crear otra tienda y mantener intacto el proyecto
original.

## Operaciones permitidas

El conjunto es cerrado: `store.create`, `store.updateIdentity`,
`store.updateSeo`, `store.updatePage`, `store.updateWhatsapp`, `store.updateNavigation`,
`store.updatePublicCopy`, `store.updatePolicies`, `store.updateLegalProfile`,
`category.create`, `category.update`, `category.setStatus`, `category.delete`, `collection.create`,
`collection.update`, `product.create`, `product.update`, `products.adjustPrices`,
`products.reorder`, `product.setStatus`,
`product.delete`, `store.archive`, `section.updateSettings`, `asset.attach`,
`asset.remove`, `product.createBatch`, `theme.applyPreset` y
`theme.updateTokens`.

`store.updateWhatsapp` es la vía para configurar el teléfono de pedidos de una
tienda existente (dígitos internacionales sin `+` y `greeting`). El campo
`includeSku` se conserva sólo por compatibilidad con operaciones antiguas y se
ignora.

`store.updateIdentity` también acepta `baseUrl` como URL absoluta de la tienda;
al cambiarla, el siguiente commit regenera canonical, Open Graph, sitemap y
JSON-LD con ese origen público.

`collection.update` acepta `status: "hidden"` para retirar una colección del
sitio público y de sus rutas exportadas sin eliminarla del respaldo; volver a
`active` permite recuperarla.

Sin él, `whatsapp.phone` queda vacío y el sitio se exporta sin enlaces de
WhatsApp. `store.updateNavigation` ajusta el modo, la etiqueta del catálogo y
los items curados; los hrefs internos se validan contra destinos existentes.

Los valores válidos de `product.setStatus` son `active`, `hidden` y
`archived`; no existe un estado `draft`. Para ocultar un producto del sitio
público sin archivarlo, usar `hidden`.

`product.delete` elimina físicamente un producto del respaldo vigente y exige la
confirmación literal `"ELIMINAR_PRODUCTO"`. Sólo acepta productos que ya estén
en estado `archived`; las referencias derivadas de categorías y colecciones se
recalculan durante la operación.

Las operaciones `product.create` y `product.update` aceptan `variants` para
crear o reemplazar el conjunto completo de variantes de una ficha. Cada variante
usa `priceCents`, `compareAtPriceCents`, `available`, `stockStatus` y
`optionValues`; `imageId` permite asociar una foto propia a la variante. Cuando
se envía `imageId`, ese asset debe existir y también estar incluido en la
galería `imageIds` del producto. El reemplazo conserva los IDs de las variantes
existentes por posición y genera IDs nuevos sólo para las variantes agregadas.

```json
{
  "type": "product.update",
  "productId": "producto-sabanas",
  "changes": {
    "imageIds": ["asset-sabanas-01", "asset-sabanas-02"],
    "variants": [
      {
        "title": "Diseño 01",
        "sku": "PAO-SAB-D01-V01",
        "priceCents": 4499900,
        "optionValues": { "Diseño": "Diseño 01" },
        "imageId": "asset-sabanas-01"
      }
    ]
  }
}
```

Esta extensión es deliberadamente tipada: no habilita parches arbitrarios ni
edición directa del respaldo, y valida la correspondencia entre la imagen de la
variante y la galería antes de crear o commitear el plan.

`category.delete` elimina físicamente una categoría y exige la confirmación
literal `"ELIMINAR_CATEGORIA"`. Sólo acepta categorías `hidden`, sin productos
asignados y sin subcategorías; el diff del plan informa su id en
`categories.removed` antes del commit.

### Archivar y restaurar tiendas

`store.archive` es una operación de plan que marca la tienda como
`archived`: deja de aparecer en el dashboard como activa, conserva el
respaldo completo en disco y puede restaurarse con el método
`stores.restore`. Requiere confirmación literal `"ARCHIVAR_TIENDA"`:

```json
{"method":"plans.create","params":{"storeId":"store-lunaria","baseVersion":3,"operations":[{"type":"store.archive","confirmation":"ARCHIVAR_TIENDA"}]}}
```

Después de commitear el plan, restaurar con:

```json
{"id":40,"method":"stores.restore","params":{"storeId":"store-lunaria"}}
```

La plantilla protegida Predeterminado no se puede archivar ni restaurar por
este canal. Los planes activos sobre una tienda archivada deben descartarse o
expirar antes de llamar `stores.restore`.

No existen `project.patch`, `file.write`, `html.inject`, `javascript.inject`,
`eval` ni comandos shell. El renderer y la salida pública siguen perteneciendo
a la aplicación.

### Personalizar secciones

`section.updateSettings` permite modificar parcialmente los settings de una
sección existente (por ejemplo, cambiar la imagen de portada del hero):

```json
{"type":"section.updateSettings","sectionId":"modo-section-hero","settings":{"posterAssetId":"ASSET_ID"}}
```

El merge de settings es superficial: los settings no incluidos conservan su
valor. Los IDs válidos dependen del template; usar `plans.get` con
`includeProject: true` para inspeccionarlos antes de commitear.

`store.updatePage` permite actualizar el título visible y los metadatos SEO de
una página editable existente. Requiere el `pageId` y sólo acepta los campos
tipados del contrato:

```json
{"type":"store.updatePage","pageId":"page-home","changes":{"title":"Tu mirada, tu estilo","seoTitle":"Stylo Lashes | Pestañas DIY para crear tu estilo","seoDescription":"Descubrí pestañas DIY, kits y estilos para realzar tu mirada desde casa."}}
```

Para controlar la sombra del texto del hero mobile, usar `theme.updateTokens`.
El color se deriva de la paleta y no se envía como un valor CSS arbitrario:

```json
{"type":"theme.updateTokens","tokens":{"shadows":{"text":{"enabled":true,"opacity":0.65}}}}
```

### Creación atómica con plans.createAndCommit

Para flujos transaccionales donde el agente ya validó el contenido y quiere
evitar tres invocaciones separadas (staging + plan + commit), usar
`plans.createAndCommit`. Acepta los mismos parámetros que `plans.create` y
devuelve directamente el receipt del commit:

```json
{"method":"plans.createAndCommit","params":{"idempotencyKey":"crear-tienda-v1","operations":[...]}},
```

Si el `idempotencyKey` ya fue commiteado, devuelve el receipt existente sin
crear una nueva versión.

### Generación de placeholders de imagen

Nueva operación `assets.generatePlaceholder` que genera un PNG sólido
determinístico a partir de un seed, sin depender de archivos externos:

```json
{"method":"assets.generatePlaceholder","params":{"name":"hero.png","alt":"Portada","seed":"talleres-del-sur"}}
```

Colores derivados de SHA-256 del seed. Dimensiones fijas en 128×128 px.

### Creación batch de productos

`product.createBatch` permite crear hasta 100 productos que comparten categoría,
imágenes y tags en una sola operación, reduciendo el payload ~70%:

```json
{"type":"product.createBatch","categoryId":"cat-001","imageIds":["ASSET_ID"],"tags":["artesanal"],"skuPrefix":"TSUR","basePriceCents":350000,"priceStepCents":22000,"items":[{"title":"Chal Inca","description":"Tejido ancestral."},{"title":"Poncho Sagrado","description":"Pieza ceremonial."}]}
```

## Imágenes

Para imágenes pequeñas, usar `assets.stage` con base64 y MIME:

```json
{"method":"assets.stage","params":{"name":"taza-luna.png","alt":"Taza Luna de cerámica azul","mimeType":"image/png","source":{"kind":"base64","data":"iVBORw0KGgo..."}}}
```

Para archivos grandes, copiar la imagen a `agent-inbox/` dentro de la raíz local
del checkout y enviar sólo el nombre. Para
integraciones que no pueden escribir esa carpeta,
usar el upload por chunks:

```json
{"method":"assets.stage","params":{"name":"hero.webp","mimeType":"image/webp","source":{"kind":"inbox","filename":"hero.webp"}}}
```

El host valida tamaño, firma binaria, MIME, SHA-256 y dimensiones reales (mínimo 32×32 px) de PNG,
JPEG, WebP, AVIF, GIF o ICO. Las imágenes raster pasan por el mismo pipeline headless que Studio:
WebP/AVIF primario, fallback JPEG/PNG y fuentes responsive; si el procesamiento no es posible, el
staging falla. Staging no modifica una tienda. Para `seo.favicon`, el asset debe ser
un ICO válido; PNG/WebP/GIF no pueden adjuntarse directamente como favicon. La respuesta devuelve
`assetId`; usarlo en el mismo plan:

```json
{"type":"asset.attach","assetId":"ASSET_ID","target":"product","productId":"product-taza-luna"}
```

También existen `identity.logo`, `seo.favicon` y `seo.social`. El staging vive
en `.solara-runtime/agent/assets/` y puede recuperarse si el proceso se reinicia.
El flujo por chunks es:

1. `assets.upload.begin` con nombre, MIME y opcionalmente `expectedBytes`.
2. `assets.upload.chunk` con `uploadId`, `sequence` comenzando en `0` y base64.
3. Repetir hasta terminar, respetando el orden.
4. `assets.upload.finish` con `sha256` opcional para verificar el archivo.
5. Usar el `assetId` devuelto en el mismo `plans.create` con `asset.attach`.

## Errores y reintentos

- `VERSION_CONFLICT`: descartar el plan, leer la nueva versión y crear otro.
- `PROTECTED_STORE`: no insistir; trabajar sobre una tienda nueva.
- `AGENT_LOCKED`: otro plan o proceso está editando la tienda; consultar el
  `expiresAt`, esperar o descartar el plan dueño si corresponde.
- `PERMISSION_DENIED`: el launcher fue iniciado con scopes insuficientes.
- `PLAN_NOT_FOUND`: el plan expiró, fue descartado o ya se consumió; crear otro.
- `JOB_NOT_FOUND` o `AGENT_RESTARTED`: recuperar el plan durable y repetir con
  la misma `idempotencyKey`.
- `ASSET_SIGNATURE_INVALID`, `ASSET_DIMENSIONS_INVALID` o `ASSET_USE_INBOX`:
  corregir el archivo o cambiar el transporte sin desactivar validaciones.
- Usar una `idempotencyKey` estable por intención. Repetir el commit con ella
  devuelve el recibo anterior y no crea otra versión.

La persistencia final conserva envelope `.solara.json`, SHA-256, manifest,
versiones, planes, jobs, auditoría, locks por tienda y rename atómico. El agente nunca escribe
directamente dentro de `proyectos/`, `actual/`, `respaldos/` o `sitios/`.

## Upgrades de plantilla y rollouts

Los upgrades de `Predeterminado` no usan `plans.create` ni `plans.commit`.
Requieren scopes `template:read` y `template:write`, preview, `baseVersion` y
la confirmación literal `ACTUALIZAR_PLANTILLA`:

```json
{"id":10,"method":"templates.get","params":{}}
{"id":11,"method":"templates.previewUpgrade","params":{"baseVersion":1}}
{"id":12,"method":"templates.commitUpgrade","params":{"previewId":"PREVIEW_ID","baseVersion":1,"confirmation":"ACTUALIZAR_PLANTILLA","idempotencyKey":"template-upgrade-2026-08-23"}}
```

El upgrade vigente reemplaza el contenido heredado de `store-modo-sur-demo` por
la fixture neutral de 33 productos, 6 categorías, 0 colecciones y 5 placeholders
rasterizados y optimizados con WebP, fallback separado y fuentes responsive.
Conserva el ID, nombre visible, slug, protección y anchors de
sección; deja habilitados `catalog-cart-drawer`, carrito y checkout. El commit
crea primero un respaldo manual verificable y luego publica proyecto y sitio en
una transacción atómica. Si falla el backup, schema, exportación, escritura o
relectura, la versión anterior queda vigente. Repetirlo sobre la misma fixture
responde `already-current` sin crear otra versión.

No se agregó una herramienta MCP nueva: `templates.previewUpgrade` y
`templates.commitUpgrade` son el contrato oficial existente para esta migración
protegida. El agente no edita `.solara.json` ni `proyectos/` directamente.

Para un bug de CSS o renderer usar `site-rebuild`; no migrar datos. Para un
cambio persistido usar `project-migration` y revisar conflictos por tienda:

```json
{"id":20,"method":"rollouts.preview","params":{"kind":"site-rebuild","target":{"status":"active","excludeProtected":true}}}
{"id":21,"method":"rollouts.commit","params":{"previewId":"ROLLOUT_PREVIEW_ID","async":true,"idempotencyKey":"rebuild-renderer-v2-2026-08-23"}}
{"id":22,"method":"rollouts.get","params":{"rolloutId":"ROLLOUT_PREVIEW_ID"}}
{"id":23,"method":"rollouts.rollback","params":{"rolloutId":"ROLLOUT_PREVIEW_ID","storeId":"store-lunaria","expectedVersion":3}}
```

Los rollouts son jobs durables. Por defecto incluyen tiendas activas no
protegidas, continúan aunque una tienda falle y no sobrescriben una versión que
cambió después del preview: el resultado es `VERSION_CONFLICT`. Cada tienda
queda como `aplicada`, `omitida`, `conflicto` o `fallida`; el rollback es
individual y condicionado a la versión esperada. Consultar `audit.list` para la
evidencia y no repetir una operación sin `idempotencyKey` estable.

## Disciplina de una IA autónoma

Declarar antes de empezar la tienda objetivo, versión base y resultado observable.
Mantener la bitácora `intención → request → respuesta → evidencia posterior →
pendiente`; `audit.list` permite recuperar la bitácora estructurada del proceso.
No inventar productos, precios, imágenes, números de WhatsApp ni
tokens SEO. No copiar el catálogo de Predeterminado para acelerar una tienda.
Un `plans.create` no demuestra persistencia: sólo `plans.commit` seguido de
`stores.get` confirma el cambio.

El contrato formal está en [`agent-protocol-v1.schema.json`](agent-protocol-v1.schema.json).
El runtime se divide en `packages/agent-contracts`, `packages/agent-control`,
`packages/agent-sdk` y `scripts/agent-host.mjs`.
### QA perpetuo

El scope `qa:write` habilita metodos para ejecutar ciclos de calidad
autonoma sobre el sitio exportado:

```json
{"method":"qa.readBacklog"}
{"method":"qa.runGates","params":{"suite":"quick"}}
{"method":"qa.detectFlaky","params":{"testFile":"packages/exporter/src/scale.test.ts","runs":5}}
{"method":"qa.writeTest","params":{"filePath":"packages/exporter/src/qa-nuevo.test.ts","content":"..."}}
{"method":"qa.logProgress","params":{"entry":"P10-1: auditoria completada, 0 criticos"}}
{"method":"qa.updateState","params":{"patch":{"nextItem":"P10-2"}}}
{"method":"qa.runExport","params":{"storeId":"store-modo-sur-demo"}}
```

El ciclo recomendado es: readBacklog -> writeTest (TDD rojo) -> runGates
(confirma fallo) -> [implementar fix] -> runGates (verde) -> runExport
(metricas) -> updateState + logProgress. Si un item falla 3 veces,
marcarlo como bloqueado y saltar al siguiente.
