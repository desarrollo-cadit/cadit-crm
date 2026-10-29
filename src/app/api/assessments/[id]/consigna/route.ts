import { apiError, parseBody, requireCapability } from "@/lib/api";
import { consignaSchema } from "@/lib/assessment-consigna";
import { guardarConsigna, leerConsigna } from "@/server/grading";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0084 — La consigna de una evaluación del grupo (texto + adjuntos), desde el
 * panel del STAFF. Leerla es `evaluacion.ver`; editarla, `evaluacion.editar`,
 * la misma que la plantilla. No se congela.
 */
export const GET = requireCapability("evaluacion.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const data = await leerConsigna(session.organizationId, id);
  if (!data) return apiError(404, "not_found", "Evaluación no encontrada");
  return Response.json(data);
});

export const PUT = requireCapability("evaluacion.editar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, consignaSchema);
  if (!body.ok) return body.response;
  const r = await guardarConsigna(session.organizationId, id, body.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json(r.data);
});
