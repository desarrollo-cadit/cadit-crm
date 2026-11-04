import { requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { vistaDeLicencias } from "@/server/license-view";

export const dynamic = "force-dynamic";

/**
 * 035 (US3, FR-013..FR-016) — La vista de Licencias: por programa, total,
 * asignadas y libres, y quién tiene cada una. `licencias.ver` (2026-11-04:
 * antes `academico.ver`, FR-021; Administración tiene esa y no debe ver esta
 * pantalla). Desasignar una individual va por la ruta de siempre,
 * `DELETE /api/enrollments/[id]/license` (`licencias.gestionar`), que rechaza
 * las del grupo.
 */
export const GET = requireCapability("licencias.ver", async (session) => {
  // 2026-10-21 — El correo de la licencia, solo para quien ve correos (contactos.ver).
  const conCorreo = sessionCapabilities(session).includes("contactos.ver");
  return Response.json(await vistaDeLicencias(session.organizationId, { conCorreo }));
});
