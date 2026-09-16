# Dirección visual Storefront V2

Estas referencias son la fuente visual de `catalog-modern-v2`. Se generaron por
sección, se evaluaron antes de implementar y no forman parte de la exportación
pública. La implementación debe preservar su lógica, no copiar texto o datos
que una tienda no posea.

## Referencias aceptadas

| Archivo | Superficie | Lectura principal |
| --- | --- | --- |
| `hero-desktop.png` | header + hero desktop | composición editorial desplazada y dos capas de media |
| `hero-mobile.png` | header + hero móvil | primera pantalla completa con CTA visible |
| `products-desktop.png` | productos destacados | tarjetas abiertas 4:5 y hover sin reflow |
| `categories-editorial-desktop.png` | descubrimiento de categorías | composición X+1 con fallback a grilla |
| `category-desktop.png` | categoría + filtros | rail de 280 px y grilla de tres columnas sin overflow |
| `filters-mobile.png` | filtros móviles | sheet con scroll único y acciones sticky |
| `product-desktop.png` | detalle desktop | galería 58% y compra sticky-ready 34% |
| `product-mobile.png` | detalle móvil | galería swipeable, opciones táctiles y CTA sticky |
| `cart-desktop.png` | drawer desktop | panel de 500 px, backdrop, cantidades y WhatsApp |
| `cart-mobile.png` | sheet móvil | sheet de 82–88dvh con safe area y acciones completas |
| `checkout-desktop.png` | checkout desktop | formulario abierto y resumen lateral sticky sin pago online |
| `checkout-mobile.png` | checkout móvil | flujo apilado, controles táctiles y resumen sin overflow |
| `search-desktop.png` | búsqueda desktop | intro contenida, formulario ancho y vacío editorial honesto |
| `search-mobile.png` | búsqueda móvil | H1 y ayuda separados, controles apilados y táctiles |
| `search-results-desktop.png` | resultados desktop | conteo honesto y cuatro columnas abiertas con hover acotado |
| `search-results-mobile.png` | resultados móvil | consulta visible y dos columnas legibles sin overflow |
| `cart-page-desktop.png` | carrito completo desktop | líneas abiertas y summary de 360–420 px con datos sans |
| `cart-page-mobile.png` | carrito completo móvil | productos y resumen apilados sin importes display ni overflow |
| `testimonials-desktop.png` | reseñas + ayuda | muro de citas agrupado y CTA WhatsApp |
| `footer-desktop.png` | cierre + footer | contenido real, cuatro grupos y vuelta arriba |
| `policy-desktop.png` | políticas desktop | introducción editorial, datos reales, hechos verificables y contacto |
| `policy-mobile.png` | políticas móvil | contenido factual apilado, legible y sin overflow |
| `not-found-desktop.png` | recuperación 404 desktop | composición asimétrica, código tipográfico y rutas útiles |
| `not-found-mobile.png` | recuperación 404 móvil | acciones visibles antes del código decorativo y sin recortes |

## Referencias rechazadas durante la exploración

- El primer hero móvil fue descartado porque la imagen empujaba promesa y CTA
  fuera de la primera pantalla.
- La primera categoría fue descartada por inventar cuentas y wishlist.
- El primer carrito desktop fue descartado porque el fondo incorporaba
  favoritos y selector de cuenta/mercado.
- El primer sheet de filtros fue descartado porque el contador declaraba dos
  filtros activos mientras cuatro controles aparecían seleccionados.
- La primera prueba social fue descartada porque mostraba tres citas pero
  anunciaba “Mostrando 1 de 3” y contenía copy defectuoso.

Esos patrones no deben reaparecer en código. La exploración visual no autoriza
nuevas capacidades de producto.

## Paleta extraída

| Token conceptual | Valor de referencia | Uso |
| --- | --- | --- |
| `paper` | `#F7F5F0` | fondo y superficies principales |
| `ink` | `#11110F` | texto primario y controles fuertes |
| `stone` | `#DDD8CF` | bordes, fondos de media y divisores |
| `stone-soft` | `#E9E5DE` | controles secundarios y alerts neutros |
| `accent` | `#A63D2F` | CTA, activo y venta, con uso restringido |
| `muted` | `#6F6A63` | texto secundario |
| `success` | `#247A46` | disponibilidad, nunca como única señal |

Los valores finales deben seguir siendo editables desde `theme.colors`; esta
tabla define relaciones y fallback V2, no colores hardcodeados de una marca.

## Tipografía

- display: serif editorial de alto contraste, configurable desde la fuente de
  títulos del tema;
- interfaz: sans neutra y legible, configurable desde la fuente body;
- hero desktop: 1–2 líneas, aproximadamente `clamp(4.5rem, 7vw, 8.5rem)`;
- hero móvil: 2–3 líneas, aproximadamente `clamp(3.2rem, 14vw, 5.2rem)`;
- H1 PDP: 1–2 líneas y menor que el hero;
- nombres de producto: 1–2 líneas sin truncar por defecto;
- cuerpo: 16–20 px según viewport, nunca microcopy ilegible;
- precios y labels usan sans; la serif no se aplica indiscriminadamente a
  controles.

## Layout y spacing

### Contenedor

- gutter desktop visual: 3–4vw, con mínimo aproximado de 32 px;
- ancho útil amplio para producto y editorial: tope cercano a 1.760 px;
- contenido de lectura mantiene medidas más estrechas dentro del contenedor;
- móvil: gutters de 20–24 px y media full-bleed sólo cuando la referencia lo
  justifica.

### Header y hero

- anuncio breve sobre una línea;
- navegación desktop aireada, con búsqueda como control ancho y carrito claro;
- hero desktop ocupa el alto útil restante y divide texto/media de forma
  asimétrica, no 50/50 rígido;
- media principal mantiene ratio y una segunda capa menor puede solaparse;
- móvil recompone: header compacto, media de aproximadamente 35–40% del alto y
  CTA visible dentro de 844 px;
- la segunda capa desktop se elimina o simplifica en móvil.

### Productos

- grilla home: 4 columnas desktop, 3 tablet, 2 móvil;
- categoría: rail de 260–300 px + 3 columnas; debajo del breakpoint, filtros
  pasan a drawer/sheet y la grilla conserva 2 columnas;
- media 4:5 con espacio reservado;
- metadata sin tarjeta exterior, sombra o borde envolvente;
- nombre largo puede ocupar dos líneas sin mover acciones encima de otra card;
- descuentos y agotado son estados, no decoración repetida.

### Descubrimiento editorial

- cuatro categorías pueden usar marcos asimétricos y una quinta entrada muestra
  el comportamiento X+1;
- con más contenido, la composición pasa a una grilla estable y “Ver todas”;
- sólo las dos imágenes protagonistas reciben profundidad de scroll;
- conteos y nombres se leen sin depender de la imagen ni del hover.

### PDP

- desktop: thumbnails + media principal en aproximadamente 58%, resumen en
  34%, gutter restante;
- resumen sticky sólo dentro del límite de su sección;
- móvil: una galería swipeable y controles en flujo;
- sticky purchase bar aparece sólo cuando el CTA original sale del viewport;
- tabs/accordions no duplican la misma información.

### Carrito

- drawer desktop: `min(520px, 100vw)` y alto completo;
- sheet móvil: 82–88dvh, scroll interno único y safe-area inferior;
- líneas en estructura abierta con miniatura estable, cantidad y eliminar;
- summary y CTA permanecen alcanzables sin tapar líneas;
- el backdrop conserva contexto pero evita interacción accidental.

En la página completa, desktop usa lista flexible más un resumen de 360–420 px;
móvil apila ambas zonas. Precios, entrega y total siempre usan la fuente body:
la serif queda reservada para el H1 y el título del resumen.

### Búsqueda

- el H1 mantiene una línea en desktop y puede partir sin solapar la ayuda en móvil;
- label, input y botón permanecen visibles, con controles de al menos 44 px;
- el formulario usa el ancho disponible en desktop y se apila en móvil;
- el vacío explica el próximo paso sin inventar productos, sugerencias o resultados.
- los resultados muestran el conteo real y usan cuatro columnas desktop, tres
  en tablet y dos en móvil, conservando imagen 4:5 y metadata completa;
- el hover amplía sólo la imagen sin reflow; foco y navegación por flechas
  mantienen el acceso equivalente por teclado.

### Checkout

- desktop: formulario y resumen en dos columnas abiertas separadas por un divisor;
- móvil: formulario primero y resumen después, sin panel flotante que tape contenido;
- labels persistentes, controles de al menos 48 px y foco de alto contraste;
- no se inventan pagos, envíos, cuentas ni confirmaciones fuera de WhatsApp;
- el resumen sigue derivándose del runtime y conserva `aria-live`.

### Políticas

- Envíos y cambios convierten únicamente los campos reales del proyecto en
  resumen, detalle, plazos y cobertura; no agregan promesas comerciales.
- En V2 esas políticas se muestran dentro de las fichas de producto y no se
  exportan como `/envios/` o `/devoluciones/` independientes. Privacidad y
  términos sí conservan sus páginas públicas; V1 mantiene las rutas antiguas
  por compatibilidad.
- Privacidad y términos muestran sólo el texto configurado y un contacto
  genérico; no inventan prácticas legales, garantías ni jurisdicciones.
- desktop combina una introducción de lectura acotada con hechos escaneables;
  móvil apila toda la información sin tablas ni desplazamiento horizontal.
- la composición V2 es exclusiva de `catalog-modern-v2`; V1 conserva su HTML.

### Recuperación 404

- el mensaje explica el error y ofrece regreso a inicio como acción primaria;
- la primera categoría sólo aparece cuando existe realmente en el proyecto;
- el `404` de gran escala es decorativo y queda fuera del árbol accesible;
- desktop admite una composición asimétrica y móvil mantiene las acciones antes
  del número, sin clipping ni overflow.

## Componentes y estados

### Botones

- primario rectangular con radio bajo/medio, área táctil mínima de 44 px;
- relleno accent, texto de alto contraste y flecha sólo cuando comunica avance;
- secundario como link subrayado o botón de borde, no otra masa accent;
- pressed comprime 1–2 px y vuelve inmediatamente;
- focus usa outline separado de color y no altera tamaño.

### Tarjeta de producto

- default: imagen, contexto, nombre y precio;
- hover pointer-fine: escala interna leve, segunda imagen opcional y action layer
  dentro del mismo frame;
- focus: acceso equivalente al CTA, sin depender de hover;
- unavailable: texto y control deshabilitado, no sólo gris;
- sin imagen: superficie stone con proporción intacta;
- no wishlist, quick-view o compra rápida hasta que exista contrato explícito.

### Filtros

- accordions con borde/divisor, nombre y conteo;
- grupos largos usan “Ver más” y luego scroll interno acotado si es necesario;
- filtros activos son chips removibles porque representan estado real;
- toolbar no se desplaza lateralmente;
- en móvil, panel propio con aplicar/limpiar y retorno de foco.

El sheet móvil usa un solo scroll interno, footer sticky con safe area y un
conteo derivado de la selección real. El estado de referencia es exactamente
`Talle M + Negro = 2 filtros activos`.

### Variantes

- selected: borde/tinta fuerte y estado semántico;
- unavailable: tachado + disabled;
- color incluye nombre visible además de swatch;
- cambios actualizan imagen, precio, SKU y CTA como una transición coordinada.

## Motion extraído

| Capa | Duración orientativa | Comportamiento |
| --- | ---: | --- |
| respuesta | 90–140 ms | pressed, toggle, focus y badge |
| control | 180–260 ms | underline, accordion corto, swatch |
| componente | 280–420 ms | drawer, menú, imagen de variante |
| editorial | 520–760 ms | line-mask, clip de media y bloque protagonista |

Easings iniciales:

- entrada: `cubic-bezier(0.22, 1, 0.36, 1)`;
- salida: `cubic-bezier(0.4, 0, 1, 1)`;
- estado: `cubic-bezier(0.2, 0, 0, 1)`.

### Appear

- títulos por línea/baseline;
- imágenes mediante clip vertical con espacio ya reservado;
- grillas en grupos visibles con máximo de 6–8 delays;
- contenido visible por defecto si no inicia JavaScript.

### Hover

- CTA con barrido direccional de relleno;
- links con underline que crece desde el origen lógico;
- producto con cambio interno de imagen y action layer, sin reflow;
- sólo en `hover: hover` y `pointer: fine`.

### Scroll

- header compacto al descender y expandido al invertir dirección;
- profundidad de 8–20 px en las dos capas hero, nunca sobre texto;
- un observer compartido para reveals;
- no scroll hijacking ni stagger proporcional al catálogo completo.

### Drawer y sheet

- backdrop fade + desplazamiento del panel;
- apertura interrumpible y cierre más breve;
- foco inicial en cerrar o primer control útil;
- Escape/backdrop/gesto opcional cierran y restauran el trigger;
- eliminación colapsa una línea, anuncia resultado y mantiene foco útil.

### Reseñas y cierre

- una reseña destacada y dos secundarias forman una página de grupo;
- navegación anuncia `Página 1 de N`, no un conteo incompatible con las citas
  visibles;
- `Compra verificada` sólo aparece cuando existe ese dato;
- sin reseñas, la sección desaparece o muestra un estado editorial honesto;
- la ayuda termina en WhatsApp, no en un formulario sin backend;
- footer sólo consume rutas, contacto y ubicación presentes en el proyecto.

### Reduced motion

- sin parallax, line-mask móvil, clip progresivo ni autoplay;
- contenido en estado final desde el primer frame;
- transiciones breves de color/estado pueden permanecer;
- ninguna relación o feedback depende del movimiento.

## Reglas de fidelidad

1. No agregar cuentas, wishlist, pagos, urgencia o ratings inexistentes.
2. Los datos visibles proceden del proyecto; la referencia sólo define jerarquía.
3. No copiar una fotografía generada al fixture si no existe como asset del
   proyecto; se reutilizan assets deterministas o se crean assets autorizados.
4. No implementar todos los efectos a la vez: cada motion entra con prueba,
   budget y fallback.
5. La comparación visual se hace en `1920x968` y `390x844`, además de los otros
   viewports de aceptación.
6. Una captura similar no basta: navegación, foco, persistencia, no-JS y export
   deben conservar sus contratos.
