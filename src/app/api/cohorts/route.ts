import { z } from "zod";
import { apiError, parseBody, parseQuery, withAuth } from "@/lib/api";
import { cohortInputSchema, createCohort, listCohorts } from "@/server/courses";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({ courseId: z.string().min(1).optional() });

/**
 * `withAuth` y no `requireFullAccess`: el DTO incluye `cost`, que es el precio
 * de lista de la cohorte — dato de catálogo, no financiero. FR-016 restringe los
 * montos de inscripción y facturación (ver `/api/enrollments` y
 * `/api/dashboard/finance`), y FR-017 le da a soporte acceso a la vista de
 * cohorte. Decisión del dueño, iteración 006.
 */
export const GET = withAuth(async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), listQuerySchema);
  if (!query.ok) return query.response;

  const rows = await listCohorts(session.organizationId, {
    courseId: query.data.courseId,
  });
  return Response.json({ cohorts: rows });
});

const createSchema = z.object({
  courseId: z.string().min(1),
  startDate: z.coerce.date(),
  ...cohortInputSchema,
});

// 005 (T012, US1) — planificar una cohorte completa (FR-005).
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  // 005 (T029/T034, US4/US5) — licenseWarnings/scheduleWarnings viajan junto
  // a la respuesta: FR-006/FR-008 son advertencias, no bloqueos. La
  // validación de courseId/teacherId/softwareIds contra la organización
  // vive DENTRO de createCohort (no acá) para no repetirla por ruta.
  const result = await createCohort(session.organizationId, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json(
    {
      cohort: { id: result.id },
      licenseWarnings: result.licenseWarnings,
      scheduleWarnings: result.scheduleWarnings,
    },
    { status: 201 }
  );
});
