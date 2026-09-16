# APIs e integraciones

SolaraCommerce es una aplicación local-first. No hay API remota obligatoria,
autenticación de usuarios, webhooks ni pagos online en v1. Las integraciones
que siguen son locales o están incluidas en el sitio exportado.

## Servidor local gestionado

`Abrir SolaraCommerce.cmd` y el tray opcional `Abrir SolaraCommerce.exe` inician
`packages/exporter/scripts/serve.mjs` en `127.0.0.1`. El proceso sirve Studio,
archivos estáticos y la API de persistencia en disco. Cada servidor gestionado
tiene un `sessionId` propio y registra su estado efímero en
`.solara-runtime/instances/<sessionId>.json`. La cookie `solara_shutdown` es
`HttpOnly`; el servidor verifica origen, método y token de sesión. El servidor no
se expone a la red y no forma parte del sitio público.

El tray consulta esos registros, pero valida cada candidato contra
`GET /__solara/session` y exige que el `sessionId` coincida exactamente antes de
mostrarlo o intentar cerrarlo. El PID guardado es informativo: nunca se mata un
proceso sólo porque aparezca en un JSON. El cierre usa el endpoint autenticado
existente y no agrega una API administrativa general.

### Sesión y estado

| Método | Ruta | Uso | Respuesta esperada |
| --- | --- | --- | --- |
| GET | `/__solara/session` | Detectar servidor gestionado | `managed: true` + `sessionId` exacto |
| GET | `/__solara/storage/status` | Comprobar permisos y rutas | `managed`, `writable`, raíces |
| GET | `/__solara/storage/projects` | Listar tiendas desde manifests | Resúmenes sin datos comerciales completos |
| GET | `/__solara/storage/projects/{projectId}/current` | Leer el archivo actual | Proyecto validable + versión |

`{projectId}` se valida contra IDs del proyecto. El servidor nunca acepta una
ruta de filesystem enviada por el navegador.

### Guardado en disco

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/__solara/storage/saves` | Abrir transacción con `expectedVersion` |
| PUT | `/__solara/storage/saves/{transactionId}/project` | Subir el respaldo `.solara.json` editable |
| PUT | `/__solara/storage/saves/{transactionId}/site` | Subir el mapa JSON del sitio |
| POST | `/__solara/storage/saves/{transactionId}/commit` | Validar y publicar versión |
| POST | `/__solara/storage/saves/{transactionId}/abort` | Cancelar y limpiar staging |

El respaldo editable se sube con `Content-Type: application/vnd.solara.project+json`
(envelope `{ format, version, projectId, exportedAt, project }`) y el sitio como
mapa JSON `Array<{ path, encoding, data }>` con `application/json`. Ambos se
transmiten como streams con SHA-256 en `X-Solara-SHA256`; el servidor vuelve a
calcularlo. Un conflicto de versión responde `409`; Studio no hace merge
automático. Un fallo de exportación puede confirmar el proyecto editable y
conservar el último sitio público válido.

### Semántica del `sha256` (contrato EX-B7)

El `X-Solara-SHA256` y los hashes del manifest (`current.sha256` del proyecto y
del sitio) son el **SHA-256 hexadecimal de los bytes exactos del archivo
subido o persistido, sin transformación alguna**: sin normalización de
saltos de línea, sin re-serialización JSON y sin cambios de encoding. El
servidor lo recalcula sobre el stream entrante y sobre los bytes leídos del
disco al validar (verificación de `list()` y `readCurrent`). Consecuencias:

- un mismo contenido serializado de dos formas distintas produce hashes
  distintos (el hash identifica la serialización concreta, no el contenido
  lógico);
- el hash se invalida ante cualquier cambio de formato de persistencia
  (p.ej. whitespace del JSON, orden de claves, encoding de base64 en el mapa
  del sitio), por lo que un cambio de formato exige recalcular y re-guardar
  los manifiestos, nunca comparar contra hashes históricos;
- los clientes deben enviar el hash del payload que realmente envían (los
  tests de `request-handler` verifican la comparación byte a byte).

### Migración única desde `.solara.zip`

En el arranque, el servidor ejecuta una sola vez
`packages/exporter/scripts/legacy-zip-migration.mjs`: convierte las tiendas con
manifest V1 (respaldo `.solara.zip`) al formato `.solara.json` y registra el
estado en `.solara-runtime/migration.json` (idempotente). El módulo y `fflate`
son temporales y se eliminan en un release posterior.

### Operaciones auxiliares

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/__solara/storage/projects/{projectId}/manual-backup` | Copiar la versión actual a respaldos manuales |
| POST | `/__solara/storage/projects/{projectId}/open-site` | Levantar un servidor estático temporal |
| POST | `/__solara/storage/projects/{projectId}/open-folder` | Abrir la carpeta de la tienda en Explorer (Windows); en otras plataformas confirma la ruta sin abrirla (`200 { ok, folder }`, `404` si no existe) |
| POST | `/__solara/shutdown` | Cerrar el proceso local tras confirmar el token |

El servidor de sitio temporal sólo expone la carpeta pública seleccionada. Las
rutas permanecen separadas del editor. `open-folder` sólo devuelve la carpeta
que el propio servidor administra; nunca acepta una ruta enviada por el
navegador.

Para cerrar desde el tray se envía `POST /__solara/shutdown` con la cookie
`solara_shutdown=<token>` del registro y `Origin`/`Referer` de la misma URL
loopback. Si la autenticación o el cierre fallan, la sesión se conserva como
activa y el tray no intenta terminar el PID por fuera de este contrato.

## Persistencia del navegador

`apps/studio/src/lib/repository.ts` encapsula Dexie. Guarda proyectos, caché de
assets y `RecoveryDraft`; no se comunica con servicios externos. En ausencia del
servidor gestionado funciona como fallback para desarrollo y recuperación.

## Exportación estática

`@solara/exporter` convierte un snapshot validado en HTML, CSS, runtime,
assets, JSON-LD, sitemaps, Merchant y contexto público para agentes. Toda
exportación de producción incluye `ai-context.json`, `llms.txt` y
`llms-full.txt`; el borrador no publica esos archivos. Todas las rutas son
archivos estáticos. No requiere endpoints del sitio en producción.

### Integraciones del storefront

- **WhatsApp:** `buildWhatsAppUrl` arma un enlace `https://wa.me/...` con un
  mensaje escapado. Requiere un número configurado; si falta, la compra muestra
  un error accionable. WhatsApp reemplaza al pago online en v1.
- **Google Merchant:** `google-merchant.xml` se genera localmente desde el
  mismo snapshot que HTML y JSON-LD. No se usa la Merchant API.
- **RSS:** `feed.xml` se genera en producción desde el mismo snapshot y contiene
  todos los productos activos. El HTML indexable publica su autodetección; no
  reemplaza `google-merchant.xml`.
- **Search Console:** el export incluye tokens opcionales y `sitemap.xml`; la
  verificación y envío se hacen manualmente en el dominio publicado.
- **Hosting estático:** `_headers` contiene sugerencias compatibles con hosts
  estáticos. El usuario copia la carpeta `sitios/<versión>/` a su proveedor.
- **Bóveda de recuperación:** cuando Studio la genera, publica
  `solara-recovery/<64 hex>/manifest.json`, `slim.json.gz` y `assets.json`.
  `_headers` aplica `Access-Control-Allow-Origin: *` sólo a esa ruta, junto con
  `noindex` y `Cache-Control: max-age=0`; el resto del sitio no queda habilitado
  para CORS. La recuperación valida SHA-256 localmente y no llama a ningún
  servicio externo.

## Variables y dependencias externas

No hay claves, OAuth, webhooks ni servicios SaaS en runtime. `pnpm`, Node,
Playwright y los navegadores de tests son dependencias de desarrollo. Ver
[`README.md`](../README.md) para las variables locales permitidas y
[`docs/backup-and-recovery.md`](backup-and-recovery.md) para recuperación.

## Manejo de errores

- `400`: payload o parámetros inválidos.
- `401/403`: sesión, origen o token no válidos.
- `404`: tienda, transacción o recurso inexistente.
- `409`: versión de disco obsoleta o transacción concurrente.
- `413`: límites de respaldo, mapa de archivos o escritura superados.
- `500`: error de filesystem, permisos o exportación; la versión confirmada
  anterior debe permanecer intacta.

Para reemplazar el servidor local hay que conservar el contrato de
`manifest.json` (`format: "solara-local-project"`, `manifestVersion: 2` con
`current.projectPath`), los hashes, el bloqueo por tienda y el commit atómico.
No se debe conectar el storefront directamente a estas rutas.

## Canal nativo para agentes

`SolaraCommerce-Agent.cmd` inicia directamente `scripts/agent-cli.mjs` con Node
24. Por defecto usa JSONL protocol-only y con `--mcp` usa MCP stdio. El proceso
no abre Studio ni expone HTTP. El agente resuelve su raíz con `local-layout.mjs`
y comparte `proyectos/`, transacciones y locks con Studio. En modo MCP ofrece
`initialize`, `tools/list` y `tools/call` por stdio.

El protocolo v1 está documentado en [`AI_AGENT_GUIDE.md`](AI_AGENT_GUIDE.md) y
[`agent-protocol-v1.schema.json`](agent-protocol-v1.schema.json). El control usa
planes tipados, `StoreProjectV2`, `@solara/core`, `@solara/exporter` y el storage
local transaccional. Las tiendas de demo (`origin.seed` distinto de `clean`)
son de sólo lectura; las tiendas existentes requieren `storeId` y
`baseVersion`. Los planes sobreviven al reinicio, devuelven diff y advertencias,
mantienen locks cooperativos con Studio y registran jobs, idempotencia y
auditoría en `.solara-runtime/agent/`. Los assets pasan por staging con MIME,
firma, tamaño, hash y dimensiones; los archivos grandes también se pueden subir
por chunks ordenados o usar `agent-inbox/` dentro de la raíz local.

## Cloudflare Pages (publicación manual)

La app no configura Wrangler, Functions ni credenciales. Exportá una carpeta hija
nueva y subí únicamente esa carpeta a Pages. Los previews son públicos por
defecto: desactivalos o protegélos con Access y eliminá manualmente las versiones
anteriores. Después del despliegue usá el verificador de URL de Exportar; un
fallo de CORS o headers queda como “no verificado” y muestra comandos `curl.exe`.
