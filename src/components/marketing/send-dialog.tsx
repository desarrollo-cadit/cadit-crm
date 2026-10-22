"use client";

import { useEffect, useState } from "react";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import type { AudienceFilters } from "@/lib/marketing/audience";

/**
 * 045 (FR-018, FR-019) — "Se enviará a N personas", con la cantidad
 * recalculada al abrir. El servidor vuelve a contar al confirmar: si cambió,
 * muestra la cantidad nueva y pide confirmar otra vez (nunca se manda a una
 * cantidad que la persona no vio).
 */
export function SendDialog({
  campaignId,
  filters,
  onClose,
  onSent,
}: {
  campaignId: string;
  filters: AudienceFilters;
  onClose: () => void;
  onSent: () => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/marketing/audiences/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters, page: 1, pageSize: 25 }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { count: number; overCap: boolean }) => {
        setCount(d.count);
        if (d.overCap) setError("Supera el tope de 500 personas por campaña. Acotá los filtros de la audiencia.");
      })
      .catch(() => setError("No se pudo calcular a cuántas personas se enviaría."));
  }, [filters]);

  async function confirmar() {
    if (count === null) return;
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedCount: count }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        onSent();
        return;
      }
      const code: string | undefined = data?.error?.code;
      if (code === "conteo_cambio") {
        const nuevo = Number(
          (data?.error?.fields as { path: string; message: string }[] | undefined)?.find((f) => f.path === "count")
            ?.message
        );
        if (Number.isFinite(nuevo)) setCount(nuevo);
        setAviso("La audiencia cambió mientras confirmabas. Revisá la cantidad nueva y confirmá otra vez.");
        return;
      }
      if (code === "tope_superado") {
        setError(data?.error?.message ?? "Supera el tope de 500 personas. Acotá los filtros de la audiencia.");
        return;
      }
      setError(data?.error?.message ?? "No se pudo confirmar el envío.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ConfirmSendDialog
      title="Enviar la campaña"
      confirmLabel={count === null ? "Calculando…" : `Enviar a ${count} ${count === 1 ? "persona" : "personas"}`}
      busy={enviando}
      onConfirm={() => {
        if (count !== null && !error) void confirmar();
      }}
      onClose={onClose}
    >
      <p className="text-foreground">
        {count === null ? "Calculando a cuántas personas…" : `Se enviará a ${count} ${count === 1 ? "persona" : "personas"}.`}
      </p>
      <p>Salen de a uno desde el buzón de marketing. Un envío confirmado no se puede deshacer; sí se puede cancelar lo que falte.</p>
      {aviso && <p className="text-warning">{aviso}</p>}
      {error && <p className="text-danger">{error}</p>}
    </ConfirmSendDialog>
  );
}
