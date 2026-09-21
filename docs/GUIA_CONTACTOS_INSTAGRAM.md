# Guía de búsqueda de contactos en Instagram con Codex

Estado: guía operativa<br>
Canal: extensión de Codex para Chrome<br>
Resultado esperado: dos listados Markdown locales por sesión diaria

## Objetivo

Documentar, paso por paso, el procedimiento para buscar perfiles comerciales en
Instagram, evaluar su conveniencia de tener una tienda web y separarlos en un
listado de clientes o de no aptos.

## Alcance

- Fuente: <https://www.instagram.com/explore/people/>.
- Se acepta un perfil sólo si ofrece un catálogo repetible con variedad
  suficiente y existe una oportunidad real de crearle una tienda propia.
- Los perfiles de servicios puros no son candidatos para venderles un
  ecommerce, aunque podrían necesitar otro tipo de sitio web.
- No considerar aptos una línea demasiado estrecha o de un solo producto, los
  alimentos muy perecederos sin un catálogo razonable, los trabajos
  personalizados sólo por encargo, los emprendimientos tan pequeños que no
  tienen una operación repetible, los revendedores que no necesitan un
  catálogo propio ni las empresas grandes que ya tienen ecommerce.
- El tamaño o el carácter artesanal no descalifica por sí solo: un negocio
  chico puede ser apto si muestra modelos repetibles, variedad suficiente y
  una oportunidad clara de ordenar sus pedidos.
- Una sesión equivale a un día calendario.
- Los datos se guardan localmente dentro de `.clientes/` y no se publican en
  GitHub.

## Procedimiento

### 1. Preparar la sesión y la pestaña base

Con la extensión de Codex para Chrome conectada a la sesión de Instagram, abrir
exactamente esta dirección:

<https://www.instagram.com/explore/people/>

Mantener esta pestaña como pestaña base durante toda la sesión. Al finalizar,
será la única pestaña de Instagram que permanecerá abierta.

En esa página se muestran perfiles en un listado. Cada entrada puede incluir la
foto de perfil, el nombre de usuario, el nombre visible, una referencia de
seguimiento y el botón `Follow`.

La captura adjunta es una referencia visual del listado esperado. No agrega
criterios de selección adicionales.

### 2. Abrir perfiles en pestañas nuevas y recopilar datos

Recorrer el listado en orden. Para cada perfil que todavía no esté registrado
en sesiones anteriores, abrir una pestaña nueva de Chrome y revisar allí la
información visible.

Procesar un perfil por vez y mantener abiertas las pestañas de los perfiles para
volver a ellas durante la etapa final de `Follow`.

Después de revisar los perfiles disponibles inicialmente, cargar más perfiles y
continuar en el mismo orden. Repetir hasta que cargar más ya no agregue perfiles
nuevos que no hayan sido revisados.

Cuando el usuario pida procesar varias tandas de perfiles, asignar primero un
identificador secuencial (`T01`, `T02`, etc.) y registrar la hora de inicio en
`sesion.md`. Cerrar cada tanda en este orden: terminar la evaluación de sus
perfiles, clasificarla, actualizar el estado de cada entrada, dar `Follow` a
todos los perfiles analizados de la tanda (aptos y no aptos) y registrar el
resultado individual de cada acción. Usar un intervalo variable de 5, 6 o 7
segundos entre acciones, sin intentar evadir controles de Instagram. Verificar
que cada cuenta figure como `Following` o dejar un estado terminal explícito si
la acción no pudo confirmarse. No refrescar antes de cerrar el registro de la
tanda. Recién después volver a la pestaña base, refrescar exactamente
`https://www.instagram.com/explore/people/`, esperar a que el listado termine
de cargar, registrar la hora de refresco y continuar con la siguiente tanda.
Volver a comprobar los perfiles ya registrados después del refresco para no
repetirlos.

El límite operativo vigente es de **90 clics o solicitudes nuevas de `Follow`
por sesión**, en un máximo de **tres tandas de hasta 30 acciones** (`T01`,
`T02` y `T03`). Sólo consume presupuesto una acción real después de revisar el
perfil: hacer clic en `Follow` o enviar una solicitud a una cuenta privada. Un
clic que falla o no llega a mostrar `Following` también consume 1, porque la
acción se intentó. `Ya seguido` y `No corresponde` no consumen presupuesto
porque no se hace clic. Al alcanzar 90 acciones, cerrar la sesión y conservar
la pestaña base; no iniciar una cuarta tanda el mismo día. Este límite es una
medida de reducción de riesgo, no una garantía de que Instagram no aplique una
restricción.

Las pestañas se mantienen abiertas para organizar el flujo de revisión; no se
usan para evadir CAPTCHA, verificaciones ni otros controles de Instagram.

Para cada perfil revisado, recopilar:

- nombre de usuario;
- link del perfil de Instagram;
- número de teléfono, sólo si aparece visible en el perfil;
- cantidad de seguidores visible;
- actividad visible y tipo de oferta;
- forma actual de recibir pedidos, pagos, envíos o consultas;
- si ya tiene una tienda ecommerce propia visible en la bio o en el enlace del
  perfil;
- información necesaria para la evaluación final.

La segunda captura adjunta es una referencia visual de un perfil abierto para
realizar esta evaluación. No se deben copiar sus datos al listado salvo que el
perfil se esté procesando en ese momento.

### 2 bis. Asignar una identidad auditable a cada entrada

Cada perfil que se incorpora a una tanda debe recibir un identificador único con
el formato `DD-MM-AAAA-TNN-ENNN`, por ejemplo
`21-09-2026-T01-E001`. El identificador no cambia si se actualiza la
evaluación, se reintenta una acción o se retoma la sesión después de una pausa.

Para cada entrada, guardar siempre estos datos, incluso si el perfil termina
siendo no apto:

- `ID de entrada` y `Tanda`;
- `Estado de análisis` y hora de evaluación;
- usuario, URL, teléfono, seguidores, motivo y clasificación;
- cantidad de intentos de `Follow`;
- `Estado de Follow`, hora de la última verificación y última observación o
  error.

No considerar equivalentes estos hechos:

1. `Analizado`: el perfil fue abierto y evaluado.
2. `Intento realizado`: se hizo clic o se envió una solicitud, pero todavía no
   hay confirmación suficiente.
3. `Following confirmado`: después de la acción, la interfaz mostró
   `Following`.
4. `Ya seguido`: la interfaz ya mostraba `Following` antes de la acción y no se
   hizo clic nuevamente.

Guardar el registro después de cada perfil evaluado y después de cada intento
de `Follow`, no sólo al final de la tanda. Así, una interrupción no convierte
un perfil simplemente analizado en un perfil erróneamente contado como seguido.

### 3. Evitar duplicados

Antes de registrar un perfil, comprobar su nombre de usuario y link contra los
listados de sesiones anteriores. Si ya aparece en cualquier listado anterior,
no volver a registrarlo ni ejecutar `Follow` por segunda vez. Anotar el caso en
`sesion.md` como `Duplicado histórico`, indicando la sesión donde se encontró,
sin contarlo como perfil nuevo analizado de la tanda actual.

### 4. Puntuar el encaje real con ecommerce

No ejecutar `Follow` mientras se está abriendo y leyendo un perfil. Después de
recopilar todos los perfiles de la tanda actual, aplicar estos filtros de
descarte, puntuar la tanda y completar sus `Follow` antes de refrescar para la
siguiente tanda:

1. ¿Hay productos estándar o modelos repetibles, y no sólo un servicio o un
   trabajo hecho a medida?
2. ¿Hay suficiente variedad para un catálogo real, y no sólo un producto o una
   línea demasiado estrecha?
3. ¿El producto se puede vender con una operación razonable de pedido, entrega
   o retiro, sin depender de una perecibilidad que vuelva inútil el catálogo?
4. ¿El negocio necesita una tienda propia y no es una empresa grande que ya la
   tiene o un revendedor que sólo deriva al catálogo de un tercero?

Si alguna respuesta es negativa, clasificar como `No apto` y explicar el
motivo. Sólo si las cuatro respuestas son positivas se debe considerar `Apto`.
Después evaluar si la oferta puede venderse mediante catálogo, pedido, pago,
envío o retiro y si el negocio realmente se beneficiaría de crear una tienda.

Usar esta escala:

- `9–10`: catálogo suficiente, varias categorías o variantes, actividad
  comercial fuerte y una oportunidad clara de ordenar o ampliar sus ventas;
- `7–8`: productos repetibles y variedad clara, con buena oportunidad de
  catálogo aunque el proceso actual sea limitado;
- `5–6`: negocio chico o artesanal, pero con modelos repetibles y una línea
  todavía válida para una tienda inicial;
- `1–4`: servicio puro, perfil personal, perfil privado o falta de evidencia
  suficiente de productos vendibles online; también una línea de un solo
  producto, perecederos sin catálogo razonable, trabajos sólo por encargo,
  operación no repetible por ser demasiado chica, reventa sin necesidad de
  catálogo propio o empresa que ya tiene ecommerce.

La cantidad de seguidores es sólo evidencia secundaria. No puede convertir por
sí sola un servicio de manicura, taxi, peluquería, asesoría o similar en un
candidato ecommerce ni convertir una cuenta grande en prospecto si ya tiene
tienda. Del mismo modo, una cuenta chica no debe descartarse automáticamente
si cumple los cuatro filtros.

La evaluación se expresa del 1 al 10 y debe incluir una explicación de una sola
frase, muy resumida.

### 5. Clasificar y guardar el perfil según su aptitud

Después de revisar el perfil y asignar la evaluación, clasificarlo como `Apto`
o `No apto` según el criterio acordado.

- Una puntuación de 5 a 10 es `Apto`.
- Una puntuación de 1 a 4 es `No apto`.
- Si es `Apto`, anotarlo en `clientes.md`.
- Si es `No apto`, anotarlo en `no-aptos.md`.
- Al cerrar la tanda, dar `Follow` a todos los perfiles analizados, aptos y no
  aptos, en las pestañas que ya estaban abiertas para esos perfiles,
  respetando un intervalo variable de 5, 6 o 7 segundos y verificando
  `Following`.
- Si el perfil ya era seguido, registrarlo con estado `Ya seguido` y no repetir
  la acción.
- Antes de cada acción, cambiar el estado a `Pendiente` y aumentar el contador
  de intentos sólo cuando realmente se haga clic o se envíe una solicitud.
- Registrar `Following confirmado` únicamente cuando la interfaz muestre
  `Following` después de la acción. `Realizado` queda reservado como alias
  histórico y no debe usarse en sesiones nuevas.
- No usar `No corresponde` en sesiones nuevas: si la regla exige `Follow` y no
  se pudo ejecutar, registrar la causa real como `Intento fallido`, `Solicitud
  enviada`, `Bloqueado antes del intento` o `No verificado`.
- No ejecutar likes, comentarios ni mensajes.

### 6. Revisar y cerrar la sesión

Verificar que cada perfil revisado figure en un único listado, que todos tengan
su evaluación y que `Follow` se haya realizado para todos los perfiles
analizados, salvo los que ya figuraban como `Ya seguido`. Antes de cerrar,
comprobar la suma de estados: perfiles analizados = `Following confirmado` +
`Ya seguido` + `Solicitud enviada` + `Intento fallido` + `Bloqueado antes del
intento` + `No verificado`.

Cerrar todas las pestañas de perfiles y conservar abierta únicamente la pestaña
base de <https://www.instagram.com/explore/people/>.

Guardar ambos listados y `sesion.md`. El resumen debe incluir la cantidad de
perfiles aptos, no aptos, `Following confirmado`, `Ya seguido`, solicitudes
enviadas, intentos fallidos, perfiles bloqueados antes del intento y perfiles
no verificados, además de la cantidad de tandas iniciadas, completadas e
interrumpidas.

Si la sesión se interrumpe, conservar los registros ya guardados y continuar en
los mismos archivos del día.

### 7. Pausar ante alertas

Si Instagram muestra CAPTCHA, verificación, bloqueo, alerta de seguridad,
problema de sesión o cualquier solicitud inesperada, detener la actividad,
guardar los datos recopilados y esperar una decisión del usuario.

En cada entrada afectada, registrar uno de estos estados según lo que realmente
ocurrió:

- `Bloqueado antes del intento`: no se hizo clic porque la alerta apareció
  antes de la acción;
- `Intento fallido`: se intentó la acción, pero apareció un error o no se pudo
  confirmar `Following`;
- `No verificado`: la pestaña o la sesión no permitió comprobar el resultado;
- `Solicitud enviada`: cuenta privada cuya solicitud quedó pendiente.

No reintentar automáticamente después de una alerta y no registrar `Realizado`
si no existe confirmación visible.

No intentar evadir ni automatizar la resolución de esos controles.

### 8. Formato de resultados en el chat

Al devolver resultados en el chat, usar texto plano copiable, no tablas ni
hipervínculos Markdown. La URL debe aparecer completa y literal con el prefijo
`https://`; no usar formatos como `[Instagram](https://...)` ni ocultar la URL
detrás de un texto.

Separar cada resultado con punto final, un renglón en blanco y el resultado
siguiente. Incluir siempre el nombre de usuario, el link literal y una razón
breve de selección. Incluir el teléfono sólo si aparece visible; si no existe,
omitir por completo ese campo.

Formato obligatorio:

```text
@usuario. Link: https://www.instagram.com/usuario/. Teléfono: +549XXXXXXXXXX. Razón: catálogo repetible y oportunidad real de ecommerce.

@siguiente_usuario. Link: https://www.instagram.com/siguiente_usuario/. Razón: productos claros y necesidad de ordenar pedidos.
```

Separar los bloques de `Aptos` y `No aptos` con un encabezado simple, sin
alterar el formato individual de cada resultado.

## Listado de contactos

Cada sesión diaria genera dos listados independientes dentro de una carpeta por
fecha:

1. `.clientes/DD-MM-AAAA/clientes.md` para perfiles `Aptos`;
2. `.clientes/DD-MM-AAAA/no-aptos.md` para perfiles `No aptos`.

Cada archivo usa una tabla por sesión. Cada registro contiene:

| Campo | Contenido |
| --- | --- |
| ID de entrada | Identificador estable `DD-MM-AAAA-TNN-ENNN` |
| Tanda | Identificador secuencial de la tanda, por ejemplo `T01` |
| Nombre de usuario | Usuario de Instagram del perfil |
| Link de Instagram | URL directa al perfil |
| Teléfono | Número visible en el perfil; dejar vacío si no aparece |
| Seguidores | Cantidad visible como evidencia secundaria |
| Conveniencia de tienda web | Encaje real con ecommerce, de 1 a 10; apto desde 5 |
| Motivo resumido | Justificación breve de la evaluación |
| Clasificación | `Apto` o `No apto` |
| Estado de análisis | `Evaluado`, `No evaluable`, `Duplicado histórico` o `Interrumpido` |
| Hora de evaluación | Hora local en formato `AAAA-MM-DD HH:mm:ss` |
| Intentos de Follow | Número de clics o solicitudes realmente ejecutados |
| Estado de Follow | `Pendiente`, `Following confirmado`, `Ya seguido`, `Solicitud enviada`, `Intento fallido`, `Bloqueado antes del intento` o `No verificado` |
| Última verificación | Hora local de la última comprobación visible |
| Última observación/error | Mensaje breve y literal del bloqueo, error o contexto relevante |

Los perfiles privados o con información insuficiente se registran en
`no-aptos.md` con un motivo breve que indique que no pudieron evaluarse con la
información visible.

## Carpeta `.clientes`

`.clientes/` es una carpeta local para guardar los listados de prospección de
Instagram separados por día. Contiene datos de trabajo y no forma parte del
código, del sitio público ni de la documentación que se publica.

La carpeta completa está excluida de Git mediante `.gitignore`. No se deben
subir sus listados a GitHub ni incluir datos reales de clientes en commits.

Cuando se reclasifiquen resultados históricos, conservar el estado previo de
`Follow` y marcarlo como `Realizado (histórico; revisar)` si contradice la
clasificación actual. Ese estado no confirma una verificación nueva ni deshace
la acción en Instagram.

## Registro de sesión y de tandas

Además de `clientes.md` y `no-aptos.md`, cada sesión debe crear
`.clientes/DD-MM-AAAA/sesion.md`. Este archivo es la bitácora de control y debe
permitir reconstruir qué ocurrió sin depender del historial del chat.

Debe contener:

- fecha, zona horaria, URL base y hora de inicio y cierre;
- límite operativo de la sesión: 90 clics/solicitudes de `Follow`, tres tandas
  máximas de 30 acciones;
- cantidad total de perfiles detectados, nuevos, duplicados y analizados;
- contador total de clics/solicitudes de `Follow` y contadores separados de
  `Following confirmado`, `Ya seguido`, `Solicitud enviada`, `Intento fallido`,
  `Bloqueado antes del intento` y `No verificado`;
- último `ID de entrada` procesado y próxima acción pendiente si la sesión se
  interrumpe;
- una fila por tanda, con su estado y el momento exacto del refresco;
- una sección de incidentes con CAPTCHA, bloqueo, error de carga o cambio de
  sesión.

Usar como mínimo esta tabla por sesión:

| Tanda | Inicio | Fin | Entradas nuevas | Analizadas | Clicks/solicitudes Follow | Following confirmado | Ya seguido | Pendientes/no verificadas | Refresco | Estado | Último ID |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| `T01` | `AAAA-MM-DD HH:mm:ss` | `AAAA-MM-DD HH:mm:ss` | 0 | 0 | 0 | 0 | 0 | 0 | `completado` / `no realizado` | `completa` / `interrumpida` | `DD-MM-AAAA-T01-ENNN` |

Una tanda sólo puede marcarse como `completa` cuando todas sus entradas tienen
un estado terminal y el refresco de la pestaña base quedó registrado. Si se
detiene por bloqueo o error, marcarla como `interrumpida`, conservar el último
ID y continuar otro día desde ese punto sin inventar resultados.

## Límites operativos

- Las únicas acciones permitidas son abrir perfiles y dar `Follow` a todos los
  perfiles analizados, aptos y no aptos.
- No se realizan likes, comentarios, mensajes ni cambios en la cuenta.
- El máximo es de 90 clics o solicitudes nuevas de `Follow` por sesión,
  distribuidos en tres tandas de hasta 30 acciones; al llegar al límite se
  cierra la sesión aunque queden perfiles visibles.
- `Ya seguido` y `No corresponde` no consumen el límite porque no implican un
  clic. Todo clic o solicitud realmente ejecutado consume 1, incluso si falla o
  queda sin verificar.
- La actividad de pestañas no debe utilizarse para evadir controles de
  seguridad de Instagram.
- Ante cualquier alerta o bloqueo, se pausa y se guardan los resultados.

## Historial de cambios de esta guía

- Guía operativa completada con el flujo diario y los listados locales separados.
- Se corrigió la evaluación para priorizar el encaje real con ecommerce y no la
  cantidad de seguidores.
- Se estableció que cada tanda debe dar `Follow` a todos los perfiles
  analizados, incluidos los `No apto`, antes de refrescar la página.
- Se agregó trazabilidad por entrada y por tanda: estados separados de análisis,
  intento y confirmación de `Follow`, junto con `sesion.md` e incidentes.
- Se fijó un límite operativo de 90 clics/solicitudes nuevas de `Follow` por
  sesión, en tres tandas de 30 acciones.
