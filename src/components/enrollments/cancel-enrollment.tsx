"use client";

import { useEffect, useId, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

type Vista =
  | { deletable: true; motivo: string }
  | { deletable: false; code: string; motivo: string };

/**
 * "Cancelar inscripción" — borrar una inscripción hecha por error.
 *
 * Pide la vista previa al abrir y muestra una de dos cosas: la confirmación
 * (qué se borra, con números) o el motivo por el que no se puede. La decisión
 * es del servidor: este diálogo es el cartel, el DELETE es la barrera. Solo se
 * dibuja con `inscripciones.editar` (lo decide quien lo monta).
 */
export function CancelEnrollmentAction({
  enrollmentId,
  onCancelled,
}: {
  enrollmentId: string;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setVista(null);
    setError(null);
    void (async () => {
      const res = await fetch(`/api/enrollments/${enrollmentId}/cancel-preview`).catch(() => null);
      if (!vivo) return;
      if (!res?.ok) {
        setError("No se pudo revisar la inscripción. Probá de nuevo.");
        return;
      }
      setVista((await res.json()) as Vista);
    })();
    return () => {
      vivo = false;
    };
  }, [open, enrollmentId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function confirmar() {
    setBusy(true);
    const res = await fetch(`/api/enrollments/${enrollmentId}`, { method: "DELETE" }).catch(
      () => null
    );
    setBusy(false);
    if (res?.ok) {
      setOpen(false);
      notify.success("Inscripción cancelada");
      onCancelled();
      return;
    }
    const body = (await res?.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    // Si entre la vista previa y el click apareció historial, se muestra el
    // motivo en el mismo diálogo en vez de un aviso que se va.
    if (body?.error?.code && body.error.message) {
      setVista({ deletable: false, code: body.error.code, motivo: body.error.message });
      return;
    }
    setError("No se pudo cancelar la inscripción.");
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Cancelar inscripción
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="cancel-enrollment-dialog"
            className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={titleId} className="mb-2 font-semibold">
              {vista && !vista.deletable ? "No se puede cancelar" : "Cancelar inscripción"}
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              {error ? (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              ) : !vista ? (
                <p>Revisando la inscripción…</p>
              ) : (
                <p data-testid="cancel-enrollment-motivo">{vista.motivo}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button autoFocus variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                {vista?.deletable ? "Volver" : "Cerrar"}
              </Button>
              {vista?.deletable && !error && (
                <Button variant="destructive" onClick={() => void confirmar()} loading={busy}>
                  {busy ? "Cancelando…" : "Sí, cancelar inscripción"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
