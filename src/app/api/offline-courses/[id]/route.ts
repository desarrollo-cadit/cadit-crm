import { apiError, parseBody, requireCapability } from "@/lib/api";
import { coursePatchSchema } from "@/server/offline-courses/editor-logic";
import { deleteCourse, editorResponse, updateCourse } from "@/server/offline-courses/editor";
import { courseDetail } from "@/server/offline-courses/library";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T4) — One library course WITH the correct answers and the
 * positions/ids the editor needs (T11). Staff only: the student portal has
 * its own route and never sees `isCorrect`.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const course = await courseDetail(session.organizationId, id);
    if (!course) return apiError(404, "not_found", "Curso no encontrado");
    return Response.json({ course });
  }
);

/** T11 — Title, description (markdown) and status. The slug does not change. */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, coursePatchSchema);
    if (!body.ok) return body.response;
    return editorResponse(await updateCourse(session.organizationId, id, body.data));
  }
);

/** T11 — 409 `has_history` when a student has attempts or progress in it (→ draft instead). */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    return editorResponse(await deleteCourse(session.organizationId, id));
  }
);
