import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import {
  cohortGrading,
  generateCertificateCode,
  programGrading,
  type GradingResult,
} from "@/server/grading";
import { dispensaVigente, tieneHijas } from "@/server/program-modules";

/**
 * 010 — Emisión y verificación de certificados.
 *
 * Dos garantías que gobiernan el módulo:
 *
 * 1. **Idempotencia** (FR-007, constitución IV): emitir dos veces devuelve el
 *    MISMO certificado. El índice único sobre `enrollment_id` es la garantía
 *    dura; el chequeo previo solo evita el error feo.
 * 2. **El endpoint público expone lo mínimo** (FR-009): alumno, curso,
 *    cohorte y fecha. Nunca notas, nunca datos de contacto. Quien verifica un
 *    certificado no tiene por qué enterarse de nada más.
 *
 * 028 fase 5 le suma dos CONDICIONES de emisión, y ninguna vive en la
 * pantalla —las dos se comprueban acá, así que no se pueden saltear llamando
 * al endpoint directamente—:
 *
 * - **El curso tiene que otorgar certificado** (`course.grants_certificate`,
 *   regla del dueño de 2026-09-09). No todo producto de la academia entrega
 *   uno.
 * - **El certificado general de una especialización exige TODAS las hijas
 *   aprobadas** (FR-020). La unicidad de `enrollment_id` hace el resto: se
 *   emite una sola vez.
 */

export type CertificateDto = {
  id: string;
  code: string;
  issuedAt: string;
  attendancePct: number | null;
  historical: boolean;
  revokedAt: string | null;
  revokeReason: string | null;
  /**
   * 028 (FR-026) — `true` cuando la inscripción tiene una dispensa de
   * asistencia vigente.
   *
   * Viaja AL LADO de `attendancePct`, nunca adentro: el porcentaje congelado
   * es el REAL y está prohibido inflarlo para que la emisión "cierre". El
   * hecho es que faltó y que alguien lo habilitó igual, y las dos mitades
   * tienen que quedar escritas.
   */
  dispensada: boolean;
};

function serialize(
  c: typeof schema.certificate.$inferSelect,
  dispensada: boolean
): CertificateDto {
  return {
    id: c.id,
    code: c.code,
    issuedAt: c.issuedAt.toISOString(),
    attendancePct: c.attendancePct,
    historical: c.historical,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    revokeReason: c.revokeReason,
    dispensada,
  };
}

/**
 * Emite el certificado de una inscripción.
 *
 * Solo a alumnos APROBADOS (FR-006). La única excepción es `historical`
 * (DV-004): las cohortes anteriores al sistema no tienen notas ni asistencia
 * cargadas, así que emitir a pedido requiere saltear el requisito — y queda
 * marcado en la fila para que nadie lo confunda con una aprobación
 * verificada.
 */
export async function issueCertificate(
  organizationId: string,
  enrollmentId: string,
  opts: { historical?: boolean; issuedBy?: string | null } = {}
): Promise<GradingResult<CertificateDto>> {
  const db = getDb();

  /**
   * La inscripción se lee PRIMERO, con su curso y su dispensa colgados de la
   * misma consulta.
   *
   * Antes se leía después del certificado existente, y el orden cambió por
   * FR-026: la dispensa tiene que viajar también en la respuesta idempotente,
   * o la pantalla que muestra un certificado ya emitido perdería la marca que
   * explica su porcentaje. Es un `leftJoin` y no una consulta más.
   */
  const enrollmentRows = await db
    .select({
      id: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      grantsCertificate: schema.course.grantsCertificate,
      attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
      attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
      attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  const enrollment = enrollmentRows[0];
  if (!enrollment?.cohortId) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Inscripción no encontrada o sin cohorte",
    };
  }
  const dispensada = dispensaVigente(enrollment);

  const existing = await db
    .select()
    .from(schema.certificate)
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        eq(schema.certificate.enrollmentId, enrollmentId)
      )
    )
    .limit(1);
  /**
   * FR-007 — emitir de nuevo devuelve el mismo, no crea otro ni falla. Y va
   * ANTES de la bandera del curso a propósito: un certificado ya emitido
   * sigue siendo válido aunque la academia deje de entregar el de ese curso.
   * Lo emitido no se desemite por un cambio de catálogo.
   */
  if (existing[0]) return { ok: true, data: serialize(existing[0], dispensada) };

  /**
   * La regla del dueño (2026-09-09): sólo se emite si el curso lo otorga.
   *
   * Vale también para la emisión histórica (010, DV-004): esa excepción
   * saltea notas y asistencia —lo que no se pudo verificar—, no el catálogo.
   * Lo que la bandera dice es qué vende la academia, y de eso no hay cohorte
   * vieja que exima.
   */
  if (enrollment.grantsCertificate === false) {
    return {
      ok: false,
      status: 422,
      code: "curso_sin_certificado",
      message: "No se puede emitir: este curso no otorga certificado",
    };
  }

  let attendancePct: number | null = null;

  if (!opts.historical) {
    /**
     * 028 (FR-020, FR-033) — ¿Es la inscripción MADRE de una especialización?
     * Se responde por la PRESENCIA de hijas, nunca por una bandera. Una madre
     * sin hijas cargadas no es una madre: cae al camino de siempre.
     */
    const esMadre = await tieneHijas(organizationId, enrollmentId);

    if (esMadre) {
      const programa = await programGrading(organizationId, enrollmentId);
      if (!programa) {
        return { ok: false, status: 404, code: "not_found", message: "Alumno no encontrado" };
      }
      if (programa.state !== "aprobado") {
        return {
          ok: false,
          status: 422,
          code: "not_approved",
          message:
            programa.reasons.length > 0
              ? `No se puede emitir: ${programa.reasons.join("; ")}`
              : "No se puede emitir: faltan módulos por aprobar",
        };
      }
      /**
       * No existe "la asistencia de la especialización" y no se inventa un
       * promedio: cada módulo tiene su cronograma y su propio mínimo (regla
       * 5, DV-002). Congelar un número que no se calcula en ningún otro lado
       * sería congelar algo que después nadie puede reproducir. El general
       * queda con `attendance_pct` en NULL y la asistencia real vive, módulo
       * por módulo, en el certificado de cada uno.
       */
    } else {
      const grading = await cohortGrading(organizationId, enrollment.cohortId);
      const student = grading?.students.find((s) => s.enrollmentId === enrollmentId);
      if (!student) {
        return { ok: false, status: 404, code: "not_found", message: "Alumno no encontrado" };
      }
      if (student.state !== "aprobado") {
        return {
          ok: false,
          status: 422,
          code: "not_approved",
          message:
            student.reasons.length > 0
              ? `No se puede emitir: ${student.reasons.join("; ")}`
              : "No se puede emitir: el alumno no está aprobado",
        };
      }
      /**
       * FR-026 — el porcentaje REAL, tal como lo devuelve la planilla. Con
       * dispensa el alumno aprueba igual, pero el número que se congela sigue
       * siendo el que efectivamente asistió: inflarlo para que la emisión
       * "cierre" sería falsificar el dato para que la pantalla quede prolija.
       */
      attendancePct = student.attendancePct;
    }
  }

  const inserted = await db
    .insert(schema.certificate)
    .values({
      id: newId("certificate"),
      organizationId,
      enrollmentId,
      code: generateCertificateCode(),
      attendancePct,
      historical: opts.historical ?? false,
      issuedBy: opts.issuedBy ?? null,
    })
    .returning();

  return { ok: true, data: serialize(inserted[0]!, dispensada) };
}

/**
 * Anula un certificado con motivo, conservando el registro (FR-008). No se
 * borra: un certificado que desaparece deja sin explicación al alumno que lo
 * tiene impreso en la mano.
 */
export async function revokeCertificate(
  organizationId: string,
  certificateId: string,
  input: { reason: string; revokedBy?: string | null }
): Promise<GradingResult<CertificateDto>> {
  const db = getDb();

  const rows = await db
    .select({
      certificate: schema.certificate,
      // 028 (FR-026) — la dispensa viaja en la MISMA consulta, para que el
      // DTO diga lo mismo se emita o se anule. Es un `innerJoin` sobre la
      // inscripción que el certificado ya referencia, no una consulta más.
      attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
      attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
      attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
    })
    .from(schema.certificate)
    .innerJoin(schema.enrollment, eq(schema.certificate.enrollmentId, schema.enrollment.id))
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        eq(schema.certificate.id, certificateId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Certificado no encontrado" };
  }
  if (row.certificate.revokedAt) {
    return { ok: false, status: 409, code: "already_revoked", message: "Ya estaba anulado" };
  }
  const dispensada = dispensaVigente(row);

  const updated = await db
    .update(schema.certificate)
    .set({
      revokedAt: new Date(),
      revokedBy: input.revokedBy ?? null,
      revokeReason: input.reason,
    })
    /*
      Scopeada desde 028 fase 5. La línea venía del 010 con un `eq` pelado, y
      aunque el `select` de arriba sí filtra por organización, apoyar la
      escritura en el orden de las llamadas dentro de esta función es una
      defensa que dura hasta que alguien reordene dos líneas. Constitución III
      no admite el atajo — y aplicárselo a la dispensa y no acá sería sostener
      dos varas para el mismo riesgo.
    */
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        eq(schema.certificate.id, certificateId)
      )
    )
    .returning();

  return { ok: true, data: serialize(updated[0]!, dispensada) };
}

export type PublicCertificate = {
  code: string;
  student: string;
  course: string;
  cohort: string | null;
  issuedAt: string;
  hours: string | null;
  valid: boolean;
  revokedAt: string | null;
};

/**
 * 010 (FR-009) — Verificación pública por código.
 *
 * Devuelve SOLO lo que hace falta para confirmar que el certificado es real:
 * alumno, curso, cohorte y fecha. Nada de notas, asistencia, teléfono ni
 * correo. Quien verifica suele ser un empleador, y no tiene por qué recibir
 * el legajo del alumno.
 *
 * Un certificado anulado NO desaparece: responde con `valid: false` y su
 * fecha de anulación. Decir "no existe" sobre algo que sí se emitió es peor
 * que decir "se anuló".
 */
export async function verifyCertificate(code: string): Promise<PublicCertificate | null> {
  const db = getDb();

  const rows = await db
    .select({
      certificate: schema.certificate,
      contact: schema.contact,
      courseName: schema.course.name,
      cohortName: schema.cohort.name,
      durationWeeks: schema.course.durationWeeks,
      hoursPerWeek: schema.course.hoursPerWeek,
    })
    .from(schema.certificate)
    .innerJoin(schema.enrollment, eq(schema.certificate.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(eq(schema.certificate.code, code.trim().toUpperCase()))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // DV-005 — las horas del CURSO (lo que figura en la web y lo que el alumno
  // compró), no las efectivamente dictadas.
  const hours =
    row.durationWeeks && row.hoursPerWeek
      ? `${row.durationWeeks * row.hoursPerWeek} horas`
      : null;

  return {
    code: row.certificate.code,
    student: fullName(row.contact),
    course: row.courseName,
    cohort: row.cohortName,
    issuedAt: row.certificate.issuedAt.toISOString(),
    hours,
    valid: !row.certificate.revokedAt,
    revokedAt: row.certificate.revokedAt?.toISOString() ?? null,
  };
}
