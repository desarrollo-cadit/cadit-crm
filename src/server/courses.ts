import { and, asc, count, desc, eq, inArray, isNull, like, ne } from "drizzle-orm";
import { z } from "zod";
import { minorAmount } from "@/lib/money-schema";
import { httpUrl } from "@/lib/url-schema";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { slugify } from "@/lib/utils";
import { computeCohortStatus } from "@/lib/cohort-status";
import { ACADEMY_TIME_ZONE } from "@/lib/schedule-time";
import { progresoDeCursada, type ProgresoDeCursada } from "@/lib/cohort-progress";
import { decidirBorradoDeClases } from "@/lib/recess";
import { marcaDeConfirmacion } from "@/lib/marca-de-confirmacion";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { availableLicenses } from "@/server/licenses";
import { inscribirEnModulos } from "@/server/module-enrollment";
import {
  writeCourseModules,
  type CourseModuleInput,
} from "@/server/course-content";
import { findScheduleConflicts, type ScheduleConflict } from "@/server/teachers";
import { roomAssignmentError } from "@/server/virtual-rooms";
import {
  verificarMarcaDeEspecializacion,
  verificarPadreDeCohorte,
} from "@/server/program-modules";
import { planDeReorden, siguientePosicion } from "@/lib/program-order";
import { COURSE_KINDS, type CourseKind } from "@/lib/course-kind";
import { courseDurationSchema, horasParaDb } from "@/lib/course-duration";
import { MAX_DESCRIPCION_CERTIFICADO } from "@/lib/certificado";


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
  /** Duración del curso (`src/lib/course-duration.ts`); horas con decimales. */
  classCount?: number | null;
  hoursPerClass?: number | null;
  totalHours?: number | null;
  imageUrl?: string | null;
  learningObjectives?: string[] | null;
  targetAudience?: string | null;
  syllabusUrl?: string | null;
  /** 007 — si sale o no en el catálogo público. Default `true` en el alta. */
  published?: boolean;
  /**
   * 028 fase 5 — si este curso ENTREGA certificado. Default `true` en el alta:
   * el caso normal es el curso que certifica. Gobierna la EMISIÓN y nada más;
   * un curso que no certifica se aprueba igual.
   */
  grantsCertificate?: boolean;
  /**
   * 038 (FR-012) — el párrafo del certificado. El tope de largo es el primer
   * filtro; la medida real contra la caja del diseño la hace la ruta
   * (`errorDeDescripcionDeCertificado`).
   */
  certificateDescription?: string | null;
  /** 009/010 — asistencia mínima por defecto de las cohortes de este curso. */
  minAttendancePct?: number | null;
  /** 032 (FR-001/FR-003) — curso, módulo o taller. Default `curso` en el alta. */
  kind?: CourseKind;
  /** 046 US8 (FR-029) — "Gratuito: no cuenta como venta". Default `false`. */
  isFree?: boolean;
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
  ...courseDurationSchema,
  imageUrl: httpUrl.nullable().optional(),
  learningObjectives: z.array(z.string().trim().min(1).max(300)).max(30).nullable().optional(),
  targetAudience: z.string().max(4000).nullable().optional(),
  syllabusUrl: httpUrl.nullable().optional(),
  published: z.boolean().optional(),
  grantsCertificate: z.boolean().optional(),
  isFree: z.boolean().optional(),
  certificateDescription: z
    .string()
    .trim()
    .max(MAX_DESCRIPCION_CERTIFICADO, `La descripción del certificado admite hasta ${MAX_DESCRIPCION_CERTIFICADO} caracteres`)
    .transform((t) => (t === "" ? null : t))
    .nullable()
    .optional(),
  minAttendancePct: z.number().int().min(0).max(100).nullable().optional(),
  kind: z.enum(COURSE_KINDS).optional(),
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
      classCount: input.classCount ?? null,
      hoursPerClass: horasParaDb(input.hoursPerClass ?? null),
      totalHours: horasParaDb(input.totalHours ?? null),
      imageUrl: input.imageUrl ?? null,
      learningObjectives: input.learningObjectives ?? null,
      targetAudience: input.targetAudience ?? null,
      syllabusUrl: input.syllabusUrl ?? null,
      // 007 — un curso nuevo se publica salvo que se diga lo contrario:
      // el caso normal es el curso del catálogo.
      published: input.published ?? true,
      // 028 fase 5 — y certifica salvo que se diga lo contrario: el curso que
      // no entrega certificado es la excepción, no la regla.
      grantsCertificate: input.grantsCertificate ?? true,
      isFree: input.isFree ?? false,
      certificateDescription: input.certificateDescription ?? null,
      minAttendancePct: input.minAttendancePct ?? null,
      // 032 (FR-001) — sin tipo declarado, es un curso del catálogo.
      kind: input.kind ?? "curso",
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
      ...(input.classCount !== undefined ? { classCount: input.classCount } : {}),
      ...(input.hoursPerClass !== undefined
        ? { hoursPerClass: horasParaDb(input.hoursPerClass) }
        : {}),
      ...(input.totalHours !== undefined ? { totalHours: horasParaDb(input.totalHours) } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.learningObjectives !== undefined
        ? { learningObjectives: input.learningObjectives }
        : {}),
      ...(input.targetAudience !== undefined ? { targetAudience: input.targetAudience } : {}),
      ...(input.syllabusUrl !== undefined ? { syllabusUrl: input.syllabusUrl } : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
      ...(input.grantsCertificate !== undefined
        ? { grantsCertificate: input.grantsCertificate }
        : {}),
      ...(input.isFree !== undefined ? { isFree: input.isFree } : {}),
      ...(input.certificateDescription !== undefined
        ? { certificateDescription: input.certificateDescription }
        : {}),
      ...(input.minAttendancePct !== undefined ? { minAttendancePct: input.minAttendancePct } : {}),
      // 032 — cambiar el tipo de un curso con cohortes está permitido: el
      // tipo clasifica, no cambia cómo funcionan las cohortes que ya existen.
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
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
  /** 005 — en centésimos (DV-008, `src/lib/money.ts`). */
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
  /**
   * 028 (FR-001) — La camada de la especialización de la que esta cohorte es
   * MÓDULO. null/omitido = cohorte suelta, que es el caso de las 41 filas
   * reales y el comportamiento de siempre (FR-032, FR-033).
   *
   * No lo valida `cohortInputSchema` todavía: el formulario del módulo llega
   * en la fase 2. Lo que sí está desde ya es el guarda, para que el árbol no
   * pueda nacer torcido por ninguna vía del servidor.
   */
  parentCohortId?: string | null;
  /**
   * 028 (FR-002) — Orden del módulo dentro de su programa. Sin padre, no
   * significa nada. En el alta de un módulo, omitirlo lo manda al FINAL
   * (`siguientePosicion`): nadie tiene que tipear 10/20/30.
   */
  position?: number | null;
  /**
   * 028 (seguimiento) — La cohorte ES una especialización. Omitido en el alta
   * = cohorte común; omitido en un PATCH = no se toca.
   */
  isSpecialization?: boolean;
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
  cost: minorAmount.nullable().optional(),
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
  whatsappGroupLink: httpUrl.nullable().optional(),
  meetingUrl: httpUrl.nullable().optional(),
  virtualRoomId: z.string().min(1).nullable().optional(),
  /**
   * 028 fase 4 (FR-001/FR-002) — Armar y desarmar la especialización.
   *
   * `null` explícito DESCUELGA el módulo; omitirlo no toca nada. Esa
   * distinción es la que le permite al PATCH editar un módulo sin tener que
   * reenviar a qué camada pertenece.
   *
   * **No hay validación acá y no es un olvido**: quién puede ser padre de
   * quién lo decide `verificarPadreDeCohorte` (fase 1), que ya corre dentro de
   * `createCohort` y `updateCohort`. Zod comprueba la forma; el árbol lo
   * comprueba el guarda, en un solo lugar.
   *
   * `position` es una CLAVE DE ORDEN. Nadie la imprime: el ordinal que se
   * muestra sale del lugar en la lista ordenada (`etiquetaDeModulo`), así que
   * cargar 10/20/30 para dejar hueco entre módulos es una decisión válida y
   * la pantalla sigue leyéndose bien.
   */
  parentCohortId: z.string().min(1).nullable().optional(),
  position: z.number().int().min(0).nullable().optional(),
  /**
   * 028 (seguimiento) — Marcar o desmarcar la especialización. Igual que el
   * padre, la forma la comprueba Zod y la coherencia con el árbol la
   * comprueba `verificarMarcaDeEspecializacion`, en un solo lugar.
   */
  isSpecialization: z.boolean().optional(),
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
      /**
       * 034 (FR-001) — Cuántas inscripciones a este módulo se crearon solas
       * (los alumnos activos de la especialización). 0 en una cohorte común.
       */
      autoEnrolled: number;
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
  input: {
    courseId?: string;
    teacherId?: string | null;
    softwareIds?: string[];
    virtualRoomId?: string | null;
  },
  /** La cohorte que se edita; ausente en el alta. */
  cohortId?: string
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
  /**
   * 023 (FR-009) — Un aula dada de baja no se asigna a nada NUEVO, y lo que ya
   * la tenía la conserva. El selector del front la oculta; esto es lo que lo
   * prohíbe cuando el id llega por la API.
   *
   * La regla vive en `roomAssignmentError` (`server/virtual-rooms.ts`) desde
   * que la 023 US5 abrió la segunda puerta —el aula de UNA clase—: dos copias
   * de la misma regla divergen, y la que alguien se olvide de actualizar es la
   * que reabre el agujero.
   *
   * La cohorte actual se consulta SOLO cuando el aula está de baja, que es el
   * único caso en que la respuesta cambia: el formulario de edición reenvía
   * todos los campos, el aula incluida, y una cohorte que tenía el aula antes
   * de la baja tiene que poder cambiar su costo sin que el aula la bloquee.
   */
  if (input.virtualRoomId) {
    const roomError = await roomAssignmentError(
      db,
      organizationId,
      input.virtualRoomId,
      async () => {
        if (!cohortId) return null;
        const actual = await db
          .select({ virtualRoomId: schema.cohort.virtualRoomId })
          .from(schema.cohort)
          .where(
            scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId))
          )
          .limit(1);
        return actual[0]?.virtualRoomId ?? null;
      }
    );
    if (roomError) return roomError;
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

  // 028 (FR-003/FR-004) — antes de insertar: el árbol es de un solo nivel.
  // El último argumento declara un HECHO, no una excepción a la regla: esta
  // cohorte todavía no existe, así que nadie puede estar cursándola.
  const esEspecializacion = input.isSpecialization ?? false;
  const treeError =
    (await verificarMarcaDeEspecializacion(
      db,
      organizationId,
      id,
      esEspecializacion,
      input.parentCohortId ?? null,
      true
    )) ??
    (await verificarPadreDeCohorte(
      db,
      organizationId,
      id,
      input.parentCohortId ?? null,
      true,
      esEspecializacion
    ));
  if (treeError) {
    return { ok: false, status: 422, code: "invalid_body", message: treeError.message };
  }

  /**
   * El módulo nuevo sin lugar declarado va al FINAL del programa. Se resuelve
   * acá y no en el navegador: la pantalla puede tener una lista vieja, y dos
   * altas seguidas desde la pestaña caerían en el mismo número.
   */
  const position =
    input.parentCohortId && input.position == null
      ? siguientePosicion(
          (
            await db
              .select({ position: schema.cohort.position })
              .from(schema.cohort)
              .where(
                scoped(
                  schema.cohort.organizationId,
                  organizationId,
                  eq(schema.cohort.parentCohortId, input.parentCohortId)
                )
              )
          ).map((r) => r.position)
        )
      : (input.position ?? null);

  await db.insert(schema.cohort).values({
    id,
    organizationId,
    courseId: input.courseId,
    parentCohortId: input.parentCohortId ?? null,
    position,
    isSpecialization: esEspecializacion,
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

  /**
   * 034 (FR-001/FR-003) — Un módulo nuevo inscribe a cada alumno ACTIVO de su
   * especialización, en la misma transacción: si algo falla, lanza y no queda
   * ni el módulo ni la mitad de las inscripciones. Sin cuotas ni vendedor (la
   * venta es la madre). Cubre los dos caminos de 032: "Módulo nuevo" llega
   * acá por `createModuloConCursoPropio`. Una cohorte común no paga nada.
   */
  const autoEnrolled = input.parentCohortId
    ? (await inscribirEnModulos(organizationId, input.parentCohortId, { moduloIds: [id] }))
        .aCrear.length
    : 0;

  const licenseWarnings = await computeLicenseWarnings(
    organizationId,
    input.softwareIds ?? [],
    input.capacity
  );
  const scheduleWarnings = input.teacherId
    ? await findScheduleConflicts(
        organizationId,
        input.teacherId,
        {
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          daysOfWeek: input.daysOfWeek ?? null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
        },
        id
      )
    : [];

  return { ok: true, id, licenseWarnings, scheduleWarnings, autoEnrolled };
}

/**
 * 032 (FR-005/FR-006/FR-007) — "Módulo nuevo": el módulo de una
 * especialización con NOMBRE PROPIO, sin atarlo a un curso del catálogo.
 *
 * Toda cohorte cuelga de un curso, así que por detrás se crea un curso de
 * tipo `modulo` con ese nombre y la cohorte del módulo apuntando a él. Los
 * dos o ninguno:
 *
 * 1. **Todo lo que puede fallar por el pedido se valida ANTES de escribir**:
 *    la madre (que exista y sea especialización) y las FK del módulo. Devolver
 *    un 422 no revierte la transacción del pedido, así que un error después
 *    del alta del curso dejaría un curso huérfano.
 * 2. Lo que falle DESPUÉS de la primera escritura **lanza**: `withAuth`
 *    revierte la transacción entera y el curso no queda.
 *
 * El curso nace OTORGANDO certificado (038, FR-014: el default `false` de
 * 032 era un error — un módulo aprobado tiene su certificado; la
 * coordinación lo puede apagar) y sin publicar — de
 * todos modos el catálogo público excluye a los módulos por tipo (FR-004).
 * Su `slug` lo resuelve `resolveUniqueCourseSlug`: dos especializaciones con
 * "Módulo 1" terminan en `modulo-1` y `modulo-1-2`.
 */
export async function createModuloConCursoPropio(
  organizationId: string,
  input: Omit<CohortInput, "courseId"> & { parentCohortId: string },
  nombre: string
): Promise<CreateCohortResult & { courseId?: string }> {
  const db = getDb();

  const fkError = await validateCohortForeignKeys(db, organizationId, {
    teacherId: input.teacherId,
    softwareIds: input.softwareIds,
    virtualRoomId: input.virtualRoomId,
  });
  if (fkError) return { ok: false, status: 422, code: "invalid_body", message: fkError };

  const treeError = await verificarPadreDeCohorte(
    db,
    organizationId,
    newId("cohort"),
    input.parentCohortId,
    true,
    false
  );
  if (treeError) {
    return { ok: false, status: 422, code: "invalid_body", message: treeError.message };
  }

  const course = await createCourse(organizationId, {
    name: nombre,
    kind: "modulo",
    grantsCertificate: true,
    published: false,
  });
  if (!course.ok) throw new Error(`032 — no se pudo crear el curso del módulo: ${course.message}`);

  const cohort = await createCohort(organizationId, {
    ...input,
    courseId: course.id,
    isSpecialization: false,
  });
  if (!cohort.ok) {
    // Ya validado arriba: llegar acá es una carrera (la madre cambió en el
    // medio). Lanzar revierte también el curso recién creado.
    throw new Error(`032 — no se pudo crear el grupo del módulo: ${cohort.message}`);
  }
  return { ...cohort, courseId: course.id };
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

  const fkError = await validateCohortForeignKeys(db, organizationId, input, cohortId);
  if (fkError) return { ok: false, status: 422, code: "invalid_body", message: fkError };

  // 028 (FR-003/FR-004) — sólo si el pedido TOCA el padre. Un PATCH que no lo
  // menciona no puede fallar por una regla que no está ejerciendo (FR-032).
  if (input.parentCohortId !== undefined) {
    const treeError = await verificarPadreDeCohorte(
      db,
      organizationId,
      cohortId,
      input.parentCohortId,
      false,
      input.isSpecialization
    );
    if (treeError) {
      return { ok: false, status: 422, code: "invalid_body", message: treeError.message };
    }
  }

  /**
   * 028 (seguimiento) — Sólo si el pedido TOCA la marca, por el mismo motivo
   * que el padre. El padre con el que queda la cohorte es el del pedido si lo
   * trae; si no, el que ya tenía.
   */
  if (input.isSpecialization !== undefined) {
    const padreFinal =
      input.parentCohortId !== undefined
        ? input.parentCohortId
        : ((
            await db
              .select({ parentCohortId: schema.cohort.parentCohortId })
              .from(schema.cohort)
              .where(
                scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId))
              )
              .limit(1)
          )[0]?.parentCohortId ?? null);
    const markError = await verificarMarcaDeEspecializacion(
      db,
      organizationId,
      cohortId,
      input.isSpecialization,
      padreFinal
    );
    if (markError) {
      return { ok: false, status: 422, code: "invalid_body", message: markError.message };
    }
  }

  const updated = await db
    .update(schema.cohort)
    .set({
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.parentCohortId !== undefined
        ? { parentCohortId: input.parentCohortId }
        : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.isSpecialization !== undefined
        ? { isSpecialization: input.isSpecialization }
        : {}),
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
  if (!cohort) return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };

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
        {
          startDate: cohort.startDate,
          endDate: cohort.endDate,
          daysOfWeek: cohort.daysOfWeek,
          startTime: cohort.startTime,
          endTime: cohort.endTime,
        },
        cohortId
      )
    : [];

  return { ok: true, cohort, licenseWarnings, scheduleWarnings };
}

export type ReordenarModulosResult =
  | { ok: true; positions: { id: string; position: number }[] }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * 028 (seguimiento) — Reordenar los módulos desde la pestaña (↑/↓).
 *
 * El pedido es la lista COMPLETA en el orden nuevo y el servidor renumera
 * 10, 20, 30… (`planDeReorden`). Así un ↑ nunca depende de qué números había
 * cargados, y de paso se ordena lo que estuviera mal cargado.
 *
 * Toda la validación va ANTES de la primera escritura: devolver un 422 no
 * revierte la transacción del pedido, así que un error a mitad de camino
 * dejaría la mitad de los módulos renumerados.
 */
export async function reordenarModulos(
  organizationId: string,
  parentCohortId: string,
  order: string[]
): Promise<ReordenarModulosResult> {
  const db = getDb();

  const madre = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, parentCohortId))
    )
    .limit(1);
  if (!madre[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }

  const actuales = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, parentCohortId)
      )
    );

  const plan = planDeReorden(
    actuales.map((m) => m.id),
    order
  );
  if (!plan.ok) {
    return { ok: false, status: 422, code: "invalid_body", message: plan.message };
  }

  for (const { id, position } of plan.positions) {
    await db
      .update(schema.cohort)
      .set({ position, updatedAt: new Date() })
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          eq(schema.cohort.id, id),
          eq(schema.cohort.parentCohortId, parentCohortId)
        )
      );
  }
  return { ok: true, positions: plan.positions };
}

type CohortRow = typeof schema.cohort.$inferSelect;
type CourseRow = typeof schema.course.$inferSelect;
type TeacherRow = typeof schema.teacher.$inferSelect;
type SoftwareRef = { id: string; name: string };

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

/**
 * La regla se mudó a `@/lib/cohort-status` para cortar el ciclo con
 * `@/server/licenses`; se reexporta acá porque este sigue siendo el lugar
 * donde el resto del código la busca.
 */
export { computeCohortStatus };

function serializeCohort(
  cohort: CohortRow,
  course: CourseRow,
  teacher: TeacherRow | null,
  software: SoftwareRef[],
  /** Zona de la academia: decide si el día de inicio ya llegó (marca de confirmación). */
  timeZone: string = ACADEMY_TIME_ZONE,
  now: Date = new Date()
) {
  return {
    id: cohort.id,
    courseId: cohort.courseId,
    courseName: course.name,
    /** 032 (FR-013) — el tipo del curso, para el filtro de la pestaña Cohortes. */
    courseKind: course.kind,
    name: cohort.name,
    /**
     * 028 fase 4 (FR-033) — De qué camada es módulo esta cohorte, y en qué
     * lugar. `null` = cohorte suelta, que es el caso de las 33 simples y el
     * comportamiento de siempre.
     *
     * Viajan porque la pantalla del staff los necesita para dos cosas
     * concretas: saber si ofrecer la pestaña de la especialización, y armar el
     * selector de "el mismo módulo en otra camada" de US4. `position` viaja
     * para poder EDITARLA, nunca para imprimirla.
     */
    parentCohortId: cohort.parentCohortId,
    position: cohort.position,
    /** 028 (seguimiento) — La marca explícita: decide la pestaña y el formulario. */
    isSpecialization: cohort.isSpecialization,
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
    /**
     * 039 — Confirmada ("sale"): ortogonal a `status`, que sale de las fechas.
     * Quién la confirmó lo trae `/api/cohorts/[id]/confirmation`.
     */
    confirmedAt: cohort.confirmedAt?.toISOString() ?? null,
    /**
     * Lo que se DIBUJA de la confirmación (`marcaDeConfirmacion`): en rojo
     * cuando llegó el día de inicio y nadie confirmó. `status` no cambia.
     */
    confirmationFlag: marcaDeConfirmacion(
      {
        startDate: cohort.startDate,
        endDate: cohort.endDate,
        confirmedAt: cohort.confirmedAt,
        courseKind: course.kind,
        parentCohortId: cohort.parentCohortId,
      },
      now,
      timeZone
    ),
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

  const timeZone = rows.length > 0 ? await organizationTimezone(organizationId) : ACADEMY_TIME_ZONE;
  const ids = rows.map((r) => r.cohort.id);
  const [progresos, inscriptos] = await Promise.all([
    progresoPorCohorte(db, organizationId, ids, timeZone),
    inscriptosActivosPorCohorte(db, organizationId, ids),
  ]);
  return rows.map((r) => ({
    ...serializeCohort(
      r.cohort,
      r.course,
      r.teacher,
      softwareByCohort.get(r.cohort.id) ?? [],
      timeZone
    ),
    progress: progresos.get(r.cohort.id) ?? null,
    enrolledCount: inscriptos.get(r.cohort.id) ?? 0,
  }));
}

/**
 * 2026-10-26 — "Clase X de Y" de cada cohorte del listado, en UNA consulta
 * (no una por fila). Lo que cuenta lo decide `progresoDeCursada` con la
 * regla única de la clase dictada (`estadoDeClase` → `classHasEnded`).
 */
async function progresoPorCohorte(
  db: DbOrTx,
  organizationId: string,
  cohortIds: string[],
  timeZone: string,
  now: Date = new Date()
): Promise<Map<string, ProgresoDeCursada | null>> {
  const out = new Map<string, ProgresoDeCursada | null>();
  if (cohortIds.length === 0) return out;
  const clases = await db
    .select({
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
    })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        inArray(schema.classSession.cohortId, cohortIds)
      )
    );
  const porCohorte = new Map<string, { sessionDate: Date; endTime: string | null; canceled: boolean }[]>();
  for (const c of clases) {
    const lista = porCohorte.get(c.cohortId) ?? [];
    lista.push({ sessionDate: c.date, endTime: c.endTime, canceled: c.canceledAt !== null });
    porCohorte.set(c.cohortId, lista);
  }
  for (const [id, lista] of porCohorte) out.set(id, progresoDeCursada(lista, { timeZone, now }));
  return out;
}

/**
 * 2026-10-26 — Inscriptos ACTIVOS de cada cohorte del listado ("14 / 16
 * inscriptos"), en una consulta agrupada. Activo = el contacto no está dado
 * de baja (`contact.archived_at` nulo): el roster lista a los de baja
 * marcados como tales, y no ocupan un lugar.
 */
async function inscriptosActivosPorCohorte(
  db: DbOrTx,
  organizationId: string,
  cohortIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cohortIds.length === 0) return out;
  const filas = await db
    .select({ cohortId: schema.enrollment.cohortId, n: count() })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(inArray(schema.enrollment.cohortId, cohortIds), isNull(schema.contact.archivedAt))
      )
    )
    .groupBy(schema.enrollment.cohortId);
  for (const f of filas) if (f.cohortId) out.set(f.cohortId, Number(f.n));
  return out;
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
    softwareByCohort.get(cohortId) ?? [],
    await organizationTimezone(organizationId)
  );
}

/* ============================================================
 * 023 — La baja de una camada
 * ============================================================ */

export type HistorialDeLaCamada = {
  enrollments: number;
  /** Clases con asistencia o grabación (`decidirBorradoDeClases`, 034). */
  classesWithHistory: number;
  /** Clases sin historia: el cronograma generado. Se borran con el grupo. */
  classesWithoutHistory: number;
  attendance: number;
  /** Evaluaciones con algún resultado, entrega o corrección. Las vacías se van con el grupo. */
  assessmentsWithResults: number;
  payments: number;
  /** Módulos de una especialización (`parent_cohort_id`, FK `restrict`). */
  modules: number;
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
 *
 * 2026-10-22 — Y el de un grupo que **no salió** (llegó a su fecha sin
 * confirmarse). Las clases SIN historia (sin asistencia ni grabación, la regla
 * de 034) ya no bloquean: son el cronograma generado, no cursada, y se borran
 * con el grupo. Tampoco las evaluaciones vacías. Siguen bloqueando las
 * inscripciones, las clases con historia, las evaluaciones con resultados y
 * los módulos; cada motivo dice cuántos y cómo salir.
 */
export function decidirBajaCamada(h: HistorialDeLaCamada): DecisionDeBajaCamada {
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  const motivos: string[] = [];
  if (h.enrollments > 0) {
    motivos.push(
      `Tiene ${n(h.enrollments, "inscripto", "inscriptos")}: mudalos a otro grupo o cancelá sus inscripciones.`
    );
  }
  if (h.payments > 0) {
    motivos.push(`Sus inscripciones tienen ${n(h.payments, "pago", "pagos")} registrados.`);
  }
  if (h.attendance > 0) {
    motivos.push("Tiene asistencia registrada.");
  }
  if (h.classesWithHistory > 0) {
    motivos.push(
      `Tiene ${n(h.classesWithHistory, "clase con asistencia o grabación", "clases con asistencia o grabación")}: ` +
        "es cursada dictada y no se borra."
    );
  }
  if (h.assessmentsWithResults > 0) {
    motivos.push(
      `Tiene ${n(h.assessmentsWithResults, "evaluación con resultados", "evaluaciones con resultados")}: ` +
        "son notas de alumnos y no se borran."
    );
  }
  if (h.modules > 0) {
    motivos.push(
      `Tiene ${n(h.modules, "módulo", "módulos")}: borralos o sacalos de la especialización primero.`
    );
  }

  if (motivos.length === 0) {
    return {
      accion: "borrar",
      motivo:
        h.classesWithoutHistory > 0
          ? `No tiene inscripciones ni cursada: se puede borrar. Se borran también sus ${n(
              h.classesWithoutHistory,
              "clase sin asistencia",
              "clases sin asistencia"
            )}.`
          : "No tiene inscripciones ni clases: se puede borrar.",
    };
  }

  return { accion: "bloquear", motivo: `No se puede borrar. ${motivos.join(" ")}` };
}

export type BajaCamadaResult =
  | { ok: true; motivo: string }
  | { ok: false; status: 404 | 409; code: string; message: string };

/**
 * Lo que ata a una camada, contado. Lo usan el borrado y su vista previa:
 * la pantalla dice lo mismo que después decide el servidor.
 *
 * `null` si la camada no existe.
 */
export async function historialDeLaCamada(
  organizationId: string,
  cohortId: string
): Promise<HistorialDeLaCamada | null> {
  const db = getDb();

  const existe = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!existe[0]) return null;

  const [inscripciones, clases, evaluaciones, modulos] = await Promise.all([
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
      .select({ id: schema.classSession.id, recordingUrl: schema.classSession.recordingUrl })
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
    db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          eq(schema.cohort.parentCohortId, cohortId)
        )
      ),
  ]);

  /**
   * Asistencia y pagos se cuentan a través de las inscripciones. Si no hay
   * inscripciones no puede haber ninguno de los dos, así que no se consultan:
   * un `inArray` con lista vacía es un viaje a la base para preguntar por
   * nada. Lo mismo con las clases y las evaluaciones.
   */
  const enrollmentIds = inscripciones.map((e) => e.id);
  const classIds = clases.map((c) => c.id);
  const assessmentIds = evaluaciones.map((a) => a.id);
  const ninguno: { id: string }[] = [];
  const [asistencia, pagos, asistenciaPorClase, resultados, entregas, correcciones] =
    await Promise.all([
      enrollmentIds.length
        ? db
            .select({ id: schema.attendance.id })
            .from(schema.attendance)
            .where(
              scoped(
                schema.attendance.organizationId,
                organizationId,
                inArray(schema.attendance.enrollmentId, enrollmentIds)
              )
            )
        : ninguno,
      enrollmentIds.length
        ? db
            .select({ id: schema.payment.id })
            .from(schema.payment)
            .where(
              scoped(
                schema.payment.organizationId,
                organizationId,
                inArray(schema.payment.enrollmentId, enrollmentIds)
              )
            )
        : ninguno,
      classIds.length
        ? db
            .selectDistinct({ id: schema.attendance.classSessionId })
            .from(schema.attendance)
            .where(
              scoped(
                schema.attendance.organizationId,
                organizationId,
                inArray(schema.attendance.classSessionId, classIds)
              )
            )
        : ninguno,
      assessmentIds.length
        ? db
            .selectDistinct({ id: schema.assessmentResult.assessmentId })
            .from(schema.assessmentResult)
            .where(
              scoped(
                schema.assessmentResult.organizationId,
                organizationId,
                inArray(schema.assessmentResult.assessmentId, assessmentIds)
              )
            )
        : ninguno,
      assessmentIds.length
        ? db
            .selectDistinct({ id: schema.submission.assessmentId })
            .from(schema.submission)
            .where(
              scoped(
                schema.submission.organizationId,
                organizationId,
                inArray(schema.submission.assessmentId, assessmentIds)
              )
            )
        : ninguno,
      assessmentIds.length
        ? db
            .selectDistinct({ id: schema.correction.assessmentId })
            .from(schema.correction)
            .where(
              scoped(
                schema.correction.organizationId,
                organizationId,
                inArray(schema.correction.assessmentId, assessmentIds)
              )
            )
        : ninguno,
    ]);

  // La misma "historia" que el borrado de clases por receso (034): asistencia o grabación.
  const conAsistencia = new Set(asistenciaPorClase.map((a) => a.id));
  const { borrar, conservar } = decidirBorradoDeClases(
    clases.map((c) => ({
      id: c.id,
      date: new Date(0),
      tieneAsistencia: conAsistencia.has(c.id),
      tieneGrabacion: Boolean(c.recordingUrl),
    }))
  );
  const conResultados = new Set([...resultados, ...entregas, ...correcciones].map((r) => r.id));

  return {
    enrollments: inscripciones.length,
    classesWithHistory: conservar.length,
    classesWithoutHistory: borrar.length,
    attendance: asistencia.length,
    assessmentsWithResults: conResultados.size,
    payments: pagos.length,
    modules: modulos.length,
  };
}

/** Lo que pasaría si se borra la camada, sin tocar nada (para el diálogo). */
export async function previsualizarBajaCamada(
  organizationId: string,
  cohortId: string
): Promise<DecisionDeBajaCamada | null> {
  const historial = await historialDeLaCamada(organizationId, cohortId);
  return historial ? decidirBajaCamada(historial) : null;
}

/**
 * 023 — Borra una camada, solo si no tiene nada colgando.
 *
 * Lo que SÍ se borra junto con ella son las cosas que no existen sin la
 * camada y que no son historia de nadie: sus avisos, las evaluaciones sin
 * resultados y (2026-10-22) las clases sin asistencia ni grabación. Ahí
 * `cascade` del esquema hace el trabajo.
 */
export async function deleteCohort(
  organizationId: string,
  cohortId: string
): Promise<BajaCamadaResult> {
  const historial = await historialDeLaCamada(organizationId, cohortId);
  if (!historial) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }

  const decision = decidirBajaCamada(historial);
  if (decision.accion === "bloquear") {
    return { ok: false, status: 409, code: "tiene_historial", message: decision.motivo };
  }

  await getDb()
    .delete(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)));

  return { ok: true, motivo: decision.motivo };
}

/* ============================================================
 * 032 — Borrar un curso
 * ============================================================ */

export type UsoDelCurso = {
  cohortes: number;
  /** Personas registradas como interesadas en el curso (`enrollment.interest_course_id`). */
  interesados: number;
  /** Nombres de los formularios de captación que apuntan al curso. */
  formularios: string[];
};

export type DecisionDeBorradoCurso = {
  accion: "borrar" | "bloquear";
  motivo: string;
};

/**
 * 032 (FR-015/FR-016) — Si un curso se puede borrar, y si no, por qué.
 *
 * **Pura**, como `decidirBajaCamada`: es la regla que decide si se borra
 * algo, y probarla no debería necesitar una base.
 *
 * Bloquean las tres cosas que son historia o que dejarían algo roto:
 *
 * - una **cohorte** (la FK es `restrict`: la base tampoco lo dejaría, pero con
 *   un 500 en vez de un motivo);
 * - una **persona interesada**: la FK es `set null`, así que la base lo
 *   permitiría en silencio y el lead perdería a qué curso venía;
 * - un **formulario de captación**: también `set null`, y el formulario
 *   seguiría publicado juntando leads sin curso.
 *
 * El mensaje dice QUÉ y CUÁNTOS, y ofrece la salida que casi siempre se
 * busca: sacarlo de la vista cambiándole el tipo o despublicándolo.
 */
export function decidirBorradoCurso(u: UsoDelCurso): DecisionDeBorradoCurso {
  const partes: string[] = [];
  if (u.cohortes > 0) {
    partes.push(`${u.cohortes} ${u.cohortes === 1 ? "grupo" : "grupos"}`);
  }
  if (u.interesados > 0) {
    partes.push(
      `${u.interesados} ${u.interesados === 1 ? "persona interesada" : "personas interesadas"}`
    );
  }
  if (u.formularios.length > 0) {
    const nombres = u.formularios.map((f) => `"${f}"`).join(", ");
    partes.push(
      u.formularios.length === 1
        ? `el formulario de captación ${nombres}`
        : `${u.formularios.length} formularios de captación (${nombres})`
    );
  }

  if (partes.length === 0) {
    return { accion: "borrar", motivo: "No tiene nada asociado: se puede borrar." };
  }
  return {
    accion: "bloquear",
    motivo:
      `No se puede borrar: lo usan ${partes.join(", ")}. ` +
      "Si lo que querés es sacarlo de la vista, cambiale el tipo o despublicalo.",
  };
}

export type BorradoCursoResult =
  | { ok: true; motivo: string }
  | { ok: false; status: 404 | 409; code: string; message: string };

/**
 * 032 (FR-015/FR-017) — Borra un curso, solo si no tiene nada asociado.
 *
 * Lo que se va con él es lo que solo existe para ese curso y no es historia
 * de nadie: su temario (`course_module`), su material (`resource`) y la
 * habilitación de profesores (`teacher_course`). Ahí el `cascade` del
 * esquema hace el trabajo.
 */
export async function deleteCourse(
  organizationId: string,
  courseId: string
): Promise<BorradoCursoResult> {
  const db = getDb();

  const existe = await db
    .select({ id: schema.course.id })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .limit(1);
  if (!existe[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Curso no encontrado" };
  }

  const [cohortes, interesados, formularios] = await Promise.all([
    db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(
        scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.courseId, courseId))
      ),
    db
      .select({ id: schema.enrollment.id })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          eq(schema.enrollment.interestCourseId, courseId)
        )
      ),
    db
      .select({ name: schema.intakeForm.name })
      .from(schema.intakeForm)
      .where(
        scoped(
          schema.intakeForm.organizationId,
          organizationId,
          eq(schema.intakeForm.courseId, courseId)
        )
      ),
  ]);

  const decision = decidirBorradoCurso({
    cohortes: cohortes.length,
    interesados: interesados.length,
    formularios: formularios.map((f) => f.name),
  });
  if (decision.accion === "bloquear") {
    return { ok: false, status: 409, code: "curso_en_uso", message: decision.motivo };
  }

  await db
    .delete(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)));
  return { ok: true, motivo: decision.motivo };
}
