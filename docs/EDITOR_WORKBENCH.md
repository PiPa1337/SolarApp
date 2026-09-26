# Espacio de trabajo del editor

El editor es una aplicación de escritorio. Los presets Desktop, Tablet y Mobile
representan el viewport de la tienda dentro de la preview, no versiones del editor.

## Distribución

La navegación principal conserva las ocho áreas, separadas por las etapas de
preparación, edición y publicación. Cada herramienta tiene scroll independiente.
El panel lateral principal (Preparar, Resumen, Catálogo y las demás áreas) ocupa
el espacio libre hasta la preview, sin un máximo de 768 px. Tablet y Mobile
reservan hasta 768 y 390 px a la derecha; el panel principal recibe el resto.
Su viewport interno permanece en 768 y 390 px; si no cabe,
se escala su representación respetando el zoom elegido como límite máximo.
El contorno del iframe usa outline para no restar píxeles al viewport emulado.
Los gutters son de 12 px. Hay un único panel de trabajo junto a la preview:
el detalle ocupa el mismo espacio que la lista o herramienta desde la que se abre.
Los controles se adaptan al ancho de ese panel mediante container queries.

Abrir el panel principal activa Tablet temporalmente y conserva el preset que
estaba seleccionado con el panel cerrado. Mientras está abierto se puede elegir
Tablet o Mobile sin modificar ese preset anterior; Escritorio queda bloqueado.
Al cerrarlo se restaura el preset anterior.

`InspectorDockProvider` coloca el detalle de productos, secciones y recursos
mediante portales React en la misma celda del panel principal. La lista queda
oculta pero montada, preservando su estado y scroll para el regreso. Abrir o cerrar
un detalle no cambia el dispositivo, la ruta ni el zoom de la preview, y el
selector de dispositivo sigue disponible para Tablet y Mobile; Escritorio permanece bloqueado.

Los detalles de secciones y recursos ofrecen Volver a Constructor y Volver a
Recursos; guardar o cancelar un producto vuelve al Catálogo. El workspace conserva
siempre un solo panel visible de trabajo junto a la preview.

El producto conserva su borrador local y su confirmación de descarte. Mientras se
edita un producto se bloquean la navegación y las mutaciones del editor principal.
Los inspectores de secciones y recursos guardan cambios directamente en el proyecto
y permiten navegar a otra área. Escape cierra el inspector y devuelve el foco al
control que lo abrió; las confirmaciones conservan prioridad sobre Escape.

## Herramientas

- Preparar: progreso compacto, pendientes accionables y requisitos completados.
- Resumen: Identidad; Venta y pedidos; Navegación y textos; Dominio y legales.
- Catálogo: búsqueda y selección junto a la vista del catálogo; transferencias
  agrupadas bajo Importar / exportar; Agregar producto como acción principal.
  El panel de acciones masivas tiene scroll propio y altura máxima
  `min(560px, calc(100dvh - 220px))`. Sus grupos ajustan las columnas al espacio
  disponible con un mínimo de 240 px (o el ancho del panel si es menor); cada
  acción apila los campos en una columna para mantenerlos legibles.
- Constructor: estructura de la página y detalle de la sección seleccionada en
  el mismo panel, con regreso explícito a la estructura.
- Tema: Paleta y contraste; Tipografía; Superficies y espacio.
- Recursos: biblioteca con búsqueda, carga y detalle contextual con usos del asset.
- SEO: Apariencia en buscadores; Diagnóstico; Publicación y rastreo.
- Exportar: Generar archivos primero; Verificar publicación y Recuperar tienda
  separados. Se conserva el historial y el feedback del worker.

La navegación interna desplaza al grupo y le da foco. Todos los campos permanecen
montados: cambiar de grupo no descarta drafts, validaciones ni controles abiertos.

## Lenguaje visual

El shell hereda del dashboard el vidrio frío, bordes translúcidos, reflejo interior
y sombras suaves. El fondo es estático. Los campos usan superficies oscuras estables;
el ámbar identifica acciones y foco, con texto oscuro en los botones primarios.
Los estilos están aislados en `features/workbench/workbench.css` bajo
`.studio-workbench`; no se aplican al documento del iframe ni al sitio exportado.
La tipografía conserva Arial del dashboard: títulos de área de 25 px (22 px en
panel estrecho), texto de campos de 13 px y navegación de 12 px, sin sombras de
texto. Los paneles tienen radio de 16 px; controles de 8 px y grupos de 10 px.
Los tokens y reglas visuales compartidas están registrados en `DESIGN.md`;
`.impeccable/design.json` conserva las extensiones de profundidad y componentes.

## Verificación

La suite E2E conserva un recorrido del editor en `editor-smoke.spec.ts`, los
atajos y la reapertura del panel en `ui-shell.spec.ts`, y la edición de secciones
en `studio-builder.spec.ts`. Se retiró la matriz repetida de 24 combinaciones de
ocho áreas y tres presets. La revisión manual del workbench prioriza 1920×912 y
comprueba geometría, scroll, cierre visible y espacio de la preview.

La X de cierre ocupa una zona fija fuera del scroll, tanto en las áreas como en
los detalles. El contenido reserva espacio para que no quede bajo ese control.
La tabla de productos ajusta sus columnas y campos al ancho del panel. Por debajo
de 700 px de panel, cada fila se presenta como una ficha en dos columnas,
con etiquetas y todas sus acciones; se conserva la ordenación y selección.
Las capturas y comprobaciones de todos los tramos de scroll quedan en esa
revisión visual manual; el cierre y los accesos de teclado se revisan en los
recorridos funcionales retenidos.

Los fieldsets de un solo campo no reciben el padding de los grupos de formulario.
Las herramientas se alinean al inicio del panel; el espacio libre no estira sus
cabeceras. La biblioteca presenta miniaturas completas y la exportación compara
producción y borrador en columnas cuando hay espacio.
La auditoría de aperturas registra las ocho áreas a 1920×912, además de recorrer
sus posiciones de scroll y detalles con esa misma resolución.
