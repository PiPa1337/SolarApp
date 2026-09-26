# Protocolo corto — Landing V2

Este paquete permite ejecutar el plan con poco contexto y reduce cambios fuera de alcance. El detalle y la razón de las decisiones viven en [`../../planlandingv2.md`](../../planlandingv2.md).

## Orden de lectura

1. `AGENTS.md` del repositorio y cualquier instrucción explícita del usuario.
2. `CONTRACT.md`: invariantes que ninguna fase puede cambiar.
3. `STATE.md`: estado/evidencia real del trabajo.
4. `ACTIVE_PHASE.md`: única fase habilitada para la sesión. Ahora no hay fase activa.
5. Sólo la sección/subsección correspondiente de `planlandingv2.md`, encontrada por su encabezado con `rg`; no releer el plan entero por defecto.

Precedencia: las instrucciones del usuario y `AGENTS.md` gobiernan el alcance; `CONTRACT.md` fija las invariantes; el plan maestro define los requisitos técnicos; `STATE.md` registra hechos; `ACTIVE_PHASE.md` limita el trabajo derivado de esos requisitos. Si una fuente contradice otra, no elegir en silencio: detenerse y resolver la contradicción antes de editar código.

## Ciclo de una fase

1. La implementación necesita autorización explícita del usuario. Luego se completa PRE-0 y se fija un commit base limpio y aceptado; no se limpia, guarda ni mueve trabajo concurrente.
2. Antes de editar, convertir **una sola** subfase del plan en un paquete activo con: objetivo, precondiciones/evidencia, archivos permitidos, exclusiones, pruebas/comandos exactos, resultado esperado, rollback/datos afectados y aprobación manual necesaria.
3. Si la auditoría de la fase descubre una dependencia no prevista, parar. Actualizar plan/paquete antes de ampliar el diff. Ningún archivo fuera de la allowlist se incorpora “porque hizo falta”.
4. Ejecutar sólo esa subfase. Mantener un escritor y un commit revertible por unidad funcional. No hacer `git add -A` en un árbol mixto.
5. Ejecutar los gates del paquete, registrar comando, código de salida y evidencia verificable en `STATE.md`. “No corrido” nunca equivale a verde. Actualizar el paquete y el estado antes de cambiar de fase.
6. Si hay un GO humano, esperar su aceptación literal y anotarla. Tests, screenshots, inferencias o silencio no la reemplazan.

## Límites de contexto y handoff

- Mantener `CONTRACT.md` y `STATE.md` cargados; leer sólo el encabezado activo del plan maestro.
- El resumen para otro agente debe caber en `STATE.md` + `ACTIVE_PHASE.md`: fase exacta, commit base, cambios/evidencia, fallos, decisión humana pendiente y siguiente acción.
- No delegar dos agentes sobre los mismos paths. Un subagente puede auditar en lectura; un único escritor integra.
- Si el contexto se pierde, reconstruir desde Git y los archivos de estado; no confiar en memoria conversacional ni repetir una fase ya registrada como verde.
- El verde CI del repositorio no reemplaza gates de producto. Reportar exactamente qué se ejecutó.

## Alcance vigente

Este paquete describe **planificación**, no autoriza cambios de producto. V1 apunta a una página con Hero, Benefits, Media y CTA; Header/Footer reutilizan datos globales y Announcement es opcional. El diseño empieza como wireframe DEV en código y comparte el render boundary que después consumen Preview/export/editor. Rutas multipágina y variantes adicionales son post-V1.
