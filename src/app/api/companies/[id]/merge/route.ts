import { apiError, parseBody, requireCapability } from "@/lib/api";
import { BLOQUEO_MISMA_EMPRESA, unificarEmpresasBodySchema } from "@/lib/company-merge";
import { aplicarUnificacionDeEmpresas, prepararUnificacionDeEmpresas } from "@/server/company-merge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-29 — Unificar dos empresas. `[id]` QUEDA; `absorbedId` se absorbe
 * y se BORRA. IRREVERSIBLE.
 *
 * Todo se vuelve a validar acá, dentro de la transacción del pedido, sobre
 * las dos filas BLOQUEADAS (`prepararUnificacionDeEmpresas` lee con
 * `for update`): lo que mostró la vista previa puede haber cambiado. Un
 * bloqueo se responde ANTES de escribir nada. Si algo falla durante las
 * escrituras, `aplicarUnificacionDeEmpresas` LANZA y la transacción revierte
 * entera: nunca queda una unificación a medias.
 */
export const POST = requireCapability(
  "empresas.unificar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, unificarEmpresasBodySchema);
    if (!body.ok) return body.response;
    if (body.data.absorbedId === id) return apiError(422, "misma_empresa", BLOQUEO_MISMA_EMPRESA);
    const prep = await prepararUnificacionDeEmpresas(session.organizationId, id, body.data.absorbedId);
    if (!prep) return apiError(404, "not_found", "Empresa no encontrada");
    const { plan } = prep;
    if (plan.bloqueos.length > 0) {
      return Response.json(
        {
          error: {
            code: "bloqueado",
            message: plan.bloqueos.map((b) => b.mensaje).join(" "),
            bloqueos: plan.bloqueos,
          },
        },
        { status: 409 }
      );
    }

    const keptId = await aplicarUnificacionDeEmpresas(session.organizationId, plan);
    return Response.json({ keptId, conteos: plan.conteos });
  }
);
