import { eq } from "drizzle-orm";
import { z } from "zod";
import { httpUrl } from "@/lib/url-schema";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `null` borra el enlace; ausente lo deja como está. */
const patchSchema = z.object({
  // 025 — `httpUrl` y no `z.string().url()`: los dos terminan en un `<a href>`.
  meetingUrl: httpUrl.nullable().optional(),
  recordingUrl: httpUrl.nullable().optional(),
});

/**
 * 013 (T015, FR-002/FR-005b, DV-001c) — Enlace de reunión y de grabación de
 * UNA clase.
 *
 * `asistencia.editar` y no un rol: DV-001c resolvió que la grabación la cargue
 * tanto coordinación como el profesor, y esa es justamente la capacidad de
 * quien opera una clase. Cuando llegue el portal del profesor (014) va a
 * tenerla para SUS cohortes y esto va a funcionar sin tocarse.
 *
 * Se valida que sea una URL: un enlace roto en la lista de clases es peor que
 * un enlace ausente, porque el alumno lo aprieta y cree que el problema es suyo.
 */
export const PATCH = requireCapability(
  "asistencia.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const cambios: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.meetingUrl !== undefined) cambios.meetingUrl = body.data.meetingUrl;
    if (body.data.recordingUrl !== undefined) {
      cambios.recordingUrl = body.data.recordingUrl;
    }

    const updated = await getDb()
      .update(schema.classSession)
      .set(cambios)
      .where(
        scoped(
          schema.classSession.organizationId,
          session.organizationId,
          eq(schema.classSession.id, id)
        )
      )
      .returning();

    const row = updated[0];
    if (!row) return apiError(404, "not_found", "Clase no encontrada");

    return Response.json({
      classSession: {
        id: row.id,
        meetingUrl: row.meetingUrl,
        recordingUrl: row.recordingUrl,
      },
    });
  }
);
