import { apiError, parseBody, requireCapability } from "@/lib/api";
import { accionSobreCasoSchema } from "@/lib/autodesk-import/body";
import { aplicarAccion } from "@/server/autodesk-import";

export const dynamic = "force-dynamic";

/**
 * 0089 — Una acción sobre un caso de la conciliación (asignar, desmarcar, mover,
 * dejar pendiente en Autodesk, mantener, omitir, vincular un correo). El
 * servidor vuelve a calcular el caso y valida que la acción le corresponda;
 * después usa las mismas funciones de licencias de siempre (candado de stock,
 * reglas del grupo). Si una devuelve error, no se escribe nada de esa acción.
 * `licencias.gestionar`.
 */
export const POST = requireCapability("licencias.gestionar", async (session, req: Request) => {
  const body = await parseBody(req, accionSobreCasoSchema);
  if (!body.ok) return body.response;
  const r = await aplicarAccion(session.organizationId, session.userId, body.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ ok: true });
});
