import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { getCohortRoster } from "@/server/enrollments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 005 (T024, US3, contracts/cohort-roster.md) — accesible por CUALQUIER rol;
// el DTO por rol lo decide getCohortRoster/buildRosterEntry (FR-016/FR-017).
export const GET = requireCapability(
  "inscripciones.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const roster = await getCohortRoster(session.organizationId, id, sessionCapabilities(session));
  if (!roster) return apiError(404, "not_found", "Cohorte no encontrada");
  return Response.json(roster);
});
