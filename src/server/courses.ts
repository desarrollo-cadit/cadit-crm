import { asc, desc, eq, inArray, like, ne } from "drizzle-orm";
import { z } from "zod";
import { httpUrl } from "@/lib/url-schema";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { slugify } from "@/lib/utils";
import { availableLicenses } from "@/server/licenses";
import {
  writeCourseModules,
  type CourseModuleInput,
} from "@/server/course-content";
import { findScheduleConflicts, type ScheduleConflict } from "@/server/teachers";


/**
 * Devuelve un slug libre dentro de la organización, sufijando `-2`, `-3`… si
 * hace falta. El índice único `course_org_slug_uq` sigue siendo la garantía
 * dura (dos altas simultáneas caen en el 409 de `withAuth`); esto solo evita
 * el choque en el caso normal.
 */
async function resolveUniqueCourseSlug(
  db: DbOrTx,
  organizationId: string,
  desired: string,
  excludeCourseId?: string
): Promise<string> {
  const base = slugify(desired);
  const rows = await db
    .select({ slug: schema.course.slug })
    .from(schema.course)
    .where(
      scoped(
        schema.course.organizationId,
        organizationId,
        like(schema.course.slug, `${base}%`),
        excludeCourseId ? ne(schema.course.id, excludeCourseId) : undefined
      )
    );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * 006 — Contenido de la ficha pública del curso. Todo opcional: el sitio
 * comercial arma la landing con lo que haya cargado, y un curso viejo sin
 * completar se sigue sirviendo como antes (solo nombre y descripción).
 */
export type CourseContentInput = {
  description?: string | null;
  /** Si se omite en el alta, se deriva del nombre. */
  slug?: string;
  tagline?: string | null;
  categoryId?: string | null;
  level?: "inicial" | "intermedio" | "avanzado" | null;
  modality?: "en_vivo" | "asincronico" | "presencial" | null;
  durationWeeks?: number | null;
  hoursPerWeek?: number | null;
  imageUrl?: string | null;
  learningObjectives?: string[] | null;
  targetAudience?: string | null;
  syllabusUrl?: string | null;
  /** 007 — si sale o no en el catálogo público. Default `true` en el alta. */
  published?: boolean;
  /** 009/010 — asistencia mínima por defecto de las cohortes de este curso. */
  minAttendancePct?: number | null;
};

/**
 * Confirma que la categoría referenciada pertenece a la organización — misma
 * disciplina que `validateCohortForeignKeys` (una FK que llega del cliente se
 * valida scopeada, no solo la entidad principal).
 */
async function validateCategory(
  db: DbOrTx,
  organizationId: string,
  categoryId: string | null | undefined
): Promise<string | null> {
  if (!categoryId) return null;
  const rows = await db
    .select({ id: schema.courseCategory.id })
    .from(schema.courseCategory)
    .where(
      scoped(
        schema.courseCategory.organizationId,
        organizationId,
        eq(schema.courseCategory.id, categoryId)
      )
    )
    .limit(1);
  return rows[0] ? null : "Categoría inexistente";
}

/**
 * Validación de los campos de contenido, compartida por el POST y el PATCH de
 * `/api/courses` — vive junto al tipo que valida para que agregar un campo a
 * `CourseContentInput` sin validarlo salte a la vista.
 */
export const courseContentSchema = {
  description: z.string().max(8000).nullable().optional(),
  slug: z.string().trim().min(1).max(140).optional(),
  tagline: z.string().max(300).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  level: z.enum(["inicial", "intermedio", "avanzado"]).nullable().optional(),
  modality: z.enum(["en_vivo", "asincronico", "presencial"]).nullable().optional(),
  durationWeeks: z.number().int().min(1).max(520).nullable().optional(),
  hoursPerWeek: z.number().int().min(1).max(168).nullable().optional(),
  imageUrl: httpUrl.nullable().optional(),
  learningObjectives: z.array(z.string().trim().min(1).max(300)).max(30).nullable().optional(),
  targetAudience: z.string().max(4000).nullable().optional(),
  syllabusUrl: httpUrl.nullable().optional(),
  published: z.boolean().optional(),
  minAttendancePct: z.number().int().min(0).max(100).nullable().optional(),
};

export type CreateCourseResult =
  | { ok: true; id: string; course: typeof schema.course.$inferSelect }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * 004 — Alta de un curso del catálogo (p. ej. "Revit"). Valida `categoryId`
 * scopeado igual que `updateCourse`: sin esto un curso puede quedar apuntando a
 * una categoría de OTRA organización, y el catálogo público —que resuelve la
 * categoría por join— termina mostrando su nombre.
 */
export async function createCourse(
  organizationId: string,
  input: { name: string } & CourseContentInput,
  /** Transacción del llamador, para crear curso y temario de una sola vez. */
  tx?: DbOrTx
): Promise<CreateCourseResult> {
  const db = tx ?? getDb();

  const categoryError = await validateCategory(db, organizationId, input.categoryId);
  if (categoryError) {
    return { ok: false, status: 422, code: "invalid_body", message: categoryError };
  }

  const id = newId("course");
  const slug = await resolveUniqueCourseSlug(
    db,
    organizationId,
    input.slug?.trim() || input.name
  );
  // `returning()` y no un select posterior: la respuesta tiene que llevar la
  // fila persistida (sobre todo el `slug` ya resuelto, que puede venir sufijado
  // o derivado del nombre y no coincidir con lo que mandó el cliente).
  const inserted = await db
    .insert(schema.course)
    .values({
      id,
      organizationId,
      name: input.name,
      description: input.description ?? null,
      slug,
      tagline: input.tagline ?? null,
      categoryId: input.categoryId ?? null,
      level: input.level ?? null,
      modality: input.modality ?? null,
      durationWeeks: input.durationWeeks ?? null,
      hoursPerWeek: input.hoursPerWeek ?? null,
      imageUrl: input.imageUrl ?? null,
      learningObjectives: input.learningObjectives ?? null,
      targetAudience: input.targetAudience ?? null,
      syllabusUrl: input.syllabusUrl ?? null,
      // 007 — un curso nuevo se publica salvo que se diga lo contrario:
      // el caso normal es el curso del catálogo.
      published: input.published ?? true,
      minAttendancePct: input.minAttendancePct ?? null,
    })
    .returning();
  // `insert().returning()` de una fila: o devuelve la fila o lanza.
  return { ok: true, id, course: inserted[0]! };
}

export async function getCourse(organizationId: string, courseId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .limit(1);
  return rows[0] ?? null;
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

export type UpdateCourseResult =
  | { ok: true; course: typeof schema.course.$inferSelect }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * Edición de un curso ya existente — faltaba una vía para corregir un curso
 * sin recrearlo (feedback en vivo del dueño del producto: "no veo dónde
 * configurar los cursos"). 006 la extiende a todo el contenido de la ficha
 * pública. Solo toca los campos presentes en `input`.
 *
 * El `slug` se re-resuelve solo si viene explícito: renombrar un curso NO
 * cambia su URL pública, porque romper links ya publicados por el sitio
 * comercial sería peor que quedar con un slug desactualizado.
 */
export async function updateCourse(
  organizationId: string,
  courseId: string,
  input: { name?: string } & CourseContentInput,
  /** Transacción del llamador, para guardar curso y temario de una sola vez. */
  tx?: DbOrTx
): Promise<UpdateCourseResult> {
  const db = tx ?? getDb();

  const categoryError = await validateCategory(db, organizationId, input.categoryId);
  if (categoryError) {
    return { ok: false, status: 422, code: "invalid_body", message: categoryError };
  }

  const slug =
    input.slug !== undefined
      ? await resolveUniqueCourseSlug(db, organizationId, input.slug, courseId)
      : undefined;

  const rows = await db
    .update(schema.course)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.modality !== undefined ? { modality: input.modality } : {}),
      ...(input.durationWeeks !== undefined ? { durationWeeks: input.durationWeeks } : {}),
      ...(input.hoursPerWeek !== undefined ? { hoursPerWeek: input.hoursPerWeek } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.learningObjectives !== undefined
        ? { learningObjectives: input.learningObjectives }
        : {}),
      ...(input.targetAudience !== undefined ? { targetAudience: input.targetAudience } : {}),
      ...(input.syllabusUrl !== undefined ? { syllabusUrl: input.syllabusUrl } : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
      ...(input.minAttendancePct !== undefined ? { minAttendancePct: input.minAttendancePct } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .returning();
  const course = rows[0];
  if (!course) {
    return { ok: false, status: 404, code: "not_found", message: "Curso no encontrado" };
  }
  return { ok: true, course };
}

/**
 * 006 — Curso + temario en UNA transacción, para que no quede un curso creado
 * con el temario a medio escribir. La orquestación vive acá y no en la ruta
 * para poder testearla sin levantar la API.
 *
 * Usa `writeCourseModules` (sin verificar que el curso exista) en vez de
 * `replaceCourseModules`: el curso se acaba de crear/actualizar scopeado en
 * esta misma transacción, así que su existencia ya está probada. Un error real
 * de base lanza, y ahí sí la transacción revierte entera.
 *
 * `modules === undefined` deja el temario existente intacto; `[]` lo borra.
 */
export async function createCourseWithModules(
  organizationId: string,
  input: { name: string } & CourseContentInput,
  modules?: CourseModuleInput[]
): Promise<CreateCourseResult> {
  return getDb().transaction(async (tx) => {
    const created = await createCourse(organizationId, input, tx);
    if (!created.ok) return created;
    if (modules !== undefined) {
      await writeCourseModules(organizationId, created.id, modules, tx);
    }
    return created;
  });
}

export async function updateCourseWithModules(
  organizationId: string,
  courseId: string,
  input: { name?: string } & CourseContentInput,
  modules?: CourseModuleInput[]
): Promise<UpdateCourseResult> {
  return getDb().transaction(async (tx) => {
    const updated = await updateCourse(organizationId, courseId, input, tx);
    if (!updated.ok) return updated;
    if (modules !== undefined) {
      await writeCourseModules(organizationId, courseId, modules, tx);
    }
    return updated;
  });
}

export type CohortInput = {
  courseId: string;
  /** 005 iteración 2 — nombre propio de la cohorte; null/omitido = usar course.name. */
  name?: string | null;
  startDate: Date;
  endDate?: Date | null;
  /** 005 (DV-005) — reemplaza el `professor` texto libre de 004. */
  teacherId?: string | null;
  /** 005 — moneda entera (DV-008). */
  cost?: number | null;
  /** 007 — de qué moneda es `cost`. */
  currency?: Currency;
  /** 009/010 — asistencia mínima para aprobar; null = hereda del curso. */
  minAttendancePct?: number | null;
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
  capacity?: number | null;
  whatsappGroupLink?: string | null;
  /**
   * 025 — El enlace de la reunión RECURRENTE de la cohorte.
   *
   * La columna existe desde la 013 y **nunca tuvo formulario**: por eso las
   * 41 cohortes reales la tienen vacía. Es el enlace que ve el alumno
   * (`resolveMeetingUrl`), y es propio de ESTA cohorte aunque comparta cuenta
   * de Zoom con otra.
   */
  meetingUrl?: string | null;
  /**
   * 023 (FR-002) / 025 — El AULA de la cohorte, que es la CUENTA de Zoom que
   * ocupa. Sus clases la heredan, y sirve para detectar que dos cohortes se
   * pisan en la misma cuenta.
   *
   * No aporta el enlace: la sala del aula es compartida, y usarla de respaldo
   * mandaba al alumno a la clase de otra cohorte. El enlace es `meetingUrl`,
   * acá arriba.
   */
  virtualRoomId?: string | null;
  /** 005 (DV-004) — software(s) que declara usar la cohorte. */
  softwareIds?: string[];
};

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato de hora inválido (HH:MM)")
  .nullable();

/**
 * Validación de la cohorte, compartida por el POST y el PATCH de `/api/cohorts`
 * — vive junto a `CohortInput` por el mismo motivo que `courseContentSchema`:
 * agregar un campo al tipo sin validarlo tiene que saltar a la vista. Cuando el
 * schema estaba duplicado por ruta, sumar un campo en una y olvidarlo en la
 * otra hacía que Zod lo descartara en silencio.
 *
 * `cost` es el precio de lista de la cohorte: dato de CATÁLOGO, no financiero
 * (FR-016 cubre montos de inscripción y facturación), así que va bajo
 * `withAuth` y el rol soporte puede verlo y editarlo — mismo criterio que
 * `/api/course-categories` y `/api/dashboard/licenses`.
 */
export const cohortInputSchema = {
  name: z.string().trim().max(200).nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  teacherId: z.string().min(1).nullable().optional(),
  cost: z.number().int().min(0).nullable().optional(),
  currency: z.enum(CURRENCIES).optional(),
  minAttendancePct: z.number().int().min(0).max(100).nullable().optional(),
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
  capacity: z.number().int().min(0).nullable().optional(),
  whatsappGroupLink: z.string().max(2000).nullable().optional(),
  meetingUrl: httpUrl.nullable().optional(),
  virtualRoomId: z.string().min(1).nullable().optional(),
  softwareIds: z.array(z.string().min(1)).optional(),
};

/** 005 (T029, FR-006) — cohorte cuyo cupo supera las licencias disponibles de un software. */
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
 * body pertenecen a `organizationId` — sin esto, un usuario de una org puede
 * enganchar en su cohorte un profesor/software/curso de OTRA organización con
 * solo adivinar su id. La disciplina de `scoped()` que protege el id primario
 * tiene que aplicarse también a las FK secundarias que llegan del cliente.
 */
async function validateCohortForeignKeys(
  db: DbOrTx,
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

/** 004/005 — Alta de una cohorte (edición concreta de un curso). */
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
    currency: input.currency ?? "UYU",
    minAttendancePct: input.minAttendancePct ?? null,
    frequency: input.frequency ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    daysOfWeek: input.daysOfWeek ?? null,
    classroom: input.classroom ?? null,
    capacity: input.capacity ?? null,
    whatsappGroupLink: input.whatsappGroupLink ?? null,
    meetingUrl: input.meetingUrl ?? null,
    virtualRoomId: input.virtualRoomId ?? null,
  });
  if (input.softwareIds && input.softwareIds.length > 0) {
    await db.insert(schema.cohortSoftware).values(
      input.softwareIds.map((softwareId) => ({ organizationId, cohortId: id, softwareId }))
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

/** 005 (T008) — Edición de una cohorte; solo toca los campos presentes en `input`. */
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
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.minAttendancePct !== undefined ? { minAttendancePct: input.minAttendancePct } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
      ...(input.classroom !== undefined ? { classroom: input.classroom } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.whatsappGroupLink !== undefined
        ? { whatsappGroupLink: input.whatsappGroupLink }
        : {}),
      ...(input.meetingUrl !== undefined ? { meetingUrl: input.meetingUrl } : {}),
      ...(input.virtualRoomId !== undefined ? { virtualRoomId: input.virtualRoomId } : {}),
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
  if (!cohort) return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };

  if (input.softwareIds !== undefined) {
    await db
      .delete(schema.cohortSoftware)
      .where(
        scoped(
          schema.cohortSoftware.organizationId,
          organizationId,
          eq(schema.cohortSoftware.cohortId, cohortId)
        )
      );
    if (input.softwareIds.length > 0) {
      await db.insert(schema.cohortSoftware).values(
        input.softwareIds.map((softwareId) => ({ organizationId, cohortId, softwareId }))
      );
    }
  }

  let licenseWarnings: LicenseWarning[] = [];
  if (cohort.capacity) {
    const finalSoftwareIds =
      input.softwareIds !== undefined
        ? input.softwareIds
        : (await resolveSoftwareByCohort(db, organizationId, [cohortId]))
            .get(cohortId)
            ?.map((s) => s.id) ?? [];
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
 * de la cohorte ya no se fija a mano: se calcula de `[startDate, endDate]`
 * contra "hoy". `endDate` NULL se trata como "sigue en curso una vez
 * empezada" (mismo criterio que DV-006, choque de horario). La columna
 * `status` sigue existiendo en el schema pero la serialización SIEMPRE
 * devuelve el valor calculado, nunca el guardado.
 */
/**
 * 011 (US3) — El precio que rige para una cohorte.
 *
 * La cohorte pisa al curso, igual que `resolveMinAttendance`. Es la misma
 * forma de la 009 a propósito: dos reglas de herencia que se leen distinto
 * son dos oportunidades de equivocarse.
 *
 * **El precio y su moneda viajan JUNTOS.** Separarlos permite el estado
 * imposible "10.000 sin moneda", y con UYU y PYG conviviendo eso es una
 * diferencia de mil veces (007).
 */
export function resolveListPrice(
  cohort: { cost: number | null; currency: string | null },
  course: { listPrice: number | null; listCurrency: string | null }
): { price: number; currency: string } | null {
  if (cohort.cost !== null && cohort.cost > 0) {
    return { price: cohort.cost, currency: cohort.currency ?? "UYU" };
  }
  if (course.listPrice !== null && course.listPrice > 0) {
    return { price: course.listPrice, currency: course.listCurrency ?? "UYU" };
  }
  // Ninguno de los dos: no hay precio, y eso NO es cero — es "no se sabe".
  return null;
}

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
    currency: cohort.currency,
    /**
     * 011 (US3) — El precio de lista ya RESUELTO: propio de la cohorte, o
     * heredado del curso. Se resuelve acá y no en cada pantalla para que la
     * regla viva en un solo lugar, igual que el mínimo de asistencia.
     *
     * `null` significa **no hay precio cargado**, que no es lo mismo que
     * cero — y con 191 inscripciones sin monto, confundirlos sería registrar
     * media academia como gratuita.
     */
    listPrice: resolveListPrice(cohort, course),
    minAttendancePct: cohort.minAttendancePct,
    frequency: cohort.frequency,
    classroom: cohort.classroom,
    // 006 — el temario es del curso, no de la edición: la cohorte lo hereda.
    // Se mantiene en el DTO de cohorte para no romper a sus consumidores.
    syllabusUrl: course.syllabusUrl,
    capacity: cohort.capacity,
    whatsappGroupLink: cohort.whatsappGroupLink,
    meetingUrl: cohort.meetingUrl,
    /**
     * 023 — Del AULA viaja el ID y no la URL: esta es la superficie del
     * STAFF, y la pantalla que la consume necesita saber CUÁL aula está
     * elegida para marcarla en el selector, no abrirla.
     */
    virtualRoomId: cohort.virtualRoomId,
    status: computeCohortStatus(cohort.startDate, cohort.endDate),
    software,
  };
}

/** En una sola query para todas las cohortes: evita el N+1 del listado. */
async function resolveSoftwareByCohort(
  db: DbOrTx,
  organizationId: string,
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
    .where(
      scoped(
        schema.cohortSoftware.organizationId,
        organizationId,
        inArray(schema.cohortSoftware.cohortId, cohortIds)
      )
    );
  for (const r of rows) {
    const list = map.get(r.cohortId) ?? [];
    list.push({ id: r.software.id, name: r.software.name });
    map.set(r.cohortId, list);
  }
  return map;
}

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
    organizationId,
    rows.map((r) => r.cohort.id)
  );

  return rows.map((r) =>
    serializeCohort(r.cohort, r.course, r.teacher, softwareByCohort.get(r.cohort.id) ?? [])
  );
}

/** 005 (T008) — Una cohorte puntual, con `teacher`/`software` resueltos. */
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

  const softwareByCohort = await resolveSoftwareByCohort(db, organizationId, [cohortId]);
  return serializeCohort(
    row.cohort,
    row.course,
    row.teacher,
    softwareByCohort.get(cohortId) ?? []
  );
}

/* ============================================================
 * 023 — La baja de una camada
 * ============================================================ */

export type HistorialDeLaCamada = {
  enrollments: number;
  classes: number;
  attendance: number;
  assessments: number;
  payments: number;
};

export type DecisionDeBajaCamada = {
  accion: "borrar" | "bloquear";
  motivo: string;
};

/**
 * 023 — Qué se puede hacer con una camada que se quiere dar de baja.
 *
 * **Pura**: es la regla que decide si se borra historia, y probarla no debería
 * necesitar una base.
 *
 * El criterio es el mismo que el de la baja de un contacto
 * (`decidirBaja`, 014), con una diferencia que importa: un contacto se
 * ARCHIVA porque sigue siendo una persona con historial propio. Una camada
 * con historial no se archiva — se **bloquea**, y se dice qué la ata.
 *
 * Por qué no se archiva: una camada existe para agrupar a sus alumnos, y una
 * "camada archivada" con inscripciones adentro sería una lista que nadie
 * mira pero que sigue apareciendo en el legajo de cada persona. El estado
 * `finalizada` ya cubre "esto terminó"; archivar además sería un segundo
 * estado que dice casi lo mismo.
 *
 * El caso que esto viene a resolver es el otro: **crear una camada por error
 * y no poder sacarla**. Sin inscripciones ni clases no hay historia que
 * proteger, y hoy no se puede borrar porque la ruta no existe.
 */
export function decidirBajaCamada(h: HistorialDeLaCamada): DecisionDeBajaCamada {
  const partes: string[] = [];
  if (h.enrollments > 0) {
    partes.push(`${h.enrollments} ${h.enrollments === 1 ? "inscripción" : "inscripciones"}`);
  }
  if (h.classes > 0) {
    partes.push(`${h.classes} ${h.classes === 1 ? "clase" : "clases"}`);
  }
  if (h.attendance > 0) {
    partes.push(`asistencia registrada`);
  }
  if (h.assessments > 0) {
    partes.push(`${h.assessments} ${h.assessments === 1 ? "evaluación" : "evaluaciones"}`);
  }
  if (h.payments > 0) {
    partes.push(`${h.payments} ${h.payments === 1 ? "pago" : "pagos"}`);
  }

  if (partes.length === 0) {
    return {
      accion: "borrar",
      motivo: "No tiene inscripciones ni clases: se puede borrar.",
    };
  }

  return {
    accion: "bloquear",
    motivo:
      `Tiene ${partes.join(", ")}. No se borra: eso es historia de personas ` +
      "reales. Si la camada ya terminó, marcala como finalizada; si te " +
      "equivocaste al crearla, sacale primero las inscripciones.",
  };
}

export type BajaCamadaResult =
  | { ok: true; motivo: string }
  | { ok: false; status: 404 | 409; code: string; message: string };

/**
 * 023 — Borra una camada, solo si no tiene nada colgando.
 *
 * Lo que SÍ se borra junto con ella son las cosas que no existen sin la
 * camada y que no son historia de nadie: sus avisos y las evaluaciones que se
 * hayan creado sin resultados. Ahí `cascade` del esquema hace el trabajo.
 */
export async function deleteCohort(
  organizationId: string,
  cohortId: string
): Promise<BajaCamadaResult> {
  const db = getDb();

  const existe = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!existe[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Camada no encontrada" };
  }

  const [inscripciones, clases, evaluaciones] = await Promise.all([
    db
      .select({ id: schema.enrollment.id })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          eq(schema.enrollment.cohortId, cohortId)
        )
      ),
    db
      .select({ id: schema.classSession.id })
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          eq(schema.classSession.cohortId, cohortId)
        )
      ),
    db
      .select({ id: schema.assessment.id })
      .from(schema.assessment)
      .where(
        scoped(
          schema.assessment.organizationId,
          organizationId,
          eq(schema.assessment.cohortId, cohortId)
        )
      ),
  ]);

  /**
   * Asistencia y pagos se cuentan a través de las inscripciones. Si no hay
   * inscripciones no puede haber ninguno de los dos, así que no se consultan:
   * un `inArray` con lista vacía es un viaje a la base para preguntar por
   * nada.
   */
  const enrollmentIds = inscripciones.map((e) => e.id);
  const [asistencia, pagos] = enrollmentIds.length
    ? await Promise.all([
        db
          .select({ id: schema.attendance.id })
          .from(schema.attendance)
          .where(
            scoped(
              schema.attendance.organizationId,
              organizationId,
              inArray(schema.attendance.enrollmentId, enrollmentIds)
            )
          ),
        db
          .select({ id: schema.payment.id })
          .from(schema.payment)
          .where(
            scoped(
              schema.payment.organizationId,
              organizationId,
              inArray(schema.payment.enrollmentId, enrollmentIds)
            )
          ),
      ])
    : [[], []];

  const decision = decidirBajaCamada({
    enrollments: inscripciones.length,
    classes: clases.length,
    attendance: asistencia.length,
    assessments: evaluaciones.length,
    payments: pagos.length,
  });

  if (decision.accion === "bloquear") {
    return { ok: false, status: 409, code: "tiene_historial", message: decision.motivo };
  }

  await db
    .delete(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)));

  return { ok: true, motivo: decision.motivo };
}
