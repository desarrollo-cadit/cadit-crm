import { requireCapability } from "@/lib/api";
import { vistaDeLicencias } from "@/server/license-view";

export const dynamic = "force-dynamic";

/**
 * 035 (US3, FR-013..FR-016) — La vista de Licencias: por programa, total,
 * asignadas y libres, y quién tiene cada una. `academico.ver` (FR-021): es la
 * gestión académica. Desasignar una individual va por la ruta de siempre,
 * `DELETE /api/enrollments/[id]/license` (`academico.editar`), que rechaza
 * las del grupo.
 */
export const GET = requireCapability("academico.ver", async (session) => {
  return Response.json(await vistaDeLicencias(session.organizationId));
});
