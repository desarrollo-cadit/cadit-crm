import { apiError, requireCapability } from "@/lib/api";
import { revocarToken } from "@/server/mcp/tokens";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0092 — Revoca un token del MCP remoto (lo marca, no lo borra). El corte rige
 * desde el pedido siguiente: el token se busca en la base en cada uso.
 *
 * Ausente o ya revocado = 404, sin distinguir: no hace falta decirle a quien
 * revoca cuál de las dos cosas pasó.
 */
export const DELETE = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const revocado = await revocarToken(session.organizationId, id);
    if (!revocado) return apiError(404, "not_found", "Token no encontrado");
    return Response.json({ ok: true });
  }
);
