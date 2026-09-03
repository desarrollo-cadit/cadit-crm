import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  classInstant,
  meetingLinkVisible,
  type MeetingWindow,
} from "@/lib/schedule-time";
import { buildClassSchedule, hoursFromTimes } from "@/server/attendance";
import { resolveMeetingUrl } from "@/server/virtual-rooms";

/**
 * 013 (T008, DV-006) — La lista de clases de una cohorte, que es UNA sola.
 *
 * El alumno no piensa en "clases" y "grabaciones" como cosas distintas: piensa
 * en la clase del martes, y quiere entrar —o verla si ya pasó—. Por eso cada
 * fila cambia según el momento en vez de haber dos pantallas (FR-005c).
 *
 * **Clases reales vs. proyección** (DV-006, opción C): `class_session` tiene
 * hoy **0 filas** para las 41 cohortes. Construir el calendario solo sobre esa
 * tabla daría un calendario vacío — peor que el actual. Así que cuando una
 * cohorte no tiene cronograma se DIBUJA uno a partir de sus días declarados,
 * marcado como proyección.
 *
 * Una proyección no es una clase: no se puede cancelar, no lleva grabación y
 * no registra asistencia. Es un dibujo hasta que alguien genere el cronograma.
 */

export type ClassRowDto = {
  /** `null` en una proyección: todavía no existe la fila. */
  id: string | null;
  number: number;
  /** `true` = dibujo derivado de los días declarados, no una clase real. */
  projected: boolean;
  /** Día de la clase, ISO. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** Instante real de inicio, ya resuelto en la zona de la academia. */
  startsAt: string | null;
  endsAt: string | null;
  topic: string | null;
  canceled: boolean;
  cancelReason: string | null;
  /**
   * Solo dentro de la ventana horaria (FR-003) y nunca si está cancelada
   * (FR-005e). `null` significa "no se muestra ahora", no "no existe".
   */
  meetingUrl: string | null;
  /** `null` si está cancelada (FR-005e) o si todavía no se cargó. */
  recordingUrl: string | null;
};

export type CohortClassesDto = {
  cohortId: string;
  /** `true` si NINGUNA fila es real: la cohorte no tiene cronograma. */
  projected: boolean;
  /**
   * Por qué no se puede generar el cronograma, en palabras. `null` = se puede.
   * Mismo criterio que T017d de 012: se dice el motivo en vez de ofrecer un
   * botón que va a fallar.
   */
  cannotGenerateReason: string | null;
  timezone: string;
  classes: ClassRowDto[];
};

/**
 * 013 (T008) — Decide si una cohorte puede generar cronograma, y si no, por qué.
 *
 * Pura a propósito: es la regla que la pantalla necesita ANTES de mostrar el
 * botón, y se prueba sin base. **6 de las 41 cohortes reales no pueden**, por
 * dos motivos distintos que conviene no mezclar en un "faltan datos".
 */
export function cannotGenerateReason(cohort: {
  endDate: Date | null;
  daysOfWeek: string | null;
}): string | null {
  if (!cohort.daysOfWeek?.trim()) {
    return "La cohorte no declara días de cursada. Cargalos en la edición de la cohorte y vas a poder generar el cronograma.";
  }
  if (!cohort.endDate) {
    return "La cohorte no tiene fecha de fin. Cargala en la edición de la cohorte y vas a poder generar el cronograma.";
  }
  return null;
}

/**
 * Arma la fila que ve la pantalla, resolviendo la ventana del enlace y las
 * reglas de cancelación en UN solo lugar.
 *
 * `now` entra por parámetro y no se lee adentro: así el comportamiento "el
 * enlace aparece 15 minutos antes" se puede probar sin esperar a que sea la
 * hora.
 */
export function buildClassRow(input: {
  id: string | null;
  number: number;
  projected: boolean;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  canceledAt: Date | null;
  cancelReason: string | null;
  /** Enlace propio de la clase; si falta, se HEREDA el de la cohorte. */
  meetingUrl: string | null;
  cohortMeetingUrl: string | null;
  /**
   * 023 (FR-004) — El aula virtual, que se intercala entre los dos anteriores.
   * Opcionales para no obligar a tocar cada llamador: quien no las pase se
   * comporta exactamente como antes de la 023.
   */
  classRoomUrl?: string | null;
  cohortRoomUrl?: string | null;
  recordingUrl: string | null;
  timezone: string;
  window: MeetingWindow;
  now: Date;
}): ClassRowDto {
  const canceled = Boolean(input.canceledAt);
  const startsAt = classInstant(input.date, input.startTime, input.timezone);
  const endsAt = classInstant(input.date, input.endTime, input.timezone);

  /**
   * Herencia, no copia: copiar el enlace al generar el cronograma dejaría
   * enlaces muertos el día que se cambie el de Zoom.
   *
   * 023 (FR-004) — La cadena vive en `resolveMeetingUrl`, un solo lugar:
   * enlace de la clase → aula de la clase → aula de la camada → enlace de la
   * camada. El último escalón es lo que hace que una academia con el enlace
   * pegado a mano siga andando igual después de la 023.
   */
  const enlace = resolveMeetingUrl({
    classMeetingUrl: input.meetingUrl,
    classRoomUrl: input.classRoomUrl ?? null,
    cohortRoomUrl: input.cohortRoomUrl ?? null,
    cohortMeetingUrl: input.cohortMeetingUrl,
  });

  const visible =
    !input.projected &&
    Boolean(enlace) &&
    meetingLinkVisible(input.now, startsAt, endsAt, input.window, canceled);

  return {
    id: input.id,
    number: input.number,
    projected: input.projected,
    date: input.date.toISOString(),
    startTime: input.startTime,
    endTime: input.endTime,
    startsAt: startsAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
    topic: input.topic,
    canceled,
    cancelReason: input.cancelReason,
    meetingUrl: visible ? enlace : null,
    // FR-005e — una clase cancelada no ofrece grabación aunque la tenga
    // cargada, y una proyección no puede tener ninguna.
    recordingUrl: canceled || input.projected ? null : input.recordingUrl,
  };
}

export type CalendarClassDto = {
  cohortId: string;
  cohortName: string;
  courseName: string;
  /** Día de la clase, ISO. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  canceled: boolean;
  /** `true` = proyección; el calendario la dibuja distinto. */
  projected: boolean;
};

/**
 * 013 (T012, FR-004/SC-002) — Las clases de TODAS las cohortes en un rango.
 *
 * Reemplaza lo que hacía el calendario: leía `/api/cohorts` y repetía los días
 * de la semana declarados. Con eso, **una clase cancelada seguía apareciendo**
 * —nadie miraba `class_session`— y cancelarla no cambiaba nada en pantalla.
 *
 * La proyección se calcula acá y no en el navegador para que sea la MISMA que
 * usa la lista de la cohorte, y la misma que generaría el cronograma de verdad.
 * Tres dibujos distintos del mismo cronograma es garantía de que un día no
 * coincidan.
 */
export async function listCalendarClasses(
  organizationId: string,
  from: Date,
  to: Date
): Promise<CalendarClassDto[]> {
  const db = getDb();

  const cohorts = await db
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      courseName: schema.course.name,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      daysOfWeek: schema.cohort.daysOfWeek,
      startTime: schema.cohort.startTime,
      endTime: schema.cohort.endTime,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId));

  const sessions = await db
    .select({
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      startTime: schema.classSession.startTime,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
    })
    .from(schema.classSession)
    .where(scoped(schema.classSession.organizationId, organizationId));

  const porCohorte = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = porCohorte.get(s.cohortId) ?? [];
    list.push(s);
    porCohorte.set(s.cohortId, list);
  }

  const dentro = (d: Date) => d >= from && d <= to;
  const out: CalendarClassDto[] = [];

  for (const c of cohorts) {
    const reales = porCohorte.get(c.id);
    const comun = { cohortId: c.id, cohortName: c.name ?? c.courseName, courseName: c.courseName };

    if (reales && reales.length > 0) {
      for (const s of reales) {
        if (!dentro(s.date)) continue;
        out.push({
          ...comun,
          date: s.date.toISOString(),
          startTime: s.startTime,
          endTime: s.endTime,
          canceled: Boolean(s.canceledAt),
          projected: false,
        });
      }
      continue;
    }

    // Sin cronograma: se dibuja, con la misma función de siempre.
    if (!c.endDate) continue;
    for (const p of buildClassSchedule(c.startDate, c.endDate, c.daysOfWeek, null)) {
      if (!dentro(p.date)) continue;
      out.push({
        ...comun,
        date: p.date.toISOString(),
        startTime: c.startTime,
        endTime: c.endTime,
        canceled: false,
        projected: true,
      });
    }
  }

  return out;
}

/** 013 (T008) — Las clases de una cohorte: reales si existen, proyección si no. */
export async function listCohortClasses(
  organizationId: string,
  cohortId: string,
  now: Date = new Date()
): Promise<CohortClassesDto | null> {
  const db = getDb();

  const orgRows = await db
    .select({
      timezone: schema.organization.timezone,
      before: schema.organization.meetingOpenBeforeMin,
      after: schema.organization.meetingOpenAfterMin,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const org = orgRows[0];
  if (!org) return null;

  const cohortRows = await db
    .select()
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return null;

  const sessions = await db
    .select()
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.classSession.number));

  /**
   * 023 — Las aulas que intervienen: la de la camada y las que alguna clase
   * declaró por su cuenta. Se traen de una vez y se cruzan en memoria; una
   * consulta por clase serían cuarenta viajes para escribir cuarenta veces la
   * misma URL.
   */
  const aulaIds = [
    ...new Set(
      [cohort.virtualRoomId, ...sessions.map((s) => s.virtualRoomId)].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
  const aulas = aulaIds.length
    ? await db
        .select({ id: schema.virtualRoom.id, url: schema.virtualRoom.url })
        .from(schema.virtualRoom)
        .where(
          scoped(
            schema.virtualRoom.organizationId,
            organizationId,
            inArray(schema.virtualRoom.id, aulaIds)
          )
        )
    : [];
  const urlDeAula = new Map(aulas.map((a) => [a.id, a.url]));

  const window: MeetingWindow = { beforeMin: org.before, afterMin: org.after };
  const comun = {
    cohortMeetingUrl: cohort.meetingUrl,
    cohortRoomUrl: cohort.virtualRoomId
      ? (urlDeAula.get(cohort.virtualRoomId) ?? null)
      : null,
    timezone: org.timezone,
    window,
    now,
  };

  if (sessions.length > 0) {
    return {
      cohortId,
      projected: false,
      cannotGenerateReason: null,
      timezone: org.timezone,
      classes: sessions.map((s) =>
        buildClassRow({
          id: s.id,
          number: s.number,
          projected: false,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          topic: s.topic,
          canceledAt: s.canceledAt,
          cancelReason: s.cancelReason,
          meetingUrl: s.meetingUrl,
          classRoomUrl: s.virtualRoomId
            ? (urlDeAula.get(s.virtualRoomId) ?? null)
            : null,
          recordingUrl: s.recordingUrl,
          ...comun,
        })
      ),
    };
  }

  // Sin cronograma: se dibuja uno con la MISMA función que lo generaría de
  // verdad (`buildClassSchedule`, del ciclo 009). Dos algoritmos distintos
  // para el mismo cronograma es garantía de que un día no coincidan.
  const motivo = cannotGenerateReason(cohort);
  const plan = cohort.endDate
    ? buildClassSchedule(
        cohort.startDate,
        cohort.endDate,
        cohort.daysOfWeek,
        hoursFromTimes(cohort.startTime, cohort.endTime)
      )
    : [];

  return {
    cohortId,
    projected: true,
    cannotGenerateReason: motivo,
    timezone: org.timezone,
    classes: plan.map((p) =>
      buildClassRow({
        id: null,
        number: p.number,
        projected: true,
        date: p.date,
        startTime: cohort.startTime,
        endTime: cohort.endTime,
        topic: null,
        canceledAt: null,
        cancelReason: null,
        meetingUrl: null,
        recordingUrl: null,
        ...comun,
      })
    ),
  };
}
