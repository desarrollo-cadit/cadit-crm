import { apiError } from "@/lib/api";
import { videoPorId } from "@/lib/guia-videos";
import { requireStudentPortal } from "@/lib/portal-api";
import { servirArchivo, tipoPedido } from "@/server/guia-videos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Un tutorial en video de la guía del portal del ALUMNO. Solo los de su audiencia. */
export const GET = requireStudentPortal(async (_ctx, req: Request, routeCtx: Params) => {
  const { id } = await routeCtx.params;
  if (videoPorId(id)?.audiencia !== "alumno") return apiError(404, "not_found", "Video no encontrado");
  const respuesta = await servirArchivo(req, id, tipoPedido(req));
  return respuesta ?? apiError(404, "not_found", "Video no encontrado");
});
