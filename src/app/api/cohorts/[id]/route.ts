import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  cohortInputSchema,
  deleteCohort,
  getCohort,
  updateCohort,
} from "@/server/courses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const cohort = await getCohort(session.organizationId, id);
  if (!cohort) return apiError(404, "not_found", "Cohorte no encontrada");
  return Response.json({ cohort });
});

const patchSchema = z.object({
  courseId: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  ...cohortInputSchema,
});

export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  // 005 (T029/T034, US4/US5) — licenseWarnings/scheduleWarnings viajan junto
  // a la respuesta: FR-006/FR-008 son advertencias, no bloqueos.
  const result = await updateCohort(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  const cohort = await getCohort(session.organizationId, id);
  return Response.json({
    cohort,
    licenseWarnings: result.licenseWarnings,
    scheduleWarnings: result.scheduleWarnings,
  });
});

/**
 * 023 — Borra una camada creada por error.
 *
 * No existía DELETE, y por eso una camada mal creada quedaba para siempre
 * ensuciando el calendario y los selectores. No es un olvido menor: con 41
 * camadas reales, dos de prueba se confunden con las de verdad.
 *
 * **La decisión de si se puede vive en `deleteCohort`**, no acá. Con
 * inscripciones, clases, asistencia, evaluaciones o pagos responde 409 y dice
 * QUÉ la ata — no un "no se puede" a secas. La ruta solo elige el código.
 */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await deleteCohort(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ ok: true, motivo: result.motivo });
  }
);
