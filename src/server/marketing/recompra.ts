import { metricasDeRecompra, periodoDeRecompra, type MetricasDeRecompra } from "@/lib/marketing/recompra";
import { relojDeAsistencia } from "@/server/attendance";
import { historialesDeLaOrganizacion } from "@/server/recorrido-comercial";

/**
 * 046 (US5; FR-011, FR-012) — Recompra de la organización para un período.
 * Lee los mismos historiales que las audiencias (una sola definición de
 * "cursó") y no lee plata. Quién puede verla lo decide la ruta
 * (`marketing.ver`).
 */
export async function recompraDeLaOrganizacion(
  organizationId: string,
  rango: { desde: string | null; hasta: string | null },
  now: Date = new Date()
): Promise<{ ok: true; metricas: MetricasDeRecompra } | { ok: false; message: string }> {
  const { timeZone } = await relojDeAsistencia(organizationId, now);
  const periodo = periodoDeRecompra(rango.desde, rango.hasta, timeZone);
  if (!periodo.ok) return periodo;
  return {
    ok: true,
    metricas: metricasDeRecompra(await historialesDeLaOrganizacion(organizationId, now), periodo.periodo),
  };
}
