import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { classInstant } from "@/lib/schedule-time";

/**
 * 023 — Aulas virtuales y choques de horario.
 *
 * La academia dicta con cinco cuentas de Zoom. Este módulo las convierte en
 * filas para poder responder cuatro preguntas que hoy se contestan de memoria:
 * qué aula usa esta clase, quién está en cada aula, si se pisan, y cuántas
 * quedan libres.
 *
 * **No habla con Zoom.** Un aula es un nombre y una URL —el PMI de la cuenta—,
 * y el choque se calcula comparando rangos horarios. La integración con la API
 * (018) es otra cosa y sigue siendo opcional: si algún día llega, el aula deja
 * de ser un PMI fijo y pasa a ser el proveedor que emite la reunión, sin
 * cambiar quién la usa ni cómo se detecta el choque.
 */

/* ============================================================
 * El criterio, sin base de datos
 * ============================================================ */

/** Una clase reducida a lo único que define un choque: aula y rango real. */
export type OccupiedSlot = {
  classSessionId: string;
  cohortId: string;
  virtualRoomId: string;
  /** Instantes REALES, ya resueltos en la zona de la academia. */
  startsAt: Date;
  endsAt: Date;
};

export type RoomClash = {
  roomId: string;
  a: { classSessionId: string; cohortId: string; startsAt: string; endsAt: string };
  b: { classSessionId: string; cohortId: string; startsAt: string; endsAt: string };
};

/**
 * 023 (FR-005, DV-003) — Los choques dentro de un conjunto de clases.
 *
 * Pura a propósito: es la regla que la pantalla necesita ANTES de guardar, y
 * se prueba sin base.
 *
 * **Dos clases pegadas NO chocan** (SC-003). Una que termina 20:30 y otra que
 * empieza 20:30 comparten un instante y nada más; reportarlas llenaría la
 * pantalla de avisos que coordinación sabe que son falsos, y un aviso que
 * siempre se ignora deja de avisar. Por eso el solapamiento es ESTRICTO:
 * `a.inicio < b.fin && b.inicio < a.fin`.
 *
 * `marginMin` existe para la academia que sí quiere colchón entre clases
 * (DV-003). El default es 0 —no inventar un margen que nadie pidió— y cuando
 * se declara, estira el final de cada clase antes de comparar.
 */
export function findClashes(
  slots: OccupiedSlot[],
  marginMin = 0
): RoomClash[] {
  const margen = Math.max(0, marginMin) * 60_000;
  const clashes: RoomClash[] = [];

  // Agrupar por aula primero: dos clases en aulas distintas no pueden chocar,
  // y comparar todo contra todo sobre 41 camadas es trabajo tirado.
  const porAula = new Map<string, OccupiedSlot[]>();
  for (const s of slots) {
    const lista = porAula.get(s.virtualRoomId) ?? [];
    lista.push(s);
    porAula.set(s.virtualRoomId, lista);
  }

  for (const [roomId, lista] of porAula) {
    const ordenadas = [...lista].sort(
      (x, y) => x.startsAt.getTime() - y.startsAt.getTime()
    );

    for (let i = 0; i < ordenadas.length; i++) {
      const a = ordenadas[i]!;
      const finA = a.endsAt.getTime() + margen;

      /**
       * Como están ordenadas por inicio, en cuanto una empieza después del
       * fin de `a` ya no puede chocar ninguna de las siguientes: se corta.
       * Sin esto, un año de cronograma en una sola aula son ~10.000
       * comparaciones por clase.
       */
      for (let j = i + 1; j < ordenadas.length; j++) {
        const b = ordenadas[j]!;
        if (b.startsAt.getTime() >= finA) break;

        clashes.push({
          roomId,
          a: {
            classSessionId: a.classSessionId,
            cohortId: a.cohortId,
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt.toISOString(),
          },
          b: {
            classSessionId: b.classSessionId,
            cohortId: b.cohortId,
            startsAt: b.startsAt.toISOString(),
            endsAt: b.endsAt.toISOString(),
          },
        });
      }
    }
  }

  return clashes;
}

/**
 * 023 (FR-004) — De dónde sale el enlace que ve el alumno, en un solo lugar.
 *
 * El orden no es arbitrario: va de lo más específico a lo más general, y el
 * último escalón existe para **no romper lo que ya funciona**. Una academia
 * que hoy tiene el enlace pegado a mano en la camada sigue andando igual
 * después de esta fase; el aula es una mejora, no un requisito.
 *
 *   enlace de la clase → aula de la clase → aula de la camada → enlace de la camada
 */
export function resolveMeetingUrl(input: {
  classMeetingUrl: string | null;
  classRoomUrl: string | null;
  cohortRoomUrl: string | null;
  cohortMeetingUrl: string | null;
}): string | null {
  return (
    input.classMeetingUrl ??
    input.classRoomUrl ??
    input.cohortRoomUrl ??
    input.cohortMeetingUrl ??
    null
  );
}

/**
 * 023 (FR-007, FR-008) — Convierte clases crudas en franjas comparables.
 *
 * Dos reglas que definen qué NO entra:
 *
 *  - Una clase **cancelada** no ocupa nada (SC-004). Bloquear un aula por una
 *    clase que no va a existir es cómo se llena la agenda de fantasmas.
 *  - Una clase **sin horario** no puede chocar: no hay rango que comparar.
 *    6 de las 41 camadas reales no tienen horario cargado, y suponerles uno
 *    sería inventar un choque o esconderlo.
 *
 * El rango se compone con `classInstant()` —nunca a mano—: el texto `"18:30"`
 * no lleva zona, y hay 87 alumnos fuera de Uruguay. Dos camadas en zonas
 * distintas que caen en el mismo INSTANTE real sí chocan, y eso solo se ve
 * comparando instantes (SC-006).
 */
export function toOccupiedSlots(
  clases: {
    id: string;
    cohortId: string;
    date: Date;
    startTime: string | null;
    endTime: string | null;
    canceledAt: Date | null;
    virtualRoomId: string | null;
    cohortVirtualRoomId: string | null;
  }[],
  timezone: string
): OccupiedSlot[] {
  const slots: OccupiedSlot[] = [];

  for (const c of clases) {
    if (c.canceledAt) continue;

    const roomId = c.virtualRoomId ?? c.cohortVirtualRoomId;
    if (!roomId) continue;

    const startsAt = classInstant(c.date, c.startTime, timezone);
    const endsAt = classInstant(c.date, c.endTime, timezone);
    if (!startsAt || !endsAt) continue;

    slots.push({
      classSessionId: c.id,
      cohortId: c.cohortId,
      virtualRoomId: roomId,
      startsAt,
      endsAt,
    });
  }

  return slots;
}

/* ============================================================
 * Operaciones sobre la base
 * ============================================================ */

export type VirtualRoomDto = {
  id: string;
  name: string;
  url: string;
  accountEmail: string | null;
  notes: string | null;
  archivedAt: string | null;
  /** Cuántas camadas la tienen asignada hoy. */
  cohortCount: number;
};

export type RoomResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

export async function listVirtualRooms(
  organizationId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<VirtualRoomDto[]> {
  const db = getDb();

  const rooms = await db
    .select()
    .from(schema.virtualRoom)
    .where(
      opts.includeArchived
        ? scoped(schema.virtualRoom.organizationId, organizationId)
        : scoped(
            schema.virtualRoom.organizationId,
            organizationId,
            isNull(schema.virtualRoom.archivedAt)
          )
    )
    .orderBy(asc(schema.virtualRoom.name));

  if (rooms.length === 0) return [];

  // Cuántas camadas usa cada una: es el dato que decide si se puede dar de
  // baja sin dejar clases sin enlace.
  const usos = await db
    .select({ virtualRoomId: schema.cohort.virtualRoomId })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId));

  const conteo = new Map<string, number>();
  for (const u of usos) {
    if (!u.virtualRoomId) continue;
    conteo.set(u.virtualRoomId, (conteo.get(u.virtualRoomId) ?? 0) + 1);
  }

  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    accountEmail: r.accountEmail,
    notes: r.notes,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    cohortCount: conteo.get(r.id) ?? 0,
  }));
}

export type VirtualRoomInput = {
  name: string;
  url: string;
  accountEmail?: string | null;
  notes?: string | null;
};

export async function createVirtualRoom(
  organizationId: string,
  input: VirtualRoomInput
): Promise<RoomResult<VirtualRoomDto>> {
  const db = getDb();

  const repetida = await db
    .select({ id: schema.virtualRoom.id })
    .from(schema.virtualRoom)
    .where(
      scoped(
        schema.virtualRoom.organizationId,
        organizationId,
        eq(schema.virtualRoom.name, input.name.trim())
      )
    )
    .limit(1);
  if (repetida.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "duplicate_name",
      message: `Ya existe un aula llamada "${input.name.trim()}"`,
    };
  }

  const [fila] = await db
    .insert(schema.virtualRoom)
    .values({
      id: newId("virtualRoom"),
      organizationId,
      name: input.name.trim(),
      url: input.url.trim(),
      accountEmail: input.accountEmail?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning();

  return {
    ok: true,
    data: {
      id: fila!.id,
      name: fila!.name,
      url: fila!.url,
      accountEmail: fila!.accountEmail,
      notes: fila!.notes,
      archivedAt: null,
      cohortCount: 0,
    },
  };
}

export async function updateVirtualRoom(
  organizationId: string,
  roomId: string,
  input: Partial<VirtualRoomInput> & { archived?: boolean }
): Promise<RoomResult<null>> {
  const db = getDb();

  const actual = await db
    .select()
    .from(schema.virtualRoom)
    .where(
      scoped(schema.virtualRoom.organizationId, organizationId, eq(schema.virtualRoom.id, roomId))
    )
    .limit(1);
  if (actual.length === 0) {
    return { ok: false, status: 404, code: "not_found", message: "Aula no encontrada" };
  }

  if (input.name !== undefined) {
    const repetida = await db
      .select({ id: schema.virtualRoom.id })
      .from(schema.virtualRoom)
      .where(
        scoped(
          schema.virtualRoom.organizationId,
          organizationId,
          and(eq(schema.virtualRoom.name, input.name.trim()), ne(schema.virtualRoom.id, roomId))
        )
      )
      .limit(1);
    if (repetida.length > 0) {
      return {
        ok: false,
        status: 409,
        code: "duplicate_name",
        message: `Ya existe un aula llamada "${input.name.trim()}"`,
      };
    }
  }

  const cambios: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) cambios.name = input.name.trim();
  if (input.url !== undefined) cambios.url = input.url.trim();
  if (input.accountEmail !== undefined) cambios.accountEmail = input.accountEmail?.trim() || null;
  if (input.notes !== undefined) cambios.notes = input.notes?.trim() || null;
  /**
   * FR-009 — La baja es LÓGICA. No se borra la fila: una clase pasada que se
   * dictó acá conserva la evidencia de dónde fue. Borrarla reescribiría esa
   * historia, igual que borrar un aviso (013).
   */
  if (input.archived !== undefined) cambios.archivedAt = input.archived ? new Date() : null;

  await db
    .update(schema.virtualRoom)
    .set(cambios)
    .where(
      scoped(schema.virtualRoom.organizationId, organizationId, eq(schema.virtualRoom.id, roomId))
    );

  return { ok: true, data: null };
}

/* ============================================================
 * Choques, contra la base
 * ============================================================ */

export type ClashRow = {
  roomId: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  otherStartsAt: string;
  otherEndsAt: string;
  cohortId: string;
  cohortName: string;
  otherCohortId: string;
  otherCohortName: string;
  classSessionId: string;
  otherClassSessionId: string;
};

/**
 * 023 (FR-005/FR-006, US3) — Los choques de toda la organización.
 *
 * `onlyCohortId` acota el resultado a los choques que INVOLUCRAN a esa camada,
 * pero el conjunto que se compara sigue siendo TODO: un choque necesita a los
 * dos lados, y mirar solo las clases de una camada no encontraría ninguno.
 *
 * Devuelve una lista, nunca lanza ni bloquea (FR-006): coordinación sabe cosas
 * que el sistema no —que esa clase se movió, que ese día es feriado—, así que
 * el choque se avisa y se decide arriba.
 */
export async function detectClashes(
  organizationId: string,
  opts: { onlyCohortId?: string } = {}
): Promise<ClashRow[]> {
  const db = getDb();

  const orgRows = await db
    .select({
      timezone: schema.organization.timezone,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const timezone = orgRows[0]?.timezone;
  if (!timezone) return [];

  const filas = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      startTime: schema.classSession.startTime,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
      virtualRoomId: schema.classSession.virtualRoomId,
      cohortVirtualRoomId: schema.cohort.virtualRoomId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.classSession.organizationId, organizationId));

  const slots = toOccupiedSlots(filas, timezone);
  const clashes = findClashes(slots);
  if (clashes.length === 0) return [];

  const rooms = await db
    .select({ id: schema.virtualRoom.id, name: schema.virtualRoom.name })
    .from(schema.virtualRoom)
    .where(scoped(schema.virtualRoom.organizationId, organizationId));

  const nombreAula = new Map(rooms.map((r) => [r.id, r.name]));
  const nombreCamada = new Map(
    filas.map((f) => [f.cohortId, f.courseName ?? f.cohortName ?? "Camada"])
  );

  const salida = clashes.map((c) => ({
    roomId: c.roomId,
    roomName: nombreAula.get(c.roomId) ?? "Aula",
    startsAt: c.a.startsAt,
    endsAt: c.a.endsAt,
    otherStartsAt: c.b.startsAt,
    otherEndsAt: c.b.endsAt,
    cohortId: c.a.cohortId,
    cohortName: nombreCamada.get(c.a.cohortId) ?? "Camada",
    otherCohortId: c.b.cohortId,
    otherCohortName: nombreCamada.get(c.b.cohortId) ?? "Camada",
    classSessionId: c.a.classSessionId,
    otherClassSessionId: c.b.classSessionId,
  }));

  if (!opts.onlyCohortId) return salida;
  return salida.filter(
    (c) => c.cohortId === opts.onlyCohortId || c.otherCohortId === opts.onlyCohortId
  );
}

/* ============================================================
 * La agenda de las aulas (US4)
 * ============================================================ */

export type RoomAgendaRow = {
  roomId: string;
  roomName: string;
  classSessionId: string;
  cohortId: string;
  cohortName: string;
  courseName: string;
  teacherName: string | null;
  startsAt: string;
  endsAt: string;
  canceled: boolean;
};

/**
 * 023 (US4, FR-011) — Quién ocupa cada aula, y cuándo.
 *
 * Incluye las CANCELADAS, marcadas: en la agenda son información —"esa clase
 * se cayó, el aula está libre"— aunque no cuenten para el choque. Es la misma
 * distinción que hace la asistencia con una clase cancelada.
 */
export async function roomAgenda(
  organizationId: string,
  desde: Date,
  hasta: Date
): Promise<RoomAgendaRow[]> {
  const db = getDb();

  const orgRows = await db
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const timezone = orgRows[0]?.timezone;
  if (!timezone) return [];

  const filas = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      startTime: schema.classSession.startTime,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
      virtualRoomId: schema.classSession.virtualRoomId,
      cohortVirtualRoomId: schema.cohort.virtualRoomId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      teacherName: schema.teacher.name,
      classTeacherName: schema.teacher.name,
    })
    .from(schema.classSession)
    .innerJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .where(scoped(schema.classSession.organizationId, organizationId));

  const rooms = await db
    .select({ id: schema.virtualRoom.id, name: schema.virtualRoom.name })
    .from(schema.virtualRoom)
    .where(scoped(schema.virtualRoom.organizationId, organizationId));
  const nombreAula = new Map(rooms.map((r) => [r.id, r.name]));

  const salida: RoomAgendaRow[] = [];

  for (const f of filas) {
    const roomId = f.virtualRoomId ?? f.cohortVirtualRoomId;
    if (!roomId) continue;

    const startsAt = classInstant(f.date, f.startTime, timezone);
    const endsAt = classInstant(f.date, f.endTime, timezone);
    if (!startsAt) continue;
    if (startsAt < desde || startsAt > hasta) continue;

    salida.push({
      roomId,
      roomName: nombreAula.get(roomId) ?? "Aula",
      classSessionId: f.id,
      cohortId: f.cohortId,
      cohortName: f.cohortName ?? f.courseName ?? "Camada",
      courseName: f.courseName ?? "—",
      teacherName: f.teacherName,
      startsAt: startsAt.toISOString(),
      endsAt: (endsAt ?? startsAt).toISOString(),
      canceled: Boolean(f.canceledAt),
    });
  }

  return salida.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
