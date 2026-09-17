/**
 * Diálogo de creación de tienda (wizard de 4 pasos) extraído del Dashboard.
 * El wizard es estado interno: pasos, campos, validación y error de envío.
 * El padre controla la apertura, la creación, la importación y el cierre.
 */
import { Plus, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, Field, IconButton, InlineError } from "../../components/Ui";

export interface CreateStoreDraft {
  name: string;
  brandName: string;
  email: string;
  phone: string;
}

export function CreateStoreDialog({
  open,
  onCreate,
  onImport,
  onClose,
}: {
  open: boolean;
  onCreate(draft: CreateStoreDraft): Promise<void>;
  onImport(file: File): Promise<void>;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError("");
      setStep(1);
      setName("");
      setBrandName("");
      setEmail("");
      setPhone("");
      dialog.showModal();
      nameInputRef.current?.focus();
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const submit = async () => {
    if (busyRef.current) return;
    setError("");
    if (step < 4) {
      if (step === 1 && !name.trim()) {
        setError("Escribí un nombre para continuar.");
        return;
      }
      setStep((current) => (current + 1) as 1 | 2 | 3 | 4);
      return;
    }
    if (!name.trim()) {
      setError("Escribí un nombre para crear la tienda.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await onCreate({ name, brandName: brandName || name, email, phone });
      onClose();
      setStep(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la tienda.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const importStore = async (file: File) => {
    if (busyRef.current) return;
    setError("");
    busyRef.current = true;
    setBusy(true);
    try {
      await onImport(file);
      onClose();
      setStep(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo importar la tienda.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dashboard-cosmic-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="dashboard-cosmic-dialog__header">
          <div>
            <span className="dashboard-cosmic-kicker">Nuevo proyecto</span>
            <h2 id={titleId}>Crear tienda</h2>
          </div>
          <IconButton
            icon={X}
            label="Cerrar creación"
            disabled={busy}
            onClick={() => {
              if (!busyRef.current) onClose();
            }}
          />
        </header>
        <ol className="create-store__steps" aria-label="Pasos para preparar la tienda">
          <li className={step >= 1 ? "is-active" : ""}>1 Marca</li>
          <li className={step >= 2 ? "is-active" : ""}>2 Identidad y assets</li>
          <li className={step >= 3 ? "is-active" : ""}>3 Catálogo</li>
          <li className={step >= 4 ? "is-active" : ""}>4 Revisión</li>
        </ol>
        {error ? <InlineError>{error}</InlineError> : null}
        {step === 1 ? (
          <div className="create-store__import">
            <p className="dashboard-cosmic-dialog__summary">
              ¿Ya tenés una tienda guardada? Importá un respaldo .solara.json como una tienda nueva.
            </p>
            <label className="button">
              <UploadSimple aria-hidden />
              Importar tienda
              <input
                className="visually-hidden"
                type="file"
                aria-label="Seleccionar tienda para importar"
                accept=".json,.solara.json,application/json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importStore(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        ) : null}
        <Field label="Nueva tienda">
          <input
            ref={nameInputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre comercial"
            autoComplete="organization"
          />
        </Field>
        {step >= 2 ? (
          <Field label="Nombre visible de la marca">
            <input
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
              placeholder={name || "Nombre de marca"}
              autoComplete="organization"
            />
          </Field>
        ) : null}
        {step === 2 ? (
          <p className="dashboard-cosmic-dialog__summary">
            La plantilla deja listos 33 productos de ejemplo en 6 categorías, además de los textos,
            la navegación y los espacios para tus imágenes.
          </p>
        ) : null}
        {step >= 3 ? (
          <div className="create-store__contact-fields">
            <Field label="Email de contacto (opcional)">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="hola@tumarca.com"
                autoComplete="email"
              />
            </Field>
            <Field label="WhatsApp (opcional)">
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="5491100000000"
                autoComplete="tel"
                inputMode="tel"
              />
            </Field>
            <p className="dashboard-cosmic-dialog__summary">
              Podrás reemplazar los productos de ejemplo, importar un CSV o cargar productos
              manualmente.
            </p>
          </div>
        ) : null}
        {step === 4 ? (
          <p className="dashboard-cosmic-dialog__summary" aria-live="polite">
            Vas a crear una tienda con 33 productos de ejemplo y el diseño Catalog Modern. Podrás
            reemplazarlos cuando personalices tu catálogo.
          </p>
        ) : null}
        <footer className="dashboard-cosmic-dialog__actions">
          {step > 1 ? (
            <Button
              variant="quiet"
              type="button"
              onClick={() => setStep((current) => (current - 1) as 1 | 2 | 3 | 4)}
            >
              Atrás
            </Button>
          ) : null}
          <Button variant="primary" icon={Plus} disabled={busy} type="submit">
            {busy ? "Creando" : step === 4 ? "Crear tienda desde plantilla" : "Continuar"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
