import { apiError, requireCapability } from "@/lib/api";
import { staffCompleteTopic } from "@/server/offline-courses/progress";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; topicId: string }> };

/**
 * cursos-offline (T9) — Staff marks one topic complete for this enrollment's
 * student (author + date are recorded). The way out when the Vimeo player
 * cannot play for that person. Idempotent: an already complete topic keeps
 * who completed it and when. No body.
 */
export const PUT = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, topicId } = await ctx.params;
    const r = await staffCompleteTopic(session.organizationId, id, topicId, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
