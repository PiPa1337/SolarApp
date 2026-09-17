/**
 * Biblioteca de tiendas: consulta la fuente disponible, aplica filtros y
 * expone creación, duplicado, archivo, respaldos y cierre del servidor propio.
 */
import {
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  CloudArrowDown,
  GitDiff,
  Plus,
  Storefront,
} from "@phosphor-icons/react";
import { isBaseTemplate } from "@solara/project-schema/project-policy";
import {
  type CSSProperties,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ResponsiveAssetImage } from "../components/ResponsiveAssetImage";
import { useToast } from "../components/Toast";
import { Button, EmptyState, InlineError } from "../components/Ui";
import {
  DASHBOARD_GRID_PAGE_SIZE,
  DASHBOARD_LIST_PAGE_SIZE,
  type DashboardSort,
  type DashboardStatusFilter,
  filterDashboardProjects,
  getDashboardStats,
  getProjectMetrics,
  paginateDashboardItems,
  partitionPinnedProjects,
  storeFaviconSrc,
  storeMark,
  storeSocialImageAsset,
} from "../lib/dashboardModel";
import {
  clearStoredSelectedId,
  type DashboardView,
  readPinnedIds,
  readStoredSort,
  readStoredStatusFilter,
  readStoredView,
  writePinnedIds,
  writeStoredSelectedId,
  writeStoredSort,
  writeStoredStatusFilter,
  writeStoredView,
} from "../lib/dashboardStorage";
import { formatDate } from "../lib/format";
import type { StoredProject } from "../lib/repository";
import { bulkBackupToastMessage } from "./dashboard/bulkBackupModel";
import { CompareView } from "./dashboard/CompareView";
import { CreateStoreDialog } from "./dashboard/CreateStoreDialog";
import { DashboardToolbar } from "./dashboard/DashboardToolbar";
import { DuplicateDialog } from "./dashboard/DuplicateDialog";
import { GravityField } from "./dashboard/GravityField";
import {
  DEFAULT_GRAVITY_SETTINGS,
  GRAVITY_ANIMATION_SPEED_MAX,
  GRAVITY_ANIMATION_SPEED_MIN,
  type GravitySettings,
} from "./dashboard/gravitySettings";
import { formatCompactDate, ProjectCard, statusLabel } from "./dashboard/ProjectCard";

interface DashboardProps {
  gravitySettings?: GravitySettings;
  settingsOpen?: boolean;
  startupReveal?: boolean;
  onStartupRevealComplete?(): void;
  projects: StoredProject[];
  onCreate(input: { name: string; brandName: string; email: string; phone: string }): Promise<void>;
  onImport(file: File): Promise<void>;
  onOpen(id: string): void | Promise<void>;
  onDuplicate(id: string, name?: string): Promise<void>;
  onArchive(id: string, archived: boolean): Promise<void>;
  onDelete(id: string): Promise<void>;
  onBackup(id: string): Promise<void>;
  onDownloadBackup?(id: string): Promise<void>;
  onOpenSite?(id: string): Promise<void>;
  onOpenFolder?(id: string): Promise<void>;
  onSessionManaged?(managed: boolean): void;
  /** App confirmó el cierre del servidor: estado terminal que no se revierte. */
  shutdownTerminal?: boolean;
  /** Notifica a App cuando el cierre del servidor queda confirmado. */
  onShutdownTerminal?(terminal: boolean): void;
}

interface DashboardStoreCardProps {
  record: StoredProject;
  index: number;
  isSelected: boolean;
  compareMode: boolean;
  isCompared: boolean;
  cardButtonRefs: RefObject<Map<string, HTMLButtonElement>>;
  onOpen(id: string): void | Promise<void>;
  onSelect(id: string): void;
  onToggleCompare(id: string): void;
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>, record: StoredProject): void;
}

const DASHBOARD_SOCIAL_FRAME_RATIO = 1200 / 630;

const DashboardStoreCard = memo(function DashboardStoreCard({
  record,
  index,
  isSelected,
  compareMode,
  isCompared,
  cardButtonRefs,
  onOpen,
  onSelect,
  onToggleCompare,
  onKeyDown,
}: DashboardStoreCardProps) {
  const metrics = getProjectMetrics(record.project);
  const cardBoundsRef = useRef<DOMRect | null>(null);
  const updatedLabel = formatDate(record.updatedAt);
  const protectedTemplate = isBaseTemplate(record.project);
  const faviconSrc = storeFaviconSrc(record.project);
  const heroAsset = storeSocialImageAsset(record.project);
  return (
    <article
      className={`dashboard-store-card${isSelected ? " is-selected" : ""}${
        compareMode ? " is-compare-mode" : ""
      }`}
      onKeyDown={(event) => onKeyDown(event, record)}
    >
      {compareMode ? (
        <>
          <input
            type="checkbox"
            className="dashboard-store-card__compare"
            data-testid="ui-card-compare"
            aria-label={`Comparar ${record.name}`}
            checked={isCompared}
            onChange={() => onToggleCompare(record.id)}
          />
          <span className="dashboard-store-card__compare-visual" aria-hidden="true">
            <Check size={11} weight="bold" />
          </span>
        </>
      ) : null}
      <button
        className="dashboard-store-card__button"
        type="button"
        aria-pressed={isSelected}
        aria-description={`Selecciona ${record.name} para revisar su información y acciones.`}
        title={`Seleccionar ${record.name} para revisar el detalle`}
        data-store-card-id={record.id}
        style={{ "--dashboard-store-hero-ratio": DASHBOARD_SOCIAL_FRAME_RATIO } as CSSProperties}
        ref={(element) => {
          if (element) cardButtonRefs.current.set(record.id, element);
          else cardButtonRefs.current.delete(record.id);
        }}
        onClick={() => onSelect(record.id)}
        onDoubleClick={() => void onOpen(record.id)}
        onPointerEnter={(event) => {
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          const card = event.currentTarget.closest<HTMLElement>(".dashboard-store-card");
          cardBoundsRef.current = card?.getBoundingClientRect() ?? null;
        }}
        onPointerMove={(event) => {
          if (!cardBoundsRef.current) return;
          const card = event.currentTarget.closest<HTMLElement>(".dashboard-store-card");
          if (!card) return;
          const bounds = cardBoundsRef.current;
          const x = (event.clientX - bounds.left) / bounds.width;
          const y = (event.clientY - bounds.top) / bounds.height;
          card.style.setProperty("--card-rotate-x", `${(0.5 - y) * 4}deg`);
          card.style.setProperty("--card-rotate-y", `${(x - 0.5) * 5}deg`);
          card.style.setProperty("--card-glow-x", `${x * 100}%`);
          card.style.setProperty("--card-glow-y", `${y * 100}%`);
          card.style.setProperty("--card-image-x", `${(0.5 - x) * 8}px`);
          card.style.setProperty("--card-image-y", `${(0.5 - y) * 6}px`);
        }}
        onPointerLeave={(event) => {
          cardBoundsRef.current = null;
          const card = event.currentTarget.closest<HTMLElement>(".dashboard-store-card");
          if (!card) return;
          card.style.removeProperty("--card-rotate-x");
          card.style.removeProperty("--card-rotate-y");
          card.style.removeProperty("--card-glow-x");
          card.style.removeProperty("--card-glow-y");
          card.style.removeProperty("--card-image-x");
          card.style.removeProperty("--card-image-y");
        }}
      >
        <span className={`dashboard-store-card__hero${heroAsset ? "" : " is-empty"}`} aria-hidden>
          {heroAsset ? (
            <ResponsiveAssetImage
              asset={heroAsset}
              alt={`Vista previa de ${record.name}`}
              width={heroAsset.width}
              height={heroAsset.height}
              // La página sólo monta 9 cards (5 en lista): la preview visible
              // debe estar disponible al entrar, no esperar a un scroll que no existe.
              loading="eager"
              decoding="async"
              sizes="(max-width: 560px) 33vw, (max-width: 820px) 33vw, (max-width: 1120px) 36vw, (max-width: 1500px) 28vw, 22vw"
            />
          ) : null}
          <span className="dashboard-store-card__hero-scrim" />
        </span>
        <span className="dashboard-store-card__index">{index + 1}</span>
        <span className="dashboard-store-card__mark" aria-hidden>
          {faviconSrc ? (
            <img
              src={faviconSrc}
              alt={`Identidad de ${record.name}`}
              width={42}
              height={42}
              loading="lazy"
              decoding="async"
            />
          ) : (
            storeMark(record.name)
          )}
        </span>
        <strong title={record.name}>{record.name}</strong>
        {record.status !== "active" ? (
          <span className={`dashboard-store-card__status is-${record.status}`}>
            <span aria-hidden />
            {statusLabel(record.status)}
          </span>
        ) : null}
        {protectedTemplate ? (
          <span className="dashboard-store-card__badge">Plantilla protegida</span>
        ) : null}
        <span className="dashboard-store-card__meta">
          {metrics.activeProducts.toLocaleString("es-AR")} productos
        </span>
        <time
          className="dashboard-store-card__meta"
          dateTime={record.updatedAt}
          title={`Actualizada ${updatedLabel}`}
        >
          {formatCompactDate(record.updatedAt)}
        </time>
      </button>
    </article>
  );
});

const GARGANTUA_LAUNCH_DURATION_MS = 3000;
const GARGANTUA_LAUNCH_HANDOFF = 0.92;
const GARGANTUA_STARTUP_REVEAL_DURATION_MS = 3000;

export function Dashboard({
  gravitySettings = DEFAULT_GRAVITY_SETTINGS,
  settingsOpen = false,
  startupReveal = false,
  onStartupRevealComplete,
  projects,
  onCreate,
  onImport,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
  onBackup,
  onDownloadBackup,
  onOpenSite,
  onOpenFolder,
  onSessionManaged,
  shutdownTerminal,
  onShutdownTerminal,
}: DashboardProps) {
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>(readStoredStatusFilter);
  const [sort, setSort] = useState<DashboardSort>(readStoredSort);
  const [view, setView] = useState<DashboardView>(readStoredView);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // El dashboard abre neutral: la card y el detalle sólo se resaltan por una
  // acción explícita del usuario, no por una selección vieja o arbitraria.
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [pinnedIds, setPinnedIds] = useState<string[]>(readPinnedIds);
  const [creating, setCreating] = useState(false);
  const [backupId, setBackupId] = useState<string>();
  const [siteOpeningId, setSiteOpeningId] = useState<string>();
  const [folderOpeningId, setFolderOpeningId] = useState<string>();
  const [downloadingId, setDownloadingId] = useState<string>();
  const [actionNotice, setActionNotice] = useState("");
  const [shutdownState, setShutdownState] = useState<
    "checking" | "unavailable" | "available" | "closing" | "closed"
  >("checking");
  const [shutdownDialogOpen, setShutdownDialogOpen] = useState(false);
  const [shutdownError, setShutdownError] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<StoredProject>();
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const [backingUp, setBackingUp] = useState<string>();
  const [openingStoreId, setOpeningStoreId] = useState<string>();
  const [launchProgress, setLaunchProgress] = useState(0);
  const [startupProgress, setStartupProgress] = useState(startupReveal ? 1 : 0);
  const shutdownDialogRef = useRef<HTMLDialogElement>(null);
  const shutdownTerminalRef = useRef(shutdownTerminal === true);
  const selectedPanelRef = useRef<HTMLElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const createOpenerRef = useRef<HTMLElement | null>(null);
  const shutdownOpenerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cardButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastSelectedIdRef = useRef<string | undefined>(undefined);
  const focusCardOnSelectRef = useRef(false);
  const actionNoticeTimerRef = useRef<number | undefined>(undefined);
  const launchFrameRef = useRef<number | undefined>(undefined);
  const startupFrameRef = useRef<number | undefined>(undefined);
  const launchTokenRef = useRef<string | undefined>(undefined);
  const launchHandoffRef = useRef(false);
  const libraryTitleId = useId();
  const shutdownTitleId = useId();
  const pinnedGroupTitleId = useId();
  const backupHintId = useId();
  const visible = useMemo(
    () => filterDashboardProjects(projects, query, statusFilter, sort),
    [projects, query, sort, statusFilter],
  );
  const mainVisible = visible;
  const dashboardStats = useMemo(() => getDashboardStats(projects), [projects]);
  const pageSize = view === "grid" ? DASHBOARD_GRID_PAGE_SIZE : DASHBOARD_LIST_PAGE_SIZE;
  const denseGrid = view === "grid" && mainVisible.length >= 8;
  const paginated = useMemo(
    () => paginateDashboardItems(mainVisible, page, pageSize),
    [mainVisible, page, pageSize],
  );
  const pageVisible = paginated.items;
  const selected = projects.find((record) => record.id === selectedId);
  const selectedFilteredOut = Boolean(
    selected && !visible.some((record) => record.id === selected.id),
  );
  const { pinned: pinnedVisible, rest: restVisible } = useMemo(
    () => partitionPinnedProjects(pageVisible, pinnedIds),
    [pageVisible, pinnedIds],
  );
  const visibleIndexById = useMemo(
    () => new Map(visible.map((record, index) => [record.id, index])),
    [visible],
  );
  const pageIndexById = useMemo(
    () => new Map(pageVisible.map((record, index) => [record.id, index])),
    [pageVisible],
  );
  const isShutdownTerminal = shutdownTerminal === true || shutdownState === "closed";
  const animationSpeed = Math.min(
    GRAVITY_ANIMATION_SPEED_MAX,
    Math.max(GRAVITY_ANIMATION_SPEED_MIN, gravitySettings.animationSpeed),
  );
  const transitionStyle = {
    "--dashboard-gargantua-transition-duration": `${GARGANTUA_STARTUP_REVEAL_DURATION_MS / animationSpeed}ms`,
    "--dashboard-gargantua-reduced-transition-duration": `${240 / animationSpeed}ms`,
  } as CSSProperties;
  const managed = shutdownState === "available" && !isShutdownTerminal;
  const comparePair = useMemo(() => {
    if (compareIds.length !== 2) return undefined;
    const left = projects.find((record) => record.id === compareIds[0]);
    const right = projects.find((record) => record.id === compareIds[1]);
    return left && right ? { left, right } : undefined;
  }, [compareIds, projects]);

  useEffect(() => {
    if (!startupReveal) {
      setStartupProgress(0);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setStartupProgress(0);
      onStartupRevealComplete?.();
      return;
    }

    const startedAt = performance.now();
    setStartupProgress(1);
    const animateStartupReveal = (now: number) => {
      const elapsed = Math.min(
        1,
        (now - startedAt) / (GARGANTUA_STARTUP_REVEAL_DURATION_MS / animationSpeed),
      );
      const progress = 1 - elapsed;
      setStartupProgress(progress);
      if (progress <= 0) {
        startupFrameRef.current = undefined;
        onStartupRevealComplete?.();
        return;
      }
      startupFrameRef.current = window.requestAnimationFrame(animateStartupReveal);
    };

    startupFrameRef.current = window.requestAnimationFrame(animateStartupReveal);
    return () => {
      if (startupFrameRef.current !== undefined) {
        window.cancelAnimationFrame(startupFrameRef.current);
        startupFrameRef.current = undefined;
      }
    };
  }, [animationSpeed, onStartupRevealComplete, startupReveal]);

  useEffect(() => {
    if (page !== paginated.page) setPage(paginated.page);
  }, [page, paginated.page]);

  useEffect(() => {
    const existingIds = new Set(projects.map((record) => record.id));
    setCompareIds((current) => {
      const next = current.filter((id) => existingIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [projects]);

  useEffect(() => {
    if (compareOpen && !comparePair) setCompareOpen(false);
  }, [compareOpen, comparePair]);

  useEffect(() => {
    if (projects.length === 0) {
      if (selectedId) {
        clearStoredSelectedId();
        setSelectedId(undefined);
      }
      return;
    }
    const selectedIsVisible = selectedId
      ? visible.some((record) => record.id === selectedId)
      : false;
    if (selectedIsVisible) return;
    if (selectedId) {
      const exists = projects.some((record) => record.id === selectedId);
      if (exists) {
        // Selección oculta por filtros: se conserva para no perder contexto y
        // evitar que el detalle salte a otro proyecto. El usuario ve el
        // detalle del proyecto seleccionado aunque el filtro lo oculte.
        return;
      }
      // La selección borrada no debe reaparecer como otra selección implícita.
      clearStoredSelectedId();
      setSelectedId(undefined);
    }
  }, [projects, selectedId, visible]);

  useEffect(() => {
    if (creating) return;
    // Sin opener no hay una acción que devolverle el foco; evita enfocar
    // "Nueva tienda" en el primer montaje del dashboard.
    const opener = createOpenerRef.current;
    createOpenerRef.current = null;
    if (!opener?.isConnected) return;
    const frame = requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [creating]);

  useEffect(() => {
    const dialog = shutdownDialogRef.current;
    if (!dialog) return;
    if (shutdownDialogOpen && !dialog.open) dialog.showModal();
    if (!shutdownDialogOpen && dialog.open) {
      dialog.close();
      const opener = shutdownOpenerRef.current;
      shutdownOpenerRef.current = null;
      if (!opener?.isConnected) return;
      const frame = requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
  }, [shutdownDialogOpen]);

  useEffect(() => {
    if (shutdownTerminal === true) shutdownTerminalRef.current = true;
  }, [shutdownTerminal]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/__solara/session", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = (await response.json()) as { managed?: boolean };
        return body.managed === true;
      })
      .then((managed) => {
        setShutdownState(managed ? "available" : "unavailable");
        onSessionManaged?.(managed);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setShutdownState("unavailable");
        onSessionManaged?.(false);
      });
    return () => controller.abort();
  }, [onSessionManaged]);

  useEffect(() => {
    const openShutdown = () => {
      if (shutdownTerminalRef.current) return;
      shutdownOpenerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setShutdownDialogOpen(true);
    };
    window.addEventListener("solara:open-shutdown", openShutdown);
    return () => window.removeEventListener("solara:open-shutdown", openShutdown);
  }, []);

  useEffect(() => {
    if (selected) {
      lastSelectedIdRef.current = selected.id;
      if (focusCardOnSelectRef.current) {
        focusCardOnSelectRef.current = false;
        requestAnimationFrame(() => cardButtonRefs.current.get(selected.id)?.focus());
      }
      return;
    }
    const lastSelectedId = lastSelectedIdRef.current;
    if (!lastSelectedId) return;
    requestAnimationFrame(() => {
      const card =
        cardButtonRefs.current.get(lastSelectedId) ??
        document.querySelector<HTMLButtonElement>(`[data-store-card-id="${lastSelectedId}"]`);
      card?.focus();
    });
  }, [selected]);

  useEffect(() => () => window.clearTimeout(actionNoticeTimerRef.current), []);

  const openCreate = useCallback(() => {
    const activeElement = document.activeElement;
    createOpenerRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : createButtonRef.current;
    setCreating(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreating(false);
  }, []);

  const selectCard = useCallback((id: string, options?: { focusCard?: boolean }) => {
    if (options?.focusCard) focusCardOnSelectRef.current = true;
    writeStoredSelectedId(id);
    setSelectedId(id);
  }, []);

  const clearSelected = useCallback(() => {
    clearStoredSelectedId();
    setSelectedId(undefined);
  }, []);

  const changeQuery = useCallback((next: string) => {
    setQuery(next);
    setPage(1);
  }, []);

  const changeSort = useCallback((next: DashboardSort) => {
    writeStoredSort(next);
    setSort(next);
    setPage(1);
  }, []);

  const changeStatusFilter = useCallback((next: DashboardStatusFilter) => {
    writeStoredStatusFilter(next);
    setStatusFilter(next);
    setPage(1);
  }, []);

  const changeView = useCallback((next: DashboardView) => {
    writeStoredView(next);
    setView(next);
    setPage(1);
  }, []);

  const openStore = useCallback(
    (id: string) => {
      if (openingStoreId) return;
      const record = projects.find((item) => item.id === id);
      if (!record) return;

      if (launchFrameRef.current !== undefined) {
        window.cancelAnimationFrame(launchFrameRef.current);
      }
      const token = `${id}:${performance.now()}`;
      const startedAt = performance.now();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = (reducedMotion ? 240 : GARGANTUA_LAUNCH_DURATION_MS) / animationSpeed;
      const handoffAt = reducedMotion ? 0.46 : GARGANTUA_LAUNCH_HANDOFF;
      launchTokenRef.current = token;
      launchHandoffRef.current = false;
      setOpeningStoreId(id);
      setLaunchProgress(0);

      const animateLaunch = (now: number) => {
        if (launchTokenRef.current !== token) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        setLaunchProgress(progress);
        if (progress >= handoffAt && !launchHandoffRef.current) {
          launchHandoffRef.current = true;
          void Promise.resolve(onOpen(id)).catch(() => {
            if (launchTokenRef.current !== token) return;
            launchTokenRef.current = undefined;
            launchHandoffRef.current = false;
            setOpeningStoreId(undefined);
            setLaunchProgress(0);
          });
        }
        if (progress < 1) {
          launchFrameRef.current = window.requestAnimationFrame(animateLaunch);
        } else {
          launchFrameRef.current = undefined;
        }
      };

      launchFrameRef.current = window.requestAnimationFrame(animateLaunch);
    },
    [animationSpeed, onOpen, openingStoreId, projects],
  );

  useEffect(
    () => () => {
      if (launchFrameRef.current !== undefined) {
        window.cancelAnimationFrame(launchFrameRef.current);
      }
    },
    [],
  );

  const togglePin = useCallback((id: string) => {
    setPinnedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writePinnedIds(next);
      return next;
    });
  }, []);

  const announceAction = useCallback((message: string) => {
    setActionNotice(message);
    window.clearTimeout(actionNoticeTimerRef.current);
    actionNoticeTimerRef.current = window.setTimeout(() => setActionNotice(""), 5000);
  }, []);

  const { success } = useToast();

  const doArchive = useCallback(
    async (id: string, archived: boolean) => {
      // Restaurar debe devolver el foco a la card: la refresh posterior
      // re-renderiza `projects` y el efecto de selección enfocaría el panel;
      // la bandera hace que ese mismo efecto enfoque la card restaurada.
      if (!archived) focusCardOnSelectRef.current = true;
      setArchivingId(id);
      try {
        await onArchive(id, archived);
        setArchivingId(undefined);
      } catch {
        setArchivingId(undefined);
        focusCardOnSelectRef.current = false;
        // el error ya quedó visible en el banner global del dashboard
        return;
      }
      const record = projects.find((item) => item.id === id);
      if (archived) {
        success(`Tienda "${record?.name ?? "archivada"}" archivada.`, undefined, {
          label: "Deshacer",
          onAction: () => {
            void doArchive(id, false);
          },
        });
        return;
      }
      success(`Tienda "${record?.name ?? "restaurada"}" restaurada.`);
    },
    [onArchive, projects, success],
  );

  const handleArchive = useCallback(
    (id: string, archived: boolean): Promise<void> => {
      if (archived) {
        setPendingArchiveId(id);
        return Promise.resolve();
      }
      return doArchive(id, false);
    },
    [doArchive],
  );

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      const record = projects.find((item) => item.id === id);
      setDeletingId(id);
      try {
        await onDelete(id);
      } catch (reason) {
        setDeletingId(undefined);
        throw reason instanceof Error ? reason : new Error("No se pudo eliminar la tienda.");
      }
      setDeletingId(undefined);
      setPinnedIds((current) => {
        if (!current.includes(id)) return current;
        const next = current.filter((item) => item !== id);
        writePinnedIds(next);
        return next;
      });
      success(`Tienda "${record?.name ?? "eliminada"}" eliminada.`);
    },
    [onDelete, projects, success],
  );

  const pendingArchiveRecord = projects.find((item) => item.id === pendingArchiveId) ?? null;

  const visibleRef = useRef<StoredProject[]>(pageVisible);
  // La navegación horizontal debe seguir la lectura visual: las fijadas se
  // renderizan primero y luego continúa el resto de la página.
  visibleRef.current = [...pinnedVisible, ...restVisible];

  const moveCardSelection = useCallback(
    (key: string, fromId: string) => {
      const ids = visibleRef.current.map((record) => record.id);
      if (ids.length === 0) return;
      const fromIndex = ids.indexOf(fromId);
      if (fromIndex === -1) return;
      if (key !== "ArrowUp" && key !== "ArrowDown") {
        const delta = key === "ArrowRight" ? 1 : -1;
        const nextId = ids[(fromIndex + delta + ids.length) % ids.length];
        if (nextId) {
          selectCard(nextId, { focusCard: true });
          // Si la card destino ya era la seleccionada, React no cambia el
          // estado y el efecto de foco no se dispara; el teclado igual debe
          // seguir la lectura visual después de fijar una tienda.
          requestAnimationFrame(() => cardButtonRefs.current.get(nextId)?.focus());
        }
        return;
      }
      const goingDown = key === "ArrowDown";
      const fromRect = cardButtonRefs.current.get(fromId)?.getBoundingClientRect();
      if (!fromRect) return;
      let bestIndex = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let index = 0; index < ids.length; index++) {
        if (index === fromIndex) continue;
        const candidateId = ids[index];
        if (!candidateId) continue;
        const rect = cardButtonRefs.current.get(candidateId)?.getBoundingClientRect();
        if (!rect) continue;
        const deltaY = goingDown ? rect.top - fromRect.top : fromRect.top - rect.top;
        if (deltaY < -4) continue;
        const fromCenterX = fromRect.left + fromRect.width / 2;
        const centerX = rect.left + rect.width / 2;
        const score = Math.abs(centerX - fromCenterX) * 100 + Math.abs(deltaY);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      const bestId = ids[bestIndex];
      if (bestId) selectCard(bestId, { focusCard: true });
    },
    [selectCard],
  );

  const handleCardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, record: StoredProject) => {
      const target = event.target as HTMLElement;
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelected();
        return;
      }
      const onCardControl = target.hasAttribute("data-store-card-id");
      if (!onCardControl) return;
      if (event.key === "Enter") {
        if (target.hasAttribute("data-store-card-id")) {
          event.preventDefault();
          selectCard(record.id);
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (record.status === "archived") return;
        event.preventDefault();
        void handleArchive(record.id, true);
        return;
      }
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        moveCardSelection(event.key, record.id);
      }
    },
    [clearSelected, handleArchive, moveCardSelection, selectCard],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        creating ||
        shutdownDialogOpen ||
        shutdownState === "closing" ||
        duplicateTarget !== undefined ||
        compareOpen ||
        pendingArchiveId !== null
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        openCreate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    creating,
    openCreate,
    shutdownDialogOpen,
    shutdownState,
    duplicateTarget,
    compareOpen,
    pendingArchiveId,
  ]);

  const requestShutdown = async () => {
    if (shutdownTerminalRef.current) return;
    setShutdownState("closing");
    setShutdownError("");
    try {
      const response = await fetch("/__solara/shutdown", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("El servidor no aceptó el cierre.");
      shutdownTerminalRef.current = true;
      setShutdownDialogOpen(false);
      setShutdownState("closed");
      onShutdownTerminal?.(true);
    } catch {
      if (!shutdownTerminalRef.current) setShutdownState("available");
      setShutdownError("No se pudo detener el servidor local.");
    }
  };

  const createBackup = async (id: string) => {
    setBackupId(id);
    try {
      await onBackup(id);
      announceAction("Se creó un respaldo.");
    } catch {
      // el error ya quedó visible en el banner global del dashboard
    } finally {
      setBackupId(undefined);
    }
  };

  const openSite = async (id: string) => {
    if (!onOpenSite) return;
    setSiteOpeningId(id);
    try {
      await onOpenSite(id);
    } catch {
      // el error ya quedó visible en el banner global del dashboard
    } finally {
      setSiteOpeningId(undefined);
    }
  };

  const openDuplicate = async (id: string) => {
    setDuplicateTarget(projects.find((record) => record.id === id));
  };

  const closeDuplicate = () => {
    const id = duplicateTarget?.id;
    setDuplicateTarget(undefined);
    if (!id) return;
    requestAnimationFrame(() => cardButtonRefs.current.get(id)?.focus());
  };

  const confirmDuplicate = async (id: string, name: string) => {
    // Simetría con el camino de cancelar: la refresh posterior re-renderiza
    // `projects` y el efecto de selección robaría el foco al panel de detalle;
    // la bandera hace que ese mismo efecto enfoque la card de origen.
    focusCardOnSelectRef.current = true;
    try {
      await onDuplicate(id, name);
    } catch (reason) {
      focusCardOnSelectRef.current = false;
      // el DuplicateDialog muestra el error inline y mantiene el diálogo abierto
      throw reason instanceof Error ? reason : new Error("No se pudo duplicar la tienda.");
    }
    setDuplicateTarget(undefined);
    success("Tienda duplicada.");
    requestAnimationFrame(() => cardButtonRefs.current.get(id)?.focus());
  };

  const toggleCompare = () => {
    if (compareMode) {
      setCompareMode(false);
      setCompareIds([]);
      setCompareOpen(false);
      return;
    }
    setCompareMode(true);
  };

  const toggleCompareId = useCallback((id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return current;
      return [...current, id];
    });
  }, []);

  const backupAll = async () => {
    if (!managed || backingUp) return;
    const targets = projects.filter((record) => record.status === "active");
    if (targets.length === 0) return;
    setBackingUp(`1 de ${targets.length}`);
    let failed = 0;
    let firstError = "";
    try {
      for (let index = 0; index < targets.length; index += 1) {
        setBackingUp(`${index + 1} de ${targets.length}`);
        const target = targets[index];
        if (!target) continue;
        try {
          await onBackup(target.id);
        } catch (reason) {
          failed += 1;
          if (!firstError) {
            firstError = reason instanceof Error ? reason.message : "No se pudo crear el respaldo.";
          }
        }
      }
    } finally {
      setBackingUp(undefined);
    }
    success(
      bulkBackupToastMessage({
        total: targets.length,
        failed,
        ...(firstError ? { firstError } : {}),
      }),
    );
  };

  const openFolder = async (id: string) => {
    if (!onOpenFolder) return;
    setFolderOpeningId(id);
    try {
      await onOpenFolder(id);
    } catch {
      // el error ya quedó visible en el banner global del dashboard
    } finally {
      setFolderOpeningId(undefined);
    }
  };

  const downloadBackup = async (id: string) => {
    if (!onDownloadBackup) return;
    setDownloadingId(id);
    try {
      await onDownloadBackup(id);
      announceAction("Respaldo descargado.");
    } catch {
      // el error ya quedó visible en el banner global del dashboard
    } finally {
      setDownloadingId(undefined);
    }
  };

  const openingStore = openingStoreId
    ? projects.find((record) => record.id === openingStoreId)
    : undefined;
  const isDashboardEntering = startupReveal && startupProgress > 0;

  return (
    <main
      id={"tiendas"}
      tabIndex={-1}
      style={transitionStyle}
      className={`dashboard-page dashboard-cosmic dashboard-gargantua${
        openingStoreId ? " is-store-launching" : ""
      }${isDashboardEntering ? " is-dashboard-entering" : ""}`}
      aria-busy={openingStoreId || isDashboardEntering ? "true" : undefined}
    >
      <GravityField
        settings={gravitySettings}
        activeIndex={selectedId ? (pageIndexById.get(selectedId) ?? 0) : 0}
        selectionVisible={Boolean(
          selectedId && !selectedFilteredOut && pageIndexById.has(selectedId),
        )}
        storeCount={pageVisible.length}
        templateSelected={Boolean(selected && isBaseTemplate(selected.project))}
        launchProgress={openingStoreId ? launchProgress : startupProgress}
      />
      {isDashboardEntering ? (
        <output
          className="dashboard-gargantua-transition dashboard-gargantua-transition--reverse"
          data-testid="gargantua-entry"
          aria-hidden="true"
        />
      ) : null}
      {openingStoreId ? (
        <output
          className="dashboard-gargantua-transition"
          data-testid="gargantua-launch"
          aria-live="polite"
        >
          <span className="visually-hidden">Abriendo {openingStore?.name ?? "la tienda"}.</span>
        </output>
      ) : null}
      <div
        className="dashboard-wrap dashboard-cosmic__content"
        aria-hidden={settingsOpen || isDashboardEntering ? "true" : undefined}
      >
        {isShutdownTerminal ? (
          <output className="shutdown-status shutdown-status--cosmic">
            <CheckCircle aria-hidden size={18} />
            <span>
              <strong>Servidor local detenido.</strong> Podés cerrar esta pestaña del navegador.
            </span>
          </output>
        ) : null}

        <section className="dashboard-cosmic-library" aria-labelledby={libraryTitleId}>
          <div className="dashboard-cosmic-command-bar">
            <header className="dashboard-cosmic-library-head">
              <div className="dashboard-cosmic-library-heading">
                <h1 id={libraryTitleId}>Tus tiendas</h1>
                <span className="dashboard-cosmic-library-summary" aria-hidden="true">
                  {mainVisible.length}{" "}
                  {mainVisible.length === 1 ? "tienda visible" : "tiendas visibles"}
                </span>
                <span className="dashboard-cosmic-library-stat">
                  <strong>{dashboardStats.activeProducts.toLocaleString("es-AR")}</strong>
                  <span>Productos activos</span>
                </span>
              </div>
              <Button ref={createButtonRef} variant="primary" icon={Plus} onClick={openCreate}>
                Nueva tienda
              </Button>
            </header>
            <DashboardToolbar
              query={query}
              statusFilter={statusFilter}
              sort={sort}
              view={view}
              searchRef={searchInputRef}
              onQueryChange={changeQuery}
              onStatusFilterChange={changeStatusFilter}
              onSortChange={changeSort}
              onViewChange={changeView}
            />

            <div className="dashboard-cosmic-actions">
              <Button icon={GitDiff} aria-pressed={compareMode} onClick={toggleCompare}>
                Comparar tiendas
              </Button>
              <Button
                icon={CloudArrowDown}
                disabled={!managed || backingUp !== undefined}
                loading={backingUp !== undefined}
                aria-describedby={
                  !managed && shutdownState === "unavailable" ? backupHintId : undefined
                }
                title={
                  managed
                    ? undefined
                    : "En modo navegador los respaldos se descargan por tienda. Usá el botón de cada tienda."
                }
                onClick={() => void backupAll()}
              >
                {backingUp !== undefined ? `Respaldando ${backingUp}` : "Respaldar todo"}
              </Button>
              {!managed && shutdownState === "unavailable" ? (
                <span id={backupHintId} className="dashboard-cosmic-actions__hint">
                  En modo navegador, descargá el respaldo desde cada tienda.
                </span>
              ) : null}
              {!compareMode ? (
                <span className="dashboard-cosmic-actions__legend">
                  <strong>Seleccionar</strong>
                  <span>revisar</span>
                  <span aria-hidden="true">·</span>
                  <strong>Abrir</strong>
                  <span>editar</span>
                </span>
              ) : null}
              <span className="dashboard-cosmic-shortcuts">
                <span>Atajos</span>
                <kbd>/</kbd>
                <span>buscar</span>
                <span aria-hidden="true">·</span>
                <kbd>N</kbd>
                <span>nueva</span>
                <span aria-hidden="true">·</span>
                <kbd>Enter</kbd>
                <span>revisar</span>
                <span aria-hidden="true">·</span>
                <kbd>doble clic</kbd>
                <span>abrir</span>
              </span>
              {compareMode ? (
                <div className="dashboard-cosmic-comparebar">
                  <span className="dashboard-cosmic-comparebar__count" aria-live="polite">
                    {compareIds.length === 2
                      ? "2 tiendas seleccionadas"
                      : compareIds.length === 1
                        ? "1 tienda seleccionada"
                        : "Elegí 2 tiendas para comparar"}
                  </span>
                  <Button
                    variant="primary"
                    icon={GitDiff}
                    disabled={compareIds.length !== 2}
                    onClick={() => setCompareOpen(true)}
                  >
                    Comparar
                  </Button>
                  <Button variant="quiet" onClick={toggleCompare}>
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <span
            className="dashboard-cosmic-count visually-hidden"
            aria-live="polite"
            aria-atomic="true"
          >
            {mainVisible.length} visibles
          </span>

          <div
            className={`dashboard-cosmic-results dashboard-cosmic-results--${view}${
              denseGrid ? " dashboard-cosmic-results--dense-grid" : ""
            }`}
          >
            <div className="dashboard-cosmic-store-groups">
              {mainVisible.length === 0 ? (
                <EmptyState
                  icon={Storefront}
                  title={
                    projects.length === 0
                      ? "Todavía no hay tiendas"
                      : visible.length === 0
                        ? "No hay coincidencias"
                        : "Sólo queda la plantilla protegida"
                  }
                  body={
                    projects.length === 0
                      ? "Creá una tienda para empezar a organizar tu catálogo."
                      : selectedFilteredOut
                        ? "Probá con otra búsqueda o limpiá los filtros activos. La tienda seleccionada sigue abierta en el detalle."
                        : visible.length === 0
                          ? "Probá con otra búsqueda o limpiá los filtros activos."
                          : "La plantilla protegida se mantiene en el panel lateral. Creá una tienda para comenzar."
                  }
                  action={
                    projects.length === 0 ? (
                      <Button variant="primary" icon={Plus} onClick={openCreate}>
                        Crear primera tienda
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <>
                  {pinnedVisible.length > 0 ? (
                    <section
                      className="dashboard-cosmic-group"
                      aria-labelledby={pinnedGroupTitleId}
                    >
                      <h3 id={pinnedGroupTitleId}>Fijadas</h3>
                      <div className="dashboard-cosmic-store-grid">
                        {pinnedVisible.map((record) => (
                          <DashboardStoreCard
                            key={record.id}
                            record={record}
                            index={visibleIndexById.get(record.id) ?? 0}
                            isSelected={record.id === selectedId}
                            compareMode={compareMode}
                            isCompared={compareIds.includes(record.id)}
                            cardButtonRefs={cardButtonRefs}
                            onOpen={openStore}
                            onSelect={selectCard}
                            onToggleCompare={toggleCompareId}
                            onKeyDown={handleCardKeyDown}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <section className="dashboard-cosmic-group">
                    {pinnedVisible.length > 0 ? <h3>Todas</h3> : null}
                    <div className="dashboard-cosmic-store-grid">
                      {restVisible.map((record) => (
                        <DashboardStoreCard
                          key={record.id}
                          record={record}
                          index={visibleIndexById.get(record.id) ?? 0}
                          isSelected={record.id === selectedId}
                          compareMode={compareMode}
                          isCompared={compareIds.includes(record.id)}
                          cardButtonRefs={cardButtonRefs}
                          onOpen={openStore}
                          onSelect={selectCard}
                          onToggleCompare={toggleCompareId}
                          onKeyDown={handleCardKeyDown}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}
              {mainVisible.length > 0 ? (
                <nav className="dashboard-cosmic-pagination" aria-label="Páginas de tiendas">
                  <div className="dashboard-cosmic-pagination__summary">
                    <strong aria-live="polite" aria-atomic="true">
                      Página {paginated.page} de {paginated.pageCount}
                    </strong>
                    <span>
                      {paginated.startIndex + 1}–{paginated.endIndex} de {mainVisible.length}
                    </span>
                  </div>
                  <div className="dashboard-cosmic-pagination__actions">
                    <Button
                      variant="quiet"
                      icon={CaretLeft}
                      aria-label="Página anterior"
                      disabled={paginated.page === 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="quiet"
                      icon={CaretRight}
                      aria-label="Página siguiente"
                      disabled={paginated.page === paginated.pageCount}
                      onClick={() =>
                        setPage((current) => Math.min(paginated.pageCount, current + 1))
                      }
                    >
                      Siguiente
                    </Button>
                  </div>
                </nav>
              ) : null}
            </div>

            <div className="dashboard-cosmic-side">
              <ProjectCard
                project={selected}
                isFilteredOut={selectedFilteredOut}
                detailRef={selectedPanelRef}
                backupId={backupId}
                archivingId={archivingId}
                deletingId={deletingId}
                siteOpeningId={siteOpeningId}
                folderOpeningId={folderOpeningId}
                downloadingId={downloadingId}
                actionNotice={actionNotice}
                isPinned={selected ? pinnedIds.includes(selected.id) : false}
                onClose={clearSelected}
                onOpen={openStore}
                onPin={togglePin}
                onOpenSite={onOpenSite ? openSite : undefined}
                onOpenFolder={onOpenFolder ? openFolder : undefined}
                onBackup={createBackup}
                onDownloadBackup={onDownloadBackup ? downloadBackup : undefined}
                onDuplicate={openDuplicate}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            </div>
          </div>
        </section>
      </div>

      <CreateStoreDialog
        open={creating}
        onCreate={onCreate}
        onImport={onImport}
        onClose={closeCreate}
      />

      <dialog
        ref={shutdownDialogRef}
        className="shutdown-dialog shutdown-dialog--cosmic"
        aria-labelledby={shutdownTitleId}
        onCancel={(event) => {
          event.preventDefault();
          if (shutdownState !== "closing") setShutdownDialogOpen(false);
        }}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (shutdownState !== "closing") void requestShutdown();
          }}
        >
          <p className="shutdown-dialog__eyebrow">Sesión local</p>
          <h2 id={shutdownTitleId}>¿Cerrar SolaraCommerce?</h2>
          <p>Se detendrá el servidor local. Tus tiendas y respaldos no se borran.</p>
          {shutdownError ? <InlineError>{shutdownError}</InlineError> : null}
          <div className="shutdown-dialog__actions">
            <Button
              variant="quiet"
              type="button"
              disabled={shutdownState === "closing"}
              onClick={() => setShutdownDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button variant="danger" type="submit" disabled={shutdownState === "closing"}>
              {shutdownState === "closing" ? "Cerrando..." : "Cerrar y detener"}
            </Button>
          </div>
        </form>
      </dialog>

      <CompareView
        left={comparePair?.left}
        right={comparePair?.right}
        open={compareOpen && comparePair !== undefined}
        onClose={() => setCompareOpen(false)}
      />

      <DuplicateDialog
        project={duplicateTarget}
        onClose={closeDuplicate}
        onDuplicate={confirmDuplicate}
        onDone={() => setDuplicateTarget(undefined)}
      />

      {pendingArchiveRecord ? (
        <ConfirmDialog
          title="Archivar tienda"
          body={`¿Archivar la tienda "${pendingArchiveRecord.name}"? Podés restaurarla después desde el filtro de archivadas.`}
          confirmLabel="Archivar"
          cancelLabel="Cancelar"
          danger
          onConfirm={() => {
            const id = pendingArchiveRecord.id;
            setPendingArchiveId(null);
            void doArchive(id, true);
          }}
          onCancel={() => setPendingArchiveId(null)}
        />
      ) : null}
    </main>
  );
}
