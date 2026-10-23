import { parseQuery, requireCapability } from "@/lib/api";
import { destinatariosDeCampana, RecipientsQuerySchema } from "@/server/marketing/campaigns";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 045 (FR-021) — A quién se le envió y cómo le fue: estado, motivo, baja y
 * clics. Nombre y correo en bloque: por eso exige `marketing.ver`.
 */
export const GET = requireCapability("marketing.ver", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const q = parseQuery(new URL(req.url), RecipientsQuerySchema);
  if (!q.ok) return q.response;
  return Response.json(
    await destinatariosDeCampana(session.organizationId, id, {
      status: q.data.status,
      clicked: q.data.clicked === "true",
      q: q.data.q,
      page: q.data.page ?? 1,
      pageSize: Number(q.data.pageSize ?? "50"),
    })
  );
});
