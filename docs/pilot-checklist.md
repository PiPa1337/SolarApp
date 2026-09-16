# Checklist del piloto real

## Antes de publicar

- Ejecutar desde Node 24.x:

  ```bash
  corepack pnpm install --frozen-lockfile
  corepack pnpm playwright:install:release
  corepack pnpm release
  corepack pnpm pilot:preflight
  ```

  Para validar una tienda real desde su respaldo editable, en PowerShell usar:

  ```powershell
  $env:SOLARA_PILOT_PROJECT_ARCHIVE = "C:\ruta\tienda.solara.json"
  corepack pnpm pilot:preflight
  ```

  En `cmd.exe` se puede usar:

  ```bat
  set "SOLARA_PILOT_PROJECT_ARCHIVE=C:\ruta\tienda.solara.json"
  corepack pnpm pilot:preflight
  ```
  Sin esa variable, `pilot:preflight` usa el fixture de referencia; ese resultado
  valida el pipeline, no una tienda comercial real.

  Para generar el paquete production de esa misma tienda en PowerShell:

  ```powershell
  corepack pnpm pilot:export
  ```

  Con `SOLARA_PILOT_PROJECT_ARCHIVE` definido, `pilot:export` genera en
  `.release/pilot-site/` una exportación production de ese respaldo para revisar
  el candidato. Sin la variable, la carpeta corresponde al fixture de referencia.

- Usar exportación `production` con dominio HTTPS definitivo.
- Resolver todos los errores críticos del panel SEO.
- Comprobar títulos, descripciones, canonical, alt, precios y disponibilidad.
- Revisar políticas de entrega, cambios/devoluciones, contacto y privacidad. En
  `catalog-modern-v2`, verificar entrega y cambios dentro de las fichas de
  producto; la ausencia de `/envios/` y `/devoluciones/` independientes es
  intencional y no bloquea la publicación.
- Ejecutar el release candidate completo, incluyendo la matriz de navegadores y
  Lighthouse, antes de publicar.

## Publicación

1. Exportar la tienda elegida en modo `production` desde Studio y publicar la
   carpeta `proyectos/<tienda>/sitios/<versión>/` sin modificar sus archivos.
   `.release/pilot-site/` es una salida de validación del flujo `pilot:*`; no
   sustituye la versión confirmada en `proyectos/` que se decidió publicar.
2. Verificar el dominio en Search Console.
3. Enviar `/sitemap.xml` e inspeccionar home, categoría, producto y variante.
4. Crear una subcuenta Merchant para el dominio.
5. Conectar `/google-merchant.xml`.
6. Comparar productos, variantes, precios y stock entre HTML, JSON-LD y feed.
7. Registrar diagnósticos de Merchant y Rich Results sin introducir excepciones
   por producto.

## Seguimiento

Revisar cobertura, Core Web Vitals, rich results y diagnósticos Merchant durante
el piloto. No agregar módulos ni cambiar el schema hasta resolver los problemas
observados y documentar la decisión.

## Restricción comercial conocida

El pedido termina en WhatsApp y no constituye un checkout convencional dentro
del sitio. Google Merchant puede rechazar esta experiencia. El panel SEO lo
reporta como advertencia y el piloto debe validar el caso real; no se garantiza
la aprobación.
