import { apiError, requireCapability } from "@/lib/api";
import { metricasDeCampana } from "@/server/marketing/campaigns";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 045 (FR-021, FR-022) — Liviano: lo que consulta la pantalla mientras envía. */
export const GET = requireCapability("marketing.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const m = await metricasDeCampana(session.organizationId, id);
  if (!m) return apiError(404, "not_found", "Esa campaña no existe.");
  return Response.json(m);
});
