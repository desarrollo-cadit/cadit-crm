import { requireFullAccess } from "@/lib/api";
import { activeCurrencies, monthlyRevenue, revenueTrend } from "@/server/finance";

export const dynamic = "force-dynamic";

/**
 * 005 (T037, US6, FR-019, FR-016) — total facturado del mes actual vs. el
 * anterior; `requireFullAccess` (DV-001, T004) responde 403 para
 * `role: "soporte"` sin llegar a calcular nada financiero. Iteración 2 suma
 * `trend` (últimos 6 meses) para el gráfico del home — mismo endpoint, no
 * hace falta uno nuevo.
 *
 * 007 (corrección) — los totales viajan separados por moneda y se agrega
 * `currencies`: qué monedas tuvieron movimiento, para que el panel sepa
 * cuántas pestañas mostrar sin recorrer la serie.
 */
export const GET = requireFullAccess(async (session) => {
  const [dashboard, trend] = await Promise.all([
    monthlyRevenue(session.organizationId),
    revenueTrend(session.organizationId),
  ]);
  const currencies = activeCurrencies([
    dashboard.currentMonth,
    dashboard.previousMonth,
    ...trend,
  ]);
  return Response.json({ ...dashboard, trend, currencies });
});
