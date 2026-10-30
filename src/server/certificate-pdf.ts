import { and, eq, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import {
  anioDeInicio,
  armarCertificado,
  leerSnapshot,
  type CertificadoSnapshot,
  type CertificadoVista,
} from "@/lib/certificado";
import { modulosConOrdinal } from "@/lib/program-order";
import { fullName } from "@/lib/utils";
import { lugaresDelPrograma, tieneHijas } from "@/server/program-modules";
import { visibilidadSegun } from "@/lib/resultado-final";
import { estadosAfirmados } from "@/server/resultados-confirmados";

/**
 * 038 — Los hechos del certificado, leídos de la base.
 *
 * Dos usos, una sola lectura:
 *
 * - **Al emitir** (`issueCertificate`), `snapshotActual` arma lo que el PDF
 *   va a decir y se CONGELA en `certificate.snapshot` (FR-004): el nombre de
 *   la persona y el del curso tal como estaban ese día.
 * - **Al descargar**, se usa lo congelado. Solo un certificado emitido antes
 *   de 038 —sin snapshot— se arma con los datos de hoy.
 *
 * Este módulo nunca decide códigos de estado: devuelve `null` y la ruta elige
 * el 404 (ausencia = 404, jamás 403). Un certificado anulado también es
 * `null` (FR-007): no hay papel que entregar.
 */

const cohorteMadre = alias(schema.cohort, "cohorte_madre");
const cursoMadre = alias(schema.course, "curso_madre");
const inscripcionMadre = alias(schema.enrollment, "inscripcion_madre");

/**
 * Lo que el certificado de una inscripción dice HOY.
 *
 * - Inscripción HIJA (módulo de especialización): formato `modulo`, con el
 *   nombre del curso de la ESPECIALIZACIÓN y el año de su camada (FR-002),
 *   el ordinal del programa (FR-003) y la descripción del curso del módulo.
 * - Inscripción MADRE (o cohorte marcada como especialización): formato
 *   `especializacion`, con los módulos del programa en orden.
 * - Cualquier otra: formato `curso`.
 */
export async function snapshotActual(
  organizationId: string,
  enrollmentId: string
): Promise<CertificadoSnapshot | null> {
  const db = getDb();
  const rows = await db
    .select({
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      cohortStart: schema.cohort.startDate,
      isSpecialization: schema.cohort.isSpecialization,
      courseId: schema.course.id,
      courseName: schema.course.name,
      certificateDescription: schema.course.certificateDescription,
      madreCohortId: cohorteMadre.id,
      madreCohortName: cohorteMadre.name,
      madreCohortStart: cohorteMadre.startDate,
      madreCourseName: cursoMadre.name,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(inscripcionMadre, eq(schema.enrollment.parentEnrollmentId, inscripcionMadre.id))
    .leftJoin(cohorteMadre, eq(inscripcionMadre.cohortId, cohorteMadre.id))
    .leftJoin(cursoMadre, eq(cohorteMadre.courseId, cursoMadre.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  const r = rows[0];
  if (!r?.cohortId || !r.courseName) return null;

  const alumno = fullName({ firstName: r.firstName, lastName: r.lastName });

  // Un módulo: el certificado lleva el curso de la ESPECIALIZACIÓN (FR-002).
  if (r.parentEnrollmentId && r.madreCohortId && r.madreCourseName) {
    const programa = await modulosDelPrograma(organizationId, r.madreCohortId);
    const lugares = lugaresDelPrograma(
      programa.map((m) => ({ cohortId: m.id, courseId: m.courseId, ordinal: m.ordinal }))
    );
    const lugar = lugares.get(`cohorte:${r.cohortId}`) ?? lugares.get(`curso:${r.courseId}`);
    return {
      version: 1,
      formato: "modulo",
      alumno,
      curso: r.madreCourseName,
      cohorte: r.madreCohortName,
      anio: anioDeInicio(r.madreCohortStart ?? r.cohortStart),
      modulo: { ordinal: lugar?.ordinal ?? null, nombre: r.cohortName ?? r.courseName },
      modulos: [],
      descripcion: r.certificateDescription,
    };
  }

  const esEspecializacion =
    r.isSpecialization || (await tieneHijas(organizationId, enrollmentId));
  if (esEspecializacion) {
    const programa = await modulosDelPrograma(organizationId, r.cohortId);
    return {
      version: 1,
      formato: "especializacion",
      alumno,
      curso: r.courseName,
      cohorte: r.cohortName,
      anio: anioDeInicio(r.cohortStart),
      modulo: null,
      modulos: programa.map((m) => m.nombre),
      descripcion: null,
    };
  }

  return {
    version: 1,
    formato: "curso",
    alumno,
    curso: r.courseName,
    cohorte: r.cohortName,
    anio: anioDeInicio(r.cohortStart),
    modulo: null,
    modulos: [],
    descripcion: r.certificateDescription,
  };
}

/**
 * Los módulos de la camada, en el orden del programa (`modulosConOrdinal`,
 * la misma regla que la grilla y el Recorrido) y con su nombre propio.
 */
async function modulosDelPrograma(organizationId: string, parentCohortId: string) {
  const filas = await getDb()
    .select({
      id: schema.cohort.id,
      position: schema.cohort.position,
      startDate: schema.cohort.startDate,
      courseId: schema.cohort.courseId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, parentCohortId)
      )
    );
  return modulosConOrdinal(filas).map((m) => ({ ...m, nombre: m.cohortName ?? m.courseName }));
}

export type CertificadoParaDescargar = { vista: CertificadoVista; curso: string };

/**
 * El certificado VIGENTE que cumple `condicion`, listo para dibujar. `null`
 * si no existe, es de otra organización, no cumple la condición o está
 * anulado: las tres cosas se responden igual (FR-007, FR-016).
 */
async function certificadoVigente(
  organizationId: string,
  condicion: SQL
): Promise<CertificadoParaDescargar | null> {
  const rows = await getDb()
    .select({
      code: schema.certificate.code,
      enrollmentId: schema.certificate.enrollmentId,
      snapshot: schema.certificate.snapshot,
    })
    .from(schema.certificate)
    .innerJoin(schema.enrollment, eq(schema.certificate.enrollmentId, schema.enrollment.id))
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        and(condicion, isNull(schema.certificate.revokedAt))
      )
    )
    .limit(1);
  const fila = rows[0];
  if (!fila) return null;

  /**
   * 0086 — SUSPENDIDO (sin resultado final confirmado como aprobado): no se
   * entrega a nadie, ni al alumno ni al staff, para que no circule un papel
   * que todavía no vale. Se responde igual que "no existe".
   */
  // 2026-10-29 — Igual con el grupo terminado sin la asistencia completa: cuenta como anulado.
  const afirmado = (await estadosAfirmados(organizationId, [fila.enrollmentId])).get(fila.enrollmentId);
  if (visibilidadSegun(null, afirmado) !== "valido") return null;

  const snapshot =
    leerSnapshot(fila.snapshot) ?? (await snapshotActual(organizationId, fila.enrollmentId));
  if (!snapshot) return null;
  return {
    vista: armarCertificado(snapshot, { codigo: fila.code, baseUrl: getEnv().APP_BASE_URL }),
    curso: snapshot.curso,
  };
}

const normalizarCodigo = (code: string) => code.trim().toUpperCase();

/**
 * 038 (FR-015/FR-016) — El certificado de un ALUMNO, por código.
 *
 * El contacto sale de la sesión del portal y entra en el WHERE: un código
 * ajeno no encuentra fila, y la respuesta es la misma que para un código que
 * no existe.
 */
export async function certificadoDelAlumno(
  organizationId: string,
  contactId: string,
  code: string
): Promise<CertificadoParaDescargar | null> {
  return certificadoVigente(
    organizationId,
    and(
      eq(schema.certificate.code, normalizarCodigo(code)),
      eq(schema.enrollment.contactId, contactId)
    )!
  );
}

/** 038 (FR-015) — Para el staff, por código (legajo). */
export async function certificadoPorCodigo(
  organizationId: string,
  code: string
): Promise<CertificadoParaDescargar | null> {
  return certificadoVigente(organizationId, eq(schema.certificate.code, normalizarCodigo(code)));
}

/** 038 (FR-015) — Para el staff, por inscripción (planilla de evaluación). */
export async function certificadoDeInscripcion(
  organizationId: string,
  enrollmentId: string
): Promise<CertificadoParaDescargar | null> {
  return certificadoVigente(organizationId, eq(schema.certificate.enrollmentId, enrollmentId));
}
