import { apiError, requireCapability } from "@/lib/api";
import { previewCancelacion } from "@/server/enrollment-cancel";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Qué pasaría al cancelar la inscripción: `{ deletable, code?, motivo,
 * detalle }`. Solo para que la pantalla lo explique ANTES de confirmar; la
 * barrera es el DELETE. Misma capacidad que el DELETE.
 */
export const GET = requireCapability(
  "inscripciones.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const decision = await previewCancelacion(session.organizationId, id);
    if (!decision) return apiError(404, "not_found", "Inscripción no encontrada");
    return Response.json(decision);
  }
);
