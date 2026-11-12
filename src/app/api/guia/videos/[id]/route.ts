import { apiError } from "@/lib/api";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { videoPorId } from "@/lib/guia-videos";
import { servirArchivo, tipoPedido } from "@/server/guia-videos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Un tutorial en video de la guía del STAFF.
 *
 * **No usa `requireCapability`, y es a propósito**: la guía no exige permiso
 * (un manual que hay que tener permiso para leer no es un manual), pero cada
 * video enseña capacidades distintas. Lo que se exige es una sesión del equipo
 * Y tener TODAS las capacidades que el video enseña — la misma regla con la que
 * la guía decide qué mostrar. Quien no las tiene recibe 404, igual que si el
 * video no existiera. Es el mismo caso que `mcp/route.ts` (la capacidad la
 * decide el recurso, no la ruta) y queda declarado en `SIN_CAPACIDAD`.
 *
 * Los videos del portal tienen sus propias rutas (`/api/portal/guia/…`): cada
 * audiencia entra por su puerta.
 */
export async function GET(req: Request, routeCtx: Params): Promise<Response> {
  const session = await getSessionOrNull();
  if (!session) return apiError(401, "unauthorized", "Tu sesión expiró. Volvé a iniciar sesión.");

  const { id } = await routeCtx.params;
  const video = videoPorId(id);
  const caps = sessionCapabilities(session);
  if (!video || video.audiencia !== "staff" || !video.requiere.every((c) => caps.includes(c))) {
    return apiError(404, "not_found", "Video no encontrado");
  }

  const respuesta = await servirArchivo(req, id, tipoPedido(req));
  return respuesta ?? apiError(404, "not_found", "Video no encontrado");
}
