import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { ventasPorVendedor } from "@/server/ventas-por-vendedor";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** `"2026-08"`. Ausente = el mes anterior, igual que el cierre. */
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período se pide como AAAA-MM")
    .optional(),
});

/**
 * 2026-10-06 — Ventas por vendedor de un período, para pagar comisiones.
 *
 * `cobranza.ver` y no una capacidad nueva: lo que viaja son montos de venta,
 * que es exactamente el dato que esa capacidad gobierna. Administración la
 * tiene y es quien paga; soporte no, y no ve ni el reporte ni los importes.
 */
export const GET = requireCapability("cobranza.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;

  const reporte = await ventasPorVendedor(session.organizationId, {
    mes: query.data.mes ?? null,
  });

  return Response.json({
    periodo: {
      mes: reporte.periodo.mes,
      etiqueta: reporte.periodo.etiqueta,
      desde: reporte.periodo.desde.toISOString(),
      hasta: reporte.periodo.hasta.toISOString(),
      timezone: reporte.periodo.timezone,
    },
    grupos: reporte.grupos,
    sinVendedor: reporte.sinVendedor,
  });
});
