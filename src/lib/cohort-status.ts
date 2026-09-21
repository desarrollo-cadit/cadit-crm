/**
 * El estado de una cohorte se deriva de sus fechas — no hay columna que
 * mantener ni scheduler que lo mueva.
 *
 * Vive acá, sin una sola dependencia, porque lo necesitan dos dominios que no
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
  now: Date = new Date()
): "planificada" | "en_curso" | "finalizada" {
  if (now < startDate) return "planificada";
  if (endDate && now > endDate) return "finalizada";
  return "en_curso";
}
