import { apiError, parseBody, requireCapability } from "@/lib/api";
import { confirmarSchema } from "@/lib/zoom-attendance-api";
import { confirmarAsistenciaDeZoom } from "@/server/zoom/attendance-review";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Constitución 1.9.0 (b) — CONFIRMAR la sugerencia de Zoom: lo único que
 * escribe asistencia desde Zoom. La marca guarda a quien confirmó
 * (`recorded_by`), origen `zoom` y los minutos; por defecto solo completa a
 * quien no tenía marca (pisar pide `overwrite`). Lo corregido se aprende.
 */
export const POST = requireCapability("asistencia.editar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, confirmarSchema);
  if (!body.ok) return body.response;
  const r = await confirmarAsistenciaDeZoom(session.organizationId, id, session.userId, {
    decisions: body.data.decisions,
    ignore: body.data.ignore ?? [],
    rejected: body.data.rejected ?? [],
    overwrite: body.data.overwrite ?? [],
  });
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json(r.data);
});
