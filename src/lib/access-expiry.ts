import { classEndsAt, wallClockInZone } from "@/lib/schedule-time";

/**
 * 043 — Vencimiento de accesos: las reglas, puras.
 *
 * Un mes calendario después de que la cohorte termina, el alumno deja de ver
 * lo que la cohorte le daba para CURSAR (grabaciones, material, avisos,
 * enlaces de clase y los cursos offline que le llegaron por ella). Lo que
 * dice qué LOGRÓ (notas, asistencia, certificados, escolaridad, legajo) se
 * queda para siempre.
 *
 * **Todo se deriva al leer.** No hay una columna "vencido" ni un proceso que
 * revoque: el corte sale de comparar fechas con el reloj, así que no hay nada
 * que pueda olvidarse de correr ni que quede desincronizado.
 *
 * Las fechas son de CALENDARIO (`"2026-11-14"`). Las columnas que guardan un
 * día (`cohort.end_date`, `class_session.date`, `enrollment.access_until`)
 * lo guardan como medianoche UTC, igual que en 013: el día se lee con los
 * componentes UTC y la zona de la academia entra recién para decidir CUÁNDO
 * termina ese día (`accesoTerminaEn`, vía `classEndsAt`).
 */

/** Cuántos meses calendario dura el acceso después del fin de la cohorte. */
export const MESES_DE_ACCESO = 1;

/** Desde cuántos días antes del corte el alumno ve "Tenés acceso hasta el …". */
export const DIAS_DE_AVISO = 31;

const DIA_MS = 86_400_000;
const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** El día de calendario que guarda un timestamp de "día" (componentes UTC). */
export function diaCalendario(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `"2026-02-30"` no es un día; `"2028-02-29"` sí. */
export function esDiaValido(ymd: string): boolean {
  const m = RE_DIA.exec(ymd);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return diaCalendario(d) === ymd;
}

/** El día como timestamp de "día" (medianoche UTC), para guardarlo. */
export function diaComoFecha(ymd: string): Date {
  const m = RE_DIA.exec(ymd);
  if (!m) throw new Error(`Día inválido: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/**
 * N meses calendario después, recortado al último día del mes: el 31 de enero
 * más un mes es el 28 (o 29) de febrero, nunca el 3 de marzo.
 */
export function sumarMeses(ymd: string, n: number): string {
  const base = diaComoFecha(ymd);
  const y = base.getUTCFullYear();
  const mes = base.getUTCMonth() + n;
  const ultimoDelMes = new Date(Date.UTC(y, mes + 1, 0)).getUTCDate();
  const d = Math.min(base.getUTCDate(), ultimoDelMes);
  return diaCalendario(new Date(Date.UTC(y, mes, d)));
}

/** El día más tarde; `null` si no hay ninguno. Los `YYYY-MM-DD` se ordenan como texto. */
export function maxDia(dias: Array<string | null>): string | null {
  let max: string | null = null;
  for (const d of dias) if (d !== null && (max === null || d > max)) max = d;
  return max;
}

/** Hoy, en la pared de la academia. Zona inválida → el día UTC. */
export function hoyEnZona(now: Date, timeZone: string): string {
  return wallClockInZone(now, timeZone)?.fecha ?? diaCalendario(now);
}

/** "14 de noviembre de 2026". Se formatea en UTC: es un día, no un instante. */
export function formatearDia(ymd: string): string {
  if (!esDiaValido(ymd)) return ymd;
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(diaComoFecha(ymd));
}

/* ============================================================
 * La fecha de referencia: cuándo terminó la cursada
 * ============================================================ */

export type CohorteFechas = {
  id: string;
  /** `cohort.end_date`. */
  endDate: Date | null;
  /** La última `class_session.date` NO cancelada de la cohorte. */
  lastClassDate: Date | null;
};

/** `end_date`; sin ella, la última clase no cancelada; sin ninguna, `null`. */
export function referenciaDeCohorte(c: CohorteFechas): string | null {
  if (c.endDate) return diaCalendario(c.endDate);
  if (c.lastClassDate) return diaCalendario(c.lastClassDate);
  return null;
}

export type RecorridoFechas = {
  /** La cohorte de la inscripción (madre o simple). */
  cohorte: CohorteFechas | null;
  /** La cohorte es una especialización (o tiene módulos colgando). */
  esPrograma: boolean;
  /**
   * Los módulos del recorrido: los del programa y las cohortes de las
   * inscripciones hijas (una recursada puede ser de otra camada).
   */
  modulos: CohorteFechas[];
};

/**
 * Cuándo terminó la cursada.
 *
 * - Cursada simple: la referencia de su cohorte.
 * - Especialización (028/034): el programa termina cuando termina su ÚLTIMO
 *   módulo — quien está en el módulo 3 no pierde las grabaciones del 1. La
 *   fecha declarada en la madre cuenta si es posterior. Si algún módulo no
 *   tiene fecha (ni fin ni clases), el programa no tiene fin calculable y el
 *   acceso no vence: cortar con la fecha de los módulos que sí la tienen le
 *   quitaría el material a alguien que todavía está cursando.
 */
export function referenciaDeRecorrido(r: RecorridoFechas): string | null {
  const propia = r.cohorte ? referenciaDeCohorte(r.cohorte) : null;
  if (!r.esPrograma || r.modulos.length === 0) return propia;
  const deModulos = r.modulos.map(referenciaDeCohorte);
  if (deModulos.some((d) => d === null)) return null;
  return maxDia([...deModulos, propia]);
}

/* ============================================================
 * El estado
 * ============================================================ */

/**
 * - `calculado`: un mes después de la referencia.
 * - `manual`: alguien del staff fijó la fecha (más tarde o más temprano).
 * - `sin_fecha`: no hay referencia ni fecha manual: no vence.
 */
export type OrigenDeAcceso = "calculado" | "manual" | "sin_fecha";

export type EstadoDeAcceso = {
  /** Último día con acceso (inclusive). `null` = no vence. */
  hasta: string | null;
  /** Lo que diría la regla sin la fecha manual. `null` = sin referencia. */
  calculada: string | null;
  /** Cuándo terminó la cursada. */
  referencia: string | null;
  origen: OrigenDeAcceso;
  vencido: boolean;
  /** Instante del corte (fin del día `hasta` en la zona de la academia), ISO. */
  terminaEn: string | null;
};

/** El instante en que termina el día límite, en la zona de la academia. */
export function accesoTerminaEn(hasta: string, timeZone: string): Date {
  return classEndsAt(diaComoFecha(hasta), null, timeZone);
}

export function estadoDeAcceso(
  input: { referencia: string | null; override: string | null },
  now: Date,
  timeZone: string
): EstadoDeAcceso {
  const calculada = input.referencia ? sumarMeses(input.referencia, MESES_DE_ACCESO) : null;
  const hasta = input.override ?? calculada;
  const origen: OrigenDeAcceso = input.override ? "manual" : calculada ? "calculado" : "sin_fecha";
  const fin = hasta ? accesoTerminaEn(hasta, timeZone) : null;
  return {
    hasta,
    calculada,
    referencia: input.referencia,
    origen,
    vencido: fin !== null && now.getTime() >= fin.getTime(),
    terminaEn: fin?.toISOString() ?? null,
  };
}

export type AvisoDeAcceso = { tipo: "hasta" | "finalizado"; hasta: string };

/**
 * Lo que el alumno lee: "Acceso finalizado el …" una vez vencido, y
 * "Tenés acceso hasta el …" en los últimos `DIAS_DE_AVISO` días (con el
 * cálculo de un mes, es todo el período posterior al fin del curso). Fuera
 * de eso, nada: un cartel con una fecha lejana es ruido.
 */
export function avisoDeAcceso(
  estado: Pick<EstadoDeAcceso, "hasta" | "vencido" | "terminaEn">,
  now: Date
): AvisoDeAcceso | null {
  if (!estado.hasta || !estado.terminaEn) return null;
  if (estado.vencido) return { tipo: "finalizado", hasta: estado.hasta };
  const faltan = (new Date(estado.terminaEn).getTime() - now.getTime()) / DIA_MS;
  return faltan <= DIAS_DE_AVISO ? { tipo: "hasta", hasta: estado.hasta } : null;
}
