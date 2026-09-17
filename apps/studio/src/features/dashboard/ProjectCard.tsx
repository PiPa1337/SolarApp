import {
  Archive,
  ArrowCounterClockwise,
  ArrowUpRight,
  Calculator,
  CloudArrowDown,
  Copy,
  DownloadSimple,
  FolderOpen,
  Globe,
  Minus,
  Money,
  Package,
  Plus,
  Star,
  Trash,
  X,
} from "@phosphor-icons/react";
import { isBaseTemplate } from "@solara/project-schema/project-policy";
import { type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "../../components/Ui";
import {
  calculateMonthlyCostForCount,
  DEFAULT_PRICING,
  DEFAULT_VARIANT_BILLING_MODE,
  formatMonthlyCost,
  getMonthlyCostBreakdown,
  getProjectMetrics,
  loadPricingConfig,
  loadStoreDiscount,
  loadVariantBillingMode,
  type PricingConfig,
  savePricingConfig,
  saveStoreDiscount,
  saveVariantBillingMode,
  storeFaviconSrc,
  storeMark,
  type VariantBillingMode,
} from "../../lib/dashboardModel";
import { formatDate } from "../../lib/format";
import type { StoredProject } from "../../lib/repository";

export function statusLabel(status: StoredProject["status"]): string {
  return status === "archived" ? "Archivada" : "Activa";
}

export function formatCompactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const parts = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value.replaceAll(".", "") ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return [day, month, year].filter(Boolean).join(" ");
}

function formatDashboardCount(value: number): string {
  return value.toLocaleString("es-AR");
}

export interface ProjectCardProps {
  project: StoredProject | undefined;
  isFilteredOut?: boolean;
  detailRef: RefObject<HTMLElement | null>;
  backupId: string | undefined;
  archivingId?: string | undefined;
  siteOpeningId: string | undefined;
  folderOpeningId: string | undefined;
  downloadingId: string | undefined;
  actionNotice: string | undefined;
  isPinned: boolean;
  onClose(): void;
  onOpen(id: string): void;
  onPin(id: string): void;
  onOpenSite?: ((id: string) => Promise<void>) | undefined;
  onOpenFolder?: ((id: string) => Promise<void>) | undefined;
  onBackup(id: string): Promise<void>;
  onDownloadBackup?: ((id: string) => Promise<void>) | undefined;
  onDuplicate(id: string): Promise<void>;
  onArchive(id: string, archived: boolean): Promise<void>;
  onDelete?(id: string): Promise<void>;
  deletingId?: string | undefined;
}

export function ProjectCard({
  project,
  isFilteredOut = false,
  detailRef,
  backupId,
  archivingId,
  siteOpeningId,
  folderOpeningId,
  downloadingId,
  actionNotice,
  isPinned,
  onClose,
  onOpen,
  onPin,
  onOpenSite,
  onOpenFolder,
  onBackup,
  onDownloadBackup,
  onDuplicate,
  onArchive,
  onDelete,
  deletingId,
}: ProjectCardProps) {
  const protectedTemplate = project ? isBaseTemplate(project.project) : false;
  const faviconSrc = project ? storeFaviconSrc(project.project) : undefined;
  const projectId = project?.id;
  // Mensualidad y métricas siempre actualizadas con config global + descuento
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(() => loadPricingConfig());
  const [storeDiscount, setStoreDiscount] = useState<number>(() =>
    projectId ? loadStoreDiscount(projectId) : 0,
  );
  const [variantBillingMode, setVariantBillingMode] = useState<VariantBillingMode>(() =>
    projectId ? loadVariantBillingMode(projectId) : DEFAULT_VARIANT_BILLING_MODE,
  );

  useEffect(() => {
    if (projectId) setStoreDiscount(loadStoreDiscount(projectId));
    else setStoreDiscount(0);
    setVariantBillingMode(
      projectId ? loadVariantBillingMode(projectId) : DEFAULT_VARIANT_BILLING_MODE,
    );
  }, [projectId]);

  const projectMetrics = project
    ? getProjectMetrics(project.project, variantBillingMode)
    : undefined;
  const billableProducts = projectMetrics?.billableProducts ?? 0;
  const variantExtras = projectMetrics?.variantExtras ?? 0;
  const chargingVariants = variantBillingMode === "with-variants";
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorView, setCalculatorView] = useState<"quote" | "pricing">("quote");
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatedProducts, setSimulatedProducts] = useState(String(billableProducts));
  const [resetArmed, setResetArmed] = useState(false);
  const calculatorTitleId = useId();
  const quotePanelId = useId();
  const pricingPanelId = useId();
  const discountHelpId = useId();
  const simulatorInputId = useId();
  const simulatorHelpId = useId();
  const simulatorErrorId = useId();
  const calculatorButtonRef = useRef<HTMLButtonElement>(null);
  const calculatorDialogRef = useRef<HTMLDivElement>(null);
  const DELETE_CONFIRM_SECONDS = 30;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(DELETE_CONFIRM_SECONDS);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteTitleId = useId();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  const parsedSimulatedProducts = Number(simulatedProducts);
  const validSimulatedProducts =
    /^\d+$/.test(simulatedProducts) &&
    Number.isSafeInteger(parsedSimulatedProducts) &&
    parsedSimulatedProducts >= 1;
  const quotedProducts =
    simulatorOpen && validSimulatedProducts ? parsedSimulatedProducts : billableProducts;
  const actualBaseMonthlyCost = project
    ? calculateMonthlyCostForCount(billableProducts, pricingConfig)
    : 0;
  const actualMonthlyCost = Math.max(
    0,
    Math.round(actualBaseMonthlyCost * (1 - storeDiscount / 100)),
  );
  const quotedBaseMonthlyCost = project
    ? calculateMonthlyCostForCount(quotedProducts, pricingConfig)
    : 0;
  const quotedMonthlyCost = Math.max(
    0,
    Math.round(quotedBaseMonthlyCost * (1 - storeDiscount / 100)),
  );
  const quotedBreakdown = project ? getMonthlyCostBreakdown(quotedProducts, pricingConfig) : [];

  useEffect(() => {
    if (!calculatorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      calculatorDialogRef.current
        ?.querySelector<HTMLButtonElement>('[aria-label="Cerrar calculadora"]')
        ?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [calculatorOpen]);

  const handlePricingChange = (patch: Partial<PricingConfig>) => {
    const next = { ...pricingConfig, ...patch };
    const normalizePrice = (value: number, fallback: number) =>
      Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
    next.base = normalizePrice(next.base, pricingConfig.base);
    next.tier1Price = normalizePrice(next.tier1Price, pricingConfig.tier1Price);
    next.tier2Price = normalizePrice(next.tier2Price, pricingConfig.tier2Price);
    next.tier3Price = normalizePrice(next.tier3Price, pricingConfig.tier3Price);
    // incluido fijo en 20
    next.included = 20;
    setPricingConfig(next);
    savePricingConfig(next);
    setResetArmed(false);
  };

  const handleDiscountChange = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const clamped = Math.max(0, Math.min(100, Math.round(safeValue)));
    setStoreDiscount(clamped);
    if (project) saveStoreDiscount(project.id, clamped);
  };

  const toggleVariantBillingMode = () => {
    if (!projectId) return;
    const nextMode: VariantBillingMode = chargingVariants ? "products-only" : "with-variants";
    setVariantBillingMode(nextMode);
    saveVariantBillingMode(projectId, nextMode);
  };

  const openCalculator = () => {
    setCalculatorView("quote");
    setSimulatedProducts(String(billableProducts));
    setSimulatorOpen(false);
    setResetArmed(false);
    setCalculatorOpen(true);
  };
  const closeCalculator = () => {
    setCalculatorOpen(false);
    setCalculatorView("quote");
    setSimulatorOpen(false);
    setResetArmed(false);
    window.requestAnimationFrame(() => calculatorButtonRef.current?.focus());
  };

  const openDelete = () => {
    setDeleteArmed(false);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
    setDeleteBusy(false);
    setDeleteError("");
    setDeleteOpen(true);
  };
  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeleteArmed(false);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
    setDeleteBusy(false);
    setDeleteError("");
    window.requestAnimationFrame(() => deleteButtonRef.current?.focus());
  };

  useEffect(() => {
    if (!deleteOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      deleteDialogRef.current
        ?.querySelector<HTMLButtonElement>('[aria-label="Cerrar eliminación"]')
        ?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteOpen]);

  useEffect(() => {
    if (!deleteOpen) return;
    setDeleteArmed(false);
    setDeleteCountdown(DELETE_CONFIRM_SECONDS);
    setDeleteError("");
    const timer = window.setInterval(() => {
      setDeleteCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deleteOpen]);

  useEffect(() => {
    if (projectId) return;
    setDeleteOpen(false);
  }, [projectId]);

  const handleDeleteKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeDelete();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      deleteDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const confirmDelete = () => {
    if (!project || !onDelete || deleteBusy || deleteCountdown > 0 || !deleteArmed) return;
    setDeleteBusy(true);
    setDeleteError("");
    void onDelete(project.id)
      .then(() => {
        setDeleteBusy(false);
        setDeleteOpen(false);
        setDeleteArmed(false);
      })
      .catch((reason: unknown) => {
        setDeleteBusy(false);
        setDeleteError(reason instanceof Error ? reason.message : "No se pudo eliminar la tienda.");
      });
  };

  const handleCalculatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeCalculator();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      calculatorDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const changeSimulatedProducts = (delta: number) => {
    const current = validSimulatedProducts ? parsedSimulatedProducts : 1;
    setSimulatedProducts(String(Math.max(1, current + delta)));
  };

  return (
    <section
      ref={detailRef}
      className={`dashboard-store-detail${project ? " is-open" : ""}`}
      aria-label={project ? `Tienda seleccionada: ${project.name}` : "Tienda seleccionada"}
      tabIndex={project ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (deleteOpen) closeDelete();
          else if (calculatorOpen) closeCalculator();
          else onClose();
        }
      }}
    >
      {project ? (
        <>
          <div className="dashboard-store-detail__identity">
            <span className="dashboard-store-detail__mark" aria-hidden>
              {faviconSrc ? (
                <img
                  src={faviconSrc}
                  alt=""
                  width={46}
                  height={46}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                storeMark(project.name)
              )}
            </span>
            <div className="dashboard-store-detail__title">
              <h3>{project.name}</h3>
              <div className="dashboard-store-detail__statuses">
                <span className={`dashboard-store-card__status is-${project.status}`}>
                  <span aria-hidden />
                  {statusLabel(project.status)}
                </span>
                {protectedTemplate ? (
                  <span className="dashboard-store-card__status is-protected">Solo lectura</span>
                ) : null}
                {isFilteredOut ? (
                  <span className="dashboard-store-detail__context">Fuera del filtro</span>
                ) : null}
              </div>
            </div>
            <div className="dashboard-store-detail__controls">
              <button
                type="button"
                className="dashboard-store-detail__pin"
                aria-pressed={isPinned}
                aria-label={isPinned ? "Quitar de fijadas" : "Fijar tienda"}
                aria-description={project.name}
                title={`${isPinned ? "Quitar" : "Fijar"} ${project.name} ${isPinned ? "de fijadas" : "en fijadas"}`}
                data-testid="ui-detail-pin"
                onClick={() => onPin(project.id)}
              >
                <Star aria-hidden size={16} weight={isPinned ? "fill" : "regular"} />
              </button>
              <IconButton
                icon={X}
                label="Cerrar detalle"
                onClick={onClose}
                className="dashboard-store-detail__close"
              />
            </div>
          </div>
          <dl className="dashboard-store-detail__facts">
            <div>
              <dt>ID</dt>
              <dd title={project.id}>{project.id}</dd>
            </div>
            <div>
              <dt>Actualizada</dt>
              <dd title={formatDate(project.updatedAt)}>{formatCompactDate(project.updatedAt)}</dd>
            </div>
            <div>
              <dt>Productos</dt>
              <dd>
                {formatDashboardCount(billableProducts)}
                {variantExtras > 0 ? ` (${formatDashboardCount(variantExtras)} extra)` : ""}
              </dd>
            </div>
            <div>
              <dt>Categorías</dt>
              <dd>{formatDashboardCount(projectMetrics?.categories ?? 0)}</dd>
            </div>
            <div>
              <dt>Mensualidad</dt>
              <dd>{formatMonthlyCost(actualMonthlyCost)}</dd>
            </div>
            <div>
              <dt>Recursos</dt>
              <dd>{formatDashboardCount(projectMetrics?.assets ?? 0)}</dd>
            </div>
            {project.diskVersion !== undefined ? (
              <div>
                <dt>Versión en disco</dt>
                <dd>v{project.diskVersion}</dd>
              </div>
            ) : null}
            {project.diskSiteStatus ? (
              <div>
                <dt>Sitio público</dt>
                <dd>
                  {project.diskSiteStatus === "synced" ? "Actualizado" : "Anterior conservado"}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="dashboard-store-detail__actions">
            <div
              className={`dashboard-store-detail__actions-primary${onOpenSite ? "" : " is-single"}`}
              role="group"
              aria-label="Acciones principales"
            >
              <Button variant="primary" icon={ArrowUpRight} onClick={() => onOpen(project.id)}>
                Abrir tienda
              </Button>
              {onOpenSite ? (
                <Button
                  variant="secondary"
                  icon={Globe}
                  loading={siteOpeningId === project.id}
                  onClick={() => void onOpenSite(project.id)}
                >
                  {siteOpeningId === project.id ? "Abriendo sitio" : "Abrir sitio público"}
                </Button>
              ) : null}
            </div>
            <div
              className="dashboard-store-detail__actions-secondary"
              data-label="Gestionar y respaldar"
              role="group"
              aria-label="Herramientas y respaldos"
            >
              {onOpenFolder ? (
                <Button
                  variant="secondary"
                  icon={FolderOpen}
                  loading={folderOpeningId === project.id}
                  onClick={() => void onOpenFolder(project.id)}
                >
                  {folderOpeningId === project.id ? "Abriendo carpeta" : "Abrir carpeta"}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                icon={CloudArrowDown}
                loading={backupId === project.id}
                onClick={() => void onBackup(project.id)}
              >
                {backupId === project.id ? "Preparando respaldo" : "Respaldar ahora"}
              </Button>
              {onDownloadBackup ? (
                <Button
                  variant="secondary"
                  icon={DownloadSimple}
                  loading={downloadingId === project.id}
                  onClick={() => void onDownloadBackup(project.id)}
                >
                  {downloadingId === project.id ? "Descargando respaldo" : "Descargar respaldo"}
                </Button>
              ) : null}
              <Button variant="secondary" icon={Copy} onClick={() => void onDuplicate(project.id)}>
                Duplicar
              </Button>
            </div>
            <Button
              ref={calculatorButtonRef}
              className="dashboard-store-detail__calculator"
              variant="secondary"
              icon={Calculator}
              onClick={openCalculator}
            >
              Calculadora
            </Button>
            <Button
              className={`dashboard-store-detail__variant-billing ${
                chargingVariants ? "is-charging" : "is-not-charging"
              }`}
              variant="secondary"
              icon={Money}
              aria-pressed={chargingVariants}
              data-testid="ui-variant-billing-toggle"
              onClick={toggleVariantBillingMode}
            >
              {chargingVariants ? "Cobrando variantes" : "No cobrando Variantes"}
            </Button>
            <div
              className={`dashboard-store-detail__actions-danger${onDelete ? "" : " is-single"}`}
              data-label="Zona de riesgo"
              role="group"
              aria-label="Acciones de riesgo"
            >
              <Button
                className={`dashboard-store-detail__danger ${
                  project.status === "archived"
                    ? "dashboard-store-detail__restore"
                    : "dashboard-store-detail__archive"
                }`}
                variant="secondary"
                icon={project.status === "archived" ? ArrowCounterClockwise : Archive}
                loading={archivingId === project.id}
                disabled={protectedTemplate}
                onClick={() => void onArchive(project.id, project.status !== "archived")}
              >
                {protectedTemplate
                  ? "Plantilla protegida"
                  : project.status === "archived"
                    ? "Restaurar tienda"
                    : "Archivar"}
              </Button>
              {onDelete ? (
                <Button
                  ref={deleteButtonRef}
                  className="dashboard-store-detail__danger"
                  variant="danger"
                  icon={Trash}
                  loading={deletingId === project.id || deleteBusy}
                  disabled={protectedTemplate}
                  onClick={openDelete}
                >
                  {deletingId === project.id || deleteBusy ? "Eliminando tienda" : "Eliminar tienda"}
                </Button>
              ) : null}
            </div>
          </div>
          {calculatorOpen
            ? createPortal(
                <div
                  ref={calculatorDialogRef}
                  className="dashboard-calculator-dialog is-open"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={calculatorTitleId}
                  onKeyDown={handleCalculatorKeyDown}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeCalculator();
                  }}
                >
                  <form
                    className="dashboard-calculator-dialog__content"
                    onSubmit={(e) => e.preventDefault()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <div className="dashboard-calculator-dialog__header">
                      <div className="dashboard-calculator-dialog__title">
                        <span className="dashboard-calculator-dialog__eyebrow">Tarifas</span>
                        <h2 id={calculatorTitleId}>Precio de tu tienda online</h2>
                        <p>Configurá la tarifa y revisá el total mensual de esta tienda.</p>
                      </div>
                      <IconButton
                        icon={X}
                        label="Cerrar calculadora"
                        className="dashboard-calculator-dialog__close"
                        autoFocus
                        onClick={closeCalculator}
                      />
                    </div>

                    <div className="dashboard-calculator-dialog__body">
                      <div
                        className="dashboard-calculator-dialog__tabs"
                        role="tablist"
                        aria-label="Vista de la calculadora"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={calculatorView === "quote"}
                          aria-controls={quotePanelId}
                          onClick={() => {
                            setCalculatorView("quote");
                            setResetArmed(false);
                          }}
                        >
                          Resumen y simulación
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={calculatorView === "pricing"}
                          aria-controls={pricingPanelId}
                          onClick={() => {
                            setCalculatorView("pricing");
                            setResetArmed(false);
                          }}
                        >
                          Configurar tarifa
                        </button>
                      </div>

                      {calculatorView === "pricing" ? (
                        <div
                          id={pricingPanelId}
                          className="dashboard-calculator-dialog__panel"
                          role="tabpanel"
                        >
                          {/* Configuración global — misma tarifa para todas las tiendas */}
                          <section className="dashboard-calculator-dialog__section">
                            <div className="dashboard-calculator-dialog__section-heading">
                              <div>
                                <span>Configuración global</span>
                                <h3>Tarifa mensual</h3>
                              </div>
                              <p>Se aplica a todas las tiendas.</p>
                            </div>
                            <div className="dashboard-calculator-dialog__base-row">
                              <label className="dashboard-calculator-dialog__field">
                                <span>Base por mes</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={100}
                                  value={pricingConfig.base}
                                  onChange={(e) =>
                                    handlePricingChange({ base: Number(e.target.value) })
                                  }
                                />
                              </label>
                              <div className="dashboard-calculator-dialog__included">
                                <span>Productos incluidos</span>
                                <strong>Hasta {pricingConfig.included}</strong>
                              </div>
                            </div>
                            <div className="dashboard-calculator-dialog__grid dashboard-calculator-dialog__grid--3">
                              <label className="dashboard-calculator-dialog__field">
                                <span>Del 21 al 100</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={10}
                                  value={pricingConfig.tier1Price}
                                  onChange={(e) =>
                                    handlePricingChange({ tier1Price: Number(e.target.value) })
                                  }
                                />
                                <small>por producto</small>
                              </label>
                              <label className="dashboard-calculator-dialog__field">
                                <span>Del 101 al 200</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={10}
                                  value={pricingConfig.tier2Price}
                                  onChange={(e) =>
                                    handlePricingChange({ tier2Price: Number(e.target.value) })
                                  }
                                />
                                <small>por producto</small>
                              </label>
                              <label className="dashboard-calculator-dialog__field">
                                <span>Desde 201</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={10}
                                  value={pricingConfig.tier3Price}
                                  onChange={(e) =>
                                    handlePricingChange({ tier3Price: Number(e.target.value) })
                                  }
                                />
                                <small>por producto</small>
                              </label>
                            </div>
                            <p className="dashboard-calculator-dialog__hint">
                              Base {formatMonthlyCost(pricingConfig.base)} más los productos que
                              excedan el tramo incluido.
                            </p>
                          </section>

                          {/* Descuento específico para la tienda seleccionada */}
                          <section className="dashboard-calculator-dialog__section dashboard-calculator-dialog__section--store">
                            <div className="dashboard-calculator-dialog__section-heading">
                              <div>
                                <span>Esta tienda</span>
                                <h3>{project.name}</h3>
                              </div>
                              <p>El descuento no afecta a las demás.</p>
                            </div>
                            <label className="dashboard-calculator-dialog__field">
                              <span>Descuento especial</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={storeDiscount}
                                onChange={(e) => handleDiscountChange(Number(e.target.value))}
                                aria-describedby={discountHelpId}
                              />
                              <small id={discountHelpId}>Entre 0% y 100%.</small>
                            </label>
                          </section>
                        </div>
                      ) : (
                        <section
                          id={quotePanelId}
                          className="dashboard-calculator-dialog__quote"
                          role="tabpanel"
                          aria-live="polite"
                        >
                          <div className="dashboard-calculator-dialog__quote-header">
                            <div>
                              <div className="dashboard-calculator-dialog__quote-label">
                                {simulatorOpen && validSimulatedProducts ? (
                                  <span className="dashboard-calculator-dialog__badge">
                                    Simulación
                                  </span>
                                ) : null}
                                <span>{quotedProducts} productos</span>
                                {!simulatorOpen && variantExtras > 0 ? (
                                  <span>({variantExtras} extra)</span>
                                ) : null}
                                {storeDiscount > 0 ? <span>−{storeDiscount}%</span> : null}
                              </div>
                              <strong>{formatMonthlyCost(quotedMonthlyCost)}/mes</strong>
                            </div>
                            {simulatorOpen ? (
                              <Button
                                variant="quiet"
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setSimulatorOpen(false);
                                  setSimulatedProducts(String(billableProducts));
                                }}
                              >
                                Volver a la cantidad actual
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={Calculator}
                                type="button"
                                onClick={() => {
                                  setSimulatedProducts(String(billableProducts));
                                  setSimulatorOpen(true);
                                }}
                              >
                                Simular cantidad
                              </Button>
                            )}
                          </div>

                          {simulatorOpen ? (
                            <div className="dashboard-calculator-dialog__simulator">
                              <div>
                                <label htmlFor={simulatorInputId}>Cantidad facturable</label>
                                <p id={simulatorHelpId}>
                                  Incluye productos y variantes adicionales. No modifica el catálogo
                                  ni la tarifa guardada.
                                </p>
                              </div>
                              <div className="dashboard-calculator-dialog__stepper">
                                <IconButton
                                  icon={Minus}
                                  label="Restar un producto"
                                  onClick={() => changeSimulatedProducts(-1)}
                                />
                                <input
                                  id={simulatorInputId}
                                  type="number"
                                  min={1}
                                  step={1}
                                  inputMode="numeric"
                                  value={simulatedProducts}
                                  aria-describedby={`${simulatorHelpId}${validSimulatedProducts ? "" : ` ${simulatorErrorId}`}`}
                                  aria-invalid={!validSimulatedProducts || undefined}
                                  onChange={(event) => setSimulatedProducts(event.target.value)}
                                />
                                <IconButton
                                  icon={Plus}
                                  label="Sumar un producto"
                                  onClick={() => changeSimulatedProducts(1)}
                                />
                              </div>
                              {!validSimulatedProducts ? (
                                <p
                                  id={simulatorErrorId}
                                  className="dashboard-calculator-dialog__simulator-error"
                                >
                                  Ingresá al menos 1 producto.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="dashboard-calculator-dialog__breakdown">
                            <div className="dashboard-calculator-dialog__breakdown-row">
                              <span>Base ({pricingConfig.included} incluidos)</span>
                              <strong>{formatMonthlyCost(pricingConfig.base)}</strong>
                            </div>
                            {quotedBreakdown.map((item) => (
                              <div
                                key={item.label}
                                className="dashboard-calculator-dialog__breakdown-row"
                              >
                                <span>{item.label}</span>
                                <span>
                                  {item.products} × {formatMonthlyCost(item.price)} ={" "}
                                  {formatMonthlyCost(item.subtotal)}
                                </span>
                              </div>
                            ))}
                            {storeDiscount > 0 ? (
                              <div className="dashboard-calculator-dialog__breakdown-row is-discount">
                                <span>Descuento {storeDiscount}%</span>
                                <span>
                                  −{formatMonthlyCost(quotedBaseMonthlyCost - quotedMonthlyCost)}
                                </span>
                              </div>
                            ) : null}
                            <div className="dashboard-calculator-dialog__breakdown-row is-total">
                              <span>Total mensual</span>
                              <strong>{formatMonthlyCost(quotedMonthlyCost)}</strong>
                            </div>
                          </div>
                        </section>
                      )}
                    </div>

                    <footer className="dashboard-calculator-dialog__actions">
                      {resetArmed && calculatorView === "pricing" ? (
                        <output>Volvé a presionar para confirmar.</output>
                      ) : (
                        <span />
                      )}
                      {calculatorView === "pricing" ? (
                        <Button
                          variant="quiet"
                          type="button"
                          icon={ArrowCounterClockwise}
                          onClick={() => {
                            if (resetArmed) handlePricingChange(DEFAULT_PRICING);
                            else setResetArmed(true);
                          }}
                        >
                          {resetArmed ? "Confirmar restablecimiento" : "Restablecer tarifa"}
                        </Button>
                      ) : (
                        <span />
                      )}
                      <Button variant="primary" type="button" onClick={closeCalculator}>
                        Listo
                      </Button>
                    </footer>
                  </form>
                </div>,
                document.body,
              )
            : null}
          {deleteOpen
            ? createPortal(
                <div
                  ref={deleteDialogRef}
                  className="dashboard-calculator-dialog is-open dashboard-delete-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={deleteTitleId}
                  onKeyDown={handleDeleteKeyDown}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeDelete();
                  }}
                >
                  <form
                    className="dashboard-calculator-dialog__content"
                    onSubmit={(e) => e.preventDefault()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <header className="dashboard-calculator-dialog__header">
                      <div className="dashboard-calculator-dialog__title">
                        <span className="dashboard-calculator-dialog__eyebrow">
                          Zona de peligro
                        </span>
                        <h2 id={deleteTitleId}>Eliminar tienda</h2>
                        <p>
                          Cuidado, estás por borrar la tienda “{project.name}”. Esta acción elimina
                          el proyecto, sus respaldos visibles y su sitio, y no se puede deshacer.
                        </p>
                      </div>
                      <IconButton
                        icon={X}
                        label="Cerrar eliminación"
                        className="dashboard-calculator-dialog__close"
                        autoFocus
                        onClick={closeDelete}
                        disabled={deleteBusy}
                      />
                    </header>
                    <div className="dashboard-calculator-dialog__body">
                      <section
                        className="dashboard-calculator-dialog__section dashboard-delete-dialog__countdown"
                        aria-live="polite"
                      >
                        {deleteCountdown > 0 ? (
                          <p>
                            Podrás confirmar en {deleteCountdown}{" "}
                            {deleteCountdown === 1 ? "segundo" : "segundos"}. Leé con calma: el
                            borrado es definitivo.
                          </p>
                        ) : (
                          <p>
                            Ya podés confirmar. Son dos pasos: primero aceptá el riesgo y después
                            eliminá definitivamente.
                          </p>
                        )}
                        <div
                          className="dashboard-delete-dialog__progress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={DELETE_CONFIRM_SECONDS}
                          aria-valuenow={DELETE_CONFIRM_SECONDS - deleteCountdown}
                          aria-label="Espera de seguridad"
                        >
                          <span
                            style={{
                              transform: `scaleX(${(DELETE_CONFIRM_SECONDS - deleteCountdown) / DELETE_CONFIRM_SECONDS})`,
                            }}
                          />
                        </div>
                      </section>
                      {deleteError ? (
                        <p
                          className="dashboard-delete-dialog__error"
                          role="alert"
                          data-testid="ui-delete-error"
                        >
                          {deleteError}
                        </p>
                      ) : null}
                    </div>
                    <footer className="dashboard-calculator-dialog__actions dashboard-delete-dialog__actions">
                      <Button
                        variant="quiet"
                        type="button"
                        onClick={closeDelete}
                        disabled={deleteBusy}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        disabled={deleteBusy || deleteCountdown > 0 || deleteArmed}
                        onClick={() => setDeleteArmed(true)}
                      >
                        {deleteArmed ? "Riesgo aceptado" : "Entiendo el riesgo"}
                      </Button>
                      <Button
                        variant="danger"
                        type="button"
                        loading={deleteBusy}
                        disabled={deleteBusy || deleteCountdown > 0 || !deleteArmed}
                        onClick={confirmDelete}
                        data-testid="ui-delete-confirm"
                      >
                        {deleteBusy ? "Eliminando" : "Eliminar definitivamente"}
                      </Button>
                    </footer>
                  </form>
                </div>,
                document.body,
              )
            : null}
          <div className="dashboard-store-detail__notice-slot">
            {actionNotice ? (
              <output
                className="dashboard-store-detail__notice"
                aria-live="polite"
                data-testid="ui-detail-notice"
              >
                {actionNotice}
              </output>
            ) : null}
          </div>
        </>
      ) : (
        <div className="dashboard-store-detail__empty">
          <Package aria-hidden size={26} />
          <strong>Seleccioná una tienda</strong>
          <p>Elegí un proyecto para ver sus datos y acciones.</p>
        </div>
      )}
    </section>
  );
}
