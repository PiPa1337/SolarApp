# Seguridad del almacenamiento comercial

Este documento define el procedimiento permanente para cualquier operación que
pueda reemplazar, migrar o reconstruir `proyectos/`. No depende de una migración
histórica ni de una forma de distribución concreta.

## Autoridad y límites

- `proyectos/` en la raíz del checkout es la fuente de verdad de las tiendas
  confirmadas en disco.
- `proyectos/` no es una fixture, un directorio temporal ni una salida de build.
- Git, `dist/`, `.release/` y `.solara-runtime/` no son respaldos de los datos
  comerciales.
- Tests, agentes y scripts de diagnóstico deben usar raíces temporales o fixtures
  explícitas y nunca sembrar, vaciar ni reemplazar el `proyectos/` real.

## Antes de reemplazar datos

1. Detener o bloquear escritores sobre la tienda o el árbol afectado.
2. Crear una copia de rollback fuera del destino que se va a reemplazar.
3. Construir el candidato en staging, sin modificar la fuente vigente.
4. Validar cada `manifest.json`, el proyecto señalado por `current.projectPath`,
   el envelope `.solara.json`, IDs y rutas relativas.
5. Calcular SHA-256 e inventario de los archivos críticos que deban conservarse.
6. Comparar conteos, IDs, hashes y `lastValidSite` cuando exista.

Una validación fallida cancela el reemplazo. La fuente vigente debe permanecer
intacta y el staging debe conservar evidencia suficiente para diagnosticar.

## Reemplazo transaccional

El cambio final debe usar rename/reemplazo atómico cuando el filesystem lo
permita. No copiar archivos uno por uno sobre la fuente vigente.

Después del swap:

1. volver a leer manifests y proyectos desde la ubicación final;
2. recalcular y comparar hashes e inventario;
3. comprobar que `current.projectPath` y `lastValidSite` resuelvan dentro de la
   tienda correcta;
4. abrir o consultar las tiendas con el mismo storage que usa Studio;
5. conservar el rollback hasta terminar esta verificación.

Ante cualquier diferencia, restaurar la copia de rollback y registrar la causa.

## Recuperación y backups

Los respaldos editables `.solara.json`, `respaldos/`, `respaldos-manuales/` y los
sitios válidos versionados pertenecen al historial de cada tienda. La limpieza
rutinaria del servicio conserva como máximo cinco respaldos automáticos en
`respaldos/` por tienda; no elimina la versión actual ni los respaldos manuales.
Las copias automáticas más antiguas sólo se eliminan después de un commit
confirmado o durante la poda inicial del servidor.

Para una copia manual completa, cerrar o detener escrituras y copiar
`proyectos/` explícitamente. Ver también
[`backup-and-recovery.md`](backup-and-recovery.md) y
[`LOCAL_OPERATION.md`](LOCAL_OPERATION.md).
