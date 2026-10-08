"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import {
  AREA_LABELS,
  COLLECTED_FIELD_LABELS,
  type AreaHandoffDto,
  type HandoffEmailStatus,
} from "@/lib/areas";
import { cn } from "@/lib/utils";

/**
 * 029 (US1) — Sección «Derivaciones» del panel del contacto.
 *
 * Las áreas externas (Ventas, Soporte) no usan el CRM: el correo es su única
 * vista del caso. Esta sección es la del staff de la academia, que tiene que
 * enterarse si una derivación falló (FR-008/FR-010). Se refresca con cada
 * evento SSE de la conversación (`refreshKey`).
 */

const STATUS_LABELS: Record<HandoffEmailStatus, string> = {
  pendiente: "Enviando",
  enviado: "Enviado",
  fallido: "Falló el envío",
  sin_configurar: "Área sin configurar",
  simulado: "Simulado (Laboratorio)",
};

const STATUS_CLASSES: Record<HandoffEmailStatus, string> = {
  pendiente: "border-border bg-subtle text-text-2",
  enviado: "border-success-border bg-success-soft text-success",
  fallido: "border-danger-border bg-danger-soft text-danger",
  sin_configurar: "border-warning-border bg-warning-soft text-warning",
  simulado: "border-border bg-subtle text-text-2",
};

/** Un correo `pendiente` hace más de 15 min: el proceso pudo morir entre el commit y el envío. */
const STALE_MS = 15 * 60 * 1000;

const fieldLabel = (k: string) =>
  (COLLECTED_FIELD_LABELS as Record<string, string>)[k] ?? k;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" });

export function AreaHandoffs({
  conversationId,
  refreshKey = 0,
}: {
  conversationId: string;
  refreshKey?: number;
}) {
  const [handoffs, setHandoffs] = useState<AreaHandoffDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/conversations/${conversationId}/area-handoffs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { handoffs?: AreaHandoffDto[] } | null) => {
        if (!cancelled) setHandoffs(data?.handoffs ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshKey]);

  if (handoffs.length === 0) return null;

  return (
    <section className="border-b p-4" aria-label="Derivaciones">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
        Derivaciones
      </p>
      <ul className="space-y-2.5">
        {handoffs.map((h) => {
          const last = h.emails[h.emails.length - 1];
          const stale =
            last?.status === "pendiente" &&
            Date.now() - new Date(last.createdAt).getTime() > STALE_MS;
          return (
            <li key={h.id} className="rounded-md border bg-subtle px-3 py-2.5" data-case-ref={h.caseRef}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Send className="h-3.5 w-3.5 text-text-3" strokeWidth={1.7} />
                  {AREA_LABELS[h.area]} · {h.caseRef}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    STATUS_CLASSES[h.status]
                  )}
                >
                  {stale ? "Sin confirmar" : STATUS_LABELS[h.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-2">{h.summary}</p>
              {last && last.to.length > 0 && (
                <p className="mt-1 text-[11px] text-text-3">
                  Para {last.to.join(", ")}
                  {last.cc.length > 0 && ` · CC ${last.cc.join(", ")}`}
                </p>
              )}
              {h.missing.length > 0 && (
                <p className="mt-1 text-[11px] text-text-3">
                  Faltan: {h.missing.map(fieldLabel).join(", ")}
                </p>
              )}
              {last?.status === "fallido" && last.error && (
                <p className="mt-1 text-[11px] text-danger">Motivo: {last.error}</p>
              )}
              {stale && (
                <p className="mt-1 text-[11px] text-warning">
                  El envío no se confirmó: reenviá la consulta al área a mano.
                </p>
              )}
              <p className="mt-1 text-[11px] text-text-3">
                {h.emails.length > 1 ? `${h.emails.length} correos · ` : ""}
                {fmt(h.lastActivityAt)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
