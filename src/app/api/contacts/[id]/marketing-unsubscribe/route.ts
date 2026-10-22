import { apiError, requireCapability } from "@/lib/api";
import { revertirBaja } from "@/server/marketing/unsubscribe";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 045 (FR-015) — Reactivar los correos de marketing de un contacto. Solo con
 * `marketing.configurar`: deshace una oposición expresa de la persona (Ley
 * 18.331). Marca la baja como revertida; nunca la borra.
 */
export const DELETE = requireCapability("marketing.configurar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const r = await revertirBaja(session, id);
  if (!r.ok) return apiError(404, "not_found", "Ese contacto no tiene una baja de marketing activa.");
  return Response.json({ reverted: true });
});
