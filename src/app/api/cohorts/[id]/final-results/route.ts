import { apiError, parseBody, requireCapability } from "@/lib/api";
import { confirmacionesDelCuerpo, confirmacionesSchema } from "@/lib/resultado-final";
import { cierreDeCursada, confirmarResultados } from "@/server/final-results";
import { exigirEvaluacionesDeGrupo } from "@/server/taller-config";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0086 — El resultado final de cada alumno del grupo, del lado del staff: la
 * misma lista que ve el profesor, más el estado del certificado.
 *
 * Leer pide `evaluacion.ver` (la puerta de la planilla).
 */
export const GET = requireCapability("evaluacion.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const data = await cierreDeCursada(session.organizationId, id);
  if (!data) return apiError(404, "not_found", "Grupo no encontrado");
  // 2026-10-29 — Taller sin evaluaciones: no hay cierre (409).
  const sinEvaluaciones = await exigirEvaluacionesDeGrupo(session.organizationId, id);
  if (sinEvaluaciones) return apiError(sinEvaluaciones.status, sinEvaluaciones.code, sinEvaluaciones.message);
  return Response.json(data);
});

/**
 * 0086 — Coordinación confirma o corrige el resultado final cuando cierra un
 * grupo. `correcciones.aprobar`: es decidir sobre la cursada de un alumno
 * (031, DV-006), la misma capacidad que publica una nota que espera
 * aprobación. Soporte no la tiene.
 */
export const PUT = requireCapability(
  "correcciones.aprobar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, confirmacionesSchema);
    if (!body.ok) return body.response;

    const r = await confirmarResultados(
      session.organizationId,
      id,
      confirmacionesDelCuerpo(body.data),
      session.userId
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
