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
 * 2026-10-29 — Qué es "un taller" para estos filtros: una EDICIÓN de taller de
 * Marketing, la que se publica en `/talleres` y tiene formulario web. Esas
 * cohortes nacen siempre con `registration_status` (`editionValues`).
 *
 * Un curso de tipo `taller` cuyo grupo se cursa como cualquier otro (clases,
 * asistencia, inscripción hecha por el staff) NO lleva estado de inscripción
 * y sí es una cursada: se ve en el portal, el legajo y los reportes.
 */

/**
 * Para una consulta que YA trae el curso y la cohorte (join, a veces
 * `leftJoin`): una fila sin cohorte —el lead general— sigue pasando.
 */
export function cursoNoEsTaller(
  courseKind: AnyPgColumn,
  registrationStatus: AnyPgColumn
): SQL {
  return sql`not (coalesce(${courseKind}, 'curso') = 'taller' and ${registrationStatus} is not null)`;
}

/**
 * Para una consulta que solo tiene el id de la cohorte: un `not exists`
 * correlacionado en vez de sumar dos joins. `null` (lead general) pasa.
 */
export function cohorteNoEsDeTaller(cohortId: AnyPgColumn): SQL {
  return sql`(${cohortId} is null or not exists (
    select 1 from "cohort" taller_c
    join "course" taller_k on taller_k."id" = taller_c."course_id"
    where taller_c."id" = ${cohortId}
      and taller_k."kind" = 'taller'
      and taller_c."registration_status" is not null
  ))`;
}
