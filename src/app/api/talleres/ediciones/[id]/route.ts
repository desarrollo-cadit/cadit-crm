import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import {
  getWorkshopEdition,
  updateWorkshopEdition,
  workshopEditionSchema,
} from "@/server/workshops";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 033 (US2) — Una edición con sus inscriptos. El estado de pago viaja solo
 * con `cobranza.ver` (lo decide el servidor, no la pantalla).
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const detail = await getWorkshopEdition(
      session.organizationId,
      id,
      sessionCapabilities(session)
    );
    if (!detail) return apiError(404, "not_found", "Taller no encontrado");
    return Response.json(detail);
  }
);

/** 033 — Cambiar los datos de la edición (fecha, modalidad, cupo, costo, estado). */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, workshopEditionSchema);
    if (!body.ok) return body.response;
    const result = await updateWorkshopEdition(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
