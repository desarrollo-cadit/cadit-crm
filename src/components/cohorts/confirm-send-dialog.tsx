"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * 2026-10-05 — La confirmación antes de mandar un correo, individual o a toda
 * la cohorte. Misma carcasa que el resto de los diálogos del roster
 * (`bg-overlay` + tarjeta). Un correo no se puede desenviar: por eso el botón
 * de confirmar nunca es el foco inicial, y Escape o un click afuera cancelan
 * salvo mientras el pedido está en vuelo.
 */
export function ConfirmSendDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="mb-2 font-semibold">
          {title}
        </h3>
        <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <Button autoFocus variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} loading={busy}>
            {busy ? "Enviando…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
