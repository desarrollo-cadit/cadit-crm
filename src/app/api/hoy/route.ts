import { requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { tareasDelDia } from "@/server/tareas-del-dia";

export const dynamic = "force-dynamic";

/**
 * 2026-10-26 — La bandeja "Hoy" del inicio: lo que ESTA persona tiene que
 * resolver hoy, con el enlace a donde se resuelve.
 *
 * `academico.ver` es la puerta (la misma que el resumen del inicio, y la
 * tienen todos los roles del equipo); lo que se ve adentro lo decide cada
 * regla con SU capacidad (`reglasPermitidas`): una regla que la sesión no
 * puede ver ni se consulta. Sin montos: Facturación dice cuántas ventas
 * faltan, no por cuánto.
 */
export const GET = requireCapability("academico.ver", async (session) => {
  const grupos = await tareasDelDia(session.organizationId, sessionCapabilities(session));
  return Response.json({ grupos });
});
