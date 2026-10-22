import { apiError, requireCapability } from "@/lib/api";
import { enlacesDeCampana } from "@/server/marketing/campaigns";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 045 (FR-022) — Clics por enlace: totales y personas únicas. */
export const GET = requireCapability("marketing.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const links = await enlacesDeCampana(session.organizationId, id);
  if (!links) return apiError(404, "not_found", "Esa campaña no existe.");
  return Response.json({ links });
});
