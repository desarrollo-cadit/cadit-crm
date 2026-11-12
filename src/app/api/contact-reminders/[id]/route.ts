import { apiError, parseBody, requireCapability } from "@/lib/api";
import { recordatorioAccionSchema } from "@/lib/recordatorios";
import { cambiarRecordatorio } from "@/server/recordatorios";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Marcar hecho, reabrir o borrar un recordatorio. Cualquiera con
 * `inscripciones.seguimiento` puede resolver el de otra persona; se guarda
 * quién. Uno ajeno o inexistente es 404.
 */
export const PATCH = requireCapability(
  "inscripciones.seguimiento",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, recordatorioAccionSchema);
    if (!body.ok) return body.response;
    const r = await cambiarRecordatorio(session.organizationId, id, session.userId, body.data.action);
    if (!r.ok) return apiError(404, "not_found", "Recordatorio no encontrado");
    return Response.json({ reminder: r.recordatorio });
  }
);
