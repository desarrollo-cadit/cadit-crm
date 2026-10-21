"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeDecision, isDirty } from "@/lib/dirty-guard";
import { cn } from "@/lib/utils";

/**
 * El diálogo del panel: fondo `bg-overlay` + tarjeta. Escape, un click afuera
 * y la X cierran — salvo que haya algo que perder:
 *
 * - `dirty`: el formulario tiene cambios sin guardar. Cerrar por cualquiera de
 *   esas tres vías pregunta antes ("Tenés cambios sin guardar…"), y cerrar o
 *   recargar la pestaña también (`beforeunload`). El formulario se SUSCRIBE
 *   pasando `dirty` (ver `useDirty`); sin él, cierra como siempre.
 * - `busy`: hay un pedido en curso; cerrar escondería su error.
 *
 * Guardar con éxito NO pregunta: quien abrió el diálogo lo desmonta (o el
 * formulario llama a `onClose` directo), y ninguno de los dos caminos pasa por
 * acá. Lo mismo el botón "Cancelar": es una decisión explícita.
 */

/** Sólo el diálogo de más arriba atiende el Escape. */
const stack: string[] = [];

export function Modal({
  onClose,
  dirty = false,
  busy = false,
  className,
  overlayClassName,
  labelledBy,
  ariaLabel,
  showCloseButton = true,
  children,
}: {
  onClose: () => void;
  dirty?: boolean;
  busy?: boolean;
  /** Clases de la tarjeta (ancho, alto, padding). */
  className?: string;
  /** Clases extra del fondo (p. ej. alinear abajo en el celular). */
  overlayClassName?: string;
  labelledBy?: string;
  ariaLabel?: string;
  showCloseButton?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  // Los handlers leen lo último sin re-suscribirse a cada tecla.
  const latest = useRef({ onClose, dirty, busy, confirming });
  latest.current = { onClose, dirty, busy, confirming };

  function requestClose() {
    const { dirty, busy, onClose } = latest.current;
    const decision = closeDecision({ dirty, busy });
    if (decision === "close") onClose();
    else if (decision === "confirm") setConfirming(true);
  }

  useEffect(() => {
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== id) return;
      e.preventDefault();
      if (latest.current.confirming) setConfirming(false);
      else requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [id]);

  // Cerrar o recargar la pestaña con un diálogo sucio abierto también pregunta.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4",
        overlayClassName
      )}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        className={cn(
          "relative w-full max-w-md rounded-lg border bg-card p-5 shadow-xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={requestClose}
            className="absolute right-2 top-2 z-10 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {children}
      </div>

      {confirming && (
        <UnsavedChangesPrompt
          onStay={() => setConfirming(false)}
          onLeave={() => {
            setConfirming(false);
            latest.current.onClose();
          }}
        />
      )}
    </div>
  );
}

function UnsavedChangesPrompt({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      onClick={(e) => {
        e.stopPropagation();
        onStay();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="text-sm font-medium">
          Tenés cambios sin guardar. ¿Querés salir igual?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          {/* El foco arranca en lo que NO pierde nada. */}
          <Button variant="ghost" onClick={onLeave}>
            Salir sin guardar
          </Button>
          <Button autoFocus onClick={onStay}>
            Seguir editando
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * `dirty` para un formulario: compara `current` contra lo que valía en el
 * primer render. Para un formulario que se completa después de abrir (datos
 * que llegan por fetch), `ready` posterga la foto hasta que esté listo.
 */
export function useDirty(current: unknown, ready = true): boolean {
  const baseline = useRef<{ value: unknown } | null>(null);
  if (ready && baseline.current === null) baseline.current = { value: current };
  if (baseline.current === null) return false;
  return isDirty(baseline.current.value, current);
}
