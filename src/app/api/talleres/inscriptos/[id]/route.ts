import { apiError, parseBody, requireCapability } from "@/lib/api";
import { attendeeStatusSchema, changeAttendeeStatus } from "@/server/workshops";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 033 (FR-012) — Cambiar el estado de un inscripto (Anotado, Confirmado,
 * Asistió, No asistió, Cancelado). Cancelar nunca borra pagos (FR-018).
 */
export const PATCH = requireCapability(
  "inscripciones.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, attendeeStatusSchema);
    if (!body.ok) return body.response;
    const result = await changeAttendeeStatus(session.organizationId, id, body.data.status);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
