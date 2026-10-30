import { z } from "zod";
import { apiError, parseBody, parseQuery, requireCapability } from "@/lib/api";
import {
  cohortInputSchema,
  createCohort,
  createModuloConCursoPropio,
  listCohorts,
} from "@/server/courses";
import { resolverCursoDelAlta } from "@/lib/course-kind";
import { diaSchema } from "@/lib/clonar-grupo";
import { crearGrupoBasadoEn } from "@/server/clonar-grupo";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({ courseId: z.string().min(1).optional() });

/**
 * `academico.ver` y no una capacidad financiera: el DTO incluye `cost`, que es el precio
 * de lista de la cohorte — dato de catálogo, no financiero. FR-016 restringe los
 * montos de inscripción y facturación (ver `/api/enrollments` y
 * `/api/dashboard/finance`), y FR-017 le da a soporte acceso a la vista de
 * cohorte. Decisión del dueño, iteración 006.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), listQuerySchema);
  if (!query.ok) return query.response;

  const rows = await listCohorts(session.organizationId, {
    courseId: query.data.courseId,
  });
  return Response.json({ cohorts: rows });
});

const createSchema = z.object({
  /**
   * 032 (FR-005) — `courseId` (curso existente) o `newModuleName` (módulo
   * nuevo, sólo con `parentCohortId`). Que venga exactamente uno lo decide
   * `resolverCursoDelAlta`, pura y con tests; acá sólo se valida la forma.
   */
  courseId: z.string().min(1).optional(),
  newModuleName: z.string().max(500).optional(),
  startDate: z.coerce.date(),
  ...cohortInputSchema,
  /**
   * "Basar en un grupo existente" — Copia además el material, las
   * evaluaciones y (en una especialización) los módulos del grupo de origen,
   * con las fechas que eligió la persona para cada módulo. Sin esto, el alta
   * es la de siempre.
   */
  cloneFrom: z
    .object({
      cohortId: z.string().min(1),
      modules: z
        .array(
          z.object({
            sourceCohortId: z.string().min(1),
            name: z.string().trim().max(200).nullable().optional(),
            startDate: diaSchema,
            endDate: diaSchema.nullable(),
          })
        )
        .max(50)
        .optional(),
    })
    .optional(),
});

// 005 (T012, US1) — planificar una cohorte completa (FR-005).
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const { courseId, newModuleName, cloneFrom, ...cohortFields } = body.data;
  const curso = resolverCursoDelAlta({
    courseId,
    newModuleName,
    parentCohortId: cohortFields.parentCohortId,
  });
  if (!curso.ok) return apiError(422, "invalid_body", curso.message);

  if (cloneFrom) {
    if (curso.via !== "existente") {
      return apiError(422, "invalid_body", "Un módulo nuevo no se basa en otro grupo.");
    }
    // Todo en la transacción del pedido: lo inválido responde 422 antes de
    // escribir; lo que falla después lanza y revierte el alta entera.
    const basado = await crearGrupoBasadoEn(
      session.organizationId,
      { ...cohortFields, courseId: curso.courseId },
      { cohortId: cloneFrom.cohortId, modules: cloneFrom.modules ?? [] }
    );
    if (!basado.ok) return apiError(basado.status, basado.code, basado.message);
    return Response.json(
      {
        cohort: { id: basado.id },
        licenseWarnings: basado.licenseWarnings,
        scheduleWarnings: basado.scheduleWarnings,
        autoEnrolled: basado.autoEnrolled,
        moduleIds: basado.moduleIds,
        cloneWarnings: basado.avisos,
      },
      { status: 201 }
    );
  }

  // 005 (T029/T034, US4/US5) — licenseWarnings/scheduleWarnings viajan junto
  // a la respuesta: FR-006/FR-008 son advertencias, no bloqueos. La
  // validación de courseId/teacherId/softwareIds contra la organización
  // vive DENTRO de createCohort (no acá) para no repetirla por ruta.
  const result =
    curso.via === "existente"
      ? await createCohort(session.organizationId, { ...cohortFields, courseId: curso.courseId })
      : // 032 (FR-006) — curso de tipo módulo + cohorte, atómico: valida todo
        // antes de escribir y lanza si algo falla después (revierte el pedido).
        await createModuloConCursoPropio(
          session.organizationId,
          { ...cohortFields, parentCohortId: cohortFields.parentCohortId! },
          curso.nombre
        );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json(
    {
      cohort: { id: result.id },
      licenseWarnings: result.licenseWarnings,
      scheduleWarnings: result.scheduleWarnings,
      // 034 (FR-001) — cuántos alumnos de la especialización entraron solos.
      autoEnrolled: result.autoEnrolled,
    },
    { status: 201 }
  );
});
