import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  classInstant,
  meetingLinkVisible,
  type MeetingWindow,
} from "@/lib/schedule-time";
import {
  buildClassSchedule,
  CAMADA_CON_MODULOS_SIN_CLASES,
  hoursFromTimes,
} from "@/server/attendance";
import { listarModulos } from "@/server/program-modules";
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

/**
 * 025 — La fila como la ve QUIEN ADMINISTRA la clase, con el enlace CRUDO.
 *
 * `meetingUrl` de `ClassRowDto` ya viene resuelto y recortado por la ventana
 * horaria: sirve para entrar, no para editar. Quien carga el enlace necesita
 * ver el que hay guardado aunque falten seis días para la clase, y necesita
 * distinguir "esta clase tiene enlace propio" de "está heredando el de la
 * cohorte" — porque borrar uno u otro no es lo mismo.
 *
 * Va aparte y no dentro de `buildClassRow` a propósito: esa función también
 * arma las filas del ALUMNO, y ahí el enlace crudo sería exactamente el dato
 * que la ventana existe para no mostrar.
 */
export type StaffClassRowDto = ClassRowDto & {
  /** Enlace propio de ESTA clase. `null` = hereda el de la cohorte. */
  ownMeetingUrl: string | null;
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
  classes: StaffClassRowDto[];
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
  /**
   * 028 (DV-009) — ¿Es la camada de una especialización? Se pregunta por la
   * presencia de módulos (FR-033) y se contesta antes que nada: aunque la
   * camada tenga fechas y días cargados, sigue sin poder tener clases propias.
   */
  tieneModulos?: boolean;
}): string | null {
  if (cohort.tieneModulos) return CAMADA_CON_MODULOS_SIN_CLASES;
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
   * 025 (FR-004) — La cadena vive en `resolveMeetingUrl`, un solo lugar:
   * enlace de la CLASE → enlace de la COHORTE. El aula NO participa: es la
   * cuenta de Zoom, y su PMI lo comparten todas las cohortes que la usan.
   */
  const enlace = resolveMeetingUrl({
    classMeetingUrl: input.meetingUrl,
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
      /**
       * 028 (DV-009) — Viaja en la consulta que ya traía TODAS las cohortes,
       * así que quiénes son camadas de especialización se deduce del mismo
       * resultado, sin una lectura más.
       */
      parentCohortId: schema.cohort.parentCohortId,
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

  /**
   * 028 (DV-009) — Las camadas que tienen módulos. Sus clases son las de sus
   * módulos, así que NO se les dibuja proyección: un dibujo colgado del padre
   * no pertenece a ningún módulo y aparecería en el calendario duplicando lo
   * que los módulos ya muestran, sin que nadie pueda decir de cuál es.
   *
   * Lo que sí se sigue mostrando son sus clases REALES, si alguna quedó
   * cargada: esconder una fila que existe es peor que mostrarla mal ubicada.
   */
  const madres = new Set(
    cohorts.map((c) => c.parentCohortId).filter((id): id is string => id !== null)
  );

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
    if (madres.has(c.id)) continue;
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


  const window: MeetingWindow = { beforeMin: org.before, afterMin: org.after };
  const comun = {
    cohortMeetingUrl: cohort.meetingUrl,
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
      classes: sessions.map((s) => ({
        ...buildClassRow({
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
          recordingUrl: s.recordingUrl,
          ...comun,
        }),
        ownMeetingUrl: s.meetingUrl,
      })),
    };
  }

  /**
   * 028 (DV-009) — Recién acá se pregunta si la cohorte tiene módulos.
   *
   * Una camada de especialización no tiene clases propias, así que nunca
   * llega con `sessions.length > 0` y la pregunta sólo hace falta en la rama
   * que dibuja: así la consulta extra no la paga la cohorte que ya tiene su
   * cronograma generado, que es a lo que tienden las 33 simples.
   */
  const modulos = await listarModulos(organizationId, cohortId);

  // Sin cronograma: se dibuja uno con la MISMA función que lo generaría de
  // verdad (`buildClassSchedule`, del ciclo 009). Dos algoritmos distintos
  // para el mismo cronograma es garantía de que un día no coincidan.
  const motivo = cannotGenerateReason({ ...cohort, tieneModulos: modulos.length > 0 });
  const plan = cohort.endDate && modulos.length === 0
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
    classes: plan.map((p) => ({
      ...buildClassRow({
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
      }),
      // Una proyección no es una clase: no hay fila a la cual cargarle enlace.
      ownMeetingUrl: null,
    })),
  };
}

/* ============================================================
 * 028 (FR-030, DV-009) — Las clases de una ESPECIALIZACIÓN
 * ============================================================ */

export type ProgramModuleClassesDto = {
  cohortId: string;
  name: string | null;
  /** El orden que decidió la academia (FR-002), no la fecha de inicio. */
  position: number | null;
  /** `true` si ninguna fila es real: el módulo todavía no tiene cronograma. */
  projected: boolean;
  cannotGenerateReason: string | null;
  classes: StaffClassRowDto[];
};

export type ProgramClassesDto = {
  /** La camada padre. Ella misma no aporta ninguna clase (DV-009). */
  cohortId: string;
  timezone: string;
  modules: ProgramModuleClassesDto[];
};

/**
 * Las clases de una especialización SON las clases de sus módulos, en el orden
 * de `position`.
 *
 * La camada padre no aporta ninguna: una clase colgada de ella no pertenece a
 * ningún módulo y rompe la pregunta "¿de qué módulo es esta clase?" (DV-009).
 * Por eso esta función no lee `class_session` del padre — no las filtra
 * después, directamente no las pide.
 *
 * Un módulo sin cronograma **se muestra igual**, proyectado y declarando que
 * todavía no tiene clases (US3). Ocultarlo es exactamente de donde salieron
 * los 0 `class_session` de las 9 camadas de programa: un módulo invisible es
 * un módulo que nadie carga.
 *
 * Tres consultas y no una por módulo: organización, módulos y las clases de
 * todos ellos de una vez. Y **ninguna fecha se compone acá**: `buildClassRow`
 * sigue siendo el único que llama a `classInstant()`, igual que en la lista de
 * una cohorte suelta.
 */
export async function listProgramClasses(
  organizationId: string,
  parentCohortId: string,
  now: Date = new Date()
): Promise<ProgramClassesDto | null> {
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

  const modulos = await listarModulos(organizationId, parentCohortId);
  if (modulos.length === 0) {
    return { cohortId: parentCohortId, timezone: org.timezone, modules: [] };
  }

  const sessions = await db
    .select()
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        inArray(
          schema.classSession.cohortId,
          modulos.map((m) => m.id)
        )
      )
    )
    .orderBy(asc(schema.classSession.number));

  const window: MeetingWindow = { beforeMin: org.before, afterMin: org.after };

  return {
    cohortId: parentCohortId,
    timezone: org.timezone,
    modules: modulos.map((m) => {
      const propias = sessions.filter((s) => s.cohortId === m.id);
      const comun = {
        cohortMeetingUrl: m.meetingUrl,
        timezone: org.timezone,
        window,
        now,
      };

      if (propias.length > 0) {
        return {
          cohortId: m.id,
          name: m.name,
          position: m.position,
          projected: false,
          cannotGenerateReason: null,
          classes: propias.map((s) => ({
            ...buildClassRow({
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
              recordingUrl: s.recordingUrl,
              ...comun,
            }),
            ownMeetingUrl: s.meetingUrl,
          })),
        };
      }

      // Un módulo ES una cohorte: se dibuja con la misma función de siempre.
      const plan = m.endDate
        ? buildClassSchedule(
            m.startDate,
            m.endDate,
            m.daysOfWeek,
            hoursFromTimes(m.startTime, m.endTime)
          )
        : [];

      return {
        cohortId: m.id,
        name: m.name,
        position: m.position,
        projected: true,
        cannotGenerateReason: cannotGenerateReason(m),
        classes: plan.map((p) => ({
          ...buildClassRow({
            id: null,
            number: p.number,
            projected: true,
            date: p.date,
            startTime: m.startTime,
            endTime: m.endTime,
            topic: null,
            canceledAt: null,
            cancelReason: null,
            meetingUrl: null,
            recordingUrl: null,
            ...comun,
          }),
          ownMeetingUrl: null,
        })),
      };
    }),
  };
}
