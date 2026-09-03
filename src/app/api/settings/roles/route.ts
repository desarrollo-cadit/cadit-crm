import { requireCapability } from "@/lib/api";
import { CAPABILITIES } from "@/lib/capabilities";
import { listRoles } from "@/server/roles";

export const dynamic = "force-dynamic";

/**
 * 012 (T020) — Roles de staff y sus capacidades.
 *
 * Devuelve también la lista cerrada de capacidades: la pantalla no puede
 * inventarla ni mantener una copia propia, porque el día que se agregue una
 * capacidad nueva la copia quedaría vieja sin avisar.
 */
export const GET = requireCapability(
  "configuracion.editar",
  async (session) => {
    const roles = await listRoles(session.organizationId, session.role);
    return Response.json({ roles, capabilities: CAPABILITIES });
  }
);
