# Contrato no negociable — Landing V2

Estas reglas condensan invariantes del plan maestro. Sólo el usuario puede cambiar el alcance; una fase no las puede relajar para pasar un gate.

1. `StoreProjectV2Schema`, `schemaVersion: 2`, alias V1, fixtures, serialización, Preview, export, runtime, recovery y Predeterminado mantienen su comportamiento. Toda diferencia Store es regresión; nunca se “actualiza” la expectativa para hacer verde Landing.
2. Landing es un dominio propio `LandingProjectV1`; jamás se castea a Store ni inventa catálogo, carrito, checkout, Merchant o campos vacíos.
3. V1 contiene una sola página con secciones modulares/reordenables: Hero 01, Benefits 01, Media 01 y CTA 01. Header/Footer son slots globales; Announcement es opcional. Multipágina, rutas adicionales y más variantes son post-V1.
4. Se comparte `LandingRenderModel`/boundary entre localhost, Preview y export. Los wrappers pueden variar; el renderer de sección es puro y no sabe el host. Reuso Store requiere evidencia por primitive y F0 verde; si no, Landing crea el mínimo propio.
5. No universalizar `App`, `Studio`, `StoreSection`, `ModuleRenderContext`, `exportProject` o `renderPreviewHtml` como requisito de Landing. No crear LandingStudio, segundo Preview, renderer público o runtime JS.
6. El laboratorio de wireframe vive sólo en DEV, corre en el dev server normal y no guarda proyectos reales. Sus bloques usan el modelo real del editor futuro. Hay dos gates explícitos: primero aceptación del bucle local/F5 y dirección inicial, después aceptación del wireframe completo/responsive antes de producción/persistencia. Nunca se infieren.
7. `Store` usa `proyectos/`; Landing administrada usa una raíz hermana `landings/` excluida de Git y listada sólo por su propio handler. No poner Landing en `proyectos/` ni usar datos reales en tests.
8. No cambiar la DB Store. IndexedDB Landing tiene namespace y versión separados; con launcher, disco confirmado es autoridad y el navegador sólo aporta recovery.
9. Antes de F4 se prueban formato/versionado, preservación de secciones desconocidas como dato opaco (nunca ejecutable), límites, export in-memory y downgrade seguro para Store.
10. Guardar proyecto y exportar sitio son operaciones/resultados distintos. CAS rechaza escrituras obsoletas; staging/hash/atomicidad preservan snapshot y último sitio válido. Nunca presentar export fallido como actualizado.
11. Landing V1 exporta sólo HTML/CSS estático sin JavaScript, sin ecommerce y con allowlist exacta. Topes: 25 MiB de assets raster decodificados, 256 KiB de texto visible agregado, 1 MiB por HTML y 32 KiB CSS gzip. Texto/atributos/URLs/CSS/JSON-LD se validan y escapan en su contexto; no aceptar HTML/CSS/JS libre, SVG ni media remota.
12. Una unidad funcional por commit revertible y por paquete de fase. Un solo escritor; paths permitidos explícitos. Descubrimiento de scope nuevo -> STOP y actualizar el plan antes de seguir.
13. PRE-0 exige un checkout/worktree limpio desde un commit base aceptado. No resetear, stash, mover ni sobrescribir trabajo concurrente para lograrlo. No publicar ni tocar `upstream`.
14. Una fase termina únicamente con sus gates reales, F0 cuando corresponda, diff revisado y estado actualizado. Rojo/no corrido = no avanzar. La aceptación visual explícita no se sustituye por tests.
15. Rollback de código nunca borra datos. Desde persistencia, además de revertir el commit se verifica que Store siga abriendo sin ver/migrar Landing y que los archivos confirmados no se sobrescriban.

**STOP inmediato** ante cambios Store no explicados, scope fuera del paquete, rutas de datos ambiguas, casts Store/Landing, autoridad/persistencia no probada, cambios fuera de allowlist o aprobación humana pendiente.
