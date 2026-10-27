import { apiError, requireCapability } from "@/lib/api";
import { olvidarNombre } from "@/server/zoom/attendance-settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** "Olvidar" un nombre aprendido (constitución 1.9.0 d). */
export const DELETE = requireCapability(
  "configuracion.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    if (!(await olvidarNombre(session.organizationId, id))) {
      return apiError(404, "not_found", "Ese nombre ya no estaba aprendido.");
    }
    return Response.json({ ok: true });
  }
);
