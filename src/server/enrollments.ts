import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Currency } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizePhoneOrRaw } from "@/lib/phone";
import {
  identidadProvisional,
  mensajeDeDuplicado,
  normalizarCorreo,
} from "@/lib/contact-identity";
import { correoDeLicencia } from "@/lib/license-email";
import { buscarContactoDuplicado, type ContactoDuplicado } from "@/server/contact-duplicates";
import { fullName } from "@/lib/utils";
import { PORTAL_NO_EMAIL_REASON } from "@/lib/portal-access";
import type { Capability } from "@/lib/capabilities";
import type { CourseKind } from "@/lib/course-kind";
import {
  exigeVendedor,
  reglaDeVendedorAlEditar,
  verificarVendedorParaVenta,
  VENDEDOR_OBLIGATORIO,
} from "@/server/sellers";
import {
  listarHijasDeVarias,
  listarModulos,
  verificarVinculoDeInscripcion,
} from "@/server/program-modules";
import { inscribirEnModulos, olvidarExclusion } from "@/server/module-enrollment";
import { completarEmpresaDelContacto } from "@/server/contact-company";
import { resumirLicencias } from "@/lib/license-rules";
import {
  listarProgramasDelGrupo,
  sincronizarLicenciasDelGrupo,
  type GroupLicenseDto,
} from "@/server/group-licenses";
import { softwareDelGrupo } from "@/server/licenses";
import { esVentaParaAviso } from "@/lib/billing-notices";
import { avisarAAdministracion } from "@/server/billing-notices-queue";
import { csvField } from "@/lib/csv";

/** 005 (US2, contracts/enrollments.md) — alta comercial de una inscripción. */
export type CreateEnrollmentInput = {
  cohortId: string;
  contactId?: string | null;
  /**
   * 2026-10-21 — Teléfono O correo (la ruta exige al menos uno). Sin
   * teléfono, el contacto nace con identidad provisional (`sinwa:<id>`).
   */
  contact?: {
    firstName: string;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    nationalId?: string | null;
  };
  /** 2026-10-21 — Correo para la licencia, si no es el del alumno. */
  licenseEmail?: string | null;
  amount?: number | null;
  /** 007 — de qué moneda es `amount`. Default UYU. */
  currency?: Currency;
  installments?: number | null;
  paymentNotes?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  sellerId?: string | null;
  companyId?: string | null;
  /**
   * 028 (FR-006/FR-008) — La inscripción MADRE de la que ésta es un módulo.
   * null/omitido = inscripción normal, el estado de las 384 filas reales.
   *
   * La madre lleva el paquete cerrado; esta hija apunta con su `cohortId` a
   * la corrida del módulo que la persona realmente cursa, que puede ser la de
   * otra especialización (la recursada de la regla 4).
   *
   * No lo valida todavía el Zod de `/api/enrollments`: el alta de un
   * recorrido llega en la fase 2. El guarda, en cambio, ya corre.
   */
  parentEnrollmentId?: string | null;
};

export type CreateEnrollmentResult =
  | { ok: true; enrollment: EnrollmentCommercialDto }
  | { ok: false; status: 422; code: "invalid_body" | "seller_required"; message: string }
  /** 2026-10-21 — Teléfono o correo de otro contacto: se nombra para poder usarlo. */
  | { ok: false; status: 409; code: "duplicate"; message: string; duplicado: ContactoDuplicado };

/**
 * Crea (o reutiliza) el contacto y la inscripción en una sola llamada
 * (contracts/enrollments.md). Los duplicados de email/celular/inscripción NO
 * se pre-chequean acá: el INSERT choca con los índices únicos (T002) y el
 * error (code 23505) sube sin capturar para que `withAuth` lo mapee a 409
 * (DV-002) — así no se crea un contacto parcial ni una inscripción duplicada.
 */
export async function createEnrollment(
  organizationId: string,
  input: CreateEnrollmentInput,
  /**
   * 041 — `avisoInterno: false` para los guiones (demo, cargas): una carga
   * masiva no le manda un correo por alumno a Administración.
   */
  opts: { avisoInterno?: boolean } = {}
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
    // 028 (FR-010) — `parent_cohort_id` viaja en la consulta que YA se hacía
    // para verificar que la cohorte existe: saber si es un módulo no le
    // agrega una lectura al alta de las cohortes simples.
    .select({
      id: schema.cohort.id,
      parentCohortId: schema.cohort.parentCohortId,
      // 033 (FR-004) — una cohorte de taller no exige vendedor.
      courseKind: schema.course.kind,
      // 034 (FR-002) — inscribir en una especialización inscribe en sus módulos.
      isSpecialization: schema.cohort.isSpecialization,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, input.cohortId)
      )
    )
    .limit(1);
  if (!cohortRows[0]) {
    return { ok: false, status: 422, code: "invalid_body", message: "Grupo inexistente" };
  }

  /**
   * 028 (FR-009/FR-010) — El recorrido, antes de crear nada.
   *
   * Se llama SIEMPRE, también sin madre declarada: la mitad de FR-010 que
   * importa es la que rechaza una inscripción SUELTA contra una cohorte de
   * módulo, y esa se rompe justamente cuando nadie declara nada. Para las
   * cohortes sin padre —las 33 simples— devuelve `null` y no cambia nada
   * (FR-032).
   */
  const treeError = await verificarVinculoDeInscripcion(db, organizationId, {
    inscripcionId: null,
    cohorteId: input.cohortId,
    cohorteEsModulo: cohortRows[0].parentCohortId != null,
    madreId: input.parentEnrollmentId ?? null,
  });
  if (treeError) {
    return { ok: false, status: 422, code: "invalid_body", message: treeError.message };
  }

  /**
   * 2026-10-06 — Toda inscripción en una cohorte es una venta y lleva
   * vendedor; la hija de una especialización no (la venta es la madre). Antes
   * de crear nada: un 422 después de insertar el contacto dejaría un contacto
   * suelto, porque devolver un error no revierte la transacción.
   */
  const nueva = {
    cohortId: input.cohortId,
    parentEnrollmentId: input.parentEnrollmentId ?? null,
    courseKind: cohortRows[0].courseKind,
  };
  if (exigeVendedor(nueva) && !input.sellerId) {
    return { ok: false, status: 422, code: "seller_required", message: VENDEDOR_OBLIGATORIO };
  }
  if (input.sellerId) {
    const sellerError = await verificarVendedorParaVenta(organizationId, input.sellerId);
    if (sellerError) {
      return { ok: false, status: 422, code: "invalid_body", message: sellerError };
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
    const phone = input.contact!.phone ? normalizePhoneOrRaw(input.contact!.phone) : null;
    const email = normalizarCorreo(input.contact!.email);
    // 2026-10-21 — El duplicado se NOMBRA antes de crear nada (la pantalla
    // ofrece "usar ese contacto"). El índice único sigue cubriendo la carrera.
    const duplicado = await buscarContactoDuplicado(organizationId, { phone, email });
    if (duplicado) {
      return {
        ok: false,
        status: 409,
        code: "duplicate",
        message: mensajeDeDuplicado(duplicado.campo, duplicado.contacto.name),
        duplicado,
      };
    }
    const nuevoId = newId("contact");
    const inserted = await db
      .insert(schema.contact)
      .values({
        id: nuevoId,
        organizationId,
        firstName: input.contact!.firstName,
        lastName: input.contact!.lastName ?? null,
        phone,
        waIdentity: phone ?? identidadProvisional(nuevoId),
        email,
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
      parentEnrollmentId: input.parentEnrollmentId ?? null,
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
      licenseEmail: normalizarCorreo(input.licenseEmail),
    })
    .returning();
  const creada = inserted[0]!;

  // 043 — La empresa de la venta completa la de la persona si estaba vacía.
  await completarEmpresaDelContacto(organizationId, contactId, input.companyId);

  if (input.parentEnrollmentId) {
    // 034 (FR-004) — Volver a un módulo por el alta manual de 028 pisa la
    // decisión de haberlo sacado: la regularización deja de excluirlo.
    await olvidarExclusion(organizationId, input.parentEnrollmentId, input.cohortId);
  } else if (cohortRows[0].isSpecialization) {
    // 034 (FR-002/FR-003) — La madre nueva entra a cada módulo que ya existe,
    // en la misma transacción, sin cuotas ni vendedor. Si falla, LANZA: no
    // queda una inscripción a la especialización con la mitad de los módulos.
    await inscribirEnModulos(organizationId, input.cohortId, { madreIds: [creada.id] });
  }

  // 035 (FR-004) — Las licencias del grupo de la cohorte. Sin stock la
  // inscripción se guarda igual: el faltante se ve en la cohorte y en
  // Licencias. Las hijas automáticas las reciben en `inscribirEnModulos`.
  await sincronizarLicenciasDelGrupo(organizationId, [creada.id]);

  // 041 — Una VENTA (madre con cohorte, no taller) le avisa a Administración
  // para facturarla, con copia al vendedor: encolada acá, mandada tras el commit.
  if (opts.avisoInterno !== false && esVentaParaAviso(nueva)) {
    await avisarAAdministracion(organizationId, { kind: "inscripcion_nueva", enrollmentId: creada.id });
  }

  return { ok: true, enrollment: serializeEnrollmentCommercial(creada) };
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
    /**
     * 2026-10-05 — La especialización no tiene software propio: las licencias
     * se asignan por módulo (`RosterEntryDto.moduleLicenses`).
     */
    isSpecialization: boolean;
    /**
     * 035 (US1/US2) — Los programas asignados a TODO el grupo. En la ficha de
     * cada alumno figuran "Asignado al grupo", sin control individual.
     */
    groupLicenses: GroupLicenseDto[];
  };
  enrollments: RosterEntryDto[];
};

/**
 * 2026-10-05 (decisión del dueño) — Una línea de licencia por módulo, en el
 * roster de una especialización.
 *
 * La licencia se asigna a la inscripción HIJA del módulo (`enrollmentId`), con
 * el software de ESE módulo: una persona puede necesitar Revit en uno y
 * Navisworks en otro. `enrollmentId` null = no cursa ese módulo; la pantalla
 * lo dice sin ofrecer nada.
 *
 * 034 (FR-020) — Una hija puede tener VARIAS licencias (una por programa):
 * `licenseSoftwareIds` las trae todas; `licenseSoftwareId` sigue siendo la
 * primera, para quien todavía lee la forma vieja.
 */
export type ModuleLicenseLine = {
  moduleName: string;
  enrollmentId: string | null;
  software: { id: string; name: string }[];
  licenseAssigned: boolean;
  licenseSoftwareId: string | null;
  licenseSoftwareIds: string[];
  /**
   * 035 (FR-007/FR-012) — Los programas del grupo de la cohorte del MÓDULO:
   * en esa línea van "Asignado al grupo", sin control. Ausente si quien arma
   * las líneas no los consultó.
   */
  groupSoftware?: { id: string; name: string }[];
};

export type RosterEntryDto = {
  id: string;
  /** 013 — `id` para enlazar al legajo desde el roster. */
  contact: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    /** Dado de baja: el contacto se archivó y la inscripción quedó en la cohorte. */
    archived: boolean;
  };
  checklist: {
    /** 005 (DV-004) — leído de license.assigned, NO se duplica en enrollment. */
    licenseAssigned: boolean;
    /** software.id de la licencia asignada, si `licenseAssigned` es true. */
    licenseSoftwareId: string | null;
    /**
     * 034 (FR-020) — TODAS las licencias asignadas (el paquete de una
     * especialización puede llevar Revit, Navisworks y AutoCAD).
     * `licenseSoftwareId` es la primera de esta lista.
     */
    licenseSoftwareIds: string[];
    termsEmailSentAt: string | null;
    softwareInstalledAt: string | null;
    hadOwnLicense: boolean;
    academiaOnlineAccessAt: string | null;
  };
  /** 007 — cuándo se envió la bienvenida + invitación al grupo; null = nunca. */
  welcomeEmailSentAt: string | null;
  /**
   * 2026-10-21 — El correo de la licencia (`correoDeLicencia`):
   * `license_email ?? contact.email`, con `distinto` para la marca. Viaja
   * donde ya viaja el correo del alumno, ni más ni menos.
   */
  licenseEmail: { email: string | null; distinto: boolean; propio: string | null };
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
    /** 2026-10-05 — último correo de acceso aceptado por Graph; null = sin registro. */
    emailSentAt: string | null;
  };
  /** 2026-10-05 — Solo en el roster de una especialización: una línea por módulo. */
  moduleLicenses?: ModuleLicenseLine[];
  // Campos financieros — SOLO presentes con `cobranza.ver` (FR-016).
  amount?: number | null;
  currency?: Currency;
  installments?: number | null;
  paymentNotes?: string | null;
  nationalId?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  sellerId?: string | null;
  /**
   * 2026-10-06 — El vendedor, con nombre, para mostrarlo en el roster.
   * `null` = la venta no tiene vendedor ("Sin vendedor"). Va con los campos
   * comerciales y no suelto: es el dato con el que se paga una comisión.
   */
  seller?: { id: string; name: string; archived: boolean } | null;
  /** Falso en la hija de un módulo: el vendedor lo lleva la madre. */
  sellerRequired?: boolean;
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
  /**
   * 034 (FR-020) — Las licencias de la inscripción: una lista desde que caben
   * varias. Una fila suelta o `null` se siguen aceptando (la forma de 005).
   */
  license:
    | Pick<typeof schema.license.$inferSelect, "assigned" | "softwareId">
    | readonly Pick<typeof schema.license.$inferSelect, "assigned" | "softwareId">[]
    | null,
  /** 012 — vínculo de portal del alumno; `null` = todavía no tiene acceso. */
  accountLink: typeof schema.accountLink.$inferSelect | null = null,
  /** 2026-10-06 — el vendedor de la inscripción; `null` = sin vendedor. */
  seller: Pick<typeof schema.seller.$inferSelect, "id" | "name" | "archivedAt"> | null = null,
  /** 033 (FR-004) — el tipo del curso de la cohorte: un taller no lleva vendedor. */
  courseKind: CourseKind | null = null
): RosterEntryDto {
  const licencias = resumirLicencias(
    license === null ? [] : "softwareId" in license ? [license] : license
  );
  const base: RosterEntryDto = {
    id: enrollment.id,
    contact: {
      id: contact.id,
      name: fullName(contact),
      phone: contact.phone,
      email: contact.email,
      archived: contact.archivedAt !== null,
    },
    portalAccess: {
      granted: Boolean(accountLink),
      suspended: Boolean(accountLink?.suspendedAt),
      // Ya tiene acceso → no hay nada que desbloquear. Sin correo → el motivo.
      blockedReason: accountLink || contact.email ? null : PORTAL_NO_EMAIL_REASON,
      emailSentAt: accountLink?.invitationEmailSentAt?.toISOString() ?? null,
    },
    checklist: {
      ...licencias,
      termsEmailSentAt: enrollment.termsEmailSentAt?.toISOString() ?? null,
      softwareInstalledAt: enrollment.softwareInstalledAt?.toISOString() ?? null,
      hadOwnLicense: enrollment.hadOwnLicense,
      academiaOnlineAccessAt: enrollment.academiaOnlineAccessAt?.toISOString() ?? null,
    },
    welcomeEmailSentAt: enrollment.welcomeEmailSentAt?.toISOString() ?? null,
    licenseEmail: {
      ...correoDeLicencia({ licenseEmail: enrollment.licenseEmail, contactEmail: contact.email }),
      // Lo cargado a mano (para editarlo); null = usa el del alumno.
      propio: enrollment.licenseEmail,
    },
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
    seller: seller
      ? { id: seller.id, name: seller.name, archived: seller.archivedAt !== null }
      : null,
    sellerRequired: exigeVendedor({ ...enrollment, courseKind }),
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
      isSpecialization: schema.cohort.isSpecialization,
      courseKind: schema.course.kind,
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
      seller: {
        id: schema.seller.id,
        name: schema.seller.name,
        archivedAt: schema.seller.archivedAt,
      },
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.license, eq(schema.license.enrollmentId, schema.enrollment.id))
    .leftJoin(schema.seller, eq(schema.seller.id, schema.enrollment.sellerId))
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

  /**
   * 034 (FR-020) — Con varias licencias por inscripción, el leftJoin trae una
   * fila POR LICENCIA. Se agrupan acá por inscripción (respetando el orden):
   * sin esto, una persona con el paquete de tres programas aparecía tres veces
   * en el roster.
   */
  const porInscripcion = new Map<string, { fila: (typeof rows)[number]; licencias: NonNullable<(typeof rows)[number]["license"]>[] }>();
  for (const r of rows) {
    const grupo = porInscripcion.get(r.enrollment.id) ?? { fila: r, licencias: [] };
    if (r.license) grupo.licencias.push(r.license);
    porInscripcion.set(r.enrollment.id, grupo);
  }

  const groupLicenses = (await listarProgramasDelGrupo(organizationId, cohortId)) ?? [];

  const enrollments = [...porInscripcion.values()].map(({ fila: r, licencias }) =>
    buildRosterEntry(
      capabilities,
      r.enrollment,
      r.contact,
      licencias,
      r.accountLink,
      r.seller,
      cohort.courseKind
    )
  );

  if (cohort.isSpecialization) {
    const lineas = await moduleLicensesFor(
      organizationId,
      cohortId,
      enrollments.map((e) => e.id)
    );
    for (const e of enrollments) e.moduleLicenses = lineas.get(e.id) ?? [];
  }

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
      isSpecialization: cohort.isSpecialization,
      groupLicenses,
    },
    enrollments,
  };
}

type ModuloDeEspecializacion = {
  id: string;
  name: string | null;
  courseId: string;
  courseName: string;
};

type InscripcionHija = {
  id: string;
  cohortId: string | null;
  courseId: string | null;
  cohortName: string | null;
  courseName: string | null;
};

/**
 * 2026-10-05 — Las líneas de licencia de UN alumno de especialización. Pura.
 *
 * Una por módulo, en el orden del recorrido. La hija que cubre un módulo es la
 * de esa cohorte o, si no, la de otra corrida del MISMO curso: una recursada
 * en la camada siguiente (028, FR-008). La línea muestra lo que la persona
 * realmente cursa —el nombre y el software de la cohorte de la hija—, porque
 * la licencia es para esa cursada.
 */
export function buildModuleLicenseLines(
  modules: readonly ModuloDeEspecializacion[],
  children: readonly InscripcionHija[],
  softwareByCohort: ReadonlyMap<string, { id: string; name: string }[]>,
  /** 034 — Una o VARIAS licencias por hija (la forma de 005 se sigue aceptando). */
  licenseByEnrollment: ReadonlyMap<
    string,
    { assigned: boolean; softwareId: string } | readonly { assigned: boolean; softwareId: string }[]
  >,
  /** 035 — los programas del grupo por cohorte de módulo; sin él, no se informan. */
  groupByCohort?: ReadonlyMap<string, { id: string; name: string }[]>
): ModuleLicenseLine[] {
  const usadas = new Set<string>();
  return modules.map((m) => {
    const hija =
      children.find((c) => !usadas.has(c.id) && c.cohortId === m.id) ??
      children.find((c) => !usadas.has(c.id) && c.courseId === m.courseId);
    if (!hija) {
      return {
        moduleName: m.name ?? m.courseName,
        enrollmentId: null,
        software: [],
        licenseAssigned: false,
        licenseSoftwareId: null,
        licenseSoftwareIds: [],
        ...(groupByCohort ? { groupSoftware: [] } : {}),
      };
    }
    usadas.add(hija.id);
    const licencia = licenseByEnrollment.get(hija.id);
    return {
      moduleName: hija.cohortName ?? hija.courseName ?? m.name ?? m.courseName,
      enrollmentId: hija.id,
      software: (hija.cohortId && softwareByCohort.get(hija.cohortId)) || [],
      ...resumirLicencias(
        licencia === undefined ? [] : "softwareId" in licencia ? [licencia] : licencia
      ),
      ...(groupByCohort
        ? { groupSoftware: (hija.cohortId && groupByCohort.get(hija.cohortId)) || [] }
        : {}),
    };
  });
}

/** Las líneas de licencia por módulo de todos los alumnos de una especialización. */
async function moduleLicensesFor(
  organizationId: string,
  specializationCohortId: string,
  motherEnrollmentIds: readonly string[]
): Promise<Map<string, ModuleLicenseLine[]>> {
  const db = getDb();
  const modulos = await listarModulos(organizationId, specializationCohortId);
  const hijas = await listarHijasDeVarias(organizationId, motherEnrollmentIds);

  const courseIds = [...new Set(modulos.map((m) => m.courseId))];
  const cursos = courseIds.length
    ? await db
        .select({ id: schema.course.id, name: schema.course.name })
        .from(schema.course)
        .where(scoped(schema.course.organizationId, organizationId, inArray(schema.course.id, courseIds)))
    : [];
  const nombreCurso = new Map(cursos.map((c) => [c.id, c.name]));

  const cohortIds = [
    ...new Set(hijas.map((h) => h.cohortId).filter((id): id is string => Boolean(id))),
  ];
  const software = cohortIds.length
    ? await db
        .select({
          cohortId: schema.cohortSoftware.cohortId,
          id: schema.software.id,
          name: schema.software.name,
        })
        .from(schema.cohortSoftware)
        .innerJoin(schema.software, eq(schema.software.id, schema.cohortSoftware.softwareId))
        .where(
          scoped(
            schema.cohortSoftware.organizationId,
            organizationId,
            inArray(schema.cohortSoftware.cohortId, cohortIds)
          )
        )
    : [];
  const softwareByCohort = new Map<string, { id: string; name: string }[]>();
  for (const s of software) {
    const lista = softwareByCohort.get(s.cohortId) ?? [];
    lista.push({ id: s.id, name: s.name });
    softwareByCohort.set(s.cohortId, lista);
  }
  // 035 (FR-007) — lo del grupo de cada módulo.
  const groupByCohort = new Map<string, { id: string; name: string }[]>();
  for (const g of await softwareDelGrupo(organizationId, cohortIds)) {
    groupByCohort.set(g.cohortId, [
      ...(groupByCohort.get(g.cohortId) ?? []),
      { id: g.softwareId, name: g.name },
    ]);
  }

  const hijaIds = hijas.map((h) => h.id);
  const licencias = hijaIds.length
    ? await db
        .select({
          enrollmentId: schema.license.enrollmentId,
          assigned: schema.license.assigned,
          softwareId: schema.license.softwareId,
        })
        .from(schema.license)
        .where(
          scoped(
            schema.license.organizationId,
            organizationId,
            inArray(schema.license.enrollmentId, hijaIds)
          )
        )
    : [];
  // 034 (FR-020) — varias licencias por hija: se agrupan, no se pisan.
  const licenseByEnrollment = new Map<string, { assigned: boolean; softwareId: string }[]>();
  for (const l of licencias) {
    licenseByEnrollment.set(l.enrollmentId, [
      ...(licenseByEnrollment.get(l.enrollmentId) ?? []),
      { assigned: l.assigned, softwareId: l.softwareId },
    ]);
  }

  const modules = modulos.map((m) => ({
    id: m.id,
    name: m.name,
    courseId: m.courseId,
    courseName: nombreCurso.get(m.courseId) ?? "Módulo",
  }));

  const salida = new Map<string, ModuleLicenseLine[]>();
  for (const madreId of motherEnrollmentIds) {
    const suyas = hijas
      .filter((h) => h.parentEnrollmentId === madreId)
      .map((h) => ({
        id: h.id,
        cohortId: h.cohortId,
        courseId: h.courseId,
        cohortName: h.cohortName,
        courseName: h.courseName,
      }));
    salida.set(
      madreId,
      buildModuleLicenseLines(modules, suyas, softwareByCohort, licenseByEnrollment, groupByCohort)
    );
  }
  return salida;
}

// 042 — La protección anti-fórmulas vive en `@/lib/csv` (la usa también el
// export de Facturación, que se arma en el navegador).
export { csvField };

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
      licenseEmail: schema.enrollment.licenseEmail,
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

  // 2026-10-21 — `correo_licencia` sale de `correoDeLicencia` (license_email ?? correo).
  const lines = [
    "nombre,apellido,correo,correo_licencia",
    ...rows.map((r) =>
      [
        csvField(r.firstName),
        csvField(r.lastName),
        csvField(r.email),
        csvField(
          correoDeLicencia({ licenseEmail: r.licenseEmail ?? null, contactEmail: r.email }).email
        ),
      ].join(",")
    ),
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
  | { ok: false; status: 422; code: "invalid_body" | "seller_required"; message: string };

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
  input: UpdateEnrollmentCommercialInput,
  /** 042 — Quién edita: se estampa como autor del número de factura si cambia. */
  actorId?: string
): Promise<UpdateEnrollmentCommercialResult> {
  const db = getDb();

  /**
   * 2026-10-06 — El vendedor sólo se mira si el pedido lo trae. Una venta
   * vieja sin vendedor se sigue pudiendo editar sin cargarlo; lo que no se
   * puede es dejar sin vendedor una venta que lo tiene. Y un vendedor que hoy
   * está archivado se conserva en la venta que ya hizo: se verifica que esté
   * activo sólo cuando CAMBIA.
   */
  if (input.sellerId !== undefined) {
    const filas = await db
      .select({
        cohortId: schema.enrollment.cohortId,
        parentEnrollmentId: schema.enrollment.parentEnrollmentId,
        sellerId: schema.enrollment.sellerId,
      })
      .from(schema.enrollment)
      .where(
        scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId))
      )
      .limit(1);
    const actual = filas[0];
    if (!actual) {
      return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
    }
    const regla = reglaDeVendedorAlEditar({
      exige: exigeVendedor(actual),
      actual: actual.sellerId,
      nuevo: input.sellerId,
    });
    if (regla) return { ok: false, status: 422, code: "seller_required", message: regla };
    if (input.sellerId && input.sellerId !== actual.sellerId) {
      const sellerError = await verificarVendedorParaVenta(organizationId, input.sellerId);
      if (sellerError) {
        return { ok: false, status: 422, code: "invalid_body", message: sellerError };
      }
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
  if (input.invoiceNumber !== undefined) {
    set.invoiceNumber = input.invoiceNumber;
    /**
     * 042 — El autor del número se estampa SOLO si el número cambia: el
     * formulario comercial manda todos los campos en cada guardado, y
     * reestamparlo diría que alguien corrigió una factura que no tocó. El
     * `case` lee la fila VIEJA (así evalúa Postgres el SET).
     */
    const cambia = sql`${schema.enrollment.invoiceNumber} is distinct from ${input.invoiceNumber}`;
    set.invoiceRecordedAt = sql`case when ${cambia} then ${new Date().toISOString()}::timestamp else ${schema.enrollment.invoiceRecordedAt} end`;
    set.invoiceRecordedBy = sql`case when ${cambia} then ${actorId ?? null} else ${schema.enrollment.invoiceRecordedBy} end`;
  }
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
  // 043 — Igual que al inscribir: completa, nunca pisa.
  if (input.companyId) await completarEmpresaDelContacto(organizationId, row.contactId, input.companyId);
  return { ok: true, enrollment: serializeEnrollmentCommercial(row) };
}
