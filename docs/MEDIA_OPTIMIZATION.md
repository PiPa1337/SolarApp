# Contrato de optimización de imágenes

Este documento fija la receta que deben compartir Studio, Preview, exportación
y el auditor de una tienda. El objetivo visual y de rendimiento es el snapshot
actual de RM Descartables: fuente desktop de producto de **1254 px**, variante
intermedia de **768 px**, formato primario WebP/AVIF y fallback JPEG/PNG.

## Regla de oro

Una imagen de producto no se considera optimizada sólo porque pese poco o tenga
un `srcset`. Para cumplir el baseline debe tener:

- una composición final aprobada, preferentemente cuadrada cuando el catálogo la
  presenta en tarjetas y galería;
- `source` primario WebP o AVIF;
- `fallbackSource` separado para JPEG/PNG;
- `responsiveSources` con la variante intermedia de 768 px y la fuente máxima;
- una fuente real de al menos 1254 px para producto desktop.

El optimizador **no hace upscaling**: reduce una fuente grande y nunca inventa
detalle para convertir una imagen de 768 px en una imagen realmente nítida de
1254 px. Si la fuente original es menor, la tienda puede seguir exportándose,
pero el auditor debe informar que no alcanza el baseline.

## Flujo obligatorio

1. Conservar la fuente original y una copia versionada antes de reemplazar
   assets de una tienda.
2. Generar o preparar la composición final al menos a 1254×1254 si será una
   imagen cuadrada de producto. El fondo, escala del objeto y sombra pertenecen
   a la composición; el optimizador no los reconstruye.
3. Procesar el archivo por el worker de imágenes de Studio (`processImage`) o
   por `createImageAssetFromProcessed`. No insertar manualmente un PNG como
   `source` ni fabricar variantes copiando la misma data URL.
4. Revisar el proyecto y la exportación: HTML con `<picture>`, WebP/AVIF como
   fuente primaria, 768 px para tablet y 1254 px (o el ancho real de una fuente
   mayor) para desktop.
5. Medir los archivos físicos de `sitios/<tienda>/assets`, no sólo el tamaño
   del JSON editable. El fallback también cuenta porque puede ser el recurso
   descargado por navegadores sin el formato moderno.

## Diagnóstico que evita una falsa optimización

El auditor de `@solara/site-optimizer` emite estos códigos para cada imagen de
producto usada por un producto activo:

- `performance.product-image-format`: el primario no es WebP/AVIF.
- `performance.product-image-resolution`: la fuente es menor a 1254 px.
- `performance.asset.responsive`: falta una variante responsive en un asset
  grande.
- `performance.asset.weight`: el primario supera 1,5 MB.

Una tienda sólo puede describirse como equivalente al baseline de RM cuando no
tiene esos hallazgos de media y la exportación realmente contiene las variantes
esperadas. Un `responsiveSources` correcto no compensa una fuente original
pequeña; ambos controles son independientes.

## Caso Pao

La versión anterior de Pao entregaba PNG primario y fallback JPG pesado. Pao
v23 ya corrigió el formato: WebP responsive, fallback separado y un peso físico
de aproximadamente 16,9 MB. El hallazgo restante era de resolución: sus 102
imágenes de producto medían 768 px, mientras que las 166 imágenes de producto
de RM medían 1254 px. Ese dato es el que debe verificarse antes de afirmar que
otra tienda quedó optimizada.

La promoción actual de Pao v30 entrega las 102 imágenes de producto con las
fuentes originales generadas de 1254×1254, fuente WebP 1254 px, variante WebP
768 px y fallback JPEG 768 px. La exportación v30 mide 37,2 MB completos
(35,6 MB de assets), frente a 34,0 MB del snapshot completo de RM. El aumento
proviene de conservar el detalle real de los masters originales; la calidad no
se obtiene ampliando la derivada de 768 px.

La correspondencia fuente → producto se comprobó antes de guardar: cada uno de
los 102 assets usa una fuente original distinta del lote generado del chat. El
flujo conserva el backup versionado anterior y usa el control de versión del
servidor local para rechazar una escritura concurrente.

## Verificación mínima

Después de cambiar medios compartidos:

```powershell
corepack pnpm --filter @solara/site-optimizer test
corepack pnpm --filter @solara/exporter test
corepack pnpm check:micro
corepack pnpm test:e2e:smoke
```

Además, revisar una página de producto en Preview y en el sitio exportado a
ancho desktop y móvil. Si sólo se dispone de una fuente menor, reportarlo como
limitación de calidad de origen y no corregirlo declarando falsamente un ancho
mayor en metadata.
