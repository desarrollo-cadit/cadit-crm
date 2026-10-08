import { apiError, requireCapability } from "@/lib/api";
import { getConversation } from "@/server/inbox/queries";
import { listAreaHandoffs } from "@/server/areas/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 029 — Las derivaciones a áreas de una conversación (panel del inbox).
 *
 * Bajo `inbox.ver`: el staff de la academia es quien tiene que enterarse de
 * que una derivación falló (FR-008/FR-010). Conversación ajena → 404.
 */
export const GET = requireCapability("inbox.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const conversation = await getConversation(session.organizationId, id);
  if (!conversation) return apiError(404, "not_found", "Conversación no encontrada");
  const handoffs = await listAreaHandoffs(session.organizationId, id);
  return Response.json({ handoffs });
});
