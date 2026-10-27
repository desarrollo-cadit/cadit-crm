import { parseBody, requireCapability } from "@/lib/api";
import { umbralesSchema } from "@/lib/zoom-attendance-api";
import { ajustesDeAsistencia, guardarUmbrales } from "@/server/zoom/attendance-settings";

export const dynamic = "force-dynamic";

/**
 * Configuración › Zoom › Asistencia sugerida: umbrales y avance de la
 * búsqueda en clases pasadas. Misma capacidad que el resto de la pantalla.
 */
export const GET = requireCapability("configuracion.editar", async (session) => {
  return Response.json(await ajustesDeAsistencia(session.organizationId));
});

export const PUT = requireCapability("configuracion.editar", async (session, req: Request) => {
  const body = await parseBody(req, umbralesSchema);
  if (!body.ok) return body.response;
  return Response.json(await guardarUmbrales(session.organizationId, session.userId, body.data));
});
