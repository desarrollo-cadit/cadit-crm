import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { availableLicenses } from "@/server/licenses";
import { findScheduleConflicts, type ScheduleConflict } from "@/server/teachers";

/** 004 — Alta de un curso del catálogo (p. ej. "Revit"). */
export async function createCourse(
  organizationId: string,
  input: { name: string; description?: string | null }
) {
  const db = getDb();
  const id = newId("course");
  await db.insert(schema.course).values({
    id,
    organizationId,
    name: input.name,
    description: input.description ?? null,
  });
  return id;
}

/** 005 (T011) — Listado del catálogo de cursos de la organización. */
export async function listCourses(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId))
    .orderBy(asc(schema.course.name));
}

/**
 * Edición de nombre/descripción de un curso ya existente — faltaba una vía
 * para corregir un curso sin recrearlo (feedback en vivo del dueño del
 * producto: "no veo dónde configurar los cursos").
 */
export async function updateCourse(
  organizationId: string,
  courseId: string,
  input: { name?: string; description?: string | null }
): Promise<{ id: string; name: string; description: string | null } | null> {
  const db = getDb();
  const rows = await db
    .update(schema.course)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .returning({
      id: schema.course.id,
      name: schema.course.name,
      description: schema.course.description,
    });
  return rows[0] ?? null;
}

export type CohortInput = {
  courseId: string;
  /** 005 iteración 2 — nombre propio de la camada; null/omitido = usar course.name. */
  name?: string | null;
  startDate: Date;
  endDate?: Date | null;
  /** 005 (DV-005) — reemplaza el `professor` texto libre de 004. */
  teacherId?: string | null;
  /** 005 — moneda entera (DV-008). */
  cost?: number | null;
  frequency?: string | null;
  /** 005 iteración 2 — horario "HH:MM" para el calendario. */
  startTime?: string | null;
  endTime?: string | null;
  /**
   * 005 iteración 4 — CSV de índices de día 0=lunes..6=domingo (ej. "0,2"
   * para lunes y miércoles); null = sin días específicos, se muestra en
   * cada día de [startDate, endDate] (comportamiento anterior).
   */
  daysOfWeek?: string | null;
  classroom?: string | null;
  syllabusUrl?: string | null;
  capacity?: number | null;
  whatsappGroupLink?: string | null;
  /** 005 (DV-004) — software(s) que declara usar la camada. */
  softwareIds?: string[];
};

/** 005 (T029, FR-006) — camada cuyo cupo supera las licencias disponibles de un software. */
export type LicenseWarning = {
  softwareId: string;
  softwareName: string;
  capacity: number;
  available: number;
};

/**
 * Advertencias (no bloqueantes) de licencias: para cada software declarado,
 * si el cupo planificado supera lo disponible. Sin capacidad o sin software
 * declarado, no hay nada que advertir (edge case de spec.md).
 */
async function computeLicenseWarnings(
  organizationId: string,
  softwareIds: string[],
  capacity: number | null | undefined
): Promise<LicenseWarning[]> {
  if (!capacity || softwareIds.length === 0) return [];
  const warnings: LicenseWarning[] = [];
  for (const softwareId of softwareIds) {
    const availability = await availableLicenses(organizationId, softwareId);
    if (!availability) continue;
    if (capacity > availability.available) {
      warnings.push({
        softwareId,
        softwareName: availability.softwareName,
        capacity,
        available: availability.available,
      });
    }
  }
  return warnings;
}

export type CreateCohortResult =
  | {
      ok: true;
      id: string;
      /** 005 (T029, FR-006) — no bloqueante. */
      licenseWarnings: LicenseWarning[];
      /** 005 (T034, FR-008) — no bloqueante. */
      scheduleWarnings: ScheduleConflict[];
    }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * Confirma que `courseId`/`teacherId`/`softwareIds` referenciados desde el
 * body pertenecen a `organizationId` — sin esto, un usuario de una org podía
 * enganchar en su camada un profesor/software/curso de OTRA organización con
 * solo adivinar/probar su id (hallazgo del reviewer de pre-commit: la misma
 * disciplina de `scoped()` que protege el id primario tiene que aplicarse a
 * las FK secundarias que llegan del cliente, no solo a la entidad principal).
 */
async function validateCohortForeignKeys(
  db: ReturnType<typeof getDb>,
  organizationId: string,
  input: { courseId?: string; teacherId?: string | null; softwareIds?: string[] }
): Promise<string | null> {
  if (input.courseId !== undefined) {
    const rows = await db
      .select({ id: schema.course.id })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, input.courseId)))
      .limit(1);
    if (!rows[0]) return "Curso inexistente";
  }
  if (input.teacherId) {
    const rows = await db
      .select({ id: schema.teacher.id })
      .from(schema.teacher)
      .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, input.teacherId)))
      .limit(1);
    if (!rows[0]) return "Profesor inexistente";
  }
  if (input.softwareIds && input.softwareIds.length > 0) {
    const rows = await db
      .select({ id: schema.software.id })
      .from(schema.software)
      .where(
        scoped(
          schema.software.organizationId,
          organizationId,
          inArray(schema.software.id, input.softwareIds)
        )
      );
    if (rows.length !== new Set(input.softwareIds).size) return "Software inexistente";
  }
  return null;
}

/** 004/005 — Alta de una camada (edición concreta de un curso). */
export async function createCohort(
  organizationId: string,
  input: CohortInput
): Promise<CreateCohortResult> {
  const db = getDb();

  const fkError = await validateCohortForeignKeys(db, organizationId, input);
  if (fkError) return { ok: false, status: 422, code: "invalid_body", message: fkError };

  const id = newId("cohort");
  await db.insert(schema.cohort).values({
    id,
    organizationId,
    courseId: input.courseId,
    name: input.name ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    teacherId: input.teacherId ?? null,
    cost: input.cost ?? null,
    frequency: input.frequency ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    daysOfWeek: input.daysOfWeek ?? null,
    classroom: input.classroom ?? null,
    syllabusUrl: input.syllabusUrl ?? null,
    capacity: input.capacity ?? null,
    whatsappGroupLink: input.whatsappGroupLink ?? null,
  });
  if (input.softwareIds && input.softwareIds.length > 0) {
    await db.insert(schema.cohortSoftware).values(
      input.softwareIds.map((softwareId) => ({ cohortId: id, softwareId }))
    );
  }

  const licenseWarnings = await computeLicenseWarnings(
    organizationId,
    input.softwareIds ?? [],
    input.capacity
  );
  const scheduleWarnings = input.teacherId
    ? await findScheduleConflicts(
        organizationId,
        input.teacherId,
        input.startDate,
        input.endDate ?? null,
        id
      )
    : [];

  return { ok: true, id, licenseWarnings, scheduleWarnings };
}

export type UpdateCohortResult =
  | {
      ok: true;
      cohort: typeof schema.cohort.$inferSelect;
      /** 005 (T029, FR-006) — no bloqueante. */
      licenseWarnings: LicenseWarning[];
      /** 005 (T034, FR-008) — no bloqueante. */
      scheduleWarnings: ScheduleConflict[];
    }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/** 005 (T008) — Edición de una camada; solo toca los campos presentes en `input`. */
export async function updateCohort(
  organizationId: string,
  cohortId: string,
  input: Partial<CohortInput>
): Promise<UpdateCohortResult> {
  const db = getDb();

  const fkError = await validateCohortForeignKeys(db, organizationId, input);
  if (fkError) return { ok: false, status: 422, code: "invalid_body", message: fkError };

  const updated = await db
    .update(schema.cohort)
    .set({
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.teacherId !== undefined ? { teacherId: input.teacherId } : {}),
      ...(input.cost !== undefined ? { cost: input.cost } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
      ...(input.classroom !== undefined ? { classroom: input.classroom } : {}),
      ...(input.syllabusUrl !== undefined
        ? { syllabusUrl: input.syllabusUrl }
        : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.whatsappGroupLink !== undefined
        ? { whatsappGroupLink: input.whatsappGroupLink }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, cohortId)
      )
    )
    .returning();
  const cohort = updated[0];
  if (!cohort) return { ok: false, status: 404, code: "not_found", message: "Camada no encontrada" };

  if (input.softwareIds !== undefined) {
    await db
      .delete(schema.cohortSoftware)
      .where(eq(schema.cohortSoftware.cohortId, cohortId));
    if (input.softwareIds.length > 0) {
      await db.insert(schema.cohortSoftware).values(
        input.softwareIds.map((softwareId) => ({ cohortId, softwareId }))
      );
    }
  }

  let licenseWarnings: LicenseWarning[] = [];
  if (cohort.capacity) {
    const finalSoftwareIds =
      input.softwareIds !== undefined
        ? input.softwareIds
        : (await resolveSoftwareByCohort(db, [cohortId])).get(cohortId)?.map((s) => s.id) ?? [];
    licenseWarnings = await computeLicenseWarnings(organizationId, finalSoftwareIds, cohort.capacity);
  }

  const scheduleWarnings = cohort.teacherId
    ? await findScheduleConflicts(
        organizationId,
        cohort.teacherId,
        cohort.startDate,
        cohort.endDate,
        cohortId
      )
    : [];

  return { ok: true, cohort, licenseWarnings, scheduleWarnings };
}

type CohortRow = typeof schema.cohort.$inferSelect;
type CourseRow = typeof schema.course.$inferSelect;
type TeacherRow = typeof schema.teacher.$inferSelect;
type SoftwareRef = { id: string; name: string };

/**
 * 005 iteración 4 (feedback en vivo: "debería ser automático") — el status
 * de la camada ya no se fija a mano: se calcula de `[startDate, endDate]`
 * contra "hoy". `endDate` NULL se trata como "sigue en curso una vez
 * empezada" (mismo criterio que DV-006, choque de horario). La columna
 * `status` sigue existiendo en el schema pero la serialización SIEMPRE
 * devuelve el valor calculado, nunca el guardado.
 */
export function computeCohortStatus(
  startDate: Date,
  endDate: Date | null,
  now: Date = new Date()
): "planificada" | "en_curso" | "finalizada" {
  if (now < startDate) return "planificada";
  if (endDate && now > endDate) return "finalizada";
  return "en_curso";
}

function serializeCohort(
  cohort: CohortRow,
  course: CourseRow,
  teacher: TeacherRow | null,
  software: SoftwareRef[]
) {
  return {
    id: cohort.id,
    courseId: cohort.courseId,
    courseName: course.name,
    name: cohort.name,
    startDate: cohort.startDate.toISOString(),
    endDate: cohort.endDate?.toISOString() ?? null,
    startTime: cohort.startTime,
    endTime: cohort.endTime,
    daysOfWeek: cohort.daysOfWeek,
    teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
    cost: cohort.cost,
    frequency: cohort.frequency,
    classroom: cohort.classroom,
    syllabusUrl: cohort.syllabusUrl,
    capacity: cohort.capacity,
    whatsappGroupLink: cohort.whatsappGroupLink,
    status: computeCohortStatus(cohort.startDate, cohort.endDate),
    software,
  };
}

/** Resuelve el software declarado de un conjunto de camadas en una sola query. */
async function resolveSoftwareByCohort(
  db: ReturnType<typeof getDb>,
  cohortIds: string[]
): Promise<Map<string, SoftwareRef[]>> {
  const map = new Map<string, SoftwareRef[]>();
  if (cohortIds.length === 0) return map;
  const rows = await db
    .select({ cohortId: schema.cohortSoftware.cohortId, software: schema.software })
    .from(schema.cohortSoftware)
    .innerJoin(
      schema.software,
      eq(schema.cohortSoftware.softwareId, schema.software.id)
    )
    .where(inArray(schema.cohortSoftware.cohortId, cohortIds));
  for (const r of rows) {
    const list = map.get(r.cohortId) ?? [];
    list.push({ id: r.software.id, name: r.software.name });
    map.set(r.cohortId, list);
  }
  return map;
}

/** 005 (T008) — Listado de camadas con `teacher`/`software` resueltos. */
export async function listCohorts(
  organizationId: string,
  filters?: { courseId?: string }
) {
  const db = getDb();
  const rows = await db
    .select({ cohort: schema.cohort, course: schema.course, teacher: schema.teacher })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        filters?.courseId ? eq(schema.cohort.courseId, filters.courseId) : undefined
      )
    )
    .orderBy(desc(schema.cohort.startDate));

  const softwareByCohort = await resolveSoftwareByCohort(
    db,
    rows.map((r) => r.cohort.id)
  );

  return rows.map((r) =>
    serializeCohort(r.cohort, r.course, r.teacher, softwareByCohort.get(r.cohort.id) ?? [])
  );
}

/** 005 (T008) — Una camada puntual, con `teacher`/`software` resueltos. */
export async function getCohort(organizationId: string, cohortId: string) {
  const db = getDb();
  const rows = await db
    .select({ cohort: schema.cohort, course: schema.course, teacher: schema.teacher })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, cohortId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const softwareByCohort = await resolveSoftwareByCohort(db, [cohortId]);
  return serializeCohort(
    row.cohort,
    row.course,
    row.teacher,
    softwareByCohort.get(cohortId) ?? []
  );
}
