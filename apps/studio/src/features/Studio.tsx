/**
 * Shell del editor: coordina historial undo/redo, navegación entre herramientas,
 * preview y guardado. Los editores de cada pestaña modifican el proyecto a
 * través de este estado; no deben persistir directamente por fuera de sus
 * contratos de comandos o del controlador de guardado.
 */
import {
  ArrowLeft,
  ArrowsInSimple,
  ArrowsOutSimple,
  ArrowUDownLeft,
  ArrowUDownRight,
  BoxArrowDown,
  CheckCircle,
  ClipboardText,
  FloppyDisk,
  Image,
  Layout,
  MagnifyingGlass,
  Package,
  PaintBrush,
  PencilSimple,
  Storefront,
  X,
} from "@phosphor-icons/react";
import {
  applyMutation,
  createHistory,
  createMutationRegistry,
  type DomainCommand,
  executeCommand,
  type HistoryState,
  redo,
  undo,
} from "@solara/core";
import { type ImageAsset, type StoreProjectV1, StoreProjectV1Schema } from "@solara/project-schema";
import { isBaseTemplate } from "@solara/project-schema/project-policy";
import {
  type KeyboardEvent,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Tooltip } from "../components/primitives";
import { Button, IconButton, InlineError } from "../components/Ui";
import { AutosaveQueue, type AutosaveState } from "../lib/autosave";
import { readExportHistory } from "../lib/exportHistory";
import { moveHistory, pushHistorySnapshot } from "../lib/history";
import { assertProjectImagesOptimized } from "../lib/imageAsset";
import type { LocalSaveReceipt, LocalStorageError } from "../lib/localStorage";
import { downloadBlob } from "../lib/projectArchive";
import { optimizeProjectAssets, saveProject } from "../lib/repository";
import { formatSaveTime } from "../lib/saveTime";
import { formatLastExportLabel } from "../lib/statusBar";
import { createProjectArchiveInWorker } from "../lib/workers";
import {
  getPreviewRoutes,
  Preview,
  type PreviewSize,
  PreviewToolbar,
  type PreviewZoom,
} from "./Preview";
import { InspectorDockProvider } from "./workbench/InspectorDock";

// Las vistas del editor se cargan al abrir la pestaña: el shell y el preview
// arrancan sin parsear Catalog/Builder/Export/etc.
const LazyGuidedOverview = lazy(() =>
  import("./GuidedOverview").then(({ GuidedOverview: Component }) => ({ default: Component })),
);
const loadOverview = () =>
  import("./Overview").then(({ Overview: Component }) => ({ default: Component }));
const LazyOverview = lazy(loadOverview);
const loadCatalog = () =>
  import("./Catalog").then(({ Catalog: Component }) => ({ default: Component }));
const LazyCatalog = lazy(loadCatalog);
const LazyBuilder = lazy(() =>
  import("./Builder").then(({ Builder: Component }) => ({ default: Component })),
);
const LazyThemeEditor = lazy(() =>
  import("./ThemeEditor").then(({ ThemeEditor: Component }) => ({ default: Component })),
);
const LazyAssets = lazy(() =>
  import("./Assets").then(({ Assets: Component }) => ({ default: Component })),
);
const LazySeo = lazy(() => import("./Seo").then(({ Seo: Component }) => ({ default: Component })));
const LazyExportPanel = lazy(() =>
  import("./Export").then(({ ExportPanel: Component }) => ({ default: Component })),
);

const ManagedPersistenceControls = lazy(() =>
  import("./ManagedPersistenceControls").then(({ ManagedPersistenceControls: Component }) => ({
    default: Component,
  })),
);

type StudioTab =
  | "guided"
  | "overview"
  | "catalog"
  | "builder"
  | "theme"
  | "assets"
  | "seo"
  | "export";
const tabs: Array<{ id: StudioTab; label: string; icon: typeof Storefront }> = [
  { id: "guided", label: "Preparar", icon: ClipboardText },
  { id: "overview", label: "Resumen", icon: Storefront },
  { id: "catalog", label: "Catálogo", icon: Package },
  { id: "builder", label: "Constructor", icon: Layout },
  { id: "theme", label: "Tema de la tienda", icon: PaintBrush },
  { id: "assets", label: "Recursos", icon: Image },
  { id: "seo", label: "SEO", icon: MagnifyingGlass },
  { id: "export", label: "Exportar", icon: BoxArrowDown },
];

interface StudioTabContentProps {
  tab: StudioTab;
  project: StoreProjectV1;
  advancedMode: boolean;
  replaceProject(next: StoreProjectV1, options?: { allowProtectedWrite?: boolean }): void;
  runCommand(command: DomainCommand): void;
  onNavigate(destination: StudioTab): void;
  onApplyUpgrade(nextProject: StoreProjectV1): Promise<boolean>;
  onToggleAdvancedMode(): void;
  onEnableAdvanced(): void;
  onPreviewRouteChange(route: string): void;
  onImport(project: StoreProjectV1): Promise<void>;
  onOpenSite?: ((id: string) => Promise<void>) | undefined;
  validationError: string;
}

// El contenido de la pestaña activa sólo se recalcula cuando cambia su
// entrada (proyecto, tab o modo). Los re-renders del shell por estado de
// guardado, marca de sucio o avisos no vuelven a montar el editor completo.
const tabFallback = <div className="studio-tab-fallback" aria-busy="true" />;

const StudioTabContent = memo(function StudioTabContent({
  tab,
  project,
  advancedMode,
  replaceProject,
  runCommand,
  onNavigate,
  onApplyUpgrade,
  onToggleAdvancedMode,
  onEnableAdvanced,
  onPreviewRouteChange,
  onImport,
  onOpenSite,
  validationError,
}: StudioTabContentProps) {
  const immutableBase = isBaseTemplate(project);
  switch (tab) {
    case "guided":
      return (
        <Suspense fallback={tabFallback}>
          <LazyGuidedOverview
            project={project}
            advancedMode={advancedMode}
            onNavigate={onNavigate}
            onToggleAdvancedMode={onToggleAdvancedMode}
            onApplyUpgrade={onApplyUpgrade}
          />
        </Suspense>
      );
    case "overview":
      return (
        <Suspense fallback={tabFallback}>
          <LazyOverview project={project} onChange={replaceProject} />
        </Suspense>
      );
    case "catalog":
      return (
        <Suspense fallback={tabFallback}>
          <LazyCatalog project={project} onCommand={runCommand} onChange={replaceProject} />
        </Suspense>
      );
    case "builder":
      return (
        <Suspense fallback={tabFallback}>
          <LazyBuilder
            project={project}
            onChange={replaceProject}
            onPreviewRouteChange={onPreviewRouteChange}
            protectedBase={immutableBase || (!advancedMode && project.origin?.seed === "clean")}
            advancedMode={immutableBase ? false : advancedMode}
            {...(immutableBase ? {} : { onEnableAdvanced })}
          />
        </Suspense>
      );
    case "theme":
      return (
        <Suspense fallback={tabFallback}>
          <LazyThemeEditor project={project} onChange={replaceProject} />
        </Suspense>
      );
    case "assets":
      return (
        <Suspense fallback={tabFallback}>
          <LazyAssets project={project} onChange={replaceProject} />
        </Suspense>
      );
    case "seo":
      return (
        <Suspense fallback={tabFallback}>
          <LazySeo
            project={project}
            onChange={replaceProject}
            onNavigate={onNavigate}
            validationError={validationError}
          />
        </Suspense>
      );
    case "export":
      return (
        <Suspense fallback={tabFallback}>
          <LazyExportPanel
            project={project}
            onImport={onImport}
            onNavigate={onNavigate}
            {...(onOpenSite ? { onOpenSite } : {})}
          />
        </Suspense>
      );
  }
});

// El preview no se re-renderiza cuando el shell cambia estado (guardado,
// avisos, ticks): su entrada es sólo el proyecto y la configuración de ruta.
const MemoizedPreview = memo(function MemoizedPreview({
  project,
  route,
  size,
  zoom,
  canvasMode,
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
  canvasMode: boolean;
  onCanvasModeChange(next: boolean): void;
  onRouteChange(route: string): void;
  onCanvasEdit(sectionId: string, fieldKey: string, value: unknown): void;
  onCanvasItemEdit(sectionId: string, fieldKey: string, itemId: string, value: unknown): void;
  onCanvasEntityEdit(sourceKind: string, entityId: string, field: string, value: unknown): void;
  onCanvasImageUpload(
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
  return (
    <Preview
      project={project}
      route={route}
      size={size}
      zoom={zoom}
      canvasMode={canvasMode}
      onCanvasModeChange={onCanvasModeChange}
      onRouteChange={onRouteChange}
      onCanvasEdit={onCanvasEdit}
      onCanvasItemEdit={onCanvasItemEdit}
      onCanvasEntityEdit={onCanvasEntityEdit}
      onCanvasImageUpload={onCanvasImageUpload}
    />
  );
});

export function Studio({
  initialProject,
  onBack,
  onProjectImported,
  managedStorage = false,
  diskVersion = null,
  diskBaseProject,
  onDiskSaved,
  onReloadFromDisk,
  onDuplicateDraft,
  onOpenSite,
}: {
  initialProject: StoreProjectV1;
  onBack(): void;
  onProjectImported(project: StoreProjectV1): Promise<void>;
  managedStorage?: boolean;
  diskVersion?: number | null;
  diskBaseProject?: StoreProjectV1;
  onDiskSaved?(receipt: LocalSaveReceipt): void;
  onReloadFromDisk?(): Promise<{ ok: true } | { ok: false; message: string }>;
  onDuplicateDraft?(
    project: StoreProjectV1,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  onOpenSite?(id: string): Promise<void>;
}) {
  useEffect(() => {
    let idleId: number | ReturnType<typeof setTimeout> | undefined;
    if ("requestIdleCallback" in window) {
      idleId = (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(
        () => {
          void loadOverview();
          void loadCatalog();
        },
        { timeout: 2000 },
      );
    } else {
      idleId = globalThis.setTimeout(() => {
        void loadOverview();
        void loadCatalog();
      }, 1200);
    }
    return () => {
      if (idleId === undefined) return;
      if ("cancelIdleCallback" in window && typeof idleId === "number") {
        try {
          (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
            idleId as number,
          );
        } catch {}
      } else {
        clearTimeout(idleId as unknown as number);
      }
    };
  }, []);
  const [history, setHistory] = useState<HistoryState>(() => createHistory(initialProject));
  const [tab, setTab] = useState<StudioTab>("guided");
  const [editorOpen, setEditorOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(`solara-editor-pane:${initialProject.id}`) !== "closed";
    } catch {
      return false;
    }
  });
  const [previewRoute, setPreviewRoute] = useState(() => {
    try {
      const s = sessionStorage.getItem("solara-preview-route");
      if (s?.startsWith("/")) return s;
    } catch {}
    return "/";
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("solara-preview-route", previewRoute);
    } catch {}
  }, [previewRoute]);
  const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");
  const [editorPreviewSize, setEditorPreviewSize] = useState<PreviewSize>("tablet");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorBlocking, setInspectorBlocking] = useState(false);
  // The main editor keeps its temporary device separate from the view it must restore.
  const effectiveInspectorOpen = inspectorOpen && editorOpen;
  const effectivePreviewSize = editorOpen ? editorPreviewSize : previewSize;
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>(() => {
    try {
      const stored = Number(window.sessionStorage.getItem("solara-preview-zoom"));
      if (stored === 100 || stored === 75 || stored === 50) return stored;
    } catch {
      // Sesión no disponible: el zoom arranca en 100%.
    }
    return 100;
  });
  const [advancedMode, setAdvancedMode] = useState(false);
  const [saveState, setSaveState] = useState<AutosaveState>("saved");
  const [validationError, setValidationError] = useState("");
  const [conflict, setConflict] = useState<LocalStorageError | null>(null);

  // Trampa de foco del diálogo de conflicto: foco inicial al abrir, ciclo de
  // Tab dentro del diálogo y restauración al cerrar (T4.12/fix 409). El
  // navegador desenfoca el botón Guardar cuando pasa a disabled durante el
  // guardado y el activeElement capturado sería body: se recupera el opener
  // real (botón Guardar) como respaldo para que el restauro nunca caiga en
  // body (fixme A21/A14). El botón puede quedar disabled mientras el conflicto
  // está visible; se guarda igual porque se vuelve enfocable al cerrar.
  const conflictDialogRef = useRef<HTMLDivElement>(null);
  const conflictOpenerRef = useRef<HTMLElement | null>(null);
  const conflictDescriptionId = useId();
  useEffect(() => {
    if (!conflict) return;
    const active = document.activeElement;
    const saveButton = document.querySelector<HTMLElement>("[data-studio-save]");
    conflictOpenerRef.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      !active.hasAttribute("disabled") &&
      !active.hasAttribute("inert")
        ? active
        : saveButton;
    setConfirmLeave(false);
    const firstFocusable =
      conflictDialogRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    (firstFocusable ?? conflictDialogRef.current)?.focus();
  }, [conflict]);
  useEffect(() => {
    if (conflict) return;
    conflictOpenerRef.current?.focus();
    conflictOpenerRef.current = null;
  }, [conflict]);

  const keepConflictDraft = useCallback(() => {
    setConflict(null);
    setNotice(
      "Borrador conservado en este navegador. Al abrir la tienda otra vez podés recuperarlo, o duplicar el borrador para continuar en una copia.",
    );
  }, []);

  const trapConflictFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      keepConflictDraft();
      return;
    }
    if (event.key !== "Tab" || !conflictDialogRef.current) return;
    const focusable = Array.from(
      conflictDialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    if (focusable.length === 0) return;
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const [notice, setNotice] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [managedDirty, setManagedDirty] = useState(false);
  const [protectedWriteApproved, setProtectedWriteApproved] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const [lastExportedAt, setLastExportedAt] = useState("");
  const [exportTick, setExportTick] = useState(0);
  const [lastVisitedAt, setLastVisitedAt] = useState<Partial<Record<StudioTab, string>>>(() =>
    tabs.reduce(
      (acc, item) => {
        acc[item.id] = initialProject.updatedAt;
        return acc;
      },
      {} as Partial<Record<StudioTab, string>>,
    ),
  );
  // Un upgrade guiado es el único flujo que puede escribir la plantilla
  // protegida. El permiso se consume al completar ese snapshot y no abre el
  // resto de los editores ni deja habilitados guardados posteriores.
  const protectedWriteProjectIdRef = useRef<string | null>(null);
  const [autosave] = useState(
    () =>
      new AutosaveQueue(async (snapshot: StoreProjectV1) => {
        const allowProtectedWrite = protectedWriteProjectIdRef.current === snapshot.id;
        await saveProject(snapshot, { allowProtectedWrite });
        if (allowProtectedWrite) protectedWriteProjectIdRef.current = null;
      }, 550),
  );
  const editorPaneId = useId();
  const conflictTitleId = useId();
  const focusToggleId = useId();
  const focusExitId = useId();
  const lastProjectRef = useRef(initialProject);
  const previousSaveStateRef = useRef<AutosaveState>("saved");
  // Scroll por pestaña del panel de edición (H3-B2): el pane no se remonta y
  // cada pestaña recupera su posición al volver.
  const paneScrollPositionsRef = useRef<Partial<Record<StudioTab, number>>>({});
  const paneRef = useRef<HTMLElement | null>(null);
  // Transición sucio → guardado: la marca de "todo visitado" sólo se aplica
  // cuando un guardado termina, nunca en el commit del cambio (H3-B1).
  const dirtyRef = useRef(false);
  const activeStoreIdRef = useRef("");
  // Señal de cambio administrado: el canal IA puede commitear mientras Studio
  // está abierto. Un poll liviano del manifest detecta versiones nuevas.
  useEffect(() => {
    if (!managedStorage) return;
    let lastVersion: number | null = null;
    const poll = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void (async () => {
        try {
          const response = await fetch("/__solara/storage/projects");
          if (!response.ok) return;
          const data = (await response.json()) as {
            projects?: Array<{ projectId: string; version: number }>;
          };
          const current = data.projects?.find(
            (candidate) => candidate.projectId === activeStoreIdRef.current,
          );
          if (!current) return;
          if (lastVersion === null) {
            lastVersion = current.version;
            return;
          }
          if (current.version > lastVersion) {
            lastVersion = current.version;
            const dirty = managedStorage ? managedDirty : saveState !== "saved";
            if (dirty) {
              setConflict(
                Object.assign(
                  new Error(
                    "El agente IA publicó una versión nueva de esta tienda mientras tenías cambios sin guardar.",
                  ),
                  { code: "AGENT_VERSION_CONFLICT" },
                ),
              );
            } else {
              void onReloadFromDisk?.().then((outcome) => {
                if (outcome && !outcome.ok) setNotice(outcome.message);
              });
            }
          }
        } catch {
          /* sin servidor local: silencio */
        }
      })();
    }, 5000);
    return () => window.clearInterval(poll);
  }, [managedStorage, managedDirty, saveState, onReloadFromDisk]);
  // Señal de cambio administrado: el canal IA puede commitear mientras Studio
  // está abierto. Un poll liviano del manifest detecta versiones nuevas.

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const project = history.present;
  activeStoreIdRef.current = project.id;
  const immutableBase = isBaseTemplate(project);
  // La ruta del preview no se descarta en silencio cuando sale de la muestra
  // de getPreviewRoutes: renderPreviewHtml resuelve cualquier página real del
  // sitio (p. ej. /envios/ fuera del datalist) y cae a la página inicial para
  // rutas inexistentes (fixme A20/A14). Sin efecto de reset, la ruta
  // commiteada en el selector se conserva y el srcdoc la renderiza.
  const previewRoutes = useMemo(() => getPreviewRoutes(project), [project]);
  const paneStorageKey = useMemo(
    () => `solara-editor-pane:${initialProject.id}`,
    [initialProject.id],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: exportTick fuerza el recálculo del rótulo al volver a la ventana (focus y visibilitychange), así no queda viejo tras exportar.
  const lastExportLabel = useMemo(
    () =>
      formatLastExportLabel(
        readExportHistory(project.slug),
        lastExportedAt || null,
        new Date().toISOString(),
      ),
    [exportTick, lastExportedAt, project.slug],
  );

  const setPaneOpen = useCallback(
    (open: boolean) => {
      if (open && !editorOpen) setEditorPreviewSize("tablet");
      setEditorOpen(open);
      try {
        window.localStorage.setItem(paneStorageKey, open ? "open" : "closed");
      } catch {
        // Almacenamiento bloqueado: el colapso se conserva sólo en memoria.
      }
    },
    [paneStorageKey, editorOpen],
  );

  const changePreviewZoom = useCallback((zoom: PreviewZoom) => {
    setPreviewZoom(zoom);
    try {
      window.sessionStorage.setItem("solara-preview-zoom", String(zoom));
    } catch {
      // Sesión no disponible: el zoom se conserva sólo en memoria.
    }
  }, []);

  useEffect(() => {
    return autosave.subscribe(setSaveState);
  }, [autosave]);

  useEffect(() => {
    const wasWorking =
      previousSaveStateRef.current === "saving" || previousSaveStateRef.current === "pending";
    previousSaveStateRef.current = saveState;
    if (wasWorking && saveState === "saved") setLastSavedAt(Date.now());
  }, [saveState]);

  useEffect(() => {
    const handlePaneShortcut = (event: globalThis.KeyboardEvent) => {
      if (inspectorBlocking) return;
      if (!(event.ctrlKey || event.metaKey) || event.key !== "\\") return;
      event.preventDefault();
      setPaneOpen(!editorOpen);
    };
    window.addEventListener("keydown", handlePaneShortcut);
    return () => window.removeEventListener("keydown", handlePaneShortcut);
  }, [editorOpen, setPaneOpen, inspectorBlocking]);

  useEffect(() => {
    const bumpExportTick = () => {
      // Pestaña oculta: nada pinta ni necesita releer el historial de
      // exportación. El rótulo se refresca al volver a ser visible.
      if (document.visibilityState === "hidden") return;
      setExportTick((current) => current + 1);
    };
    window.addEventListener("focus", bumpExportTick);
    document.addEventListener("visibilitychange", bumpExportTick);
    return () => {
      window.removeEventListener("focus", bumpExportTick);
      document.removeEventListener("visibilitychange", bumpExportTick);
    };
  }, []);

  const dirtyTabs = useMemo(() => {
    const updatedAt = project.updatedAt;
    return new Set(
      tabs
        .filter((item) => item.id !== tab && (lastVisitedAt[item.id] ?? "") < updatedAt)
        .map((item) => item.id),
    );
  }, [lastVisitedAt, project.updatedAt, tab]);

  useEffect(() => {
    setLastVisitedAt((current) => {
      if (current[tab] === project.updatedAt) return current;
      return { ...current, [tab]: project.updatedAt };
    });
  }, [project.updatedAt, tab]);

  // El panel no se remonta al cambiar de pestaña (H3-B2): conserva el DOM y
  // su scroll; al volver a una pestaña se restaura la posición guardada.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    pane.scrollTop = paneScrollPositionsRef.current[tab] ?? 0;
  }, [tab]);

  // Cerrar el pane no puede dejar el foco en contenido oculto: si el foco
  // estaba dentro del panel cuando se cierra (X o Ctrl+\) se devuelve al tab
  // activo, dueño del panel según aria-controls (A14).
  useEffect(() => {
    if (editorOpen) return;
    const pane = paneRef.current;
    const active = document.activeElement;
    if (active instanceof HTMLElement && pane !== null && pane.contains(active)) {
      document.getElementById(`studio-tab-${tab}`)?.focus();
    }
  }, [editorOpen, tab]);

  useEffect(() => {
    const dirty = managedStorage ? managedDirty : saveState !== "saved";
    const wasDirty = dirtyRef.current;
    dirtyRef.current = dirty;
    // La marca de "todo visitado" se aplica sólo en la transición
    // sucio → guardado. En el commit del cambio (mismo render con saveState
    // todavía "saved", antes del aviso de schedule) no hay transición, así el
    // wipe no borra el punto antes de que renderice.
    if (!wasDirty || dirty) return;
    setLastVisitedAt((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of tabs) {
        if (next[item.id] !== project.updatedAt) {
          next[item.id] = project.updatedAt;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [managedDirty, managedStorage, project.updatedAt, saveState]);
  useEffect(() => {
    if (project === lastProjectRef.current) return;
    lastProjectRef.current = project;
    if (!managedStorage) autosave.schedule(project);
  }, [autosave, managedStorage, project]);

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      const hasChanges = managedStorage ? managedDirty : autosave.hasUnsavedChanges;
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [autosave, managedDirty, managedStorage]);

  useEffect(() => {
    if (managedStorage) return;
    const flushPendingAutosave = () => {
      void autosave.flush().catch(() => {});
    };
    const v = () => {
      if (document.visibilityState === "hidden") flushPendingAutosave();
    };
    window.addEventListener("pagehide", flushPendingAutosave);
    document.addEventListener("visibilitychange", v);
    window.addEventListener("beforeunload", flushPendingAutosave);
    return () => {
      window.removeEventListener("pagehide", flushPendingAutosave);
      document.removeEventListener("visibilitychange", v);
      window.removeEventListener("beforeunload", flushPendingAutosave);
    };
  }, [autosave, managedStorage]);
  useEffect(() => () => autosave.dispose(), [autosave]);

  const performLeave = async () => {
    setLeaving(true);
    try {
      await autosave.flush();
      onBack();
    } catch {
      setSaveState("error");
      setLeaving(false);
    }
  };

  const requestLeave = () => {
    if (managedStorage && managedDirty) {
      setConfirmLeave(true);
      return;
    }
    void performLeave();
  };

  const replaceProject = useCallback(
    (next: StoreProjectV1, options: { allowProtectedWrite?: boolean } = {}) => {
      if (immutableBase && !options.allowProtectedWrite) {
        setValidationError(
          "La plantilla protegida es de solo lectura. Creá una tienda nueva para editarla.",
        );
        return false;
      }
      const result = StoreProjectV1Schema.safeParse(next);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.join(".") || "project";
        setValidationError(`${path}: ${issue?.message ?? "Proyecto inválido."}`);
        return false;
      }
      try {
        assertProjectImagesOptimized(result.data);
      } catch (reason) {
        setValidationError(reason instanceof Error ? reason.message : "Imagen no optimizada.");
        return false;
      }
      setValidationError("");
      if (options.allowProtectedWrite && immutableBase) {
        protectedWriteProjectIdRef.current = result.data.id;
      }
      setHistory((current) => {
        return pushHistorySnapshot(current, result.data);
      });
      return true;
    },
    [immutableBase],
  );

  const runCommand = useCallback(
    (command: DomainCommand) => {
      if (immutableBase) {
        setValidationError(
          "La plantilla protegida es de solo lectura. Creá una tienda nueva para editarla.",
        );
        return;
      }
      setHistory((current) => executeCommand(current, command));
    },
    [immutableBase],
  );

  const navigateFromGuided = useCallback(
    (destination: StudioTab) => {
      if (destination === "builder") setAdvancedMode(true);
      setTab(destination);
      setPaneOpen(true);
    },
    [setPaneOpen],
  );

  // Toggle de Preparar (contrato PT4, Opción A): además de navegar al
  // Constructor, enciende/apaga el Modo avanzado para que el estado sea
  // visible y reversible desde el propio control que lo activa.
  const toggleAdvancedMode = useCallback(() => {
    setAdvancedMode((current) => !current);
    setTab("builder");
    setPaneOpen(true);
  }, [setPaneOpen]);

  const enableAdvancedMode = useCallback(() => setAdvancedMode(true), []);

  const applyGuidedUpgrade = useCallback(
    async (nextProject: StoreProjectV1) => {
      try {
        await autosave.flush();
        const archive = await createProjectArchiveInWorker(project);
        downloadBlob(
          archive,
          `${project.slug}-antes-de-actualizar.solara.json`,
          "application/vnd.solara.project+json",
        );
        if (managedStorage && immutableBase) setProtectedWriteApproved(true);
        return replaceProject(nextProject, { allowProtectedWrite: immutableBase });
      } catch (reason) {
        setValidationError(
          reason instanceof Error
            ? `No se pudo crear el respaldo: ${reason.message}`
            : "No se pudo crear el respaldo antes de actualizar.",
        );
        return false;
      }
    },
    [autosave, immutableBase, managedStorage, project, replaceProject],
  );

  const importFromExport = useCallback(
    async (imported: StoreProjectV1) => {
      if (immutableBase) {
        setValidationError("No se puede importar ni reemplazar la plantilla protegida.");
        return;
      }
      await autosave.flush();
      const optimized = await optimizeProjectAssets(imported);
      await onProjectImported(optimized);
      setHistory(createHistory(optimized));
    },
    [autosave, immutableBase, onProjectImported],
  );

  const selectTab = useCallback(
    (nextId: StudioTab, focusTab = false) => {
      // El Modo avanzado es estado de sesión del shell (contrato PT4, Opción A):
      // persiste entre TODAS las pestañas (incluido Preparar) para que haya un
      // único estado observable, independiente del camino. Nace en `false` al
      // abrir la tienda y no sobrevive a recargas; se activa desde el flujo
      // guiado (navigateFromGuided), desde el toggle de Preparar o desde el
      // botón Desbloquear del Constructor, y se apaga con el mismo toggle.
      setTab(nextId);
      setLastVisitedAt((current) => ({ ...current, [nextId]: project.updatedAt }));
      // Cada pestaña es también la vía directa para recuperar el panel: una
      // pestaña seleccionada nunca debe controlar un tabpanel oculto (H3-B3).
      setPaneOpen(true);
      if (focusTab) {
        requestAnimationFrame(() => {
          const tabElement = document.getElementById(`studio-tab-${nextId}`);
          tabElement?.focus();
          tabElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      }
    },
    [project.updatedAt, setPaneOpen],
  );

  const toggleFocusMode = useCallback(() => {
    if (focusMode) {
      setFocusMode(false);
      requestAnimationFrame(() => {
        document.getElementById(focusToggleId)?.focus();
      });
    } else {
      setFocusMode(true);
      requestAnimationFrame(() => {
        document.getElementById(focusExitId)?.focus();
      });
    }
  }, [focusExitId, focusMode, focusToggleId]);
  const handleDiskSaved = useCallback(
    (receipt: LocalSaveReceipt) => {
      if (receipt.site?.savedAt) setLastExportedAt(receipt.site.savedAt);
      onDiskSaved?.(receipt);
    },
    [onDiskSaved],
  );

  // Atajos globales del shell (H3-B4/B5): Ctrl+S (modo navegador), Ctrl+Z y
  // Ctrl+Shift+Z. Escuchan en `window` y se re-registran con cleanup, así que
  // no hay doble bind. Limitación conocida (T19): el preview es un iframe con
  // su propio documento; los keydown con foco dentro del iframe no cruzan al
  // documento del Studio, por lo que los atajos no operan sobre el editor
  // mientras el foco está en el preview (el sitio público no conoce atajos).
  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (inspectorBlocking) return;
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFocusMode();
        return;
      }
      if (focusMode && event.key === "Escape") {
        event.preventDefault();
        setFocusMode(false);
        requestAnimationFrame(() => {
          document.getElementById(focusToggleId)?.focus();
        });
        return;
      }
      const target = event.target as HTMLElement | null;
      const editingText =
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        // En modo managed el atajo vive en ManagedPersistenceControls; acá
        // sólo existe el flush del autosave del modo navegador (H3-B4).
        if (managedStorage) return;
        event.preventDefault();
        void autosave.flush().catch(() => undefined);
        return;
      }
      if (!editingText && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        // Dentro de un campo de texto manda el undo nativo del navegador;
        // fuera de él, el historial del editor (H3-B5). Sin historial no se
        // secuestra el atajo.
        if (event.shiftKey) {
          if (history.future.length === 0) return;
          event.preventDefault();
          setHistory((current) => moveHistory(current, redo));
        } else {
          if (history.past.length === 0) return;
          event.preventDefault();
          setHistory((current) => moveHistory(current, undo));
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    autosave,
    inspectorBlocking,
    focusMode,
    focusToggleId,
    history.future.length,
    history.past.length,
    managedStorage,
    toggleFocusMode,
  ]);

  const moveTabFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : tabs[tabs.length - 1];
      if (next) selectTab(next.id, true);
      return;
    }
    const isHorizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const isVertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!isHorizontal && !isVertical) return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab);
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    if (!next) return;
    selectTab(next.id, true);
  };

  return (
    <>
      <div
        className="studio-shell studio-workbench"
        data-preview-size={effectivePreviewSize}
        data-inspector-open={effectiveInspectorOpen || undefined}
        data-studio-focus={focusMode || undefined}
        inert={conflict ? true : undefined}
      >
        <a className="skip-link" href={`#${editorPaneId}`}>
          Saltar al panel de edición
        </a>
        <header className="studio-topbar">
          <div className="studio-brand">
            <Tooltip tip="Volver a tiendas" position="bottom">
              <IconButton
                icon={ArrowLeft}
                label="Volver a tiendas"
                disabled={leaving || inspectorBlocking}
                onClick={() => requestLeave()}
              />
            </Tooltip>
            <img
              className="brand-mark brand-mark--orbit"
              src="/branding/solara-orbit-32.png"
              srcSet="/branding/solara-orbit-32.png 32w, /branding/solara-orbit-64.png 64w"
              sizes="32px"
              alt=""
              width={32}
              height={32}
              decoding="async"
            />
            <div className="studio-brand-info">
              <nav className="studio-breadcrumb" aria-label="Navegación">
                <button
                  type="button"
                  className="studio-breadcrumb__link"
                  disabled={leaving || inspectorBlocking}
                  onClick={() => requestLeave()}
                >
                  Tiendas
                </button>
                <span className="studio-breadcrumb__sep" aria-hidden>
                  /
                </span>
                <h1 className="studio-breadcrumb__current" aria-current="page">
                  {project.name}
                </h1>
              </nav>
              <small>{project.baseUrl}</small>
            </div>
          </div>
          <PreviewToolbar
            routes={previewRoutes}
            route={previewRoute}
            size={effectivePreviewSize}
            zoom={previewZoom}
            desktopDisabled={editorOpen}
            onRouteChange={setPreviewRoute}
            onSizeChange={(size) => {
              if (editorOpen && size === "desktop") return;
              if (editorOpen) setEditorPreviewSize(size);
              else setPreviewSize(size);
            }}
            onZoomChange={changePreviewZoom}
            onOpenEditor={() => setPaneOpen(true)}
          />
          <div className="studio-topbar-actions">
            {managedStorage ? (
              <Suspense
                fallback={
                  <div className="save-status">
                    <output className="save-indicator save-indicator--saved" aria-live="polite">
                      <FloppyDisk aria-hidden size={16} />
                      Guardado
                    </output>
                  </div>
                }
              >
                <ManagedPersistenceControls
                  project={project}
                  diskVersion={diskVersion}
                  {...(diskBaseProject ? { diskBaseProject } : {})}
                  validationError={validationError}
                  onDirtyChange={setManagedDirty}
                  onError={setValidationError}
                  onConflict={setConflict}
                  onSaved={(receipt) => {
                    setProtectedWriteApproved(false);
                    handleDiskSaved(receipt);
                  }}
                  allowProtectedWrite={protectedWriteApproved}
                  blocked={conflict !== null || (immutableBase && !protectedWriteApproved)}
                />
              </Suspense>
            ) : (
              <div className="save-status">
                <output
                  className={`save-indicator save-indicator--${saveState}`}
                  aria-live="polite"
                >
                  {saveState === "saving" ? (
                    <span className="save-spinner" aria-hidden />
                  ) : saveState === "saved" ? (
                    <CheckCircle className="save-check" aria-hidden size={16} />
                  ) : (
                    <FloppyDisk aria-hidden size={16} />
                  )}
                  {saveState === "saved"
                    ? lastSavedAt
                      ? `Guardado ${formatSaveTime(lastSavedAt)}`
                      : "Guardado"
                    : saveState === "pending"
                      ? "Cambios pendientes"
                      : saveState === "saving"
                        ? "Guardando…"
                        : "Error al guardar"}
                </output>
                {saveState === "error" ? (
                  <button
                    type="button"
                    className="save-retry"
                    onClick={() => void autosave.flush().catch(() => undefined)}
                  >
                    Reintentar
                  </button>
                ) : null}
              </div>
            )}
            <Tooltip
              tip={
                canvasMode
                  ? "Salir de edición en canvas — clic en el sitio para editar"
                  : "Editar en canvas — habilita la edición directa en la vista previa"
              }
              position="bottom"
            >
              <button
                type="button"
                className={`studio-canvas-toggle${canvasMode ? " is-active" : ""}`}
                disabled={inspectorBlocking}
                data-testid="ui-canvas-toggle"
                aria-pressed={canvasMode}
                onClick={() => setCanvasMode((active) => !active)}
              >
                <PencilSimple aria-hidden size={16} weight={canvasMode ? "fill" : "regular"} />
                <span className="studio-canvas-toggle__label">
                  {canvasMode ? "Salir de edición" : "Editar en canvas"}
                </span>
              </button>
            </Tooltip>
            <Tooltip
              tip={focusMode ? "Salir del modo foco" : "Modo foco de la vista previa"}
              position="bottom"
            >
              <IconButton
                id={focusToggleId}
                icon={focusMode ? ArrowsInSimple : ArrowsOutSimple}
                label={focusMode ? "Salir del modo foco" : "Modo foco de la vista previa"}
                aria-pressed={focusMode}
                disabled={inspectorBlocking}
                data-testid="ui-focus-toggle"
                onClick={toggleFocusMode}
              />
            </Tooltip>
            <div className="history-actions">
              <Tooltip tip="Deshacer" position="bottom">
                <IconButton
                  icon={ArrowUDownLeft}
                  label="Deshacer"
                  disabled={inspectorBlocking || immutableBase || history.past.length === 0}
                  onClick={() => setHistory((current) => moveHistory(current, undo))}
                />
              </Tooltip>
              <Tooltip tip="Rehacer" position="bottom">
                <IconButton
                  icon={ArrowUDownRight}
                  label="Rehacer"
                  disabled={inspectorBlocking || immutableBase || history.future.length === 0}
                  onClick={() => setHistory((current) => moveHistory(current, redo))}
                />
              </Tooltip>
            </div>
          </div>
        </header>

        <nav
          inert={inspectorBlocking || undefined}
          className="studio-nav"
          aria-label="Áreas de la tienda"
        >
          <div
            role="tablist"
            aria-label="Áreas de la tienda"
            aria-orientation="vertical"
            onKeyDown={moveTabFocus}
          >
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                id={`studio-tab-${id}`}
                data-nav-group={
                  id === "guided" || id === "overview"
                    ? "base"
                    : id === "seo" || id === "export"
                      ? "publish"
                      : "design"
                }
                data-testid="ui-tab"
                role="tab"
                aria-selected={tab === id}
                aria-controls={tab === id ? editorPaneId : undefined}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => selectTab(id)}
              >
                <Icon aria-hidden size={19} weight={tab === id ? "duotone" : "regular"} />
                <span>{label}</span>
                {dirtyTabs.has(id) ? (
                  <>
                    <span className="visually-hidden">cambios sin revisar</span>
                    <span
                      className="studio-tab-dirty"
                      data-testid="ui-tab-dirty"
                      aria-hidden="true"
                      title={`${label} tiene cambios sin revisar`}
                    />
                  </>
                ) : null}
                {tab === id ? <span className="studio-nav-indicator" aria-hidden /> : null}
              </button>
            ))}
          </div>
        </nav>

        {notice ? (
          <output className="studio-notice" data-testid="ui-studio-notice">
            <span>{notice}</span>
            <IconButton icon={X} label="Cerrar aviso" onClick={() => setNotice("")} />
          </output>
        ) : null}
        {immutableBase ? (
          <output className="studio-notice" data-testid="ui-protected-template-notice">
            <span>
              Plantilla protegida: podés revisar y previsualizar la plantilla base, pero no
              modificarla. Creá una tienda nueva para trabajar sobre una copia independiente.
            </span>
          </output>
        ) : null}

        <main className="studio-workspace">
          <InspectorDockProvider
            onOpenChange={setInspectorOpen}
            onBlockingChange={setInspectorBlocking}
          >
            <section
              ref={paneRef}
              id={editorPaneId}
              inert={inspectorBlocking || undefined}
              data-studio-editor-pane
              data-tab={tab}
              role="tabpanel"
              aria-labelledby={`studio-tab-${tab}`}
              aria-hidden={!editorOpen}
              tabIndex={-1}
              className={`editor-pane${editorOpen ? " editor-pane--open" : " editor-pane--closed"}`}
              onScroll={(event) => {
                paneScrollPositionsRef.current[tab] = event.currentTarget.scrollTop;
              }}
            >
              <StudioTabContent
                tab={tab}
                project={project}
                advancedMode={advancedMode}
                replaceProject={replaceProject}
                runCommand={runCommand}
                onNavigate={navigateFromGuided}
                onApplyUpgrade={applyGuidedUpgrade}
                onToggleAdvancedMode={toggleAdvancedMode}
                onEnableAdvanced={enableAdvancedMode}
                onPreviewRouteChange={setPreviewRoute}
                onImport={importFromExport}
                onOpenSite={onOpenSite}
                validationError={validationError}
              />
            </section>
            {editorOpen && !effectiveInspectorOpen ? (
              <Tooltip
                tip="Cerrar panel de edición"
                position="bottom"
                className="editor-pane-close"
              >
                <IconButton
                  icon={X}
                  label="Cerrar panel de edición"
                  onClick={() => {
                    document.getElementById(`studio-tab-${tab}`)?.focus();
                    setPaneOpen(false);
                  }}
                />
              </Tooltip>
            ) : null}
            <MemoizedPreview
              project={project}
              route={previewRoute}
              size={effectivePreviewSize}
              zoom={previewZoom}
              canvasMode={canvasMode && !inspectorBlocking}
              onCanvasModeChange={setCanvasMode}
              onRouteChange={setPreviewRoute}
              onCanvasEdit={(sectionId, fieldKey, value) => {
                const applied = applyMutation(project, createMutationRegistry(), {
                  type: "section.field.update",
                  sectionId,
                  fieldKey,
                  value,
                });
                replaceProject(applied.project);
              }}
              onCanvasItemEdit={(sectionId, fieldKey, itemId, value) => {
                const applied = applyMutation(project, createMutationRegistry(), {
                  type: "section.repeater.item.update",
                  sectionId,
                  fieldKey,
                  itemId,
                  changes:
                    typeof value === "object" && value !== null
                      ? (value as Record<string, unknown>)
                      : { title: value },
                });
                replaceProject(applied.project);
              }}
              onCanvasEntityEdit={(sourceKind, entityId, field, value) => {
                const scalar = typeof value === "string" ? value : String(value ?? "");
                const imageId = scalar || undefined;
                let mutation: Parameters<typeof applyMutation>[2] | undefined;
                if (sourceKind === "identity") {
                  mutation = {
                    type: "identity.update",
                    changes: { [field]: field === "logoAssetId" ? imageId : scalar },
                  } as Parameters<typeof applyMutation>[2];
                } else if (sourceKind === "product") {
                  mutation = {
                    type: "product.update",
                    productId: entityId,
                    changes:
                      field === "imageIds"
                        ? { imageIds: imageId ? [imageId] : [] }
                        : field === "price"
                          ? { price: Number(scalar) }
                          : { [field]: scalar },
                  } as Parameters<typeof applyMutation>[2];
                } else if (sourceKind === "category") {
                  mutation = {
                    type: "category.update",
                    categoryId: entityId,
                    changes: field === "imageId" ? { imageId } : { [field]: scalar },
                  } as Parameters<typeof applyMutation>[2];
                } else if (sourceKind === "collection") {
                  mutation = {
                    type: "collection.update",
                    collectionId: entityId,
                    changes: field === "imageId" ? { imageId } : { [field]: scalar },
                  } as Parameters<typeof applyMutation>[2];
                } else if (sourceKind === "asset") {
                  mutation = {
                    type: "asset.update",
                    assetId: entityId,
                    changes: { [field]: scalar },
                  } as Parameters<typeof applyMutation>[2];
                } else if (sourceKind === "public-copy") {
                  mutation = {
                    type: "publicCopy.update",
                    group: entityId,
                    field,
                    value: scalar,
                  } as Parameters<typeof applyMutation>[2];
                }
                if (!mutation) return;
                const applied = applyMutation(project, createMutationRegistry(), mutation, {
                  kind: "canvas",
                  sessionId: "studio",
                });
                replaceProject(applied.project);
              }}
              onCanvasImageUpload={(asset, target) => {
                const existing = project.assets.find((candidate) => candidate.hash === asset.hash);
                const assetToUse = existing ?? asset;
                const withAsset = existing
                  ? project
                  : StoreProjectV1Schema.parse({
                      ...project,
                      assets: [...project.assets, asset],
                    });
                let applied = withAsset;
                if (target.itemId !== undefined) {
                  applied = applyMutation(
                    withAsset,
                    createMutationRegistry(),
                    {
                      type: "section.repeater.item.update",
                      sectionId: target.sectionId,
                      fieldKey: target.fieldKey,
                      itemId: target.itemId,
                      changes: { [target.entityField ?? "imageId"]: assetToUse.id },
                    },
                    { kind: "canvas", sessionId: "studio" },
                  ).project;
                } else if (target.sourceKind && target.entityId && target.entityField) {
                  let mutation: Parameters<typeof applyMutation>[2] | undefined;
                  if (target.sourceKind === "product") {
                    mutation = {
                      type: "product.update",
                      productId: target.entityId,
                      changes: { imageIds: [assetToUse.id] },
                    } as Parameters<typeof applyMutation>[2];
                  } else if (target.sourceKind === "category") {
                    mutation = {
                      type: "category.update",
                      categoryId: target.entityId,
                      changes: { imageId: assetToUse.id },
                    } as Parameters<typeof applyMutation>[2];
                  } else if (target.sourceKind === "collection") {
                    mutation = {
                      type: "collection.update",
                      collectionId: target.entityId,
                      changes: { imageId: assetToUse.id },
                    } as Parameters<typeof applyMutation>[2];
                  } else if (target.sourceKind === "identity") {
                    mutation = {
                      type: "identity.update",
                      changes: { logoAssetId: assetToUse.id },
                    } as Parameters<typeof applyMutation>[2];
                  }
                  if (mutation) {
                    applied = applyMutation(withAsset, createMutationRegistry(), mutation, {
                      kind: "canvas",
                      sessionId: "studio",
                    }).project;
                  }
                } else {
                  applied = applyMutation(
                    withAsset,
                    createMutationRegistry(),
                    {
                      type: "section.field.update",
                      sectionId: target.sectionId,
                      fieldKey: target.fieldKey,
                      value: assetToUse.id,
                    },
                    { kind: "canvas", sessionId: "studio" },
                  ).project;
                }
                replaceProject(applied);
              }}
            />
          </InspectorDockProvider>
        </main>

        {focusMode ? (
          <>
            <Tooltip tip="Salir del modo foco" position="bottom" className="studio-focus-exit">
              <IconButton
                id={focusExitId}
                icon={ArrowsInSimple}
                label="Salir del modo foco"
                data-testid="ui-focus-exit"
                onClick={() => {
                  setFocusMode(false);
                  requestAnimationFrame(() => {
                    document.getElementById(focusToggleId)?.focus();
                  });
                }}
              />
            </Tooltip>
            <Tooltip
              tip={canvasMode ? "Salir de edición en canvas" : "Editar en canvas"}
              position="bottom"
              className="studio-focus-canvas"
            >
              <button
                type="button"
                className={`studio-canvas-toggle studio-canvas-toggle--floating${canvasMode ? " is-active" : ""}`}
                data-testid="ui-canvas-toggle-floating"
                aria-pressed={canvasMode}
                onClick={() => setCanvasMode((active) => !active)}
              >
                <PencilSimple aria-hidden size={16} weight={canvasMode ? "fill" : "regular"} />
                <span className="studio-canvas-toggle__label">
                  {canvasMode ? "Salir edición" : "Editar en canvas"}
                </span>
              </button>
            </Tooltip>
          </>
        ) : null}

        <footer className="studio-statusbar" data-testid="ui-status-bar">
          <span>Esquema v{project.schemaVersion}</span>
          <span>Última exportación: {lastExportLabel}</span>
          <span>Persistencia: {managedStorage ? "Disco" : "IndexedDB"}</span>
          {validationError ? <InlineError>{validationError}</InlineError> : null}
        </footer>
      </div>

      {conflict ? (
        <div
          className="conflict-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={conflictTitleId}
          aria-describedby={conflictDescriptionId}
          data-testid="ui-conflict-dialog"
          onKeyDown={trapConflictFocus}
        >
          <div className="conflict-dialog" ref={conflictDialogRef} tabIndex={-1}>
            <h3 id={conflictTitleId}>La tienda cambió en otra pestaña</h3>
            <p id={conflictDescriptionId}>
              {conflict.message} Tu borrador quedó guardado en este navegador. Elegí cómo seguir:
            </p>
            <div className="conflict-dialog__options">
              <Button variant="quiet" data-testid="ui-conflict-keep" onClick={keepConflictDraft}>
                Conservar borrador
              </Button>
              <Button
                variant="secondary"
                data-testid="ui-conflict-reload"
                onClick={() => {
                  setConflict(null);
                  void onReloadFromDisk?.()
                    .then((outcome) => {
                      if (outcome && !outcome.ok) setNotice(outcome.message);
                    })
                    .catch((reason) =>
                      setNotice(
                        reason instanceof Error
                          ? reason.message
                          : "No se pudo recargar desde disco.",
                      ),
                    );
                }}
              >
                Recargar desde disco
              </Button>
              <Button
                variant="primary"
                data-testid="ui-conflict-duplicate"
                onClick={() => {
                  setConflict(null);
                  void onDuplicateDraft?.(project)
                    .then((outcome) => {
                      if (outcome && !outcome.ok) setNotice(outcome.message);
                    })
                    .catch((reason) =>
                      setNotice(
                        reason instanceof Error
                          ? reason.message
                          : "No se pudo duplicar el borrador.",
                      ),
                    );
                }}
              >
                Duplicar con mi borrador
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmLeave && !conflict ? (
        <ConfirmDialog
          title="Salir sin guardar"
          body="Hay cambios sin guardar en esta tienda. ¿Querés salir de todos modos?"
          confirmLabel="Salir sin guardar"
          cancelLabel="Quedarme"
          danger
          onConfirm={() => {
            setConfirmLeave(false);
            void performLeave();
          }}
          onCancel={() => setConfirmLeave(false)}
        />
      ) : null}
    </>
  );
}
