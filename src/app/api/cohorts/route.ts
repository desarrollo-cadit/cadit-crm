import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { createCohort, listCohorts } from "@/server/courses";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({ courseId: z.string().min(1).optional() });

// 005 (US1) — listado con teacher/software resueltos (listCohorts, T008);
// necesario para la pantalla de gestión académica (T014). No estaba en el
// enunciado literal de T012 (que solo mencionaba POST), pero listCohorts ya
// se construyó exactamente para esto — ver reporte final de la fase.
export const GET = withAuth(async (session, req: Request) => {
  const parsedQuery = listQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsedQuery.success) {
    return apiError(422, "invalid_query", "courseId inválido");
  }
  const rows = await listCohorts(session.organizationId, {
    courseId: parsedQuery.data.courseId,
  });
  return Response.json({ cohorts: rows });
});

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inválido (HH:MM)")
  .nullable();

const createSchema = z.object({
  courseId: z.string().min(1),
  name: z.string().trim().max(200).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  teacherId: z.string().min(1).nullable().optional(),
  cost: z.number().int().nullable().optional(),
  frequency: z.string().max(200).nullable().optional(),
  startTime: timeHHMM.optional(),
  endTime: timeHHMM.optional(),
  // 005 iteración 4 — CSV "0,2" (lunes=0..domingo=6); vacío/null = sin días específicos.
  daysOfWeek: z
    .string()
    .regex(/^[0-6](,[0-6])*$/, "CSV de índices de día 0-6")
    .nullable()
    .optional(),
  classroom: z.string().max(120).nullable().optional(),
  syllabusUrl: z.string().max(2000).nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  whatsappGroupLink: z.string().max(2000).nullable().optional(),
  softwareIds: z.array(z.string().min(1)).optional(),
});

// 005 (T012, US1) — planificar una camada completa (FR-005).
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
