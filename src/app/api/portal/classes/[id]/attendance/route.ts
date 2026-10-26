import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherAttendanceSheet } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 014 (T026) — La asistencia de UNA clase, para CONSULTA.
 *
 * Desde 2026-10-26 pasar lista es de Coordinación: el portal no expone
 * escritura, solo esta lectura (quién vino, quién dejó la marca y cuándo).
 */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await teacherAttendanceSheet(ctx.organizationId, ctx.teacherId, id);
    if (!data) return apiError(404, "not_found", "Clase no encontrada");
    return Response.json(data);
  }
);
