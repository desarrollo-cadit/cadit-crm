import { requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { assignableRoles } from "@/server/team";

export const dynamic = "force-dynamic";

/**
 * Crear-roles — Los roles para el selector de Equipo.
 *
 * Existe aparte de `GET /api/settings/roles` a propósito: aquella pide
 * `configuracion.editar` y devuelve la matriz completa de capacidades. Quien
 * gestiona accesos solo necesita los nombres y saber cuáles puede dar, así que
 * esta ruta responde eso y nada más (menor privilegio): abrir la otra con
 * cualquiera de las dos capacidades le mostraría la matriz a quien no la
 * configura.
 */
export const GET = requireCapability("accesos.gestionar", async (session) => {
  const roles = await assignableRoles(session.organizationId, sessionCapabilities(session));
  return Response.json({ roles });
});
