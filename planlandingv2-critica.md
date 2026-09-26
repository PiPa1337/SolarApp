# Crítica adversarial de `planlandingv2.md`

> Estado: la auditoría línea por línea corresponde al snapshot anterior del plan. Sus fallos principales fueron integrados/corregidos posteriormente en `planlandingv2.md`; por eso esas referencias de línea ya no coinciden con la versión actual. Debajo se agrega una segunda pasada sobre la arquitectura corregida.

> Método: intento refutar cada afirmación sustantiva del plan. Las líneas vacías, separadores y cercos de código no contienen una afirmación técnica y por eso se consideran sólo formato. Cuando una línea resiste la crítica, lo digo explícitamente en vez de inventar un fallo.

## Segunda pasada — fallo nuevo encontrado después de corregir el modelo Landing

La primera corrección resolvió el hueco de `LandingProjectV1`, persistencia aislada, orden de fases y compatibilidad de variants. Sin embargo dejó una suposición todavía demasiado optimista: que `LandingRenderModel` podía conectarse a las primitives/renderers actuales mediante adapters pequeños.

La inspección del repo contradice esa suposición:

- `App.tsx` conserva estado activo/draft `StoreProjectV1`;
- `exportProject` y `renderPreviewHtml` validan/reciben `StoreProjectV1`;
- `ModuleRenderContext` contiene `StoreProjectV1` + `StoreSection`;
- `packages/modules` usa `StoreSection` y módulos que leen `commerceTemplates`, products, variants y assets;
- `project-mutations` está construido alrededor de `StoreProjectV1`.

Conclusión adversarial: si F2 empezara "generalizando" estos contratos para admitir Landing, repetiríamos exactamente el patrón que el usuario quiere evitar: rework transversal antes de haber renderizado siquiera un Hero y una gran superficie de compilación rota al mismo tiempo.

Corrección incorporada al plan actual:

1. F2 se divide conceptualmente en discovery read-only y primer corte ejecutable mínimo.
2. Renderer/module-sdk/export Store se consideran opacos por defecto.
3. Cada superficie se clasifica `STORE-OPAQUE`, `EXTRACTABLE-PURE` o `LANDING-NEW-MINIMAL`.
4. Una primitive sólo se comparte si hay call site Store antes/después, call site Landing, firma neutral, test focal, hash Store intacto y F0 verde.
5. El Landing render boundary prohíbe imports de tipos Store-only mediante un test arquitectónico sobre su lista explícita de archivos.
6. F2/F3 no generalizan las firmas de `StoreSection`, `ModuleRenderContext`, `exportProject` ni `renderPreviewHtml`.
7. El primer objetivo ejecutable es `LandingProjectV1 -> LandingRenderModel -> Hero 01` sin tocar esas firmas.
8. Localhost, Preview y export Landing comparten ese boundary; pueden tener wrappers/orquestadores diferentes.
9. "Reutilizar el editor" queda definido como reutilizar shell/UX/controles neutrales, no forzar APIs Store-only.
10. Si el primer Hero exige convertir Store a un modelo universal, el plan ordena STOP y reducir la frontera.

Con esta segunda corrección, el riesgo dominante deja de ser "falta un modelo Landing" y pasa a estar explícitamente contenido: **no intentar fabricar un motor universal antes de demostrar una vertical mínima Landing**.

## Veredicto general

El plan V2 tiene buenas reglas de contención, pero **no es implementable tal como está escrito**. Su fallo principal es que intenta mantener `StoreProjectV2` intacto y, al mismo tiempo, no define el modelo persistido que reemplaza a `StoreProjectV2` para una Landing. Ese hueco reaparece en Preview, History, Canvas, backup, recovery, exporter, optimizer, módulos y Studio.

La inspección actual del repo muestra además:

- `StoreProjectV1` aparece en 77 archivos bajo `apps/studio/src` y `packages`.
- `RecoveryDraft.project` está tipado como `StoreProjectV1` y su tabla se indexa sólo por `projectId`.
- `projectArchive.ts` acepta únicamente `format: "solara-project"`, `version: 2` y `StoreProjectV2`.
- `packages/exporter/src/recovery.ts` reconstruye y valida exclusivamente `StoreProjectV2`.
- `site-optimizer` construye rutas, readiness, Merchant y contexto IA directamente desde `StoreProjectV1`.
- los módulos de `packages/modules` leen directamente `products`, `commerceTemplates`, `siteShell` y otras propiedades comerciales.
- el `HistoryState` de Core está tipado explícitamente con `StoreProjectV1`.

Por eso el supuesto “kind externo + capabilities + mismo Studio” no elimina el acoplamiento: sólo lo desplaza.

## Siete fallos fatales antes del detalle línea por línea

1. **No existe un contrato `LandingProject`.** El plan define `SiteKind` y un contenedor, pero nunca define qué datos contiene una Landing. Sin schema no hay parse, save, backup, recovery, history ni edición segura.
2. **El orden de fases es inconsistente.** F3 necesita `kind` para Preview antes de F4, donde recién se define la persistencia del `kind`. F5 promete “abrir” Landing antes de F6, donde recién se adapta Studio.
3. **`SiteCapabilities` duplica fuentes de verdad.** Store ya tiene `commerceTemplates`, `navigation`, `siteShell` y capacidades derivadas del page graph. Otra matriz booleana puede contradecirlas.
4. **El “oráculo byte a byte” no demuestra equivalencia para todos los Store.** Un conjunto finito de fixtures sólo prueba esos fixtures y puede congelar bugs actuales como contrato.
5. **Rollback por `git revert` deja datos persistidos incompatibles.** Después de F4, una Landing guardada puede quedar ilegible para el código anterior aun si el commit se revierte.
6. **La matriz de impacto está incompleta.** Omite `site-optimizer`, `projectArchive`, `recovery.ts`, `pwa.ts`, `feeds.ts`, `cf-worker`, `modules`, `module-sdk`, `core/history`, `agent-control`, `agent-contracts` y varios puntos de `App.tsx`.
7. **“Shared Visual Engine” es una arquitectura deseada, no una frontera existente.** Hoy el conocimiento Store está distribuido. Pretender que ya existe oculta el costo de extracción que precisamente se quiere evitar.

---

## Auditoría por líneas

### Líneas 1–5 — título, estado y objetivo

- **L1** — “conservativa, determinista y rollbackeable” está declarado antes de demostrar esas propiedades. En especial “rollbackeable” es falso después de introducir datos persistidos que una versión anterior no entienda.
- **L3** — resiste la crítica: identifica correctamente que el archivo es un plan y no código.
- **L5** — “sin cambiar el comportamiento observable” es demasiado absoluto. El objetivo defendible es “sin cambiar el comportamiento observable de Store”; la aplicación sí cambiará de forma observable al sumar Dashboard, tipos de proyecto y flujos Landing.

### Líneas 7–25 — decisión arquitectónica

- **L7** — sólo es un encabezado.
- **L9** — “perfil alrededor del motor visual” no funciona todavía porque no existe un motor visual desacoplado de Store; módulos, exporter y Studio reciben `StoreProjectV1` directamente.
- **L11** — puede funcionar como restricción de compatibilidad, pero deja sin resolver qué schema usa Landing. Prohibir el cambio no crea el modelo faltante.
- **L13–L21** — el diagrama omite el dato más importante: el tipo del proyecto bajo `LANDING_PROFILE`. Dos perfiles sin dos payloads definidos no forman una arquitectura ejecutable.
- **L23** — ubicar `kind` en un envelope es una buena dirección, pero el plan no define un `ProjectEnvelope` discriminado ni qué payload corresponde a `kind: landing`. Además, el `kind` debe viajar por App, worker, Preview y exporter, por lo que no queda confinado al repositorio.
- **L25** — no puede cumplirse literalmente. Dashboard, editor y Preview sí deben interpretar el nuevo `kind`; de lo contrario no pueden distinguir una Landing. La propiedad razonable es que un Store legacy no necesite migración de su payload.

### Líneas 27–40 — propiedad de seguridad

- **L29** — “para todo StoreProject válido” formula una propiedad universal que una suite finita no puede demostrar.
- **L32** — la igualdad de serialización sólo es medible después de fijar normalización, orden de claves y si se compara entrada cruda o proyecto parseado. Zod ya aplica defaults.
- **L33** — igualdad completa de export puede romper legítimamente por un cambio compartido de seguridad, headers o runtime. Como gate Landing sirve; como invariante eterna, no.
- **L34** — Preview draft contiene diferencias propias del modo editor, base href, canvas y runtime; exigir byte equivalencia sin normalización definida es frágil.
- **L35** — `capabilities_actual(P)` no existe como una función canónica hoy; las capacidades se derivan en varios lugares. No hay un oráculo único con el cual comparar.
- **L38** — “donde sea determinista” deja abierta exactamente la excepción que puede vaciar el valor del gate. Debe enumerar campos no deterministas permitidos y por qué.
- **L40** — cambiar una expectativa existente no siempre significa regresión: un test puede fijar un bug. Para trabajo Landing conviene presumir regresión, pero no convertirlo en axioma absoluto.

### Líneas 42–63 — invariantes

- **L44** — puede funcionar para Store, pero exige crear un schema Landing separado; el plan nunca lo hace.
- **L45** — resiste la crítica para Store.
- **L46** — resiste la crítica para Store.
- **L47** — resiste la crítica y es una buena defensa contra churn de snapshots.
- **L48** — resiste la crítica.
- **L49** — resiste la crítica y debe mantenerse.
- **L50** — “mismo renderer visual” necesita definición. Es correcto compartir `renderDocument`/secciones; no es correcto obligar a Store y Landing a tener el mismo page-graph builder.
- **L51** — resiste la crítica; el runtime actual ya tiene feature gating suficiente para intentar reutilización.
- **L52** — sólo funciona si Landing define campos compatibles para Theme/Assets/SEO/History/Canvas. Hoy History y muchos helpers están tipados contra StoreProject, así que la frase evita duplicación pero no resuelve tipado.
- **L53** — resiste como objetivo, pero obliga a diseñar un adapter real; ocultar tabs no basta.
- **L54** — resiste la crítica.
- **L55** — buena regla, pero el plan no especifica cómo impedir condicionales dispersos. Un lint/test de arquitectura sería necesario.
- **L56** — una frontera central de capabilities no puede por sí sola controlar módulos que inspeccionan `project.products` o `project.commerceTemplates` directamente.
- **L57** — resiste la crítica.
- **L58** — útil como presunción, no como verdad absoluta.
- **L59** — falso después de persistencia: revertir código no revierte archivos/IndexedDB/manifests ya creados.
- **L60** — “frontera grande” no está definida; dos desarrolladores pueden clasificar el mismo cambio de forma distinta.
- **L61** — resiste la crítica.
- **L62** — resiste la crítica.
- **L63** — resiste la crítica como alcance de producto.

### Líneas 65–101 — PRE-0

- **L67** — correcto para el estado observado; el árbol actual tiene cambios ajenos.
- **L69** — correcto como gate conceptual.
- **L71–L79** — los comandos prueban identidad básica del checkout, pero no prueban lockfile, remotos, dependencias instaladas ni que no haya procesos escribiendo en el árbol.
- **L83** — correcto.
- **L84** — “finalizar o aislar” es ambiguo; debe decir exactamente qué estrategia usar y cómo demostrar que el worktree no comparte cambios sin commit.
- **L85** — correcto.
- **L86** — sólo una sugerencia; no aporta determinismo.
- **L87** — correcto.
- **L88** — correcto en árbol compartido.
- **L89** — correcto.
- **L91–L99** — registrar texto manualmente no crea evidencia reproducible. Debe existir un script/archivo de baseline generado desde Git y herramientas.
- **L101** — resiste la crítica.

### Líneas 105–121 — F0 y fixtures

- **L107** — buena intención, pero “comportamiento actual” es mucho más que exporter/schema; incluye dashboard, recovery, optimizer, módulos, agent y runtime.
- **L109** — los manifests de hashes sí son comportamiento de test: pueden volver la suite rígida y congelar outputs accidentales. No cambian producto, pero sí cambian el contrato de desarrollo.
- **L113** — correcto en principio.
- **L115** — `referenceStore` es concreto.
- **L116** — “fixture Catalog Modern oficial” no es un identificador reproducible; debe nombrar símbolo y ruta exactos.
- **L117** — `catalogScaleStore` cubre escala, pero no todas las combinaciones de features.
- **L118** — no define un fixture exacto; por tanto el baseline no es reproducible.
- **L119** — tampoco define un fixture exacto.
- **L121** — resiste la crítica.

### Líneas 123–180 — qué mide F0

- **L125** — correcto sólo si la lista de fixtures es cerrada y versionada.
- **L129** — parsear es necesario pero no verifica compatibilidad de inputs legacy ni migración/normalización.
- **L130** — “JSON estable” necesita canonicalización explícita.
- **L131–L136** — la lista es incompleta: omite identity, SEO, assets, videos, pages, publicCopy, legalProfile, policies y WhatsApp. El hash global puede capturarlos, pero el plan dice que los mide explícitamente y no lo hace.
- **L140** — usar sólo un fixture pequeño para hashes deja fuera interacciones de escala y combinaciones de rutas.
- **L142** — correcto.
- **L143** — correcto si el algoritmo y encoding están fijados.
- **L144** — correcto.
- **L145** — correcto.
- **L146** — correcto.
- **L147–L151** — incompleto: faltan `manifest.webmanifest`, service worker, icons, `_headers`, redirects/worker, image/video sitemap, deployment manifest, llms/AI y recovery artifacts cuando correspondan.
- **L153** — no versionar el export completo es razonable, pero entonces debe versionarse un manifest de baseline pequeño con hashes y metadata o no existe oráculo persistente.
- **L157** — hash de HTML puede ser útil, pero no comprueba interacción, accesibilidad ni estado del runtime.
- **L160–L166** — las rutas con `<fixture>` no son ejecutables como especificación; además `/404` puede no coincidir con el contrato real de `404.html`/fallback.
- **L171** — “HTML útil” es subjetivo. Debe definirse con contenido/roles/enlaces concretos.
- **L176–L177** — los nombres sugeridos son viables, pero un snapshot masivo dentro de tests del paquete puede volver la suite costosa y frágil.
- **L180** — buena regla, pero necesita una whitelist explícita de volatilidad legítima; de lo contrario el primer timestamp/orden de entorno bloquea el plan.

### Líneas 182–208 — gate y rollback F0

- **L185–L187** — estos gates no prueban Studio, runtime, site-optimizer, agent-control ni módulos. Para un “oráculo Store” son demasiado estrechos.
- **L192** — dos corridas consecutivas sólo prueban estabilidad local inmediata, no estabilidad entre procesos limpios, zona horaria, OS o versión de Node.
- **L193** — resiste la crítica.
- **L194** — “cero comportamiento nuevo” no es una aserción ejecutable.
- **L199** — mensaje de commit correcto.
- **L205** — rollback por revert funciona porque F0 aún no persiste datos nuevos.
- **L208** — resiste la crítica y es una buena condición de stop.

### Líneas 212–239 — F1, contrato de capacidades

- **L214** — no se puede “definir Landing sin tocar StoreProject” sin definir **otro** tipo de proyecto. Esa definición falta.
- **L219** — `SiteKind` es razonable en un envelope.
- **L221–L232** — la interfaz de booleans permite estados inválidos (`catalog=false` y `productList=true`, `checkout=true` y `cart=false`, etc.). Necesita una unión discriminada o invariantes de construcción.
- **L222–L231** — además duplica flags ya existentes en Store y crea riesgo de dos fuentes de verdad.
- **L235–L239** — `resolveSiteCapabilities(kind, project)` no especifica el tipo de `project`. Si es StoreProject, Landing sigue forzada a ser Store. Si es unión Store/Landing, falta definir `LandingProject`.

### Líneas 241–283 — perfiles y ubicación

- **L243** — “exactamente” no se cumple con la lista siguiente.
- **L245–L248** — son parte de la verdad actual.
- **L249** — “páginas existentes” es circular: las páginas son a la vez entrada y salida de capabilities.
- **L250** — usar presencia de arrays como capability puede confundir “feature habilitada pero vacía” con “feature inexistente”.
- **L251** — runtime features actuales también dependen de módulos activos, page types, videos y markup de variantes/filtros; la lista no los modela.
- **L253** — correcto como regla, pero `StoreProjectV2Schema` ya aplica defaults, por lo que la función recibirá datos normalizados si se usa después del parse.
- **L258–L266** — perfil fijo razonable como política inicial, pero no modela header, footer, video, motion, forms, legal, PWA ni AI context.
- **L267** — `contact=true` siempre es incorrecto: una Landing sin módulo/contacto no debe activar runtime de contacto.
- **L270** — semánticamente correcto, pero hoy los datos de WhatsApp están en StoreProject; Landing necesita un contrato de contacto propio o compartido.
- **L274** — dejar la ubicación “a evaluar” contradice un plan determinista. Debe decidirse antes de implementar.
- **L279** — poner capabilities en exporter hace que Studio dependa de una capa de salida para política de producto.
- **L280** — ponerlas en project-schema mezcla schema persistido con política de aplicación. Ninguna opción es claramente correcta; falta una tercera frontera compartida.
- **L283** — correcto como restricción de Store, pero vuelve a exponer el vacío de `LandingProject`.

### Líneas 285–307 — tests y rollback F1

- **L287** — los fixtures no prueban equivalencia universal.
- **L288** — “todas las capacidades ecommerce” no está definido de forma exhaustiva.
- **L289–L291** — resisten la crítica.
- **L296** — tests de project-schema pueden ser irrelevantes si capabilities termina fuera de ese paquete.
- **L297–L298** — correctos pero insuficientes para consumidores reales.
- **L301** — útil.
- **L305** — rollback de F1 puede funcionar porque sigue siendo código puro.
- **L307** — demasiado rígido si el cambio de hash es un bugfix legítimo compartido; para una rama exclusiva Landing sí es una alarma útil.

### Líneas 311–371 — F2, page graph

- **L313** — no se puede producir una Landing real sin un payload Landing definido.
- **L317** — buena regla de contención.
- **L319** — llamar al camino Store “oráculo” no impide que helpers compartidos cambien su output.
- **L324** — `buildLandingPages(project, capabilities)` repite el fallo central: `project` carece de tipo/contrato.
- **L327** — compartir renderer de secciones es razonable, pero sólo si las secciones de Landing son compatibles con `StoreSectionSchema` o existe un adaptador explícito.
- **L334–L340** — la lista mínima está incompleta. El exporter actual también maneja CSS/JS, fonts, icons, webmanifest, service worker, headers, redirects/worker, image/video sitemaps, AI context, recovery y otros archivos.
- **L340** — “sólo si sigue siendo global” es una decisión aplazada, no determinista.
- **L343** — “si no dependen de ecommerce” carece de criterio ejecutable. Las páginas legales actuales usan copy/policies del Store.
- **L348–L360** — buena lista negativa, pero no cubre `feed.xml`, AI/LLM con lenguaje comercial, PWA/offline, CSS/JS comercial ni headers específicos de Merchant.
- **L365–L369** — resisten la crítica; coinciden con el código inspeccionado.
- **L371** — resiste la crítica: catálogo vacío no basta.

### Líneas 373–396 — structured data y tests F2

- **L377–L381** — son tipos razonables, pero los helpers actuales pueden emitir tipos específicos de tienda. “Puede conservar” no demuestra que exista un helper neutral.
- **L381** — `LocalBusiness` no siempre corresponde a una landing; depende del negocio y datos disponibles.
- **L383** — correcto.
- **L387** — “lista exacta” es buena idea sólo cuando antes se define la lista completa esperada.
- **L388** — “cero rutas ecommerce” debe expresarse como conjunto concreto de patrones.
- **L389–L390** — correctos.
- **L391** — prohibir todo `ItemList` puede ser incorrecto: `ItemList` también sirve para contenido no comercial. Debe prohibirse ItemList de productos, no el tipo completo.
- **L392** — correcto.
- **L393** — subjetivo sin assertions.
- **L394** — “correctos” no define reachability, hashes, mime, responsive sources ni orphan handling.
- **L395** — necesita parser/crawler y definición de enlaces externos vs internos.
- **L396** — “válida” no define status/fallback, canonical, noindex ni enlaces.

### Líneas 398–418 — gate/rollback F2

- **L401** — correcto para exporter.
- **L402** — útil si Landing usa el mismo runtime; no demuestra page graph.
- **L403** — correcto y debería ejecutarse incluso antes de F8.
- **L404** — útil.
- **L407** — correcto como regresión Store.
- **L411** — rollback de código funciona si F2 no persistió datos.
- **L415** — mismo problema de rigidez del hash.
- **L416** — “aparece ecommerce” necesita lista/semántica precisa.
- **L417** — Preview y export pueden tener orquestadores distintos y compartir renderer. La frase, literal, bloquearía diferencias sanas de hosting/editor.
- **L418** — útil si significa “no cambiar la forma persistida de Store”.

### Líneas 422–484 — F3 Preview

- **L424** — buena meta, pero “mismo motor” debe referir al renderer visual común.
- **L429–L432** — resisten como prohibiciones de duplicación.
- **L437** — hoy Preview y export worker reciben `StoreProjectV1`; “solicitar el grafo Landing” requiere cambiar contratos antes de que el plan haya introducido un tipo Landing.
- **L439** — contradicción temporal: F3 necesita conocer `kind` pero F4 recién define dónde vive y persiste `kind`.
- **L446–L448** — `404` y “legales/contacto” son especificaciones demasiado vagas para una matriz de rutas determinista.
- **L451** — correcto.
- **L456** — `contenido_semantico()` no existe ni está definido. Sin canonicalización DOM y reglas de exclusión no es un test.
- **L459** — Preview también puede diferir legítimamente en draft markers, service worker, base href y atributos de runtime; limitar diferencias sólo a canvas es probablemente falso.
- **L463–L469** — lista razonable, pero no prueba cambios de navegación, assets, video ni contactos.
- **L466** — correcto para ecommerce, pero runtime todavía puede incluir código completo aunque las features estén apagadas.
- **L467** — “cero errores de consola” puede perder errores async posteriores o errores de worker si no se espera una señal de estabilidad.
- **L469** — correcto.
- **L474–L477** — `test:e2e:smoke` actual es Store-oriented y un spec Landing nuevo no entra automáticamente al smoke; la política del repo exige estabilidad antes de incluirlo.
- **L480** — correcto.
- **L484** — rollback de código funciona en esta fase si no hubo persistencia.

### Líneas 488–570 — F4 persistencia

- **L490** — imposible sin definir el JSON contractual de Landing.
- **L494** — dirección correcta.
- **L497** — el discriminante es insuficiente sin el payload discriminado.
- **L503** — “kind ausente => store” debe limitarse a manifests legacy conocidos. Aplicarlo a cualquier manifest desconocido puede clasificar corrupción o versiones futuras como Store.
- **L506** — buena compatibilidad.
- **L511** — correcto para nuevos manifests si sus parsers aceptan el campo.
- **L514** — “versionar explícitamente” no define quién lee v1/v2, cómo se migra, ni compatibilidad downgrade; es una rama de diseño pendiente.
- **L518** — correcto.
- **L519** — puede ser necesario con el namespace actual, pero es una política no demostrada. Si storage se separa por kind, la colisión podría ser legal.
- **L520** — correcto.
- **L521** — no es “mantener” sin más: las funciones actuales aceptan StoreProject y recovery Store; para Landing hay que adaptar o duplicar capas.
- **L522** — buena propiedad, pero necesita un test de atomicidad con fallo inyectado.
- **L526–L534** — nueve operaciones en una sola fase convierten F4 en una fase grande; contradice el objetivo de cambios pequeños y complica rollback.
- **L538–L543** — “mínima discriminación” no alcanza. `RecoveryDraft.project` es `StoreProjectV1`, el parser es Store y la tabla se indexa sólo por `projectId`; hace falta un contrato de DB y posiblemente migración de Dexie.
- **L547** — correcto para legacy conocido.
- **L548** — buen requisito.
- **L549** — no puede probarse hasta definir el payload/manifest Landing.
- **L550–L555** — buenas pruebas, pero faltan corrupción, versión futura, downgrade y archive format.
- **L556** — buena intención, no prueba compatibilidad por sí sola.
- **L561–L563** — razonables, pero deben incluir pruebas de `projectArchive`, recovery y local project storage exactas, no confiar sólo en filtros de paquete.
- **L566** — correcto.
- **L570** — **falso como rollback completo**. `git revert` no elimina ni transforma Landings ya guardadas; el binario anterior puede quedar incapaz de abrir/listar esos datos.

### Líneas 574–629 — F5 Dashboard

- **L576** — contradicción: “abrir Landing” no puede completarse antes de F6, donde recién existe Studio compatible.
- **L580** — “Nueva landing o una superficie Landings” deja una decisión UX/IA importante abierta; no es determinista.
- **L584–L588** — son buenas reglas, pero dependen de un modelo/route que todavía no está definido.
- **L592** — “abrir” falla por orden de fases.
- **L593** — duplicar requiere clonación y validación del payload Landing todavía ausente.
- **L594** — viable a nivel de manifest.
- **L595** — depende de un archive format Landing no definido.
- **L596** — necesita semantics de eliminación y recovery/backup.
- **L600–L605** — buenos escenarios, salvo que “abre Landing” no está habilitado aún.
- **L609** — correcto según las reglas del repo.
- **L614** — correcto como viewport principal del Studio.
- **L620–L622** — los comandos no ejecutan necesariamente el “spec focal” de Landing.
- **L625** — al no incluir el comando exacto, el gate puede pasar sin ejecutar ese spec.
- **L629** — mismo problema de persistencia: revertir UI no revierte Landings creadas.

### Líneas 633–724 — F6 Studio

- **L635** — es el objetivo correcto pero la fase más riesgosa del plan.
- **L637** — F0–F5 no pueden estar totalmente verdes porque F5 promete abrir un editor que F6 todavía no existe.
- **L644** — `kind` necesita estar presente en estado de App y atravesar worker/Preview; “resolver una vez” no elimina propagación de contexto.
- **L647** — es falso para el código actual: muchas superficies no consultan capabilities y leen `project.products`, `project.commerceTemplates`, `project.siteShell`, etc. directamente.
- **L651–L661** — ocultar UI no evita que código de background, readiness, worker, optimizer o hooks siga ejecutándose con un payload incompatible.
- **L665** — identidad necesita un schema Landing.
- **L666** — Theme necesita un schema compartido exportable sin StoreProject.
- **L667** — Assets idem.
- **L668** — SEO actual incluye Merchant y campos Store; “SEO general” necesita separación explícita.
- **L669** — Navigation actual tiene `catalogLabel`, `showSearch`, `showCart`; no es neutral.
- **L670** — `StoreSectionSchema` y módulos no son automáticamente neutrales.
- **L671** — Canvas bindings tienen fuentes product/category/collection; necesita filtrado/adaptación.
- **L672** — **no puede conservarse sin cambio**: `HistoryState` de Core usa `StoreProjectV1[]`.
- **L673** — Preview actual recibe StoreProject.
- **L674** — el shell puede reutilizarse.
- **L675** — Guardar actual usa repositorios Store.
- **L676** — Exportar actual usa StoreProject y recovery Store.
- **L677** — contacto necesita modelo propio/compartido.
- **L678** — “legales compatibles” no identifica qué datos requieren.
- **L682** — demasiado rígido. Puede ser necesario mover una primitive para extraerla limpiamente; lo importante es que el movimiento sea behavior-preserving y separado.
- **L684–L688** — buena heurística, pero “dos consumidores” no garantiza que la abstracción esté bien elegida.
- **L692** — “tabs/acciones esenciales” no está enumerado; no es verificable.
- **L693** — “no ofrece ecommerce” necesita DOM/route/runtime assertions.
- **L694–L701** — buenos recorridos pero dependen del modelo faltante.
- **L702** — necesita señal de runtime listo y espera de errores async.
- **L707–L709** — insuficiente para cambios que atraviesen modules/exporter/optimizer.
- **L712** — QA manual 1920×912 no es determinista.
- **L718–L724** — varias señales son correctas, pero prohibir cualquier “refactor de Preview/History/Theme” puede impedir la mínima generalización imprescindible. Debe prohibirse refactor amplio, no cualquier cambio estructural.

### Líneas 728–797 — F7 plantilla

- **L730** — “útil” es subjetivo; necesita criterios de contenido/CTA/contacto.
- **L735–L741** — la selección es razonable, pero no prueba que los módulos actuales sean neutrales. El header actual inspecciona `commerceTemplates`, `siteShell`, búsqueda y carrito; otros módulos leen productos.
- **L744** — “semánticamente correctos” es una decisión manual no determinista; hace falta una lista auditada de módulos permitidos.
- **L746** — “primitive imprescindible” tampoco está definido y puede abrir el mismo rework que se intenta evitar.
- **L750–L759** — resisten la crítica como límites de scope.
- **L766–L768** — resisten la crítica y coinciden con el contrato responsive actual.
- **L771** — correcto.
- **L775** — “template válido” depende de un Landing schema inexistente.
- **L776** — manifests de módulos actuales usan contexto Store; “válidos” no implica compatibles con Landing.
- **L777** — paridad sigue sin función de comparación definida.
- **L778** — necesita aserciones concretas.
- **L779–L781** — buenos requisitos, pero los gates listados no ejecutan explícitamente todos esos checks.
- **L782** — demasiado genérico.
- **L783** — SEO debería incluir `site-optimizer`, omitido del plan.
- **L784** — URLs requiere una matriz exacta.
- **L785** — “cero ecommerce” necesita definición observable.
- **L790–L792** — smoke/full son útiles, pero no sustituyen tests focales Landing ni optimizer.
- **L797** — rollback de plantilla puede romper Landings persistidas que ya usen sus module IDs/variants.

### Líneas 801–843 — F8 flujo real

- **L803–L813** — este recorrido end-to-end es correcto, pero llega demasiado tarde. Un vertical slice create→save→preview→export debería existir mucho antes para descubrir incompatibilidades de arquitectura antes de F6/F7.
- **L817–L828** — lista útil pero incompleta: falta recovery compatibility, archive format, headers/PWA/offline, AI/LLM, asset integrity y downgrade.
- **L833–L836** — buenos gates, pero no ejecutan la suite funcional completa ni `site-optimizer` explícito.
- **L839** — correcto.
- **L843** — nuevamente, revertir código no revierte datos Landing ni módulos ya persistidos.

### Líneas 847–874 — F9 expansión

- **L849** — “completa y estable” no tiene métricas.
- **L851** — un orden fijo puede no reflejar necesidades reales ni dependencias técnicas.
- **L853–L860** — cada ítem puede requerir schema/module/editor/renderer simultáneamente; no son necesariamente incrementos simples.
- **L865** — Family/Preset/Variant es una separación razonable, pero introducirla puede convertirse en una refactorización del sistema de módulos si el modelo actual no la soporta.
- **L868–L870** — definiciones conceptuales correctas.
- **L872** — resiste la crítica.
- **L874** — falso una vez que una Landing persistida referencia una nueva family/variant: revertir código puede volver ilegible o no renderizable ese proyecto.

### Líneas 878–915 — F10 cierre

- **L880** — correcto como gate de orden.
- **L885–L890** — buenos comandos, aunque hay redundancia y no garantizan las auditorías eliminadas de la suite E2E reducida.
- **L893** — correcto.
- **L897** — correcto.
- **L900** — demasiado absoluto para una rama larga: cualquier bugfix Store legítimo rompe el baseline. Si la rama es exclusivamente Landing, sirve como gate temporal.
- **L903** — esta excepción contradice en parte “0 regresiones/byte identical”; hay que definir si el objetivo es igualdad o cambio justificado.
- **L907** — correcto en intención.
- **L909–L915** — documentar sólo al cierre es tarde para cambios persistidos de F4 y contratos de F1/F2; cada commit contractual debería actualizar su documentación mínima.

### Líneas 919–944 — matriz de impacto

- **L921** — la matriz se presenta como inventario, pero no es consciente de todas las superficies reales.
- **L925** — “preferentemente ninguno” omite el lugar obvio para un `LandingProjectV1` o schemas compartidos. Mantener `StoreProjectV2ShapeSchema` intacto no implica no tocar el paquete.
- **L926** — archivo sin ubicación de paquete determinada; el diseño sigue abierto.
- **L927** — correcto.
- **L928–L929** — correctos.
- **L930** — “idealmente no” puede ser cierto funcionalmente, pero Landing seguirá descargando el runtime completo y su CSS si no se hace separación de assets; la implicación de performance no está tratada.
- **L931** — “pequeño” es optimista: Preview contiene routing, canvas y tipos Store.
- **L932** — “pequeño” también es optimista: Studio y History están tipados a Store.
- **L933** — Builder casi seguro participa porque filtra por `designFamily` y page kind.
- **L934–L938** — superficies reales, pero subestiman el cambio de tipo.
- **L939** — correcto como posible superficie.
- **L940** — correcto y probablemente obligatorio.
- **L941** — “No” sólo es seguro si existe un guard explícito que impida enrutar Landing al CSV worker.
- **L942–L943** — correctos.
- **L944** — docs sólo al cierre es demasiado tarde.
- **Omisiones de la tabla** — `packages/site-optimizer`, `packages/modules`, `packages/module-sdk`, `packages/core`/History, `packages/agent-control`, `packages/agent-contracts`, `projectArchive.ts`, `packages/exporter/src/recovery.ts`, `pwa.ts`, `feeds.ts`, `cf-worker.ts`, `App.tsx`, import/export de backups y scripts de affected-tests. Esta omisión por sí sola invalida la afirmación de que el plan es “consciente de todo lo que debe modificar”.

### Líneas 948–1001 — 50 amenazas

- **L952** — schema Store intocable evita una clase de regresión, pero no crea schema Landing.
- **L953** — hash F0 sólo cubre fixtures/versiones seleccionadas.
- **L954** — F0/F4 no cubren todos los formatos de round-trip, especialmente archive/recovery/downgrade.
- **L955** — un “invariant” textual no es un test.
- **L956** — correcto si existe un assertion explícito.
- **L957** — “prohibición” no es enforcement.
- **L958** — F5 llega tarde: funciones de repository podrían tocar Predeterminado antes.
- **L959** — razonable.
- **L960** — razonable.
- **L961** — F4 no define el formato de backup Landing.
- **L962** — F4 no define versiones/readers del manifest.
- **L963** — razonable si el namespace sigue global.
- **L964** — restore necesita archive schema Landing.
- **L965** — recovery requiere rediseño de tipo/tabla, no sólo un test.
- **L966–L968** — razonables pero UI no cubre mutaciones indirectas.
- **L969** — dejar agent fuera de V1 no es cobertura. Si el agente puede ver/seleccionar Landing debe rechazarla explícitamente hasta soportarla.
- **L970** — readiness vive también en `site-optimizer`, omitido de F6.
- **L971** — detectar production gate recién en F8 es tarde.
- **L972–L976** — F2 es la fase correcta, si existe un graph Landing real.
- **L977** — AI context actual es Store/product-centric; requiere superficie explícita, no sólo un test.
- **L978** — correcto.
- **L979–L980** — header/footer actuales contienen lógica Store; F6/F7 requiere adapter/module audit.
- **L981** — correcto en fase, insuficiente en detalle.
- **L982** — runtime puede no inicializar cart por feature gating, pero el código seguirá enviado; definir qué significa “inicia”.
- **L983** — duplicar capabilities y runtimeFeatures puede crear drift.
- **L984** — correcto como test funcional.
- **L985** — correcto si “útil” se formaliza.
- **L986** — falta schema de contacto independiente de checkout.
- **L987–L988** — razonables.
- **L989** — medir CSS recién en F8 es tarde; budgets ya se ejecutan en F2 según el plan, por lo que la tabla es inconsistente.
- **L990** — F2/F8 cubre presupuestos, pero falta baseline específico Landing.
- **L991** — manifest/media helpers aceptan StoreProject; el test no elimina el problema de modelo.
- **L992–L995** — fases correctas, detalles insuficientes.
- **L996** — History está tipado StoreProject; F6 debe cambiarlo o introducir adapter.
- **L997–L998** — correcto como riesgo.
- **L999** — “invariant de routing” no es prueba; CSV necesita guard y test de rechazo.
- **L1000** — hashes de export F0 no detectan que un selector del Studio Store desapareció.
- **L1001** — hashes ayudan pero no cubren interacción/UI/persistencia.

### Líneas 1005–1032 — rollback

- **L1009** — una fase = commit ayuda a revertir código, pero no garantiza reversibilidad de datos ni compatibilidad entre versiones.
- **L1011** — buena regla de commits.
- **L1016** — `git revert` puede tener conflictos si fases posteriores dependen de la fase revertida y no revierte side effects externos.
- **L1017** — después de un `git revert` ya commiteado, `check:micro` puede no detectar el cambio si se basa en working-tree diff; conviene ejecutar gates focales explícitos o comparar contra el padre adecuado.
- **L1020** — correcto.
- **L1024–L1030** — resisten la crítica y son buenas prohibiciones.
- **L1032** — correcto para tests, pero no resuelve rollout real de persistencia.

### Líneas 1036–1056 — señales STOP

- **L1038** — buena idea.
- **L1040** — útil si significa “no cambiar forma persistida Store”; demasiado rígido si se necesita exportar sub-schemas compartidos sin alterar shape.
- **L1041** — buena alarma para cambios Landing, no axioma universal.
- **L1042** — buena alarma.
- **L1043** — razonable, aunque una integración mínima de creación puede tocar repository+dashboard de forma legítima.
- **L1044** — buena alarma.
- **L1045** — demasiado rígido: una abstracción de frontera puede tener un solo consumidor inicial para aislar riesgo y luego dos; lo importante es que tenga una responsabilidad real.
- **L1046** — buena alarma.
- **L1047** — “una sola responsabilidad” es subjetivo y necesita criterio de diff/ownership.
- **L1048–L1049** — resisten la crítica.
- **L1050** — debería decir “renderer visual distinto”, no cualquier orquestación distinta entre Preview y export.
- **L1051** — excelente alarma; precisamente demuestra que `git revert` no alcanza como política de rollback.
- **L1056** — buen procedimiento de ingeniería.

### Líneas 1061–1091 — definición de terminado

- **L1063** — correcto como encabezado de aceptación.
- **L1066–L1078** — buen flujo, pero omite el contrato de `LandingProject`, import/export de archive, fallo/recovery de escritura y compatibilidad downgrade.
- **L1084** — “0 rutas ecommerce” es medible.
- **L1085–L1090** — medibles si se define si “0” significa semántica/artefacto o también bytes de runtime/CSS.
- **L1091** — “0 regresiones Store” no es demostrable universalmente; puede ser un objetivo respaldado por suite + baselines, no una prueba matemática.

### Líneas 1096–1110 — compatibilidad final

- **L1098** — resiste la crítica: pasar tests no basta.
- **L1103** — viable para Store.
- **L1104** — necesita canonicalización y corpus definido.
- **L1105** — viable en fixtures.
- **L1106** — viable en fixtures y entorno fijado.
- **L1107** — falta función/oráculo actual único.
- **L1108** — igualdad exacta de Preview necesita normalización de atributos editor/draft.
- **L1109** — recovery actual es Store; puede compararse para Stores, pero Landing requiere otro contrato.
- **L1110** — correcto como regresión específica.

### Líneas 1115–1147 — orden exacto

- **L1118** — correcto.
- **L1120** — correcto como primera fase técnica.
- **L1122** — falta una fase anterior o simultánea de **contrato `LandingProject`/ProjectEnvelope**. Capabilities sin modelo no son implementables.
- **L1124** — F2 necesita un Landing fixture/model que F1 no define.
- **L1126** — F3 necesita `kind`/payload antes de F4; orden roto.
- **L1128** — persistencia después de Preview puede funcionar sólo con fixtures in-memory, pero el plan no los define.
- **L1130** — Dashboard “abrir” antes de Studio es una contradicción.
- **L1132** — Studio debería existir antes de declarar funcional la acción “abrir” de F5.
- **L1134** — plantilla llega demasiado tarde: Studio Landing no tiene qué editar de forma canónica en F6.
- **L1136** — el primer E2E vertical llega demasiado tarde.
- **L1138** — razonable sólo después de vertical slice estable.
- **L1140** — correcto.
- **L1143–L1145** — buenas reglas.
- **L1147** — “no dejar deuda funcional” es demasiado absoluto y puede inducir sobreingeniería; debería prohibir deuda de compatibilidad/datos conocida, no toda deuda.

### Líneas 1151–1182 — arquitectura final

- **L1154** — raíz conceptual correcta.
- **L1156** — StoreProjectV2 intacto es una meta válida.
- **L1158–L1159** — **falta `project: StoreProjectV2 | LandingProjectV1`**. Sin payload discriminado el contenedor no existe realmente.
- **L1161** — “única política central” entra en conflicto con flags persistidos actuales. Debe ser una política derivada, no una segunda fuente de verdad.
- **L1162–L1163** — perfiles razonables como presets derivados.
- **L1165** — “Shared Visual Engine” no es una frontera física actual del repo; crearla de golpe sería exactamente el rework que se intenta evitar.
- **L1166–L1172** — estas piezas no comparten hoy un único tipo neutral; varias consumen StoreProject directamente.
- **L1174–L1176** — separar page graphs es una buena decisión.
- **L1178–L1179** — “visibilidad según capabilities” no basta para Studio; también necesita mutaciones, history, save, validation y canvas compatibles con el modelo Landing.
- **L1182** — resiste la crítica como principio, pero contradice el diagrama anterior, que ya presupone un “Shared Visual Engine” consolidado.

### Líneas 1186–1194 — primera acción

- **L1188** — resiste la crítica.
- **L1190** — F0 es una buena primera acción técnica.
- **L1192** — “resultados idénticos en ejecuciones consecutivas” es necesario pero no suficiente; debe fijar corpus, entorno y canonicalización.
- **L1194** — buena barrera, pero después de F0 la siguiente acción no debería ser capabilities: debería ser definir el contrato persistido mínimo de Landing y su envelope, todavía ausentes del plan.

---

## Qué tendría que cambiar para que el plan sea ejecutable

La corrección principal no es agregar más tests. Es insertar una fase de modelo que el plan omitió:

```text
F0  baseline Store
F1  LandingProjectV1 + ProjectEnvelope discriminado
F2  adapters/proyecciones compartidas + capabilities derivadas
F3  vertical slice in-memory: Landing fixture -> render -> preview -> export
F4  persistencia/archive/recovery versionados y downgrade-safe
F5  Studio mínimo capaz de abrir/editar esa Landing
F6  Dashboard crea/lista/abre sólo después de que F5 existe
F7  template mínima real
F8  vertical slice persistido completo
F9  expansión de módulos
F10 cierre
```

La forma mínima del contrato debería ser explícita, por ejemplo:

```ts
type ManagedProject =
  | { kind: "store"; project: StoreProjectV2 }
  | { kind: "landing"; project: LandingProjectV1 };
```

`LandingProjectV1` debe contener sólo lo que una Landing realmente necesita: identidad, tema, SEO general, assets/videos, navegación neutral, páginas/secciones y contacto. No debe contener productos, categorías, colecciones, carrito, Merchant ni checkout sólo para satisfacer tipos Store.

Después, la reutilización debe ocurrir mediante adapters pequeños de primitivas reales, no suponiendo que ya existe un “Shared Visual Engine”.

## Conclusión

El plan V2 sí mejora mucho la intención de seguridad, pero **todavía vuelve a caer en el patrón que causó los fracasos anteriores: intenta compartir el Studio antes de definir con precisión el segundo dominio**. El riesgo no está en `buildLandingPages`; está en que una Landing no tiene todavía un tipo propio que pueda sobrevivir parse/save/history/recovery/export sin hacerse pasar por Store.

La prioridad debería ser corregir ese hueco y reordenar las fases antes de escribir una sola línea de implementación Landing.
