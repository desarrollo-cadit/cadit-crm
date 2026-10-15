import { z } from "zod";
import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { listCohortClasses } from "@/server/classes";
import { borrarClasesDeRango } from "@/server/class-changes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 013 (T012, FR-004/FR-005) — Las clases de una cohorte, reales o proyectadas.
 *
 * Reemplaza la fuente del calendario, que hasta acá leía `/api/cohorts` y
 * dibujaba los días de la semana declarados: una clase cancelada seguía
 * apareciendo porque nadie miraba `class_session`.
 *
 * `academico.ver` y no `asistencia.ver`: esto es el cronograma del curso, no
 * quién vino. Soporte lo necesita tanto como coordinación.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await listCohortClasses(session.organizationId, id);
    if (!result) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(result);
  }
);

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");
const rangeSchema = z.object({ from: DIA, to: DIA });

/**
 * 034 (US3 escenario 3, FR-012) — Borra las clases de la cohorte entre dos
 * días (inclusive). Se borran las que no tienen asistencia ni grabación; las
 * demás se conservan y se devuelven en `kept` para que una persona decida.
 * Las fechas de la cohorte no cambian.
 */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), rangeSchema);
    if (!query.ok) return query.response;
    const result = await borrarClasesDeRango(
      session.organizationId,
      id,
      query.data.from,
      query.data.to
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
