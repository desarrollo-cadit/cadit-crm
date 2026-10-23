import { apiError, requireCapability } from "@/lib/api";
import { deshacerImportacion } from "@/server/historial-import";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 046 US6 (FR-020) — "Deshacer esta importación": borra sus cursadas
 * históricas. Los contactos y las empresas creados quedan.
 */
export const DELETE = requireCapability(
  "historial.importar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await deshacerImportacion(session.organizationId, session.userId, id);
    if (!r) return apiError(404, "not_found", "Importación no encontrada");
    return Response.json(r);
  }
);
