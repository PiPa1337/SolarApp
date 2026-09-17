# Guía de búsqueda de contactos en Instagram con Codex

Estado: borrador en construcción<br>
Canal: extensión de Codex para Chrome<br>
Resultado esperado: listado revisado de perfiles potencialmente relevantes

## Objetivo

Documentar, paso por paso, el procedimiento acordado para buscar perfiles de
clientes potenciales en Instagram y agregarlos a un listado.

Esta guía se completa con las instrucciones exactas del usuario. No se deben
inferir criterios, campos ni acciones que todavía no hayan sido definidos.

## Alcance

- Cuenta de Instagram que se utilizará: pendiente de definir.
- Tipo de cliente buscado: pendiente de definir.
- Criterios de búsqueda: pendiente de definir.
- Campos del listado: pendiente de definir.
- Ubicación y formato del listado: pendiente de definir.

## Procedimiento

### 1. Abrir la sección de perfiles sugeridos

Con la extensión de Codex para Chrome conectada a la sesión de Instagram, abrir
exactamente esta dirección:

<https://www.instagram.com/explore/people/>

En esa página se muestran perfiles en un listado. Cada entrada puede incluir la
foto de perfil, el nombre de usuario, el nombre visible, una referencia de
seguimiento y el botón `Follow`.

La captura adjunta es una referencia visual del listado esperado. No agrega
criterios de selección ni autoriza a seguir perfiles; esos pasos quedan
pendientes de definir.

### 2. Abrir y evaluar cada perfil uno por uno

Desde el listado, abrir los perfiles individualmente y revisar la información
visible de cada uno.

Para cada perfil, registrar:

- nombre de usuario;
- link del perfil de Instagram;
- número de teléfono, sólo si aparece visible en el perfil;
- evaluación del 1 al 10 sobre cuánto le conviene tener una tienda web;
- explicación muy resumida de esa evaluación.

La segunda captura adjunta es una referencia visual de un perfil abierto para
realizar esta evaluación. No se deben copiar sus datos al listado salvo que el
perfil se esté procesando en ese momento.

### 3. Clasificar y guardar el perfil según su aptitud

Después de revisar el perfil y asignar la evaluación, clasificarlo como `Apto`
o `No apto` según el criterio acordado.

- Si es `Apto`, dar `Follow` y anotar sus datos en el listado de clientes de la
  sesión de trabajo actual.
- Si es `No apto`, no dar `Follow` y anotar sus datos en el listado de no aptos
  de la sesión de trabajo actual.

El puntaje mínimo que define cuándo un perfil es `Apto` queda pendiente de
definir.

### 4. Revisar y cerrar la tanda

Revisar que cada perfil haya quedado en el listado correcto de la sesión actual
y que la acción `Follow` se haya realizado sólo para los perfiles `Aptos`.

La forma de guardar los listados y de continuar en otra sesión queda pendiente
de definir.

## Listado de contactos

Cada sesión de trabajo genera dos listados independientes:

1. listado de clientes (`Aptos`);
2. listado de no aptos (`No aptos`).

Cada registro debe contener, como mínimo, estos datos:

| Campo | Contenido |
| --- | --- |
| Nombre de usuario | Usuario de Instagram del perfil |
| Link de Instagram | URL directa al perfil |
| Teléfono | Número visible en el perfil, si existe |
| Conveniencia de tienda web | Evaluación de 1 a 10 |
| Motivo resumido | Justificación breve de la evaluación |
| Clasificación | `Apto` o `No apto` |

El formato final del listado y el significado de sus estados quedan pendientes
de definir.

## Límites y decisiones pendientes

- Acciones permitidas en Instagram: pendiente de definir.
- Acciones que requieren aprobación antes de ejecutarse: pendiente de definir.
- Cantidad máxima por tanda: pendiente de definir.
- Tratamiento de perfiles repetidos: pendiente de definir.
- Tratamiento de perfiles privados o sin datos públicos: pendiente de definir.
- Criterio para detener la búsqueda: pendiente de definir.
- Puntaje mínimo para clasificar un perfil como `Apto`: pendiente de definir.

## Historial de cambios de esta guía

- Borrador inicial creado para completar el procedimiento junto con el usuario.
