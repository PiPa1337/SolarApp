# Índice de documentación

Punto de entrada único para encontrar la doc activa en ≤2 saltos.
Los documentos históricos/auditorías cerradas viven en `docs/archive/`.

| Documento | Qué es | Cuándo consultarlo |
| --- | --- | --- |
| `AGENTS.md` (raíz) | Contrato operativo del repo | Antes de cualquier tarea |
| `ARCHITECTURE.md` | Capas, flujo de datos, ciclo de vida | Cambios de arquitectura o renderer |
| `architecture-decisions.md` | ADRs y razones de decisiones estructurales | Entender por qué existe una decisión vigente |
| `PROJECT_MAP.md` | Mapa archivo → funcionalidad | Localizar dónde editar |
| `DATA_MODEL.md` | Contrato StoreProjectV2 y migraciones | Tocar schema o persistencia |
| `MEDIA_OPTIMIZATION.md` | Receta WebP/responsive y baseline de resolución | Optimizar o auditar imágenes |
| `TESTING.md` | Gates, budgets y convenciones de test | Correr o agregar tests |
| `TECHNICAL_DEBT.md` | Deuda abierta/resuelta con evidencia | Antes de reportar un bug conocido |
| `INTEGRATIONS.md` | Servidor local, hash sha256 y compatibilidad legacy ZIP | Tocar persistencia o endpoints |
| `LOCAL_OPERATION.md` | Ejecución local Node/navegador, backups y layout | Mover, respaldar o diagnosticar una instalación |
| `DATA_STORAGE_SAFETY.md` | Contrato para reemplazos/migraciones de `proyectos/` | Antes de tocar el árbol comercial en forma masiva |
| `AI_AGENT_GUIDE.md` | MCP/JSONL, SDK y flujo seguro para IA | Crear o automatizar tiendas |
| `agent-protocol-v1.schema.json` | Contrato machine-readable del agente | Generar clientes o validadores |
| `STOREFRONT_V2.md` | Familia visual V2 y compatibilidad V1 | Trabajo de módulos/tema |
| `LIVE_CANVAS.md` | Contrato y cobertura de Live Canvas | Cambios de bindings o edición visual |
| `SECURITY.md` | Seguridad del storefront y referencias a superficies relacionadas | Revisiones de seguridad |
| `backup-and-recovery.md` | Respaldo `.solara.json` y recovery drafts | Flujos de guardado |
| `product-spec.md` | Spec de producto resumida | Contexto de negocio |
| `PERPETUAL_PLAN_APP_10X.md` | Plan QA perpetuo activo | Invocación "plan perpetuo" |
| `PERPETUAL_QA_BACKLOG.md` + `perpetual-state.json` | Backlog y estado del run perpetuo | Continuar el ciclo QA |
| `release-candidate.md` | Checklist de release | Cierre de versión |
| `pilot-checklist.md` | Checklist de export piloto | Validar exportaciones |
| `UI_SCALE.md` | Escala de espaciado y radios (editor + storefront) | Cambios visuales o CSS |
| `DEVELOPMENT.md` | Setup, estructura del monorepo, pipeline, comandos | Onboarding o referencia diaria |
| `STOREFRONT_ARCHITECTURE.md` | CSS del storefront: módulos, breakpoints, variables | Trabajo de estilos o módulos |
| `GUARDIANS.md` | Catálogo de specs guardianes (geométricos, adversariales, seguridad) | Antes de agregar tests o cambiar layout |
| `FULL_REFERENCE.md` | Mapa liviano hacia fuentes autoritativas | Navegación temática sin duplicar snapshots |
| `MUSE_SPARK_1.2.md` | Preferencias del perfil Muse, sin duplicar contratos | Sólo al usar ese perfil de colaboración |

## Regla de archivo

Las auditorías puntuales y planes cerrados se mueven a `docs/archive/`
(ej: auditorías fechadas, revisiones arquitectónicas). No se borran: quedan
como referencia histórica fuera del nivel principal.

`PORTABILITY.md` se conserva como alias histórico hacia `LOCAL_OPERATION.md`;
no es una fuente operativa adicional.
