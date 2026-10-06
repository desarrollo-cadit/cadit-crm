import { apiError, requireCapability } from "@/lib/api";
import { revokeRecognition } from "@/server/offline-courses/recognition";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; recognitionId: string }> };

/**
 * cursos-offline — Revokes one recognition of this enrollment's student
 * (who and when are recorded; the row stays). What the student really did —
 * topic progress, quiz attempts — is not touched. No body.
 */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, recognitionId } = await ctx.params;
    const r = await revokeRecognition(session.organizationId, id, recognitionId, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
