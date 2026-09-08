import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { sendMail } from "@/lib/m365/client";
import { fullName } from "@/lib/utils";
import { getBranding } from "@/server/branding";
import { renderTemplate } from "@/server/email/templates";

/**
 * 007 — Correos transaccionales de una inscripción: términos de licencia ATC
 * y bienvenida con invitación al grupo de WhatsApp.
 *
 * Dos reglas que gobiernan todo este módulo:
 *
 * 1. Un correo NO se puede desenviar. Cada envío queda marcado con su fecha
 *    (`termsEmailSentAt` / `welcomeEmailSentAt`) y no se repite salvo que se
 *    pida explícitamente con `force`.
 * 2. La marca se escribe DESPUÉS de que Graph acepta el envío. Si se marcara
 *    antes, un fallo del proveedor dejaría al alumno sin correo y al equipo
 *    creyendo que se mandó — que es exactamente el error que este checklist
 *    existe para evitar.
 */

export type EmailKind = "terms" | "welcome";

export type SendEnrollmentEmailResult =
  | { ok: true; sentAt: string; skipped?: false }
  | { ok: true; sentAt: string; skipped: true }
  | { ok: false; status: 404 | 422 | 502; code: string; message: string };

const SUBJECTS: Record<EmailKind, (courseName: string) => string> = {
  terms: (c) => `Términos de la licencia ATC — ${c}`,
  welcome: (c) => `Bienvenido/a a ${c}`,
};

/** Datos de la inscripción, su alumno y su cohorte, en una sola consulta. */
async function loadContext(organizationId: string, enrollmentId: string) {
  const db = getDb();
  const rows = await db
    .select({
      enrollment: schema.enrollment,
      contact: schema.contact,
      cohort: schema.cohort,
      course: schema.course,
      teacherName: schema.teacher.name,
      // El correo de términos declara QUÉ licencia se presta. Sale de la
      // licencia de esta inscripción, no de un texto fijo: el documento
      // nombra el producto ("AutoCAD") y ese dato ya vive en la base.
      // `license.enrollment_id` es UNIQUE, así que el join no duplica filas.
      softwareName: schema.software.name,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .leftJoin(schema.license, eq(schema.license.enrollmentId, schema.enrollment.id))
    .leftJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
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

function formatDate(d: Date | null): string {
  if (!d) return "a confirmar";
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "long", year: "numeric" });
}

const MODALITY_LABEL: Record<string, string> = {
  en_vivo: "Online en vivo",
  asincronico: "Asincrónico",
  presencial: "Presencial",
};

export async function sendEnrollmentEmail(
  organizationId: string,
  enrollmentId: string,
  kind: EmailKind,
  opts: { force?: boolean } = {}
): Promise<SendEnrollmentEmailResult> {
  const ctx = await loadContext(organizationId, enrollmentId);
  if (!ctx) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  const { enrollment, contact, cohort, course, teacherName, softwareName } = ctx;

  if (!contact.email) {
    return {
      ok: false,
      status: 422,
      code: "no_email",
      message: `${fullName(contact)} no tiene correo cargado`,
    };
  }

  // Ya enviado: no se repite salvo pedido explícito.
  const already = kind === "terms" ? enrollment.termsEmailSentAt : enrollment.welcomeEmailSentAt;
  if (already && !opts.force) {
    return { ok: true, sentAt: already.toISOString(), skipped: true };
  }

  // La bienvenida invita al grupo: sin enlace cargado, el correo pierde su
  // razón de ser y es mejor avisar que mandar un botón roto.
  if (kind === "welcome" && !cohort.whatsappGroupLink) {
    return {
      ok: false,
      status: 422,
      code: "missing_group_link",
      message:
        "La cohorte no tiene enlace del grupo de WhatsApp. Cargalo en la edición de la cohorte.",
    };
  }

  const env = getEnv();
  /**
   * El nombre y el color salen de la marca de la organización, no de un texto
   * fijo: una instancia = un negocio, y el nombre estaba escrito a mano acá
   * mientras el real vivía en `organization.metadata.branding`.
   *
   * `normalizeBranding` ya valida el hex y cae al acento por defecto si no
   * sirve, así que `acento` llega SIEMPRE como un color usable a la plantilla
   * —que lo escribe en `bgcolor`, donde un valor inválido dejaría el botón sin
   * fondo y el texto blanco sobre blanco—.
   */
  const branding = await getBranding(organizationId);
  const academia = branding.name;
  const acento = branding.accent;
  /**
   * URL ABSOLUTA y servida por la propia app (`public/`): el cliente de correo
   * del alumno no conoce el servidor, así que una ruta relativa no resuelve.
   * Tampoco puede ser `data:` — Gmail y Outlook bloquean esas imágenes— ni un
   * bucket externo, que el Principio II de la constitución no admite.
   */
  const logoUrl = `${env.APP_BASE_URL}/logo-cadit.png`;
  const soporte = env.M365_SENDER ?? "";
  const courseName = cohort.name ?? course.name;

  const html =
    kind === "terms"
      ? renderTemplate("licencia-atc", {
          // Nombre COMPLETO, no el de pila: esto documenta un préstamo y el
          // encabezado del bloque de datos es parte del documento.
          nombreCompleto: fullName(contact),
          curso: courseName,
          fechaInicio: formatDate(cohort.startDate),
          fechaFin: formatDate(cohort.endDate),
          // La cuenta a la que se presta la licencia. El texto dice "una
          // cuenta indicada por el beneficiario (preferentemente: personal)",
          // así que puede no ser la de contacto — hoy no hay dónde guardar
          // esa distinción y se usa la del alumno. Ver docs/deuda-tecnica.md.
          usuario: contact.email,
          // Sin licencia cargada el documento no puede nombrar el producto.
          // Se declara la falta en vez de inventar un genérico: un préstamo
          // que no dice qué se presta no documenta nada.
          licencias: softwareName ?? "a confirmar",
          academia,
          acento,
          logoUrl,
          contactoSoporte: soporte,
        })
      : renderTemplate("bienvenida-cohorte", {
          nombre: contact.firstName,
          curso: courseName,
          fechaInicio: formatDate(cohort.startDate),
          horario: cohort.frequency ?? "a confirmar",
          modalidad: MODALITY_LABEL[course.modality ?? ""] ?? "a confirmar",
          profesor: teacherName ?? "a confirmar",
          aula: cohort.classroom ? `Aula ${cohort.classroom}` : "sin aula asignada",
          grupoWhatsapp: cohort.whatsappGroupLink ?? "",
          academia,
          acento,
          logoUrl,
          contactoSoporte: soporte,
        });

  const sent = await sendMail({
    to: contact.email,
    subject: SUBJECTS[kind](courseName),
    html,
    bcc: env.M365_BCC,
  });

  if (!sent.ok) {
    return {
      ok: false,
      status: 502,
      code: sent.code,
      message: sent.message,
    };
  }

  // Recién ahora se marca: la marca dice "el proveedor lo aceptó", no "lo intenté".
  const now = new Date();
  await getDb()
    .update(schema.enrollment)
    .set(
      kind === "terms"
        ? { termsEmailSentAt: now, updatedAt: now }
        : { welcomeEmailSentAt: now, updatedAt: now }
    )
    .where(eq(schema.enrollment.id, enrollmentId));

  return { ok: true, sentAt: now.toISOString() };
}
