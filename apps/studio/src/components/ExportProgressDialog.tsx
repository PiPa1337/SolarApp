import { CheckCircle, Circle } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { ProgressBar } from "./primitives";

export type ExportProgressTaskStatus = "pending" | "active" | "complete";

export interface ExportProgressTask {
  id: string;
  label: string;
  status: ExportProgressTaskStatus;
  current?: number;
  total?: number;
}

export function ExportProgressDialog({
  mode,
  percent,
  remainingLabel,
  currentLabel,
  tasks,
}: {
  mode: "draft" | "production";
  percent: number;
  remainingLabel: string;
  currentLabel: ReactNode;
  tasks: readonly ExportProgressTask[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    panelRef.current?.focus();
    const handleCancel = (event: Event) => event.preventDefault();
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog export-progress-dialog"
      data-testid="ui-export-progress-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="confirm-dialog__panel" ref={panelRef} tabIndex={-1}>
        <header className="confirm-dialog__header">
          <div>
            <span className="guided-kicker">Exportación</span>
            <h3 id={titleId}>
              Exportando sitio {mode === "production" ? "de producción" : "borrador"}
            </h3>
          </div>
        </header>
        <div className="confirm-dialog__body export-progress-dialog__body" id={descriptionId}>
          <div className="export-progress-dialog__headline">
            <strong>{percent}%</strong>
            <span>{remainingLabel}</span>
          </div>
          <ProgressBar
            value={percent}
            label={`Exportación ${percent}% completada`}
            size="md"
          />
          <p className="export-progress-dialog__current" aria-live="polite">
            {currentLabel}
          </p>
          <ol className="export-progress-dialog__tasks">
            {tasks.map((task) => (
              <li
                key={task.id}
                data-testid="ui-export-progress-task"
                data-task={task.id}
                data-status={task.status}
              >
                <span className="export-progress-dialog__task-status" aria-hidden>
                  {task.status === "complete" ? (
                    <CheckCircle size={18} weight="fill" />
                  ) : task.status === "active" ? (
                    <span className="spinner" />
                  ) : (
                    <Circle size={18} />
                  )}
                </span>
                <span className="guided-checklist__text">
                  <strong>{task.label}</strong>
                  <small>
                    {task.status === "complete"
                      ? "Completado"
                      : task.status === "active"
                        ? task.total && task.current !== undefined
                          ? `${task.current}/${task.total} archivos`
                          : "En curso…"
                        : "Pendiente"}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </dialog>
  );
}
