import { apiError, requireCapability } from "@/lib/api";
import { getBulkRun } from "@/server/bulk-sends";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; runId: string }> };

/**
 * 2026-10-05 — El avance de una corrida de acceso al portal. Solo las de
 * acceso y solo de esta cohorte; lo demás responde 404.
 */
export const GET = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id, runId } = await ctx.params;
    const run = await getBulkRun(session.organizationId, runId);
    if (!run || run.cohortId !== id || run.kind !== "portal_access") {
      return apiError(404, "not_found", "Envío no encontrado");
    }
    return Response.json(run);
  }
);
