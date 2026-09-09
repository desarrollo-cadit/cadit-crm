import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getTeacher, updateTeacher } from "@/server/teachers";
import { deleteTeacher, reassignCohorts } from "@/server/contacts-admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const teacher = await getTeacher(session.organizationId, id);
  if (!teacher) return apiError(404, "not_found", "Profesor no encontrado");
  return Response.json({ teacher });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  hourlyRate: z.number().int().min(0).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  // 023 — Texto libre: los títulos varían por país y por carrera, y una
  // lista cerrada siempre le queda corta a alguien.
  title: z.string().trim().max(80).nullable().optional(),
  courseIds: z.array(z.string().min(1)).optional(),
});

/**
 * 005 iteración 2 — edita nombre/costo por hora y qué cursos dicta un
 * profesor (pestaña "Profesores" de /academico, feedback en vivo del dueño).
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const result = await updateTeacher(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ teacher: result.teacher });
});

/**
 * 014 (T007, DV-008) — Baja de un profesor.
 *
 * **Exige que no le queden cohortes.** `cohort.teacher_id` es `SET NULL`, así
 * que borrarlo no destruiría datos — pero dejaría las cohortes sin docente, y
 * con el profesor que tiene más carga serían 18 de un click. El error no se
 * nota hasta que alguien abre una cohorte y no entiende por qué no tiene
 * profesor.
 *
 * El 409 dice CUÁNTAS son, para que reasignarlas sea un paso y no una
 * búsqueda.
 */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await deleteTeacher(session.organizationId, id);
    if (!result.ok) {
      return Response.json(
        {
          error: { code: result.code, message: result.message },
          cohorts: result.cohorts ?? 0,
        },
        { status: result.status }
      );
    }
    return Response.json({ ok: true });
  }
);

const reassignSchema = z.object({ toTeacherId: z.string().min(1) });

/**
 * Reasigna TODAS las cohortes de este profesor a otro. Es el camino que
 * habilita la baja, y por eso vive al lado.
 */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, reassignSchema);
    if (!body.ok) return body.response;

    const result = await reassignCohorts(session.organizationId, id, body.data.toTeacherId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ ok: true });
  }
);
