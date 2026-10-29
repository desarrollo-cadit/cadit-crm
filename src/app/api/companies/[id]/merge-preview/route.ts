import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { BLOQUEO_MISMA_EMPRESA, vistaPreviaDeEmpresas, vistaPreviaEmpresasQuerySchema } from "@/lib/company-merge";
import { prepararUnificacionDeEmpresas } from "@/server/company-merge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-29 — Vista previa de "Unificar empresas". `[id]` es la que QUEDA y
 * `?with=` la que se absorbe. Unificar es irreversible, así que la pantalla
 * SIEMPRE pasa por acá antes: cómo queda cada dato, qué se mueve y qué
 * bloquea. Es la MISMA función que usa la unificación
 * (`planDeUnificacionDeEmpresas`); acá no se escribe nada.
 *
 * Empresa ajena o inexistente (cualquiera de las dos): 404.
 */
export const GET = requireCapability(
  "empresas.unificar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), vistaPreviaEmpresasQuerySchema);
    if (!query.ok) return query.response;
    if (query.data.with === id) return apiError(422, "misma_empresa", BLOQUEO_MISMA_EMPRESA);
    const prep = await prepararUnificacionDeEmpresas(session.organizationId, id, query.data.with);
    if (!prep) return apiError(404, "not_found", "Empresa no encontrada");
    return Response.json({ preview: vistaPreviaDeEmpresas(prep.kept, prep.absorbed, prep.plan) });
  }
);
