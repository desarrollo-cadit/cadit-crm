import { classEndsAt, classHasEnded, classInstant } from "@/lib/schedule-time";

/**
 * 009 / 2026-10-21 — El porcentaje de asistencia, UNA regla para todos.
 *
 * Vive en `lib/` (puro, sin base ni reloj propio) para que la planilla del
 * staff, el legajo, el portal del alumno, el recorrido de la especialización,
 * la escolaridad, el reporte por empresa y la evaluación (que decide la
 * aprobación y el certificado) cuenten EXACTAMENTE lo mismo. `server/attendance`
 * lo reexporta, así que los llamadores viejos lo siguen encontrando ahí.
 */

export type AttendanceStatus = "presente" | "tarde" | "ausente" | "justificado";

/**
 * `tarde` cuenta como PRESENTE (DV-002): se registra para que el dato quede,
 * pero no penaliza el porcentaje. `justificado` tampoco descuenta —es una
 * ausencia con aviso—, pero SÍ sale del numerador: el alumno no estuvo.
 */
export function cuentaComoPresente(status: AttendanceStatus | null | undefined): boolean {
  return status === "presente" || status === "tarde";
}

/** La zona de la academia y "ahora": lo que decide si una clase ya se dio. */
export type RelojDeAsistencia = { timeZone: string; now: Date };

export type ClaseParaAsistencia = {
  /** `class_session.date`: medianoche UTC del día de la clase. */
  sessionDate: Date;
  /** `class_session.end_time` ("21:00"); sin horario, la clase termina con el día. */
  endTime?: string | null;
  canceled: boolean;
  /** La marca de ESTE alumno en esta clase; `null` = no tiene. */
  status: AttendanceStatus | null;
  /**
   * ¿Se TOMÓ asistencia en esta clase? = hay al menos una marca de CUALQUIER
   * alumno. Sin lista tomada, la clase no dice nada de nadie: "0% porque nadie
   * pasó lista NO es 0% porque no vino".
   */
  tomada: boolean;
};

/**
 * Qué es una columna de la planilla:
 * - `dictada`: ya TERMINÓ en la zona de la academia (`classHasEnded`, la misma
 *   regla que las horas dictadas). Solo estas cuentan para el porcentaje.
 * - `hoy`: es el día de la clase y todavía no terminó. Se puede pasar lista
 *   (el profesor la toma durante la clase), pero no cuenta hasta que termine.
 * - `futura`: todavía no llegó su día. No se edita ni cuenta.
 * - `cancelada`: no cuenta para nadie.
 */
export type EstadoDeClase = "dictada" | "hoy" | "futura" | "cancelada";

export function estadoDeClase(
  clase: Pick<ClaseParaAsistencia, "sessionDate" | "endTime" | "canceled">,
  reloj: RelojDeAsistencia
): EstadoDeClase {
  if (clase.canceled) return "cancelada";
  if (classHasEnded({ date: clase.sessionDate, endTime: clase.endTime }, reloj.timeZone, reloj.now)) {
    return "dictada";
  }
  const empiezaElDia = classInstant(clase.sessionDate, "00:00", reloj.timeZone);
  return empiezaElDia && empiezaElDia.getTime() <= reloj.now.getTime() ? "hoy" : "futura";
}

/**
 * ¿Esta clase entra en el denominador de ESTE alumno?
 *
 * 1. Tiene que estar DICTADA (terminó y no está cancelada). Una clase que
 *    todavía no ocurrió no es una falta: con 5 de 12 dadas, quien fue a las 5
 *    tiene 100%, no 42%.
 * 1b. Y en ella se tuvo que TOMAR ASISTENCIA (al menos una marca de alguien).
 *    Una clase dada donde nadie pasó lista no es una falta de nadie.
 * 2. Si el alumno tiene MARCA en la clase, cuenta siempre: la marca prueba que
 *    estaba en ese grupo ese día, aunque su inscripción se haya registrado
 *    después (bug 2: inscripciones cargadas con la cursada en marcha).
 * 3. Sin marca, las clases que terminaron ANTES de su inscripción no cuentan
 *    (FR-004): el que entra en la cuarta semana no arranca con tres faltas.
 *    Se compara contra el FIN de la clase: inscripto ese mismo día, antes de
 *    que termine, la clase es suya.
 *
 * En una clase con lista tomada, el alumno SIN marca (posterior a su
 * inscripción) cuenta como ausente: a los demás se los marcó y a él no.
 * Sin ninguna clase que cuente el resultado es `null`, nunca 0%.
 */
export function claseCuentaParaElAlumno(
  clase: ClaseParaAsistencia,
  enrolledAt: Date | null,
  reloj: RelojDeAsistencia
): boolean {
  if (estadoDeClase(clase, reloj) !== "dictada") return false;
  if (clase.status !== null) return true;
  if (!clase.tomada) return false;
  if (!enrolledAt) return true;
  return classEndsAt(clase.sessionDate, clase.endTime, reloj.timeZone).getTime() > enrolledAt.getTime();
}

/**
 * Porcentaje de asistencia de UN alumno.
 *
 * Sin clases que cuenten devuelve `null` y NO 0: "todavía no hay de qué
 * calcular" y "vino a cero clases" son cosas distintas, y mostrar 0% en una
 * cohorte que no empezó es una mentira que alguien va a usar para decidir.
 */
export function attendancePercentage(
  sessions: readonly ClaseParaAsistencia[],
  enrolledAt: Date | null,
  reloj: RelojDeAsistencia
): number | null {
  const cuentan = sessions.filter((s) => claseCuentaParaElAlumno(s, enrolledAt, reloj));
  if (cuentan.length === 0) return null;
  const presentes = cuentan.filter((s) => cuentaComoPresente(s.status)).length;
  return Math.round((presentes / cuentan.length) * 100);
}
