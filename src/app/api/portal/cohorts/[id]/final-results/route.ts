import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { confirmacionesDelCuerpo, confirmacionesSchema } from "@/lib/resultado-final";
import { teacherConfirmFinalResults, teacherFinalResults } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0086 — Cerrar la cursada: el profesor ve, para cada alumno de SU grupo, la
 * asistencia, las evaluaciones obligatorias, la SUGERENCIA y lo confirmado.
 * Un grupo ajeno responde 404, igual que uno que no existe.
 */
export const GET = requireTeacherPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { id } = await routeCtx.params;
  const data = await teacherFinalResults(ctx.organizationId, ctx.teacherId, id);
  if (!data) return apiError(404, "not_found", "Grupo no encontrado");
  return Response.json(data);
});

/**
 * 0086 — El profesor confirma (o corrige) el resultado final: aprobado o
 * reprobado, sea cual sea la sugerencia. Solo con el grupo terminado (422
 * `grupo_no_finalizado`). Confirmar "reprobado" anula el certificado vigente.
 */
export const PUT = requireTeacherPortal(async (ctx, req: Request, routeCtx: Params) => {
  const { id } = await routeCtx.params;
  const body = await parseBody(req, confirmacionesSchema);
  if (!body.ok) return body.response;

  const r = await teacherConfirmFinalResults(
    ctx.organizationId,
    ctx.teacherId,
    ctx.userId,
    id,
    confirmacionesDelCuerpo(body.data)
  );
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json(r.data);
});
