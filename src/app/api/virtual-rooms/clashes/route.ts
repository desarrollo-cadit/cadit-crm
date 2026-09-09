import { requireCapability } from "@/lib/api";
import { detectClashes } from "@/server/virtual-rooms";

export const dynamic = "force-dynamic";

/**
 * 023 (US3, FR-006) — Los choques de aula, para avisarlos.
 *
 * Es una CONSULTA y no un gate: devuelve la lista y nunca bloquea nada.
 * Coordinación sabe cosas que el sistema no —que esa clase se movió, que ese
 * día es feriado—, así que decide arriba.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const cohortId = new URL(req.url).searchParams.get("cohortId") ?? undefined;
  const clashes = await detectClashes(session.organizationId, { onlyCohortId: cohortId });
  return Response.json({ clashes });
});
