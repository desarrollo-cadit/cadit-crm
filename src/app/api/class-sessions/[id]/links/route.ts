import { eq } from "drizzle-orm";
import { z } from "zod";
import { httpUrl } from "@/lib/url-schema";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { releaseForManualLink } from "@/server/zoom/assignment";

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
 * `asistencia.editar` y no un rol: es la capacidad de quien opera una clase.
 * Desde 2026-10-26 cargar grabaciones es solo de Coordinación; el portal del
 * profesor las muestra en solo lectura y no tiene ruta de escritura.
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

    const updated = await getDb()
      .update(schema.classSession)
      // Spread condicional y no un `Record<string, unknown>`: ese tipo le
      // saca a Drizzle la verificación de nombres de columna, y una letra de
      // menos compila, corre y no escribe nada.
      .set({
        updatedAt: new Date(),
        ...(body.data.meetingUrl !== undefined
          ? { meetingUrl: body.data.meetingUrl }
          : {}),
        // 030 (DV-007) — Lo que se escribe acá lo pegó una persona.
        ...(body.data.recordingUrl !== undefined
          ? {
              recordingUrl: body.data.recordingUrl,
              recordingSource: body.data.recordingUrl ? ("manual" as const) : null,
            }
          : {}),
      })
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

    /**
     * 030 (R6) — Si la clase tenía una grabación de Zoom adjudicada, una
     * persona acaba de decidir otra cosa: esa grabación pasa a
     * `manual/sin_clase` y la sincronización no la vuelve a poner. Misma
     * transacción que la escritura del enlace.
     */
    if (body.data.recordingUrl !== undefined) {
      await releaseForManualLink(session.organizationId, id, session.userId);
    }

    return Response.json({
      classSession: {
        id: row.id,
        meetingUrl: row.meetingUrl,
        recordingUrl: row.recordingUrl,
      },
    });
  }
);
