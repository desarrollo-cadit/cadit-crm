import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { reabrirEntrega } from "@/server/submissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 016 (US5, FR-013, DV-003) — El profesor REABRE la entrega.
 *
 * Es una ruta propia y no un campo más de la corrección porque es un acto
 * distinto: corregir cierra, reabrir habilita. Y es lo ÚNICO que habilita al
 * alumno a volver a entregar — la reentrega no tiene tope, el permiso es un
 * estado de la entrega y no un contador de intentos.
 *
 * No borra nada: la corrección y la devolución quedan, y la reentrega va a ser
 * una fila nueva (FR-008).
 */
export const POST = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const r = await reabrirEntrega(
      ctx.organizationId,
      ctx.teacherId,
      ctx.userId,
      id
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
