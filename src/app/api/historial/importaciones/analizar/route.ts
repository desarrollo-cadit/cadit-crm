import { apiError, parseBody, requireCapability } from "@/lib/api";
import { analizarBodySchema } from "@/lib/historial-import/body";
import { analizarPlanilla } from "@/server/historial-import";

export const dynamic = "force-dynamic";

/**
 * 046 US6 (FR-014, FR-015) — Paso 1: lee la planilla, lista los cursos y
 * vendedores distintos con su sugerencia y las filas con problemas. No escribe.
 */
export const POST = requireCapability("historial.importar", async (session, req: Request) => {
  const body = await parseBody(req, analizarBodySchema);
  if (!body.ok) return body.response;
  const r = await analizarPlanilla(session.organizationId, body.data.csv);
  if (!r.ok) return apiError(422, r.code, r.message);
  return Response.json(r.analisis);
});
