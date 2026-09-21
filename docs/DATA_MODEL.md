# Modelo de datos

Este documento describe el contrato que circula entre Studio, el dominio y el
exporter. La fuente de verdad ejecutable es
[`packages/project-schema/src/index.ts`](../packages/project-schema/src/index.ts):
este texto orienta a una persona, pero no reemplaza a Zod.

## Versionado y validación

El proyecto comercial actual es `StoreProjectV2` y contiene
`schemaVersion: 2`. `StoreProjectV1` es un alias histórico que se mantiene para
compatibilidad de nombres internos. `parseProject` valida el objeto completo y
`migrateProject` sólo acepta la versión 2; no se debe cambiar el literal sin
crear primero una migración y sus pruebas.

El dinero siempre es un entero en centavos (`Money`). Los IDs son strings
brandeados (`StoreId`, `ProductId`, `VariantId`, `CategoryId`, `CollectionId`,
`AssetId`) para evitar mezclar entidades por accidente.

## Forma general

```text
StoreProjectV2
├── schemaVersion, id, baseUrl
├── identity, seo, theme
├── navigation, siteShell, pages, commerceTemplates
├── products, categories, collections
├── assets.images, assets.videos
└── policies, whatsapp, delivery, metadata de origen
```

Las secciones de páginas (`StoreSection`) guardan `moduleId`, `slot`, `settings`
y, cuando corresponde, movimiento declarado. El contenido persistido sólo
contiene configuración; el HTML lo genera el registro de módulos.

El contrato Live Canvas no se persiste dentro de `StoreProjectV2`: cada módulo
declara `canvasBindings` en código y el exporter genera un manifest temporal del
preview. Los atributos `data-canvas-*` sólo aparecen con `editor: enabled` y
no forman parte de exportaciones draft o production. Los repeaters que se
seleccionan en canvas usan el `id` estable del ítem y se actualizan con
`section.repeater.item.update`, nunca por índice.

### Origen, plantilla y mutabilidad

`origin` conserva la procedencia de una tienda sin cambiar `schemaVersion`:

```json
{
  "templateId": "catalog-modern",
  "templateVersion": 1,
  "seed": "duplicate",
  "role": "store",
  "updatePolicy": "managed"
}
```

`store-modo-sur-demo` es la plantilla visible y protegida. Su `role` es
`base-template`, su política es `pinned` y sólo puede escribirse mediante
`templates.commitUpgrade`, con `baseVersion`, backup, auditoría y confirmación.
Su revisión de contenido es independiente de `schemaVersion`: la fixture actual
usa revisión 3, 33 productos activos, 6 categorías raíz, 0 colecciones y 5
placeholders rasterizados y optimizados con WebP/fallback/derivados responsive.
Las tiendas creadas desde Studio y el agente clonan
esa misma fuente, nacen con `seed: "duplicate"`, `role: "store"` y
`updatePolicy: "managed"`; el auditor conserva los placeholders como bloqueos
hasta que se reemplacen. Un `store.create` genérico puede usar `seed:
"duplicate"` cuando clona una fuente existente. Los proyectos antiguos con una
semilla distinta de `clean` siguen protegidos durante la compatibilidad.

Un clon regenera IDs de productos, variantes, categorías, colecciones y assets;
remapea todas sus referencias y copia los bytes, por lo que dos tiendas no
comparten estado mutable. Los IDs de secciones se conservan como anclas de
plantilla para upgrades tipados.

## Entidades principales

### Identidad, SEO y tema

- `baseUrl` es un campo del proyecto (no vive dentro de `seo`) y define la URL
  canónica de la tienda publicada.
- `identity`: nombre de marca, descripción, logo y datos de contacto.
- `seo`: título, descripción, `faviconAssetId`, imagen social (`socialImageId`)
  y verificaciones de Search Console y Merchant. El favicon se guarda como un
  asset ICO multirresolución y la imagen social se normaliza a 1200×630 al
  cargarla desde Studio. No tiene `robots` ni URL base: esas decisiones
  pertenecen al proyecto y a las rutas exportadas.
- `theme`: tokens de color, tipografía, espaciado, radios y modo visual. El
  color `theme.colors.accentAlt` es opcional para compatibilidad con respaldos
  antiguos; el exporter deriva un valor desde acento y fondo cuando falta.
  `theme.background` es opcional y no rompe persistencia: `{ imageAssetId,
  repeat, size, opacity }` pinta una imagen sobre el color de fondo (el
  exporter la incluye en el uso de medios y emite `background-image` en el CSS;
  `opacity` va de 0 a 1 y permite hacer el patrón más sutil; sin token no se
  emite nada). Studio lo expone como una opción del editor de Tema, pero no lo
  asigna a tiendas nuevas. `size` solo admite caracteres seguros de
  `background-size`.
  `theme.shadows.text` es opcional y guarda `{ enabled, opacity, offsetX,
  offsetY, offsetTop, offsetRight, offsetBottom, offsetLeft, blur }`: aplica
  una sombra configurable sólo al texto del hero de Inicio en mobile (hasta 767
  px). `offsetX` y `offsetY` aceptan píxeles enteros entre -48 y 48 para
  respaldos anteriores; los cuatro offsets direccionales aceptan entre 0 y 48
  px, `blur` entre 0 y 48, y `opacity` entre 0 y 1. Cuando existen offsets
  direccionales, se emite una sombra independiente por cada dirección con valor
  mayor a cero. El color se deriva automáticamente de la paleta, el botón queda
  excluido y los defaults mantienen la compatibilidad con proyectos anteriores.
  Studio expone todos estos controles en el editor de Tema.
- `navigation`: etiqueta de catálogo, enlaces curados y sus hijos (máximo un
  nivel adicional), además de búsqueda y carrito.
- `siteShell`: configuración de announcement, header, footer y drawer de carrito.
- `pages`: páginas editables `home`, `about` y `contact`.
- `commerceTemplates`: configuración para categorías, búsqueda, producto,
  carrito y compra; son templates generados desde datos, no HTML arbitrario.

### Producto y variante

Un `Product` contiene título, slug, marca opcional, descripción, tags,
`categoryIds`, `collectionIds`, imágenes, videos opcionales (`videoIds`,
default `[]`, máx 3, referencia `assets.videos`), estado y un array de
`Variant`.
Cada variante tiene un ID, SKU opcional, `optionValues`, precio entero en
centavos, precio comparativo opcional, disponibilidad e imagen opcional.

La galería de producto renderiza imágenes primero y videos después;
`<video controls preload="none" playsinline poster width height>`, sin
autoplay. Ultra-light: ≤2 MB hard, ~1 MB ideal, ≤720p (540p si dura >8 s),
≤10 s recomendado. Los videos nunca cuentan como imagen requerida para
activar (protege Merchant/SEO/no-JS).

Los CSV técnicos y comerciales incluyen las referencias de video (`video_ids`
o `videos`). Al importar un CSV anterior sin esa columna se usa `[]`.

El precio de una tarjeta o página nunca se toma de un carrito almacenado: se
resuelve de nuevo desde el snapshot validado. Las líneas del carrito son una
proyección temporal y no una fuente comercial.

### Categoría y colección

Una `Category` tiene `id`, `title`, `slug`, descripción, `parentId` opcional,
imagen y `productIds`. `productIds` es un índice derivado: las asignaciones
editables están en los productos y el dominio lo recalcula. Las categorías
permiten una raíz y un nivel de hijos; los helpers
`getCategoryAncestors`, `getCategoryDescendants`, `getCategoryProductIds` y
`getCategoryBreadcrumb` centralizan la jerarquía.

Una `Collection` es una agrupación editorial de productos con `productIds`,
slug, descripción e imagen. No debe confundirse con una categoría: las
colecciones no forman árbol.

### Assets

`MediaAsset` es discriminado por `kind`: las imágenes guardan MIME, ancho,
alto, alt, variantes responsive y datos binarios; los videos guardan MIME,
duración, dimensiones y poster. El asset se referencia por ID y se deduplica
por hash durante la exportación. Los data URLs se aceptan para fixtures y
persistencia local; el sitio exportado los materializa como archivos normales.

### Carrito y pedido por WhatsApp

`whatsapp.phone` puede quedar vacío en una tienda nueva; sólo se persiste como
dígitos internacionales cuando el usuario lo configura. Sin número, el
runtime no inventa un destinatario y muestra un error accionable al iniciar el
checkout.

El runtime usa `solara-cart:{storeId}` en `localStorage`. Una `CartLine` guarda
IDs, títulos, variante, SKU, cantidad, precio resuelto e imagen. Al leerla se
eliminan JSON inválido, cantidades fuera de rango, productos ausentes y precios
obsoletos.

`CustomerDetails` vive sólo durante el flujo de compra. `buildWhatsAppMessage`
genera un texto determinista con cliente, líneas y subtotal; no se guardan
datos personales en IndexedDB ni en el proyecto exportado.

## Ejemplo no sensible

```json
{
  "schemaVersion": 2,
  "id": "store-demo",
  "identity": {
    "brandName": "Tienda de ejemplo",
    "description": "Objetos seleccionados para todos los días."
  },
  "products": [{
    "id": "prod-001",
    "title": "Remera esencial",
    "slug": "remera-esencial",
    "categoryIds": ["cat-remeras"],
    "variants": [{
      "id": "variant-001",
      "title": "Única",
      "price": 285000,
      "available": true
    }]
  }],
  "categories": [{
    "id": "cat-remeras",
    "title": "Remeras",
    "slug": "remeras",
    "productIds": ["prod-001"]
  }]
}
```

En un objeto real los nombres siguen los schemas y los IDs son válidos; el
fragmento sólo muestra las relaciones esenciales.

## Persistencia y migraciones

- En modo Vite sin servidor gestionado, Dexie (`SolaraDatabase`) conserva
  proyectos y borradores de recuperación en IndexedDB.
- Con `Abrir SolaraCommerce.cmd`, `proyectos/` en disco es la autoridad. Cada
  tienda tiene `manifest.json` (`manifestVersion: 2`), el `.solara.json` actual
  en `actual/`, respaldos en `respaldos/` y `respaldos-manuales/`, y los sitios
  públicos versionados en `sitios/`. IndexedDB queda como recovery draft y
  caché.
- `RecoveryDraft` registra `projectId`, `baseDiskVersion`, `updatedAt` y el
  proyecto pendiente. Al reabrir, Studio compara la base de disco y ofrece
  recuperar, descartar o exportar el borrador.
- `SolaraDatabase` (Dexie) incluye la tabla `migrations`, sentinel por
  proyecto de la migración a disco: `{ projectId, status: "pending" | "done",
  updatedAt }`. Un flujo interrumpido se retoma de forma idempotente al reabrir
  (`markProjectMigration`/`getProjectMigration`).
- El servidor local persiste el diagnóstico de una tienda con manifest dañado
  en el sidecar `recovery.json` de su carpeta
  (`{ format: "solara-local-recovery", folder, message, detectedAt }`). El
  listado devuelve mensajes estables entre llamadas y elimina el sidecar cuando
  la carpeta vuelve a estar sana.
- La importación de un respaldo `.solara.json` exige el envelope
  `{ format: "solara-project", version: 2, projectId, exportedAt, project }` y
  valida `project` contra `StoreProjectV2Schema`.
- No existe conversión automática desde un contrato comercial anterior. Toda
  futura versión debe agregar una migración explícita y pruebas de round-trip.

Las migraciones de datos no son correcciones del renderer. Una migración
registrada declara `migrationId`, `fromVersion`, `toVersion` y `scope`; es
idempotente, compara contra el snapshot anterior de la plantilla, conserva
personalizaciones y produce conflictos cuando no puede decidir con seguridad.

## Formato de transporte `.solara.json`

El respaldo editable que circula entre Studio, el servidor local y el piloto es
un JSON con envelope:

```json
{
  "format": "solara-project",
  "version": 2,
  "projectId": "store-demo",
  "exportedAt": "2026-08-07T10:00:00.000Z",
  "project": { "schemaVersion": 2, "id": "store-demo", "name": "Tienda demo" }
}
```

- `project` es el objeto validado por `StoreProjectV2Schema`; las imágenes se
  conservan como data URLs dentro de `project.assets`, sin carpeta de assets
  separada.
- `createProjectArchive`/`readProjectArchive` (Studio y exporter) validan el
  envelope completo; el servidor local lo guarda como
  `actual/<clave>.solara.json` y lo sirve con
  `Content-Type: application/vnd.solara.project+json`.
- El sitio público no se empaqueta: Studio envía un mapa de archivos JSON
  (`Array<{ path, encoding: "utf8" | "base64", data }>`) y el servidor escribe
  la carpeta `sitios/<versión>/` validando rutas relativas y límites de tamaño
  y cantidad (`writeSiteFiles`).

## Bóveda de recuperación del sitio

La exportación puede incluir `solara-recovery/<64 hex>/` con tres archivos:

- `manifest.json`: `format: "solara-recovery"`, `version: 1`, `projectId`,
  `schemaVersion: 2`, `assetBasePath`, hashes SHA-256, tamaños y `missing`.
- `slim.json.gz`: envelope `solara-project` comprimido; su proyecto reemplaza
  las fuentes `data:` publicadas por `solara-ref:<assetId>`.
- `assets.json`: referencias `{ id, kind, file, mimeType, hash }` de los medios
  publicados. El hash es de los bytes exactos que el sitio sirve.

La bóveda completa no puede superar 2 MiB. Es un índice de recuperación, no un
segundo backup editable: los medios no publicados se omiten y se enumeran en
`missing`. El sitio y Studio deben mantener `splitSlimProject` y
`restoreAssetSources` como el único protocolo de transformación.

## Migración única de respaldos `.solara.zip`

| Formato anterior | Ubicación | Migración | Marca idempotente |
| --- | --- | --- | --- |
| `.solara.zip` con manifest V1 (`current.archivePath`) | `actual/` y `respaldos/` de una tienda | `packages/exporter/scripts/legacy-zip-migration.mjs`, única y server-side | `.solara-runtime/migration.json` (`{ format: "solara-migration", version: 1 }`); si está presente, la migración no vuelve a correr |
| `.solara.json` con manifest V2 (`current.projectPath`) | `actual/` | No requiere migración | — |

La migración convierte el ZIP al envelope JSON con el mismo `projectId`,
conserva el `.solara.zip` original en `respaldos/` y actualiza el manifest a
`manifestVersion: 2` con `current.projectPath`. El módulo y `fflate` son
temporales: se eliminan en un release posterior (ver
[`docs/TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md)).

## Listado público de productos

`publicCopy.productList` reúne los textos de `/listado/`: `title`, `description`,
`search`, `category`, `allCategories`, `product`, `pricesIn` (`{currency}`),
`count` (`{count}`) y `clear`. Zod normaliza tanto el grupo ausente como campos
faltantes en respaldos anteriores; `schemaVersion` sigue en 2.

La página es derivada, siempre disponible en Preview y exportación, independiente
de la búsqueda general. Incluye sólo productos `active`, en el orden del proyecto,
una fila por producto. Usa el menor precio de sus variantes en centavos y muestra
«Desde» sólo si difieren, con la moneda y el formato de fracciones de cada tienda.
Los filtros locales no modifican datos y conservan la pertenencia a categorías
padre. Sin JavaScript se mantienen todas las filas y enlaces al producto.

El enlace pertenece a Explorar en el footer moderno y a la navegación del footer
legacy; respeta la configuración existente de visibilidad del footer. Los sitios
ya exportados se actualizan mediante el rollout nativo `site-rebuild`, no editando
archivos del sitio ni el respaldo `.solara.json`.
Para Predeterminado se utiliza `templates.previewUpgrade`/`templates.commitUpgrade`:
si el contenido ya está vigente, regenera sólo el sitio cuando cambió el renderer,
con respaldo, idempotencia y conservación de la versión editable.

## Qué modificar para extender el modelo

1. Cambiar primero el schema y sus fixtures en `project-schema`.
2. Agregar o actualizar comandos y recalculado en `packages/core`.
3. Actualizar archive, repository, exporter y workers en ese orden.
4. Añadir tests unitarios antes de tocar Studio.
5. Mantener `catalogModernStore`, `catalogScaleStore` y el fixture limpio
   coherentes con el contrato.
6. No escribir propiedades desconocidas desde un módulo: la metadata del SDK
   controla el inspector y Zod controla la validez.
