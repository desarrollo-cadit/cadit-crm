import { z } from "zod";
import { httpUrl } from "@/lib/url-schema";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherSetRecording } from "@/server/teacher-portal";
import { releaseForManualLink } from "@/server/zoom/assignment";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `null` borra el enlace; el campo es obligatorio para no borrar por olvido. */
const bodySchema = z.object({
  recordingUrl: httpUrl.nullable(),
});

/**
 * 023 — El profesor carga la grabación de SU clase.
 *
 * Resuelve DV-001c de la 013, que había quedado abierta. El que acaba de dar
 * la clase tiene el enlace a mano; el que hoy está autorizado a pegarlo, no.
 * Eso convertía cada grabación en un pedido por WhatsApp.
 *
 * `PUT` y no `POST` porque volver a cargar CORRIGE el enlace anterior en vez
 * de agregar otro — mismo criterio que la asistencia (014).
 *
 * **404 y no 403** cuando la clase no es suya: un 403 confirmaría que existe.
 */
export const PUT = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const r = await teacherSetRecording(
      ctx.organizationId,
      ctx.teacherId,
      id,
      body.data.recordingUrl
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    // 030 (R6) — El profesor decidió otra cosa: la grabación de Zoom que tenía
    // esta clase pasa a manual/sin_clase. No se le devuelve ningún dato nuevo.
    await releaseForManualLink(ctx.organizationId, id, null);
    return Response.json(r.data);
  }
);
