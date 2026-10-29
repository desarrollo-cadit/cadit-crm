import { apiError, requireCapability } from "@/lib/api";
import { tomarEvaluacionesDelCurso } from "@/server/grading";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0084 — "Tomar del curso": copia las evaluaciones modelo del curso a este
 * grupo. `evaluacion.editar`, igual que copiar de otro grupo: crea
 * evaluaciones del grupo. Misma regla de duplicados (nombre normalizado):
 * tomar dos veces no duplica.
 */
export const POST = requireCapability("evaluacion.editar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const r = await tomarEvaluacionesDelCurso(session.organizationId, id);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json(r.data);
});
