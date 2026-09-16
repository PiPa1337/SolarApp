# Storefront Editorial V2

`catalog-modern-v2` es una familia visual reversible para tiendas que ya usan
los módulos Catalog Modern. Mantiene `schemaVersion: 2`, el catálogo, las
secciones, SEO, carrito y checkout; cambia la composición y los estados visuales.

## Activación

1. Abrir la tienda en Studio.
2. Entrar en **Tema**.
3. En **Familia visual**, elegir **Editorial V2**.
4. Revisar Preview en escritorio y móvil y guardar cuando el resultado sea el
   esperado.

La selección **Catálogo clásico V1** revierte la presentación sin migrar ni
eliminar datos. Las tiendas legacy que no usan Catalog Modern no reciben este
selector porque sus módulos no comparten este contrato visual.

## Diferencias intencionales

| Superficie | V1 | Editorial V2 |
| --- | --- | --- |
| Contenedor | compacto | editorial amplio, hasta 1760 px |
| Home | grilla comercial clásica | hero asimétrico, media 4:5 y ritmo abierto |
| Categoría | filtros en panel | rail desktop y sheet móvil sin scroll lateral |
| Producto | detalle compacto | galería 4:5 y resumen sticky en desktop |
| Carrito | drawer lateral | drawer de 520 px y sheet móvil |
| Checkout | formulario lineal | formulario + resumen lateral; flujo apilado móvil |
| Motion | transiciones base | appear progresivo, stagger, hover interno y header compacto |

El contenido permanece visible sin JavaScript. `prefers-reduced-motion` deja
todos los elementos en su estado final y elimina las transiciones espaciales.

## Políticas de entrega y cambios

En `catalog-modern-v2`, `/envios/` y `/devoluciones/` no son páginas públicas
independientes. Esta es una decisión de producto vigente, no una funcionalidad
faltante:

- `policies.shipping` y `policies.returns` siguen siendo datos configurables y
  obligatorios para la calidad del contenido público;
- el resumen y el detalle de cada política se muestran dentro de la ficha de
  cada producto, junto con la información relevante para decidir la compra;
- el footer V2 conserva únicamente los enlaces independientes a
  `/privacidad/` y `/terminos/`;
- si una navegación heredada contiene un enlace a `/envios/` o
  `/devoluciones/`, el renderer V2 lo omite;
- los detalles de entrega y cambios también alimentan las superficies públicas
  de contexto y auditoría, pero no crean una URL indexable separada.

Las páginas independientes de envíos y devoluciones sólo se mantienen para
`catalog-modern-v1` por compatibilidad con tiendas legacy. No se deben agregar
a una tienda V2, ni considerar su ausencia un bloqueo de publicación. Las
rutas, textos y campos legacy se conservan hasta que exista una migración
explícita; no se eliminan datos del proyecto.

## Gates actuales

- Preview y exportación comparten renderer.
- Las rutas públicas y la matriz responsive declaradas por los specs activos
  permanecen sin overflow horizontal; `docs/TESTING.md` y los propios specs son
  la autoridad de esa matriz.
- navegación por teclado, foco visible, nombres accesibles e IDs únicos;
- fallback de compra directa y navegación móvil sin JavaScript;
- canonical, Open Graph, sitemap y `noindex` de rutas transaccionales;
- benchmark de exportación de 2.000 productos bajo 30 segundos y 48 MiB;
- presupuesto público V2 vigente: CSS crudo hasta 212 KiB y runtime JS hasta
  80 KiB; los valores ejecutables viven en los guardianes de `scripts/`.
- comparación visual equivalente en 1920x968: V1 conserva su composición y no
  recibe estilos `.cm.v2`; ambas familias mantienen el mismo contenido.

La evidencia de release anterior a la migración a Node 24 es histórica. El
contrato vigente de certificación usa Node 24.x y la matriz definida en
`docs/TESTING.md`; los conteos de ejecuciones históricas no forman parte de este
contrato activo.

## Evidencia visual

Las referencias aceptadas y sus reglas viven en
[`design-references/catalog-modern-v2/README.md`](design-references/catalog-modern-v2/README.md).
No se copian capacidades ficticias de esas imágenes al producto.
