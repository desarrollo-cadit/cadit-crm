/**
 * 033 — Talleres: las reglas, sin base de datos.
 *
 * Un taller es un curso de tipo `taller` (032), cada edición es una cohorte y
 * cada persona anotada es una inscripción. Lo que se decide —si alguien se
 * puede anotar, si un cambio de estado vale, qué cuota nace, qué ve la web y
 * a quién se le recuerda— vive acá, puro, para probarlo sin levantar nada.
 * La lectura y la escritura están en `src/server/workshops.ts`.
 */

import type { Currency } from "@/lib/db/schema";
import { classEndsAt, classInstant, conZona, wallClockInZone } from "@/lib/schedule-time";
import {
  WORKSHOP_ATTENDEE_STATUSES,
  type WorkshopAttendeeStatus,
  type WorkshopModality,
  type WorkshopRegistrationStatus,
} from "@/lib/workshop-states";

export * from "@/lib/workshop-states";

export const WORKSHOP_ATTENDEE_LABEL: Record<WorkshopAttendeeStatus, string> = {
  anotado: "Anotado",
  confirmado: "Confirmado",
  asistio: "Asistió",
  no_asistio: "No asistió",
  cancelado: "Cancelado",
};

export const WORKSHOP_REGISTRATION_LABEL: Record<WorkshopRegistrationStatus, string> = {
  abierta: "Abierta",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export const WORKSHOP_MODALITY_LABEL: Record<WorkshopModality, string> = {
  online: "Online",
  presencial: "Presencial",
};

/* ============================================================
 * Cupo
 * ============================================================ */

/** 033 (FR-010) — Las canceladas no ocupan lugar; todo lo demás sí. */
export function ocupaLugar(status: WorkshopAttendeeStatus): boolean {
  return status !== "cancelado";
}

/** 033 (FR-013) — Lugares que quedan. `null` = sin cupo definido (ilimitado). */
export function lugaresDisponibles(capacity: number | null, ocupados: number): number | null {
  if (capacity === null) return null;
  return Math.max(0, capacity - ocupados);
}

function hayLugar(capacity: number | null, ocupados: number): boolean {
  const libres = lugaresDisponibles(capacity, ocupados);
  return libres === null || libres > 0;
}

/** 033 (FR-013) — Cuántos hay en cada estado, con los cinco siempre presentes. */
export function contarPorEstado(
  statuses: readonly WorkshopAttendeeStatus[]
): Record<WorkshopAttendeeStatus, number> {
  const out = Object.fromEntries(WORKSHOP_ATTENDEE_STATUSES.map((s) => [s, 0])) as Record<
    WorkshopAttendeeStatus,
    number
  >;
  for (const s of statuses) out[s] += 1;
  return out;
}

/* ============================================================
 * El tiempo de una edición
 * ============================================================ */

/**
 * 033 (FR-009) — El instante en que empieza el taller, que es también el
 * cierre de la inscripción: un taller que ya empezó está "realizado".
 *
 * Sin hora cargada, el fin de ESE día en la academia: decir "ya empezó" a
 * las 00:00 cerraría la inscripción la mañana del taller sin que nadie lo
 * decidiera. La fecha se compone en la zona de la organización con
 * `classInstant()`, el único lugar que lo hace (ciclo 013).
 */
export function inicioDelTaller(
  e: { startDate: Date; startTime: string | null },
  timeZone: string
): Date {
  return classInstant(e.startDate, e.startTime, timeZone) ?? classEndsAt(e.startDate, null, timeZone);
}

/* ============================================================
 * Inscripción
 * ============================================================ */

export type CodigoDeRechazo =
  | "inscripciones_cerradas"
  | "taller_cancelado"
  | "taller_realizado"
  | "sin_lugares";

/** 033 (FR-009) — Lo que la web le puede mostrar a quien no pudo anotarse. */
export const MENSAJE_DE_RECHAZO: Record<CodigoDeRechazo, string> = {
  inscripciones_cerradas: "Las inscripciones para este taller están cerradas.",
  taller_cancelado: "Este taller fue cancelado.",
  taller_realizado: "Este taller ya se realizó.",
  sin_lugares: "No quedan lugares para este taller.",
};

export type DecisionDeInscripcion =
  | { ok: true; accion: "crear" | "existente" | "reactivar" }
  | { ok: false; code: CodigoDeRechazo; message: string };

function rechazo(code: CodigoDeRechazo): DecisionDeInscripcion {
  return { ok: false, code, message: MENSAJE_DE_RECHAZO[code] };
}

/**
 * 033 (FR-008/FR-009/FR-010) — ¿Se puede anotar esta persona?
 *
 * Quien YA está anotado recibe éxito antes de cualquier otra pregunta: un
 * reenvío del formulario es la misma inscripción, y contestarle "no quedan
 * lugares" porque el lugar lo ocupa ella misma sería mentirle. Quien había
 * cancelado vuelve como nueva: necesita un lugar libre.
 *
 * `registrationStatus` null (una cohorte sin estado de inscripción) se trata
 * como cerrada: abrir es una decisión explícita.
 */
export function decidirInscripcion(input: {
  registrationStatus: WorkshopRegistrationStatus | null;
  empezo: boolean;
  capacity: number | null;
  ocupados: number;
  existente: WorkshopAttendeeStatus | null;
}): DecisionDeInscripcion {
  if (input.existente && input.existente !== "cancelado") {
    return { ok: true, accion: "existente" };
  }
  if (input.registrationStatus === "cancelada") return rechazo("taller_cancelado");
  if (input.registrationStatus !== "abierta") return rechazo("inscripciones_cerradas");
  if (input.empezo) return rechazo("taller_realizado");
  if (!hayLugar(input.capacity, input.ocupados)) return rechazo("sin_lugares");
  return { ok: true, accion: input.existente === "cancelado" ? "reactivar" : "crear" };
}

export type DecisionDeCambio =
  | { ok: true }
  | { ok: false; code: "taller_no_realizado" | "sin_lugares"; message: string };

/**
 * 033 (FR-012) — ¿Vale este cambio de estado?
 *
 * La coordinación mueve libremente entre los cinco estados con dos topes:
 * *Asistió* / *No asistió* recién cuando el taller empezó (antes no hay
 * asistencia que registrar), y volver de *Cancelado* necesita un lugar libre:
 * si no, el cupo se superaría por la puerta de atrás (SC-005).
 */
export function validarCambioDeEstado(input: {
  actual: WorkshopAttendeeStatus;
  nuevo: WorkshopAttendeeStatus;
  empezo: boolean;
  capacity: number | null;
  ocupados: number;
}): DecisionDeCambio {
  if ((input.nuevo === "asistio" || input.nuevo === "no_asistio") && !input.empezo) {
    return {
      ok: false,
      code: "taller_no_realizado",
      message: "La asistencia se marca cuando el taller ya empezó.",
    };
  }
  if (!ocupaLugar(input.actual) && ocupaLugar(input.nuevo)) {
    if (!hayLugar(input.capacity, input.ocupados)) {
      return { ok: false, code: "sin_lugares", message: MENSAJE_DE_RECHAZO.sin_lugares };
    }
  }
  return { ok: true };
}

/* ============================================================
 * Cobro
 * ============================================================ */

/**
 * 033 (FR-015/FR-017) — La cuota única de una inscripción a taller.
 *
 * Gratuito (sin costo o costo 0): ninguna, y por lo tanto nada en Cobranza.
 * Con costo: UNA cuota por el costo vigente al anotarse, en la moneda del
 * taller, que **vence el día del taller**: es cuando la academia espera
 * cobrarlo, y una cuota que venciera al anotarse aparecería como morosa al
 * día siguiente de una inscripción por la web. Si alguien se carga a mano
 * después del taller, vence al anotarse — una cuota que nace vencida en el
 * pasado no explica nada.
 */
export function cuotaDeTaller(input: {
  cost: number | null;
  currency: Currency;
  signupAt: Date;
  workshopDay: Date;
}): { amount: number; currency: Currency; dueDate: Date } | null {
  if (input.cost === null || input.cost <= 0) return null;
  const dueDate =
    input.signupAt.getTime() > input.workshopDay.getTime() ? input.signupAt : input.workshopDay;
  return { amount: input.cost, currency: input.currency, dueDate };
}

export type EstadoDePago = "gratuito" | "pagado" | "pendiente" | "sin_saldo";

export const ESTADO_DE_PAGO_LABEL: Record<EstadoDePago, string> = {
  gratuito: "Gratuito",
  pagado: "Pagó",
  pendiente: "Pendiente",
  sin_saldo: "Sin saldo",
};

/**
 * 033 (FR-011) — Si pagó. `adeudado` es la suma de las cuotas vigentes y
 * `pagado` la de los pagos no anulados: los mismos números de Cobranza.
 * `sin_saldo` es el inscripto con costo cuya cuota se anuló al cancelar sin
 * haber pagado: no debe nada, pero tampoco "pagó".
 */
export function estadoDePago(input: {
  pactado: number | null;
  adeudado: number;
  pagado: number;
}): EstadoDePago {
  if (input.pactado === null || input.pactado <= 0) return "gratuito";
  if (input.adeudado <= 0) return input.pagado > 0 ? "pagado" : "sin_saldo";
  return input.pagado >= input.adeudado ? "pagado" : "pendiente";
}

/**
 * 033 (FR-018) — Al cancelar, la cuota se anula SOLO si no tiene pagos: lo
 * que nunca se pagó deja de figurar como deuda en Cobranza. Si ya pagó, la
 * cuota y el pago quedan como están, y la devolución, si la hay, se gestiona
 * como en cualquier otra inscripción. Un pago nunca se borra.
 */
export function cuotaSeAnulaAlCancelar(input: { pagado: number }): boolean {
  return input.pagado <= 0;
}

/* ============================================================
 * La web
 * ============================================================ */

/** Lo que el servidor lee de una edición para publicarla. */
export type EdicionPublicable = {
  id: string;
  courseId: string;
  slug: string;
  courseName: string;
  cohortName: string | null;
  description: string | null;
  tagline: string | null;
  imageUrl: string | null;
  startDate: Date;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  modality: WorkshopModality | null;
  classroom: string | null;
  /** Viaja HASTA acá y no más: `toPublicWorkshop` no lo copia (FR-005). */
  meetingUrl: string | null;
  cost: number | null;
  currency: Currency;
  capacity: number | null;
  registrationStatus: WorkshopRegistrationStatus | null;
  ocupados: number;
};

export type PublicWorkshopDto = {
  id: string;
  courseId: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string | null;
  imageUrl: string | null;
  startsAt: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  modality: WorkshopModality | null;
  /** El lugar de un presencial; `null` en un online (la web muestra "Online"). */
  location: string | null;
  isFree: boolean;
  price: number | null;
  currency: Currency | null;
  /** `null` = sin cupo definido. */
  seatsLeft: number | null;
  hasSeats: boolean;
};

/**
 * 033 (FR-005) — La edición tal como la ve la web.
 *
 * Se arma campo por campo, nunca con un spread de la fila: el enlace de la
 * reunión llega hasta acá (lo necesita el recordatorio) y un `...row` lo
 * publicaría en el sitio. Tampoco viaja nada de los inscriptos: solo cuántos
 * lugares quedan.
 */
export function toPublicWorkshop(e: EdicionPublicable, timeZone: string): PublicWorkshopDto {
  const libres = lugaresDisponibles(e.capacity, e.ocupados);
  const gratuito = e.cost === null || e.cost <= 0;
  return {
    id: e.id,
    courseId: e.courseId,
    slug: e.slug,
    name: e.cohortName ?? e.courseName,
    description: e.description,
    tagline: e.tagline,
    imageUrl: e.imageUrl,
    startsAt: inicioDelTaller(e, timeZone).toISOString(),
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString() ?? null,
    startTime: e.startTime,
    endTime: e.endTime,
    modality: e.modality,
    location: e.modality === "presencial" ? e.classroom : null,
    isFree: gratuito,
    price: gratuito ? null : e.cost,
    currency: gratuito ? null : e.currency,
    seatsLeft: libres,
    hasSeats: libres === null || libres > 0,
  };
}

/* ============================================================
 * El listado del staff
 * ============================================================ */

/**
 * 033 (US5) — Los próximos arriba, por fecha; los realizados abajo, el más
 * reciente primero. Es el orden en que la coordinación los busca: lo que
 * viene, y después lo último que pasó.
 */
export function ordenarEdiciones<T extends { startsAt: Date }>(ediciones: readonly T[], now: Date): T[] {
  const t = now.getTime();
  const proximas = ediciones
    .filter((e) => e.startsAt.getTime() >= t)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const pasadas = ediciones
    .filter((e) => e.startsAt.getTime() < t)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return [...proximas, ...pasadas];
}

/* ============================================================
 * Avisos por WhatsApp (P2)
 * ============================================================ */

/**
 * 033 (FR-019) — Decisión del dueño (2026-10-15): por ahora los talleres no
 * mandan WhatsApp. La confirmación al anotarse se enciende a propósito con
 * `WORKSHOP_CONFIRMATION_ENABLED=true`; cualquier otro valor la deja apagada,
 * igual que el recordatorio con `WORKSHOP_REMINDER_INTERVAL_MIN=0`.
 */
export function confirmacionDeTallerEncendida(value: string | undefined): boolean {
  return value === "true";
}

/**
 * 033 (FR-020) — La hora de la academia desde la que sale el recordatorio
 * del día anterior. A media mañana: ni de madrugada ni sobre la hora.
 */
export const HORA_DEL_RECORDATORIO = 10;

/** El día (`AAAA-MM-DD`) anterior a `day`, leyendo `day` en UTC como se guarda. */
function diaAnterior(day: Date): string {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * 033 (FR-020) — A quién se le manda el recordatorio AHORA.
 *
 * Solo a *Confirmados*, solo una vez (`reminderSentAt`), solo con teléfono,
 * solo el día anterior al taller desde `HORA_DEL_RECORDATORIO` en la zona de
 * la academia, y nunca en un taller cancelado. Un *Anotado* sin confirmar no
 * lo recibe: el recordatorio es para quien dijo que viene.
 */
export function seleccionarRecordatorios(
  edicion: { startDate: Date; registrationStatus: WorkshopRegistrationStatus | null },
  inscriptos: readonly {
    id: string;
    status: WorkshopAttendeeStatus;
    reminderSentAt: Date | null;
    hasPhone: boolean;
  }[],
  now: Date,
  timeZone: string
): string[] {
  if (edicion.registrationStatus === "cancelada") return [];
  const reloj = wallClockInZone(now, timeZone);
  if (!reloj) return [];
  if (reloj.fecha !== diaAnterior(edicion.startDate)) return [];
  if (Number(reloj.hora.slice(0, 2)) < HORA_DEL_RECORDATORIO) return [];
  return inscriptos
    .filter((r) => r.status === "confirmado" && r.reminderSentAt === null && r.hasPhone)
    .map((r) => r.id);
}

type DatosDelAviso = {
  nombre: string;
  edicion: Pick<
    EdicionPublicable,
    | "courseName"
    | "cohortName"
    | "startDate"
    | "startTime"
    | "endTime"
    | "modality"
    | "classroom"
    | "meetingUrl"
  >;
};

/** "sábado 7 de noviembre" — el día se guarda a medianoche UTC y se lee en UTC. */
function fechaEnPalabras(day: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);
}

function cuandoYDonde(e: DatosDelAviso["edicion"], timeZone: string): string {
  // La hora es de pared en la academia y se dice de qué zona: hay alumnos en
  // Dominicana y en España, y un "a las 15:00" suelto lo lee cada uno en su reloj.
  const hora = e.startTime ? ` a las ${conZona(e.startTime, timeZone)}` : "";
  const modalidad =
    e.modality === "presencial"
      ? `Presencial${e.classroom ? ` (${e.classroom})` : ""}`
      : e.modality === "online"
        ? "Online"
        : "";
  return `${fechaEnPalabras(e.startDate)}${hora}${modalidad ? ` · ${modalidad}` : ""}`;
}

/**
 * 033 (FR-019) — La confirmación. Sin el enlace de la reunión: ese sale en el
 * recordatorio, que es el que se manda a quien confirmó.
 */
export function textoConfirmacion(d: DatosDelAviso, timeZone: string): string {
  const taller = d.edicion.cohortName ?? d.edicion.courseName;
  return [
    `¡Hola ${d.nombre}! Quedaste anotado/a en el taller "${taller}".`,
    `📅 ${cuandoYDonde(d.edicion, timeZone)}`,
    "Te vamos a escribir para confirmar tu lugar.",
  ].join("\n");
}

/** 033 (FR-020) — El recordatorio del día anterior; con el enlace si es online. */
export function textoRecordatorio(d: DatosDelAviso, timeZone: string): string {
  const taller = d.edicion.cohortName ?? d.edicion.courseName;
  const lineas = [
    `¡Hola ${d.nombre}! Te recordamos que mañana es el taller "${taller}".`,
    `📅 ${cuandoYDonde(d.edicion, timeZone)}`,
  ];
  if (d.edicion.modality === "online" && d.edicion.meetingUrl) {
    lineas.push(`Enlace para entrar: ${d.edicion.meetingUrl}`);
  }
  if (d.edicion.modality === "presencial" && d.edicion.classroom) {
    lineas.push(`Te esperamos en ${d.edicion.classroom}.`);
  }
  return lineas.join("\n");
}

export type TipoDeAviso = "confirmacion" | "recordatorio";

/**
 * 033 (US4) — El nombre de la plantilla aprobada de cada aviso. Fuera de la
 * ventana de 24 h WhatsApp solo deja mandar una plantilla aprobada por Meta;
 * la academia la crea en Ajustes → Plantillas con ESTE nombre y, si quiere los
 * datos del taller, con una variable `{{1}}`.
 */
export const PLANTILLA_DEL_AVISO: Record<TipoDeAviso, string> = {
  confirmacion: "taller_confirmacion",
  recordatorio: "taller_recordatorio",
};

export type CanalDelAviso =
  | { via: "texto" }
  | { via: "plantilla" }
  | { via: "ninguno"; motivo: string };

/**
 * 033 (FR-019/FR-020) — Por dónde sale un aviso, o por qué no sale.
 *
 * Nunca bloquea la inscripción: el motivo queda en `last_notify_error` y la
 * lista del taller lo muestra.
 */
export function canalDelAviso(input: {
  hasPhone: boolean;
  connected: boolean;
  windowOpen: boolean;
  templateApproved: boolean;
}): CanalDelAviso {
  if (!input.hasPhone) return { via: "ninguno", motivo: "No enviado: el contacto no tiene teléfono." };
  if (!input.connected) {
    return { via: "ninguno", motivo: "No enviado: WhatsApp no está conectado." };
  }
  if (input.windowOpen) return { via: "texto" };
  if (input.templateApproved) return { via: "plantilla" };
  return { via: "ninguno", motivo: "No enviado: sin plantilla aprobada para este aviso." };
}

/**
 * 033 (US4) — El valor de `{{1}}` de la plantilla: los datos del taller en UNA
 * línea, porque WhatsApp rechaza saltos de línea en una variable. El
 * recordatorio de un online suma el enlace; la confirmación nunca.
 */
export function variableDelAviso(
  tipo: TipoDeAviso,
  edicion: DatosDelAviso["edicion"],
  timeZone: string
): string {
  const taller = edicion.cohortName ?? edicion.courseName;
  const partes = [`${taller}, ${cuandoYDonde(edicion, timeZone)}`];
  if (tipo === "recordatorio" && edicion.modality === "online" && edicion.meetingUrl) {
    partes.push(`enlace: ${edicion.meetingUrl}`);
  }
  return partes.join(" · ").replace(/\s*\n\s*/g, " ");
}
