import { apiError, requireCapability } from "@/lib/api";
import { getBulkRun } from "@/server/bulk-sends";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; runId: string }> };

/**
 * 2026-10-05 — El avance de una corrida de términos o bienvenida, destinatario
 * por destinatario. Una corrida de acceso al portal, o de otra cohorte, no se
 * lee por acá: 404, igual que si no existiera.
 */
export const GET = requireCapability(
  "inscripciones.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id, runId } = await ctx.params;
    const run = await getBulkRun(session.organizationId, runId);
    if (!run || run.cohortId !== id || run.kind === "portal_access") {
      return apiError(404, "not_found", "Envío no encontrado");
    }
    return Response.json(run);
  }
);
