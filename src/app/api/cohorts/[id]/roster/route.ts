import { apiError, withAuth } from "@/lib/api";
import { getCohortRoster } from "@/server/enrollments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 005 (T024, US3, contracts/cohort-roster.md) — accesible por CUALQUIER rol;
// el DTO por rol lo decide getCohortRoster/buildRosterEntry (FR-016/FR-017).
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const roster = await getCohortRoster(session.organizationId, id, session.role);
  if (!roster) return apiError(404, "not_found", "Camada no encontrada");
  return Response.json(roster);
});
