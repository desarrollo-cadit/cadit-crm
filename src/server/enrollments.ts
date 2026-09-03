import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Currency } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizePhoneOrRaw } from "@/lib/phone";
import { fullName } from "@/lib/utils";
import { PORTAL_NO_EMAIL_REASON } from "@/lib/portal-access";
import type { Capability } from "@/lib/capabilities";

/** 005 (US2, contracts/enrollments.md) — alta comercial de una inscripción. */
export type CreateEnrollmentInput = {
  cohortId: string;
  contactId?: string | null;
  contact?: {
    firstName: string;
    lastName?: string | null;
    phone: string;
    email?: string | null;
    nationalId?: string | null;
  };
  amount?: number | null;
  /** 007 — de qué moneda es `amount`. Default UYU. */
  currency?: Currency;
  installments?: number | null;
  paymentNotes?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  sellerId?: string | null;
  companyId?: string | null;
};

export type CreateEnrollmentResult =
  | { ok: true; enrollment: EnrollmentCommercialDto }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * Crea (o reutiliza) el contacto y la inscripción en una sola llamada
 * (contracts/enrollments.md). Los duplicados de email/celular/inscripción NO
 * se pre-chequean acá: el INSERT choca con los índices únicos (T002) y el
 * error (code 23505) sube sin capturar para que `withAuth` lo mapee a 409
 * (DV-002) — así no se crea un contacto parcial ni una inscripción duplicada.
 */
export async function createEnrollment(
  organizationId: string,
  input: CreateEnrollmentInput
): Promise<CreateEnrollmentResult> {
  const db = getDb();

  if (!input.contactId && !input.contact) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "Falta contactId o los datos de contacto (contact)",
    };
  }

  const cohortRows = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, input.cohortId)
      )
    )
    .limit(1);
  if (!cohortRows[0]) {
    return { ok: false, status: 422, code: "invalid_body", message: "Cohorte inexistente" };
  }

  if (input.sellerId) {
    const memberRows = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        scoped(
          schema.member.organizationId,
          organizationId,
          eq(schema.member.userId, input.sellerId)
        )
      )
      .limit(1);
    if (!memberRows[0]) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: "sellerId no es miembro de la organización",
      };
    }
  }

  if (input.companyId) {
    const companyRows = await db
      .select({ id: schema.company.id })
      .from(schema.company)
      .where(
        scoped(schema.company.organizationId, organizationId, eq(schema.company.id, input.companyId))
      )
      .limit(1);
    if (!companyRows[0]) {
      return { ok: false, status: 422, code: "invalid_body", message: "Empresa inexistente" };
    }
  }

  let contactId: string;
  let nationalIdForRecord: string | null;

  if (input.contactId) {
    const contactRows = await db
      .select({ id: schema.contact.id, nationalId: schema.contact.nationalId })
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          organizationId,
          eq(schema.contact.id, input.contactId)
        )
      )
      .limit(1);
    if (!contactRows[0]) {
      return { ok: false, status: 422, code: "invalid_body", message: "Contacto inexistente" };
    }
    contactId = contactRows[0].id;
    nationalIdForRecord = contactRows[0].nationalId;
  } else {
    const phone = normalizePhoneOrRaw(input.contact!.phone);
    const inserted = await db
      .insert(schema.contact)
      .values({
        id: newId("contact"),
        organizationId,
        firstName: input.contact!.firstName,
        lastName: input.contact!.lastName ?? null,
        phone,
        waIdentity: phone,
        email: input.contact!.email ?? null,
        nationalId: input.contact!.nationalId ?? null,
      })
      .returning();
    contactId = inserted[0]!.id;
    nationalIdForRecord = input.contact!.nationalId ?? null;
  }

  // Primera etapa abierta de la organización (mismo criterio que onLeadActivity).
  const stageRows = await db
    .select({ id: schema.pipelineStage.id })
    .from(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.organizationId, organizationId),
        eq(schema.pipelineStage.kind, "open")
      )
    )
    .orderBy(asc(schema.pipelineStage.position))
    .limit(1);
  const stageId = stageRows[0]?.id;
  if (!stageId) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "La organización no tiene etapas abiertas",
    };
  }

  const inserted = await db
    .insert(schema.enrollment)
    .values({
      id: newId("enrollment"),
      organizationId,
      contactId,
      cohortId: input.cohortId,
      stageId,
      enrolledAt: new Date(),
      amount: input.amount ?? null,
      currency: input.currency ?? "UYU",
      installments: input.installments ?? null,
      paymentNotes: input.paymentNotes ?? null,
      nationalId: nationalIdForRecord,
      invoiceNumber: input.invoiceNumber ?? null,
      receiptNumber: input.receiptNumber ?? null,
      sellerId: input.sellerId ?? null,
      companyId: input.companyId ?? null,
    })
    .returning();

  return { ok: true, enrollment: serializeEnrollmentCommercial(inserted[0]!) };
}

export type EnrollmentCommercialDto = {
  id: string;
  contactId: string;
  cohortId: string | null;
  stageId: string;
  amount: number | null;
  /** 007 — de qué moneda es `amount`: dos alumnos de la MISMA cohorte pueden pagar en monedas distintas. */
  currency: Currency;
  installments: number | null;
  paymentNotes: string | null;
  nationalId: string | null;
  invoiceNumber: string | null;
  receiptNumber: string | null;
  sellerId: string | null;
  companyId: string | null;
  createdAt: string;
};

/* ============================================================
 * US3 — Roster de cohorte compartido + checklist de onboarding
 * (contracts/cohort-roster.md)
 * ============================================================ */

export type CohortRosterDto = {
  cohort: {
    id: string;
    courseId: string;
    /** 005 iteración 2 — nombre propio de la cohorte; null = usar courseName. */
    name: string | null;
    courseName: string;
    startDate: string;
    endDate: string | null;
    /** Software declarado por la cohorte (cohort_software) — opciones para asignar licencia. */
    software: { id: string; name: string }[];
    /** 007 — sin enlace no se puede mandar la bienvenida; la UI lo avisa. */
    whatsappGroupLink: string | null;
  };
  enrollments: RosterEntryDto[];
};

export type RosterEntryDto = {
  id: string;
  /** 013 — `id` para enlazar al legajo desde el roster. */
  contact: { id: string; name: string; phone: string | null; email: string | null };
  checklist: {
    /** 005 (DV-004) — leído de license.assigned, NO se duplica en enrollment. */
    licenseAssigned: boolean;
    /** software.id de la licencia asignada, si `licenseAssigned` es true. */
    licenseSoftwareId: string | null;
    termsEmailSentAt: string | null;
    softwareInstalledAt: string | null;
    hadOwnLicense: boolean;
    academiaOnlineAccessAt: string | null;
  };
  /** 007 — cuándo se envió la bienvenida + invitación al grupo; null = nunca. */
  welcomeEmailSentAt: string | null;
  /**
   * 012 (T017/T017d) — Acceso al portal del alumno.
   *
   * `blockedReason` viaja en el DTO para que la pantalla pueda decir POR QUÉ
   * no se puede invitar, en vez de ofrecer un botón que devuelve 422. De los
   * 340 alumnos importados, 6 no tienen correo.
   */
  portalAccess: {
    granted: boolean;
    suspended: boolean;
    blockedReason: string | null;
  };
  // Campos financieros — SOLO presentes con `cobranza.ver` (FR-016).
  amount?: number | null;
  currency?: Currency;
  installments?: number | null;
  paymentNotes?: string | null;
  nationalId?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  sellerId?: string | null;
  companyId?: string | null;
};

/**
 * 005 (T022, FR-014/FR-016/FR-017) — DTO por CAPACIDAD: sin `cobranza.ver`
 * los campos financieros NUNCA se arman en el objeto de respuesta (regla dura
 * de servidor, no un filtro de UI) — separada de `getCohortRoster` para poder
 * testear la regla sin tocar la DB.
 *
 * 012 (T029) — Antes decía `role === "soporte"`. Con los roles renombrados y
 * editables desde la pantalla, ese nombre dejó de ser la verdad: la pregunta
 * correcta es si la sesión puede ver cobranza. Un test estructural
 * (`migracion-cuentas.test.ts`) impide que vuelva a colarse una comparación
 * por nombre — y fue justamente ese test el que encontró esta.
 */
export function buildRosterEntry(
  capabilities: readonly Capability[],
  enrollment: typeof schema.enrollment.$inferSelect,
  contact: typeof schema.contact.$inferSelect,
  license: typeof schema.license.$inferSelect | null,
  /** 012 — vínculo de portal del alumno; `null` = todavía no tiene acceso. */
  accountLink: typeof schema.accountLink.$inferSelect | null = null
): RosterEntryDto {
  const base: RosterEntryDto = {
    id: enrollment.id,
    contact: {
      id: contact.id,
      name: fullName(contact),
      phone: contact.phone,
      email: contact.email,
    },
    portalAccess: {
      granted: Boolean(accountLink),
      suspended: Boolean(accountLink?.suspendedAt),
      // Ya tiene acceso → no hay nada que desbloquear. Sin correo → el motivo.
      blockedReason: accountLink || contact.email ? null : PORTAL_NO_EMAIL_REASON,
    },
    checklist: {
      licenseAssigned: license?.assigned ?? false,
      licenseSoftwareId: license?.assigned ? license.softwareId : null,
      termsEmailSentAt: enrollment.termsEmailSentAt?.toISOString() ?? null,
      softwareInstalledAt: enrollment.softwareInstalledAt?.toISOString() ?? null,
      hadOwnLicense: enrollment.hadOwnLicense,
      academiaOnlineAccessAt: enrollment.academiaOnlineAccessAt?.toISOString() ?? null,
    },
    welcomeEmailSentAt: enrollment.welcomeEmailSentAt?.toISOString() ?? null,
  };
  if (!capabilities.includes("cobranza.ver")) return base;
  return {
    ...base,
    amount: enrollment.amount,
    currency: enrollment.currency,
    installments: enrollment.installments,
    paymentNotes: enrollment.paymentNotes,
    nationalId: enrollment.nationalId,
    invoiceNumber: enrollment.invoiceNumber,
    receiptNumber: enrollment.receiptNumber,
    sellerId: enrollment.sellerId,
    companyId: enrollment.companyId,
  };
}

/** 005 (T022) — roster completo de una cohorte; el DTO varía según CAPACIDADES. */
export async function getCohortRoster(
  organizationId: string,
  cohortId: string,
  capabilities: readonly Capability[]
): Promise<CohortRosterDto | null> {
  const db = getDb();

  const cohortRows = await db
    .select({
      id: schema.cohort.id,
      courseId: schema.cohort.courseId,
      name: schema.cohort.name,
      courseName: schema.course.name,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      whatsappGroupLink: schema.cohort.whatsappGroupLink,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId))
    )
    .limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return null;

  const softwareRows = await db
    .select({ id: schema.software.id, name: schema.software.name })
    .from(schema.cohortSoftware)
    .innerJoin(schema.software, eq(schema.software.id, schema.cohortSoftware.softwareId))
    .where(
      scoped(
        schema.cohortSoftware.organizationId,
        organizationId,
        eq(schema.cohortSoftware.cohortId, cohortId)
      )
    );

  const rows = await db
    .select({
      enrollment: schema.enrollment,
      contact: schema.contact,
      license: schema.license,
      accountLink: schema.accountLink,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.license, eq(schema.license.enrollmentId, schema.enrollment.id))
    // 012 — el acceso al portal es del CONTACTO, no de la inscripción: la
    // misma persona puede cursar tres veces y entra con una sola cuenta. Va
    // como join y no como consulta por fila para no volver la lista un N+1.
    .leftJoin(
      schema.accountLink,
      and(
        eq(schema.accountLink.contactId, schema.contact.id),
        eq(schema.accountLink.kind, "alumno"),
        eq(schema.accountLink.organizationId, organizationId)
      )
    )
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.contact.firstName));

  return {
    cohort: {
      id: cohort.id,
      courseId: cohort.courseId,
      name: cohort.name,
      courseName: cohort.courseName,
      startDate: cohort.startDate.toISOString(),
      endDate: cohort.endDate?.toISOString() ?? null,
      software: softwareRows,
      whatsappGroupLink: cohort.whatsappGroupLink,
    },
    enrollments: rows.map((r) =>
      buildRosterEntry(capabilities, r.enrollment, r.contact, r.license, r.accountLink)
    ),
  };
}

export function csvField(value: string | null): string {
  let v = value ?? "";
  // Anti inyección de fórmulas: Excel/Sheets ejecutan una celda que arranca con
  // = + - @ (o tab/CR, que algunos parsers descartan antes de mirar el resto).
  // El nombre puede venir de un formulario público SIN autenticar, así que un
  // `=HYPERLINK(...)` o un `=cmd|...` llegaría hasta la máquina de quien abre
  // el export. El apóstrofo inicial hace que la planilla lo trate como texto.
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  // RFC 4180: entrecomillar si tiene coma, comilla o salto de línea; comillas escapadas duplicándolas.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Iteración 6 (feedback en vivo: "exportar en formato csv los alumnos de esa
 * cohorte, solo nombre apellido y correo") — deliberadamente NO reusa
 * `getCohortRoster`/`buildRosterEntry` (esos exponen mucho más que 3 campos,
 * y acá el pedido es explícito: sin monto/factura/checklist/teléfono en el
 * archivo exportado).
 */
export async function exportCohortRosterCsv(
  organizationId: string,
  cohortId: string
): Promise<string | null> {
  const db = getDb();
  const cohortRows = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohortRows[0]) return null;

  const rows = await db
    .select({
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.contact.firstName));

  const lines = [
    "nombre,apellido,correo",
    ...rows.map((r) => [csvField(r.firstName), csvField(r.lastName), csvField(r.email)].join(",")),
  ];
  return lines.join("\r\n");
}

/** 005 (T023, FR-013/FR-014) — checklist de onboarding, accesible a cualquier rol. */
export type ChecklistInput = {
  termsEmailSentAt?: "now" | null;
  softwareInstalledAt?: "now" | null;
  hadOwnLicense?: boolean;
  academiaOnlineAccessAt?: "now" | null;
};

export async function updateChecklist(
  organizationId: string,
  enrollmentId: string,
  input: ChecklistInput
) {
  const db = getDb();
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (input.termsEmailSentAt !== undefined) {
    set.termsEmailSentAt = input.termsEmailSentAt === "now" ? now : null;
  }
  if (input.softwareInstalledAt !== undefined) {
    set.softwareInstalledAt = input.softwareInstalledAt === "now" ? now : null;
  }
  if (input.hadOwnLicense !== undefined) {
    set.hadOwnLicense = input.hadOwnLicense;
  }
  if (input.academiaOnlineAccessAt !== undefined) {
    set.academiaOnlineAccessAt = input.academiaOnlineAccessAt === "now" ? now : null;
  }

  const updated = await db
    .update(schema.enrollment)
    .set(set)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .returning();
  return updated[0] ?? null;
}

export function serializeEnrollmentCommercial(
  e: typeof schema.enrollment.$inferSelect
): EnrollmentCommercialDto {
  return {
    id: e.id,
    contactId: e.contactId,
    cohortId: e.cohortId,
    stageId: e.stageId,
    amount: e.amount,
    currency: e.currency,
    installments: e.installments,
    paymentNotes: e.paymentNotes,
    nationalId: e.nationalId,
    invoiceNumber: e.invoiceNumber,
    receiptNumber: e.receiptNumber,
    sellerId: e.sellerId,
    companyId: e.companyId,
    createdAt: e.createdAt.toISOString(),
  };
}

export type UpdateEnrollmentCommercialInput = Partial<{
  amount: number | null;
  currency: Currency;
  installments: number | null;
  paymentNotes: string | null;
  nationalId: string | null;
  invoiceNumber: string | null;
  receiptNumber: string | null;
  sellerId: string | null;
  companyId: string | null;
}>;

export type UpdateEnrollmentCommercialResult =
  | { ok: true; enrollment: EnrollmentCommercialDto }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * 005 iteración 2 — edita los datos comerciales de una inscripción YA
 * creada (cédula, factura, recibo, empresa, monto, cuotas, vendedor); antes
 * solo se podían fijar al inscribir (feedback en vivo del dueño). Solo toca
 * los campos presentes en `input`, mismo patrón que `updateChecklist`. El
 * gate de acceso completo (FR-016) vive en la ruta
 * (`requireCapability("inscripciones.editar")`), igual que el resto de la
 * sección financiera del roster.
 */
export async function updateEnrollmentCommercial(
  organizationId: string,
  enrollmentId: string,
  input: UpdateEnrollmentCommercialInput
): Promise<UpdateEnrollmentCommercialResult> {
  const db = getDb();

  if (input.sellerId) {
    const memberRows = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        scoped(
          schema.member.organizationId,
          organizationId,
          eq(schema.member.userId, input.sellerId)
        )
      )
      .limit(1);
    if (!memberRows[0]) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: "sellerId no es miembro de la organización",
      };
    }
  }

  if (input.companyId) {
    const companyRows = await db
      .select({ id: schema.company.id })
      .from(schema.company)
      .where(
        scoped(schema.company.organizationId, organizationId, eq(schema.company.id, input.companyId))
      )
      .limit(1);
    if (!companyRows[0]) {
      return { ok: false, status: 422, code: "invalid_body", message: "Empresa inexistente" };
    }
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.amount !== undefined) set.amount = input.amount;
  if (input.currency !== undefined) set.currency = input.currency;
  if (input.installments !== undefined) set.installments = input.installments;
  if (input.paymentNotes !== undefined) set.paymentNotes = input.paymentNotes;
  if (input.nationalId !== undefined) set.nationalId = input.nationalId;
  if (input.invoiceNumber !== undefined) set.invoiceNumber = input.invoiceNumber;
  if (input.receiptNumber !== undefined) set.receiptNumber = input.receiptNumber;
  if (input.sellerId !== undefined) set.sellerId = input.sellerId;
  if (input.companyId !== undefined) set.companyId = input.companyId;

  const updated = await db
    .update(schema.enrollment)
    .set(set)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .returning();
  const row = updated[0];
  if (!row) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  return { ok: true, enrollment: serializeEnrollmentCommercial(row) };
}
