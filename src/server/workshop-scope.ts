import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * 033 (FR-021) — Las inscripciones a talleres NO son cursadas.
 *
 * Un taller corre sobre la misma columna vertebral que un curso —cohorte e
 * inscripción— para que la cobranza y Finanzas funcionen sin nada paralelo.
 * El precio de esa decisión es que toda lectura que pregunta "¿qué cursa esta
 * persona?" vería también sus talleres. El legajo, la escolaridad, los
 * portales, el reporte por empresa, el tablero de ventas y el contador de
 * alumnos del dashboard pasan por uno de estos dos filtros;
 * `tests/unit/talleres-exclusion.test.ts` falla si alguno lo pierde.
 *
 * Cobranza y Finanzas NO filtran: ahí el taller cobrado TIENE que aparecer
 * (FR-016).
 */

/**
 * Para una consulta que YA trae el curso (join, a veces `leftJoin`): una fila
 * sin curso —el lead general, sin cohorte— sigue pasando.
 */
export function cursoNoEsTaller(courseKind: AnyPgColumn): SQL {
  return sql`coalesce(${courseKind}, 'curso') <> 'taller'`;
}

/**
 * Para una consulta que solo tiene el id de la cohorte: un `not exists`
 * correlacionado en vez de sumar dos joins. `null` (lead general) pasa.
 */
export function cohorteNoEsDeTaller(cohortId: AnyPgColumn): SQL {
  return sql`(${cohortId} is null or not exists (
    select 1 from "cohort" taller_c
    join "course" taller_k on taller_k."id" = taller_c."course_id"
    where taller_c."id" = ${cohortId} and taller_k."kind" = 'taller'
  ))`;
}
