import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  GRUPO_SIN_CERTIFICADO,
  GRUPO_SIN_EVALUACIONES,
  grupoEmiteCertificado,
  grupoTieneEvaluaciones,
  type ConfigDeGrupo,
} from "@/lib/taller-config";

/**
 * 2026-10-29 — Punto ÚNICO de lectura y validación de la configuración de un
 * grupo de curso taller (`src/lib/taller-config.ts`): tiene evaluaciones /
 * emite certificado.
 *
 * Todo servicio de evaluaciones, entregas, correcciones, prórrogas o
 * certificados llama a uno de los `exigir*` ANTES de escribir o leer; las
 * rutas no repiten la regla. `tests/unit/taller-config-guard.test.ts` falla si
 * un archivo de esas superficies deja de usarlos.
 *
 * - Staff y servicios: el `exigir*` devuelve `{ status: 409, code, message }`
 *   (`grupo_sin_evaluaciones` / `grupo_sin_certificado`).
 * - Portales: la ausencia es 404 (nunca 403). Usan `tieneEvaluaciones*` /
 *   `emiteCertificado*` (booleanos) y devuelven su 404/`null` de siempre.
 */

export type FalloDeGrupo = {
  ok: false;
  status: 409;
  code: "grupo_sin_evaluaciones" | "grupo_sin_certificado";
  message: string;
};

type Fila = ConfigDeGrupo & { cohortId: string };

const columnas = () => ({
  cohortId: schema.cohort.id,
  courseKind: schema.course.kind,
  registrationStatus: schema.cohort.registrationStatus,
  hasAssessments: schema.cohort.hasAssessments,
  issuesCertificate: schema.cohort.issuesCertificate,
});

/** La configuración de un grupo, o `null` si no existe en la organización. */
export async function configDeGrupo(
  organizationId: string,
  cohortId: string
): Promise<Fila | null> {
  const rows = await getDb()
    .select(columnas())
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return rows[0] ?? null;
}

/** La del grupo al que pertenece una evaluación. */
export async function configDeEvaluacion(
  organizationId: string,
  assessmentId: string
): Promise<Fila | null> {
  const rows = await getDb()
    .select(columnas())
    .from(schema.assessment)
    .innerJoin(schema.cohort, eq(schema.assessment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, assessmentId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** La del grupo de una inscripción (`null` = sin grupo o inexistente). */
export async function configDeInscripcion(
  organizationId: string,
  enrollmentId: string
): Promise<Fila | null> {
  const rows = await getDb()
    .select(columnas())
    .from(schema.enrollment)
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

const sinEvaluaciones = (): FalloDeGrupo => ({ ok: false, ...GRUPO_SIN_EVALUACIONES });
const sinCertificado = (): FalloDeGrupo => ({ ok: false, ...GRUPO_SIN_CERTIFICADO });

/**
 * Un grupo inexistente NO es un fallo de esta regla (`null`): el llamador ya
 * responde su propio 404. Solo se rechaza un grupo que existe y no tiene
 * evaluaciones / no emite.
 */
export async function exigirEvaluacionesDeGrupo(
  organizationId: string,
  cohortId: string
): Promise<FalloDeGrupo | null> {
  const c = await configDeGrupo(organizationId, cohortId);
  return c && !grupoTieneEvaluaciones(c) ? sinEvaluaciones() : null;
}

export async function exigirEvaluacionesDeEvaluacion(
  organizationId: string,
  assessmentId: string
): Promise<FalloDeGrupo | null> {
  const c = await configDeEvaluacion(organizationId, assessmentId);
  return c && !grupoTieneEvaluaciones(c) ? sinEvaluaciones() : null;
}

export async function exigirEvaluacionesDeInscripcion(
  organizationId: string,
  enrollmentId: string
): Promise<FalloDeGrupo | null> {
  const c = await configDeInscripcion(organizationId, enrollmentId);
  return c && !grupoTieneEvaluaciones(c) ? sinEvaluaciones() : null;
}

export async function exigirCertificadoDeGrupo(
  organizationId: string,
  cohortId: string
): Promise<FalloDeGrupo | null> {
  const c = await configDeGrupo(organizationId, cohortId);
  return c && !grupoEmiteCertificado(c) ? sinCertificado() : null;
}

export async function exigirCertificadoDeInscripcion(
  organizationId: string,
  enrollmentId: string
): Promise<FalloDeGrupo | null> {
  const c = await configDeInscripcion(organizationId, enrollmentId);
  return c && !grupoEmiteCertificado(c) ? sinCertificado() : null;
}

/* Booleanos para los portales (ausencia = 404, jamás 403). Grupo inexistente = true:
 * el llamador ya resuelve su 404. */

export async function grupoTieneEvaluacionesPorId(
  organizationId: string,
  cohortId: string
): Promise<boolean> {
  const c = await configDeGrupo(organizationId, cohortId);
  return c ? grupoTieneEvaluaciones(c) : true;
}

export async function evaluacionEsDeGrupoConEvaluaciones(
  organizationId: string,
  assessmentId: string
): Promise<boolean> {
  const c = await configDeEvaluacion(organizationId, assessmentId);
  return c ? grupoTieneEvaluaciones(c) : true;
}

/* ------------------------------------------------------------------ SQL en lote */

/**
 * Condición SQL: el grupo de la fila TIENE evaluaciones. Para consultas que
 * ya traen `cohort` y `course` (join). Un taller cursable con
 * `has_assessments = false` queda afuera; todo lo demás pasa.
 */
export function grupoConEvaluacionesSql(
  courseKind: AnyPgColumn,
  registrationStatus: AnyPgColumn,
  hasAssessments: AnyPgColumn
): SQL {
  return sql`not (coalesce(${courseKind}, 'curso') = 'taller' and ${registrationStatus} is null and ${hasAssessments} = false)`;
}

/** Ídem para "emite certificado". */
export function grupoEmiteCertificadoSql(
  courseKind: AnyPgColumn,
  registrationStatus: AnyPgColumn,
  issuesCertificate: AnyPgColumn
): SQL {
  return sql`not (coalesce(${courseKind}, 'curso') = 'taller' and ${registrationStatus} is null and ${issuesCertificate} = false)`;
}
