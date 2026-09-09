import { apiError, requireCapability } from "@/lib/api";
import { deleteResource } from "@/server/resources";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 013 (T021) — Quitar un material. Es un enlace: borrarlo no borra nada más. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await deleteResource(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ ok: true });
  }
);
