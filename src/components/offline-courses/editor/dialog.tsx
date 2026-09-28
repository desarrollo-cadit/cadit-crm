"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "./api";

/**
 * cursos-offline T11b — The editor's modal, same shell as the rest of the
 * panel (`bg-overlay` + card). Escape and a click outside close it, unless an
 * action is running: closing mid-request would hide its error.
 */
export function EditorDialog({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
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
        className={`flex max-h-[90vh] w-full flex-col rounded-lg border bg-card shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="border-b px-5 py-3 font-semibold">
          {title}
        </h3>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

/**
 * A delete, confirmed. The server decides whether it may go (409
 * `has_history` when students already have attempts or progress): its
 * message is shown as is and, when given, `onHistory` offers the way out
 * (for a course, "Pasar a borrador").
 */
export function ConfirmDeleteDialog({
  title,
  message,
  onConfirm,
  onDone,
  onClose,
  onHistory,
}: {
  title: string;
  message: ReactNode;
  onConfirm: () => Promise<ApiResult<unknown>>;
  onDone: () => void;
  onClose: () => void;
  onHistory?: { label: string; run: () => Promise<ApiResult<unknown>> };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHistory, setHasHistory] = useState(false);

  // `after` differs per path: only a real delete runs `onDone` (which may
  // navigate away); the history way out keeps the user where they are.
  async function run(action: () => Promise<ApiResult<unknown>>, after: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) {
      after();
      return;
    }
    setError(result.message);
    setHasHistory(result.code === "has_history");
  }

  return (
    <EditorDialog
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus>
            Cancelar
          </Button>
          {hasHistory && onHistory ? (
            <Button loading={busy} onClick={() => void run(onHistory.run, onClose)}>
              {onHistory.label}
            </Button>
          ) : (
            <Button variant="destructive" loading={busy} disabled={hasHistory} onClick={() => void run(onConfirm, onDone)}>
              Eliminar
            </Button>
          )}
        </>
      }
    >
      <div className="text-sm text-text-2">{message}</div>
      <ErrorText>{error}</ErrorText>
    </EditorDialog>
  );
}

/** A small icon-only action; the label is what a screen reader and the tooltip say. */
export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
