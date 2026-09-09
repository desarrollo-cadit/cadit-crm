import { requireCapability } from "@/lib/api";
import {
  activeCurrencies,
  collectedRevenue,
  collectedTrend,
  monthlyRevenue,
  revenueTrend,
} from "@/server/finance";

export const dynamic = "force-dynamic";

/**
 * 005 (T037, US6, FR-019, FR-016) — total facturado del mes actual vs. el
 * anterior; `cobranza.ver` (DV-001, T004) responde 403 para
 * `role: "soporte"` sin llegar a calcular nada financiero. Iteración 2 suma
 * `trend` (últimos 6 meses) para el gráfico del home — mismo endpoint, no
 * hace falta uno nuevo.
 *
 * 007 (corrección) — los totales viajan separados por moneda y se agrega
 * `currencies`: qué monedas tuvieron movimiento, para que el panel sepa
 * cuántas pestañas mostrar sin recorrer la serie.
 */
export const GET = requireCapability(
  "cobranza.ver",
  async (session) => {
  const [dashboard, trend, collected, collectedSeries] = await Promise.all([
    monthlyRevenue(session.organizationId),
    revenueTrend(session.organizationId),
    collectedRevenue(session.organizationId),
    collectedTrend(session.organizationId),
  ]);
  const currencies = activeCurrencies([
    dashboard.currentMonth,
    dashboard.previousMonth,
    ...trend,
  ]);
  // 008 (T025) —  se AGREGA; la forma existente no cambia, así
  // que los consumidores actuales siguen funcionando sin tocar nada.
  return Response.json({
    ...dashboard,
    trend,
    currencies,
    collected: { ...collected, trend: collectedSeries },
  });
});
