import { apiError, requireCapability } from "@/lib/api";
import { recompraDeLaOrganizacion } from "@/server/marketing/recompra";

export const dynamic = "force-dynamic";

/**
 * 046 (US5; FR-011, FR-012) — Tasa de recompra, tiempo promedio entre cursos
 * y pares curso → curso siguiente, para `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`
 * (ambos opcionales). Pide `marketing.ver`; no lleva montos ni nombres de
 * personas.
 */
export const GET = requireCapability("marketing.ver", async (session, req: Request) => {
  const url = new URL(req.url);
  const r = await recompraDeLaOrganizacion(session.organizationId, {
    desde: url.searchParams.get("desde") || null,
    hasta: url.searchParams.get("hasta") || null,
  });
  if (!r.ok) return apiError(422, "invalid_query", r.message);
  return Response.json(r.metricas);
});
