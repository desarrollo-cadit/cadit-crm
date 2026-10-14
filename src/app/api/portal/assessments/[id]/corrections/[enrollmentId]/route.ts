import { apiError, parseBody } from "@/lib/api";
import { correctionInputSchema } from "@/lib/grading-template";
import { requireTeacherPortal } from "@/lib/portal-api";
import {
  guardarCorreccionDelProfesor,
  leerCorreccionDelProfesor,
} from "@/server/corrections";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; enrollmentId: string }> };

/**
 * 031 (T020, DV-014) — La corrección de UN alumno, desde el portal del
 * PROFESOR.
 *
 * Ruta propia y no la del staff con un `if`: es la regla de las tres puertas
 * (014/015). El alcance es el de 014 —titular o suplente— y quien no alcanza
 * la cohorte recibe 404, igual que si no existiera. Una cohorte finalizada se
 * lee pero no se corrige (422 `cohorte_finalizada`).
 *
 * El profesor no tiene capacidades de staff: una evaluación con aprobación se
 * le ofrece como "enviar", y `publish` le responde 422 `requiere_aprobacion`.
 */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id, enrollmentId } = await routeCtx.params;
    const data = await leerCorreccionDelProfesor(
      ctx.organizationId,
      ctx.teacherId,
      id,
      enrollmentId
    );
    if (!data) return apiError(404, "not_found", "Evaluación o alumno no encontrado");
    return Response.json(data);
  }
);

export const PUT = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id, enrollmentId } = await routeCtx.params;
    const body = await parseBody(req, correctionInputSchema);
    if (!body.ok) return body.response;

    const r = await guardarCorreccionDelProfesor(
      ctx.organizationId,
      ctx.teacherId,
      ctx.userId,
      id,
      enrollmentId,
      body.data
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ correction: r.data });
  }
);
