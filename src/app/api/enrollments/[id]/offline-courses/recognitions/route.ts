import { apiError, parseBody, requireCapability } from "@/lib/api";
import { validateRecognitionRequest } from "@/server/offline-courses/logic";
import { recognizeForEnrollment } from "@/server/offline-courses/recognition";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline — Staff recognizes that this enrollment's student already
 * completed the whole course (`scope: "course"`) or some of its lessons
 * (`scope: "lessons"`) in the previous academy, with a required reason.
 * Same capability as the one-topic override. Idempotent: what is already
 * recognized is not written again (`created` counts the new rows).
 *
 * 422: no reason, a course the enrollment does not read, or a lesson of
 * another course. 404: the enrollment is not in this organization.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, validateRecognitionRequest);
    if (!body.ok) return body.response;

    const r = await recognizeForEnrollment(session.organizationId, id, body.data, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
