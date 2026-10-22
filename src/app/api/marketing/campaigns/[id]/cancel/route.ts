import { requireCapability } from "@/lib/api";
import { cancelarCampana } from "@/server/marketing/campaigns";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 045 (FR-020) — Cancela un envío en curso; los pendientes no lo reciben. */
export const POST = requireCapability("marketing.enviar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const r = await cancelarCampana(session, id);
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json({ status: "cancelada", cancelled: r.cancelled });
});
