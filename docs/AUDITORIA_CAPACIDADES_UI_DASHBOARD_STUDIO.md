# Auditoría de capacidades UI — Dashboard y Studio

Fecha de auditoría: 2026-09-07 (segunda pasada)

Total verificado: **492 capacidades / IDs únicos**.

## Objetivo

Este documento inventaría las capacidades expuestas hoy por la UI interna de SolaraCommerce para identificar y preservar las funciones reales de la aplicación durante un rework completo. Los controles y mecanismos de interacción actuales se registran como evidencia de acceso a esas funciones, no como requisitos para la futura UI o UX.

La auditoría se centra en qué puede hacer el usuario, qué controles existen, qué estados condicionan esas acciones y qué efecto producen. No evalúa calidad visual, estética, usabilidad, densidad, accesibilidad percibida ni diseño de interacción.

## Alcance

Incluido:

- Dashboard de tiendas.
- Shell global de Studio.
- Preparar.
- Resumen.
- Catálogo.
- Constructor.
- Tema de la tienda.
- Recursos.
- SEO.
- Exportar.
- Preview interno y edición en canvas.
- Diálogos, confirmaciones, shortcuts y estados transversales.
- Diferencias entre ejecución administrada por `Abrir SolaraCommerce.cmd` y ejecución sólo en navegador.

Excluido deliberadamente:

- El storefront generado.
- El HTML/CSS/JS exportado para clientes finales.
- Checkout público por WhatsApp.
- Páginas públicas generadas.
- Calidad visual/UX actual.

## Regla de paridad para el rework

Cada ID debe revisarse durante el rework para identificar su función subyacente. Las operaciones, invariantes, datos, precondiciones, persistencia, recuperación e integraciones deben conservar equivalencia funcional. Los IDs que sólo describen una mecánica de la UI actual pueden reemplazarse o desaparecer una vez comprobado que no contienen una función propia.

---

## 1. App y Dashboard

| ID | Superficie / control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| DASH-001 | Wordmark SolaraCommerce | Volver/iniciar navegación desde la aplicación | Siempre visible en el header principal | Lleva al inicio correspondiente de la app |
| DASH-002 | Navegación `Tiendas` | Ir al Dashboard de tiendas | Desde shell superior | Cambia a la vista de tiendas |
| DASH-003 | `Cerrar app` | Cerrar la aplicación local y detener el servidor administrado | Sólo con sesión administrada activa | Abre confirmación de cierre |
| DASH-004 | Cerrar mensaje global | Descartar error global de aplicación | Cuando existe error | Limpia el mensaje |
| DASH-005 | Cerrar aviso global | Descartar aviso global de aplicación | Cuando existe aviso | Limpia el aviso |
| DASH-006 | `Importar respaldo` desde aviso de recuperación | Elegir un respaldo local para restaurar/importar | Cuando la app ofrece recuperación externa | Abre selector de archivo |
| DASH-007 | Diálogo RecoveryDraft — `Recuperar borrador` | Restaurar el borrador de recuperación local | Cuando existe RecoveryDraft pendiente | Reemplaza el estado cargado con el borrador recuperado |
| DASH-008 | Diálogo RecoveryDraft — `Exportar borrador` | Descargar una copia del borrador antes de decidir | Cuando existe RecoveryDraft pendiente | Genera respaldo descargable |
| DASH-009 | Diálogo RecoveryDraft — `Descartar borrador` | Iniciar descarte del borrador | Cuando existe RecoveryDraft pendiente | Abre segundo paso destructivo |
| DASH-010 | Diálogo RecoveryDraft — `Cerrar sin borrar` | Cerrar el aviso conservando el RecoveryDraft | Cuando existe RecoveryDraft pendiente | No elimina el borrador |
| DASH-011 | Confirmación `Descartar definitivamente` | Borrar definitivamente el RecoveryDraft | Después de iniciar descarte | Elimina el borrador local |
| DASH-012 | Confirmación de descarte — `Volver` | Cancelar descarte destructivo | Segundo paso de descarte | Regresa al diálogo de recuperación |
| DASH-013 | `Nueva tienda` | Abrir el asistente de creación | Dashboard | Abre wizard de nueva tienda |
| DASH-017 | Búsqueda de tienda | Filtrar proyectos por texto | Dashboard | Reduce la lista visible |
| DASH-018 | Atajo `/` | Llevar foco al buscador | Dashboard, fuera de edición de texto incompatible | Facilita iniciar búsqueda |
| DASH-019 | Limpiar búsqueda | Vaciar búsqueda actual | Cuando el buscador tiene texto | Restaura el conjunto filtrado |
| DASH-020 | Filtro de estado | Filtrar `Todas`, `Activas`, `Archivadas` | Dashboard | Cambia subconjunto visible |
| DASH-021 | Orden de tiendas | Ordenar por `Última modificación`, `Nombre A-Z` o `Más productos` | Dashboard | Reordena resultados |
| DASH-022 | Vista grilla | Mostrar tarjetas en grilla | Dashboard | Cambia presentación del listado |
| DASH-023 | Vista lista | Mostrar tiendas en lista | Dashboard | Cambia presentación del listado |
| DASH-024 | `Comparar tiendas` | Entrar/salir del modo comparación | Dashboard | Habilita selección múltiple de tiendas |
| DASH-025 | Checkbox de comparación por tienda | Agregar/quitar una tienda de la comparación | Modo comparación | Actualiza selección comparativa |
| DASH-026 | `Comparar` | Abrir comparación de tiendas seleccionadas | Cantidad mínima válida seleccionada | Abre vista comparativa |
| DASH-027 | `Cancelar` comparación | Salir del modo comparación | Modo comparación | Limpia/cierra selección comparativa |
| DASH-028 | `Respaldar todo` | Crear respaldos de todas las tiendas | Sólo modo administrado | Ejecuta respaldo masivo en disco |
| DASH-029 | Fijar tienda | Marcar una tienda como fijada | Tarjeta de tienda | Cambia prioridad/pin persistido |
| DASH-030 | Quitar de fijadas | Desmarcar pin | Tienda fijada | Elimina prioridad/pin |
| DASH-031 | Seleccionar tarjeta de tienda | Mostrar detalle de una tienda | Listado Dashboard | Actualiza panel de detalle |
| DASH-032 | Abrir tienda | Entrar al Studio desde la información de la tienda | Panel de información | Abre proyecto en editor |
| DASH-033 | Cerrar detalle | Cerrar panel/detalle de tienda seleccionada | Tienda seleccionada | Vuelve al estado sin selección |
| DASH-034 | `Abrir tienda` | Abrir proyecto seleccionado en Studio | Panel de detalle | Entra al editor |
| DASH-035 | `Abrir sitio público` | Abrir el sitio exportado/publicado de la tienda | Sólo cuando el runtime administrado dispone de sitio válido | Abre sitio local/publicado asociado |
| DASH-036 | `Abrir carpeta` | Abrir carpeta local del proyecto | Modo administrado / ruta disponible | Abre directorio de la tienda |
| DASH-037 | `Respaldo ahora` | Crear respaldo inmediato de la tienda | Proyecto seleccionado | Persiste backup solicitado |
| DASH-038 | `Descargar respaldo` | Descargar respaldo del proyecto | Disponible según modo/estado de persistencia | Descarga copia editable |
| DASH-039 | `Duplicar` | Iniciar duplicación de tienda | Proyecto seleccionado | Abre diálogo de nombre duplicado |
| DASH-040 | `Calculadora` | Abrir calculadora mensual | Proyecto seleccionado | Abre modal de tarifas/simulación |
| DASH-041 | Archivar tienda | Pasar tienda activa a archivada | Proyecto no protegido | Abre confirmación y cambia estado al confirmar |
| DASH-042 | Restaurar tienda | Recuperar tienda archivada | Proyecto archivado | Vuelve a estado activo |
| DASH-043 | Eliminar tienda | Iniciar eliminación definitiva | Proyecto no protegido y acción habilitada | Abre flujo destructivo con espera y doble confirmación |

### 1.1 Wizard de nueva tienda

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| DASH-044 | Cerrar wizard | Cancelar creación | Wizard abierto | Cierra sin crear |
| DASH-045 | Paso 1 — nombre comercial | Definir nombre interno/comercial | Obligatorio | Alimenta identidad del nuevo proyecto |
| DASH-046 | Paso 2 — nombre visible de marca | Definir marca visible | Wizard | Alimenta identidad pública |
| DASH-047 | Paso 3 — email | Definir contacto email inicial | Opcional | Configura contacto inicial |
| DASH-048 | Paso 3 — WhatsApp | Definir número inicial | Opcional/validado | Configura checkout/contacto inicial |
| DASH-049 | `Volver` | Retroceder un paso | Paso > 1 | Conserva datos y cambia de paso |
| DASH-050 | `Continuar` | Avanzar al siguiente paso | Datos del paso válidos | Cambia de paso |
| DASH-051 | `Crear desde plantilla` / crear | Crear nueva tienda desde la plantilla limpia | Paso final con datos válidos | Genera proyecto nuevo |
| DASH-083 | `Importar tienda` desde creación | Importar un respaldo `.json` o `.solara.json` como una tienda nueva e independiente | Archivo compatible y válido; no debe existir una importación incompatible en curso | Valida el respaldo, genera un nuevo ID de tienda, slug, URL e IDs internos del catálogo, conserva catálogo, diseño, contenido, datos legales y configuración de WhatsApp, persiste la nueva tienda según el modo de almacenamiento activo y la abre automáticamente en Studio; nunca sobrescribe la tienda de origen |

### 1.2 Duplicación y comparación

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| DASH-052 | Nombre del duplicado | Editar nombre de la nueva copia | Diálogo de duplicación | Define nombre de la copia |
| DASH-053 | `Cancelar` duplicado | Cerrar sin duplicar | Diálogo abierto | No crea copia |
| DASH-054 | `Duplicar` | Crear copia de la tienda | Nombre válido | Crea nueva tienda a partir de la seleccionada |
| DASH-055 | Cerrar comparación | Cerrar vista comparativa con botón X | Vista comparación | Regresa al Dashboard |
| DASH-056 | `Cerrar` comparación | Cerrar vista comparativa desde acción principal | Vista comparación | Regresa al Dashboard |
| DASH-057 | Comparación funcional | Comparar inventario, tema, secciones y motion entre tiendas | Vista comparación | Muestra diferencias de sólo lectura |

### 1.3 Calculadora de tarifas

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| DASH-058 | Cerrar calculadora | Cerrar modal | Modal abierto | Vuelve al detalle de tienda |
| DASH-059 | Tab `Resumen y simulación` | Ver cálculo mensual de la tienda | Modal abierto | Cambia al panel de cotización |
| DASH-060 | Tab `Configurar tarifa` | Editar tarifario global y descuento | Modal abierto | Cambia al panel de configuración |
| DASH-061 | `Base por mes` | Cambiar precio base mensual global | Configurar tarifa | Actualiza tarifario compartido |
| DASH-062 | `Del 21 al 100` | Cambiar valor por producto de primer tramo | Configurar tarifa | Actualiza tarifario compartido |
| DASH-063 | `Del 101 al 200` | Cambiar valor por producto de segundo tramo | Configurar tarifa | Actualiza tarifario compartido |
| DASH-064 | `Desde 201` | Cambiar valor por producto de tercer tramo | Configurar tarifa | Actualiza tarifario compartido |
| DASH-065 | `Descuento especial` | Definir descuento 0–100% para tienda seleccionada | Configurar tarifa | Afecta sólo la tienda actual |
| DASH-066 | `Simular cantidad` | Simular otra cantidad facturable | Resumen | Abre stepper sin modificar catálogo ni tarifa |
| DASH-067 | `Volver a la cantidad actual` | Salir de simulación | Simulación activa | Restaura cantidad real de la tienda |
| DASH-068 | `Restar un producto` | Decrementar cantidad simulada | Simulación activa | Recalcula precio |
| DASH-069 | `Cantidad facturable` | Escribir cantidad manual | Simulación activa | Recalcula precio si es válida |
| DASH-070 | `Sumar un producto` | Incrementar cantidad simulada | Simulación activa | Recalcula precio |
| DASH-071 | `Restablecer tarifa` | Armar restablecimiento del tarifario | Configurar tarifa | Activa segundo paso |
| DASH-072 | `Confirmar restablecimiento` | Restablecer tarifa por defecto | Restablecimiento armado | Reemplaza configuración global por defaults |
| DASH-073 | `Listo` | Cerrar calculadora | Modal abierto | Finaliza edición/simulación |

### 1.4 Eliminación y cierre de aplicación

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| DASH-074 | Cerrar eliminación | Cancelar diálogo destructivo | Modal de eliminación | Cierra sin borrar |
| DASH-075 | Espera de seguridad | Impedir confirmación inmediata | Modal de eliminación | Habilita acciones destructivas al terminar countdown |
| DASH-076 | `Cancelar` eliminación | Salir del flujo | Modal de eliminación | No borra tienda |
| DASH-077 | `Entiendo el riesgo` | Armar eliminación definitiva | Countdown terminado | Habilita confirmación final |
| DASH-078 | `Eliminar definitivamente` | Borrar tienda | Riesgo aceptado y countdown terminado | Elimina proyecto según backend disponible |
| DASH-079 | `Cancelar` cierre de app | Cancelar apagado | Diálogo de shutdown | Mantiene runtime activo |
| DASH-080 | `Cerrar y detener` | Cerrar UI y detener servidor administrado | Diálogo de shutdown | Finaliza sesión local |
| DASH-081 | Confirmación de archivado | Confirmar `Archivar` o cancelar | Al archivar | Cambia estado sólo tras confirmación |
| DASH-082 | Toast `Deshacer` archivado | Revertir inmediatamente un archivado recién confirmado desde el propio aviso de éxito, sin tener que cambiar el filtro del Dashboard, buscar la tienda archivada ni ejecutar manualmente el flujo de restauración | Aparece sólo después de archivar correctamente una tienda y permanece disponible mientras el toast de éxito siga visible; al pulsarlo, el aviso se descarta y se ejecuta la acción asociada | Ejecuta de nuevo la operación de estado para esa misma tienda con `archived = false`, restaurándola al conjunto de tiendas activas y dejando el Dashboard sincronizado con el estado resultante |

---

## 2. Studio — shell y capacidades globales

| ID | Superficie / control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| STUDIO-001 | `Volver a tiendas` | Regresar al Dashboard | Studio abierto | Vuelve a tiendas; si hay cambios no guardados puede confirmar |
| STUDIO-002 | Breadcrumb `Tiendas` | Regresar al Dashboard | Studio abierto | Igual que volver a tiendas |
| STUDIO-003 | Confirmación `Salir sin guardar` | Abandonar Studio descartando cambios no persistidos | Hay cambios pendientes | Regresa al Dashboard |
| STUDIO-004 | `Quedarme` | Cancelar salida | Confirmación de salida | Permanece en Studio |
| STUDIO-005 | Tab `Preparar` | Abrir resumen guiado | Siempre | Cambia superficie principal |
| STUDIO-006 | Tab `Resumen` | Abrir identidad/configuración general | Siempre | Cambia superficie principal |
| STUDIO-007 | Tab `Catálogo` | Abrir productos/categorías | Siempre | Cambia superficie principal |
| STUDIO-008 | Tab `Constructor` | Abrir estructura y módulos | Siempre | Cambia superficie principal |
| STUDIO-009 | Tab `Tema de la tienda` | Abrir tokens visuales | Siempre | Cambia superficie principal |
| STUDIO-010 | Tab `Recursos` | Abrir biblioteca de medios | Siempre | Cambia superficie principal |
| STUDIO-011 | Tab `SEO` | Abrir SEO y auditoría | Siempre | Cambia superficie principal |
| STUDIO-012 | Tab `Exportar` | Abrir backup/exportación | Siempre | Cambia superficie principal |
| STUDIO-013 | Navegación de tabs por flechas | Cambiar tab con teclado | Foco en navegación | Mueve selección/foco |
| STUDIO-014 | `Home` / `End` en tabs | Ir a primera/última tab | Foco en navegación | Navega extremos |
| STUDIO-015 | Indicador de tab con cambios | Señalar área modificada | Tab con cambios sin revisar/persistir | Estado informativo |
| STUDIO-016 | `Guardar` | Persistir proyecto y sitio válido | Modo administrado | Guarda en disco mediante repositorio local |
| STUDIO-017 | Estado `Guardado` | Informar persistencia completa | Modo administrado | Sólo lectura |
| STUDIO-018 | Estado `Cambios pendientes` | Informar dirty state | Hay cambios sin commit en disco | Sólo lectura |
| STUDIO-019 | Estado `Guardando` | Informar operación activa | Guardado en curso | Sólo lectura |
| STUDIO-020 | Estado `Error` | Informar fallo de persistencia | Guardado fallido | Habilita reintento |
| STUDIO-021 | Estado `Sitio anterior conservado` | Informar que falló nueva exportación pero se conserva sitio válido previo | Fallo de exportación durante guardado | Sólo lectura |
| STUDIO-022 | `Reintentar` guardado | Reejecutar persistencia | Error de guardado | Reintenta operación |
| STUDIO-023 | Autosave navegador | Persistir borrador/proyecto en IndexedDB | Sin runtime administrado | Guarda localmente en navegador |
| STUDIO-024 | `Reintentar` autosave | Reintentar persistencia en navegador | Fallo de autosave | Reejecuta guardado local |
| STUDIO-025 | `Ctrl/Cmd + S` | Forzar guardado/flush | Studio abierto | Llama a guardar administrado o flush de autosave |
| STUDIO-026 | `Editar en canvas` | Activar edición contextual sobre Preview | Canvas inactivo | Habilita selección editable |
| STUDIO-027 | `Salir de edición` | Desactivar canvas | Canvas activo | Vuelve a preview normal |
| STUDIO-028 | `Modo foco de la vista previa` | Maximizar foco sobre Preview | Studio normal | Reduce/oculta editor lateral según estado |
| STUDIO-029 | `Salir del modo foco` | Restaurar layout de edición | Focus mode activo | Devuelve paneles |
| STUDIO-030 | `Ctrl/Cmd + Shift + F` | Alternar focus mode | Studio abierto | Cambia modo de vista previa |
| STUDIO-031 | `Escape` | Salir del focus mode | Focus mode activo | Restaura layout |
| STUDIO-032 | Deshacer | Revertir último cambio de HistoryState | Existe `past` | Actualiza proyecto |
| STUDIO-033 | Rehacer | Reaplicar cambio deshecho | Existe `future` | Actualiza proyecto |
| STUDIO-034 | `Ctrl/Cmd + Z` | Deshacer por teclado | Fuera de edición de texto | Ejecuta undo |
| STUDIO-035 | `Ctrl/Cmd + Shift + Z` | Rehacer por teclado | Fuera de edición de texto | Ejecuta redo |
| STUDIO-036 | Cerrar aviso de Studio | Descartar notice local | Notice visible | Limpia aviso |
| STUDIO-037 | Aviso de plantilla protegida | Informar que ciertas zonas/base no son editables | Proyecto base protegido | Sólo lectura + condiciona controles |
| STUDIO-038 | Cerrar panel de edición | Ocultar pane lateral del editor | Panel abierto | Amplía preview |
| STUDIO-039 | Abrir panel de edición | Restaurar pane lateral | Panel cerrado | Vuelve a mostrar editor |
| STUDIO-040 | Conflicto — `Conservar borrador` | Mantener versión local ante conflicto disco/borrador | Conflicto detectado | Conserva cambios locales |
| STUDIO-041 | Conflicto — `Recargar desde disco` | Reemplazar borrador por versión persistida | Conflicto detectado | Descarta borrador conflictivo |
| STUDIO-042 | Conflicto — `Duplicar con mi borrador` | Crear otra tienda/proyecto con versión local | Conflicto detectado | Preserva ambas líneas de trabajo |
| STUDIO-043 | Barra de estado — schema | Mostrar versión de schema | Studio | Sólo lectura |
| STUDIO-044 | Barra de estado — última exportación | Mostrar fecha/estado de exportación | Studio | Sólo lectura |
| STUDIO-045 | Barra de estado — persistencia | Mostrar modo administrado/navegador | Studio | Sólo lectura |
| STUDIO-046 | Barra de estado — error de validación | Mostrar estado inválido | Schema/validación fallida | Sólo lectura |

---

## 3. Preparar

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| PREP-001 | `Modo avanzado` | Activar opciones avanzadas del Studio | Preparar | Cambia disponibilidad de opciones protegidas/avanzadas |
| PREP-002 | `Modo avanzado activado` | Desactivar/alternar modo avanzado | Avanzado activo | Cambia estado del editor |
| PREP-003 | Progreso de preparación | Mostrar porcentaje/requisitos completados | Siempre | Sólo lectura |
| PREP-004 | Métricas activas | Mostrar productos, categorías y recursos activos | Siempre | Sólo lectura |
| PREP-005 | Aviso de upgrade Catalog Modern | Informar que existe actualización aplicable | Sólo proyectos elegibles | Sólo lectura |
| PREP-006 | Cerrar aviso de actualización | Descartar aviso de upgrade | Upgrade disponible | Oculta tarjeta en sesión |
| PREP-007 | Aplicar actualización Catalog Modern | Migrar configuración visual soportada a la familia actual | Proyecto elegible | Actualiza configuración de módulos/diseño conservando contenido compatible |
| PREP-008 | `Siguiente: <requisito>` | Ir al primer requisito pendiente | Hay pendientes | Navega al área que lo resuelve |
| PREP-009 | `+N más` / `Mostrar menos` | Expandir/contraer lista de pendientes | Más de 12 requisitos pendientes | Cambia cantidad visible |
| PREP-010 | `Editar` requisito | Ir al área responsable de un requisito | Requisito pendiente | Navega a Resumen/Catálogo/Recursos/SEO/etc. |
| PREP-011 | `Requisitos listos` | Expandir/contraer completados | Hay completados | Muestra checklist terminado |
| PREP-012 | `Revisar publicación` | Ir a Exportar cuando la preparación está lista | Sin pendientes críticos | Navega a Exportar |
| PREP-013 | `Marca y textos` | Ir a Resumen | Siempre | Navega a identidad/configuración |
| PREP-014 | `Cargar catálogo` | Ir a Catálogo | Siempre | Navega a productos/categorías |
| PREP-015 | `Organizar imágenes` | Ir a Recursos | Siempre | Navega a biblioteca de medios |

---

## 4. Resumen

| ID | Control / grupo | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| RES-001 | Acordeones/secciones | Expandir o contraer grupos de configuración | Resumen | Cambia visibilidad de formulario |
| RES-002 | Nombre de tienda | Editar nombre principal | Siempre | Actualiza identidad del proyecto |
| RES-003 | Razón/nombre legal | Editar nombre legal | Siempre | Actualiza identidad legal |
| RES-004 | Descripción | Editar descripción de marca | Siempre | Actualiza copy de identidad |
| RES-005 | Logo | Seleccionar/reemplazar asset de logo | Assets disponibles | Actualiza referencia de identidad |
| RES-006 | Favicon | Seleccionar/reemplazar favicon | Assets disponibles | Actualiza referencia SEO/identidad |
| RES-007 | Portada SEO/social | Seleccionar imagen de portada | Assets disponibles | Actualiza imagen social |
| RES-008 | Email | Editar email público | Siempre | Actualiza contacto |
| RES-009 | Teléfono | Editar teléfono público | Siempre | Actualiza contacto |
| RES-010 | Dirección | Editar dirección pública | Siempre | Actualiza contacto |
| RES-011 | Instagram | Editar enlace/usuario | Siempre | Actualiza red social |
| RES-012 | Facebook | Editar enlace/usuario | Siempre | Actualiza red social |
| RES-013 | TikTok | Editar enlace/usuario | Siempre | Actualiza red social |
| RES-014 | X/Twitter | Editar usuario/enlace | Siempre | Actualiza red social |
| RES-015 | WhatsApp habilitado | Activar/desactivar checkout/contacto por WhatsApp | Siempre | Cambia disponibilidad pública de la integración |
| RES-016 | Número WhatsApp | Editar número internacional | WhatsApp configurable | Actualiza destino de pedidos |
| RES-017 | Saludo de pedido | Editar texto inicial de pedido | WhatsApp configurable | Cambia copy del mensaje generado |
| RES-018 | URL pública | Editar base URL | Siempre | Afecta canonical/SEO/exportación |
| RES-019 | Slug interno | Editar slug interno del proyecto | Siempre/validado | Cambia identificador/rutas internas compatibles |
| RES-020 | País legal | Definir país del perfil legal | Siempre | Actualiza perfil legal |
| RES-021 | Última revisión legal | Marcar/actualizar fecha de revisión | Perfil legal | Actualiza sello temporal de revisión |
| RES-022 | CUIT / identificación fiscal | Editar identificación fiscal | Perfil legal | Actualiza datos legales públicos |
| RES-023 | Jurisdicción declarada | Editar jurisdicción | Perfil legal | Actualiza copy legal |
| RES-024 | Métodos de pago | Editar métodos declarados | Perfil legal | Actualiza información comercial |
| RES-025 | Canales de venta | Editar canales declarados | Perfil legal | Actualiza información comercial |
| RES-026 | Botón de arrepentimiento | Activar/desactivar declaración de esa capacidad | Perfil legal | Cambia información pública correspondiente |
| RES-027 | Texto avanzado de privacidad | Editar política/fragmento avanzado | Modo correspondiente | Actualiza copy legal público |
| RES-028 | Texto avanzado de términos | Editar términos/fragmento avanzado | Modo correspondiente | Actualiza copy legal público |
| RES-029 | `Ocultar centavos cuando sean cero` | Cambiar formato monetario público | Siempre | Ajusta presentación de precios |
| RES-030 | Etiqueta de catálogo | Editar nombre visible de navegación al catálogo | Siempre | Cambia copy de navegación |
| RES-031 | `Mostrar Inicio` | Activar/desactivar acceso a Home | Navegación pública | Cambia shell público configurado |
| RES-032 | Mostrar búsqueda | Activar/desactivar acceso a búsqueda | Navegación pública | Cambia capability pública declarada |
| RES-033 | Mostrar carrito | Activar/desactivar acceso al carrito | Navegación pública | Cambia capability pública declarada |
| RES-034 | Mostrar barra informativa | Activar/desactivar barra superior | Shell público | Cambia configuración del storefront generado |
| RES-035 | Mostrar encabezado | Activar/desactivar header | Shell público | Cambia configuración del storefront generado |
| RES-036 | Mostrar pie | Activar/desactivar footer | Shell público | Cambia configuración del storefront generado |
| RES-037 | Mostrar carrito lateral | Activar/desactivar drawer de carrito | Shell público | Cambia configuración del storefront generado |
| RES-038 | Etiqueta de item de navegación | Editar texto de item | Navegación personalizada | Actualiza navegación |
| RES-039 | Destino de item de navegación | Editar ruta/destino | Navegación personalizada | Actualiza navegación |
| RES-040 | Mover item arriba | Reordenar navegación | Item movable | Cambia orden persistido |
| RES-041 | Mover item abajo | Reordenar navegación | Item movable | Cambia orden persistido |
| RES-042 | Agregar sublink | Crear hijo de navegación | Bajo límites del schema/UI | Agrega subitem |
| RES-043 | Mover sublink arriba | Reordenar hijos | Sublink movable | Cambia orden |
| RES-044 | Mover sublink abajo | Reordenar hijos | Sublink movable | Cambia orden |
| RES-045 | Eliminar sublink | Quitar hijo de navegación | Sublink existente | Elimina subitem |
| RES-046 | Agregar enlace de catálogo | Insertar acceso al catálogo | Si no excede límites | Agrega item preconfigurado |
| RES-047 | Eliminar item de navegación | Iniciar borrado del item | Item eliminable | Abre confirmación |
| RES-048 | Confirmar eliminación de navegación | Borrar item | Confirmación abierta | Elimina item y sus datos asociados según editor |
| RES-049 | Título visible de Home | Editar título editorial de Home | Página Home | Actualiza copy público |
| RES-050 | Título SEO de Home | Editar título SEO de página editorial | Página Home | Actualiza metadata |
| RES-051 | Descripción SEO de Home | Editar descripción SEO de página editorial | Página Home | Actualiza metadata |
| RES-052 | Copy público global | Editar strings compartidas/sistema expuestas por el editor | Campos dinámicos disponibles | Cambia textos usados por renderer |
| RES-053 | Validación de placeholders | Impedir perder placeholders obligatorios en copy dinámico | Campo con placeholders contractuales | Bloquea/avisa cambios incompatibles |
| RES-054 | Indicador de autosave | Informar que cambios se guardan localmente | Resumen | Sólo lectura |

---

## 5. Catálogo

### 5.1 Acciones generales y toolbar

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| CAT-001 | `Importar carpeta + imágenes` | Cargar catálogo y medios desde estructura de carpeta | Catálogo | Abre selector de carpeta/importación |
| CAT-002 | `Importar CSV` | Cargar catálogo desde CSV | Catálogo | Abre selector y revisión de importación |
| CAT-003 | `Exportar CSV` | Descargar representación completa del catálogo | Catálogo | Genera CSV |
| CAT-004 | `CSV comercial` | Descargar CSV de uso comercial | Catálogo | Genera variante de exportación |
| CAT-005 | `Agregar producto` | Crear producto manual | Catálogo | Abre ProductEditor en modo create |
| CAT-006 | Revisión CSV | Mostrar nuevos/modificados/sin cambios/eliminados | Después de parsear CSV | No muta hasta confirmación |
| CAT-007 | `Cancelar` revisión CSV | Abortar importación | Revisión abierta | Conserva catálogo actual |
| CAT-008 | `Reemplazar catálogo` | Aplicar importación CSV | Revisión válida | Reemplaza/actualiza catálogo según diff |
| CAT-009 | Revisión carpeta+imágenes | Mostrar agregados, actualizados, categorías, imágenes procesadas/reusadas/sin match | Después de parsear carpeta | No muta hasta confirmación |
| CAT-010 | `Cancelar` revisión de carpeta | Abortar importación | Revisión abierta | Conserva catálogo actual |
| CAT-011 | `Agregar y actualizar` | Aplicar importación de carpeta | Revisión válida | Agrega/actualiza productos y medios |
| CAT-012 | Buscar productos | Filtrar por producto/marca/estado | Catálogo | Reduce resultados visibles |
| CAT-013 | Filtro de categoría | Ver productos de una categoría | Catálogo | Cambia subconjunto visible |
| CAT-014 | Vista `Lista` | Mostrar tabla/lista | Catálogo | Cambia layout |
| CAT-015 | Vista `Tarjetas` | Mostrar cards | Catálogo | Cambia layout |
| CAT-016 | `Columnas` | Abrir configuración de columnas | Vista lista | Muestra selector de columnas |
| CAT-017 | Checkbox de columna | Mostrar/ocultar columna | Selector de columnas | Cambia columnas visibles |
| CAT-018 | Seleccionar todos los filtrados | Seleccionar resultados actuales | Existen resultados | Actualiza selección bulk |
| CAT-019 | Limpiar selección | Deseleccionar productos | Hay selección | Vacía selección bulk |
| CAT-020 | Página anterior | Navegar paginación | No primera página | Cambia página |
| CAT-021 | Página siguiente | Navegar paginación | No última página | Cambia página |
| CAT-022 | Tamaño 25/50/100 | Cambiar cantidad por página | Catálogo | Ajusta paginación |

### 5.2 Producto en tabla/tarjeta y acciones masivas

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| CAT-023 | Checkbox por producto | Seleccionar/deseleccionar producto | Fila/card visible | Actualiza selección bulk |
| CAT-024 | Título inline | Editar título sin abrir editor completo | Vista que lo habilita | Actualiza producto |
| CAT-025 | Marca inline | Editar brand sin abrir editor completo | Vista que lo habilita | Actualiza producto |
| CAT-026 | Precio inline | Editar precio | Vista que lo habilita | Actualiza precio en centavos mediante dominio |
| CAT-027 | Estado inline | Cambiar estado | Vista que lo habilita | Cambia activo/oculto/archivado |
| CAT-028 | Editar producto | Abrir ProductEditor | Producto existente | Abre editor completo |
| CAT-029 | Archivar producto | Iniciar archivado | Producto activo/oculto | Cambia estado tras flujo correspondiente |
| CAT-030 | Estado masivo `Activo` | Marcar seleccionados activos | Selección no vacía | Actualiza productos |
| CAT-031 | Estado masivo `Oculto` | Marcar seleccionados ocultos | Selección no vacía | Actualiza productos |
| CAT-032 | Estado masivo `Archivado` | Archivar seleccionados | Selección no vacía | Actualiza productos |
| CAT-033 | `Aplicar estado` | Ejecutar estado masivo elegido | Estado y selección válidos | Mutación bulk |
| CAT-034 | Ajuste porcentual | Definir incremento/descuento porcentual | Selección no vacía | Prepara cambio de precios |
| CAT-035 | Ajuste en centavos | Definir incremento/descuento absoluto | Selección no vacía | Prepara cambio de precios |
| CAT-036 | `Ajustar precios` | Ejecutar ajuste bulk | Parámetro válido | Modifica precios seleccionados |
| CAT-037 | Categorías masivas | Asignar categorías a selección | Selección no vacía | Actualiza asignaciones e índices derivados |
| CAT-038 | Colecciones masivas | Asignar colecciones | Selección no vacía | Actualiza asignaciones |
| CAT-039 | Agregar tags masivamente | Añadir tags | Selección no vacía | Actualiza tags |
| CAT-040 | Quitar tags masivamente | Eliminar tags | Selección no vacía | Actualiza tags |
| CAT-041 | Archivar seleccionados | Iniciar archivado bulk | Selección no vacía | Abre confirmación |
| CAT-042 | Confirmar archivado bulk | Archivar selección | Confirmación abierta | Cambia estado de productos |

### 5.3 Categorías y colecciones

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| CAT-043 | Crear categoría | Crear nodo de categoría | Catálogo | Abre editor taxonomy |
| CAT-044 | Crear colección | Crear colección | Catálogo | Abre editor taxonomy |
| CAT-045 | Expandir categoría | Mostrar hijos | Categoría con hijos | Expande árbol |
| CAT-046 | Contraer categoría | Ocultar hijos | Categoría expandida | Contrae árbol |
| CAT-047 | Editar categoría | Abrir edición taxonomy | Categoría existente | Permite cambiar campos |
| CAT-048 | Editar colección | Abrir edición taxonomy | Colección existente | Permite cambiar campos |
| CAT-049 | Nombre taxonomy | Editar nombre | Editor abierto | Actualiza categoría/colección |
| CAT-050 | Slug taxonomy | Editar slug | Editor abierto | Actualiza identificador de ruta |
| CAT-051 | Descripción taxonomy | Editar descripción | Editor abierto | Actualiza contenido |
| CAT-052 | Padre de categoría | Elegir padre opcional | Sólo categoría | Cambia jerarquía propuesta |
| CAT-053 | `Guardar` taxonomy | Persistir cambios | Formulario válido | Actualiza estructura |
| CAT-054 | `Cancelar` taxonomy | Descartar cambios del editor | Editor abierto | Cierra sin aplicar |
| CAT-055 | `Categoría a reubicar` | Elegir nodo a mover | Flujo reparent | Define origen |
| CAT-056 | `Nuevo padre` | Elegir destino jerárquico | Flujo reparent | Define destino |
| CAT-057 | `Reubicar` | Confirmar cambio de jerarquía | Selección válida | Recalcula estructura/índices derivados |

### 5.4 ProductEditor

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| CAT-058 | Cerrar editor | Solicitar cierre | Editor abierto | Si hay dirty state, pide confirmación |
| CAT-059 | Navegación por pasos | Cambiar sección del formulario | Editor abierto | Cambia campos visibles |
| CAT-060 | Título | Editar título | Siempre | Actualiza producto |
| CAT-061 | Slug | Editar slug | Siempre/validado | Actualiza URL/identificador |
| CAT-062 | Marca | Editar brand | Siempre | Actualiza producto |
| CAT-063 | Estado | Elegir activo/oculto/archivado | Siempre | Actualiza disponibilidad editorial |
| CAT-064 | Descripción | Editar texto de producto | Siempre | Actualiza contenido |
| CAT-065 | Tags | Editar lista de tags | Siempre | Actualiza tags |
| CAT-066 | Subir imagen | Agregar media al producto | Selector disponible | Crea/asigna asset |
| CAT-067 | Seleccionar imagen existente | Asignar asset existente | Hay assets | Actualiza galería |
| CAT-068 | Mover imagen arriba | Reordenar galería | Más de una imagen | Cambia orden |
| CAT-069 | Mover imagen abajo | Reordenar galería | Más de una imagen | Cambia orden |
| CAT-070 | Quitar imagen | Desasignar imagen del producto | Imagen asignada | Actualiza galería sin necesariamente borrar asset |
| CAT-071 | Categorías de producto | Asignar/desasignar categorías | Categorías existentes | Actualiza productIds derivados mediante dominio/helpers |
| CAT-072 | Colecciones de producto | Asignar/desasignar colecciones | Colecciones existentes | Actualiza asignaciones |
| CAT-073 | Media/campos complementarios | Editar referencias compatibles del producto | Según schema/UI | Actualiza producto |
| CAT-074 | Mover variante arriba | Reordenar variantes | No primera variante | Cambia orden |
| CAT-075 | Mover variante abajo | Reordenar variantes | No última variante | Cambia orden |
| CAT-076 | Duplicar variante | Crear copia de variante | Variante existente | Agrega variante |
| CAT-077 | Eliminar variante | Iniciar borrado | Más de una variante | Abre confirmación |
| CAT-078 | Nombre de variante | Editar nombre | Variante | Actualiza variante |
| CAT-079 | SKU | Editar SKU | Variante | Actualiza variante |
| CAT-080 | Opciones | Editar pares como Color/Talle | Variante | Actualiza opciones |
| CAT-081 | Precio en centavos | Editar precio entero | Variante | Actualiza precio |
| CAT-082 | Precio anterior en centavos | Editar compare-at price | Variante | Actualiza precio anterior |
| CAT-083 | Stock | Elegir estado de stock | Variante | Actualiza disponibilidad |
| CAT-084 | Fecha de disponibilidad | Definir fecha | Preventa o fecha ya configurada | Actualiza disponibilidad futura |
| CAT-085 | GTIN | Editar identificador | Variante | Actualiza metadata comercial |
| CAT-086 | MPN | Editar identificador | Variante | Actualiza metadata comercial |
| CAT-087 | Imagen de variante | Asignar asset | Variante | Actualiza media específica |
| CAT-088 | Disponible | Activar/desactivar disponibilidad de variante | Variante | Actualiza availability |
| CAT-089 | `Agregar variante` | Crear variante nueva | Editor abierto | Añade variante |
| CAT-090 | `Cancelar` | Cerrar/solicitar cierre sin guardar | Editor abierto | Si hay dirty state, confirma |
| CAT-091 | `Guardar borrador` | Guardar producto nuevo sin activarlo | Modo create | Persiste draft |
| CAT-092 | `Guardar cambios` | Guardar edición sin forzar activo | Modo edit | Persiste cambios |
| CAT-093 | `Crear y activar` | Guardar producto nuevo activo | Modo create | Persiste y activa |
| CAT-094 | `Guardar y activar` | Guardar producto existente y dejar activo | Modo edit | Persiste y activa |
| CAT-095 | `Salir sin guardar` | Confirmar cierre descartando dirty state | Confirmación abierta | Cierra editor |
| CAT-096 | Confirmar eliminación de variante | Borrar variante seleccionada | Confirmación abierta | Elimina variante |
| CAT-097 | Página numerada | Saltar directamente a una página concreta del catálogo mediante los botones numéricos de la paginación, evitando recorrer páginas una por una con `Anterior`/`Siguiente`; el paginador muestra páginas cercanas, primera/última y elipsis cuando el rango es largo | Disponible cuando la paginación tiene páginas navegables; la página actual se marca con `aria-current="page"` y los controles respetan el estado deshabilitado global del paginador | Llama al mismo cambio de página usado por la paginación general, limita el destino al rango válido y actualiza inmediatamente el subconjunto de productos mostrado sin modificar el catálogo |
| CAT-098 | Encabezado de columna ordenable | Ordenar la tabla del catálogo haciendo clic directamente sobre el encabezado de cualquier columna que declare capacidad de ordenamiento; el mismo control permite cambiar sucesivamente el estado/dirección del sorting | Sólo existe en vista de lista para columnas cuyo modelo de tabla permite ordenar; el encabezado expone visual y semánticamente si está en orden ascendente o descendente | Activa el `toggleSorting` de la columna seleccionada y recalcula el orden de las filas visibles según el estado de sorting de la tabla, sin alterar los datos persistidos de los productos |

---

## 6. Constructor

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| BUILD-001 | `Página de edición` | Elegir página/configuración editable | Constructor | Cambia conjunto de secciones |
| BUILD-002 | `Tipo de sección` | Elegir slot/tipo a agregar | Constructor | Define tipo para nuevo módulo |
| BUILD-003 | Agregar sección | Abrir selector de módulo compatible | Constructor | Abre module picker |
| BUILD-004 | `Desbloquear` | Habilitar edición avanzada de base protegida | Plantilla protegida y callback disponible | Activa modo avanzado |
| BUILD-005 | Buscar módulo | Filtrar módulos por nombre | Module picker | Reduce opciones |
| BUILD-006 | Seleccionar módulo | Crear/reemplazar sección con módulo compatible | Module picker | Aplica módulo elegido |
| BUILD-007 | Módulo incompatible deshabilitado | Impedir selección incompatible con slot | Module picker | Protege contrato de módulo |
| BUILD-008 | `Cancelar` module picker | Cerrar selector sin cambios | Picker abierto | Cierra diálogo |
| BUILD-009 | Seleccionar sección | Activar sección en inspector | Stack | Cambia selección |
| BUILD-010 | Navegación de secciones con flechas | Cambiar foco/selección | Stack con teclado | Recorre secciones |
| BUILD-011 | `Mover arriba` | Reordenar sección | No primera y no protegida | Cambia orden |
| BUILD-012 | `Mover abajo` | Reordenar sección | No última y no protegida | Cambia orden |
| BUILD-013 | `Ocultar sección` | Deshabilitar render de sección | Sección habilitada y editable | Cambia `enabled` |
| BUILD-014 | `Mostrar sección` | Rehabilitar sección | Sección oculta y editable | Cambia `enabled` |
| BUILD-015 | `Duplicar sección` | Copiar sección | Sección editable | Añade copia con ID nuevo |
| BUILD-016 | `Eliminar sección` | Iniciar borrado | Sección editable | Abre confirmación |
| BUILD-017 | Seleccionar primera sección | Resolver estado sin selección | Hay secciones | Selecciona la primera |
| BUILD-018 | Selector `Módulo` | Cambiar módulo de sección | Sección editable | Solicita confirmación si reemplaza settings |
| BUILD-019 | Restaurar valores por defecto | Iniciar reset de settings de módulo | Sección editable | Abre confirmación |
| BUILD-020 | Confirmar restauración | Reemplazar settings por defaults del módulo | Confirmación abierta | Resetea configuración de sección |
| BUILD-021 | Confirmar cambio de módulo | Sustituir módulo actual | Confirmación abierta | Cambia manifest/settings compatibles |
| BUILD-022 | Confirmar eliminación de sección | Borrar sección | Confirmación abierta | Quita sección |
| BUILD-023 | Inspector generado por metadata | Editar settings declarados por módulo | Sección seleccionada | Mutación dinámica según schema del módulo |
| BUILD-024 | Selector de asset en settings | Elegir imagen/media | Setting compatible | Actualiza referencia de asset |
| BUILD-025 | Campo de texto/textarea/número/select/toggle de settings | Editar propiedad compatible | Según metadata | Actualiza settings |
| BUILD-026 | Motion preset | Elegir preset de movimiento | Sección seleccionada | Actualiza motion |
| BUILD-027 | Intensidad | Ajustar intensidad | Sección seleccionada | Actualiza motion |
| BUILD-028 | Duración | Ajustar duración | Sección seleccionada | Actualiza motion |
| BUILD-029 | Distancia | Ajustar distancia | Sección seleccionada | Actualiza motion |
| BUILD-030 | `once` | Definir ejecución única/repetida | Sección seleccionada | Actualiza motion |
| BUILD-031 | Repeater — mover arriba | Reordenar item | Item no primero | Cambia orden |
| BUILD-032 | Repeater — mover abajo | Reordenar item | Item no último | Cambia orden |
| BUILD-033 | Repeater — duplicar | Duplicar item | Item existente | Añade copia |
| BUILD-034 | Repeater — eliminar | Iniciar borrado | Item existente | Abre confirmación |
| BUILD-035 | Repeater — agregar item | Crear item | Bajo límites del schema | Añade elemento |
| BUILD-036 | Repeater — campos | Editar propiedades del item | Según metadata | Actualiza settings |
| BUILD-037 | Hero slides — agregar slide | Crear slide | Editor compatible | Añade slide |
| BUILD-038 | Hero slides — mover arriba | Reordenar slide | No primero | Cambia orden |
| BUILD-039 | Hero slides — mover abajo | Reordenar slide | No último | Cambia orden |
| BUILD-040 | Hero slides — duplicar | Duplicar slide | Slide existente | Añade copia |
| BUILD-041 | Hero slides — eliminar | Borrar slide con confirmación/guardas aplicables | Slide existente | Elimina slide |
| BUILD-042 | Hero — eyebrow | Editar kicker | Slide | Actualiza copy |
| BUILD-043 | Hero — título | Editar título | Slide | Actualiza copy |
| BUILD-044 | Hero — texto | Editar cuerpo | Slide | Actualiza copy |
| BUILD-045 | Hero — CTA texto | Editar llamada a la acción | Slide | Actualiza copy |
| BUILD-046 | Hero — CTA destino | Editar destino | Slide | Actualiza navegación |
| BUILD-047 | Hero — media | Elegir/cambiar asset compatible | Slide | Actualiza media |

---

## 7. Tema de la tienda

La capacidad actual es de **tema único**. No existe hoy selector funcional claro/oscuro/auto y no debe inventarse como capacidad existente durante el rework.

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| THEME-001 | Familia visual | Mostrar familia visual activa `Editorial V2` para Catalog Modern actual | Proyecto compatible | Sólo lectura |
| THEME-002 | Paleta dinámica | Aplicar una paleta predefinida | Theme editor | Reemplaza grupo de colores por preset |
| THEME-003 | `Restaurar colores` | Volver colores al estado que tenía la tienda al abrir la pestaña | Theme editor | Resetea sólo grupo colors |
| THEME-004 | Selector nativo de color por token | Elegir color visualmente | Cada color configurable | Actualiza token |
| THEME-005 | Valor hexadecimal por token | Escribir color manual | Cada color configurable | Valida y actualiza token |
| THEME-006 | Validación de color | Mostrar error para valor inválido | Input inválido | Evita/indica configuración inválida |
| THEME-007 | Contraste WCAG | Calcular pares de contraste y ratio | Colores válidos | Sólo lectura diagnóstica |
| THEME-008 | `Restaurar tipografía` | Volver tipografía al estado inicial de la pestaña | Theme editor | Resetea grupo typography |
| THEME-009 | `Familia de títulos` | Elegir stack de fuente | Theme editor | Actualiza fuente display |
| THEME-010 | `Familia de texto` | Elegir stack de fuente | Theme editor | Actualiza fuente body |
| THEME-011 | Fuentes de sistema | Elegir familia curada local | Selector de fuente | Actualiza stack |
| THEME-012 | Google Fonts curadas | Elegir familia compatible | Selector de fuente | Actualiza stack |
| THEME-013 | Fuente personalizada existente | Preservar/mostrar stack desconocido sin reescribirlo | Proyecto con valor fuera de presets | Compatibilidad tolerante |
| THEME-014 | Escala tipográfica | Ajustar escala 0.8–1.4 | Theme editor | Actualiza `typography.scale` |
| THEME-015 | `Restaurar geometría` | Volver geometría al estado inicial de la pestaña | Theme editor | Resetea grupo geometry |
| THEME-016 | Espaciado | Ajustar `spacingScale` 0.75–1.5 | Theme editor | Cambia escala de espaciado |
| THEME-017 | Radio | Ajustar radius 0–40 px | Theme editor | Cambia redondeo global |
| THEME-018 | Ancho del contenedor | Editar ancho numérico dentro de límites | Theme editor | Cambia container width |
| THEME-019 | Validación del contenedor | Informar valor fuera de rango | Input inválido | Evita estado inválido |

---

## 8. Recursos

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| ASSET-001 | `Cargar imágenes` | Seleccionar múltiples JPG/PNG/WebP | Recursos | Procesa y agrega assets |
| ASSET-002 | `Cargar video` | Seleccionar múltiples MP4/WebM | Recursos | Agrega videos |
| ASSET-003 | Drag & drop | Soltar imágenes o videos | Dropzone | Ejecuta carga equivalente |
| ASSET-004 | Progreso de procesamiento | Mostrar avance de lote | Busy con lote activo | Sólo lectura |
| ASSET-005 | Errores parciales de lote | Mostrar archivos rechazados manteniendo el resto | Algún archivo falla | Sólo lectura |
| ASSET-006 | Estado de almacenamiento | Avisar uso alto de cuota local | Ratio >= 75% | Sólo lectura |
| ASSET-007 | `Limpiar caché regenerable` | Borrar derivados que pueden reconstruirse | Advertencia de almacenamiento | Libera almacenamiento sin borrar fuente autoritativa |
| ASSET-008 | Buscar recursos | Filtrar por nombre, alt o ID | Hay assets | Reduce biblioteca visible |
| ASSET-009 | Limpiar búsqueda | Vaciar filtro desde empty state | Sin coincidencias | Restaura biblioteca |
| ASSET-010 | Nombre de imagen | Editar metadata `name` | Asset visible | Actualiza metadata al commit de campo |
| ASSET-011 | Texto alternativo | Editar `alt` | Asset visible | Actualiza accesibilidad/SEO del asset |
| ASSET-012 | `Detalle` | Abrir panel de detalle de una imagen | Asset visible | Muestra dimensiones, peso estimado, hash, ID y usos |
| ASSET-013 | Cerrar detalle | Cerrar panel | Detalle abierto | Regresa a biblioteca |
| ASSET-014 | Listado de usos | Mostrar dónde está referenciado un asset | Detalle abierto | Sólo lectura |
| ASSET-015 | `Reemplazar imagen` | Sustituir contenido del asset conservando flujo de referencia compatible | Detalle abierto | Abre selector y procesa reemplazo |
| ASSET-016 | `Eliminar` imagen | Iniciar borrado | Sólo asset sin usos | Abre confirmación |
| ASSET-017 | Confirmar `Eliminar` | Borrar asset | Confirmación abierta y sin usos | Elimina imagen |
| ASSET-018 | `Copiar ID` | Copiar ID al portapapeles | Asset visible | Copia identificador |
| ASSET-019 | Estado `Copiado` | Informar éxito de clipboard | Copia exitosa | Sólo lectura |
| ASSET-020 | Error de clipboard | Informar fallo de copia | API no disponible/falla | Sólo lectura |
| ASSET-021 | `Mostrar más` | Cargar siguiente lote visual de recursos | Hay más filtrados que visibles | Aumenta límite visible |
| ASSET-022 | Nombre de video | Editar metadata de video | Video existente | Actualiza metadata |
| ASSET-023 | Imagen de portada de video | Elegir asset como poster | Video existente | Actualiza `posterAssetId` |
| ASSET-024 | `Seleccionar imagen` para poster | Dejar/definir poster desde biblioteca | Video existente | Actualiza referencia |

---

## 9. SEO y Google

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| SEO-001 | Título SEO | Editar title hasta 70 caracteres | SEO | Actualiza metadata |
| SEO-002 | Descripción SEO | Editar description hasta 180 caracteres | SEO | Actualiza metadata |
| SEO-003 | Verificación de Search Console | Editar token/meta de verificación | SEO | Actualiza metadata de validación |
| SEO-004 | Verificación de Merchant Center | Editar token/meta de verificación | SEO | Actualiza metadata de validación |
| SEO-005 | `Subir favicon` | Cargar imagen y convertirla al formato de favicon soportado | SEO | Crea/asigna recurso favicon |
| SEO-006 | Preview de favicon | Ver asset actual | Favicon configurado | Sólo lectura |
| SEO-007 | Selector `Portada del sitio` | Elegir asset existente para Open Graph | Assets disponibles | Actualiza `socialImageId` |
| SEO-008 | `Usar la primera imagen disponible` | Dejar portada derivada automáticamente | Selector de portada | Limpia selección explícita |
| SEO-009 | `Subir portada` | Cargar una nueva portada social | SEO | Crea/asigna asset |
| SEO-010 | Metadata publicada derivada | Mostrar autor, publisher y keywords derivadas | SEO | Sólo lectura |
| SEO-011 | Estado de auditoría | Mostrar analizando/error/score/errores/warnings | Auditoría local | Sólo lectura |
| SEO-012 | `Reintentar` auditoría | Relanzar auditoría local | Auditoría fallida | Recalcula reporte |
| SEO-013 | Lista de hallazgos | Mostrar severidad, área y destino de corrección | Auditoría lista | Sólo lectura |
| SEO-014 | `Ir a <área> para corregir` | Navegar a la tab responsable de un hallazgo | Issue con `fixTarget` distinto de SEO | Cambia tab de Studio |
| SEO-015 | Preview Google | Mostrar snippet derivado | SEO | Sólo lectura |
| SEO-016 | Previews SEO/sociales derivados | Mostrar representación del metadata actual | SEO | Sólo lectura |
| SEO-017 | Checklist SEO por hallazgo | Mostrar ítems agrupados y estado revisado | Auditoría lista | Sólo lectura + controles de revisión |
| SEO-018 | `Marcar revisado` | Marcar issue localmente como revisado | Issue sin destino externo | Actualiza checklist local |
| SEO-019 | `Revisado` / marcar pendiente | Desmarcar issue | Issue revisado | Actualiza checklist local |
| SEO-020 | Rutas vistas por crawler | Mostrar rutas, título e indexable/noindex | Optimización disponible | Sólo lectura |
| SEO-022 | Score de optimización | Mostrar score, críticos y métricas | Optimización disponible | Sólo lectura |
| SEO-023 | `Descargar informe` | Descargar snapshot de optimización JSON | Optimización disponible | Genera archivo |
| SEO-024 | Métrica de rutas indexables | Mostrar cantidad | Optimización disponible | Sólo lectura |
| SEO-025 | Cobertura factual de productos | Mostrar porcentaje | Optimización disponible | Sólo lectura |
| SEO-026 | Imágenes grandes | Mostrar conteo | Optimización disponible | Sólo lectura |
| SEO-027 | Contexto IA público | Mostrar disponibilidad Sí/No | Optimización disponible | Sólo lectura |

---

## 10. Exportar

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| EXPORT-001 | Estado de auditoría de exportación | Informar analizando/lista/bloqueada | Exportar | Sólo lectura |
| EXPORT-002 | `Reintentar auditoría` | Reejecutar auditoría previa a producción | Auditoría fallida | Recalcula readiness |
| EXPORT-003 | Progreso de exportación | Mostrar fase borrador/producción/backup/import/recovery | Operación activa | Sólo lectura |
| EXPORT-004 | Etapas de exportación | Mostrar pasos completados | Export en curso/finalizada | Sólo lectura |
| EXPORT-005 | Checklist post-export | Mostrar pasos opcionales después de exportar | Export finalizada | Sólo lectura + acciones |
| EXPORT-006 | `Abrir sitio` | Abrir sitio exportado | Callback disponible | Abre sitio |
| EXPORT-007 | `Ir a SEO` | Navegar a SEO desde checklist | Siempre | Cambia tab |
| EXPORT-008 | `Marcar` / `Listo` | Marcar paso manual del checklist post-export | Ítem sin acción automática | Actualiza estado local |
| EXPORT-009 | `Contexto público para agentes` | Informar que producción siempre incluye `llms.txt`, `llms-full.txt` y `ai-context.json` | Exportar | Sólo lectura |
| EXPORT-010 | Exposición pública deliberada | Mostrar qué datos/hosts externos se publicarán | AI context o hosts externos presentes | Sólo lectura |
| EXPORT-011 | URL pública para verificar | Escribir dominio/URL de Cloudflare Pages | Verificador | Define objetivo |
| EXPORT-012 | `Verificar URL` | Comprobar publicación y headers vía CORS | URL válida | Ejecuta verificación |
| EXPORT-013 | Resultado Cloudflare | Mostrar pass/fail/unverified, checks y revision | Verificación ejecutada | Sólo lectura |
| EXPORT-014 | Comandos curl de fallback | Mostrar comandos cuando no puede verificarse por CORS | Estado unverified | Sólo lectura |
| EXPORT-015 | Checklist Cloudflare — upload | Marcar que se subió sólo la carpeta hija dedicada | Checklist manual | Actualiza estado local |
| EXPORT-016 | Checklist Cloudflare — functions | Marcar ausencia de Pages Functions | Checklist manual | Actualiza estado local |
| EXPORT-017 | Checklist Cloudflare — previews | Marcar previews desactivados/protegidos | Checklist manual | Actualiza estado local |
| EXPORT-018 | Checklist Cloudflare — HTTPS | Marcar dominio HTTPS activo | Checklist manual | Actualiza estado local |
| EXPORT-019 | Checklist Cloudflare — verificación | Marcar verificación posterior completada | Checklist manual | Actualiza estado local |
| EXPORT-020 | URL de manifest de recuperación | Ingresar manifest publicado | Recovery | Define origen remoto |
| EXPORT-021 | `Recuperar proyecto` | Descargar y verificar bóveda publicada | URL válida | Prepara proyecto recuperado y pide reemplazo |
| EXPORT-022 | Selector de carpeta publicada | Elegir carpeta local completa de sitio exportado | Recovery | Lee manifest/archivos de recuperación |
| EXPORT-023 | `Recuperar carpeta` | Lanzar recuperación desde carpeta | Recovery | Prepara proyecto recuperado y pide reemplazo |
| EXPORT-024 | Salud de exportación | Mostrar score, críticos, warnings, rutas indexables | Optimización disponible | Sólo lectura |
| EXPORT-025 | `Descargar .solara.json` | Crear respaldo editable | Sin operación incompatible | Descarga proyecto |
| EXPORT-026 | `Importar respaldo` | Elegir `.solara.json`/JSON | Sin operación incompatible | Abre selector y luego confirmación |
| EXPORT-027 | `Importar y reemplazar` | Reemplazar proyecto con respaldo | Confirmación abierta | Importa backup |
| EXPORT-028 | `Exportar borrador` | Generar sitio draft con noindex y sin Merchant feed | Sin operación incompatible | Exporta artefacto draft |
| EXPORT-029 | `Exportar producción` | Iniciar export final | Auditoría lista, 0 críticos, sin busy | Abre confirmación |
| EXPORT-030 | Confirmación `Exportar producción` | Generar sitio final | Confirmación abierta | Ejecuta export production |
| EXPORT-031 | Historial de exportaciones | Mostrar intentos exitosos de este navegador | Hay historial | Sólo lectura |
| EXPORT-032 | `Borrar historial` | Iniciar limpieza del historial local | Hay historial | Abre confirmación |
| EXPORT-033 | Confirmar `Borrar historial` | Vaciar registros locales de exportación | Confirmación abierta | No modifica proyecto ni sitios |
| EXPORT-034 | Confirmación `Recuperar y reemplazar` | Aplicar proyecto recuperado | Recovery validada | Reemplaza proyecto actual |
| EXPORT-035 | Cancelación de confirmaciones | Cancelar import/recovery/production/history | Diálogo abierto | Conserva estado actual |

---

## 11. Preview interno y edición en canvas

| ID | Control | Capacidad | Condición / estado | Efecto |
| --- | --- | --- | --- | --- |
| PREVIEW-001 | Zoom 100% | Ver preview a escala completa | Preview | Cambia escala visual interna |
| PREVIEW-002 | Zoom 75% | Ver preview reducido | Preview | Cambia escala visual interna |
| PREVIEW-003 | Zoom 50% | Ver preview reducido | Preview | Cambia escala visual interna |
| PREVIEW-004 | Campo `Ruta de vista previa` | Escribir/seleccionar ruta | Preview | Prepara navegación interna |
| PREVIEW-005 | Datalist de rutas | Elegir ruta conocida | Preview | Completa campo |
| PREVIEW-006 | Commit de ruta | Navegar a la ruta elegida | Ruta válida | Regenera/cambia preview |
| PREVIEW-007 | `Abrir panel de edición` | Restaurar editor lateral | Pane cerrado | Abre pane |
| PREVIEW-008 | `Vista de escritorio` | Emular viewport desktop | Preview | Cambia tamaño del iframe/contenedor |
| PREVIEW-009 | `Vista de tablet` | Emular viewport tablet | Preview | Cambia tamaño |
| PREVIEW-010 | `Vista móvil` | Emular viewport mobile | Preview | Cambia tamaño |
| PREVIEW-011 | `Recargar vista previa` | Reintentar render | Render fallido | Regenera iframe/html |
| PREVIEW-012 | Seleccionar target editable | Abrir edición contextual de una región | Canvas activo y target con manifest | Abre popover/formulario |
| PREVIEW-013 | Select de canvas | Editar valor enumerado/asset | Target compatible | Prepara patch |
| PREVIEW-014 | Input de canvas | Editar valor corto | Target compatible | Prepara patch |
| PREVIEW-015 | Textarea de canvas | Editar texto largo | Target compatible | Prepara patch |
| PREVIEW-016 | `Sin imagen` | Quitar referencia de imagen | Campo asset | Limpia referencia |
| PREVIEW-017 | Elegir imagen existente | Asignar asset | Campo asset | Prepara patch |
| PREVIEW-018 | Subir y aplicar imagen | Crear asset y asignarlo al target | Campo asset | Procesa media + patch |
| PREVIEW-019 | `Aplicar` | Confirmar edición canvas | Formulario abierto | Muta proyecto |
| PREVIEW-020 | `Cancelar` | Cerrar edición canvas | Formulario abierto | Descarta draft del popover |
| PREVIEW-021 | Edición de sección | Mutar campo de sección desde canvas | Target `section` | Actualiza settings/contenido |
| PREVIEW-022 | Edición de repeater item | Mutar item repetible | Target compatible | Actualiza item |
| PREVIEW-023 | Edición de identidad | Mutar campo de identidad desde preview | Target identity | Actualiza proyecto |
| PREVIEW-024 | Edición de producto | Mutar campo expuesto de producto | Target product | Actualiza catálogo |
| PREVIEW-025 | Edición de categoría | Mutar campo expuesto de categoría | Target category | Actualiza taxonomy |
| PREVIEW-026 | Edición de colección | Mutar campo expuesto de colección | Target collection | Actualiza taxonomy |
| PREVIEW-027 | Edición de asset | Mutar referencia/campo de asset | Target asset | Actualiza referencia/metadata compatible |

---

## 12. Inventario transversal actual y función subyacente

Esta tabla registra comportamientos transversales observados en la aplicación actual. Para el futuro rework, la obligación es preservar la **función o garantía de datos subyacente** cuando exista. El mecanismo de UI/UX usado hoy es sólo evidencia de cómo se accede actualmente y no obliga a conservar botones, labels, tabs, toasts, modales, shortcuts, foco, layout ni ningún otro patrón de interacción.

| ID | Comportamiento actual | Función/garantía subyacente a conservar |
| --- | --- | --- |
| GLOBAL-001 | Estados loading | Las operaciones asíncronas conservan un estado de ejecución que evita tratarlas como finalizadas antes de tiempo |
| GLOBAL-002 | Estados error | Los fallos recuperables siguen siendo distinguibles del éxito y no deben mutar datos como si la operación hubiera terminado correctamente |
| GLOBAL-003 | Reintentos | Las operaciones actualmente reintentables conservan una vía funcional para volver a ejecutarse sin reconstruir manualmente el estado previo |
| GLOBAL-004 | Confirmaciones destructivas | Las mutaciones destructivas requieren una orden explícita antes de ejecutarse; el mecanismo concreto queda libre para el nuevo diseño |
| GLOBAL-005 | Dirty state | Debe seguir existiendo la distinción entre estado modificado y estado confirmado por la autoridad de persistencia correspondiente |
| GLOBAL-006 | Undo/redo | Debe conservarse la capacidad de recorrer `HistoryState` hacia atrás y hacia adelante donde hoy aplica |
| GLOBAL-007 | Plantilla protegida | Se mantienen las restricciones funcionales de escritura sobre la base protegida |
| GLOBAL-008 | Modo avanzado | Se mantiene la condición funcional que habilita capacidades actualmente restringidas por este modo; su forma de acceso puede cambiar |
| GLOBAL-009 | Managed vs browser | Se mantiene la diferencia entre persistencia confirmada en disco y persistencia local del modo navegador |
| GLOBAL-010 | RecoveryDraft | Se mantienen creación, lectura, recuperación, exportación y descarte del borrador de recuperación donde hoy existen |
| GLOBAL-011 | Conflicto disco/borrador | Se conservan las alternativas funcionales existentes para resolver un conflicto sin sobrescritura silenciosa |
| GLOBAL-012 | Keyboard shortcuts | Registro del mecanismo actual de acceso. No exige conservar las mismas combinaciones; las funciones ejecutadas por esos shortcuts sí deben quedar disponibles |
| GLOBAL-013 | Focus restoration | Comportamiento de interacción actual documentado como referencia; no es requisito de paridad funcional del rework |
| GLOBAL-014 | Validación de schema | Ninguna vía de edición o persistencia puede saltarse `StoreProjectV2Schema` |
| GLOBAL-015 | Centavos enteros | Precio, descuento y subtotales del dominio siguen representándose sin introducir floats |
| GLOBAL-016 | Índices derivados de taxonomy | Los cambios de categorías/colecciones siguen pasando por el dominio/helpers que mantienen coherentes los `productIds` derivados |
| GLOBAL-017 | Preview = exporter | El preview interno sigue consumiendo el mismo renderer del sitio público |
| GLOBAL-018 | Sin tocar storefront | El rework de Dashboard/Studio no modifica el storefront generado salvo tarea explícita separada |
| GLOBAL-019 | No tocar `proyectos/` para QA | Fixtures/tests del rework no reemplazan ni siembran datos reales de `proyectos/` |
| GLOBAL-020 | Avisos/notices | Registro del mecanismo actual de comunicación. Se preservan los estados/resultados que representan, no el tipo de componente usado para comunicarlos |
| GLOBAL-021 | Cerrar toast | Mecánica exclusiva de la UI actual. No tiene mutación de dominio y no obliga a que el nuevo rework tenga toasts ni un control equivalente |

---

## 13. Alcance del contrato funcional

Las **492 capacidades / 492 IDs únicos** siguen siendo el inventario verificable de lo que existe hoy en Dashboard + Studio. El inventario no es una especificación visual ni de UX.

Para el rework futuro:

- Se preservan operaciones de dominio, datos que pueden modificarse, precondiciones, efectos, persistencia, integraciones, recuperación y resultados observables.
- Los triggers actuales (`button`, shortcut, tab, modal, toast, menú, picker, etc.) quedan documentados únicamente como evidencia de la implementación existente.
- Una capacidad puramente mecánica de la UI actual puede desaparecer si no contiene una operación o garantía funcional propia.
- El nuevo agente puede reorganizar, fusionar o reemplazar por completo cualquier interacción sin seguir la arquitectura presente.
- Estas secciones no establecen decisiones de interfaz ni de experiencia de uso para el futuro rework.
- El storefront generado continúa fuera de alcance.

### 13.1 Clasificación para la futura migración

Cada ID actual puede clasificarse sin modificarlo ni renumerarlo:

| Clase | Significado | Paridad requerida |
| --- | --- | --- |
| `F-DOMAIN` | Mutación o consulta del modelo de tienda | Sí |
| `F-WORKFLOW` | Operación compuesta necesaria para completar una tarea del producto | Sí |
| `F-PERSIST` | Persistencia, backup, recovery, conflicto o autoridad de datos | Sí |
| `F-INTEGRATION` | Integración con exporter, runtime local, archivos u otra capacidad externa al componente | Sí |
| `F-SAFETY` | Invariante que evita corrupción, pérdida o escritura inválida | Sí |
| `UI-MECHANIC` | Mecanismo de interacción actual sin efecto funcional propio | No; sólo debe revisarse para comprobar que no escondía una función |

La clasificación no cambia el conteo actual de 492 IDs. Los huecos de numeración se conservan para mantener trazabilidad de capacidades retiradas sin renumerar las que siguen vigentes.

---

## 14. Estados funcionales que deben conservar semántica

Estos estados existen porque cambian qué operación puede ejecutarse, qué dato es autoridad o qué resultado debe producir el sistema. No prescriben cómo deben mostrarse.

| Eje funcional | Estados observados/relevantes | Efecto funcional |
| --- | --- | --- |
| Runtime | administrado / navegador | Cambia la autoridad de persistencia y las operaciones de disco disponibles |
| Proyecto | válido / inválido por schema | Determina si ciertas operaciones de persistencia/exportación pueden completarse |
| Edición | limpio / modificado | Distingue el snapshot confirmado del estado en edición |
| Persistencia administrada | saved / saving / site-outdated / error | Distingue commit confirmado, operación en curso, sitio previo conservado y fallo |
| Autosave navegador | saved / pending / saving / error | Determina si IndexedDB ya confirmó el estado actual |
| Recovery | sin draft / draft disponible / conflicto | Cambia qué fuentes de datos pueden recuperarse o descartarse |
| HistoryState | past / present / future | Habilita la reversión y reaplicación de cambios |
| Protección | base protegida / escritura autorizada | Condiciona mutaciones sobre la plantilla protegida |
| Operación | idle / busy / éxito / error; parcial donde la operación lo soporte | Evita considerar completa una operación que todavía ejecuta o terminó parcialmente |
| Auditoría/export | bloqueada / disponible / ejecutando / completada / fallida según la operación actual | Condiciona los efectos posteriores del flujo de exportación |
| Publicación | sin verificar / pass / fail / unverified cuando aplica | Conserva el resultado de las verificaciones existentes |
| Assets | procesando / disponible / referenciado / no usado / error donde aplica | Condiciona reemplazo, uso y eliminación de recursos |

---

## 15. Dependencias funcionales y precondiciones

Las siguientes relaciones forman parte del comportamiento actual. No determinan cómo ni dónde debe habilitarse una acción en la interfaz nueva.

| Operación | Precondiciones/dependencias a preservar | Resultado funcional |
| --- | --- | --- |
| Guardar administrado | Proyecto válido, runtime local disponible, sin bloqueo incompatible, versión de disco esperada | Commit del proyecto a disco o error/conflicto sin fingir éxito |
| Exportar production | Requisitos que actualmente bloquean production satisfechos y exporter disponible | Generación production o fallo conservando el estado válido previo cuando corresponda |
| Aplicar importación | Archivo/estructura procesable y revisión/decisión explícita antes de reemplazar datos | Mutación sólo después de la orden de aplicar |
| Importar tienda como proyecto nuevo | Respaldo `.json` o `.solara.json` válido y ausencia de una operación incompatible en curso | Crea una tienda independiente con nueva identidad técnica e IDs internos, conserva los datos funcionales de la tienda importada, persiste según el modo activo y abre el nuevo proyecto; la fuente original no se sobrescribe |
| Acciones bulk | Conjunto objetivo y parámetros válidos | Sólo se modifican los elementos objetivo |
| Borrar variante/sección/estructura | Objeto elegible y orden destructiva explícita | Eliminación sin dejar el proyecto en un estado inválido |
| Reparent taxonomy | Origen y destino válidos | Jerarquía válida e índices derivados coherentes |
| Editar estructura protegida | Condición de protección satisfecha | Escritura aceptada sólo cuando la política actual lo permite |
| Usar/reemplazar/eliminar assets | Asset procesado y restricciones de referencias vigentes | Referencias de proyecto coherentes |
| Verificar publicación | Entrada pública válida para la verificación actual | Resultado de verificación sin mutar contenido comercial |
| Recovery/import reemplazante | Fuente válida y orden explícita de reemplazo/recuperación | Proyecto reemplazado únicamente por la fuente elegida |

---

## 16. Contrato de persistencia y dirty state

### 16.1 Modo administrado

El comportamiento fuente actual establece:

1. El proyecto confirmado en disco es la base contra la que se calcula `dirty`.
2. Al cambiar el proyecto, se programa un `RecoveryDraft` como red de seguridad.
3. `Guardar` primero intenta vaciar esa cola de recovery pendiente.
4. Luego `persistProjectToDisk` persiste usando la versión de disco conocida y la política de escritura protegida correspondiente.
5. Sólo después de un commit confirmado se elimina el `RecoveryDraft`, se actualiza la versión de disco y el snapshot queda marcado como guardado.
6. Un `VERSION_CONFLICT` no se trata como guardado: entra al flujo de conflicto.
7. Otros fallos mantienen el estado de error y permiten volver a intentar la operación.
8. Si el proyecto editable pudo guardarse pero la generación derivada del sitio falla, el estado `site-outdated` conserva el sitio válido anterior.
9. Una segunda ejecución de guardado no entra mientras ya existe un guardado en curso.

### 16.2 Modo navegador

El comportamiento fuente actual establece:

1. Los cambios del proyecto se programan en `AutosaveQueue`.
2. El cierre/salida detecta si todavía existen cambios no confirmados.
3. `pagehide`, ocultar el documento y `beforeunload` intentan vaciar la cola pendiente.
4. La salida normal desde Studio intenta `flush()` antes de abandonar el proyecto; si falla, la salida no se completa como si hubiera guardado correctamente.

El futuro rework puede cambiar por completo los controles de guardado. Estas garantías de persistencia y autoridad de datos son las que deben sobrevivir.

---

## 17. Cambios externos, versiones y concurrencia

Studio ya contempla cambios de versión producidos fuera de la sesión de edición actual:

- En modo administrado consulta periódicamente el manifiesto de la tienda abierta.
- Si aparece una versión de disco mayor y el editor local está limpio, puede recargar la versión nueva desde disco.
- Si aparece una versión mayor mientras existen cambios locales pendientes, se genera un conflicto en lugar de sobrescribir silenciosamente el estado local.
- El guardado administrado también usa la versión conocida de disco y reconoce `VERSION_CONFLICT` al persistir.
- La implementación actual evita una segunda ejecución simultánea del mismo guardado mediante `saveInFlightRef`.

No se encontró en este barrido evidencia de un **lock exclusivo general por pestaña/ventana** para impedir abrir la misma tienda dos veces. La protección existente se basa en detección de versión/conflicto. Esto se documenta como comportamiento actual; no obliga al rework a conservar ni a introducir un mecanismo de UI concreto.

---

## 18. Recovery y reemplazo de fuentes de datos

Las decisiones de recovery son comportamiento funcional, independientemente de cómo se presenten:

| Decisión actual | Efecto |
| --- | --- |
| `recover` | Usa el proyecto del `RecoveryDraft` como proyecto a continuar |
| `keep` | Continúa con el proyecto de disco y conserva el draft |
| `discard` | Continúa con el proyecto de disco y elimina el draft correspondiente |

Además deben preservarse las operaciones ya inventariadas de exportación de recovery, recuperación desde fuentes soportadas, backups y reemplazos de proyecto. Ninguna de estas funciones exige conservar los diálogos o textos actuales; lo relevante es la fuente elegida, el efecto exacto sobre el proyecto y qué datos permanecen disponibles después.

---

## 19. Historial y reversibilidad funcional

`Studio.tsx` mantiene `HistoryState` con `past`, `present` y `future`. La función a preservar es poder revertir y reaplicar las mutaciones que actualmente pasan por ese historial.

También existen reversiones específicas fuera del historial general, como restaurar una tienda archivada. El mecanismo actual (`Deshacer` desde un toast en ese caso) no forma parte del contrato: sí forma parte del contrato la operación inversa que restaura el estado anterior cuando dicha capacidad existe.

Las operaciones que actualmente usan drafts locales antes de aplicar, como determinados editores/importaciones, deben conservar la distinción funcional entre **estado temporal aún no aplicado** y **estado ya incorporado al proyecto**. La nueva UI puede representar esa distinción como quiera.

---

## 20. Operaciones asíncronas y exclusión de ejecución

El código actual contiene operaciones que mantienen estado `busy` o una guarda equivalente para evitar ejecuciones superpuestas, entre ellas guardado, creación/duplicación/importación de tienda, import/export de catálogo y procesamiento de assets.

Para la paridad funcional hay que preservar, operación por operación:

- cuándo empieza a tener efectos;
- si admite o no una segunda ejecución simultánea;
- qué resultado parcial puede quedar si una parte falla;
- qué estado se conserva ante error;
- si existe actualmente una operación de retry o cancelación real;
- qué datos se mutan sólo al finalizar correctamente.

No se exige conservar spinners, barras de progreso, disabled states ni ningún tratamiento visual concreto. Tampoco se debe inventar cancelación donde la implementación actual no la tenga: si el nuevo producto agrega cancelación, será una capacidad nueva separada.

---

## 21. Modos y capacidades dependientes del entorno

| Capacidad funcional | Runtime administrado | Sólo navegador |
| --- | --- | --- |
| Editar proyecto | Sí | Sí |
| HistoryState undo/redo | Sí | Sí |
| Preview/exporter interno | Sí | Sí, según capacidades actuales |
| Guardado explícito confirmado en `proyectos/` | Sí | No |
| `RecoveryDraft`/autosave local | Red de seguridad | Persistencia local disponible en ese modo |
| Abrir carpeta local del proyecto | Sí | No mediante esa integración |
| Abrir sitio válido desde runtime local | Sí cuando existe | No mediante esa integración |
| Backups administrados | Sí | No mediante servidor local |
| Operaciones dependientes de sesión `__solara` | Sí | No |

La diferencia entre modos es un contrato funcional de capacidades y autoridad de datos. Su representación futura queda libre.

---

## 22. Registro de paridad funcional para el futuro rework

Durante la implementación nueva conviene derivar del inventario una tabla de control que no contenga decisiones de UI:

| ID actual | Clase | Operación/garantía subyacente | Entradas | Precondiciones | Mutación/resultado | Persistencia/side effects | Fallo/recovery | Evidencia nueva | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CAT-005` | `F-DOMAIN` | Crear producto | Datos válidos de producto | Reglas del schema/dominio | Nuevo producto en catálogo | Según modo de persistencia | Error sin alta parcial inválida | test/ruta/código | pendiente/implementado/verificado |

Reglas:

- Los IDs actuales mantienen su numeración original; el inventario vigente contiene 492 IDs únicos y conserva huecos donde se retiraron capacidades.
- Cada ID debe revisarse, pero sólo las clases `F-*` exigen equivalencia funcional.
- Un `UI-MECHANIC` puede desaparecer si se confirmó que no contiene una operación, dato, precondición, side effect, recovery o integración propia.
- Varias entradas pueden mapear a una misma implementación nueva si preserva todos los efectos funcionales correspondientes.
- La evidencia futura debe demostrar comportamiento; no hace falta reproducir el control actual ni aportar una captura equivalente.
- Una capacidad nueva que no exista hoy debe registrarse aparte y no alterar retrospectivamente qué hacía la UI auditada.

---

## 23. Checklist de cierre funcional del futuro rework

Antes de considerar preservadas las capacidades de Dashboard + Studio:

- [ ] Todos los IDs `DASH-*`, `STUDIO-*`, `PREP-*`, `RES-*`, `CAT-*`, `BUILD-*`, `THEME-*`, `ASSET-*`, `SEO-*`, `EXPORT-*`, `PREVIEW-*` y `GLOBAL-*` fueron revisados.
- [ ] Cada ID fue clasificado como función obligatoria (`F-*`) o mecánica de UI actual (`UI-MECHANIC`).
- [ ] Todas las funciones `F-*` tienen equivalencia verificable en la nueva implementación.
- [ ] Persistencia administrada y de navegador mantienen su autoridad y semántica actuales.
- [ ] Dirty state, RecoveryDraft, conflicto de versiones y recuperación no permiten pérdida silenciosa de datos.
- [ ] Undo/redo y las reversiones específicas mantienen sus efectos funcionales.
- [ ] Importaciones, reemplazos, bulk y operaciones destructivas mantienen las mismas garantías de datos.
- [ ] Las operaciones dependientes de `__solara` conservan sus diferencias respecto del modo navegador.
- [ ] Preview continúa usando el renderer compartido del exporter.
- [ ] El storefront generado permanece fuera del alcance del rework.

---

## 24. Fuentes de la auditoría

La lista se contrastó a nivel de código contra las superficies de UI internas y sus componentes asociados, principalmente:

- `apps/studio/src/App.tsx`
- `apps/studio/src/features/Dashboard.tsx`
- `apps/studio/src/features/dashboard/DashboardToolbar.tsx`
- `apps/studio/src/features/dashboard/ProjectCard.tsx`
- `apps/studio/src/features/dashboard/CreateStoreDialog.tsx`
- `apps/studio/src/features/dashboard/DuplicateDialog.tsx`
- `apps/studio/src/features/dashboard/CompareView.tsx`
- `apps/studio/src/features/Studio.tsx`
- `apps/studio/src/features/ManagedPersistenceControls.tsx`
- `apps/studio/src/features/Preview.tsx`
- `apps/studio/src/features/GuidedOverview.tsx`
- `apps/studio/src/features/Overview.tsx`
- `apps/studio/src/features/Catalog.tsx`
- `apps/studio/src/features/catalog/CatalogToolbar.tsx`
- `apps/studio/src/features/catalog/CategoryTree.tsx`
- `apps/studio/src/features/catalog/ProductEditor.tsx`
- `apps/studio/src/features/Builder.tsx`
- `apps/studio/src/features/builder/SettingsInspector.tsx`
- `apps/studio/src/features/builder/RepeaterEditor.tsx`
- `apps/studio/src/features/builder/HeroSlidesEditor.tsx`
- `apps/studio/src/features/ThemeEditor.tsx`
- `apps/studio/src/features/Assets.tsx`
- `apps/studio/src/features/Seo.tsx`
- `apps/studio/src/features/Export.tsx`
- componentes compartidos de confirmación, selección de assets y UI usados por esas superficies.

La presencia de un control compartido no se cuenta como una capacidad independiente si sólo implementa internamente una acción ya inventariada en su feature.

