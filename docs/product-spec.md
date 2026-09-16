# Especificación de producto

## Propósito

SolaraCommerce permite a una única persona crear y respaldar varias tiendas,
componer páginas con secciones intercambiables, administrar catálogos de hasta
1.000 productos y exportar sitios estáticos listos para publicar.

## Recorrido principal

1. Crear o abrir una tienda local.
2. Editar identidad, catálogo, entrega, devoluciones y WhatsApp.
3. Ordenar secciones y configurar su contenido.
4. Revisar la tienda en desktop, tablet o móvil.
5. Resolver errores críticos de la auditoría.
6. Exportar un sitio de borrador o producción.
7. Publicar el contenido en un hosting estático.

La entrega y los cambios/devoluciones se configuran como políticas del proyecto.
En las tiendas `catalog-modern-v2` se muestran dentro de las fichas de producto,
no como páginas independientes `/envios/` y `/devoluciones/`. Privacidad y
términos sí conservan sus páginas públicas propias. Las rutas independientes de
envíos y devoluciones sólo permanecen en V1 por compatibilidad legacy.

## Compra

El cliente selecciona variantes, agrega productos al carrito, completa sus datos y
abre WhatsApp con un mensaje determinista. SolaraCommerce no procesa pagos ni
confirma inventario.

## Salida pública

La exportación incluye HTML rastreable, CSS, JavaScript progresivo, imágenes,
sitemaps, robots, JSON-LD y un feed Google Merchant. El contenido comercial debe
permanecer visible si JavaScript está desactivado.

## Fuera de v1

Backend, pagos en línea, sincronización, colaboración, importación de otras
plataformas, módulos externos, editor de código, timeline libre, Merchant API,
publicación automática, multidioma e inteligencia artificial en runtime.
