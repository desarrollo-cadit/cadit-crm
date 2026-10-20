import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { sendMail } from "@/lib/m365/client";
import { recesosDeCohorte } from "@/lib/recess";
import { ACADEMY_TIME_ZONE, conZona } from "@/lib/schedule-time";
import { formatCalendarDay, fullName } from "@/lib/utils";
import { buildClassSchedule } from "@/server/attendance";
import { getBranding } from "@/server/branding";
import { renderTemplate } from "@/server/email/templates";
import {
  armarBienvenida,
  copiaDeBienvenida,
  cantidadDeClases,
  nombreEnFrase,
  renderBienvenida,
  type HechosDeBienvenida,
  type ModuloDeBienvenida,
} from "@/server/email/welcome-email";
import { leerRecesos } from "@/server/recesses";
import { equipoParaBienvenida } from "@/server/welcome-team";

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
  welcome: (c) => `Te damos la bienvenida a ${c}`,
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
      // 036 — El docente va en el equipo del correo y en copia.
      teacherEmail: schema.teacher.email,
      // 2026-10-20 — La zona de la academia: el horario del correo la nombra.
      timezone: schema.organization.timezone,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .leftJoin(schema.organization, eq(schema.enrollment.organizationId, schema.organization.id))
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

/**
 * El correo de términos declara QUÉ licencias se prestan. Salen de las
 * licencias de esta inscripción, no de un texto fijo: el documento nombra el
 * producto ("AutoCAD") y ese dato ya vive en la base.
 *
 * 034 (FR-020) — Antes era un join (`license.enrollment_id` era UNIQUE). Con
 * el paquete de una especialización caben varias, y un join con `limit 1`
 * nombraba UNA al azar: ahora se listan todas.
 */
async function ownLicenseNames(organizationId: string, enrollmentId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ name: schema.software.name })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId),
        eq(schema.license.assigned, true)
      )
    )
    .orderBy(asc(schema.software.name));
  return rows.map((r) => r.name);
}

/**
 * 2026-10-05 — Las licencias de los MÓDULOS de una especialización.
 *
 * La inscripción madre no tiene licencia propia: el software es de cada
 * módulo, y la licencia se asigna a la inscripción hija (ver
 * `buildModuleLicenseLines`). Sin esto, los términos de un alumno de
 * especialización decían "a confirmar" aunque tuviera Revit y Navisworks
 * asignados.
 */
async function moduleLicenseNames(
  organizationId: string,
  parentEnrollmentId: string
): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ name: schema.software.name })
    .from(schema.enrollment)
    .innerJoin(schema.license, eq(schema.license.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.parentEnrollmentId, parentEnrollmentId),
        eq(schema.license.assigned, true)
      )
    )
    .orderBy(asc(schema.software.name));
  return rows.map((r) => r.name);
}

/** "Revit", "Revit y Navisworks", "AutoCAD, Revit y Navisworks". */
function listaEnPalabras(nombres: string[]): string | null {
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return nombres[0]!;
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function formatDate(d: Date | null): string {
  if (!d) return "a confirmar";
  // Un día de calendario (medianoche UTC): se lee en UTC, no en la zona del servidor.
  return formatCalendarDay(d, { day: "2-digit", month: "long", year: "numeric" });
}

const MODALITY_LABEL: Record<string, string> = {
  en_vivo: "Online en vivo",
  asincronico: "Asincrónico",
  presencial: "Presencial",
  // 036 — La modalidad propia de una edición de taller (`cohort.modality`).
  online: "Online",
};

type Contexto = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

/** 036 — Lo que la cohorte declara usar (`cohort_software`), por nombre. */
async function cohortSoftwareNames(organizationId: string, cohortId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ name: schema.software.name })
    .from(schema.cohortSoftware)
    .innerJoin(schema.software, eq(schema.cohortSoftware.softwareId, schema.software.id))
    .where(
      scoped(
        schema.cohortSoftware.organizationId,
        organizationId,
        eq(schema.cohortSoftware.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.software.name));
  return rows.map((r) => r.name);
}

/**
 * 036 — Cuántas clases tiene la cursada: las reales del cronograma (sin las
 * canceladas) o, si todavía no se generó, las que daría el plan con los
 * recesos que la alcanzan. Sin fecha de fin o sin días, no hay plan: `null`
 * y la fila "Clases" no aparece.
 */
async function classCount(organizationId: string, cohort: Contexto["cohort"]): Promise<number | null> {
  const db = getDb();
  const reales = await db
    .select({ canceledAt: schema.classSession.canceledAt })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, cohort.id)
      )
    );
  let planificadas: number | null = null;
  if (reales.length === 0 && cohort.endDate && cohort.daysOfWeek) {
    const recesos = recesosDeCohorte(await leerRecesos(db, organizationId, [cohort.id]), cohort.id);
    planificadas = buildClassSchedule(cohort.startDate, cohort.endDate, cohort.daysOfWeek, null, recesos).length;
  }
  return cantidadDeClases(
    reales.map((r) => ({ canceled: r.canceledAt !== null })),
    planificadas
  );
}

/** 036 — Los módulos de una especialización, con lo que el correo nombra. */
async function programModules(organizationId: string, parentCohortId: string) {
  return getDb()
    .select({
      id: schema.cohort.id,
      position: schema.cohort.position,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      name: schema.cohort.name,
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
}

/**
 * 036 — Los HECHOS del correo de bienvenida. Todo lo que decide (qué fila
 * aparece, cómo se nombra cada cosa, a quién se copia) vive en
 * `welcome-email.ts`, puro y con tests.
 */
async function welcomeFacts(
  organizationId: string,
  enrollmentId: string,
  ctx: Contexto
): Promise<HechosDeBienvenida> {
  const { contact, cohort, course } = ctx;
  const esEspecializacion = cohort.isSpecialization;
  const [software, licencias, equipo] = [
    await cohortSoftwareNames(organizationId, cohort.id),
    await ownLicenseNames(organizationId, enrollmentId),
    await equipoParaBienvenida(organizationId),
  ];

  let modulos: ModuloDeBienvenida[] = [];
  let fin = cohort.endDate;
  if (esEspecializacion) {
    const filas = await programModules(organizationId, cohort.id);
    modulos = filas.map((m) => ({
      id: m.id,
      position: m.position,
      startDate: m.startDate,
      nombre: m.name ?? m.courseName,
    }));
    // Sin fin cargado en la madre, el programa termina con su último módulo.
    if (!fin) {
      const fines = filas.flatMap((m) => (m.endDate ? [m.endDate.getTime()] : []));
      fin = fines.length > 0 ? new Date(Math.max(...fines)) : null;
    }
  }

  return {
    nombre: contact.firstName,
    correoDelAlumno: contact.email,
    // La especialización se titula con el programa; la camada va en el saludo.
    curso: esEspecializacion ? course.name : (cohort.name ?? course.name),
    camada: cohort.name,
    esEspecializacion,
    inicio: cohort.startDate,
    fin,
    // El horario es texto libre en la hora de la academia: se dice de qué zona,
    // porque hay alumnos en Dominicana y en España.
    horario: cohort.frequency?.trim()
      ? conZona(cohort.frequency.trim(), ctx.timezone ?? ACADEMY_TIME_ZONE)
      : null,
    clases: esEspecializacion ? null : await classCount(organizationId, cohort),
    modalidad: MODALITY_LABEL[cohort.modality ?? course.modality ?? ""] ?? null,
    docente: ctx.teacherName ? { name: ctx.teacherName, email: ctx.teacherEmail } : null,
    soporte: equipo.soporte,
    coordinacion: equipo.coordinacion,
    softwareDeLaCohorte: software,
    licenciasAsignadas: licencias,
    modulos,
    grupoWhatsapp: cohort.whatsappGroupLink ?? "",
  };
}

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

  const { enrollment, contact, cohort, course } = ctx;

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
        "El grupo no tiene enlace de WhatsApp. Cargalo en la edición del grupo.",
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
  // 034 — El paquete (las de esta inscripción) y las de sus módulos, sin repetir.
  const licencias =
    kind === "terms"
      ? listaEnPalabras([
          ...new Set([
            ...(await ownLicenseNames(organizationId, enrollmentId)),
            ...(await moduleLicenseNames(organizationId, enrollmentId)),
          ]),
        ])
      : null;

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
          licencias: licencias ?? "a confirmar",
          academia,
          acento,
          logoUrl,
          contactoSoporte: soporte,
        })
      : null;

  /**
   * 036 — La bienvenida sale del diseño aprobado: un dato que falta omite su
   * fila (nada de "a confirmar" ni de aula), y va con copia al docente (solo
   * en un curso común) y al soporte técnico elegido en Configuración.
   */
  const welcome =
    kind === "welcome" ? await welcomeFacts(organizationId, enrollmentId, ctx) : null;
  const vista = welcome ? armarBienvenida(welcome) : null;
  const welcomeHtml = vista ? renderBienvenida(vista, { academia, acento, logoUrl }) : null;
  const cc = welcome ? copiaDeBienvenida(welcome) : [];

  const sent = await sendMail({
    to: contact.email,
    subject: SUBJECTS[kind](vista ? nombreEnFrase(vista) : courseName),
    html: html ?? welcomeHtml ?? "",
    ...(cc.length > 0 ? { cc } : {}),
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
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    );

  return { ok: true, sentAt: now.toISOString() };
}
