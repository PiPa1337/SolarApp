/**
 * Diálogo de confirmación accesible (T1.3/T4.12): `<dialog>` nativo con
 * showModal, foco inicial (cancelar en destructivos, confirmar si no), Escape
 * cancela, Enter confirma y el foco vuelve al elemento que abrió el diálogo.
 * El padre debe montarlo condicionalmente (sólo mientras sea visible).
 */
import { X } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Ui";

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const busyRef = useRef(busy);
  const onConfirmRef = useRef(onConfirm);
  const onCancelRef = useRef(onCancel);
  busyRef.current = busy;
  onConfirmRef.current = onConfirm;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    const initial = danger ? cancelRef.current : confirmRef.current;
    initial?.focus();
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCancelRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
      } else if (event.key === "Enter" && !busyRef.current) {
        event.preventDefault();
        if (
          document.activeElement === cancelRef.current ||
          document.activeElement === closeRef.current
        ) {
          onCancelRef.current();
        } else {
          onConfirmRef.current();
        }
      }
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("keydown", handleKeyDown);
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, [danger]);

  const dialog = (
    <dialog
      className="confirm-dialog"
      ref={dialogRef}
      data-testid="ui-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
    >
      <div className="confirm-dialog__panel">
        <header className="confirm-dialog__header">
          <h3 id={titleId}>{title}</h3>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            aria-label="Cerrar diálogo"
            title="Cerrar diálogo"
            onClick={() => onCancel()}
          >
            <X aria-hidden size={18} />
          </button>
        </header>
        <div className="confirm-dialog__body" id={bodyId}>
          {body}
        </div>
        <footer className="confirm-dialog__actions">
          <Button ref={cancelRef} variant="quiet" onClick={() => onCancel()}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? "danger" : "primary"}
            loading={busy}
            onClick={() => onConfirm()}
            data-testid="ui-confirm-accept"
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </dialog>
  );

  return createPortal(dialog, document.body);
}
