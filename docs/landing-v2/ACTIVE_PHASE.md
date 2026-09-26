# Paquete de fase activa

```yaml
active_phase: none
status: planning_only
reason: implementation_not_authorized_and_pre0_not_passed
next_candidate: PRE-0
```

No hay fase de implementación habilitada. El siguiente candidato, sólo después de autorización del usuario, es PRE-0; no es permiso para editar producto.

## Plantilla para activar una sola subfase

Completar desde el encabezado exacto del plan maestro. Dejar `active_phase: none` mientras falte autorización, prerrequisito o paquete revisado.

```yaml
active_phase: <PRE-0 | F0 | F1 | F2a | F2b | subfase exacta>
status: ready | running | needs_user | blocked | complete
authorization_evidence: <mensaje explícito del usuario>
base_commit: <sha verificado>
plan_heading: <encabezado exacto>
goal: <un resultado observable>
prerequisites:
  - <evidencia y estado>
allowed_paths:
  - <ruta exacta, revisada desde F2a>
forbidden:
  - <cambios fuera de contrato/Store/datos reales>
commands:
  - <comando exacto>
acceptance:
  - <resultado verificable>
manual_gate: <none | qué revisa el usuario y qué respuesta literal habilita continuar>
data_effect: <none | escrituras temporales | datos Landing confirmados>
rollback: <commit/operación y prueba de seguridad de datos>
open_questions: []
```

Antes de pasar a `running`, comprobar que no hay `open_questions`, que cada path está permitido y que los prerrequisitos tienen evidencia. Si aparece una ruta nueva o una decisión técnica no resuelta, volver a `needs_user`/`blocked`, actualizar el plan y no ampliar el diff.

Al cerrar, guardar commit SHA, cada comando y su exit code en `STATE.md`, anotar F0 y cualquier aceptación humana explícita, y volver este archivo a `active_phase: none`. No conservar una fase vieja como si siguiera autorizada.
