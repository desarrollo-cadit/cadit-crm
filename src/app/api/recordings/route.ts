import { parseQuery, requireCapability } from "@/lib/api";
import { listRecordings, recordingsQuerySchema } from "@/server/zoom/recordings";

export const dynamic = "force-dynamic";

/**
 * 030 US1 — Las grabaciones de Zoom de todas las aulas, más recientes primero.
 *
 * `configured: false` (sin conexiones) es lo que hace que la pantalla muestre
 * "Conectá Zoom" en vez de una tabla vacía que parece un error. Sin Zoom, el
 * CRM sigue igual (FR-005).
 */
export const GET = requireCapability("grabaciones.ver", async (session, req: Request) => {
  const q = parseQuery(new URL(req.url), recordingsQuerySchema);
  if (!q.ok) return q.response;
  return Response.json(await listRecordings(session.organizationId, q.data));
});
