import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { cohortGrading, generateCertificateCode, type GradingResult } from "@/server/grading";

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
 */

export type CertificateDto = {
  id: string;
  code: string;
  issuedAt: string;
  attendancePct: number | null;
  historical: boolean;
  revokedAt: string | null;
  revokeReason: string | null;
};

function serialize(c: typeof schema.certificate.$inferSelect): CertificateDto {
  return {
    id: c.id,
    code: c.code,
    issuedAt: c.issuedAt.toISOString(),
    attendancePct: c.attendancePct,
    historical: c.historical,
    revokedAt: c.revokedAt?.toISOString() ?? null,
    revokeReason: c.revokeReason,
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
  // FR-007 — emitir de nuevo devuelve el mismo, no crea otro ni falla.
  if (existing[0]) return { ok: true, data: serialize(existing[0]) };

  const enrollmentRows = await db
    .select({ id: schema.enrollment.id, cohortId: schema.enrollment.cohortId })
    .from(schema.enrollment)
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

  let attendancePct: number | null = null;

  if (!opts.historical) {
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
    attendancePct = student.attendancePct;
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

  return { ok: true, data: serialize(inserted[0]!) };
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
    .select()
    .from(schema.certificate)
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        eq(schema.certificate.id, certificateId)
      )
    )
    .limit(1);
  const cert = rows[0];
  if (!cert) {
    return { ok: false, status: 404, code: "not_found", message: "Certificado no encontrado" };
  }
  if (cert.revokedAt) {
    return { ok: false, status: 409, code: "already_revoked", message: "Ya estaba anulado" };
  }

  const updated = await db
    .update(schema.certificate)
    .set({
      revokedAt: new Date(),
      revokedBy: input.revokedBy ?? null,
      revokeReason: input.reason,
    })
    .where(eq(schema.certificate.id, certificateId))
    .returning();

  return { ok: true, data: serialize(updated[0]!) };
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
