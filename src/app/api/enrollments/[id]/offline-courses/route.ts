import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  enrollmentCourseStates,
  setEnrollmentOverride,
} from "@/server/offline-courses/access";
import { attemptsForEnrollment } from "@/server/offline-courses/attempts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T4) — One student's library access (every course with its
 * state: inherited / granted / revoked / none) plus their attempt history.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const states = await enrollmentCourseStates(session.organizationId, id);
    if (!states) return apiError(404, "not_found", "Inscripción no encontrada");
    const attempts = await attemptsForEnrollment(session.organizationId, id);
    return Response.json({ courses: states, attempts });
  }
);

const putSchema = z.object({
  courseId: z.string().min(1).max(64),
  action: z.enum(["grant", "revoke", "clear"]),
});

/** An individual override on top of the cohort; "clear" goes back to the cohort. */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, putSchema);
    if (!body.ok) return body.response;

    const result = await setEnrollmentOverride(
      session.organizationId,
      id,
      body.data.courseId,
      body.data.action,
      session.userId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
