# Respaldo y recuperación

## Autoridad según cómo se inicia

Cuando se abre con `Abrir SolaraCommerce.cmd`, la autoridad persistente es la
carpeta `proyectos/` en la raíz del repositorio. Cada tienda tiene un
`manifest.json`, una versión editable `.solara.json`, respaldos y sitios públicos
versionados. IndexedDB conserva sólo caché y `RecoveryDraft` para cambios aún no
confirmados con Guardar.

Si se ejecuta Vite directamente con `corepack pnpm dev`, no hay servidor de
archivos gestionado: Dexie es el almacenamiento local de desarrollo. En ambos
casos conviene descargar una copia fuera del dispositivo; el navegador no es un
backup remoto.

## Estructura de disco gestionada

```text
proyectos/<slug--id>/
├── manifest.json
├── actual/<slug-fecha-vNNNNNN>.solara.json
├── respaldos/
├── respaldos-manuales/
└── sitios/<slug-fecha-vNNNNNN>/
```

`manifest.json` es el puntero autoritativo: hashes, versión y estado deben
coincidir. El guardado usa staging, bloqueo por tienda y rename atómico; una
interrupción no debe reemplazar el manifest anterior. `respaldos/` conserva como
máximo los cinco históricos automáticos más recientes por tienda; la poda se
ejecuta después de un commit exitoso y también al iniciar el servidor. La
versión actual y `respaldos-manuales/` no forman parte de esa poda.

La carpeta protegida `store-modo-sur-demo` se puede leer, previsualizar, exportar
y clonar, pero no guardar, archivar, importar ni borrar. El storage devuelve
`PROTECTED_STORE` incluso si se intenta crear esa ID desde cero. Sólo un upgrade
de plantilla autorizado puede escribirla, y siempre conserva el backup previo.

Los rollouts generan backup por tienda antes de una migración de proyecto. Un
`site-rebuild` sólo cambia el sitio público y registra el fingerprint del
renderer; un `project-migration` cambia proyecto y sitio. Ambos guardan el
resultado individual y el sitio/proyecto anterior para rollback condicionado a
la versión esperada.

Si una operación necesita reemplazar el árbol `proyectos/` completo o una parte
de él fuera del guardado normal, aplicar además el contrato de
[`DATA_STORAGE_SAFETY.md`](DATA_STORAGE_SAFETY.md): staging separado, hashes,
swap transaccional y rollback retenido hasta la verificación posterior.

## Qué se debe respaldar

Desde `Exportar`, descargar periódicamente `{tienda}.solara.json`; contiene el
proyecto editable y es distinto del sitio público. `Respaldo ahora` copia la
versión actual a `respaldos-manuales/` sin cambiar su número.

Crear un respaldo antes de:

- actualizar el schema o la aplicación;
- importar un CSV grande;
- ejecutar una edición masiva;
- reemplazar muchas imágenes;
- limpiar datos del navegador.

Guardar al menos una copia fuera del dispositivo.

## Recuperación normal desde disco

1. Abrir la aplicación con `Abrir SolaraCommerce.cmd`.
2. Seleccionar la tienda; Studio lee siempre el `current` indicado por el
   manifest y vuelve a validar el `.solara.json` y su SHA-256.
3. Si hay un `RecoveryDraft` más nuevo, elegir recuperar, descartar o
   exportarlo antes de descartarlo.
4. Editar y pulsar `Guardar` para crear una versión nueva y un sitio público.

## Recuperación normal desde un respaldo

1. Abrir una tienda o crear una vacía.
2. Ir a `Exportar`.
3. Elegir `Importar respaldo`.
4. Seleccionar el archivo `.solara.json`.
5. Verificar nombre, productos, secciones e imágenes antes de continuar.
6. Generar un nuevo respaldo para confirmar el ciclo completo.

La importación valida el envelope (`format: "solara-project"`, versión 2) y el
schema antes de reemplazar el proyecto abierto. La carpeta pública `sitios/` no
puede importarse como proyecto editable. Si el ID ya existe en disco, se
requiere una acción explícita y se crea una nueva versión; no se sobreescribe
silenciosamente el historial.

## Recuperación desde un sitio publicado

Cada exportación generada por Studio incluye, cuando se habilita la recuperación,
una bóveda privada en `solara-recovery/<64 hex>/`:

```text
solara-recovery/<64 hex>/
├── manifest.json
├── slim.json.gz
└── assets.json
```

La bóveda tiene un límite total de 2 MiB. `slim.json.gz` contiene el proyecto
validado sin duplicar imágenes ni videos: las fuentes publicadas se reemplazan
por `solara-ref:<assetId>`. `assets.json` lista la ruta pública y el SHA-256 de
cada recurso publicado; los recursos remotos se conservan como URL y los no
publicados se informan en `missing` junto con sus rutas `usedBy`.

Para recuperar, ir a `Exportar` y pegar la URL completa de
`solara-recovery/<64 hex>/manifest.json`, o seleccionar la carpeta del sitio
exportado. Studio descarga o lee los tres archivos, valida el schema, tamaños,
rutas y hashes, descarga los assets publicados del mismo sitio y recién después
ofrece reemplazar el proyecto actual. No se recuperan recursos que nunca fueron
publicados.

La bóveda se excluye de `sitemap.xml`, `robots.txt` la desindexa y `_headers`
la limita a `noindex`, sin caché y CORS de lectura. No se debe publicar la URL de
la bóveda como secreto de acceso: contiene datos del proyecto, aunque no duplica
los bytes de media.

## Archivo corrupto o incompatible

No sobrescribir el último respaldo válido. Conservar el archivo rechazado y
registrar el mensaje exacto. Probar primero una copia anterior en un perfil de
navegador separado. Si la versión del proyecto es posterior a la soportada,
actualizar Studio antes de reintentar; no editar el JSON interno a mano.

Cuando Studio detecta un registro incompatible al iniciar, lo muestra en el
dashboard bajo “proyectos que requieren recuperación” sin bloquear las tiendas
válidas. Usá `Importar respaldo` en esa advertencia para seleccionar un
`.solara.json`; la importación reemplaza el registro sólo después de validar el
envelope, el manifest y `StoreProjectV2`. Conservá siempre el archivo original y
confirmá que productos, secciones y recursos estén presentes después de abrirlo.

Si una exportación production falla al guardar, el `.solara.json` editable se
confirma igualmente con estado `site-outdated`; `lastValidSite` permanece
intacto. Corregí los errores críticos y guardá otra versión antes de publicar.

Si otra pestaña guardó primero, el servicio devuelve `409 Conflict`. No hay
merge automático: recargá el disco, conservá el borrador o duplicá la tienda.

## Cuota local

Imágenes y variantes responsive consumen la mayor parte del almacenamiento. Si
el navegador informa falta de cuota, exportar el respaldo, eliminar recursos no
usados desde la tienda y reintentar. No limpiar IndexedDB ni los datos del sitio
hasta haber comprobado que el `.solara.json` puede volver a importarse.
