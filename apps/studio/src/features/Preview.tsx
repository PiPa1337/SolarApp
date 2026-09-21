/**
 * Preview del storefront. Renderiza HTML mediante el mismo exporter que genera
 * el sitio público y sólo hidrata assets del iframe por postMessage; no debe
 * convertirse en una segunda implementación visual.
 */
import {
  Desktop,
  DeviceMobile,
  DeviceTablet,
  EyeSlash,
  SidebarSimple,
} from "@phosphor-icons/react";
import { getModuleDefinition } from "@solara/modules";
import type { ImageAsset, StoreProjectV1 } from "@solara/project-schema";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ImageUploadButton } from "../components/ImageAssetPicker";
import { Tooltip } from "../components/primitives";
import { Button, IconButton } from "../components/Ui";
import { type PreviewWorkerResult, renderPreviewInWorker } from "../lib/workers";
import {
  type CanvasManifestEntryLike,
  canvasBridgeScript,
  makeCanvasNonce,
  parseCanvasMessage,
  type ValidatedSelection,
  validateCanvasSelection,
} from "./canvas/canvasBridge";

export type PreviewSize = "desktop" | "tablet" | "mobile";
export type PreviewZoom = 100 | 75 | 50;
export type PreviewRoute = { path: string; label: string };

const ZOOM_OPTIONS: Array<{ value: PreviewZoom; label: string }> = [
  { value: 100, label: "100%" },
  { value: 75, label: "75%" },
  { value: 50, label: "50%" },
];

const PREVIEW_SCROLLBAR_STYLE = `<style data-solara-preview-scrollbar>
html,
body {
  --solara-preview-scrollbar-policy: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
</style>`;

export const PREVIEW_PERF_STYLE = `<style data-solara-preview-perf>
html { scroll-behavior: auto !important; }
/* Los drawers son overlays: no deben quedar atrapados en paint containment.
   Los headers también: sus dropdowns de navegación cuelgan fuera de la caja
   del módulo y el menú móvil del catálogo es position: fixed. */
[data-solara-module]:not([data-solara-module="catalog-cart-drawer"]):not([data-solara-module="cart-drawer"]):not([data-solara-module="catalog-header"]):not([data-solara-module="editorial-header"]),
.catalog-hero, .catalog-category-bento, .catalog-product-grid {
  contain: layout paint;
  content-visibility: auto;
  contain-intrinsic-size: 600px 400px;
}
img, video { content-visibility: auto; contain-intrinsic-size: 300px 200px; }
/* Los assets viajan por postMessage: deferPreviewAssetMarkup deja el <img>
   sin src hasta hidratar. Ocultarlo reserva la caja (width/height) sin mostrar
   icono roto ni alt gigante en el primer frame; al poner src se revela solo. */
img[data-solara-preview-src]:not([src]) { visibility: hidden; }
</style>`;

const PREVIEW_PERF_SCRIPT = `<script data-solara-preview-perf>
(() => {
  try {
    const raf = window.requestAnimationFrame;
    let last = 0;
    window.requestAnimationFrame = (cb) => raf.call(window, (t) => {
      if (t - last < 7) return raf.call(window, cb);
      last = t;
      cb(t);
    });
  } catch {}
})();
</script>`;

function addPreviewScrollbarPolicy(document: string): string {
  const headEnd = document.indexOf("</head>");
  if (headEnd === -1)
    return `${PREVIEW_SCROLLBAR_STYLE}${PREVIEW_PERF_STYLE}${PREVIEW_PERF_SCRIPT}${document}`;
  return `${document.slice(0, headEnd)}${PREVIEW_SCROLLBAR_STYLE}\n${PREVIEW_PERF_STYLE}\n${PREVIEW_PERF_SCRIPT}\n${document.slice(headEnd)}`;
}

function readPreviewCartState(storeId: string): string {
  const parse = (serialized: string | null): string | undefined => {
    if (serialized === null) return undefined;
    try {
      const parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed)) return undefined;
      const validLine = parsed.some((line) => {
        if (!line || typeof line !== "object") return false;
        const value = line as Record<string, unknown>;
        return (
          typeof value.variantId === "string" &&
          value.variantId.length > 0 &&
          typeof value.title === "string" &&
          typeof value.variantTitle === "string" &&
          typeof value.sku === "string" &&
          typeof value.unitPrice === "number" &&
          Number.isFinite(value.unitPrice) &&
          typeof value.quantity === "number" &&
          Number.isFinite(value.quantity) &&
          value.quantity >= 1 &&
          value.quantity <= 99
        );
      });
      return parsed.length === 0 || validLine ? serialized : undefined;
    } catch {
      return undefined;
    }
  };
  try {
    const key = `solara-cart:${storeId}`;
    const stored = parse(window.localStorage.getItem(key));
    const backup = parse(window.localStorage.getItem(`${key}:backup`));
    if (stored !== undefined && JSON.parse(stored).length > 0) return stored;
    return backup ?? stored ?? "[]";
  } catch {}
  return "[]";
}

function addPreviewCartState(
  document: string,
  storeId: string,
  sessionId: string,
  serialized = readPreviewCartState(storeId),
): string {
  const element = `<script id="solara-preview-cart" data-session="${sessionId}" data-key="solara-cart:${storeId}" data-hydrated="true" type="application/json">${serialized.replace(/</g, "\\u003c")}</script>`;
  const headEnd = document.indexOf("</head>");
  if (headEnd === -1) return `${element}${document}`;
  return `${document.slice(0, headEnd)}${element}\n${document.slice(headEnd)}`;
}

export function addPreviewNavigationBridge(document: string): string {
  const bridge = `<script data-solara-preview-navigation>
(() => {
  const state = document.getElementById("solara-preview-cart");
  const session = state?.dataset.session ?? "";
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    if (anchor.hasAttribute("data-open-cart")) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/#")) return;
    event.preventDefault();
    if (state) {
      parent.postMessage({
        type: "solara-preview-cart-snapshot",
        key: state.dataset.key ?? "",
        value: state.textContent ?? "[]",
        session,
      }, "*");
    }
    parent.postMessage({ type: "solara-preview-navigate", path: href, session }, "*");
  }, true);
})();
</script>`;
  const bodyEnd = document.indexOf("</body>");
  if (bodyEnd === -1) return `${document}${bridge}`;
  return `${document.slice(0, bodyEnd)}${bridge}\n${document.slice(bodyEnd)}`;
}

/** Inyecta el bridge del Live Canvas con la sesión y el nonce del render. */
function addPreviewCanvasBridge(document: string, session: string, nonce: string): string {
  const script = canvasBridgeScript(session, nonce);
  const bodyEnd = document.indexOf("</body>");
  if (bodyEnd === -1) return `${document}${script}`;
  return `${document.slice(0, bodyEnd)}${script}\n${document.slice(bodyEnd)}`;
}

/**
 * La vista previa transporta los assets por postMessage y nunca resuelve el
 * dominio del proyecto; el exporter emite el preload LCP absoluto sólo en
 * modo producción, por lo que el iframe del preview no dispara peticiones
 * reales a la URL pública del sitio.
 */
export function getPreviewRoutes(project: StoreProjectV1): PreviewRoute[] {
  const firstRoot = project.categories.find((category) => category.parentId === undefined);
  const firstChild = project.categories.find((category) => category.parentId !== undefined);
  const paginatedCategory = project.categories.find(
    (category) => category.productIds.length > project.commerceTemplates.category.productsPerPage,
  );
  const firstProduct = project.products[0];
  const lastProduct = project.products.at(-1);
  return [
    { path: "/", label: "Home" },
    { path: "/listado/", label: project.publicCopy.productList.title },
    ...(firstRoot
      ? [{ path: `/categorias/${firstRoot.slug}/`, label: `Categor\u00eda: ${firstRoot.title}` }]
      : []),
    ...(firstChild
      ? [
          {
            path: `/categorias/${firstChild.slug}/`,
            label: `Subcategor\u00eda: ${firstChild.title}`,
          },
        ]
      : []),
    ...(paginatedCategory
      ? [
          {
            path: `/categorias/${paginatedCategory.slug}/pagina/2/`,
            label: `Categor\u00eda p\u00e1gina 2: ${paginatedCategory.title}`,
          },
        ]
      : []),
    ...(firstProduct ? [{ path: `/productos/${firstProduct.slug}/`, label: "Producto" }] : []),
    ...(lastProduct && lastProduct.id !== firstProduct?.id
      ? [{ path: `/productos/${lastProduct.slug}/`, label: "Producto final" }]
      : []),
    ...(project.commerceTemplates.search.enabled ? [{ path: "/buscar/", label: "Buscar" }] : []),
    ...(project.commerceTemplates.cart.enabled ? [{ path: "/carrito/", label: "Carrito" }] : []),
  ];
}

export function PreviewToolbar({
  routes,
  route,
  size,
  zoom,
  desktopDisabled = false,
  onRouteChange,
  onSizeChange,
  onZoomChange,
  onOpenEditor,
}: {
  routes: PreviewRoute[];
  route: string;
  size: PreviewSize;
  zoom: PreviewZoom;
  desktopDisabled?: boolean;
  onRouteChange(route: string): void;
  onSizeChange(size: PreviewSize): void;
  onZoomChange(zoom: PreviewZoom): void;
  onOpenEditor(): void;
}) {
  const routeListId = useId();
  const [routeDraft, setRouteDraft] = useState(route);
  useEffect(() => {
    setRouteDraft(route);
  }, [route]);

  const commitRoute = useCallback(() => {
    const next = routeDraft.trim();
    if (!next) {
      setRouteDraft(route);
      return;
    }
    if (next !== route) onRouteChange(next);
  }, [onRouteChange, route, routeDraft]);

  return (
    <div className="preview-toolbar">
      <div className="preview-heading">
        <Tooltip tip="Abrir panel de edición" position="bottom">
          <IconButton
            icon={SidebarSimple}
            label={"Abrir panel de edici\u00f3n"}
            onClick={onOpenEditor}
          />
        </Tooltip>
        <strong>Vista previa</strong>
      </div>
      <output
        className="preview-route-announce visually-hidden"
        aria-live="polite"
        data-testid="ui-preview-route-announce"
      >
        {`Vista previa: ${route}`}
      </output>
      <label className="preview-route">
        <span className="visually-hidden">Ruta de vista previa</span>
        <input
          data-testid="ui-preview-route"
          type="text"
          list={routeListId}
          aria-label="Ruta de vista previa"
          autoComplete="off"
          spellCheck={false}
          value={routeDraft}
          onChange={(event) => setRouteDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitRoute();
          }}
          onBlur={commitRoute}
        />
      </label>
      <datalist id={routeListId}>
        {routes.map((item) => (
          <option key={item.path} value={item.path}>
            {item.label}
          </option>
        ))}
      </datalist>
      <fieldset className="preview-zoom">
        <legend className="visually-hidden">{"Zoom de vista previa"}</legend>
        {ZOOM_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="preview-zoom__button"
            aria-pressed={zoom === option.value}
            onClick={() => onZoomChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      <fieldset className="preview-sizes">
        <legend className="visually-hidden">{"Tama\u00f1o de vista previa"}</legend>
        <Tooltip
          tip={
            desktopDisabled
              ? "Vista de escritorio no disponible mientras el panel está abierto"
              : "Vista de escritorio"
          }
          position="bottom"
        >
          <IconButton
            icon={Desktop}
            label="Vista de escritorio"
            aria-pressed={size === "desktop"}
            disabled={desktopDisabled}
            onClick={() => onSizeChange("desktop")}
          />
        </Tooltip>
        <Tooltip tip="Vista de tablet" position="bottom">
          <IconButton
            icon={DeviceTablet}
            label="Vista de tablet"
            aria-pressed={size === "tablet"}
            onClick={() => onSizeChange("tablet")}
          />
        </Tooltip>
        <Tooltip tip="Vista móvil" position="bottom">
          <IconButton
            icon={DeviceMobile}
            label={"Vista m\u00f3vil"}
            aria-pressed={size === "mobile"}
            onClick={() => onSizeChange("mobile")}
          />
        </Tooltip>
      </fieldset>
    </div>
  );
}

export function Preview({
  project,
  route,
  size,
  zoom,
  canvasMode = false,
  onCanvasModeChange,
  onRouteChange,
  onCanvasEdit,
  onCanvasItemEdit,
  onCanvasEntityEdit,
  onCanvasImageUpload,
}: {
  project: StoreProjectV1;
  route: string;
  size: PreviewSize;
  zoom: PreviewZoom;
  canvasMode?: boolean;
  onCanvasModeChange?(next: boolean): void;
  onRouteChange(route: string): void;
  /** Aplica section.field.update por el núcleo único de mutaciones. */
  onCanvasEdit?(sectionId: string, fieldKey: string, value: unknown): void;
  /** Aplica section.repeater.item.update para bindings de repeater. */
  onCanvasItemEdit?(sectionId: string, fieldKey: string, itemId: string, value: unknown): void;
  /** Aplica una mutación tipada sobre una entidad real del proyecto. */
  onCanvasEntityEdit?(sourceKind: string, entityId: string, field: string, value: unknown): void;
  onCanvasImageUpload?(
    asset: ImageAsset,
    target: {
      sectionId: string;
      fieldKey: string;
      itemId?: string;
      sourceKind?: string;
      entityId?: string;
      entityField?: string;
    },
  ): void;
}) {
  const [html, setHtml] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => setAvailableWidth(stage.clientWidth));
    observer.observe(stage);
    setAvailableWidth(stage.clientWidth);
    return () => observer.disconnect();
  }, []);
  const deviceWidth = size === "tablet" ? 768 : size === "mobile" ? 390 : null;
  // Fit the actual device viewport instead of shrinking Tablet into a mobile layout.
  const deviceZoom =
    deviceWidth && availableWidth > 0
      ? Math.min(zoom / 100, availableWidth / deviceWidth)
      : zoom / 100;
  const [error, setError] = useState("");
  const [renderToken, setRenderToken] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  const [htmlSession, setHtmlSession] = useState("");
  const previewAssetSources = useRef<ReadonlyMap<string, string>>(new Map());
  const previewCacheRef = useRef<
    Array<{ project: StoreProjectV1; route: string; result: PreviewWorkerResult }>
  >([]);
  const previewFrameWindows = useRef<Window[]>([]);
  const previewRenderSessionRef = useRef(0);
  const activePreviewSessionRef = useRef("");
  const previewCartStateRef = useRef<{ key: string; serialized: string } | null>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const previewObserver = useRef<IntersectionObserver | null>(null);
  const pausedRef = useRef(false);
  const intersectingRef = useRef(true);
  const visibleRef = useRef(!document.hidden);
  const canvasNonceRef = useRef("");
  const canvasManifestRef = useRef<Array<CanvasManifestEntryLike & { itemFieldKey?: string }>>([]);
  const [canvasSelection, setCanvasSelection] = useState<ValidatedSelection | null>(null);
  const canvasValueId = useId();
  const previewSandbox =
    typeof window !== "undefined" && window.location.protocol === "solara:"
      ? "allow-forms allow-scripts allow-same-origin"
      : "allow-forms allow-scripts";

  /**
   * Contrato con el runtime del storefront (Task A4): un postMessage
   * { type: "solara-pause" } detiene observadores, animaciones y scroll-work;
   * { type: "solara-resume" } los reanuda. El preview pausa cuando la pestaña
   * está oculta o el iframe queda fuera de viewport.
   */
  const setPaused = useCallback((paused: boolean) => {
    if (paused === pausedRef.current) return;
    pausedRef.current = paused;
    previewFrame.current?.contentWindow?.postMessage(
      { type: paused ? "solara-pause" : "solara-resume" },
      "*",
    );
  }, []);

  const evaluatePause = useCallback(() => {
    setPaused(!visibleRef.current || !intersectingRef.current);
  }, [setPaused]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      visibleRef.current = !document.hidden;
      evaluatePause();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [evaluatePause]);

  /* El observer sigue al iframe (condicional según html/error): al montar el
     nodo observa, al desmontar desconecta y limpia la referencia. */
  const attachPreviewObserver = useCallback(
    (node: HTMLIFrameElement | null) => {
      previewObserver.current?.disconnect();
      previewObserver.current = null;
      previewFrame.current = node;
      if (!node) return;
      if (node.contentWindow) {
        previewFrameWindows.current = [
          ...previewFrameWindows.current.slice(-2),
          node.contentWindow,
        ];
      }
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          intersectingRef.current = entry.isIntersecting;
          evaluatePause();
        }
      });
      observer.observe(node);
      previewObserver.current = observer;
    },
    [evaluatePause],
  );

  useEffect(() => {
    return () => {
      previewFrame.current?.contentWindow?.postMessage({ type: "solara-pause" }, "*");
    };
  }, []);

  useEffect(() => {
    const handlePreviewAssetRequest = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; paths?: unknown };
      const cartMessage = event.data as {
        type?: unknown;
        key?: unknown;
        value?: unknown;
        session?: unknown;
      };
      const navigationMessage = event.data as {
        type?: unknown;
        path?: unknown;
        session?: unknown;
      };
      if (
        navigationMessage.type === "solara-preview-navigate" &&
        typeof navigationMessage.path === "string" &&
        navigationMessage.path.startsWith("/") &&
        !navigationMessage.path.startsWith("//") &&
        navigationMessage.session === activePreviewSessionRef.current
      ) {
        if (!event.source || !previewFrameWindows.current.includes(event.source as Window)) return;
        onRouteChange(navigationMessage.path);
        return;
      }
      if (
        (cartMessage.type === "solara-preview-cart-write" ||
          cartMessage.type === "solara-preview-cart-snapshot") &&
        typeof cartMessage.key === "string" &&
        cartMessage.key === `solara-cart:${project.id}` &&
        cartMessage.session === activePreviewSessionRef.current
      ) {
        if (event.source !== previewFrame.current?.contentWindow) return;
        const serialized = typeof cartMessage.value === "string" ? cartMessage.value : "[]";
        const cleared = cartMessage.type === "solara-preview-cart-write";
        try {
          const parsed = JSON.parse(serialized);
          if (!Array.isArray(parsed) || (!cleared && parsed.length === 0)) return;
          previewCartStateRef.current = { key: cartMessage.key, serialized };
        } catch {
          return;
        }
        try {
          window.localStorage.setItem(cartMessage.key, serialized);
          window.localStorage.setItem(`${cartMessage.key}:backup`, serialized);
        } catch {}
        return;
      }
      if (!event.source || !previewFrameWindows.current.includes(event.source as Window)) return;
      if (message.type !== "solara-preview-assets-request" || !Array.isArray(message.paths)) return;
      const sources: Record<string, string> = {};
      message.paths.forEach((path) => {
        if (typeof path !== "string") return;
        const source = previewAssetSources.current.get(path);
        if (source) sources[path] = source;
      });
      (event.source as Window).postMessage(
        { type: "solara-preview-assets-response", sources },
        "*",
      );
    };
    window.addEventListener("message", handlePreviewAssetRequest);
    return () => window.removeEventListener("message", handlePreviewAssetRequest);
  }, [onRouteChange, project.id]);

  // Listener del Live Canvas: valida sesión + nonce + manifest antes de fijar
  // la selección. Un mensaje spoofed desde otra ventana se rechaza por
  // event.source y por sesión/nonce.
  useEffect(() => {
    const handleCanvasSelect = (event: MessageEvent<unknown>) => {
      if (event.source !== previewFrame.current?.contentWindow) return;
      const message = parseCanvasMessage(event.data);
      if (!message) return;
      const pendingNonces = new Set(canvasNonceRef.current ? [canvasNonceRef.current] : []);
      const valid = validateCanvasSelection(message, {
        activeSession: activePreviewSessionRef.current,
        manifestEntries: canvasManifestRef.current,
        pendingNonces,
        consumeNonce: (nonce) => {
          if (nonce === canvasNonceRef.current) canvasNonceRef.current = "";
        },
      });
      if (valid) {
        // El iframe conserva el bridge durante toda la edición. Rotamos el
        // nonce después de cada selección para mantener anti-replay sin
        // limitar a un solo clic editable por render.
        const nextNonce = makeCanvasNonce();
        canvasNonceRef.current = nextNonce;
        previewFrame.current?.contentWindow?.postMessage(
          { type: "solara-canvas-nonce", nonce: nextNonce },
          "*",
        );
        setCanvasSelection(valid);
      }
    };
    window.addEventListener("message", handleCanvasSelect);
    return () => window.removeEventListener("message", handleCanvasSelect);
  }, []);

  // El estado del popover es específico de la ruta, aunque route sólo se usa
  // como disparador del reset intencional.
  // biome-ignore lint/correctness/useExhaustiveDependencies: route changes must clear the active canvas target
  useEffect(() => {
    setCanvasSelection(null);
    onCanvasModeChange?.(false);
  }, [route, onCanvasModeChange]);

  // Datos actuales del binding seleccionado: el textarea arranca con el valor
  // real del proyecto para que cancelar restaure exactamente lo anterior.
  const manifestEntry =
    canvasSelection === null
      ? undefined
      : canvasManifestRef.current.find((entry) => entry.editId === canvasSelection.editId);
  // El binding seleccionado puede ser imagen: el popover cambia a selector.
  const isImageSelection = manifestEntry?.kind === "image";
  const manifestFieldKey = manifestEntry?.fieldKey ?? "";
  const manifestValue =
    canvasSelection === null || manifestFieldKey === ""
      ? ""
      : (() => {
          const selectedSection = [
            ...project.sections,
            ...project.pages.flatMap((page) => page.sections),
          ].find((section) => section.id === canvasSelection.sectionId);
          const settings = selectedSection
            ? (getModuleDefinition(selectedSection.moduleId)?.settingsSchema.parse(
                selectedSection.settings,
              ) as Record<string, unknown>)
            : undefined;
          const current = settings?.[manifestFieldKey];
          if (canvasSelection.itemId !== undefined && manifestEntry?.itemFieldKey) {
            const item = Array.isArray(current)
              ? current.find(
                  (candidate) =>
                    typeof candidate === "object" &&
                    candidate !== null &&
                    (candidate as { id?: unknown }).id === canvasSelection.itemId,
                )
              : undefined;
            return String(
              item && typeof item === "object"
                ? ((item as Record<string, unknown>)[manifestEntry.itemFieldKey] ?? "")
                : "",
            );
          }
          if (manifestEntry?.sourceKind && manifestEntry.entityId) {
            const field = manifestEntry.entityField ?? manifestFieldKey;
            let value: unknown;
            switch (manifestEntry.sourceKind) {
              case "identity":
                value = (project.identity as Record<string, unknown>)[field];
                break;
              case "product": {
                const entity = project.products.find((item) => item.id === manifestEntry.entityId);
                value = entity ? (entity as Record<string, unknown>)[field] : "";
                if (field === "price" && entity) value = entity.variants[0]?.price ?? "";
                break;
              }
              case "category": {
                const entity = project.categories.find(
                  (item) => item.id === manifestEntry.entityId,
                );
                value = entity ? (entity as Record<string, unknown>)[field] : "";
                break;
              }
              case "collection": {
                const entity = project.collections.find(
                  (item) => item.id === manifestEntry.entityId,
                );
                value = entity ? (entity as Record<string, unknown>)[field] : "";
                break;
              }
              case "asset": {
                const entity = project.assets.find((item) => item.id === manifestEntry.entityId);
                value = entity ? (entity as Record<string, unknown>)[field] : "";
                break;
              }
              case "public-copy": {
                const group = (project.publicCopy as Record<string, unknown>)[
                  manifestEntry.entityId
                ];
                value =
                  group && typeof group === "object"
                    ? (group as Record<string, unknown>)[field]
                    : "";
                break;
              }
              default:
                value = "";
            }
            return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
          }
          return String(current ?? "");
        })();

  // Reenvía el modo cuando el iframe termina de montarse; aunque el closure
  // no lea el contador, iframeReady es la señal que vuelve disponible el target.
  // biome-ignore lint/correctness/useExhaustiveDependencies: iframeReady retriggers the postMessage after iframe mount.
  useEffect(() => {
    const frameWindow = previewFrame.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage({ type: "solara-canvas-mode", enabled: canvasMode }, "*");
  }, [canvasMode, iframeReady]);

  // El render del sitio completo es caro: agrupa los cambios rápidos (typing,
  // sliders) en una sola regeneración por ráfaga. El debounce no retrasa la
  // edición (el estado siempre está al día) y el preview queda a 150ms del
  // último cambio, imperceptible al ojo.
  useEffect(() => {
    void renderToken;
    let active = true;
    const timer = window.setTimeout(() => {
      const previewSession = String(++previewRenderSessionRef.current);
      const cached = previewCacheRef.current.find(
        (entry) => entry.project === project && entry.route === route,
      );
      const renderPromise = cached
        ? Promise.resolve(cached.result)
        : renderPreviewInWorker(project, route, {
            assetTransport: "parent",
            editor: { enabled: true, sectionId: "*" },
          });
      void renderPromise
        .then(({ html: previewHtml, canvasManifest, assetSources }) => {
          if (!active) return;
          if (!cached) {
            const projectAssetSources = previewCacheRef.current.find(
              (entry) => entry.project === project,
            )?.result.assetSources;
            const stableAssetSources = projectAssetSources ?? assetSources;
            previewCacheRef.current = [
              ...previewCacheRef.current.filter(
                (entry) => entry.project === project && entry.route !== route,
              ),
              {
                project,
                route,
                result: { html: previewHtml, canvasManifest, assetSources: stableAssetSources },
              },
            ].slice(-2);
          }
          previewAssetSources.current = new Map(Object.entries(assetSources));
          activePreviewSessionRef.current = previewSession;
          setHtmlSession(previewSession);
          const cartKey = `solara-cart:${project.id}`;
          const serializedCart =
            previewCartStateRef.current?.key === cartKey
              ? previewCartStateRef.current.serialized
              : readPreviewCartState(project.id);
          canvasManifestRef.current = canvasManifest.entries.map((entry) => ({
            editId: entry.editId as string,
            sectionId: entry.sectionId as string,
            fieldKey: entry.fieldKey as string,
            kind: entry.kind as CanvasManifestEntryLike["kind"],
            ...(entry.itemFieldKey === undefined
              ? {}
              : { itemFieldKey: entry.itemFieldKey as string }),
            ...(entry.sourceKind === undefined ? {} : { sourceKind: entry.sourceKind as string }),
            ...(entry.entityId === undefined ? {} : { entityId: entry.entityId as string }),
            ...(entry.entityField === undefined
              ? {}
              : { entityField: entry.entityField as string }),
            ...(entry.label === undefined ? {} : { label: entry.label as string }),
            ...(entry.multiline === undefined ? {} : { multiline: entry.multiline as boolean }),
            ...(entry.maxLength === undefined ? {} : { maxLength: entry.maxLength as number }),
            ...(entry.itemIds === undefined ? {} : { itemIds: entry.itemIds as string[] }),
            ...(entry.moduleId === undefined ? {} : { moduleId: entry.moduleId as string }),
          })) as unknown as (CanvasManifestEntryLike & { itemFieldKey?: string })[];
          const nonce = makeCanvasNonce();
          canvasNonceRef.current = nonce;
          setHtml(
            addPreviewNavigationBridge(
              addPreviewCanvasBridge(
                addPreviewCartState(
                  addPreviewScrollbarPolicy(previewHtml),
                  project.id,
                  previewSession,
                  serializedCart,
                ),
                previewSession,
                nonce,
              ),
            ),
          );
          setIframeReady(false);
          setError("");
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(
              reason instanceof Error ? reason.message : "No se pudo generar la vista previa.",
            );
          }
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [project, route, renderToken]);

  return (
    <aside className="preview-pane" aria-label="Vista previa de la tienda">
      <div ref={stageRef} className={`preview-stage preview-stage--${size}`}>
        {error ? (
          <div className="preview-error">
            <EyeSlash aria-hidden size={28} />
            <strong>{"La vista previa necesita atenci\u00f3n"}</strong>
            <p>{error}</p>
            <Button variant="secondary" onClick={() => setRenderToken((token) => token + 1)}>
              Recargar vista previa
            </Button>
          </div>
        ) : !html ? (
          <output className="preview-loading" aria-live="polite">
            <strong>Preparando vista previa</strong>
            <p>Optimizando recursos de esta tienda...</p>
          </output>
        ) : (
          <>
            <iframe
              key={htmlSession}
              ref={attachPreviewObserver}
              title={`Vista previa ${size}`}
              srcDoc={html}
              // El preview local usa srcdoc dentro del servidor HTTP; mantiene
              // el sandbox restrictivo para aislar el documento renderizado.
              sandbox={previewSandbox}
              style={
                deviceWidth
                  ? {
                      width: deviceWidth,
                      maxWidth: "none",
                      zoom: deviceZoom,
                      height: `${100 / deviceZoom}%`,
                    }
                  : zoom !== 100
                    ? { zoom: zoom / 100 }
                    : undefined
              }
              onLoad={(event) => {
                if (event.currentTarget.contentWindow) {
                  previewFrameWindows.current = [
                    ...previewFrameWindows.current.slice(-2),
                    event.currentTarget.contentWindow,
                  ];
                }
                setIframeReady(true);
                if (pausedRef.current) {
                  previewFrame.current?.contentWindow?.postMessage({ type: "solara-pause" }, "*");
                }
              }}
            />
            {!iframeReady ? (
              <output
                className="preview-overlay"
                data-testid="ui-preview-loading"
                aria-live="polite"
              >
                <span className="save-spinner" aria-hidden />
                Cargando vista previa
              </output>
            ) : null}
            {canvasSelection ? (
              <form
                className="canvas-popover"
                role="dialog"
                aria-label={`Editar ${manifestEntry?.label ?? canvasSelection.editId}`}
                style={{
                  // El rect llega en coordenadas del iframe (CSS zoom del
                  // stage escala el iframe): convertir a coordenadas del stage
                  // dividiendo por el factor de zoom.
                  left: canvasSelection.rect.x / (zoom / 100),
                  top: (canvasSelection.rect.y + canvasSelection.rect.height) / (zoom / 100),
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const value =
                    manifestEntry?.kind === "boolean"
                      ? data.get("canvas-value") === "on"
                      : String(data.get("canvas-value") ?? "");
                  if (canvasSelection.itemId !== undefined) {
                    onCanvasItemEdit?.(
                      canvasSelection.sectionId,
                      manifestEntry?.fieldKey ?? "",
                      canvasSelection.itemId,
                      manifestEntry?.itemFieldKey ? { [manifestEntry.itemFieldKey]: value } : {},
                    );
                  } else if (
                    manifestEntry?.sourceKind &&
                    manifestEntry.entityId &&
                    manifestEntry.entityField
                  ) {
                    onCanvasEntityEdit?.(
                      manifestEntry.sourceKind,
                      manifestEntry.entityId,
                      manifestEntry.entityField,
                      value,
                    );
                  } else {
                    onCanvasEdit?.(canvasSelection.sectionId, manifestFieldKey, value);
                  }
                  setCanvasSelection(null);
                }}
              >
                {isImageSelection ? (
                  <>
                    <label htmlFor={canvasValueId} className="canvas-popover-label">
                      <strong>Imagen</strong>
                    </label>
                    <select
                      id={canvasValueId}
                      name="canvas-value"
                      defaultValue={manifestValue}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setCanvasSelection(null);
                      }}
                    >
                      <option value="">Sin imagen</option>
                      {project.assets
                        .filter((asset) => asset.kind === "image")
                        .map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                    </select>
                    <ImageUploadButton
                      assets={project.assets.filter((asset) => asset.kind === "image")}
                      label="Subir y aplicar imagen"
                      onUpload={(asset) => {
                        if (!manifestEntry) return;
                        onCanvasImageUpload?.(asset, {
                          sectionId: canvasSelection.sectionId,
                          fieldKey: manifestEntry.fieldKey,
                          ...(canvasSelection.itemId === undefined
                            ? {}
                            : { itemId: canvasSelection.itemId }),
                          ...(manifestEntry.sourceKind === undefined
                            ? {}
                            : { sourceKind: manifestEntry.sourceKind }),
                          ...(manifestEntry.entityId === undefined
                            ? {}
                            : { entityId: manifestEntry.entityId }),
                          ...(manifestEntry.entityField === undefined
                            ? manifestEntry.itemFieldKey === undefined
                              ? {}
                              : { entityField: manifestEntry.itemFieldKey }
                            : { entityField: manifestEntry.entityField }),
                        });
                        setCanvasSelection(null);
                      }}
                    />
                  </>
                ) : manifestEntry?.kind === "boolean" ? (
                  <>
                    <label htmlFor={canvasValueId} className="canvas-popover-label">
                      <strong>{manifestEntry?.label ?? "Activar"}</strong>
                    </label>
                    <input
                      id={canvasValueId}
                      name="canvas-value"
                      type="checkbox"
                      defaultChecked={manifestValue === "true"}
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor={canvasValueId} className="canvas-popover-label">
                      <strong>{manifestEntry?.label ?? "Editar"}</strong>
                    </label>
                    <textarea
                      id={canvasValueId}
                      name="canvas-value"
                      rows={manifestEntry?.multiline ? 5 : 2}
                      maxLength={manifestEntry?.maxLength}
                      defaultValue={manifestValue}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setCanvasSelection(null);
                      }}
                    />
                  </>
                )}
                <div className="canvas-popover-actions">
                  <button type="submit">Aplicar</button>
                  <button type="button" onClick={() => setCanvasSelection(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
