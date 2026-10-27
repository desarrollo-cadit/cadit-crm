import { ACADEMY_TIME_ZONE, classInstant } from "@/lib/schedule-time";

/**
 * El estado de una cohorte se deriva de sus fechas — no hay columna que
 * mantener ni scheduler que lo mueva.
 *
 * Vive acá, sin depender de nada más que `schedule-time` (otra hoja: no
 * importa nada), porque lo necesitan dos dominios que no
 * tienen por qué conocerse: `@/server/courses`, que lo publica en la planilla,
 * y `@/server/licenses`, que decide con él si una licencia sigue ocupada.
 * Mientras la regla vivió en `courses`, licencias lo importaba y cursos
 * importaba licencias: un ciclo de imports cuyo resultado dependía del orden
 * de carga de los módulos. La regla en sí es la misma de siempre.
 *
 * **La columna `status` sigue existiendo en el schema, pero la serialización
 * SIEMPRE devuelve el valor calculado, nunca el guardado** (005 iteración 4,
 * "debería ser automático"). `endDate` NULL es "sigue en curso una vez
 * empezada", el mismo criterio que usa el choque de horario (DV-006).
 */
export function computeCohortStatus(
  startDate: Date,
  endDate: Date | null,
  now: Date = new Date(),
  timeZone: string = ACADEMY_TIME_ZONE
): "planificada" | "en_curso" | "finalizada" {
  if (now < inicioDelDia(startDate, timeZone)) return "planificada";
  if (endDate && now >= inicioDelDia(siguienteDia(endDate), timeZone)) return "finalizada";
  return "en_curso";
}

/**
 * 2026-10-27 — Las fechas se guardan como medianoche UTC del día, que en
 * Montevideo son las 21:00 del día ANTERIOR. Compararlas tal cual daba el
 * grupo por finalizado la noche antes de su última clase (y la última clase
 * nunca contaba). Los límites son el día de la academia: empieza a las 00:00
 * del inicio y termina al cerrar el día del fin, en su zona. Si la zona no se
 * entiende, se cae a la comparación de siempre en vez de inventar un instante.
 */
function inicioDelDia(dia: Date, timeZone: string): Date {
  return classInstant(dia, "00:00", timeZone) ?? dia;
}

function siguienteDia(dia: Date): Date {
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() + 1));
}
