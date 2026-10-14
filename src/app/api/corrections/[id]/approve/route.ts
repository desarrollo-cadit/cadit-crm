import { apiError, requireCapability } from "@/lib/api";
import { aprobarCorreccion } from "@/server/corrections";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 031 (T033, DV-003) — Aprueba: pending → published por la única puerta del
 * resultado oficial. Si la publicación falla, `publicarCorreccion` LANZA y la
 * transacción del pedido revierte también la marca de revisión.
 */
export const POST = requireCapability(
  "correcciones.aprobar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await aprobarCorreccion(session.organizationId, id, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ correction: r.data });
  }
);
