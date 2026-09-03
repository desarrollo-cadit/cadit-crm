import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { cancelSession, markAttendance } from "@/server/attendance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  /**
   * Marcas de asistencia de la clase. Volver a mandar una inscripción ya
   * marcada CORRIGE la marca: el caso normal es rectificar, no llevar dos
   * registros del mismo alumno en la misma clase.
   */
  attendance: z
    .array(
      z.object({
        enrollmentId: z.string().min(1),
        status: z.enum(["presente", "tarde", "ausente", "justificado"]),
        notes: z.string().max(500).nullable().optional(),
      })
    )
    .max(200)
    .optional(),
  /** Motivo de cancelación: cancelar saca la clase del cálculo de todos. */
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

/**
 * 009 — Toma de asistencia y cancelación de una clase. Cualquier rol, igual
 * que el resto de la operativa académica (FR-014).
 */
export const PATCH = requireCapability(
  "asistencia.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  if (body.data.cancelReason) {
    const canceled = await cancelSession(
      session.organizationId,
      id,
      body.data.cancelReason
    );
    if (!canceled.ok) return apiError(canceled.status, canceled.code, canceled.message);
    return Response.json({ session: canceled.data });
  }

  if (body.data.attendance) {
    const marked = await markAttendance(session.organizationId, id, body.data.attendance);
    if (!marked.ok) return apiError(marked.status, marked.code, marked.message);
    return Response.json({ marked: marked.data.marked });
  }

  return apiError(422, "invalid_body", "Nada para actualizar");
});
