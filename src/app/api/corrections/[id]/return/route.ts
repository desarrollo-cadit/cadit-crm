import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { devolverCorreccion } from "@/server/corrections";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const body = z.object({
  comment: z
    .string()
    .trim()
    .min(1, "Escribí por qué la devolvés")
    .max(2000, "El comentario no puede pasar de 2000 caracteres"),
});

/**
 * 031 (T033, FR-019) — Devuelve: pending → draft, con el comentario que va a
 * leer quien corrigió. El comentario es obligatorio.
 */
export const POST = requireCapability(
  "correcciones.aprobar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const b = await parseBody(req, body);
    if (!b.ok) return b.response;
    const r = await devolverCorreccion(session.organizationId, id, session.userId, b.data.comment);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ correction: r.data });
  }
);
