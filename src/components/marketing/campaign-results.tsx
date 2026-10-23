"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmSendDialog } from "@/components/cohorts/confirm-send-dialog";
import { notify } from "@/lib/notify";
import type { CampaignMetricsDto, CampaignRecipientDto } from "@/server/marketing/campaigns";

/**
 * 045 (FR-020, FR-021, FR-022) — Cómo va y cómo le fue a una campaña:
 * métricas, la tabla de destinatarios con filtros y los clics por enlace.
 * Mientras se envía, consulta cada 3 s (como el envío por grupo).
 */

const POLL_MS = 3000;
const PAGE_SIZE = 50;

const ESTADO: Record<CampaignRecipientDto["status"], string> = {
  pendiente: "Pendiente",
  enviado: "Enviado",
  fallido: "Falló",
  omitido: "Omitido",
  cancelado: "Cancelado",
};

type Enlace = { id: string; url: string; clicks: number; uniqueRecipients: number };

function Cifra({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{valor}</p>
    </div>
  );
}

export function CampaignResults({
  campaignId,
  initialMetrics,
  canCancel,
}: {
  campaignId: string;
  initialMetrics: CampaignMetricsDto;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [m, setM] = useState(initialMetrics);
  const [filas, setFilas] = useState<CampaignRecipientDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [clicked, setClicked] = useState(false);
  const [q, setQ] = useState("");
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const [cancelando, setCancelando] = useState(false);
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (clicked) params.set("clicked", "true");
    if (q.trim()) params.set("q", q.trim());
    const [rm, rr, rl] = await Promise.all([
      fetch(`/api/marketing/campaigns/${campaignId}/metrics`),
      fetch(`/api/marketing/campaigns/${campaignId}/recipients?${params}`),
      fetch(`/api/marketing/campaigns/${campaignId}/links`),
    ]);
    if (rm.ok) setM((await rm.json()) as CampaignMetricsDto);
    if (rr.ok) {
      const d = (await rr.json()) as { recipients: CampaignRecipientDto[]; total: number };
      setFilas(d.recipients);
      setTotal(d.total);
    }
    if (rl.ok) setEnlaces(((await rl.json()) as { links: Enlace[] }).links);
  }, [campaignId, page, status, clicked, q]);

  useEffect(() => {
    const t = setTimeout(() => void cargar().catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [cargar]);

  useEffect(() => {
    if (m.status !== "enviando") return;
    const i = setInterval(() => void cargar().catch(() => undefined), POLL_MS);
    return () => clearInterval(i);
  }, [m.status, cargar]);

  async function cancelar() {
    setCancelando(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify.error(data?.error?.message ?? "No se pudo cancelar.");
        return;
      }
      notify.success(`Campaña cancelada. ${(data as { cancelled: number }).cancelled} personas no la reciben.`);
      setConfirmarCancelacion(false);
      router.refresh();
      await cargar();
    } finally {
      setCancelando(false);
    }
  }

  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {m.status === "enviando" && m.pausedUntil && new Date(m.pausedUntil) > new Date() && (
        <p className="flex items-center gap-2 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning">
          <PauseCircle className="h-4 w-4" aria-hidden />
          En pausa por el límite del buzón. Sigue sola en unos instantes.
        </p>
      )}
      {m.status === "enviando" && m.lastError && (
        <p className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Detenida: {m.lastError}. Se reintenta sola cuando el buzón vuelva a tener permiso.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Cifra label="Destinatarios" valor={m.total} />
        <Cifra label="Enviados" valor={m.sent} />
        <Cifra label="Pendientes" valor={m.pending} />
        <Cifra label="Fallidos" valor={m.failed} />
        <Cifra label="Omitidos" valor={m.skipped} />
        <Cifra label="Cancelados" valor={m.cancelled} />
        <Cifra label="Bajas" valor={m.unsubscribes} />
        <Cifra label={`Clics (${m.clicks.uniqueRecipients} personas)`} valor={m.clicks.total} />
      </div>

      {canCancel && m.status === "enviando" && (
        <Button variant="outline" onClick={() => setConfirmarCancelacion(true)}>
          Cancelar el envío
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => (setPage(1), setStatus(e.target.value))} aria-label="Filtrar por estado" className="w-40">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={clicked}
            onChange={(e) => (setPage(1), setClicked(e.target.checked))}
          />
          Hizo clic
        </label>
        <Input
          value={q}
          onChange={(e) => (setPage(1), setQ(e.target.value))}
          placeholder="Buscar nombre o correo"
          maxLength={100}
          className="max-w-xs"
          aria-label="Buscar nombre o correo"
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Clics</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-2">{f.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{f.email}</td>
                <td className="px-3 py-2">{ESTADO[f.status]}</td>
                <td className="px-3 py-2">{f.clickCount}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {[f.reason, f.unsubscribedHere ? "Se dio de baja desde esta campaña" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No hay destinatarios con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-muted-foreground">
            Página {page} de {paginas}
          </span>
          <Button variant="outline" size="sm" disabled={page >= paginas} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      {enlaces.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Clics por enlace</h2>
          <ul className="divide-y rounded-md border bg-card text-sm">
            {enlaces.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{l.url}</span>
                <span className="shrink-0 text-muted-foreground">
                  {l.clicks} clics · {l.uniqueRecipients} personas
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmarCancelacion && (
        <ConfirmSendDialog
          title="Cancelar el envío"
          confirmLabel="Sí, cancelar el envío"
          busyLabel="Cancelando…"
          busy={cancelando}
          onConfirm={() => void cancelar()}
          onClose={() => setConfirmarCancelacion(false)}
        >
          <p>Los que todavía no recibieron el correo no lo van a recibir. Lo ya enviado no se puede deshacer.</p>
        </ConfirmSendDialog>
      )}
    </div>
  );
}
