import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { MEDIA_LIMITS, readMediaFile, saveMediaFile } from "@/server/whatsapp/media";

/** 005 (DV-005, FR-007) — Alta de un profesor (entidad propia). */
export async function createTeacher(
  organizationId: string,
  input: { name: string; email?: string | null }
) {
  const db = getDb();
  const id = newId("teacher");
  await db.insert(schema.teacher).values({
    id,
    organizationId,
    name: input.name,
    email: input.email ?? null,
  });
  return id;
}

/** Resuelve los cursos que dicta cada profesor de un conjunto (teacher_course). */
async function resolveCoursesByTeacher(
  db: ReturnType<typeof getDb>,
  teacherIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (teacherIds.length === 0) return map;
  const rows = await db
    .select({ teacherId: schema.teacherCourse.teacherId, courseId: schema.teacherCourse.courseId })
    .from(schema.teacherCourse)
    .where(inArray(schema.teacherCourse.teacherId, teacherIds));
  for (const r of rows) {
    const list = map.get(r.teacherId) ?? [];
    list.push(r.courseId);
    map.set(r.teacherId, list);
  }
  return map;
}

export function serializeTeacher(
  t: typeof schema.teacher.$inferSelect,
  courseIds: string[] = []
) {
  return {
    id: t.id,
    name: t.name,
    hourlyRate: t.hourlyRate,
    email: t.email,
    courseIds,
    hasPhoto: t.photoMimeType !== null,
  };
}

export type SaveTeacherPhotoResult =
  | { ok: true }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/** 005 iteración 5 — foto opcional del profesor; mismo patrón que software (ver ese archivo). */
export async function saveTeacherPhoto(
  organizationId: string,
  teacherId: string,
  file: { mimeType: string; sizeBytes: number; data: Buffer }
): Promise<SaveTeacherPhotoResult> {
  if (!MEDIA_LIMITS.image.mimes.test(file.mimeType) || file.sizeBytes > MEDIA_LIMITS.image.maxBytes) {
    return { ok: false, status: 422, code: "invalid_body", message: `Se espera ${MEDIA_LIMITS.image.label}` };
  }
  const db = getDb();
  const rows = await db
    .select({ id: schema.teacher.id })
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)))
    .limit(1);
  if (!rows[0]) return { ok: false, status: 404, code: "not_found", message: "Profesor no encontrado" };

  await saveMediaFile(organizationId, `tch-photo-${teacherId}`, file.data);
  await db
    .update(schema.teacher)
    .set({ photoMimeType: file.mimeType, updatedAt: new Date() })
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)));
  return { ok: true };
}

export async function getTeacherPhoto(
  organizationId: string,
  teacherId: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  const db = getDb();
  const rows = await db
    .select({ photoMimeType: schema.teacher.photoMimeType })
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)))
    .limit(1);
  const mimeType = rows[0]?.photoMimeType;
  if (!mimeType) return null;
  const data = await readMediaFile(organizationId, `tch-photo-${teacherId}`);
  return { data, mimeType };
}

/** 005 — Listado de profesores de la organización, por nombre, con cursos/costo resueltos. */
export async function listTeachers(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId))
    .orderBy(asc(schema.teacher.name));
  const courseMap = await resolveCoursesByTeacher(db, rows.map((r) => r.id));
  return rows.map((r) => serializeTeacher(r, courseMap.get(r.id) ?? []));
}

/** 005 iteración 2 — un profesor puntual, con cursos/costo resueltos. */
export async function getTeacher(organizationId: string, teacherId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.teacher)
    .where(
      scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId))
    )
    .limit(1);
  const teacher = rows[0];
  if (!teacher) return null;
  const courseMap = await resolveCoursesByTeacher(db, [teacherId]);
  return serializeTeacher(teacher, courseMap.get(teacherId) ?? []);
}

export type UpdateTeacherInput = {
  name?: string;
  hourlyRate?: number | null;
  email?: string | null;
  /** Reemplaza por completo el conjunto de cursos que dicta (teacher_course). */
  courseIds?: string[];
};

/**
 * 005 iteración 2 (FR nuevo, pedido en vivo) — edita nombre/costo por hora y
 * reemplaza qué cursos dicta un profesor. Mismo patrón que
 * `updateCohort`/`updateSoftware`: solo toca los campos presentes.
 */
export type UpdateTeacherResult =
  | { ok: true; teacher: ReturnType<typeof serializeTeacher> }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

export async function updateTeacher(
  organizationId: string,
  teacherId: string,
  input: UpdateTeacherInput
): Promise<UpdateTeacherResult> {
  const db = getDb();

  // Los cursos que se le asignan a un profesor tienen que ser de la MISMA
  // organización (hallazgo del reviewer de pre-commit: sin este chequeo, se
  // podía enganchar un curso de otra org solo adivinando su id).
  if (input.courseIds && input.courseIds.length > 0) {
    const rows = await db
      .select({ id: schema.course.id })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, organizationId, inArray(schema.course.id, input.courseIds)));
    if (rows.length !== new Set(input.courseIds).size) {
      return { ok: false, status: 422, code: "invalid_body", message: "Curso inexistente" };
    }
  }

  const updated = await db
    .update(schema.teacher)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.hourlyRate !== undefined ? { hourlyRate: input.hourlyRate } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      updatedAt: new Date(),
    })
    .where(
      scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId))
    )
    .returning();
  const teacher = updated[0];
  if (!teacher) return { ok: false, status: 404, code: "not_found", message: "Profesor no encontrado" };

  if (input.courseIds !== undefined) {
    await db.delete(schema.teacherCourse).where(eq(schema.teacherCourse.teacherId, teacherId));
    if (input.courseIds.length > 0) {
      await db.insert(schema.teacherCourse).values(
        input.courseIds.map((courseId) => ({ teacherId, courseId }))
      );
    }
  }

  const courseIds =
    input.courseIds !== undefined
      ? input.courseIds
      : (await resolveCoursesByTeacher(db, [teacherId])).get(teacherId) ?? [];
  return { ok: true, teacher: serializeTeacher(teacher, courseIds) };
}

/** 005 (T033, DV-006) — cohorte en conflicto de horario con otra del mismo profesor. */
export type ScheduleConflict = {
  cohortId: string;
  courseId: string;
  courseName: string;
  startDate: string;
  endDate: string | null;
};

/**
 * "Infinito" para tratar `endDate === null` como "sigue en curso" al
 * comparar rangos (DV-006), sin usar Infinity (no comparable con Date).
 */
const FAR_FUTURE = new Date(8640000000000000);

function rangesOverlap(
  aStart: Date,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date | null
): boolean {
  const aEndOrOngoing = aEnd ?? FAR_FUTURE;
  const bEndOrOngoing = bEnd ?? FAR_FUTURE;
  return aStart <= bEndOrOngoing && aEndOrOngoing >= bStart;
}

/**
 * 005 (T033, DV-006, FR-008) — cohortes del mismo profesor cuyo rango de
 * fechas se superpone con [startDate, endDate]. No bloquea nada — solo
 * informa; `excludeCohortId` evita que una cohorte se compare consigo misma
 * (alta nueva ya insertada, o edición de una existente).
 */
export async function findScheduleConflicts(
  organizationId: string,
  teacherId: string,
  startDate: Date,
  endDate: Date | null,
  excludeCohortId?: string
): Promise<ScheduleConflict[]> {
  const db = getDb();
  const rows = await db
    .select({ cohort: schema.cohort, course: schema.course })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.teacherId, teacherId)
      )
    );

  return rows
    .filter((r) => r.cohort.id !== excludeCohortId)
    .filter((r) => rangesOverlap(r.cohort.startDate, r.cohort.endDate, startDate, endDate))
    .map((r) => ({
      cohortId: r.cohort.id,
      courseId: r.course.id,
      courseName: r.course.name,
      startDate: r.cohort.startDate.toISOString(),
      endDate: r.cohort.endDate?.toISOString() ?? null,
    }));
}
