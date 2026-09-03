import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherCohortGrading } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 014 (T028) — La planilla de evaluación del profesor.
 *
 * **Sin POST**: crear evaluaciones es de la academia (FR-006/DV-002). No es
 * que el botón esté escondido — la ruta no existe.
 */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await teacherCohortGrading(ctx.organizationId, ctx.teacherId, id);
    if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(data);
  }
);
