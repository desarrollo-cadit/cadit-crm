import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherCohortClasses } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 014 (T025) — Las clases de una cohorte del profesor.
 *
 * **404 y no 403** cuando la cohorte no es suya (SC-002): un 403 confirmaría
 * que existe. La decisión no está acá — `teacherCohortClasses` devuelve `null`
 * tanto si no existe como si no la alcanza, y las dos cosas salen iguales.
 */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await teacherCohortClasses(ctx.organizationId, ctx.teacherId, id);
    if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(data);
  }
);
