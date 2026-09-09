import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { studentCourseDetail } from "@/server/student-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 015 (US1-US4) — Una cursada del alumno: clases, asistencia, evaluación y
 * material.
 *
 * **404 y no 403** cuando la inscripción es de otra persona (SC-002): un 403
 * confirmaría que existe. La decisión no está acá — `studentCourseDetail`
 * devuelve `null` tanto si no existe como si no es suya, y las dos cosas salen
 * iguales.
 */
export const GET = requireStudentPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await studentCourseDetail(ctx.organizationId, ctx.contactId, id);
    if (!data) return apiError(404, "not_found", "Cursada no encontrada");
    return Response.json(data);
  }
);
