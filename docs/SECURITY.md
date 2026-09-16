# Seguridad del sitio exportado

El sitio público de SolaraCommerce es estático. No usa Pages Functions, secretos
ni un backend de pagos: el checkout abre WhatsApp y cada mensaje recibido debe
tratarse como información no confiable. El precio, stock, envío y pago se
confirman manualmente con la tienda; ningún total, checksum o referencia del
navegador constituye una prueba auténtica.

## Publicación en Cloudflare Pages

1. Exportá a una carpeta padre elegida en la app. La app crea una carpeta hija
   nueva con el modo y la fecha; subí únicamente esa carpeta hija.
2. No subas respaldos `.solara.json`, proyectos editables ni temporales.
3. Mantené Pages Functions ausentes. Los previews de Cloudflare son públicos por
   defecto: desactivalos o protegélos con Access y eliminá versiones antiguas.
4. Usá un dominio HTTPS y ejecutá el verificador de URL de Exportar después del
   despliegue. Si CORS o un Worker impide leer headers, el resultado queda como
   “no verificado”; usá los comandos `curl.exe` que muestra la app.

La exportación de producción incluye `_headers` con CSP, HSTS conservador,
`form-action`, `worker-src`, `manifest-src`, `font-src`, `nosniff`, anti-framing,
`sw.js` sin caché y recursos `/assets/` direccionados por contenido. El
`deployment-manifest.json` v1 identifica la revisión, las rutas runtime
hasheadas, hosts externos y hashes de archivos esenciales sin incluir datos
privados.

## Exposiciones deliberadas

El contexto público para agentes forma parte obligatoria de cada exportación de
producción y genera `ai-context.json`, `llms.txt` y `llms-full.txt`. Antes de
exportar se informa que publica contacto, políticas, SKUs, precios y productos
activos. La opción interna `publicAiContext` se conserva por compatibilidad con
consumidores antiguos, pero producción ignora un valor `false`; los borradores
no publican esos archivos. Los medios HTTP/HTTPS externos se mantienen por
compatibilidad, pero cada host aparece como advertencia y puede recibir
solicitudes de visitantes.

## Live Canvas y procesos auxiliares

Los atributos `data-canvas-*` sólo se generan en el HTML temporal del Preview;
el export público no los contiene. El bridge exige que el mensaje provenga del
iframe actual, coincida con la sesión, use un nonce pendiente y apunte a una
entrada del manifest; los repeaters además requieren `itemFieldKey`. El texto
confirmado pasa por `applyMutation` y el sanitizer existente, nunca se extrae
del DOM para persistirlo.

Los runners de QA y el canal del agente usan `spawn` con binarios/argumentos
construidos de listas allowlisted, sin `shell: true`. `--read-only` sólo recibe
scopes de lectura/auditoría y el handler rechaza mutaciones con
`PERMISSION_DENIED`.
