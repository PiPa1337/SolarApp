/** Panel de exportación que distingue draft/production y muestra bloqueos accionables. */
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  Circle,
  DownloadSimple,
  FileArchive,
  ShieldCheck,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import type { OptimizationReport } from "@solara/exporter";
import { publicWhatsAppPhone } from "@solara/exporter";
import type { StoreProjectV1 } from "@solara/project-schema";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  ExportProgressDialog,
  type ExportProgressTask,
} from "../components/ExportProgressDialog";
import { Button, InlineError, SectionHeader } from "../components/Ui";
import {
  type CloudflareVerificationResult,
  verifyCloudflareDeployment,
} from "../lib/cloudflareVerification";
import {
  clearExportHistory,
  type ExportHistoryEntry,
  readExportHistory,
  recordExport,
} from "../lib/exportHistory";
import { formatDate } from "../lib/format";
import { downloadBlob } from "../lib/projectArchive";
import { chooseExportDirectory, writeSiteToDirectory } from "../lib/siteExport";
import {
  auditProjectInWorker,
  createProjectArchiveInWorker,
  exportSiteInWorker,
  readProjectArchiveInWorker,
  recoverProjectFromFolderInWorker,
  recoverProjectFromUrlInWorker,
  type ExportProgressEvent,
  type ExportTaskId,
} from "../lib/workers";
import { WorkspaceGroups } from "./workbench/WorkspaceNav";

const EXPORT_TASKS: ReadonlyArray<{ id: ExportTaskId | "write"; label: string }> = [
  { id: "validate", label: "Validar proyecto" },
  { id: "social-crops", label: "Generar recortes sociales" },
  { id: "recovery", label: "Preparar bóveda de recuperación" },
  { id: "render", label: "Generar archivos del sitio" },
  { id: "write", label: "Escribir y verificar la carpeta" },
];

type ExportProgressState = {
  tasks: ExportProgressTask[];
  percent: number;
};

function createExportProgress(mode: "draft" | "production"): ExportProgressState {
  const tasks = EXPORT_TASKS.filter(
    (task) => mode === "production" || (task.id !== "social-crops" && task.id !== "write"),
  ).map((task) => ({ ...task, status: "pending" as const }));
  return { tasks, percent: 0 };
}

function calculateExportPercent(tasks: readonly ExportProgressTask[]): number {
  if (tasks.length === 0) return 0;
  const completedUnits = tasks.reduce((total, task) => {
    if (task.status === "complete") return total + 1;
    if (task.status === "active" && task.id === "write" && task.total) {
      return total + Math.min(1, (task.current ?? 0) / task.total);
    }
    return total;
  }, 0);
  return Math.round((completedUnits / tasks.length) * 100);
}

function updateExportTask(
  state: ExportProgressState,
  id: string,
  update: Partial<ExportProgressTask>,
): ExportProgressState {
  const tasks = state.tasks.map((task) => (task.id === id ? { ...task, ...update } : task));
  return { tasks, percent: calculateExportPercent(tasks) };
}

function applyWorkerProgress(
  state: ExportProgressState,
  event: ExportProgressEvent,
): ExportProgressState {
  return updateExportTask(state, event.task, { status: event.status });
}

function applyWriteProgress(
  state: ExportProgressState,
  current: number,
  total: number,
): ExportProgressState {
  return updateExportTask(state, "write", {
    status: current >= total ? "complete" : "active",
    current,
    total,
  });
}

function activeExportTask(state: ExportProgressState): ExportProgressTask | undefined {
  return state.tasks.find((task) => task.status === "active");
}

export function ExportPanel({
  project,
  onImport,
  onOpenSite,
  onNavigate,
}: {
  project: StoreProjectV1;
  onImport(project: StoreProjectV1): Promise<void>;
  onOpenSite?(id: string): Promise<void>;
  onNavigate(destination: "seo"): void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const recoveryFolderRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"draft" | "production" | "project" | "import" | "recovery" | "">(
    "",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [critical, setCritical] = useState(0);
  const [auditReady, setAuditReady] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditAttempt, setAuditAttempt] = useState(0);
  const [publicAiContext, setPublicAiContext] = useState(true);
  const [optimization, setOptimization] = useState<OptimizationReport | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "production" | "import" | "recovery" | "history" | ""
  >("");
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [pendingRecoveredProject, setPendingRecoveredProject] = useState<StoreProjectV1 | null>(
    null,
  );
  const [history, setHistory] = useState<ExportHistoryEntry[]>(() =>
    readExportHistory(project.slug),
  );
  const [postDone, setPostDone] = useState<Set<string>>(new Set());
  const [siteOpening, setSiteOpening] = useState(false);
  const [publishedSiteUrl, setPublishedSiteUrl] = useState(project.baseUrl);
  const [recoveryUrl, setRecoveryUrl] = useState("");
  const [cloudflareVerification, setCloudflareVerification] =
    useState<CloudflareVerificationResult | null>(null);
  const [cloudflareBusy, setCloudflareBusy] = useState(false);
  const [cloudflareChecklist, setCloudflareChecklist] = useState<Set<string>>(new Set());
  /* biome-ignore lint/correctness/useExhaustiveDependencies: auditAttempt es la clave de reintento de la auditoría tras un fallo. */
  useEffect(() => {
    let active = true;
    setAuditReady(false);
    setAuditError("");
    void auditProjectInWorker(project, publicAiContext)
      .then(({ criticalCount, optimization }) => {
        if (active) {
          setCritical(criticalCount);
          setOptimization(optimization);
          setAuditReady(true);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          const detail = reason instanceof Error ? reason.message : "";
          setAuditError(
            detail
              ? `No se pudo cargar la auditoría: ${detail}`
              : "No se pudo cargar la auditoría.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [project, publicAiContext, auditAttempt]);

  const recordHistory = (entry: Omit<ExportHistoryEntry, "at">) => {
    setHistory(recordExport(project.slug, entry.mode, entry));
  };

  const clearHistory = () => {
    setHistory([]);
    clearExportHistory(project.slug);
  };

  const exportSite = async (mode: "draft" | "production") => {
    setBusy(mode);
    setError("");
    setNotice("");
    setExportDone(false);
    try {
      const exportDirectory = mode === "production" ? await chooseExportDirectory() : undefined;
      if (mode === "production" && !exportDirectory) {
        setNotice("Exportación cancelada. No se modificó ninguna carpeta.");
        return;
      }
      setExportProgress(createExportProgress(mode));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const result = await exportSiteInWorker(
        project,
        mode,
        {
          publicAiContext,
          optimizationProfile: "safe",
          includeRecovery: true,
        },
        (event) => {
          setExportProgress((current) =>
            current ? applyWorkerProgress(current, event) : current,
          );
        },
      );
      setOptimization(result.optimization);
      const savedSite = exportDirectory
        ? await writeSiteToDirectory(exportDirectory, result.files, mode, ({ current, total }) => {
            setExportProgress((state) => (state ? applyWriteProgress(state, current, total) : state));
          })
        : undefined;
      setExportProgress((current) => {
        if (!current) return current;
        const tasks = current.tasks.map((task) => ({ ...task, status: "complete" as const }));
        return { tasks, percent: 100 };
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
      recordHistory({
        mode,
        score: result.optimization.score,
        critical: result.criticalCount,
      });
      setExportDone(true);
      setExportProgress(null);
      setPostDone(new Set());
      setNotice(
        savedSite
          ? `Exportación correcta: ${savedSite.filesWritten} archivos guardados en ${savedSite.folder}.`
          : onOpenSite
            ? "Exportación correcta. El sitio público se guarda en proyectos/<tienda>/sitios/ al guardar con el lanzador; podés abrirlo desde el dashboard."
            : "Exportación correcta. En modo navegador el sitio generado no se conserva en disco; usá el lanzador de SolaraCommerce para guardarlo y abrirlo.",
      );
    } catch (reason) {
      setExportProgress(null);
      setError(reason instanceof Error ? reason.message : "No se pudo exportar la tienda.");
    } finally {
      setBusy("");
    }
  };

  const backup = async () => {
    setBusy("project");
    setError("");
    const busyStartedAt = performance.now();
    try {
      // Garantiza que el estado "creando respaldo" llegue a pintarse incluso
      // cuando el worker ya está caliente y termina en el mismo tick. Dos
      // frames dejan que React commitée el estado antes de resolver el worker.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const archive = await createProjectArchiveInWorker(project);
      // Un respaldo pequeño puede terminar antes de que el usuario llegue a
      // percibir el estado ocupado. Mantenerlo visible brevemente conserva el
      // feedback y evita que los controles parezcan haber ignorado el click.
      const remainingBusyMs = 180 - (performance.now() - busyStartedAt);
      if (remainingBusyMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remainingBusyMs));
      }
      downloadBlob(archive, `${project.slug}.solara.json`, "application/vnd.solara.project+json");
      setNotice("Respaldo descargado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear el respaldo.");
    } finally {
      setBusy("");
    }
  };

  const importArchive = async (file: File) => {
    setBusy("import");
    setError("");
    try {
      await onImport(await readProjectArchiveInWorker(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo importar el proyecto.");
    } finally {
      setBusy("");
    }
  };

  const recoverFromUrl = async () => {
    const value = recoveryUrl.trim();
    if (!value) {
      setError("Pegá la URL completa del manifest de recuperación.");
      return;
    }
    setBusy("recovery");
    setError("");
    try {
      setPendingRecoveredProject(await recoverProjectFromUrlInWorker(value));
      setConfirmAction("recovery");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo recuperar el proyecto.");
    } finally {
      setBusy("");
    }
  };

  const recoverFromFolder = async (files: File[]) => {
    setBusy("recovery");
    setError("");
    try {
      setPendingRecoveredProject(await recoverProjectFromFolderInWorker(files));
      setConfirmAction("recovery");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo recuperar el proyecto.");
    } finally {
      setBusy("");
    }
  };

  const importRecoveredProject = async (recovered: StoreProjectV1) => {
    setBusy("import");
    setError("");
    try {
      await onImport(recovered);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo aplicar la recuperación.");
    } finally {
      setBusy("");
    }
  };

  const togglePostItem = (id: string) => {
    setPostDone((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSite = async () => {
    if (!onOpenSite || siteOpening) return;
    setSiteOpening(true);
    setError("");
    try {
      await onOpenSite(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir el sitio.");
    } finally {
      setSiteOpening(false);
    }
  };

  const navigateToSeo = () => {
    onNavigate("seo");
    requestAnimationFrame(() => {
      document.getElementById("studio-tab-seo")?.focus();
    });
  };

  const verifyCloudflare = async () => {
    setCloudflareBusy(true);
    setCloudflareVerification(null);
    try {
      setCloudflareVerification(await verifyCloudflareDeployment(publishedSiteUrl));
    } finally {
      setCloudflareBusy(false);
    }
  };

  const toggleCloudflareCheck = (id: string) => {
    setCloudflareChecklist((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const externalHosts = Array.from(
    new Set(
      project.assets
        .flatMap((asset) => [
          asset.source,
          asset.fallbackSource ?? "",
          ...(asset.responsiveSources?.map((source) => source.source) ?? []),
        ])
        .concat(project.videos.map((video) => video.source))
        .flatMap((source) => {
          try {
            return /^https?:\/\//i.test(source) ? [new URL(source).hostname] : [];
          } catch {
            return [];
          }
        }),
    ),
  );
  if (publicWhatsAppPhone(project)) externalHosts.push("wa.me");
  externalHosts.sort();

  const postItems = [
    {
      id: "site",
      title: "Abrir el sitio",
      detail: "Con el lanzador, el sitio queda en proyectos/<tienda>/sitios/ listo para publicar.",
      action: onOpenSite ? (
        <Button
          variant="quiet"
          size="sm"
          icon={ArrowUpRight}
          data-testid="ui-export-open-site"
          aria-busy={siteOpening}
          disabled={siteOpening}
          onClick={() => void openSite()}
        >
          {siteOpening ? "Abriendo sitio" : "Abrir sitio"}
        </Button>
      ) : null,
    },
    {
      id: "seo",
      title: "Revisar SEO",
      detail: "Verificá el checklist de publicación y la vista del crawler antes de producir.",
      action: (
        <Button
          variant="quiet"
          size="sm"
          icon={ArrowRight}
          data-testid="ui-export-check-seo"
          onClick={navigateToSeo}
        >
          Ir a SEO
        </Button>
      ),
    },
    {
      id: "production",
      title: "Exportar producción",
      detail: "Cuando no queden errores críticos, generá el sitio final desde la opción de arriba.",
      action: null,
    },
  ];

  const activeTask = exportProgress ? activeExportTask(exportProgress) : undefined;
  const remainingTasks = exportProgress
    ? exportProgress.tasks.filter((task) => task.status !== "complete").length
    : 0;
  const remainingLabel = exportProgress
    ? `Faltan ${100 - exportProgress.percent}% · ${remainingTasks} ${remainingTasks === 1 ? "tarea" : "tareas"}`
    : "";
  const currentLabel = exportProgress?.percent === 100
    ? "Exportación completa. Verificando el resultado…"
    : activeTask
      ? activeTask.id === "write" && activeTask.total !== undefined
        ? `${activeTask.label}… ${activeTask.current ?? 0}/${activeTask.total} archivos`
        : `${activeTask.label}…`
      : "Preparando las tareas de exportación…";

  return (
    <section className="workspace-section">
      <SectionHeader
        title="Exportar"
        description="El respaldo editable y el sitio público son archivos distintos."
      />
      {error ? <InlineError>{error}</InlineError> : null}
      {exportProgress ? (
        <ExportProgressDialog
          mode={busy === "production" ? "production" : "draft"}
          percent={exportProgress.percent}
          remainingLabel={remainingLabel}
          currentLabel={currentLabel}
          tasks={exportProgress.tasks}
        />
      ) : null}
      {busy && !exportProgress ? (
        <output className="export-progress" aria-live="polite" data-testid="ui-export-progress">
          {busy === "draft"
            ? "Generando sitio borrador…"
            : busy === "production"
              ? "Generando sitio de producción…"
              : busy === "project"
                ? "Creando respaldo del proyecto…"
                : busy === "import"
                  ? "Importando respaldo…"
                  : "Descargando y verificando la bóveda…"}
        </output>
      ) : null}
      {notice ? (
        <output className="export-notice" data-testid="ui-export-result">
          {notice}
        </output>
      ) : null}
      {auditError ? (
        <div
          data-testid="ui-audit-error"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "8px",
            margin: "0 0 12px",
          }}
        >
          <InlineError>{auditError}</InlineError>
          <Button
            variant="quiet"
            size="sm"
            data-testid="ui-audit-retry"
            onClick={() => setAuditAttempt((attempt) => attempt + 1)}
          >
            Reintentar auditoría
          </Button>
        </div>
      ) : null}
      {!auditError ? (
        <output
          className={`export-audit-status export-audit-status--${
            auditReady ? (critical > 0 ? "blocked" : "ready") : "loading"
          }`}
          data-testid="ui-export-audit-status"
          aria-live="polite"
        >
          {auditReady ? (
            <>
              {critical > 0 ? (
                <WarningCircle aria-hidden size={17} />
              ) : (
                <CheckCircle aria-hidden size={17} />
              )}
              {critical > 0
                ? `Auditoría lista: ${critical} errores críticos deben resolverse.`
                : "Auditoría lista: la producción está habilitada."}
            </>
          ) : (
            <>
              <span className="spinner" aria-hidden />
              Analizando el proyecto para habilitar la exportación de producción…
            </>
          )}
        </output>
      ) : null}
      {exportDone ? (
        <section
          className="guided-checklist"
          data-testid="ui-export-checklist"
          aria-label="Después de exportar"
        >
          <div className="guided-checklist__header">
            <div>
              <span className="guided-kicker">Siguiente</span>
              <h3>Revisar la exportación</h3>
            </div>
            <span className="guided-checklist__more">Pasos opcionales</span>
          </div>
          <ul>
            {postItems.map((item) => {
              const done = postDone.has(item.id);
              return (
                <li
                  key={item.id}
                  data-testid="ui-export-check-item"
                  data-check-id={item.id}
                  data-done={done}
                >
                  <span
                    className="guided-checklist__status"
                    style={done ? { color: "var(--accent)" } : undefined}
                    aria-hidden
                  >
                    {done ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} />}
                  </span>
                  <span className="guided-checklist__text">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  {item.action ?? (
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={done ? CheckCircle : Circle}
                      aria-pressed={done}
                      data-testid="ui-export-check-toggle"
                      onClick={() => togglePostItem(item.id)}
                    >
                      {done ? "Listo" : "Marcar"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <WorkspaceGroups
        label="Entrega de la tienda"
        groups={[
          {
            id: "generate",
            label: "Generar archivos",
            content: (
              <>
                <div className="export-options">
                  <article>
                    <ShieldCheck aria-hidden size={25} />
                    <div>
                      <h3>Sitio de producción</h3>
                      <p>
                        Genera HTML estático, sitemap, datos estructurados y feed desde el mismo
                        proyecto.
                      </p>
                      {critical > 0 ? (
                        <span className="export-warning">
                          {critical} errores críticos deben resolverse.
                        </span>
                      ) : null}
                    </div>
                    <Button
                      variant="primary"
                      data-testid="ui-export-production"
                      onClick={() => setConfirmAction("production")}
                      disabled={Boolean(busy) || !auditReady || critical > 0}
                    >
                      {busy === "production" ? "Generando" : "Elegir carpeta y exportar"}
                    </Button>
                  </article>
                  <article>
                    <WarningCircle aria-hidden size={25} />
                    <div>
                      <h3>Sitio borrador</h3>
                      <p>Incluye noindex y excluye el feed de Merchant para revisión privada.</p>
                    </div>
                    <Button
                      data-testid="ui-export-draft"
                      onClick={() => void exportSite("draft")}
                      disabled={Boolean(busy)}
                    >
                      {busy === "draft" ? "Generando" : "Exportar borrador"}
                    </Button>
                  </article>
                </div>
                <details className="export-content-options">
                  <summary>Opciones de contenido público</summary>
                  <label className="export-ai-context">
                    <input
                      type="checkbox"
                      data-testid="ui-export-ai-context"
                      checked={publicAiContext}
                      onChange={(event) => setPublicAiContext(event.target.checked)}
                    />
                    Publicar contexto público para agentes (`llms.txt` y `ai-context.json`)
                  </label>
                  {publicAiContext || externalHosts.length > 0 ? (
                    <aside
                      className="audit-panel export-public-exposure"
                      data-testid="ui-export-public-exposure"
                    >
                      <h3>Exposición pública deliberada</h3>
                      {publicAiContext ? (
                        <p>
                          Se publicarán contacto, políticas, SKUs, precios y productos activos para
                          agentes.
                        </p>
                      ) : null}
                      {externalHosts.length > 0 ? (
                        <p>
                          Hosts externos de medios: {externalHosts.join(", ")}. Se mostrarán como
                          advertencias.
                        </p>
                      ) : null}
                    </aside>
                  ) : null}

                  {optimization ? (
                    <output className="optimization-export-summary">
                      <strong>Salud de exportación: {optimization.score}/100</strong>
                      <span>{critical} críticos</span>
                      <span>{optimization.counts.warnings} advertencias</span>
                      <span>{optimization.counts.indexable} rutas indexables</span>
                    </output>
                  ) : null}
                </details>
              </>
            ),
          },
          {
            id: "verify",
            label: "Verificar publicación",
            content: (
              <>
                <section
                  className="audit-panel export-cloudflare-verifier"
                  data-testid="ui-cloudflare-verifier"
                >
                  <header>
                    <div>
                      <h3>Verificar publicación en Cloudflare Pages</h3>
                      <p>
                        La comprobación usa CORS y nunca marca verde si el hosting no expone sus
                        headers.
                      </p>
                    </div>
                  </header>
                  <div className="export-actions">
                    <input
                      aria-label="URL pública para verificar"
                      value={publishedSiteUrl}
                      onChange={(event) => setPublishedSiteUrl(event.target.value)}
                      placeholder={project.baseUrl}
                    />
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => void verifyCloudflare()}
                      disabled={cloudflareBusy}
                    >
                      {cloudflareBusy ? "Verificando…" : "Verificar URL"}
                    </Button>
                  </div>
                  {cloudflareVerification ? (
                    <div
                      data-testid="ui-cloudflare-result"
                      data-status={cloudflareVerification.status}
                    >
                      <p>
                        Resultado:{" "}
                        {cloudflareVerification.status === "pass"
                          ? "verificado"
                          : cloudflareVerification.status === "fail"
                            ? "falló"
                            : "no verificado"}
                        {cloudflareVerification.revision
                          ? ` · revisión ${cloudflareVerification.revision}`
                          : ""}
                      </p>
                      <ul>
                        {cloudflareVerification.checks.map((entry) => (
                          <li key={entry.id} data-status={entry.status}>
                            {entry.label}: {entry.status} — {entry.detail}
                          </li>
                        ))}
                      </ul>
                      {cloudflareVerification.status === "unverified" ? (
                        <pre>{cloudflareVerification.curlCommands.join("\n")}</pre>
                      ) : null}
                    </div>
                  ) : null}
                  <ul aria-label="Checklist manual Cloudflare">
                    {(
                      [
                        ["upload", "Subí únicamente la carpeta hija dedicada"],
                        ["functions", "No hay Pages Functions"],
                        ["previews", "Previews desactivados o protegidos con Access"],
                        ["https", "Dominio HTTPS activo"],
                        ["verified", "Verificación posterior completada"],
                      ] as const
                    ).map(([id, label]) => (
                      <li key={id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={cloudflareChecklist.has(id)}
                            onChange={() => toggleCloudflareCheck(id)}
                          />
                          {label}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <small>
                    Los previews de Cloudflare son públicos por defecto; protegé o eliminá las
                    versiones antiguas manualmente.
                  </small>
                </section>
              </>
            ),
          },
          {
            id: "recover",
            label: "Recuperar tienda",
            content: (
              <>
                <div className="export-options">
                  <article>
                    <FileArchive aria-hidden size={25} />
                    <div>
                      <h3>Respaldo de proyecto</h3>
                      <p>Conserva catálogo, diseño, SEO, configuración y recursos del proyecto.</p>
                    </div>
                    <div className="export-actions">
                      <Button
                        icon={DownloadSimple}
                        data-testid="ui-export-backup"
                        onClick={() => void backup()}
                        disabled={Boolean(busy)}
                      >
                        Descargar .solara.json
                      </Button>
                      <input
                        ref={importRef}
                        className="visually-hidden"
                        type="file"
                        aria-label="Seleccionar respaldo de proyecto"
                        accept=".json,.solara.json,application/json"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            setPendingImport(file);
                            setConfirmAction("import");
                          }
                          event.target.value = "";
                        }}
                      />
                      <Button
                        icon={UploadSimple}
                        data-testid="ui-export-import"
                        onClick={() => importRef.current?.click()}
                        disabled={Boolean(busy)}
                      >
                        Importar respaldo
                      </Button>
                    </div>
                  </article>
                </div>
                <section className="audit-panel export-recovery" data-testid="ui-export-recovery">
                  <header>
                    <div>
                      <h3>Recuperar desde un sitio publicado</h3>
                      <p>
                        Pegá la URL completa de `solara-recovery/.../manifest.json`. Se descargará
                        solo el contenido publicado y se verificarán sus hashes.
                      </p>
                    </div>
                  </header>
                  <div className="export-actions">
                    <input
                      aria-label="URL del manifest de recuperación"
                      value={recoveryUrl}
                      onChange={(event) => setRecoveryUrl(event.target.value)}
                      placeholder="https://tu-dominio.com/solara-recovery/.../manifest.json"
                    />
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => void recoverFromUrl()}
                      disabled={Boolean(busy)}
                    >
                      {busy === "recovery" ? "Recuperando…" : "Recuperar proyecto"}
                    </Button>
                    <input
                      ref={recoveryFolderRef}
                      className="visually-hidden"
                      type="file"
                      aria-label="Seleccionar carpeta del sitio publicado"
                      webkitdirectory="true"
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = "";
                        if (files.length > 0) void recoverFromFolder(files);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => recoveryFolderRef.current?.click()}
                      disabled={Boolean(busy)}
                    >
                      Recuperar carpeta
                    </Button>
                  </div>
                </section>
              </>
            ),
          },
        ]}
      />

      {history.length > 0 ? (
        <div className="audit-panel" data-testid="ui-export-history">
          <header>
            <div>
              <h3>Historial de exportaciones</h3>
              <p>Intentos exitosos registrados en este navegador.</p>
            </div>
            <Button
              variant="quiet"
              size="sm"
              data-testid="ui-export-history-clear"
              onClick={() => setConfirmAction("history")}
            >
              Borrar historial
            </Button>
          </header>
          <div className="audit-list">
            {history.map((entry, index) => (
              <article
                className="audit-item"
                data-testid="ui-export-history-item"
                data-mode={entry.mode}
                key={`${entry.at}-${index}`}
              >
                <CheckCircle aria-hidden size={18} />
                <div>
                  <strong>
                    {entry.mode === "production" ? "Producción" : "Borrador"} ·{" "}
                    {formatDate(entry.at)}
                  </strong>
                  <p>
                    Salud {entry.score}/100 · {entry.critical} críticos
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {confirmAction === "production" ? (
        <ConfirmDialog
          title="Exportar sitio de producción"
          confirmLabel="Exportar producción"
          body={
            <p>
              Se generará el HTML final con sitemap, datos estructurados y feed de Merchant.
              {" Primero se abrirá el selector de carpetas para elegir dónde guardar el sitio."}
              {publicAiContext
                ? " El contexto público incluirá contacto, políticas, SKUs, precios y productos activos."
                : ""}
              {externalHosts.length > 0 ? ` Hosts externos: ${externalHosts.join(", ")}.` : ""}
            </p>
          }
          onConfirm={() => {
            setConfirmAction("");
            void exportSite("production");
          }}
          onCancel={() => setConfirmAction("")}
        />
      ) : null}
      {confirmAction === "import" ? (
        <ConfirmDialog
          title="Importar respaldo"
          danger
          confirmLabel="Importar y reemplazar"
          body={
            <p>
              El respaldo reemplazará el proyecto actual y los cambios sin guardar se perderán.
              ¿Continuar?
            </p>
          }
          onConfirm={() => {
            const file = pendingImport;
            setConfirmAction("");
            setPendingImport(null);
            if (file) void importArchive(file);
          }}
          onCancel={() => {
            setConfirmAction("");
            setPendingImport(null);
          }}
        />
      ) : null}
      {confirmAction === "recovery" ? (
        <ConfirmDialog
          title="Recuperar proyecto publicado"
          danger
          confirmLabel="Recuperar y reemplazar"
          body={
            <p>
              El proyecto recuperado reemplazará el proyecto actual. Las fotos no publicadas y los
              recursos que no estén en la bóveda no podrán recuperarse. ¿Continuar?
            </p>
          }
          onConfirm={() => {
            const recovered = pendingRecoveredProject;
            setConfirmAction("");
            setPendingRecoveredProject(null);
            if (recovered) void importRecoveredProject(recovered);
          }}
          onCancel={() => {
            setConfirmAction("");
            setPendingRecoveredProject(null);
          }}
        />
      ) : null}
      {confirmAction === "history" ? (
        <ConfirmDialog
          title="Borrar historial de exportaciones"
          danger
          confirmLabel="Borrar historial"
          body={
            <p>
              Se eliminarán todos los registros de exportaciones exitosas de esta tienda en este
              navegador. El proyecto y los sitios exportados no se modificarán.
            </p>
          }
          onConfirm={() => {
            setConfirmAction("");
            clearHistory();
          }}
          onCancel={() => setConfirmAction("")}
        />
      ) : null}
    </section>
  );
}
