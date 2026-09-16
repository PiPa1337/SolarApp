# Baseline técnico previo a Storefront V2

Fecha: 2026-08-12
Commit estable: `56c2394dce25719c672b61f498f03d7145d1fac3`
Remoto: `https://github.com/PiPa1337/SolaraCommerce-Fork.git`
Familia pública estable: `catalog-modern-v1`

Este hash es el punto de restauración anterior a la implementación V2. No se
crea un commit vacío ni una rama de respaldo: V1 permanece como familia real en
el producto y cada bloque V2 se integra con commits pequeños sobre `main`.

## Estado verificado

- `StoreProjectV2` y `schemaVersion: 2` son la autoridad persistida.
- Preview y exportación usan el renderer de `@solara/exporter`.
- El storefront inicial es útil sin JavaScript.
- La evidencia histórica del release Node 22 ejecutó 698 casos Chromium y 85
  contratos públicos en cada uno de Firefox y WebKit; el runtime oficial actual
  de release es Node 24.x.
- Último gate release: 865 aprobados, 3 omitidos deliberadamente, 0 fallos.
- `catalogModernStore` y `catalogScaleStore` pasan sus contratos de exportación.

## Presupuestos medidos

| Artefacto | Medición | Límite | Margen |
| --- | ---: | ---: | ---: |
| Runtime público JavaScript crudo | 54.234 B | 54.272 B | 38 B |
| Studio JavaScript inicial crudo | 638.614 B | 716.800 B | 78.186 B |
| Studio CSS inicial crudo | 102.234 B | 102.400 B | 166 B |

La V2 no puede añadir motion al runtime compartido sin recuperar margen o
segmentar capacidades. Elevar el límite no es la primera solución aceptable.

## Contratos que deberán extenderse

- `commerceTemplates.designFamily` sólo admite `legacy-editorial-v1` y
  `catalog-modern-v1`.
- `ModuleFamily` refleja esas dos familias.
- el registro de módulos modernos reconoce sólo `catalog-modern-v1`;
- exporter, fixtures, repository y tests contienen comparaciones explícitas con
  V1;
- el runtime declara capacidades de header, búsqueda, carrito, checkout,
  categoría, producto, hero, video, motion, variantes y filtros.

## Rutas públicas existentes

- home;
- categorías y colecciones paginadas;
- detalle de producto;
- búsqueda;
- carrito/checkout;
- contacto, nosotros, envíos y cambios (rutas legacy V1), privacidad y términos;
- sitemap, robots, índices de catálogo/búsqueda, Merchant y contexto para
  agentes.

Nota de compatibilidad: esta lista de referencia conserva las rutas históricas
de contacto, nosotros, envíos y cambios. En el contrato vigente V2, contacto y
otras superficies se integran según la decisión de producto, y `/envios/` y
`/devoluciones/` no se materializan como páginas independientes; sus políticas
se muestran en las fichas de producto. V1 conserva las rutas antiguas sólo para
compatibilidad.

## Riesgos iniciales

1. **Runtime sin headroom:** cualquier abstracción de motion puede romper el
   gate aunque el comportamiento sea correcto.
2. **Aislamiento de familia:** reutilizar selectores V1 sin raíz V2 produciría
   drift visual en tiendas existentes.
3. **Defaults paralelos:** los módulos V2 deben derivar defaults de metadata y
   no duplicarlos en Studio.
4. **Escala:** un stagger por elemento, observers individuales o filtros que
   recorran DOM innecesariamente no son aceptables con 2.000 productos.
5. **Capacidades inventadas:** cuentas, wishlist, pagos y analítica no forman
   parte del contrato actual.
6. **No-JS:** transiciones y skeletons no pueden ocultar contenido inicial.
7. **Fixture determinista:** cualquier nueva opción visual debe reflejarse en la
   demo V2 y conservar paridad con `catalogScaleStore` cuando corresponda.

## Evidencia visual V1

Las referencias V1 permanecen bajo `docs/design-references/catalog-modern/` y
se usarán en la comparación final. No se reemplazan ni se reinterpretan.
