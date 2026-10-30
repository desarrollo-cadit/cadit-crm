import { apiError, parseBody, requireCapability } from "@/lib/api";
import { equipoNuevoSchema } from "@/lib/license-team";
import { crearEquipo, listarEquipos } from "@/server/license-teams";

export const dynamic = "force-dynamic";

/**
 * 0089 — Los equipos de licencias (Uruguay ATC, Paraguay ATC…) con su cupo por
 * programa, lo ocupado y lo libre. `academico.ver`: es lo mismo que ya muestra
 * `/api/licenses`, y los selectores de «Equipo» de cada asignación lo leen.
 */
export const GET = requireCapability("academico.ver", async (session) => {
  return Response.json({ teams: await listarEquipos(session.organizationId) });
});

/** Alta de un equipo. `academico.editar`: el catálogo de licencias es académico. */
export const POST = requireCapability("academico.editar", async (session, req: Request) => {
  const body = await parseBody(req, equipoNuevoSchema);
  if (!body.ok) return body.response;
  const result = await crearEquipo(session.organizationId, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ team: result.data }, { status: 201 });
});
