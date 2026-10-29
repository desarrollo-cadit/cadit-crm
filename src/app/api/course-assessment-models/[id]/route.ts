import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  actualizarModelo,
  borrarModelo,
  modeloInputSchema,
} from "@/server/course-assessment-templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0084 — Editar o borrar una evaluación modelo del curso (`academico.editar`).
 * Reemplazo total: nombre, consigna con adjuntos y plantilla. Ningún grupo
 * cambia: los que la tomaron tienen su propia copia.
 */
export const PUT = requireCapability("academico.editar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, modeloInputSchema);
  if (!body.ok) return body.response;
  const r = await actualizarModelo(session.organizationId, id, body.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ model: r.data });
});

export const DELETE = requireCapability("academico.editar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const r = await borrarModelo(session.organizationId, id);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json(r.data);
});
