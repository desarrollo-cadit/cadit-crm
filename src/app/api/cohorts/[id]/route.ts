import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getCohort, updateCohort } from "@/server/courses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const cohort = await getCohort(session.organizationId, id);
  if (!cohort) return apiError(404, "not_found", "Camada no encontrada");
  return Response.json({ cohort });
});

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inválido (HH:MM)")
  .nullable();

const patchSchema = z.object({
  courseId: z.string().min(1).optional(),
  name: z.string().trim().max(200).nullable().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  teacherId: z.string().min(1).nullable().optional(),
  cost: z.number().int().nullable().optional(),
  frequency: z.string().max(200).nullable().optional(),
  startTime: timeHHMM.optional(),
  endTime: timeHHMM.optional(),
  classroom: z.string().max(120).nullable().optional(),
  syllabusUrl: z.string().max(2000).nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  whatsappGroupLink: z.string().max(2000).nullable().optional(),
  softwareIds: z.array(z.string().min(1)).optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
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
