import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { getEnv } from "@/lib/env";
import type { Capability } from "@/lib/capabilities";
import { fullName } from "@/lib/utils";
import {
  WORKSHOP_ATTENDEE_STATUSES,
  WORKSHOP_MODALITIES,
  WORKSHOP_REGISTRATION_STATUSES,
  confirmacionDeTallerEncendida,
  contarPorEstado,
  cuotaDeTaller,
  cuotaSeAnulaAlCancelar,
  decidirInscripcion,
  estadoDePago,
  inicioDelTaller,
  lugaresDisponibles,
  ordenarEdiciones,
  toPublicWorkshop,
  validarCambioDeEstado,
  type CodigoDeRechazo,
  type EdicionPublicable,
  type EstadoDePago,
  type PublicWorkshopDto,
  type WorkshopAttendeeStatus,
  type WorkshopModality,
  type WorkshopRegistrationStatus,
  type WorkshopSource,
} from "@/lib/workshops";
import { addSingleInstallment } from "@/server/billing";
import { createCourse } from "@/server/courses";
import { organizationTimezone } from "@/server/finanzas-periodo";
import {
  findOrCreatePublicContact,
  findOrCreatePublicContactWithStatus,
  type PublicLeadInput,
} from "@/server/intake-forms";
import { avisarInteresadoNuevo } from "@/server/lead-notices-queue";

/**
 * 033 — Talleres: lectura y escritura.
 *
 * Un taller es un curso de tipo `taller` (032); cada EDICIÓN es una cohorte y
 * cada persona anotada es una inscripción (`enrollment`) + su fila 1:1 en
 * `workshop_registration`. La inscripción es lo que hace que la cuota y los
 * pagos aparezcan en Cobranza y Finanzas sin construir nada paralelo.
 *
 * Las reglas (cupo, elegibilidad, transiciones, cuota, DTO público) son puras
 * y viven en `src/lib/workshops.ts`. Acá se lee, se bloquea y se escribe.
 */

/* ============================================================
 * Contratos
 * ============================================================ */

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "La hora va como HH:MM (por ejemplo 18:30).");

const httpUrl = z
  .string()
  .trim()
  .url("El enlace tiene que ser una dirección web completa (https://…).")
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "El enlace tiene que empezar con https://.");

/** 033 (FR-002) — Los datos de una edición, compartidos por el alta y la edición. */
export const workshopEditionSchema = z.object({
  /** Nombre propio de la edición; vacío = el nombre del taller. */
  name: z.string().trim().max(160).nullable().optional(),
  startDate: z.coerce.date({ message: "Falta la fecha del taller." }),
  endDate: z.coerce.date().nullable().optional(),
  startTime: hhmm.nullable().optional(),
  endTime: hhmm.nullable().optional(),
  modality: z.enum(WORKSHOP_MODALITIES, { message: "Elegí si es online o presencial." }),
  meetingUrl: httpUrl.nullable().optional(),
  classroom: z.string().trim().max(300).nullable().optional(),
  capacity: z.number().int().min(1).max(100000).nullable().optional(),
  cost: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.enum(CURRENCIES).default("UYU"),
  registrationStatus: z.enum(WORKSHOP_REGISTRATION_STATUSES).default("abierta"),
});
export type WorkshopEditionInput = z.input<typeof workshopEditionSchema>;

/** 033 (FR-003) — Crear el taller y su primera edición en un solo paso. */
export const createWorkshopSchema = z.object({
  courseName: z.string().trim().min(1, "El nombre del taller es obligatorio.").max(120),
  description: z.string().trim().max(8000).nullable().optional(),
  edition: workshopEditionSchema,
});

/** 033 (FR-012) — Anotar a alguien a mano: un contacto existente o uno nuevo. */
export const manualAttendeeSchema = z.union([
  z.object({ contactId: z.string().min(1) }),
  z.object({
    contact: z.object({
      firstName: z.string().trim().min(1, "Falta el nombre.").max(120),
      lastName: z.string().trim().max(120).nullable().optional(),
      phone: z
        .string()
        .trim()
        .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 59899123456)."),
      email: z.string().trim().email("El correo no es válido.").max(200).nullable().optional(),
    }),
  }),
]);
export type ManualAttendeeInput = z.infer<typeof manualAttendeeSchema>;

export type WorkshopEditionDto = {
  id: string;
  courseId: string;
  courseName: string;
  /** Nombre propio de la edición; `null` = el del taller. */
  name: string | null;
  displayName: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string;
  started: boolean;
  modality: WorkshopModality | null;
  meetingUrl: string | null;
  classroom: string | null;
  capacity: number | null;
  cost: number | null;
  currency: Currency;
  registrationStatus: WorkshopRegistrationStatus | null;
  counts: Record<WorkshopAttendeeStatus, number>;
  occupied: number;
  seatsLeft: number | null;
};

export type WorkshopAttendeeDto = {
  id: string;
  enrollmentId: string;
  contact: { id: string; name: string; phone: string | null; email: string | null };
  conversationId: string | null;
  status: WorkshopAttendeeStatus;
  source: WorkshopSource;
  createdAt: string;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
  lastNotifyError: string | null;
  /** Solo con `cobranza.ver`: un dato que no se debe ver NO VIAJA. */
  payment?: {
    amount: number | null;
    currency: Currency | null;
    due: number;
    paid: number;
    state: EstadoDePago;
  };
};

export type WorkshopCourseDto = { id: string; name: string; editions: number };

export type WorkshopResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

const NO_ENCONTRADO = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Taller no encontrado",
} as const;

/* ============================================================
 * Lectura
 * ============================================================ */

type CohortRow = typeof schema.cohort.$inferSelect;
type CourseRow = typeof schema.course.$inferSelect;

/** Las ediciones de taller, opcionalmente una sola, con su curso. */
async function loadEditions(organizationId: string, cohortId?: string) {
  return getDb()
    .select({ cohort: schema.cohort, course: schema.course })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.course.kind, "taller"),
        cohortId ? eq(schema.cohort.id, cohortId) : undefined
      )
    );
}

/** Cuántos inscriptos hay en cada estado, por edición. */
async function statusCounts(
  organizationId: string,
  cohortIds: string[]
): Promise<Map<string, WorkshopAttendeeStatus[]>> {
  const out = new Map<string, WorkshopAttendeeStatus[]>();
  if (cohortIds.length === 0) return out;
  const rows = await getDb()
    .select({
      cohortId: schema.enrollment.cohortId,
      status: schema.workshopRegistration.status,
    })
    .from(schema.workshopRegistration)
    .innerJoin(
      schema.enrollment,
      eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
    )
    .where(
      scoped(
        schema.workshopRegistration.organizationId,
        organizationId,
        inArray(schema.enrollment.cohortId, cohortIds)
      )
    );
  for (const r of rows) {
    if (!r.cohortId) continue;
    const list = out.get(r.cohortId) ?? [];
    list.push(r.status);
    out.set(r.cohortId, list);
  }
  return out;
}

function toEditionDto(
  cohort: CohortRow,
  course: CourseRow,
  statuses: readonly WorkshopAttendeeStatus[],
  timeZone: string,
  now: Date
): WorkshopEditionDto {
  const counts = contarPorEstado(statuses);
  const occupied = statuses.length - counts.cancelado;
  const startsAt = inicioDelTaller(cohort, timeZone);
  return {
    id: cohort.id,
    courseId: course.id,
    courseName: course.name,
    name: cohort.name,
    displayName: cohort.name ?? course.name,
    description: course.description,
    startDate: cohort.startDate.toISOString(),
    endDate: cohort.endDate?.toISOString() ?? null,
    startTime: cohort.startTime,
    endTime: cohort.endTime,
    startsAt: startsAt.toISOString(),
    started: startsAt.getTime() <= now.getTime(),
    modality: cohort.modality,
    meetingUrl: cohort.meetingUrl,
    classroom: cohort.classroom,
    capacity: cohort.capacity,
    cost: cohort.cost,
    currency: cohort.currency,
    registrationStatus: cohort.registrationStatus,
    counts,
    occupied,
    seatsLeft: lugaresDisponibles(cohort.capacity, occupied),
  };
}

/** 033 (US5) — Todas las ediciones: las próximas primero, después las realizadas. */
export async function listWorkshopEditions(
  organizationId: string,
  now: Date = new Date()
): Promise<WorkshopEditionDto[]> {
  const [rows, timeZone] = await Promise.all([
    loadEditions(organizationId),
    organizationTimezone(organizationId),
  ]);
  const counts = await statusCounts(
    organizationId,
    rows.map((r) => r.cohort.id)
  );
  const dtos = rows.map((r) =>
    toEditionDto(r.cohort, r.course, counts.get(r.cohort.id) ?? [], timeZone, now)
  );
  const conInicio = dtos.map((dto) => ({ dto, startsAt: new Date(dto.startsAt) }));
  return ordenarEdiciones(conInicio, now).map((x) => x.dto);
}

/** 033 (FR-003) — Los talleres (cursos de tipo taller), para "agregar otra edición". */
export async function listWorkshopCourses(organizationId: string): Promise<WorkshopCourseDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.course.id,
      name: schema.course.name,
      editions: sql<number>`count(${schema.cohort.id})`,
    })
    .from(schema.course)
    .leftJoin(schema.cohort, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.kind, "taller")))
    .groupBy(schema.course.id, schema.course.name)
    .orderBy(asc(schema.course.name));
  return rows.map((r) => ({ id: r.id, name: r.name, editions: Number(r.editions) }));
}

/**
 * 033 (US2) — Una edición con su lista de inscriptos.
 *
 * El estado de pago se arma SOLO con `cobranza.ver`: sin esa capacidad no se
 * consultan ni las cuotas ni los pagos (ciclo 013: un dato que no se debe ver
 * no viaja).
 */
export async function getWorkshopEdition(
  organizationId: string,
  cohortId: string,
  capabilities: readonly Capability[],
  now: Date = new Date()
): Promise<{ edition: WorkshopEditionDto; attendees: WorkshopAttendeeDto[] } | null> {
  const db = getDb();
  const [rows, timeZone] = await Promise.all([
    loadEditions(organizationId, cohortId),
    organizationTimezone(organizationId),
  ]);
  const row = rows[0];
  if (!row) return null;

  const registrants = await db
    .select({
      registration: schema.workshopRegistration,
      enrollment: schema.enrollment,
      contact: schema.contact,
      conversationId: schema.conversation.id,
    })
    .from(schema.workshopRegistration)
    .innerJoin(
      schema.enrollment,
      eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
    )
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(
      schema.conversation,
      and(
        eq(schema.conversation.contactId, schema.contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .where(
      scoped(
        schema.workshopRegistration.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.workshopRegistration.createdAt));

  const edition = toEditionDto(
    row.cohort,
    row.course,
    registrants.map((r) => r.registration.status),
    timeZone,
    now
  );

  const verCobranza = capabilities.includes("cobranza.ver");
  const enrollmentIds = registrants.map((r) => r.enrollment.id);
  const due = new Map<string, number>();
  const paid = new Map<string, number>();
  if (verCobranza && enrollmentIds.length > 0) {
    const [installments, payments] = await Promise.all([
      db
        .select({
          enrollmentId: schema.installment.enrollmentId,
          amount: schema.installment.amount,
        })
        .from(schema.installment)
        .where(
          scoped(
            schema.installment.organizationId,
            organizationId,
            inArray(schema.installment.enrollmentId, enrollmentIds),
            isNull(schema.installment.canceledAt)
          )
        ),
      db
        .select({ enrollmentId: schema.payment.enrollmentId, amount: schema.payment.amount })
        .from(schema.payment)
        .where(
          scoped(
            schema.payment.organizationId,
            organizationId,
            inArray(schema.payment.enrollmentId, enrollmentIds),
            isNull(schema.payment.voidedAt)
          )
        ),
    ]);
    for (const i of installments) due.set(i.enrollmentId, (due.get(i.enrollmentId) ?? 0) + i.amount);
    for (const p of payments) paid.set(p.enrollmentId, (paid.get(p.enrollmentId) ?? 0) + p.amount);
  }

  // Un contacto puede tener más de una conversación real: la primera alcanza
  // para el enlace, y no se repite el inscripto.
  const vistos = new Set<string>();
  const attendees: WorkshopAttendeeDto[] = [];
  for (const r of registrants) {
    if (vistos.has(r.registration.id)) continue;
    vistos.add(r.registration.id);
    const base: WorkshopAttendeeDto = {
      id: r.registration.id,
      enrollmentId: r.enrollment.id,
      contact: {
        id: r.contact.id,
        name: fullName(r.contact),
        phone: r.contact.phone,
        email: r.contact.email,
      },
      conversationId: r.conversationId,
      status: r.registration.status,
      source: r.registration.source,
      createdAt: r.registration.createdAt.toISOString(),
      confirmationSentAt: r.registration.confirmationSentAt?.toISOString() ?? null,
      reminderSentAt: r.registration.reminderSentAt?.toISOString() ?? null,
      lastNotifyError: r.registration.lastNotifyError,
    };
    if (verCobranza) {
      const adeudado = due.get(r.enrollment.id) ?? 0;
      const pagado = paid.get(r.enrollment.id) ?? 0;
      base.payment = {
        amount: r.registration.amount,
        currency: r.registration.currency,
        due: adeudado,
        paid: pagado,
        state: estadoDePago({ pactado: r.registration.amount, adeudado, pagado }),
      };
    }
    attendees.push(base);
  }

  return { edition, attendees };
}

/* ============================================================
 * Alta y edición de talleres
 * ============================================================ */

function editionValues(input: WorkshopEditionInput) {
  return {
    name: input.name?.trim() ? input.name.trim() : null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    modality: input.modality,
    // 033 (FR-002) — el enlace es del online y el lugar del presencial: un
    // dato de la otra modalidad que quedó del formulario no se guarda, para
    // que el recordatorio no mande un enlace a quien va a la sede.
    meetingUrl: input.modality === "online" ? (input.meetingUrl ?? null) : null,
    classroom: input.modality === "presencial" ? (input.classroom ?? null) : null,
    capacity: input.capacity ?? null,
    cost: input.cost && input.cost > 0 ? input.cost : null,
    currency: input.currency ?? "UYU",
    registrationStatus: input.registrationStatus ?? "abierta",
  };
}

function validarFechas(input: WorkshopEditionInput): string | null {
  if (input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
    return "La fecha de fin no puede ser anterior a la de inicio.";
  }
  return null;
}

/**
 * 033 (FR-003/FR-004) — El taller (curso de tipo taller) y su primera edición
 * en un solo paso. Sin plan de cuotas, cronograma, evaluaciones ni vendedor:
 * nada de eso se pide ni se crea.
 *
 * Lanza si el curso no se pudo crear después de validar: el pedido revierte
 * entero y no queda un taller sin edición.
 */
export async function createWorkshop(
  organizationId: string,
  input: z.input<typeof createWorkshopSchema>
): Promise<WorkshopResult<{ courseId: string; editionId: string }>> {
  const fechas = validarFechas(input.edition);
  if (fechas) return { ok: false, status: 422, code: "invalid_body", message: fechas };

  const course = await createCourse(organizationId, {
    name: input.courseName,
    description: input.description ?? null,
    kind: "taller",
    published: true,
    // Un taller no entrega certificado en esta fase (spec, Assumptions).
    grantsCertificate: false,
  });
  if (!course.ok) return course;

  const editionId = await insertEdition(organizationId, course.id, input.edition);
  return { ok: true, data: { courseId: course.id, editionId } };
}

async function insertEdition(
  organizationId: string,
  courseId: string,
  input: WorkshopEditionInput
): Promise<string> {
  const id = newId("cohort");
  await getDb()
    .insert(schema.cohort)
    .values({ id, organizationId, courseId, ...editionValues(input) });
  return id;
}

/** 033 (FR-003) — Otra edición de un taller que ya existe. */
export async function addWorkshopEdition(
  organizationId: string,
  courseId: string,
  input: WorkshopEditionInput
): Promise<WorkshopResult<{ editionId: string }>> {
  const fechas = validarFechas(input);
  if (fechas) return { ok: false, status: 422, code: "invalid_body", message: fechas };
  const rows = await getDb()
    .select({ id: schema.course.id, kind: schema.course.kind })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .limit(1);
  if (!rows[0]) return NO_ENCONTRADO;
  if (rows[0].kind !== "taller") {
    return {
      ok: false,
      status: 422,
      code: "no_es_taller",
      message: "Ese curso no es un taller: sus ediciones se crean desde Académico.",
    };
  }
  const editionId = await insertEdition(organizationId, courseId, input);
  return { ok: true, data: { editionId } };
}

/**
 * 033 — Cambiar los datos de una edición. Los ya anotados conservan el monto
 * con el que se anotaron (edge case "cambio de costo"): lo pactado vive en
 * `workshop_registration.amount`, no se recalcula.
 */
export async function updateWorkshopEdition(
  organizationId: string,
  cohortId: string,
  input: WorkshopEditionInput
): Promise<WorkshopResult<{ editionId: string }>> {
  const fechas = validarFechas(input);
  if (fechas) return { ok: false, status: 422, code: "invalid_body", message: fechas };
  const rows = await loadEditions(organizationId, cohortId);
  if (!rows[0]) return NO_ENCONTRADO;
  await getDb()
    .update(schema.cohort)
    .set({ ...editionValues(input), updatedAt: new Date() })
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)));
  return { ok: true, data: { editionId: cohortId } };
}

/* ============================================================
 * Inscripción
 * ============================================================ */

export type RegistrationOutcome = {
  registrationId: string;
  enrollmentId: string;
  contactId: string;
  /** `false` = reenvío de alguien ya anotado: nada cambió (FR-008). */
  created: boolean;
};

export type RegisterResult =
  | { ok: true; data: RegistrationOutcome }
  | { ok: false; status: 404 | 409 | 422; code: CodigoDeRechazo | "not_found" | "invalid_body"; message: string };

/**
 * La etapa de la inscripción a taller. `enrollment.stage_id` es obligatoria,
 * pero un taller no recorre el embudo de ventas: va a la etapa GANADA (es una
 * inscripción hecha), o a la primera si la organización no tiene una. No
 * ensucia el tablero porque el tablero excluye los talleres (FR-021).
 */
async function etapaDelTaller(organizationId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ id: schema.pipelineStage.id, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  return (rows.find((s) => s.kind === "won") ?? rows[0])?.id ?? null;
}

/**
 * 033 (FR-008/FR-009/FR-010/FR-015) — Anota a un contacto en una edición.
 *
 * **Bajo concurrencia, el cupo no se supera** (SC-005): la fila de la cohorte
 * se toma `FOR UPDATE` dentro de la transacción del pedido antes de contar.
 * Dos envíos simultáneos para el último lugar se ordenan en ese candado, y el
 * segundo cuenta el lugar que tomó el primero.
 *
 * Idempotente: el mismo contacto en la misma edición devuelve la inscripción
 * que ya existe. Quien había cancelado vuelve a *Anotado* si hay lugar.
 *
 * Con costo, nace UNA cuota por el costo vigente (FR-015) a través de la
 * cobranza de siempre; gratuito, ninguna (FR-017).
 */
export async function registerContact(
  organizationId: string,
  cohortId: string,
  contactId: string,
  source: WorkshopSource,
  now: Date = new Date()
): Promise<RegisterResult> {
  const db = getDb();

  const locked = await db
    .select({ cohort: schema.cohort })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .for("update");
  const cohort = locked[0]?.cohort;
  if (!cohort) return NO_ENCONTRADO;
  const kind = await db
    .select({ kind: schema.course.kind })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, cohort.courseId)))
    .limit(1);
  if (kind[0]?.kind !== "taller") return NO_ENCONTRADO;

  const [ocupadosRows, existentes, timeZone] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.workshopRegistration)
      .innerJoin(
        schema.enrollment,
        eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
      )
      .where(
        scoped(
          schema.workshopRegistration.organizationId,
          organizationId,
          eq(schema.enrollment.cohortId, cohortId),
          ne(schema.workshopRegistration.status, "cancelado")
        )
      ),
    db
      .select({ enrollment: schema.enrollment, registration: schema.workshopRegistration })
      .from(schema.enrollment)
      .leftJoin(
        schema.workshopRegistration,
        eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
      )
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          eq(schema.enrollment.cohortId, cohortId),
          eq(schema.enrollment.contactId, contactId)
        )
      )
      .limit(1),
    organizationTimezone(organizationId),
  ]);
  const ocupados = Number(ocupadosRows[0]?.n ?? 0);
  const existente = existentes[0];

  const decision = decidirInscripcion({
    registrationStatus: cohort.registrationStatus,
    empezo: inicioDelTaller(cohort, timeZone).getTime() <= now.getTime(),
    capacity: cohort.capacity,
    ocupados,
    existente: existente?.registration?.status ?? null,
  });
  if (!decision.ok) {
    return { ok: false, status: 409, code: decision.code, message: decision.message };
  }

  if (decision.accion === "existente" && existente?.registration) {
    return {
      ok: true,
      data: {
        registrationId: existente.registration.id,
        enrollmentId: existente.enrollment.id,
        contactId,
        created: false,
      },
    };
  }

  const cuota = cuotaDeTaller({
    cost: cohort.cost,
    currency: cohort.currency,
    signupAt: now,
    workshopDay: cohort.startDate,
  });

  // La inscripción: la que ya existía (cargada desde Académico, o la de
  // quien había cancelado) o una nueva.
  let enrollmentId = existente?.enrollment.id ?? null;
  if (!enrollmentId) {
    const stageId = await etapaDelTaller(organizationId);
    if (!stageId) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: "La organización no tiene etapas de inscripción configuradas.",
      };
    }
    enrollmentId = newId("enrollment");
    await db.insert(schema.enrollment).values({
      id: enrollmentId,
      organizationId,
      contactId,
      cohortId,
      stageId,
      enrolledAt: now,
      amount: cuota?.amount ?? null,
      currency: cuota?.currency ?? cohort.currency,
      installments: cuota ? 1 : null,
    });
  }

  let registrationId: string;
  if (existente?.registration) {
    // Vuelve de *Cancelado*: con lo pactado de NUEVO (el precio de hoy).
    registrationId = existente.registration.id;
    await db
      .update(schema.workshopRegistration)
      .set({
        status: "anotado",
        amount: cuota?.amount ?? null,
        currency: cuota?.currency ?? null,
        updatedAt: now,
      })
      .where(
        scoped(
          schema.workshopRegistration.organizationId,
          organizationId,
          eq(schema.workshopRegistration.id, registrationId)
        )
      );
  } else {
    registrationId = newId("workshopRegistration");
    await db.insert(schema.workshopRegistration).values({
      id: registrationId,
      organizationId,
      enrollmentId,
      status: "anotado",
      source,
      amount: cuota?.amount ?? null,
      currency: cuota?.currency ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (cuota) await ensureActiveInstallment(organizationId, enrollmentId, cuota);

  return { ok: true, data: { registrationId, enrollmentId, contactId, created: true } };
}

/**
 * La cuota única, si la inscripción no tiene ya una vigente: quien vuelve de
 * cancelado con la cuota pagada no genera otra.
 */
async function ensureActiveInstallment(
  organizationId: string,
  enrollmentId: string,
  cuota: { amount: number; currency: Currency; dueDate: Date }
): Promise<void> {
  const vigentes = await getDb()
    .select({ id: schema.installment.id })
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        eq(schema.installment.enrollmentId, enrollmentId),
        isNull(schema.installment.canceledAt)
      )
    )
    .limit(1);
  if (vigentes[0]) return;
  await addSingleInstallment(organizationId, enrollmentId, {
    ...cuota,
    notes: "Taller — pago único",
  });
}

/**
 * 033 (FR-012) — Anotar a alguien a mano desde la lista: queda igual que si
 * hubiera venido de la web, con origen `manual`.
 */
export async function registerManualAttendee(
  organizationId: string,
  cohortId: string,
  input: ManualAttendeeInput,
  now: Date = new Date()
): Promise<RegisterResult> {
  let contactId: string | null;
  if ("contactId" in input) {
    const rows = await getDb()
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, input.contactId)))
      .limit(1);
    contactId = rows[0]?.id ?? null;
    if (!contactId) {
      return { ok: false, status: 422, code: "invalid_body", message: "Contacto inexistente." };
    }
  } else {
    const edicion = await loadEditions(organizationId, cohortId);
    if (!edicion[0]) return NO_ENCONTRADO;
    contactId = await findOrCreatePublicContact(
      organizationId,
      `taller:${edicion[0].course.name}`,
      {
        name: input.contact.firstName,
        lastName: input.contact.lastName ?? null,
        phone: input.contact.phone,
        email: input.contact.email ?? null,
      }
    );
    if (!contactId) {
      return { ok: false, status: 422, code: "invalid_body", message: "No se pudo registrar el contacto." };
    }
  }
  return registerContact(organizationId, cohortId, contactId, "manual", now);
}

/**
 * 033 (FR-012/FR-018) — Cambiar el estado de un inscripto.
 *
 * Toma la cohorte `FOR UPDATE` como el alta: volver de *Cancelado* ocupa un
 * lugar, y dos de esos a la vez no pueden pasarse del cupo. Cancelar anula la
 * cuota si nunca se pagó (deja de figurar como deuda) y NUNCA toca los pagos.
 */
export async function changeAttendeeStatus(
  organizationId: string,
  registrationId: string,
  status: WorkshopAttendeeStatus,
  now: Date = new Date()
): Promise<WorkshopResult<{ status: WorkshopAttendeeStatus }>> {
  const db = getDb();
  const rows = await db
    .select({ registration: schema.workshopRegistration, enrollment: schema.enrollment })
    .from(schema.workshopRegistration)
    .innerJoin(
      schema.enrollment,
      eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
    )
    .where(
      scoped(
        schema.workshopRegistration.organizationId,
        organizationId,
        eq(schema.workshopRegistration.id, registrationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row?.enrollment.cohortId) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripto no encontrado" };
  }
  const actual = row.registration.status;
  if (actual === status) return { ok: true, data: { status } };

  const locked = await db
    .select({ cohort: schema.cohort })
    .from(schema.cohort)
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, row.enrollment.cohortId))
    )
    .for("update");
  const cohort = locked[0]?.cohort;
  if (!cohort) return { ok: false, status: 404, code: "not_found", message: "Taller no encontrado" };

  const [ocupadosRows, timeZone] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.workshopRegistration)
      .innerJoin(
        schema.enrollment,
        eq(schema.workshopRegistration.enrollmentId, schema.enrollment.id)
      )
      .where(
        scoped(
          schema.workshopRegistration.organizationId,
          organizationId,
          eq(schema.enrollment.cohortId, cohort.id),
          ne(schema.workshopRegistration.status, "cancelado")
        )
      ),
    organizationTimezone(organizationId),
  ]);

  const decision = validarCambioDeEstado({
    actual,
    nuevo: status,
    empezo: inicioDelTaller(cohort, timeZone).getTime() <= now.getTime(),
    capacity: cohort.capacity,
    ocupados: Number(ocupadosRows[0]?.n ?? 0),
  });
  if (!decision.ok) {
    return { ok: false, status: 409, code: decision.code, message: decision.message };
  }

  await db
    .update(schema.workshopRegistration)
    .set({ status, updatedAt: now })
    .where(
      scoped(
        schema.workshopRegistration.organizationId,
        organizationId,
        eq(schema.workshopRegistration.id, registrationId)
      )
    );

  const enrollmentId = row.enrollment.id;
  if (status === "cancelado") {
    await cancelUnpaidInstallments(organizationId, enrollmentId, now);
  } else if (actual === "cancelado" && row.registration.amount && row.registration.currency) {
    // Vuelve: si la cuota se había anulado por falta de pago, renace con lo pactado.
    const cuota = cuotaDeTaller({
      cost: row.registration.amount,
      currency: row.registration.currency,
      signupAt: now,
      workshopDay: cohort.startDate,
    });
    if (cuota) await ensureActiveInstallment(organizationId, enrollmentId, cuota);
  }

  return { ok: true, data: { status } };
}

/** 033 (FR-018) — Anula las cuotas vigentes SIN pagos. Los pagos no se tocan. */
async function cancelUnpaidInstallments(
  organizationId: string,
  enrollmentId: string,
  now: Date
): Promise<void> {
  const db = getDb();
  const [installments, payments] = await Promise.all([
    db
      .select({ id: schema.installment.id })
      .from(schema.installment)
      .where(
        scoped(
          schema.installment.organizationId,
          organizationId,
          eq(schema.installment.enrollmentId, enrollmentId),
          isNull(schema.installment.canceledAt)
        )
      ),
    db
      .select({ installmentId: schema.payment.installmentId, amount: schema.payment.amount })
      .from(schema.payment)
      .where(
        scoped(
          schema.payment.organizationId,
          organizationId,
          eq(schema.payment.enrollmentId, enrollmentId),
          isNull(schema.payment.voidedAt)
        )
      ),
  ]);
  // Un pago a cuenta (sin cuota) también cuenta como "ya pagó algo".
  const aCuenta = payments.filter((p) => !p.installmentId).reduce((s, p) => s + p.amount, 0);
  for (const i of installments) {
    const pagado =
      aCuenta + payments.filter((p) => p.installmentId === i.id).reduce((s, p) => s + p.amount, 0);
    if (!cuotaSeAnulaAlCancelar({ pagado })) continue;
    await db
      .update(schema.installment)
      .set({ canceledAt: now, updatedAt: now, notes: "Taller — anulada al cancelar la inscripción" })
      .where(
        scoped(schema.installment.organizationId, organizationId, eq(schema.installment.id, i.id))
      );
  }
}

/* ============================================================
 * La web (sin sesión, con alcance de la organización)
 * ============================================================ */

/**
 * 033 (FR-005) — Los talleres abiertos y próximos de talleres publicados.
 * Cerrados, cancelados, ya empezados y no publicados no salen. El DTO lo arma
 * `toPublicWorkshop`, que nunca copia el enlace de la reunión.
 */
export async function listPublicWorkshops(
  organizationId: string,
  now: Date = new Date()
): Promise<PublicWorkshopDto[]> {
  const [rows, timeZone] = await Promise.all([
    getDb()
      .select({ cohort: schema.cohort, course: schema.course })
      .from(schema.cohort)
      .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          eq(schema.course.kind, "taller"),
          eq(schema.course.published, true),
          eq(schema.cohort.registrationStatus, "abierta")
        )
      ),
    organizationTimezone(organizationId),
  ]);
  const proximas = rows.filter(
    (r) => inicioDelTaller(r.cohort, timeZone).getTime() > now.getTime()
  );
  const counts = await statusCounts(
    organizationId,
    proximas.map((r) => r.cohort.id)
  );
  return proximas
    .map((r) => {
      const statuses = counts.get(r.cohort.id) ?? [];
      const edicion: EdicionPublicable = {
        ...publicableDe(r.cohort, r.course),
        ocupados: statuses.filter((s) => s !== "cancelado").length,
      };
      return toPublicWorkshop(edicion, timeZone);
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function publicableDe(cohort: CohortRow, course: CourseRow): Omit<EdicionPublicable, "ocupados"> {
  return {
    id: cohort.id,
    courseId: course.id,
    slug: course.slug,
    courseName: course.name,
    cohortName: cohort.name,
    description: course.description,
    tagline: course.tagline,
    imageUrl: course.imageUrl,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    startTime: cohort.startTime,
    endTime: cohort.endTime,
    modality: cohort.modality,
    classroom: cohort.classroom,
    meetingUrl: cohort.meetingUrl,
    cost: cohort.cost,
    currency: cohort.currency,
    capacity: cohort.capacity,
    registrationStatus: cohort.registrationStatus,
  };
}

/**
 * 033 (FR-006/FR-007) — Inscripción desde la web.
 *
 * Mismo criterio de identidad que los formularios de cursos (teléfono
 * normalizado, `findOrCreatePublicContact`), sin abrir un lead general: quien
 * se anota a un taller no es una oportunidad del tablero de ventas. Solo se
 * aceptan talleres PUBLICADOS: uno interno no recibe inscripciones del sitio.
 *
 * El contacto se crea DESPUÉS de verificar que la edición existe, pero antes
 * de decidir el cupo. Si la inscripción se rechaza (lleno, cerrado), el
 * rechazo se DEVUELVE —no se lanza— y el contacto queda: es una persona
 * interesada, y el CRM la quiere aunque el taller esté lleno.
 */
export async function submitPublicWorkshopRegistration(
  organizationId: string,
  cohortId: string,
  input: PublicLeadInput,
  now: Date = new Date()
): Promise<RegisterResult> {
  const rows = await getDb()
    .select({
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      startDate: schema.cohort.startDate,
      startTime: schema.cohort.startTime,
      courseName: schema.course.name,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, cohortId),
        eq(schema.course.kind, "taller"),
        eq(schema.course.published, true)
      )
    )
    .limit(1);
  const edicion = rows[0];
  if (!edicion) return NO_ENCONTRADO;

  // Mismo prefijo `formulario:` que las otras captaciones públicas: el badge
  // del menú (`countRecentFormArrivals`) cuenta también a quien llegó por un taller.
  const source = `formulario:Taller ${edicion.courseName}`;
  const contacto = await findOrCreatePublicContactWithStatus(organizationId, source, input);
  if (!contacto) {
    return { ok: false, status: 422, code: "invalid_body", message: "No se pudo registrar el contacto." };
  }

  const result = await registerContact(organizationId, cohortId, contacto.contactId, "web", now);

  // Aviso a "Nuevos interesados": quien quedó anotado, y también quien no
  // entró (lleno, cerrado), que igual es alguien interesado. Un reenvío de
  // quien ya estaba anotado no avisa de nuevo.
  const resultado = result.ok ? (result.data.created ? "anotado" : null) : result.status === 409 ? result.message : null;
  if (resultado) {
    await avisarInteresadoNuevo(organizationId, {
      contactId: contacto.contactId,
      contactoNuevo: contacto.created,
      ref: `taller:${cohortId}`,
      datos: input,
      origen: source,
      interes: {
        tipo: "taller",
        nombre: edicion.courseName,
        cohorte: edicion.cohortName,
        inicio: edicion.startDate.toISOString(),
        horario: edicion.startTime,
      },
      resultado,
      now,
    });
  }
  return result;
}

/**
 * 033 (FR-019) — Dispara la confirmación por WhatsApp DESPUÉS del commit: el
 * envío corre en su propio alcance y no ve nada que la transacción del pedido
 * no haya confirmado. Nunca bloquea ni revierte la inscripción.
 *
 * Apagada por defecto (`confirmacionDeTallerEncendida`): sin
 * `WORKSHOP_CONFIRMATION_ENABLED=true` no se agenda ningún envío.
 */
export function scheduleConfirmation(organizationId: string, registrationId: string): void {
  if (!confirmacionDeTallerEncendida(getEnv().WORKSHOP_CONFIRMATION_ENABLED)) return;
  onAfterCommit(() => {
    void import("@/server/workshop-notices")
      .then((m) => m.notifyWorkshopAttendee(organizationId, registrationId, "confirmacion"))
      .catch((err) => {
        console.error(
          "[talleres] la confirmación no se pudo intentar:",
          err instanceof Error ? err.name : "error"
        );
      });
  });
}

/** Re-exportado para las rutas: el estado válido de un inscripto. */
export const attendeeStatusSchema = z.object({
  status: z.enum(WORKSHOP_ATTENDEE_STATUSES),
});
