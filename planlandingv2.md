# Plan Landing V2 — integración conservativa, determinista y rollbackeable

> Estado: plan de implementación. Esta revisión modifica documentación solamente; no inicia código de Landing.
>
> Objetivo: incorporar Landing Pages a SolaraCommerce sin reescribir la aplicación y sin cambiar el comportamiento observable de las tiendas existentes.
>
> Ejecución con contexto acotado: seguir `docs/landing-v2/README.md`, `CONTRACT.md`, `STATE.md` y el único `ACTIVE_PHASE.md` vigente. El plan maestro conserva el detalle y la justificación; ningún paquete compacto puede ampliarlo ni contradecir sus invariantes.

## 1. Decisión arquitectónica

Landing V2 no se modela como una Store vacía ni como un conjunto de flags agregados a `StoreProjectV2`.

`StoreProjectV2Schema` permanece intacto y Landing obtiene un contrato propio, mínimo y versionado.

Contrato conceptual obligatorio antes de cualquier renderer o UI:

~~~ts
type ManagedProject =
  | { kind: "store"; project: StoreProjectV2 }
  | { kind: "landing"; project: LandingProjectV1 };

interface LandingProjectV1 {
  schemaVersion: 1;
  locale: "es-AR";
  id: string;
  name: string;
  status: "active" | "archived";
  baseUrl: string; // "" permitido en draft; production exige URL absoluta válida
  createdAt: string;
  updatedAt: string;
  identity: LandingIdentity;
  theme: LandingTheme;
  seo: LandingSeo;
  assets: LandingAsset[]; // sólo raster image en el primer template
  chrome: LandingChromeV1;
  navigation: LandingNavigation;
  page: LandingPageV1; // exactamente una página pública en V1
  contact?: LandingContact;
}
~~~

Para quitar ambigüedad de implementación, V1 fija estos shapes mínimos:

~~~ts
interface LandingIdentity {
  brandName: string;
  description: string;
  logoAssetId?: string;
}

interface LandingContact {
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
}

interface LandingSeo {
  title: string;
  description: string;
  faviconAssetId?: string;
  socialImageAssetId?: string;
}

interface LandingNavigation {
  items: Array<{
    id: string;
    label: string;
    target: LandingActionTargetV1;
  }>;
}

interface LandingTheme {
  colors: {
    background: `#${string}`;
    surface: `#${string}`;
    text: `#${string}`;
    muted: `#${string}`;
    accent: `#${string}`;
    accentText: `#${string}`;
    border: `#${string}`;
  };
  bodyFont: "system-sans" | "system-serif";
  displayFont: "system-sans" | "system-serif";
  density: "compact" | "regular" | "spacious";
  radius: number; // schema: entero 0..24 px
  containerWidth: number; // schema: entero 720..1440 px
}

interface LandingChromeV1 {
  announcement?: { variantId: string; content: AnnouncementContentV1 };
  header: { variantId: string };
  footer: { variantId: string };
}

interface LandingPageV1 {
  sections: LandingBodySectionV1[]; // única página; sin header/footer/announcement
}

type LandingActionTargetV1 =
  | { kind: "section"; sectionId: string }
  | { kind: "contact"; channel: "email" | "phone" | "whatsapp" }
  | { kind: "external"; href: `https://${string}` };

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
~~~

Las plantillas CSS sólo reciben los colores hex `#RGB`/`#RRGGBB` validados, dos fonts de sistema, densidad y medidas acotadas. No se aceptan CSS arbitrario, fuentes remotas, URLs en tokens ni código de usuario. El schema en runtime valida todos los límites: los tipos de TypeScript por sí solos no validan `#${string}` ni URLs. `locale` queda `es-AR` en V1; cualquier locale nuevo es cambio de contrato explícito.

`baseUrl` en producción debe ser HTTPS absoluto, sin credenciales, query ni fragmento; se permite un prefijo de path normalizado para hosting bajo subdirectorio. Canonical y sitemap se derivan con un único helper de URL; los links internos son anclas de la página única. No concatenar URLs ni aceptar `javascript:`, `data:`, URLs protocol-relative o variantes con controles/espacios codificados. Draft admite `baseUrl: ""` y no emite canonical absoluto.

Header/Footer/Announcement son slots de chrome globales, no elementos reorderables de `page.sections`. Las secciones del body sí son modulares/reorderables. Header/Footer sólo leen `identity`, `navigation` y `contact`; sus variants cambian presentación, no guardan copias. La navegación interna V1 sólo apunta a secciones dentro de esta página.

V1 no contiene forms con submit, autoplay, slider ni runtime JS. CTA sólo navega a sección existente, a un canal de contacto presente o a HTTPS validado. Email se valida y se convierte a `mailto:` sin aceptar CR/LF ni headers; teléfono y WhatsApp se ingresan en E.164 (`+[código país][número]`, 8–15 dígitos), sin adivinar prefijos locales, y se convierten a `tel:` o `https://wa.me/<dígitos>`; nunca se aceptan como href arbitrario.

El `id` del proyecto es un UUID generado, inmutable y no derivado de texto del usuario. V1 no persiste un `slug`: la página única se publica en el root de `baseUrl`. IDs de sección son únicos en la página y cumplen `[A-Za-z][A-Za-z0-9_-]{0,63}`; reorder/undo no los regenera.

Para el template inicial, `LandingAsset` acepta sólo imágenes raster locales (JPEG, PNG, WebP, AVIF). SVG, iframes, fuentes remotas, video, data URLs arbitrarias y URLs remotas de media quedan fuera; al importar assets se verifica el formato desde bytes, se procesa con el optimizador aprobado y se calcula el hash sobre los bytes finales, sin confiar en extensión/MIME declarado. Un asset se referencia por ID y debe existir; URLs de HTML se generan en el exporter. La reutilización de `ImageAssetSchema`/optimizador exige que F2 pruebe que no introduce semántica Store; de lo contrario, un adapter Landing mínimo convierte su salida.

La schema Landing valida cada `source`, `fallbackSource` y `responsiveSources[].source` como data URL base64 raster con MIME permitido y concordante con los bytes; widths responsivos son únicos/ordenados y no exceden la imagen original. Se conserva el shape existente `ImageAsset` sólo si F2 confirma neutralidad, con restricciones Landing encima; no se cambia `ImageAssetSchema` si eso altera Store.

Shape normativo del asset V1: el existente `ImageAsset` (`kind: "image"`, `id`, `name`, `alt`, `mimeType`, `source`, `optimizationRecipe?`, `fallbackSource?`, `responsiveSources?`, `width`, `height`, `hash`) con las refinements anteriores. F1 debe importar `ImageAssetSchema` y envolverlo en `LandingAssetSchema` sin modificar la definición compartida; si la auditoría F2 detecta dependencia Store, usar el mismo DTO estructural en Landing sin cambiar `ImageAssetSchema`.

Todo texto se escapa según su contexto (texto HTML, atributo, URL, CSS o JSON); no se “sanitiza” quitando caracteres al azar. `target="_blank"` siempre incluye `rel="noopener noreferrer"`. JSON-LD se construye como JSON válido con serialización segura para `<`, U+2028 y U+2029; CSP no sustituye el escaping contextual. Assets no usados se conservan en el proyecto pero no se exportan; borrar un asset referenciado se bloquea con una lista determinista de referencias.

### Slots de chrome y body

Announcement/Header/Footer no pertenecen a `LandingPageV1.sections` y no se arrastran entre secciones. Son slots globales: uno por tipo, aplicados a la página única. `header.variantId` y `footer.variantId` eligen la presentación; el contenido leído sigue viniendo de identity/navigation/contact. Announcement es opcional y mantiene su propio texto/target. El body sí contiene secciones reorderables con IDs estables.

Los nombres de subtipos son conceptuales hasta auditar qué shapes actuales son realmente neutrales. La implementación debe reutilizar un sub-schema existente sólo si no obliga a introducir campos ecommerce ficticios. Si un shape Store mezcla catálogo/comercio con datos visuales, se extrae únicamente la primitive neutral mínima y se mantiene el shape Store observable sin cambios.

Landing no contiene `products`, `categories`, `collections`, cart, checkout, Merchant ni campos vacíos creados sólo para satisfacer tipos Store.

El `kind` no vive dentro de `StoreProjectV2`. Viaja en la capa de orquestación cuando hace falta distinguir dominios, pero la persistencia Store legacy no se reescribe para agregarlo.

La reutilización se hace mediante adapters pequeños y primitives puras demostrablemente neutrales. No se presupone que hoy exista físicamente un "Shared Visual Engine" desacoplado y **no se obliga al renderer Store actual a convertirse en neutral para habilitar Landing V1**.

~~~text
StoreProjectV2 -> renderer/module-sdk/export actuales Store (camino intacto)

LandingProjectV1
  -> toLandingRenderModel()
  -> Landing render boundary mínimo
     -> primitives puras extraídas sólo si pasan prueba de reutilización
     -> primitives Landing nuevas y mínimas cuando la extracción Store sea demasiado amplia
  -> localhost / Preview / export Landing
~~~

Preview, laboratorio localhost y export pueden tener orquestadores distintos. Lo que deben compartir es el mismo `LandingRenderModel` y el mismo **Landing render boundary auditado**; no se exige que sus documentos completos sean byte a byte iguales. Que una primitive sea compartida con Store es un beneficio condicionado a evidencia, no un prerrequisito de Landing V1.

La arquitectura debe permitir que una Store antigua atraviese la nueva versión sin migrar ni reinterpretar su payload persistido.

## 2. Propiedad de seguridad principal

Para cada Store fixture incluido explícitamente en el corpus baseline F0:

~~~text
serialize_v2(P) == serialize_actual(P)
export_v2(P) == export_actual(P)
preview_v2(P, ruta) == preview_actual(P, ruta)
~~~

Donde sea determinista y esté canonicalizado por F0, igualdad significa igualdad byte a byte. Esta propiedad es evidencia sobre el corpus fijado, no una demostración matemática sobre todos los proyectos posibles.

Landing V2 es incorrecta si para hacerla pasar hay que cambiar expectativas existentes de Store.

### Invariantes no negociables

1. StoreProjectV2Schema permanece sin cambios.
2. schemaVersion permanece en 2.
3. StoreProjectV1 continúa siendo alias de StoreProjectV2.
4. Los fixtures Store existentes no se modifican para adaptarlos a Landing.
5. Predeterminado no se modifica.
6. proyectos/ real nunca se usa como fixture.
7. Preview, localhost y exportación consumen el mismo `LandingRenderModel` y el mismo Landing render boundary; sus wrappers pueden diferir por necesidades de editor/hosting.
8. No se crea una segunda infraestructura de runtime público. Landing V1 puede exportar HTML/CSS sin runtime; una capacidad JS futura sólo entra como capability neutral, opt-in y compartible si existe evidencia de reutilización.
9. No se duplica Theme, Assets, SEO, History o Canvas por comodidad. Una primitive Store sólo se comparte si puede extraerse con input neutral pequeño y Store queda behavior-preserving; si la extracción obliga a re-tipar `StoreProjectV1`, `StoreSection`, `ModuleRenderContext`, `exportProject` o `renderPreviewHtml` de forma transversal, Landing V1 usa una primitive mínima propia detrás del mismo contrato Landing.
10. No se crea un LandingStudio independiente.
11. No se generaliza StoreProject a WebsiteProject antes de necesitarlo.
12. No se dispersan condicionales de Landing por toda la aplicación.
13. Las diferencias de dominio se resuelven en `ManagedProject` + adapters/policies derivadas; capabilities nunca son una segunda fuente de verdad persistida.
14. Cada fase compila y verifica antes de iniciar la siguiente.
15. Un fallo Store se trata como regresión, no como un test para actualizar.
16. Una fase funcional equivale a un commit revertible en código y, desde que exista persistencia Landing, debe ser además downgrade-safe para los datos ya creados.
17. Ninguna fase mezcla varias fronteras grandes a la vez.
18. No se publica una fase roja.
19. No se toca upstream.
20. V1 Landing no agrega CRM, pagos, A/B testing, canvas libre ni HTML/JS arbitrario.
21. El primer diseño Landing se desarrolla en baja fidelidad, estilo wireframe en código.
22. El wireframe no es una maqueta descartable: usa los mismos contratos de datos, `LandingRenderModel` y Landing render boundary que después consumen Studio, Preview y exportación.
23. V1 comienza con una sola variante visual por familia de sección; las variantes adicionales llegan únicamente después de validar el flujo completo.
24. Ninguna versión anterior del Store repository debe intentar parsear una Landing como Store.
25. La persistencia Landing no eleva ni modifica la versión de la base IndexedDB usada por Store; usa un namespace/base separado para que un rollback de código no produzca `VersionError` ni corrupción del repositorio Store.
26. En modo administrado, la fuente de verdad Landing es filesystem/loopback, igual que Store en principio operativo; IndexedDB Landing es fallback/recovery, no autoridad confirmada.
27. `LandingSectionRenderer` es puro respecto del host: no recibe `localhost|preview|export`; esas diferencias pertenecen a wrappers posteriores.
28. Identidad, navegación y contacto tienen una única fuente de verdad global. Header/Footer/CTA referencian esos datos y no persisten copias divergentes.
29. La estrategia para families desconocidas queda definida antes de persistir la primera Landing.

### Por qué el enfoque wireframe-first fallaría sin estas correcciones

| Riesgo | Por qué fallaría | Corrección contractual |
| --- | --- | --- |
| wireframe antes del modelo | terminaría inventando props/markup que después no encajan en el editor | F1 define `LandingProjectV1` y section schemas antes de UI |
| misma UI sobre `StoreProjectV2` | obliga a campos ecommerce falsos o casts | `ManagedProject` discriminado + adapters por dominio |
| "mismo renderer" entendido literalmente | Preview/export necesitan wrappers distintos | compartir `LandingRenderModel` + Landing render boundary, no documento completo |
| forzar Landing dentro del renderer Store | `exportProject`, `renderPreviewHtml`, `ModuleRenderContext` y `StoreSection` están fuertemente tipados a Store | F2 descubre la frontera real; Store renderer permanece opaco salvo extracción pura demostrable |
| reutilizar cualquier módulo actual | varios módulos leen Store/comercio directamente | auditoría STORE-OPAQUE / EXTRACTABLE-PURE / LANDING-NEW-MINIMAL en F2 |
| localhost como app paralela | habría que rehacer todo al integrar Studio | lab fino de desarrollo sobre el mismo RenderModel |
| Dashboard antes del editor/template | `Abrir Landing` no tendría destino válido o crearía datos con defaults inestables | Studio F5 + template F6 antes de Dashboard F7 |
| misma IndexedDB que Store | un downgrade puede fallar o parsear Landing como Store | `solara-landing-studio` separado; managed authority en `landings/` |
| History/Canvas asumidos neutrales | hoy sus tipos/bindings incluyen Store | generalización mínima de History + bindings Landing explícitos |
| enum rígido de variants | código viejo no parsea `hero-02` | `variantId` + registry + fallback `01` no destructivo |
| agregar families como si fueran variants | reader viejo desconoce también el content schema | nueva family requiere evolución de schema o UnknownSection explícita |

## 3. Estado previo obligatorio

Al redactar este plan el checkout contiene trabajo simultáneo sobre suite E2E, documentación, dashboard y specs. Landing V2 no debe comenzar sobre ese árbol mezclado.

### Gate PRE-0 — aislar trabajo

Ejecutar:

~~~powershell
git status --short
git branch --show-current
git rev-parse HEAD
node --version
corepack pnpm --version
~~~

Condiciones:

- identificar el commit base exacto y verificar que contiene la versión que se pretende extender;
- identificar propietario y estado de cada cambio ya presente; no inferir que sea descartable por ser ajeno a Landing;
- cerrar los cambios compartidos mediante su flujo normal o trabajar en un worktree limpio creado desde un commit base validado;
- si un cambio requerido sólo existe sin commit, no excluirlo ni incorporarlo silenciosamente: esperar a que se publique/valide o pedir que se fije ese baseline;
- trabajar en checkout/worktree limpio y de escritura exclusiva durante cada fase; un agente/escritor por fase y paths explícitos;
- rama sugerida: codex/landing-v2;
- no hacer git add -A desde un árbol con cambios ajenos;
- no usar git reset --hard como rollback;
- no tocar proyectos/ real.

Registrar:

~~~text
BASE_COMMIT=
BRANCH=
NODE_VERSION=
PNPM_VERSION=
GIT_STATUS=CLEAN
~~~

**STOP:** si no existe un checkout limpio y reproducible cuyo commit base fue aceptado como correcto, Landing V2 no empieza. No limpiar, stash ni mover cambios concurrentes para satisfacer este gate.

---

## 4. Fase F0 — oráculo de compatibilidad Store

Objetivo: fijar el comportamiento actual antes de cambiar arquitectura.

Esta fase agrega pruebas y manifests de hashes pequeños. No agrega comportamiento.

### Fixtures de referencia

Usar un corpus explícito por símbolo/ruta, sin nombres informales:

- `referenceStore` de `packages/project-schema/src/fixture.ts`;
- `catalogModernStore` de `packages/project-schema/src/catalog-modern-fixture.ts`;
- `catalogModernV2Store` de `packages/project-schema/src/catalog-modern-v2-fixture.ts`;
- `catalogScaleStore` de `packages/project-schema/src/scale-fixture.ts`;
- `catalogModernCleanStore` de `packages/project-schema/src/catalog-modern-template.ts`.

Si una capacidad concreta (search/cart/etc.) no está cubierta por esos símbolos, derivar dentro del test una copia in-memory de uno de ellos con el cambio mínimo y documentado. No agregar una fixture persistida nueva sólo para F0.

Nunca cargar proyectos/ real.

### Qué medir

Para cada fixture:

#### Schema y serialización

- StoreProjectV2Schema.parse;
- serialización JSON estable;
- schemaVersion;
- IDs;
- products/categories/collections;
- navigation;
- siteShell;
- commerceTemplates.

#### Export production

Registrar en un fixture pequeño:

- paths ordenados;
- SHA-256 por archivo;
- bytes por archivo;
- runtime features;
- indexable routes;
- presencia de search-index.json;
- presencia de catalog-index.json;
- presencia de google-merchant.xml;
- sitemaps;
- contexto/feed si corresponde.

No versionar el sitio exportado.

#### Preview

Hash de HTML en rutas existentes representativas:

~~~text
/
/listado/
/buscar/
/carrito/
/productos/<fixture>/
/categorias/<fixture>/
/404
~~~

#### No-JavaScript

Verificar que las rutas Store actuales conservan contenido HTML útil.

### Archivos de tests sugeridos

~~~text
packages/exporter/src/store-compatibility-baseline.test.ts
packages/project-schema/src/store-schema-compatibility.test.ts
~~~

Si aparece una fuente real de no determinismo, identificarla antes de normalizar nada. Está prohibido eliminar campos de la comparación sólo para conseguir verde.

### Gate F0

~~~powershell
corepack pnpm --filter @solara/project-schema test
corepack pnpm --filter @solara/exporter test
corepack pnpm check:micro
~~~

F0 es un oráculo focal, no una excusa para correr Playwright amplio en cada fase. Los gates browser de este plan usan `PLAYWRIGHT_WORKERS=1`; `smoke:full` y E2E completos se reservan para hitos/cierre.

Adicional:

- dos ejecuciones consecutivas producen los mismos hashes;
- cero fixtures Store modificados;
- cero comportamiento nuevo.

### Commit F0

~~~text
test: fijar oráculo de compatibilidad de tiendas
~~~

### Rollback F0

~~~powershell
git revert <commit-F0>
~~~

**STOP:** si el export actual no es reproducible, resolver determinismo antes de Landing.

---

## 5. Fase F1 — contrato `LandingProjectV1` y unión de dominio

Objetivo: dar a Landing un modelo propio antes de intentar renderizarla, guardarla o abrirla en Studio.

### Contrato persistible mínimo

Crear `LandingProjectV1Schema` separado de `StoreProjectV2Schema`.

Debe contener únicamente primitives necesarias para una web Landing:

- identidad;
- theme;
- SEO general no Merchant;
- assets raster optimizados;
- navegación neutral;
- página única;
- secciones modulares;
- contacto opcional;
- metadata/versionado estrictamente necesario para persistencia.

El contrato mínimo incluye explícitamente `status`, `baseUrl`, `createdAt`, `updatedAt` e `identity`; no se dejan como decisiones implícitas de F4/F8 porque canonical, Dashboard y persistencia dependen de ellos.

`baseUrl` puede ser `""` mientras el proyecto está en draft. Export production lo rechaza hasta tener una URL HTTPS absoluta válida; nunca inventar un dominio ni publicar canonicals con un placeholder.

No debe contener campos ecommerce vacíos para satisfacer tipos Store.

Contrato conceptual:

~~~ts
type ManagedProject =
  | { kind: "store"; project: StoreProjectV2 }
  | { kind: "landing"; project: LandingProjectV1 };
~~~

### Contrato de sección

El contenido y la presentación deben estar separados desde el primer schema.

~~~ts
type LandingSection =
  | {
      id: string;
      family: "hero";
      variantId: string;
      content: {
        eyebrow?: string;
        heading: string;
        body: string;
        imageAssetId?: string;
        action?: { label: string; target: LandingActionTargetV1 };
      };
  }
  | {
      id: string;
      family: "benefits";
      variantId: string;
      content: {
        heading: string;
        items: Array<{ title: string; body: string }>;
      };
    }
  | {
      id: string;
      family: "media";
      variantId: string;
      content: { assetId: string; caption?: string };
    }
  | {
      id: string;
      family: "cta";
      variantId: string;
      content: {
        heading: string;
        body?: string;
        action: { label: string; target: LandingActionTargetV1 };
      };
    }
  | OpaqueLandingSectionV1;

interface OpaqueLandingSectionV1 {
  id: string;
  family: string; // sólo valores que el reader no conoce
  variantId: string;
  rawPayload: { [key: string]: JsonValue }; // claves distintas de id/family/variantId
}

type LandingBodySectionV1 = LandingSection;

interface AnnouncementContentV1 {
  text: string;
  target?: LandingActionTargetV1;
}
~~~

El parser recorre las keys estructurales `id/family/variantId`. Si la family es conocida, valida `content` con su schema estricto y rechaza cualquier sibling extra. Si es desconocida, guarda todas las demás keys en `rawPayload` JSON-safe, sin strip ni transformación recursiva. Al guardar un opaque, serializa `rawPayload` más las keys estructurales actuales; por lo tanto un reorder conserva el payload y un cambio explícito de ID queda coherente. La reconstrucción usa operaciones own-key seguras y nunca `Object.assign`/merges que puedan activar `__proto__`, `constructor` o `prototype`; esas claves se cubren en tests red-team.

El tipo `LandingActionTargetV1` expresa intención, no reemplaza la validación en runtime. External sólo admite URL absoluta HTTPS con host válido, sin credenciales ni controles; query y fragmento se permiten y se serializan mediante `URL`. Los targets internos/contacto se resuelven contra el proyecto y fallan si falta la sección o canal referenciado.

SEO tiene una única fuente de verdad en `LandingProjectV1.seo`; no hay overrides por página en V1. Un favicon/social image y cualquier imagen de sección deben referenciar assets existentes; alt vacío significa imagen decorativa y sólo es válido si el renderer la emite con `alt=""`.

Límites fijos V1: exactamente una página pública, máximo 100 secciones de body y 100 assets raster, 25 MiB de bytes de imagen decodificados sumando source/fallback/responsive, 256 KiB de texto visible agregado y 40 MiB UTF-8 para el proyecto JSON completo. Un payload opaco no supera 128 KiB ni profundidad JSON 20; el total opaco no supera 1 MiB. IDs son únicos en el ámbito acordado y cumplen un alfabeto estable. Máximos textuales: project name/brand 120; identity description y párrafos 2.000; SEO title 160 y description 320; headings 160; benefit title 120; labels/nav 80; nav items 20; benefits por bloque 6; announcement 160; alt 500; contact address 300; email 254; URLs 2.048 caracteres. Teléfono/WhatsApp validan E.164 como se define arriba. El handler aplica además un límite HTTP de 40 MiB antes de parsear. Todos los topes se validan antes de escribir y el error indica el límite exacto.

Budget público V1: HTML renderizado <=1 MiB crudo, CSS Landing <=32 KiB gzip (mismo techo público existente, medido por test propio) y exactamente cero bytes/archivos JavaScript. La imagen completa sigue bajo el límite total de assets; no se suben los límites existentes de Studio/Store para acomodar Landing.

La página única se exporta como `index.html`; links internos usan `#<sectionId>` y se validan contra secciones existentes. V1 no implementa routing multipágina, nombres de ruta ni 404 propio.

La unión conocida enumera sólo **familias y content schemas** implementados. `variantId` es string persistido y se resuelve mediante metadata pura separada de las funciones render, para no acoplar schema a renderer ni formar ciclos:

~~~ts
const landingVariantRegistry = {
  "hero-01": { family: "hero" },
  "benefits-01": { family: "benefits" },
  "media-01": { family: "media" },
  "cta-01": { family: "cta" },
};

const landingSectionRenderers = {
  hero: renderHero01,
  benefits: renderBenefits01,
  media: renderMedia01,
  cta: renderCta01,
};
~~~

Resolución:

~~~text
variantId conocido + family correcta -> render solicitado
variantId conocido + family incorrecta -> error
variantId desconocido de family conocida -> preservar ID + fallback a <family>-01 + warning no destructivo
family desconocida                    -> OpaqueLandingSectionV1; no render público
~~~

Cada family soportada debe tener una variant `01` estable que actúa como fallback contractual. Mientras exista contenido persistido de esa family, su variant `01` no se elimina ni cambia de family.

### Forward compatibility de families — decisión V1

No posponer esta decisión hasta F9. `LandingProjectV1` admite desde V1 un caso explícito `OpaqueLandingSectionV1` para families futuras desconocidas.

Reglas del caso opaco:

~~~text
family desconocida -> preservar id/family/variantId/content/raw payload
render antiguo      -> placeholder determinista no público o warning de editor
save antiguo        -> preservar estructura/datos semánticos sin normalizar content
edición antigua     -> prohibida salvo reorder/delete explícito del usuario
ejecución HTML/JS   -> nunca; raw es dato opaco
production export   -> bloqueado mientras exista una sección opaca activa
~~~

El tipo opaco existe sólo para forward compatibility. No habilita `Record<string, unknown>` como contrato normal para nuevas families conocidas. Una family nueva sigue necesitando content schema tipado y registro explícito.

La preservación es **semántica JSON**, no conservación byte a byte de espacios u orden textual. El objeto se limita a JSON plano y jamás se concatena a HTML, CSS, atributos, URLs ni scripts.

Antes de F4 debe existir un test `código nuevo -> family futura simulada -> reader V1 -> save -> reader nuevo` que demuestre preservación.

Preview de un reader antiguo puede mostrar una caja wireframe "Sección creada con una versión más nueva". Export production no puede omitirla silenciosamente ni publicar ese placeholder.

### Propiedad de datos globales vs. secciones

Definir una única autoridad por dato para evitar divergencias:

~~~text
identity        -> LandingProjectV1.identity
navigation      -> LandingProjectV1.navigation (anclas a secciones de la página única)
contact         -> LandingProjectV1.contact
SEO             -> LandingProjectV1.seo
Header/Footer   -> presentación + referencias a identity/navigation/contact
CTA             -> copy propio + target tipado; no duplica teléfono/email
~~~

Para evitar solapamiento, `LandingIdentity` contiene sólo marca (brandName, description y referencia al logo) y `LandingContact` contiene canales operativos (email, teléfono/WhatsApp y dirección). V1 no genera `sameAs`; cualquier perfil social posterior se agrega una vez en Identity con URLs HTTPS validadas. Un mismo dato no vive en dos objetos.

Los links internos deben apuntar a `sectionId` tipado y el href final se deriva de la página única. No persistir simultáneamente ID y href interno que puedan quedar desincronizados.

### Contrato de página única V1

`LandingProjectV1.page` contiene una sola composición. No hay una segunda página técnica ni un graph abstracto en V1. Navigation y actions resuelven `sectionId` contra esa composición antes de Preview/export; una futura ampliación a varias páginas requiere una decisión y migración versionadas cuando exista demanda real.

Reglas:

- `id` de sección identifica la instancia y sobrevive a reorder/undo/save;
- `family` decide el contrato de contenido;
- `variantId` decide exclusivamente la presentación;
- cambiar de variant dentro de una family no cambia `content`;
- una variant sólo puede consumir el content schema de su family;
- la página conserva un orden explícito de secciones;
- no existe HTML/JS arbitrario dentro del modelo.

### Reutilización de schemas actuales

Auditar Theme, Assets, Video, SEO, Navigation y Contact antes de reutilizarlos.

Para cada uno:

~~~text
neutral de verdad -> reutilizar/exportar primitive
mezcla Store       -> adapter o extracción mínima behavior-preserving
ecommerce-only     -> no entra en LandingProjectV1
~~~

No cambiar la forma persistida de `StoreProjectV2` para conseguir reutilización.

### Tests F1

- parse válido de fixture Landing mínimo;
- rechazar campos ecommerce inesperados si el schema es estricto;
- rechazar variant conocida con family incompatible;
- preservar variant desconocida y resolver fallback `01` sin mutar content/variantId;
- preservar una family desconocida como `OpaqueLandingSectionV1` sin ejecutar ni reinterpretar su payload;
- preservar claves opacas adversariales (`__proto__`, `constructor`, `prototype`) como JSON sin contaminación de prototipos;
- propiedad única de identity/navigation/contact sin duplicados dentro de Header/Footer/CTA;
- una sola página y referencias internas válidas a `sectionId`;
- URLs externas y baseUrl con payloads `javascript:`, `data:`, protocol-relative, credenciales, controles, traversal y percent-encoding adversarial se rechazan;
- email/teléfono/WhatsApp inválido no puede inyectar query/headers; teléfono y WhatsApp validan E.164;
- máximo de bytes, límites por campo, asset MIME real, hash y referencias se prueban en bordes `límite-1/límite/límite+1`;
- límite agregado de texto visible y validación del schema se comprueban en los tres bordes;
- metadata SEO global produce el mismo resultado en Preview y exporter;
- IDs de sección únicos y estables;
- límites de secciones/assets/opaque y errores previos a escritura;
- round-trip parse/serialize determinista del fixture Landing;
- `ManagedProject` discrimina exhaustivamente Store/Landing;
- `StoreProjectV2Schema` y sus fixtures permanecen sin cambios.

### Gate F1

~~~powershell
corepack pnpm --filter @solara/project-schema test
corepack pnpm check:micro
~~~

Repetir oráculo F0.

### Rollback

Un git revert del commit F1. F1 todavía no persiste datos Landing.

**STOP:** si para tipar Landing hay que agregar productos/categorías/cart/checkout/Merchant al payload Landing o modificar el shape persistido Store.

---

## 6. Fase F2 — descubrir la frontera real de render + adapters, políticas y documento Landing

Objetivo: conectar `LandingProjectV1` con una frontera de render pequeña y estable sin fingir que es una Store, sin crear una segunda fuente de verdad y sin convertir el renderer Store entero en una abstracción genérica.

### F2a — discovery read-only de dependencias de render

Antes de extraer o generalizar una sola función, inventariar los puntos que el primer wireframe necesitaría y anotar sus dependencias reales. Como mínimo:

~~~text
Hero / section markup
Header / Footer
Theme -> CSS
assets -> URL/MIME
SEO/meta/canonical
navigation/internal href
document shell y file graph de una página
Canvas markers necesarios para Preview
file graph de draft export
~~~

Para cada candidato registrar:

~~~text
símbolo / archivo
input TypeScript actual
campos realmente leídos
efectos secundarios
call sites Store
tests Store que lo cubren
clasificación F2
decisión: reusar / extraer / no tocar
~~~

La salida de F2a es un inventario verificable. No modifica comportamiento.

### Proyección neutral de render

Definir una representación transitoria no persistida:

~~~ts
interface LandingRenderModel {
  identity: RenderIdentity;
  theme: RenderTheme;
  seo: RenderSeo;
  navigation: RenderNavigation;
  chrome: RenderChrome;
  page: RenderPage;
  assets: RenderAsset[];
}
~~~

Los nombres exactos se ajustan a primitives reales del repositorio. La regla importante es que `LandingRenderModel` sea una proyección de `LandingProjectV1`, no un clon de `StoreProjectV2`.

~~~ts
toLandingRenderModel(project: LandingProjectV1): LandingRenderModel
~~~

Preview, laboratorio localhost y export deben consumir esa misma proyección.

### Capabilities/policy sin duplicar verdad

No persistir una matriz booleana `SiteCapabilities` independiente.

Para Store, conservar las fuentes actuales (`commerceTemplates`, `siteShell`, page graph, modules y runtime features) y, si hace falta una vista común, derivarla mediante adapter sin cambiar defaults.

Para Landing, las capacidades se derivan del propio dominio:

~~~text
products/categories/collections -> inexistentes por schema
cart/checkout/Merchant           -> inexistentes por policy Landing
contact                          -> true sólo si existe contenido/contacto que lo requiere
video/forms/runtime JS           -> no soportados en V1
motion                           -> CSS reducido sólo si en una versión posterior se agrega motion
~~~

No permitir combinaciones imposibles como `catalog=false + productList=true` porque esas combinaciones no deben representarse como estado libre.

### Auditoría de frontera de render

No limitar la auditoría a módulos visuales. Clasificar también helpers, APIs del exporter, module-sdk, page shell, asset helpers y bindings:

~~~text
STORE-OPAQUE
  depende de StoreProjectV1/StoreSection o semántica ecommerce de forma amplia
  -> no tocar ni hacer depender Landing V1 de él

EXTRACTABLE-PURE
  la lógica útil depende de un DTO neutral pequeño
  -> extraer primitive pura con adapter Store behavior-preserving

LANDING-NEW-MINIMAL
  no existe una primitive neutral segura o extraerla exige rework transversal
  -> implementar sólo el mínimo detrás del contrato Landing
~~~

Header, Footer, Hero, SEO, Navigation, Canvas bindings, assets, module-sdk y las entradas públicas del exporter deben tener esta clasificación documentada antes de ser incluidos.

### Evidencia actual: asumir neutralidad sería falso

La segunda pasada del plan parte de evidencia concreta del repositorio actual:

- `apps/studio/src/App.tsx` mantiene estado activo/draft tipado como `StoreProjectV1`;
- `packages/exporter/src/index.ts` recibe y valida `StoreProjectV1` en `exportProject` y `renderPreviewHtml`;
- `packages/module-sdk/src/index.ts` define `ModuleRenderContext` con `StoreProjectV1` + `StoreSection`;
- `packages/modules` acepta `StoreSection` y varios módulos leen `commerceTemplates`, products, variants y assets desde el proyecto Store;
- `packages/core/src/project-mutations.ts` está construido alrededor de `StoreProjectV1`.

Por lo tanto F2 **no** puede empezar con "hacer genérico el renderer". Primero debe encontrar el corte mínimo que permita renderizar una sola sección Landing sin alterar esos contratos Store.

### Regla de no-generalización temprana

Durante F2/F3 está prohibido cambiar de forma transversal las firmas públicas de:

~~~text
exportProject(StoreProjectV1, ...)
renderPreviewHtml(StoreProjectV1, ...)
ModuleRenderContext
StoreSection
StoreProjectV1 / StoreProjectV2
~~~

Si una primitive neutral puede extraerse desde dentro de esos caminos, Store conserva un adapter local que entrega exactamente el mismo output. Si no puede hacerse de manera pequeña, se deja el camino Store opaco y Landing recibe una primitive mínima propia.

### Contrato mínimo del Landing render boundary

El boundary puede cambiar de nombres durante implementación, pero sus dependencias no pueden incluir tipos Store:

~~~ts
interface LandingSectionRenderContext {
  theme: RenderTheme;
  assets: RenderAssetResolver;
  page: RenderPageContext;
}

type LandingSectionRenderer = (
  section: LandingSection,
  context: LandingSectionRenderContext,
) => RenderedLandingSection;
~~~

`LandingSectionRenderer` no importa `StoreProjectV1`, `StoreProjectV2`, `StoreSection`, `Product`, `Category`, `Collection` ni `commerceTemplates`, y tampoco conoce si el consumidor es localhost, Preview o export.

Las diferencias de host se agregan después mediante wrappers/orquestadores:

~~~text
LandingSectionRenderer puro -> RenderedLandingSection
RenderedLandingSection + Preview wrapper  -> markers Canvas/editor
RenderedLandingSection + localhost wrapper -> documento dev
RenderedLandingSection + export wrapper   -> documento público
~~~

Así la paridad de contenido es estructural y no depende de que tres branches por `mode` se mantengan sincronizados.

### Prueba de reutilización obligatoria por primitive

Una primitive sólo puede declararse compartida con Store si existe evidencia concreta:

1. call site Store exacto antes de extraer;
2. call site Store exacto después de extraer;
3. call site Landing que usa el DTO neutral;
4. firma neutral sin tipos Store;
5. test focal del helper;
6. snapshot/hash Store relevante sin cambios;
7. F0 verde.

Sin los siete puntos, la primitive se considera `STORE-OPAQUE` para Landing V1.

### Test de frontera arquitectónica

Los archivos declarados como parte del Landing render boundary deben quedar en una lista explícita dentro del test de arquitectura. Ese test falla si alguno importa tipos o módulos Store-only como `StoreProjectV1`, `StoreProjectV2`, `StoreSection`, Product/Category/Collection o helpers de `commerceTemplates`.

No hacer un grep global del repositorio: la regla se aplica sólo al conjunto pequeño de archivos que afirma ser neutral.

### F2b — primer corte ejecutable mínimo

El objetivo técnico de F2b es deliberadamente pequeño: poder proyectar `LandingProjectV1 -> LandingRenderModel` y renderizar **Hero 01** mediante el Landing render boundary sin tocar las firmas Store enumeradas arriba.

Header/Footer y las demás families sólo se agregan después de demostrar ese corte. Si incluso Hero 01 exige convertir `StoreSection`, `ModuleRenderContext`, `exportProject` o `renderPreviewHtml` en genéricos, **STOP**: el boundary elegido todavía es demasiado grande.

### Documento Landing

No reescribir primero `buildPages()` Store. Mantener el camino Store como referencia y agregar un render de documento tipado para Landing:

~~~ts
renderLandingDocument(model: LandingRenderModel): RenderedLandingDocument
~~~

V1 produce un solo documento `index.html`; el renderer Landing nunca recibe `StoreProjectV2` ni una unión ambigua. No crear una abstracción de graph hasta que exista una fase multipágina aprobada.

### Clasificación futura de artefactos públicos

En F2 sólo inventariar los artefactos que hoy puede emitir `buildFiles`/export production y clasificarlos como `COMMON`, `STORE_ONLY` o `LANDING_ALLOWED`. F2 **no implementa todavía** el file graph Landing. La clasificación pasa a ser fixture/test de política y será ejecutada por F3e.

El mínimo Landing esperado incluye:

~~~text
index.html
robots.txt
sitemap.xml
assets usados
deployment-manifest.json
un CSS Landing
PWA/headers/worker/JS fuera de V1
~~~

Páginas legales/contacto se agregan sólo si no dependen de ecommerce.

### Landing no debe generar

~~~text
/listado/
/buscar/
/carrito/
/compra/
/productos/*
/categorias/*
/colecciones/*
search-index.json
catalog-index.json
google-merchant.xml
Product JSON-LD
ItemList de productos/comercial
feed ecommerce
AI/LLM context con semántica de catálogo
artefactos recovery/export específicos de Store
~~~

### Hallazgos actuales que F2 debe resolver

La inspección del código actual demuestra que:

- productListPage entra hoy incondicionalmente al resultado de buildPages;
- google-merchant.xml entra hoy incondicionalmente en export production;
- el runtime Store ya tiene gating para search/cart/checkout/product/category/filters, pero ese contrato no se importa a Landing.

Conclusión: catálogo vacío no alcanza. Landing necesita un document renderer y file graph propios que nunca invoquen artefactos Store-only.

### Structured data

V1 sólo emite `Organization`, `WebSite` y `WebPage` cuando los datos mínimos existen. Breadcrumbs y `LocalBusiness` quedan fuera de V1; no se fabrican datos para completarlos.

Excluir semántica de producto, `ItemList`, `Product`, `Offer` y datos de Merchant por completo en V1.

### Tests F2

- `LandingProjectV1 -> LandingRenderModel` es determinista;
- inventario F2a registra dependencia, clasificación y decisión de cada primitive usada;
- Hero 01 atraviesa un Landing render boundary sin tipos Store;
- test arquitectónico impide imports Store-only dentro del boundary neutral;
- cada primitive compartida tiene prueba de reutilización completa;
- `exportProject`, `renderPreviewHtml`, `ModuleRenderContext` y `StoreSection` conservan sus firmas públicas Store en F2/F3;
- matriz de artefactos clasificada sin ambigüedades y un file graph de una página;
- render Hero 01 determinista para el mismo input;
- cero branches por `localhost|preview|export` dentro del renderer de sección.

### Gate F2

~~~powershell
<tests focales de LandingRenderModel/boundary>
corepack pnpm check:micro
~~~

Repetir F0.

### Rollback

Un git revert del commit F2.

**STOP** si:

- cambia cualquier hash Store;
- aparece ecommerce en Landing;
- localhost/Preview/export requieren modelos de contenido distintos o Landing render boundaries distintos;
- se propone cambiar StoreProjectV2Schema;
- renderizar Hero 01 exige generalizar de forma transversal `StoreSection`, `ModuleRenderContext`, `exportProject` o `renderPreviewHtml`;
- una supuesta primitive neutral importa tipos Store o necesita un `StoreProjectV1` completo;
- la única justificación de una extracción es "limpiar arquitectura" y no un call site real de Landing;
- el renderer de sección necesita saber si está en localhost, Preview o export.

---

## 7. Fase F3 — vertical slice in-memory dividido

Objetivo: llegar desde Hero 01 hasta Preview y export production **sin persistir nada todavía** y sin convertir F3 en una megafase.

Todo F3 usa fixtures in-memory. Cada subfase es un commit independiente, compila y pasa su gate focal antes de continuar.

### F3a — Hero 01 en localhost

Crear un fixture `LandingProjectV1` mínimo con home + Hero 01 y montarlo en `/landing-lab` mediante el Landing render boundary F2.

Antes de editar UI, cumplir `AGENTS.md`: `$impeccable shape` con brief explícito de wireframe de baja fidelidad, edición por secciones, mismo modelo del editor futuro y viewport de Studio aplicable. La ruta sólo se registra bajo `import.meta.env.DEV`; el build production de Studio no debe contenerla ni aceptarla. El servidor corre en el dev server normal del repo (`corepack pnpm dev`) y el refresh F5 vuelve a cargar el fixture fuente/HMR; esto no escribe proyectos reales ni simula persistencia. Comunicar la URL local exacta y mantener el servidor disponible durante la revisión; no afirmar que está visible si no se verificó que sirve el laboratorio.

~~~text
editar fixture/código -> guardar -> F5 -> ver Hero real generado por el modelo
~~~

No Preview, no export, no persistencia, no Dashboard en F3a.

Gate: test focal Hero/boundary + `check:micro` + `corepack pnpm build` y comprobación de que `/landing-lab` no aparece en el build production + QA manual del lab. **Pausa humana temprana:** dejar localhost disponible para que el usuario confirme tanto el bucle de editar-código/F5 como la dirección wireframe antes de ampliar familias. Registrar `USER_LAB_ACCEPTANCE=ACCEPTED` en `STATE.md` sólo ante aceptación explícita; si pide ajustes, el agente itera en F3a sin expandir alcance. El agente no puede dar esa revisión por hecha.

### F3b1 — IDs de sección y navegación por anclas

Demostrar que sections tienen IDs estables, los targets `sectionId` se resuelven contra `LandingProjectV1.page.sections`, los href se emiten como `#<id>` y un target ausente falla antes de render. No crear rutas, page graph, segunda página ni 404.

Gate: tests focales de IDs/anchors/targets inválidos + `check:micro`.

### F3b2 — shell + chrome Header/Footer

Agregar el wrapper semántico común, skip link, Header 01 y Footer 01 como slots globales `LandingChromeV1`. No los agregar a `page.sections` ni permitir reorder en Canvas. Resolver navegación por anclas de la página única y usar fuentes globales identity/navigation/contact.

Gate: tests focales de shell, navegación, accesibilidad y documento de una página + `check:micro`.

### F3c — families de body V1 y fixture-template único

Agregar las families iniciales en subfases/commits separados:

~~~text
Hero 01
Benefits 01
Media 01
CTA 01
~~~

Orden: F3c1 Benefits, F3c2 Media, F3c3 CTA; Hero ya existe desde F3a. Announcement opcional se agrega como F3c4 sólo si el recorrido visual lo necesita. Cada subfase tiene una allowlist de archivos, gate focal y rollback propios. El fixture completo se convierte en el **único candidato a template V1**; F6 sólo lo congela como factory de creación.

Verificar que CTA usa targets tipados y no duplica teléfono/email. No introducir forms ni runtime JS.

### F3d1 — integrar Preview

Conectar Preview al mismo `LandingRenderModel` y los mismos section renderers. Los Canvas markers se agregan en wrapper Preview.

Gate: test focal de Preview/canonical content + `check:micro`.

### F3d2 — responsive y aceptación visual

Revisar la salida conectada a Preview y localhost en:

Verificar:

~~~text
Mobile  320-767   referencia 390x844
Tablet  768-1199  referencia 1024x900
Desktop >=1200    referencia 1440x900
frontera mobile/tablet: 762, 767, 768, 773
frontera tablet/desktop: 1194, 1199, 1200, 1205
~~~

Además: teclado, focus, contraste básico, `prefers-reduced-motion` (sin animación en V1) y cero errores de consola. Usar sólo los tres modos oficiales; no introducir breakpoints de layout extra. El localhost queda disponible con URL comunicada al usuario durante la revisión. Aplicar `$impeccable critique` al wireframe ya existente sin pulirlo más allá de la baja fidelidad acordada. **Punto de decisión humano:** registrar `USER_VISUAL_ACCEPTANCE=ACCEPTED` sólo con aceptación explícita del usuario después de ver el localhost; si no, el estado queda `PENDING` y no se congela template ni se empieza producción/persistencia. Un test verde, screenshot o silencio no equivale a aceptación.

### F3e1 — producción in-memory: documento y assets

Generar `index.html`, un CSS Landing y assets raster del mismo snapshot, sin persistencia. Todo texto/atributo se escapa; CSS sólo consume tokens validados; asset URLs se resuelven desde IDs. Probar XSS/URL/CSS adversariales, HTML <=1 MiB, CSS <=32 KiB gzip y cero JS.

### F3e2 — SEO y allowlist de artefactos de una página

Generar canonical, robots, sitemap y metadata para una sola ruta pública. La allowlist exacta en production es: `index.html`, `robots.txt`, `sitemap.xml`, `deployment-manifest.json`, un CSS Landing y sólo los assets alcanzables por page/chrome/SEO. En draft se quita `sitemap.xml` y el resto sigue dentro de la misma allowlist. CSS/assets usan nombres deterministas derivados de hashes. El deployment manifest lista modo, snapshot y hashes de los archivos desplegables, excepto su propio hash para evitar autorreferencia. No generar `404.html`, rutas adicionales, PWA, service worker, JS público, RSS, Merchant, AI context ni headers específicos de Store.

No hay un setting `index/noindex` en V1: production permite indexación por defecto (`User-agent: *`, `Allow: /`) y publica un sitemap con la única URL canónica; draft incluye `noindex,nofollow,noarchive` en HTML, omite sitemap y nunca se presenta como export publicable. En ambos modos el `robots.txt` es determinista; draft contiene `User-agent: *` y `Allow: /` pero no línea `Sitemap`, para que los crawlers puedan leer la instrucción `noindex`. Canonical/schema público sólo se emite cuando `baseUrl` permite resolverlo sin placeholder.

### F3e3 — draft/production, determinismo y paridad

Antes de persistencia real, cerrar el orquestador para exportar fixture F3c en `draft` y `production` desde memoria. Production exige `baseUrl` HTTPS válida y bloquea cualquier sección opaca activa.

Debe demostrar aquí, no en F8 por primera vez:

- allowlist completa y exacta de archivos y assets de un documento;
- canonical derivado de `baseUrl`;
- HTML útil sin JavaScript;
- draft siempre noindex y fuera del sitemap; production indexable por defecto con una URL en el sitemap;
- cero rutas ecommerce;
- cero Merchant/Product JSON-LD/catalog/search artifacts;
- structured data sólo `Organization`, `WebSite` y `WebPage`, con serialización segura;
- XSS/URL/CSS adversariales no salen de su contexto;
- sitio production determinista en dos ejecuciones;
- export fallido no tiene todavía efectos persistentes porque F3 sigue siendo in-memory.

`exportLandingProject` puede ser un orquestador separado de `exportProject(StoreProjectV1, ...)`; ambos caminos comparten sólo primitives realmente neutrales demostradas. Exportar dos veces el mismo snapshot en cada modo produce exactamente el mismo file graph/hash.

### Contrato de paridad F3

Comparar una representación canónica del contenido renderizado. La canonicalización sólo puede quitar wrappers/markers de host y origin de desarrollo; no puede borrar texto, links, orden, assets, layout, SEO ni feature markers.

~~~text
canonicalLandingContent(localhost)
== canonicalLandingContent(preview)
== canonicalLandingContent(draft export)
== canonicalLandingContent(production export)
~~~

La igualdad excluye únicamente wrappers del host/editor; SEO/publication flags se comparan aparte con expectativas específicas draft/production. No hay runtime feature markers en Landing V1 porque no hay JS público.

### GO humano F3d2 -> F3e

No comenzar F3e (ni F4+) hasta que `STATE.md` registre aceptación visual explícita del wireframe en localhost y el usuario indique continuar con el siguiente hito. Si el usuario pide ajustes, se itera sólo sobre la allowlist de la subfase visual activa; no se aprovecha esa revisión para agregar features.

### Gate de cierre F3

~~~powershell
<tests focales de cada subfase F3 activa>
corepack pnpm --filter @solara/studio test
corepack pnpm --filter @solara/exporter test
corepack pnpm check:runtime-serialization
corepack pnpm check:budgets
corepack pnpm check:micro
~~~

No ejecutar el smoke global en cada subfase. Al cierre de F3, ejecutar un smoke focal Landing con `PLAYWRIGHT_WORKERS=1` y repetir F0.

### Rollback

Cada subfase F3 se revierte por separado. Como todo F3 es in-memory, ningún revert deja datos Landing persistidos incompatibles.

---

## 8. Fase F4 — persistencia Landing con autoridad en disco

Objetivo: dar a Landing la misma regla operativa que hoy tiene Store: cuando existe servidor administrado, el filesystem confirmado es la autoridad; IndexedDB es fallback/recovery. Todo esto sin hacer que el storage Store antiguo vea una Landing.

### Principio

No insertar Landings dentro del repositorio Store tipado como `StoreProjectV1`.

Crear una interfaz Landing separada:

~~~ts
interface LandingRepositoryV1 {
  create(project: LandingProjectV1): Promise<void>;
  get(id: string): Promise<LandingProjectV1 | null>;
  save(project: LandingProjectV1): Promise<void>;
  list(): Promise<LandingProjectV1[]>;
  // operaciones adicionales sólo cuando cada una tenga contrato/test propio
}
~~~

### Autoridad y aislamiento exactos

En modo administrado:

~~~text
Store authority    -> proyectos/        (contrato actual intacto)
Landing authority  -> landings/         (raíz nueva hermana, no subcarpeta de proyectos/)
~~~

`landings/` se elige deliberadamente fuera de `proyectos/`: el storage Store actual recorre las carpetas hijas de `proyectos/` y espera manifests Store. Colocar `proyectos/landings/` haría que lectores viejos puedan reportarla como proyecto roto.

F4a extiende `resolveLocalLayout()` con `landingsRoot = <applicationRoot>/landings`, valida que quede dentro de `applicationRoot`, y hace `mkdir`/`assertNoReparsePoints` sólo en esa raíz hermana. Agrega `/landings/` a `.gitignore` antes de crear datos; fixtures usan exclusivamente un `applicationRoot` temporal. Store conserva `projectsRoot` y todos sus lectores/listados sin cambios; Landing enumera exclusivamente `landingsRoot`.

El API loopback Landing usa rutas separadas, conceptualmente:

~~~text
GET    /__solara/storage/landings
GET    /__solara/storage/landings/:id
POST   /__solara/storage/landings
PUT    /__solara/storage/landings/:id
~~~

Usar los mismos requisitos de sesión administrada, loopback y validación de origen/autorización que los endpoints actuales, con límite de body de 40 MiB antes del parseo. No ampliar `/__solara/storage/projects/...` con un payload union Store/Landing. Validar IDs/rutas sin doble-decoding, rechazar traversal/separadores codificados y comprobar reparse points después de resolver cada destino.

Cada escritura `PUT` lleva `expectedVersion`; un lock por `projectId` más compare-and-swap rechaza escrituras obsoletas en vez de perder cambios. Create usa ID estable: repetir el mismo ID y hash devuelve el resultado existente; el mismo ID con contenido distinto responde conflicto. No crea una segunda carpeta si el cliente reintenta. Un manifiesto Landing inválido se reporta en la superficie Landing y no bloquea el listado ni la operación Store.

En navegador sin servidor administrado:

~~~text
Store IndexedDB    -> solara-commerce-studio, versión actual intacta
Landing IndexedDB  -> solara-landing-studio, versión 1 propia
~~~

No subir la versión de la DB Store para agregar Landing. La DB Landing sirve como fallback local y recovery; cuando el launcher está disponible, App carga primero `landings/` igual que hoy carga primero `proyectos/` para Store.

### Layout administrado Landing

Definir antes de implementar el handler:

~~~text
landings/<projectId-uuid>/
├── manifest.json
├── recovery.json              # sólo diagnóstico ante error, si se necesita
├── actual/<version>.solara-landing.json
├── respaldos/<version>.solara-landing.json
├── respaldos-manuales/
└── sitios/<version>/index.html ...
~~~

Debe conservar staging, hash, path validation, protección contra reparse points, compare-and-swap por versión y commit atómico equivalentes al storage Store cuando esas primitives puedan extraerse puramente. Si no, implementar un handler Landing pequeño copiando **el protocolo**, no el tipo Store.

### Formato persistido Landing

~~~text
format = solara-landing-project
version = 1
kind = landing
project = LandingProjectV1
~~~

El `manifest.json` administrado usa exactamente un formato distinto del archive editable:

~~~ts
interface LandingLocalManifestV1 {
  format: "solara-local-landing";
  manifestVersion: 1;
  kind: "landing";
  projectId: string;
  name: string;
  current: {
    version: number;
    projectPath: string;
    sha256: string;
    updatedAt: string;
  };
  site: {
    status: "not-exported" | "synced" | "site-outdated";
    path?: string;
    exportedProjectSha256?: string;
  };
}
~~~

`not-exported` significa que nunca hubo sitio de salida y no puede tener `path`/hash; `synced` exige que path y hash refieran al snapshot actual; `site-outdated` conserva path/hash del último export válido, que difiere de `current.sha256`. Guardar el proyecto y exportar production son resultados separados: un fallo de export no revierte un guardado correcto ni reemplaza el sitio previo; la UI informa “proyecto guardado, sitio no exportado/desactualizado”.

F4a puede agregar campos sólo si son imprescindibles para atomicidad/recovery y quedan testeados. No reutilizar `solara-local-project` ni `manifestVersion: 2` de Store.

No reutilizar `format: solara-project / version: 2` si su parser actual exige `StoreProjectV2`.

`ManagedProject` es la unión de orquestación de la aplicación; no obliga a reescribir archivos Store existentes dentro de un envelope nuevo.

### Reglas

- Landing no reutiliza una carpeta/record Store existente;
- el Dashboard puede usar una clave compuesta conceptual `{kind,id}` para selección; no exigir unicidad global entre bases salvo que una superficie concreta la necesite;
- datos reales nunca se usan en tests;
- implementar staging/read-back/hash/atomicidad Landing antes de prometer equivalencia con helpers Store;
- una exportación Landing fallida no reemplaza un sitio válido previo;
- no asumir que guardar produce production export: el estado del proyecto y el estado del último sitio se comunican por separado;
- App nunca decide la autoridad comparando timestamps sueltos entre DBs: en modo administrado, disco confirmado gana y el navegador sólo puede aportar RecoveryDraft.
- IDs iguales entre Store y Landing son técnicamente tolerables porque viven en namespaces distintos; toda UI combinada usa `{kind,id}`.

### Operaciones mínimas

Dividir F4 en commits pequeños, todos bajo la misma fase contractual:

~~~text
F4a storage administrado landings/ + loopback list/get/create/save + atomicidad
F4b IndexedDB Landing separado + RecoveryDraft + reconciliación disco/browser
F4c archive/backup/restore + downgrade test
F4d duplicate/archive/delete sólo si realmente son necesarias para V1
~~~

No implementar nueve operaciones en un único diff.

### Reconciliación al aparecer el launcher

Aplicar una política determinista equivalente en intención a Store:

~~~text
sólo en landings/                 -> abrir disco y cachear snapshot
sólo en IndexedDB Landing         -> validar y migrar como primera versión a landings/
mismo id + mismo snapshot/hash    -> disco es autoridad; cache puede conservarse
mismo id + contenido diferente    -> disco gana; browser se conserva como RecoveryDraft
snapshot browser inválido         -> no migrar; reportar recovery accionable
~~~

Ninguna rama decide por `updatedAt` solamente. Hash/versión confirmada y validación del schema gobiernan la reconciliación.

### RecoveryDraft

Recovery Landing usa un payload discriminado propio dentro del storage Landing. No ampliar `RecoveryDraft.project: StoreProjectV1` con casts.

Debe impedir:

~~~text
Landing recuperada como Store
Store recuperada como Landing
~~~

### Tests F4

- código Store anterior puede recorrer `proyectos/` aunque exista `landings/` al lado;
- `resolveLocalLayout` resuelve la raíz hermana esperada; el store scanner jamás enumera `landings/`; `.gitignore` excluye la raíz real y las pruebas sólo escriben bajo temp;
- rutas, auth de sesión, tamaño de body, reparse points, path traversal, doble-decoding y manifests cruzados se rechazan;
- dos `PUT` concurrentes con igual `expectedVersion` dejan exactamente una escritura confirmada y una respuesta de conflicto; reintento de create no duplica carpeta;
- estados de sitio inicial, exportado, obsoleto y export fallido cumplen las reglas y conservan el último sitio válido;
- Store repository abre y guarda sin conocer Landing;
- versión/schema de DB Store permanece idéntica;
- abrir una DB Store con el código posterior no la migra por Landing;
- managed mode carga Landing desde `landings/` como autoridad y no desde IndexedDB;
- browser-only usa `solara-landing-studio` sin abrir/migrar `solara-commerce-studio`;
- Landing conserva format/version/kind;
- round-trip Landing;
- backup/restore;
- recovery;
- versión futura Landing se rechaza de forma explícita sin corromper datos;
- archivo Landing corrupto se rechaza sin fallback a Store;
- conflicto de versión;
- escritura fallida preserva estado anterior;
- Store tests continúan sin cambios.

### Prueba de downgrade obligatoria

Crear datos Landing en `landings/` y en su DB separada con el código nuevo y luego comprobar, en un checkout/fixture de compatibilidad equivalente al código base F0, que el código Store puede seguir abriendo `proyectos/` y `solara-commerce-studio` sin ver, migrar ni parsear Landing.

No se exige que el código viejo abra Landing; se exige que Landing sea invisible y no dañina para Store.

### Gate F4

~~~powershell
corepack pnpm --filter @solara/studio test
corepack pnpm --filter @solara/exporter test
corepack pnpm check:micro
~~~

Repetir F0.

### Rollback

Rollback = `git revert` del código **más** garantía de aislamiento de datos demostrada por la prueba de downgrade.

Nunca borrar `proyectos/` ni datos reales para hacer verde el rollback. Landings creadas por una versión nueva pueden quedar temporalmente inaccesibles para una versión vieja, pero no deben impedir que Store abra y opere normalmente.

---

## 9. Fase F5 — Studio mínimo para `LandingProjectV1`

Objetivo: demostrar que el Studio existente puede editar el dominio Landing real antes de exponer "Nueva landing" en Dashboard.

Esta fase comienza únicamente después de que F3 haya demostrado render in-memory y F4 haya demostrado persistencia Landing aislada.

### Entrada controlada

Durante F5 no hace falta todavía un botón Dashboard. Abrir un fixture/proyecto Landing conocido mediante una ruta o harness de desarrollo/test explícito.

### F5a — frontera de sesión/editor, sin universalizar `App.tsx`

El estado Store existente de `App.tsx` puede seguir tipado como Store. No convertir de golpe todos sus estados (`active`, disk base, recovery, guards, etc.) a `ManagedProject`.

Introducir una frontera pequeña antes del editor:

~~~text
ProjectSelection { kind, id }
  -> store   -> sesión Store existente
  -> landing -> LandingEditorAdapter -> mismo StudioShell
~~~

`LandingEditorAdapter` es un adapter de dominio, no un `LandingStudio`: no duplica layout, toolbar, Preview ni renderer. Su responsabilidad es entregar al shell las operaciones tipadas Landing.

Gate F5a: abrir Store por el camino anterior + abrir Landing harness hasta el mismo shell, sin edición todavía.

### F5b — History aislado

El History actual está tipado a Store. Resolverlo explícitamente con una generalización mínima behavior-preserving, por ejemplo un `HistoryState<T>`/helper genérico o un adapter equivalente que reutilice el mismo algoritmo.

Separar el algoritmo de snapshots (`push/undo/redo`) de `executeCommand`/`getMaxHistoryLength`, que hoy sí contienen semántica Store/catálogo. Landing reutiliza el algoritmo genérico; no reutiliza `DomainCommand` Store.

Requisitos:

- la instanciación Store mantiene exactamente su tipo/comportamiento actual;
- Landing history almacena `LandingProjectV1`;
- undo/redo conserva IDs, orden, family, variant y content;
- no crear un segundo algoritmo de History.

Gate F5b: tests focales History Store antes/después + History Landing; F0 verde.

### F5c — Canvas mínimo de secciones

El editor debe operar sobre el contrato F1:

~~~text
section.id
section.family
section.variantId
section.content
~~~

Para V1 sólo existe variant `01` por family, pero el selector/registry no debe acoplar contenido al markup.

Canvas Landing sólo expone bindings neutrales auditados. Sources `product`, `category`, `collection`, cart, filters o variantes de producto quedan fuera por construcción, no sólo ocultos visualmente.

F5c sólo habilita selección, edición de texto/copy y reorder. Assets, Theme, SEO y navegación todavía no entran en esta subfase.

### F5d — controles neutrales

Agregar uno por uno: Assets, Theme, SEO general y navegación. Cada control debe aceptar DTO/callback neutral o un adapter Landing pequeño; si exige un proyecto Store completo se mantiene Store-only y se crea el control mínimo Landing reutilizando primitives visuales.

### Qué significa realmente "reutilizar el editor"

Para Landing V1, reutilizar el editor significa conservar el **Studio shell y la experiencia** cuando sus contratos puedan adaptarse de forma pequeña:

~~~text
shell/layout del Studio
toolbar responsive
paneles/controles genéricos
asset picker
theme controls neutrales
SEO general neutral
navegación neutral
History/undo UI con algoritmo compartido
Canvas chrome/selección/reorder cuando no dependa de StoreSection
guardar/exportar como acciones de shell enrutadas por kind
~~~

No significa reutilizar obligatoriamente en V1:

~~~text
StoreSection
ModuleRenderContext Store
registry de módulos Store completo
project-mutations Store
exportProject(StoreProjectV1)
renderPreviewHtml(StoreProjectV1)
commerceTemplates
workers/catalog flows
~~~

La meta es reutilización de producto y UX con fronteras tipadas, no reutilización porcentual de archivos. Forzar una API Store-only por "reuso" cuenta como rework y dispara STOP.

### F5e — side effects + Guardar/Preview/Export

Ocultar tabs no alcanza. Agregar guards explícitos para impedir que Landing entre por accidente en consumidores Store-only como:

- site-optimizer/readiness Merchant;
- CSV/catalog workers;
- agent flows todavía Store-only;
- módulos Store-only clasificados en F2;
- rutas/actions ecommerce;
- recovery/archive Store.

Mientras una superficie no soporte Landing, debe rechazar `kind: landing` de forma explícita y testeada.

Sólo en F5e conectar Guardar al storage F4 y Preview/Export a los caminos ya demostrados en F3. No descubrir aquí una nueva arquitectura de export.

### Landing oculta/deshabilita

- catálogo;
- productos;
- categorías;
- colecciones;
- carrito;
- checkout;
- búsqueda comercial;
- Merchant;
- CSV de catálogo;
- facturación por variantes;
- controles exclusivamente ecommerce.

### Landing conserva

- identidad;
- Theme;
- Assets;
- SEO general;
- navegación;
- secciones;
- Canvas;
- History undo/redo;
- Preview;
- toolbar responsive;
- Guardar;
- Exportar;
- contacto;
- legales compatibles.

"Conserva" significa reutilizar la experiencia/primitive cuando el contrato lo permita, no pasar un `LandingProjectV1` a funciones que exigen `StoreProjectV1`.

### Regla anti-rework

No mover componentes Store sólo para limpiar arquitectura. Sí se permite una extracción/generalización mínima cuando sea imprescindible para que dos dominios consuman la misma primitive, siempre en un commit behavior-preserving y con F0 verde.

Extraer una primitive únicamente cuando:

1. Store y Landing ya la usan;
2. existe duplicación real;
3. la extracción puede verificarse independientemente.

Si Landing necesita una primitive visual simple y la única alternativa es migrar una jerarquía Store completa, crear la versión Landing mínima detrás del Landing render boundary es la opción conservadora. Esa primitive puede converger con Store más adelante sólo cuando exista duplicación real y una extracción behavior-preserving demostrable.

### Tests F5

- Studio Store mantiene tabs/acciones esenciales;
- Landing no ofrece ecommerce;
- abrir Landing persistida mediante harness controlado;
- edición de texto;
- edición de imagen;
- reorder de secciones conservando IDs;
- cambio de variant queda preparado pero V1 sólo ofrece `01`;
- Theme;
- SEO;
- navegación;
- undo/redo;
- guardar/reabrir;
- Preview;
- cero errores de consola.

### Gate F5

~~~powershell
<tests focales de la subfase F5 activa>
corepack pnpm check:micro
~~~

Cada F5a-e es un commit independiente y repite F0. Registrar el tamaño de los bundles Studio antes/después; no subir sus budgets para absorber Landing. `check:budgets` puede reportar advertencias no bloqueantes del bundle Studio, así que informar el delta medido aparte de los budgets públicos bloqueantes. Al cierre F5: `@solara/studio` tests + smoke focal Landing con `PLAYWRIGHT_WORKERS=1` + QA visual 1920x912.

### STOP F5

Revertir si aparece:

- LandingStudio;
- duplicación del shell;
- segundo algoritmo de History;
- segundo renderer de Preview;
- segundo sistema de Theme;
- cambio de StoreProjectV2;
- reescritura de varias infraestructuras a la vez.
- para abrir la primera Landing hay que convertir `App.tsx`, `module-sdk`, exporter y core a un modelo universal en la misma fase;
- un control reutilizado requiere que `LandingProjectV1` finja ser `StoreProjectV1`.

### Rollback

Revertir el commit F5 no toca datos Store. Landings persistidas en F4 quedan aisladas y pueden permanecer inaccesibles temporalmente sin romper Store.

---

## 10. Fase F6 — congelar template Landing V1

Objetivo: convertir el fixture candidato validado en F3c/F3e en la única factory de `Nueva landing` **antes** de que Dashboard pueda crear datos reales.

### Fidelidad inicial

La plantilla V1 conserva deliberadamente la baja fidelidad del fixture F3:

- cajas, espaciado y jerarquía claramente visibles;
- tipografía y estilos mínimos;
- placeholders evidentes para imágenes;
- sin animaciones decorativas;
- sin acabado visual final;
- sin variantes estéticas prematuras.

La baja fidelidad no habilita atajos arquitectónicos: cada bloque debe ser editable mediante el mismo modelo que usará el editor definitivo.

F6 no inventa una nueva implementación visual: congela exactamente los mismos `family/content/variant` usados por el vertical slice F3. La factory sólo asigna el UUID, timestamps, nombre/baseUrl inicial y clona el contenido canónico.

### Secciones iniciales

~~~text
Announcement opcional
Header 01
Hero 01
Content / beneficios 01
Media 01
CTA / contacto 01
Footer 01
~~~

Regla V1: exactamente una variante inicial por familia necesaria para completar una Landing de punta a punta. El template público contiene exactamente una página con esos módulos ordenables.

No crear `Hero 02`, `CTA 02`, `Header 02`, etc. hasta que `01` pueda editarse, ordenarse, previsualizarse, guardarse, reabrirse y exportarse correctamente.

Cada familia debe separar:

~~~text
contenido estable -> contrato de datos
presentación       -> variant 01
~~~

Esto permite que una futura variant cambie la presentación sin duplicar ni transformar el contenido existente.

Reusar únicamente primitives clasificadas `EXTRACTABLE-PURE` y que hayan pasado la prueba de reutilización F2. Una superficie `STORE-OPAQUE` no entra aunque visualmente se parezca a lo necesario.

Si falta una primitive imprescindible, agregar sólo esa primitive con input neutral y test focal. No copiar un módulo Store entero para quitarle controles ecommerce.

### Fuera de alcance todavía

- constructor libre;
- nested layouts arbitrarios;
- CRM;
- formularios con backend;
- analytics propio;
- A/B testing;
- pagos;
- catálogo;
- scripts personalizados;
- segundo sistema de theme/fonts.

### Responsive

Exactamente:

~~~text
Mobile  320-767   referencia 390x844
Tablet  768-1199  referencia 1024x900
Desktop >=1200    referencia 1440x900
~~~

Usar fronteras 762/767/768/773 y 1194/1199/1200/1205 de `docs/RESPONSIVE_BREAKPOINTS.md`; no agregar modos ni cortes propios. Verificar que Landing no requiera modificar los breakpoints compartidos Store.

### Tests F6

- template válido;
- registry `family -> variant 01` completo y consistente;
- dos llamadas a la factory producen IDs independientes pero contenido/defaults equivalentes;
- ninguna copia de identity/navigation/contact queda embebida dentro de Header/Footer/CTA;
- Preview/export paridad;
- HTML útil sin JS;
- teclado;
- focus/contraste;
- reduced motion;
- assets;
- SEO;
- URLs;
- cero ecommerce.

### Gate F6

~~~powershell
corepack pnpm check:micro
<tests focales de template Landing>
~~~

### Rollback

F6 no introduce families/variants nuevas respecto de F3. Antes de F7 Dashboard no existen Landings de usuario creadas mediante esta factory, por lo que su revert todavía es puramente de código.

---

## 11. Fase F7 — Dashboard crea/lista/abre Landing

Objetivo: exponer Landing al usuario sólo después de que renderer, export in-memory, persistencia, Studio y template factory ya existen.

### UI mínima

Agregar `Nueva landing` y cards/listado consistentes con el Dashboard vigente.

Dashboard combina `StoreRepository` y `LandingRepositoryV1` sólo en un view-model discriminado. En modo administrado, la lista Landing proviene de `landings/`; no de IndexedDB salvo recovery/fallback sin launcher.

### Acciones iniciales

- crear mediante la factory F6;
- listar;
- abrir;
- guardar/reabrir a través del Studio F5.

Duplicar, archivar/restaurar, backup y eliminar se muestran sólo si su operación F4 correspondiente existe y está verde.

### Reglas

- Nueva tienda conserva su flujo actual;
- Predeterminado permanece Store;
- selección usa `{kind,id}`;
- una card Landing nunca llama acciones Store;
- una card Store nunca llama acciones Landing;
- refresh recompone ambos listados sin reinterpretar payloads;
- crear Landing con launcher confirma el primer snapshot en `landings/` antes de anunciar éxito.

### Tests F7

- acciones Store actuales se conservan;
- Nueva tienda crea Store;
- Nueva landing usa exactamente factory F6;
- managed mode crea/lista desde `landings/`;
- abrir Landing llega al Studio F5;
- selección no cruza repositories/kinds;
- recarga conserva ambos listados;
- Predeterminado sigue protegido.

### UI QA y gate F7

Viewport principal `1920x912`. Ejecutar test focal Dashboard Landing + `check:micro`; al cierre, smoke focal con `PLAYWRIGHT_WORKERS=1`. No depender de que el smoke genérico descubra esta ruta automáticamente.

### Rollback

Revertir F7 elimina la entrada de Dashboard y no borra Landings ya confirmadas. F4 garantiza que Store continúa operando y que `landings/` puede quedar temporalmente inaccesible sin ser destruido.

---

## 12. Fase F8 — integración persistida dividida

Objetivo: verificar el vertical slice **persistido** sin convertir la integración final en un commit que mezcle Studio, storage, exporter y recovery. Production ya fue demostrado in-memory en F3e; F8 comprueba que cada frontera consume el mismo snapshot.

### F8a — guardar, cerrar y reabrir

Conectar Landing del Dashboard/Studio al repositorio F4: crear por factory F6, editar, Preview, guardar, cerrar y reabrir el mismo proyecto desde la autoridad correcta. Probar también recuperación/browser fallback sin mezclarlo con el nuevo export production.

Gate: tests focales de Dashboard/Studio/repository + `check:micro` + F0. Rollback de este commit no borra el snapshot Landing confirmado.

### F8b — production persistido y backup/restore integrado

Exportar production desde el snapshot reabierto; verificar hash/manifest/allowlist/sitemap y que un fallo deja intacto el sitio anterior con estado `site-outdated`. Ejecutar backup/restore ya implementado en F4c y comprobar que restaura el mismo proyecto/hash sin cambiar Store.

~~~text
crear
-> editar
-> preview
-> guardar
-> cerrar
-> abrir
-> exportar
~~~

### Verificar

- draft;
- production;
- carpeta final válida;
- backup editable;
- restore;
- manifest;
- hashes;
- sitio previo conservado ante fallo;
- Merchant ausente;
- catálogo ausente;
- sitemap production correcto con exactamente una URL;
- deployment manifest válido;
- el production persistido coincide canónicamente con el production in-memory F3e para el mismo snapshot;
- `landings/` conserva el sitio válido anterior si falla una nueva exportación.

### Gate de cierre F8

~~~powershell
corepack pnpm --filter @solara/exporter test
corepack pnpm --filter @solara/studio test
corepack pnpm check:micro
$env:PLAYWRIGHT_WORKERS="1"
corepack pnpm test:e2e:smoke:full
~~~

Repetir F0.

### Rollback

Revertir F8a o F8b por separado más repetición de la prueba de downgrade F4. No borrar ni transformar Landings persistidas para volver atrás.

---

## 13. Extensión post-V1 optativa — F9 ampliar variants y families

F9 está fuera del MVP y del cierre V1. Sólo se abre tras terminar F0-F8, cerrar F10, y recibir una petición explícita de ampliar el producto.

Esta fase es el primer momento en que se permite agregar una segunda variante visual de una familia existente.

Antes de aceptar una nueva variante debe demostrarse que consume el mismo contrato de contenido que la variante 01 y que cambiar `01 -> 02 -> 01` no pierde datos.

Orden seguro inicial para **variants de families ya existentes**:

1. Hero variants.
2. Content/benefits.
3. Media/gallery.
4. CTA variants.
5. Contact variants.
6. Navigation/Footer variants.

### Agregar una family nueva no es lo mismo que agregar una variant

`Testimonials`, `FAQ`, `Pricing`, etc. sólo se agregan cuando su content schema esté definido. La estrategia ya fue decidida en F1: un reader V1 anterior las conserva como `OpaqueLandingSectionV1` sin ejecutarlas ni reescribirlas.

Una family conocida nueva puede mantenerse en `schemaVersion: 1` sólo si el contrato opaco demuestra downgrade/preservación completa. Si el cambio requiere alterar invariantes del proyecto/página o migrar datos existentes, entonces sí nace `LandingProjectV2` con reader/migración explícitos.

Cada nueva family debe probar:

- reader anterior la trata como opaque y conserva raw/id/family/variant/content;
- save/reopen con reader anterior no pierde datos;
- reader nuevo recupera la family tipada completa;
- el reader anterior no emite su HTML público como si conociera la semántica;
- no se ejecuta contenido opaco como HTML/JS.

Contrato conceptual:

~~~text
Family != Preset != Variant
~~~

- Family = forma de datos;
- Preset = intención semántica;
- Variant = presentación.

No crear un módulo por negocio o caso de uso.

Cada variant nueva es un cambio independiente con fallback. Cada family nueva es un cambio de contrato de datos y no puede tratarse como un simple commit visual revertible.

### Compatibilidad de variantes persistidas

Una vez que una variant nueva puede guardarse en proyectos reales, deja de ser seguro hacer un revert ciego que elimine su ID.

Regla:

~~~text
contenido -> siempre pertenece a family
variantId -> preferencia visual versionable
fallback  -> variant 01 de esa family
~~~

El parser debe distinguir:

- variant conocida y compatible -> render normal;
- variant conocida pero de otra family -> error de validación;
- variant desconocida de la misma sección al leer datos futuros/downgrade -> preservar el valor, advertir y renderizar temporalmente con `01` sin destruir `content`.

No sobrescribir automáticamente el `variantId` desconocido al guardar salvo una migración explícita autorizada. Así `02 -> código viejo -> código nuevo` no pierde la preferencia original.

Cada nueva variant debe probar:

- `01 -> 02 -> 01` sin pérdida de content;
- save/reopen con `02`;
- reader anterior/fallback no destruye content ni variantId;
- volver al reader nuevo restaura `02`.

---

## 14. Fase F10 — cierre técnico de V1

Sólo después de F0-F8 verdes. F9 no es requisito para entregar Landing V1.

### Gates

~~~powershell
git diff --check
corepack pnpm check:repository
corepack pnpm check:quick
corepack pnpm check:full
$env:PLAYWRIGHT_WORKERS="1"
corepack pnpm test:e2e:smoke:full
corepack pnpm test:e2e
~~~

Node de release: 24.x. Mantener `PLAYWRIGHT_WORKERS=1` en esta máquina para el cierre Landing; no aumentar concurrencia para acortar tiempo si reaparecen freezes.

### Validación Store final

Reejecutar F0.

~~~text
TODOS LOS HASHES DEL CORPUS STORE F0 == BASELINE
~~~

Una diferencia Store necesita justificación independiente de Landing.

### Documentación de cierre

Los contratos persistidos se documentan en la misma fase en que nacen (F1/F4). F10 sólo sincroniza y cierra la documentación de lo que realmente quedó implementado:

- CHANGELOG.md;
- docs/ARCHITECTURE.md;
- docs/DATA_MODEL.md si nace un contrato persistido nuevo;
- docs/INTEGRATIONS.md;
- docs/TESTING.md;
- docs/PROJECT_MAP.md;
- docs/INDEX.md.

---

## 15. Matriz de impacto prevista

La tabla es inventario de revisión. No implica que todos los archivos deban modificarse.

| Superficie | Cambio esperado | Regla |
| --- | --- | --- |
| packages/project-schema | Sí | Agregar `LandingProjectV1`; no cambiar `StoreProjectV2ShapeSchema` |
| shared sub-schemas de theme/assets/seo/navigation/contact | Sólo tras auditoría | Reusar sólo shapes neutrales; extracción mínima si están mezclados con Store |
| fixtures Store | No | Oráculo inmutable |
| packages/core / History | Probable | Extraer sólo algoritmo genérico push/undo/redo; `DomainCommand`, `getMaxHistoryLength` y `project-mutations` Store permanecen Store |
| packages/modules | Auditar antes de tocar | Clasificar superficies STORE-OPAQUE/EXTRACTABLE-PURE; no convertir registry Store completo para Landing V1 |
| packages/module-sdk | Preferir no tocar en F2/F3 | `ModuleRenderContext`/`StoreSection` permanecen Store; extraer sólo helpers puros pequeños con prueba de reutilización |
| Landing render boundary | Sí, mínimo | Contrato sin tipos Store; una única implementación por family usada por localhost/Preview/export Landing |
| packages/exporter `exportProject` / `renderPreviewHtml` | Store-opaque en F2/F3 | Mantener firmas/behavior; Landing usa orquestación propia mínima si el adapter no es trivial |
| packages/exporter document/buildFiles | Sí, controlado | File graph Landing explícito de una página; no reescribir primero `buildPages()` Store |
| packages/exporter/src/recovery.ts | No reutilizar ciegamente | Recovery Landing con contrato propio/adapter explícito |
| exporter pwa/feeds/cf-worker/AI artifacts | Revisar explícitamente | Clasificar COMMON/STORE_ONLY/LANDING_ALLOWED |
| exporter tests | Sí | Baseline Store + Landing + artifact graph |
| packages/site-optimizer | Sí o guard explícito | SEO general Landing; Merchant/readiness catálogo no aplica |
| packages/storefront-runtime | Preferir cero cambios en V1 | Landing V1 puede ser HTML/CSS; capabilities JS futuras deben ser neutrales, opt-in y no duplicar infraestructura runtime |
| apps/studio/src/features/Preview.tsx | Sí | Enrutar LandingRenderModel al Landing render boundary; no forzar `renderPreviewHtml(StoreProjectV1)` |
| apps/studio/src/features/Studio.tsx | Sí, por shell/adapters | No convertir `App.tsx` entero a unión; Store conserva su sesión actual y Landing entra mediante adapter al mismo shell |
| apps/studio/src/features/Builder.tsx | Auditar | Canvas/bindings Store-only deben quedar fuera de Landing |
| apps/studio/src/features/Overview.tsx | Probable | Ocultar ecommerce Landing |
| apps/studio/src/features/Seo.tsx | Probable | Merchant no aplica |
| apps/studio/src/features/Export.tsx | Probable | Artefactos/copy Landing |
| apps/studio/src/features/Dashboard.tsx | Sí, después de F6 template | Combinar Store + Landing mediante view-model discriminado; managed Landing lista desde `landings/` |
| apps/studio/src/lib/repository.ts Store | No cambiar schema/DB por Landing | Mantener repositorio Store aislado |
| LandingRepositoryV1 nuevo | Sí en F4 | managed authority `landings/`; browser fallback `solara-landing-studio` separado |
| apps/studio/src/lib/projectArchive.ts | No forzar Landing al formato Store | Archive Landing propio `solara-landing-project` v1 |
| ManagedPersistenceControls.tsx | Posible | Reusar UI/helpers neutrales, no tipos Store |
| apps/studio/src/workers/export.worker.ts | Después del slice | transportar discriminante/payload tipado sólo cuando export Landing exista; no universalizar el worker en F2 |
| CSV worker | Guard explícito | Rechazar Landing de forma testeada |
| agent-control / agent-contracts | Guard explícito en V1 | Landing se rechaza hasta tener contrato propio |
| persistencia/export filesystem | Sí | raíz hermana `landings/`, endpoints loopback separados y manifest Landing propio; `proyectos/` Store intacto |
| tests/e2e | Sí, focal | No reescribir tests Store |
| docs DATA_MODEL/ARCHITECTURE | Desde F1/F4 | Documentar contratos persistidos cuando nacen, no sólo al cierre |

---

## 16. Amenazas acumuladas convertidas en gates

| # | Amenaza | Cobertura |
| ---: | --- | --- |
| 1 | schema invalida proyectos | F0/F1, schema intocable |
| 2 | serialización cambia | hash F0 |
| 3 | round-trip cambia | F0/F4 |
| 4 | schemaVersion cambia | invariant |
| 5 | V1/V2 deriva | schema tests |
| 6 | fixtures cambian | prohibición |
| 7 | Predeterminado cambia | F7 |
| 8 | Nueva tienda hereda Landing | F7 |
| 9 | duplicación cruza kinds | F4d/F7 |
| 10 | backups viejos fallan | F4 |
| 11 | manifest incompatible | F4 |
| 12 | colisión en proyectos | F4 |
| 13 | restore pierde kind | F4 |
| 14 | RecoveryDraft cruza kind | F4 |
| 15 | dashboard asume catálogo | F7 |
| 16 | selección equivocada | F7 |
| 17 | protegido se muta | F7 |
| 18 | agente opera catálogo Landing | F5 guard explícito hasta contrato |
| 19 | readiness exige catálogo | F5/site-optimizer guard |
| 20 | production gate bloquea Landing | F3e/F8 |
| 21 | exporter genera ecommerce | F3e |
| 22 | sitemap contiene ecommerce | F3e |
| 23 | canonical vacío o malformado | F1/F3e |
| 24 | Product JSON-LD en Landing | F3e |
| 25 | Merchant vacío | F3e |
| 26 | AI context dice ecommerce | F3e/F8 |
| 27 | robots incorrecto | F3e |
| 28 | header conserva catálogo | F2 audit + F3b/F5 |
| 29 | footer conserva ecommerce | F2 audit + F3b/F5 |
| 30 | CTA/nav enlaza una sección inexistente | F1/F3b1 |
| 31 | runtime inicia carrito | F3e |
| 32 | runtime features incorrectas | F3e |
| 33 | JS busca nodos ausentes | F3d/F3e |
| 34 | sin JS queda vacío | F3e |
| 35 | contacto y checkout WhatsApp se mezclan | F1/F3c |
| 36 | búsqueda sobre catálogo vacío | F1/F2 |
| 37 | filtros se inicializan | F1/F2 |
| 38 | CSS ecommerce infla Landing | F3e/F8 budgets |
| 39 | budgets empeoran | F3e/F8 |
| 40 | assets se pierden | F3e manifest/media |
| 41 | tabs Studio rompen navegación | F5 |
| 42 | Preparar exige catálogo | F5 |
| 43 | Avanzado expone controles inválidos | F5 |
| 44 | Builder asume Store | F2 audit + F5c |
| 45 | undo/redo mezcla estados | F5 History genérico |
| 46 | Preview retiene ecommerce | F3 |
| 47 | export worker asume Store | F3/F8 |
| 48 | CSV toca Landing | invariant de routing |
| 49 | E2E global depende de Productos | F5/F7 + F0 |
| 50 | snapshots/hashes cambian | F0 después de cada fase |
| 51 | `ModuleRenderContext` obliga a `StoreProjectV1` | F2a lo clasifica STORE-OPAQUE; no generalizar en F2/F3 |
| 52 | `StoreSection` se convierte en unión universal y rompe modules | prohibición F2; LandingSection separado |
| 53 | `exportProject` se vuelve unión Store/Landing y ramifica todo el exporter | mantener entrypoint Store; orquestador Landing mínimo |
| 54 | `renderPreviewHtml` obliga casts Landing->Store | Preview Landing llama al Landing render boundary |
| 55 | App/Studio active state se generaliza de golpe y rompe flujos Store | F5 adapta shell por frontera, no App entero en F2 |
| 56 | una extracción "neutral" sigue importando Product/Category/commerceTemplates | test arquitectónico del boundary |
| 57 | localhost usa un renderer simple y luego Preview/export requieren otro | canonical parity + misma implementación de section renderer |
| 58 | obsesión por reutilizar código causa más cambios que una primitive Landing mínima | prueba de reutilización + STOP si extracción es transversal |
| 59 | Landing queda sólo en IndexedDB y diverge de la autoridad real | F4 managed authority `landings/` + browser fallback explícito |
| 60 | `proyectos/landings/` aparece como Store corrupta en readers viejos | raíz hermana `landings/` + downgrade test F4 |
| 61 | Dashboard crea desde template aún no congelado | F6 template antes de F7 Dashboard |
| 62 | identity/navigation/contact se duplican en secciones | ownership F1 + tests F3c/F6 |
| 63 | renderer cambia markup según localhost/Preview/export | renderer puro sin `mode` + wrappers F2/F3 |
| 64 | se agregan varias rutas antes de validar el MVP | multipágina explícitamente fuera de V1; decisión/migración posterior requerida |
| 65 | production descubre tarde problemas de file graph | production in-memory obligatorio F3e antes de F4 |
| 66 | family futura vuelve ilegible un proyecto en reader anterior | `OpaqueLandingSectionV1` definido/testeado en F1 antes de F4 |

---

## 17. Política de rollback

### Unidad

Una unidad funcional verificable = un commit.

F0-F3 pueden coincidir con una fase por commit. F4 se divide explícitamente en F4a/F4b/F4c/F4d para no mezclar storage, recovery y archive en un único cambio.

No combinar dos fronteras grandes en un commit.

### Rollback normal

~~~powershell
git revert <commit-de-la-fase>
<gate focal explícito de la unidad revertida>
corepack pnpm check:micro
~~~

Después, reejecutar F0. No confiar únicamente en selección "affected" si el revert deja el working tree limpio y el selector podría no detectar el alcance.

### Persistencia

Nunca usar como rollback:

~~~text
rm -rf proyectos
git reset --hard sobre trabajo compartido
sobrescribir manifests reales
~~~

Todos los tests destructivos trabajan en temp dirs.

Desde F4, rollback correcto significa dos propiedades simultáneas:

~~~text
código anterior vuelve a funcionar
AND
datos Store anteriores siguen abriendo sin ver/migrar Landing
~~~

No se exige que una versión vieja entienda features Landing futuras. Sí se exige que las ignore de forma segura y que no destruya sus datos.

Para variants persistidas, usar la política de fallback no destructivo definida en F1; eliminar soporte de un `variantId` conocido no puede depender de borrar o reescribir proyectos reales.

---

## 18. Señales de catástrofe: STOP inmediato

Detener y revertir la fase si ocurre cualquiera:

1. hay que modificar StoreProjectV2Schema;
2. hay que actualizar tests Store porque ahora funciona distinto;
3. aparece un segundo Studio/Preview/runtime;
4. una fase toca persistencia + exporter + dashboard + editor a la vez;
5. hay que migrar Stores para soportar Landing;
6. aparece una abstracción sin contrato concreto, evidencia de reutilización o test de frontera;
7. se mueve código Store sólo por limpieza;
8. el cambio no tiene una sola responsabilidad explicable;
9. se debilita F0 para hacerlo verde;
10. se desactiva un gate;
11. localhost, Preview y export necesitan `LandingRenderModel` o Landing render boundaries diferentes para el mismo contenido;
12. rollback exige tocar datos reales.
13. aparece un cast `LandingProjectV1 as StoreProjectV1` o campos ecommerce ficticios para satisfacer tipos.
14. Landing obliga a subir/modificar la DB/version de persistencia Store.
15. leer una variant desconocida destruye `variantId` o `content` en vez de aplicar fallback no destructivo.
16. el primer Hero requiere cambiar las firmas de `StoreSection`, `ModuleRenderContext`, `exportProject` o `renderPreviewHtml`.
17. una primitive declarada neutral importa tipos Store-only.
18. se transforma `App.tsx` o el exporter entero a una unión Store/Landing antes de tener el vertical slice in-memory.
19. la cantidad de archivos Store tocados para una primitive Landing simple supera la frontera mínima justificada por call sites reales.
20. una Landing administrada se confirma sólo en IndexedDB sin snapshot autoritativo en `landings/`.
21. se coloca storage Landing dentro de `proyectos/` y por eso un reader Store viejo puede recorrerlo.
22. Dashboard puede crear una Landing antes de que exista la factory/template F6 validada.
23. Header/Footer/CTA persisten copias de identity/navigation/contact que pueden divergir.
24. un section renderer contiene branches por localhost/Preview/export.
25. se persiste una Landing antes de haber probado production export in-memory.

Respuesta obligatoria:

~~~text
STOP -> revertir fase -> revisar diseño -> no parchear encima
~~~

---

## 19. Definición de Landing V2 mínima terminada

Debe funcionar:

~~~text
Nueva landing
-> crear `LandingProjectV1` válido
-> crear desde la única factory/template F6
-> editar identidad/secciones/theme/assets/SEO
-> editar una composición wireframe con una variante por familia
-> verla en localhost con refresh F5 usando el mismo LandingRenderModel de Preview/export
-> preview Mobile/Tablet/Desktop
-> guardar
-> en launcher confirmar snapshot autoritativo bajo `landings/`
-> cerrar
-> reabrir
-> recovery
-> export draft
-> export production
-> production rechaza `baseUrl` vacío y cualquier `OpaqueLandingSectionV1` activa
-> abrir sin JS
-> sitemap válido
-> backup
-> restore
-> downgrade de código sin romper Store ni borrar Landing
~~~

Y simultáneamente:

~~~text
0 rutas ecommerce
0 Merchant
0 Product JSON-LD
0 catálogo
0 carrito
0 checkout
0 búsqueda de catálogo
0 regresiones Store detectadas por F0 + gates focales
~~~

---

## 20. Compatibilidad Store final

No alcanza con “todos los tests pasan”.

Debe cumplirse:

~~~text
Store schema        = igual
Store serialization = igual
Store file graph    = igual
Store export hashes = igual
Store runtime flags = igual
Store Preview       = igual
Store recovery      = igual
Predeterminado      = igual
~~~

---

## 21. Orden exacto

~~~text
PRE-0  base segura/aislada, sin limpiar cambios concurrentes
  |
F0     oráculo Store
  |
F1     LandingProjectV1 de una página + secciones + ManagedProject
  |
F2a    discovery read-only de frontera real de render
F2b    LandingRenderModel + Hero 01 + boundary mínimo
       + primitives compartidas sólo con prueba de reutilización
  |
F3a    Hero 01 en localhost (DEV)
GO-LAB usuario confirma localhost/F5 y wireframe inicial
F3b1   IDs de sección + navegación por anclas
F3b2   shell + Header/Footer
F3c1   Benefits 01
F3c2   Media 01
F3c3   CTA 01
F3c4   Announcement opcional, sólo si es necesaria
F3d1   Preview
F3d2   responsive + aceptación visual explícita del usuario
GO     usuario decide si sigue después de ver el wireframe
F3e1   production in-memory: documento/assets + seguridad
F3e2   SEO + allowlist/file graph de una página
F3e3   draft/production + determinismo/paridad
  |
F4a    storage administrado raíz hermana `landings/` + CAS
F4b    IndexedDB Landing separado + recovery/reconciliación
F4c    archive/backup/restore + downgrade
F4d    acciones secundarias sólo si hacen falta
  |
F5a    frontera de sesión -> mismo StudioShell
F5b    History genérico mínimo
F5c    Canvas texto/reorder
F5d    Assets/Theme/SEO/navigation
F5e    guards + Guardar/Preview/Export
  |
F6     congelar factory/template V1 aceptado
  |
F7     Dashboard crea/lista/abre Landing desde F6
  |
F8a    editar/guardar/cerrar/reabrir desde repositorios F4
F8b    production persistido + backup/restore integrado
  |
F10    gates completos + documentación; fin de V1
  |
post-V1 opt-in: multipágina/rutas y F9 variants/families adicionales
~~~

No saltar fases.

No empezar una fase roja.

No dejar fases a medias. Features explícitamente fuera de V1 se registran como backlog post-V1 y no bloquean el cierre.

---

## 22. Arquitectura final esperada

~~~text
SolaraCommerce
|
+-- StoreProjectV2                    contrato actual intacto
|
+-- LandingProjectV1                  contrato Landing propio, sin ecommerce ficticio
|
+-- ManagedProject                    unión de orquestación, no migración de Store
|   +-- { kind: store, project: StoreProjectV2 }
|   +-- { kind: landing, project: LandingProjectV1 }
|
+-- Storage
|   +-- Store managed authority       proyectos/ + DB Store actual intactos
|   +-- Landing managed authority     landings/ + loopback Landing separado
|   +-- Landing browser fallback      solara-landing-studio v1 separado
|
+-- Adapters / Render projection
|   +-- renderer Store actual         opaco/intacto salvo extracción pura demostrada
|   +-- toLandingRenderModel()
|   +-- policy/runtime features derivadas, no persistidas
|
+-- Landing render boundary
|   +-- family content schemas
|   +-- OpaqueLandingSectionV1 para forward compatibility
|   +-- variant registry + fallback 01
|   +-- section renderers puros, sin tipos Store ni `mode`
|   +-- theme/assets/SEO/navigation primitives neutrales cuando existan
|   +-- primitives Landing mínimas cuando Store no pueda extraerse sin rework
|   +-- misma implementación entre localhost/Preview/export Landing
|
+-- Public documents
|   +-- Store page graph              comportamiento actual
|   +-- Landing single document      contenido sin ecommerce
|
+-- Studio
|   +-- mismo shell
|   +-- adapter de sesión Landing sin universalizar App entero
|   +-- History snapshot algorithm reutilizado mediante generalización mínima
|   +-- Canvas/bindings Landing neutrales
|   +-- guards explícitos para consumidores Store-only
|
+-- Template factory
|   +-- una única factory V1 derivada del fixture F3c validado
|
+-- Dashboard
    +-- combina Store + Landing mediante view-model `{kind,id}`
~~~

No existe una extracción masiva llamada "Shared Visual Engine" como prerequisito. Cada primitive se comparte sólo después de demostrar que es neutral con call sites Store/Landing, test focal y F0. Si esa demostración exige generalizar una jerarquía Store completa, la primitive no se comparte en Landing V1.

---

## 23. Primera acción cuando se autorice implementación

La primera acción no será crear Landing. Será completar PRE-0 para fijar el checkout/worktree seguro y el commit base aceptado. Sólo si pasa, ejecutar F0:

> fijar un oráculo reproducible del Store actual y demostrar que produce resultados idénticos en ejecuciones consecutivas.

Hasta que F0 no sea verde y estable, ninguna línea de comportamiento Landing entra al producto.

La segunda acción después de F0 es F1: definir y testear `LandingProjectV1`. No se crea el laboratorio localhost antes de que ese contrato exista. En el estado actual, PRE-0/F0 no están ejecutados y el wireframe no tiene aceptación registrada.
