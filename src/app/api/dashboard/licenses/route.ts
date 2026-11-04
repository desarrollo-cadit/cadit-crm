import { requireCapability } from "@/lib/api";
import { listLicenseInventory } from "@/server/licenses";

export const dynamic = "force-dynamic";

/**
 * 005 iteración 2 — inventario de licencias (total vs. disponibles) por
 * software, para el widget del home. A propósito NO es una capacidad
 * financiera: es información operativa — visible también para
 * `role: "soporte"` (pedido explícito en vivo del dueño). Desde 2026-11-04
 * pide `licencias.ver` (antes `academico.ver`): es el mismo dato que la
 * pantalla de Licencias y Administración no lo ve.
 */
export const GET = requireCapability(
  "licencias.ver",
  async (session) => {
  const inventory = await listLicenseInventory(session.organizationId);
  return Response.json({ inventory });
});
