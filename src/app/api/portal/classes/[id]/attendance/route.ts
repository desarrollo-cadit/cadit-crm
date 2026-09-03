import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { teacherAttendanceSheet, teacherMarkAttendance } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 014 (T026) — La planilla de UNA clase, con lo ya marcado. */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await teacherAttendanceSheet(ctx.organizationId, ctx.teacherId, id);
    if (!data) return apiError(404, "not_found", "Clase no encontrada");
    return Response.json(data);
  }
);

const markSchema = z.object({
  entries: z
    .array(
      z.object({
        enrollmentId: z.string().min(1),
        status: z.enum(["presente", "tarde", "ausente", "justificado"]),
      })
    )
    .min(1),
});

/**
 * 014 (T026/T027, DV-001) — El profesor marca, y puede CORREGIR una clase
 * pasada: el sistema no discute con lo que pasó en el aula. Queda registrado
 * quién dejó la marca así (`recorded_by`) y cuándo (`updated_at`).
 *
 * `PUT` y no `POST` porque volver a marcar corrige la marca anterior en vez de
 * agregar otra — el índice único por clase e inscripción lo garantiza.
 */
export const PUT = requireTeacherPortal(
  async (ctx, req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const body = await parseBody(req, markSchema);
    if (!body.ok) return body.response;

    const r = await teacherMarkAttendance(
      ctx.organizationId,
      ctx.teacherId,
      ctx.userId,
      id,
      body.data.entries
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
