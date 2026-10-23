import { apiError, requireCapability } from "@/lib/api";
import { aplicarTanda } from "@/server/historial-import";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 046 US6 (FR-020) — Aplica la siguiente tanda de filas en la transacción de
 * este pedido. La pantalla lo llama hasta que la importación queda
 * `aplicada`; si se corta, se retoma desde donde quedó.
 */
export const POST = requireCapability(
  "historial.importar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await aplicarTanda(session.organizationId, id);
    if (!r) return apiError(404, "not_found", "Importación no encontrada");
    if ("error" in r) return apiError(409, "no_aplicable", "Esta importación se deshizo: no se puede aplicar.");
    return Response.json(r);
  }
);
