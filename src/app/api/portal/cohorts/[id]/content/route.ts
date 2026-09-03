import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherCohortContent } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 014 (T029, FR-007) — Material y avisos de la cohorte, de solo lectura.
 *
 * El profesor no publica: lo necesita para saber qué tienen sus alumnos
 * delante cuando alguien pregunta "¿dónde está el archivo de la clase 3?".
 */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await teacherCohortContent(ctx.organizationId, ctx.teacherId, id);
    if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(data);
  }
);
