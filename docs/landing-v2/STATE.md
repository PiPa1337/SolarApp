# Estado verificable — Landing V2

Este archivo registra hechos, no intención. Actualizarlo sólo con evidencia de Git, comandos observados o respuesta explícita del usuario.

```yaml
work_status: planning_only
implementation_authorized: false
product_code_changed_for_landing: false
active_phase: none
next_candidate: PRE-0
accepted_base_commit: null
pre0: not_run
f0_store_oracle: not_run
user_visual_acceptance: none
user_lab_acceptance: none
last_product_tests: not_run
```

## Evidencia observada en la última revisión del plan

- Fecha local informada por el entorno: 2026-09-26.
- El rollback Store-only `2ba4ddf0` está integrado en `main`; al iniciar esta recuperación, `HEAD` y `origin/main` coincidían en `2df046f5`.
- La recuperación actual sanea/prueba la suite de Store y algunos estados compartidos del Studio. No modificó el runtime de Landing ni `proyectos/`; los worktrees adicionales inspeccionados estaban limpios.
- Verificación Store observada: `check:full` completó; smoke full 109/109 y los 63 fallos del snapshot funcional previo se reejecutaron de forma individual o focal y pasaron. No se repitió la suite funcional reducida completa de 450 casos. Los tests de producto Landing siguen `not_run`.
- PRE-0 no está aprobado: el siguiente paso necesita un commit base limpio tras cerrar esta recuperación y autorización explícita para implementar Landing V2. El rollback no cuenta por sí solo como aceptación de esa fase.
- No existe aceptación visual ni del bucle local/F5; todavía no hay un sitio Landing que inspeccionar.

## Registro de fases

Agregar una fila únicamente al cerrar una subfase:

| Fase | Commit base -> commit | Gates ejecutados y exit codes | F0 | Resultado | Revisión/GO humano | Riesgo abierto |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | Sin fases ejecutadas | — | Baseline y autorización pendientes |

No cambiar `not_run` a `pass` por lectura estática, CI verde vacío, pruebas de una fase diferente o resultado recordado sin evidencia reproducible.
