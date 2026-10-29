import { z } from "zod";
import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { corteSchema } from "@/lib/constancia-empresa";
import { vistaPreviaDeConstancia } from "@/server/constancia-empresa";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const querySchema = z.object({ corte: corteSchema.optional() });

/**
 * 2026-10-29 — Lo que la pantalla necesita ANTES de descargar la constancia:
 * los grupos de la empresa (en curso / finalizado al corte) y los avisos para
 * el staff (personas sin facturar a la empresa, clases sin lista). Nada de
 * esto va al PDF. `contactos.ver`, como el reporte por empresa.
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), querySchema);
    if (!query.ok) return query.response;

    const vista = await vistaPreviaDeConstancia(session.organizationId, id, query.data.corte ?? null);
    if (!vista) return apiError(404, "not_found", "Empresa no encontrada");
    return Response.json(vista);
  }
);
