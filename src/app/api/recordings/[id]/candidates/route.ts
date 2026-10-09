import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { candidatesQuerySchema, listCandidates } from "@/server/zoom/recordings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 030 US3 — Las clases que se ofrecen al asignar una grabación a mano:
 * sugeridas (candidatas del matcher + clases del mismo día), cohortes por
 * texto (`q`) y las clases de una cohorte (`cohortId`) o de un día (`date`).
 * Solo clases reales; nunca proyecciones.
 */
export const GET = requireCapability(
  "grabaciones.gestionar",
  async (session, req: Request, { params }: Ctx) => {
    const { id } = await params;
    const q = parseQuery(new URL(req.url), candidatesQuerySchema);
    if (!q.ok) return q.response;
    const data = await listCandidates(session.organizationId, id, q.data);
    if (!data) return apiError(404, "no_existe", "Grabación no encontrada.");
    return Response.json(data);
  }
);
