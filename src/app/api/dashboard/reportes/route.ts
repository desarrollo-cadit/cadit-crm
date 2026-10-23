import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { reportesDeLaOrganizacion } from "@/server/reportes";

export const dynamic = "force-dynamic";

/**
 * 046 US8 (FR-026…FR-031) — Los reportes del inicio, para
 * `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (sin fechas = todo el historial).
 *
 * Pide `reportes.ver`. Los ingresos por curso se consultan SOLO si la sesión
 * también tiene `cobranza.ver`: sin ella no se leen pagos y la clave no viaja.
 */
export const GET = requireCapability("reportes.ver", async (session, req: Request) => {
  const url = new URL(req.url);
  const r = await reportesDeLaOrganizacion(
    session.organizationId,
    { desde: url.searchParams.get("desde") || null, hasta: url.searchParams.get("hasta") || null },
    { conIngresos: sessionCapabilities(session).includes("cobranza.ver") }
  );
  if (!r.ok) return apiError(422, "invalid_query", r.message);
  return Response.json(r.reportes);
});
