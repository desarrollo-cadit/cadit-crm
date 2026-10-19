import { asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import {
  armarAvisoInscripcion,
  armarAvisoPago,
  armarResumenMorosidad,
  BILLING_EVENT_KINDS,
  destinatariosDeVenta,
  esVentaParaAviso,
  HORIZONTE_REINTENTO_MS,
  reintentoDeEventoQueToca,
  resumenSemanalQueToca,
  resumirMorosidad,
  saldoPorMoneda,
} from "@/lib/billing-notices";
import {
  claveDeAviso,
  destinatariosDeArea,
  nombreDeCohorte,
  puedeReclamar,
  sujetoDeRegistro,
  type SujetoDeAviso,
} from "@/lib/staff-notices";
import { getAreaConfig } from "@/server/areas/config";
import { listInstallments } from "@/server/billing";
import { organizationTimezone } from "@/server/finanzas-periodo";
import {
  ACTOR_AVISOS,
  cerrarAviso,
  leerRegistroDeAviso,
  mandarAviso,
  reclamarAviso,
  runStaffNoticesForOrg,
  type Envio,
  type ResultadoAviso,
} from "@/server/staff-notices";

/**
 * 041 — Avisos internos de cobranza a Administración: la venta nueva (con
 * copia al vendedor), el pago registrado y el resumen semanal de morosidad.
 *
 * Mismo motor que 039 (`src/server/staff-notices.ts`): reclamo
 * compare-and-swap en una transacción corta, correo FUERA de toda
 * transacción, resultado registrado solo si el reclamo sigue siendo el mismo.
 * Nunca lanza.
 *
 * Los avisos de inscripción y de pago nacen ENCOLADOS dentro de la
 * transacción del alta o del pago (`billing-notices-queue.ts`) y se mandan
 * después del commit; la periódica recupera los que quedaron en el camino.
 * El resumen semanal lo dispara solo la periódica.
 */

type CobranzaSujeto = Extract<SujetoDeAviso, { kind: "inscripcion_nueva" | "pago_registrado" | "morosidad_semanal" }>;

const nombre = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ").trim();

/* ============================================================
 * Lecturas
 * ============================================================ */

async function leerVenta(organizationId: string, enrollmentId: string) {
  const rows = await getDb()
    .select({
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      amount: schema.enrollment.amount,
      currency: schema.enrollment.currency,
      installments: schema.enrollment.installments,
      invoiceNumber: schema.enrollment.invoiceNumber,
      enrollmentNationalId: schema.enrollment.nationalId,
      companyId: schema.enrollment.companyId,
      sellerId: schema.enrollment.sellerId,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
      phone: schema.contact.phone,
      contactNationalId: schema.contact.nationalId,
      cohortName: schema.cohort.name,
      startDate: schema.cohort.startDate,
      startTime: schema.cohort.startTime,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)))
    .limit(1);
  return rows[0] ?? null;
}

async function leerVendedor(organizationId: string, sellerId: string | null) {
  if (!sellerId) return null;
  const rows = await getDb()
    .select({
      name: schema.seller.name,
      email: schema.seller.email,
      archivedAt: schema.seller.archivedAt,
      userEmail: schema.user.email,
    })
    .from(schema.seller)
    .leftJoin(schema.user, eq(schema.seller.userId, schema.user.id))
    .where(scoped(schema.seller.organizationId, organizationId, eq(schema.seller.id, sellerId)))
    .limit(1);
  return rows[0] ?? null;
}

async function leerEmpresa(organizationId: string, companyId: string | null) {
  if (!companyId) return null;
  const rows = await getDb()
    .select()
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
    .limit(1);
  const c = rows[0];
  if (!c) return null;
  const direccion = [c.addressStreet, c.addressCity, c.addressState, c.addressCountry]
    .map((x) => x?.trim())
    .filter(Boolean)
    .join(", ");
  return {
    razonSocial: c.legalName,
    nombreComercial: c.tradeName,
    rut: c.taxId,
    direccion: direccion || null,
    contactoFacturacion: c.billingContactName,
    correoFacturacion: c.billingEmail,
    telefonoFacturacion: c.billingPhone,
    condicionDePago: c.paymentTerms,
    diasDeCredito: c.paymentTermDays,
  };
}

async function leerPago(organizationId: string, paymentId: string) {
  const rows = await getDb()
    .select({
      enrollmentId: schema.payment.enrollmentId,
      installmentId: schema.payment.installmentId,
      amount: schema.payment.amount,
      currency: schema.payment.currency,
      method: schema.payment.method,
      paidAt: schema.payment.paidAt,
      receiptNumber: schema.payment.receiptNumber,
      voidedAt: schema.payment.voidedAt,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
    })
    .from(schema.payment)
    .innerJoin(schema.enrollment, eq(schema.payment.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.payment.organizationId, organizationId, eq(schema.payment.id, paymentId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Las cuotas vigentes y vencidas de la organización, con sus pagos: la entrada de `resumirMorosidad`. */
async function leerMorosidad(organizationId: string, now: Date) {
  const db = getDb();
  const cuotas = await db
    .select({
      installmentId: schema.installment.id,
      enrollmentId: schema.installment.enrollmentId,
      amount: schema.installment.amount,
      currency: schema.installment.currency,
      dueDate: schema.installment.dueDate,
      canceledAt: schema.installment.canceledAt,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      archivedAt: schema.contact.archivedAt,
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
    })
    .from(schema.installment)
    .innerJoin(schema.enrollment, eq(schema.installment.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        isNull(schema.installment.canceledAt),
        lt(schema.installment.dueDate, now)
      )
    )
    .orderBy(asc(schema.installment.dueDate));
  if (cuotas.length === 0) return { cuotas: [], pagos: [] };

  const pagos = await db
    .select({
      installmentId: schema.payment.installmentId,
      amount: schema.payment.amount,
      voidedAt: schema.payment.voidedAt,
    })
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        isNull(schema.payment.voidedAt),
        inArray(
          schema.payment.installmentId,
          cuotas.map((c) => c.installmentId)
        )
      )
    );

  return {
    cuotas: cuotas.map((c) => ({
      installmentId: c.installmentId,
      enrollmentId: c.enrollmentId,
      amount: c.amount,
      currency: c.currency,
      dueDate: c.dueDate,
      canceledAt: c.canceledAt,
      alumno: nombre(c.firstName, c.lastName),
      alumnoDeBaja: c.archivedAt !== null,
      cohortId: c.cohortId,
      cohorte: nombreDeCohorte(c.courseName, c.cohortName),
    })),
    pagos,
  };
}

/* ============================================================
 * Reclamar, armar, mandar
 * ============================================================ */

/**
 * Paso 1, en una transacción corta: reclamar y armar el correo. Lo que no
 * corresponde se cierra acá mismo como `skipped` con su motivo:
 *
 * - `area_sin_configurar` — Administración apagada o sin casilla.
 * - `ya_no_es_venta` — el lead volvió a "sin cohorte" antes de que saliera.
 * - `pago_anulado` — el pago se anuló antes de que saliera.
 * - `nada_que_enviar` — nadie debe (resumen semanal).
 */
async function prepararEnvio(
  organizationId: string,
  sujeto: CobranzaSujeto,
  now: Date
): Promise<Envio | ResultadoAviso> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const previo = await leerRegistroDeAviso(organizationId, sujeto);
    // Inscripción y pago solo existen ENCOLADOS: sin fila, no hubo evento.
    if (!previo && sujeto.kind !== "morosidad_semanal") return "no_corresponde";
    if (!puedeReclamar(previo, now, { reintentarOmitido: false })) return "no_corresponde";
    const id = await reclamarAviso(organizationId, sujeto, previo, now);
    if (!id) return "no_corresponde";

    const omitir = async (detail: string): Promise<ResultadoAviso> => {
      await cerrarAviso(organizationId, id, now, { status: "skipped", detail });
      return "skipped";
    };

    const area = await getAreaConfig(organizationId, "administracion");
    const timeZone = await organizationTimezone(organizationId);

    let destinatarios = destinatariosDeArea(area);
    let correo: { subject: string; html: string };

    if (sujeto.kind === "inscripcion_nueva") {
      const venta = await leerVenta(organizationId, sujeto.enrollmentId);
      if (!venta || !venta.startDate || !venta.courseName) return omitir("ya_no_es_venta");
      if (!esVentaParaAviso({ ...venta, courseKind: venta.courseKind })) return omitir("ya_no_es_venta");
      const [vendedor, empresa] = await Promise.all([
        leerVendedor(organizationId, venta.sellerId),
        leerEmpresa(organizationId, venta.companyId),
      ]);
      destinatarios = destinatariosDeVenta(
        area,
        vendedor ? { email: vendedor.email, userEmail: vendedor.userEmail, archived: vendedor.archivedAt !== null } : null
      );
      correo = armarAvisoInscripcion({
        alumno: {
          nombre: nombre(venta.firstName, venta.lastName),
          email: venta.email,
          telefono: venta.phone,
          documento: venta.enrollmentNationalId ?? venta.contactNationalId,
        },
        curso: venta.courseName,
        cohorte: venta.cohortName,
        startDate: venta.startDate,
        startTime: venta.startTime,
        timeZone,
        vendedor: vendedor?.name ?? null,
        amount: venta.amount,
        currency: venta.currency,
        installments: venta.installments,
        invoiceNumber: venta.invoiceNumber,
        empresa,
      });
    } else if (sujeto.kind === "pago_registrado") {
      const pago = await leerPago(organizationId, sujeto.paymentId);
      if (!pago) return "no_corresponde";
      if (pago.voidedAt) return omitir("pago_anulado");
      const cuotas = await listInstallments(organizationId, pago.enrollmentId, now);
      correo = armarAvisoPago({
        alumno: nombre(pago.firstName, pago.lastName),
        curso: pago.courseName,
        cohorte: pago.cohortName,
        esTaller: pago.courseKind === "taller",
        amount: pago.amount,
        currency: pago.currency,
        method: pago.method,
        paidAt: pago.paidAt,
        receiptNumber: pago.receiptNumber,
        cuota: cuotas.find((c) => c.id === pago.installmentId)?.number ?? null,
        saldos: saldoPorMoneda(cuotas),
      });
    } else {
      const { cuotas, pagos } = await leerMorosidad(organizationId, now);
      const resumen = resumirMorosidad(cuotas, pagos, now);
      if (resumen.cohortes.length === 0) return omitir("nada_que_enviar");
      correo = armarResumenMorosidad({ periodKey: sujeto.periodKey, resumen });
    }

    if (!destinatarios) return omitir("area_sin_configurar");

    await getDb()
      .update(schema.staffNotice)
      .set({ recipients: destinatarios, subject: correo.subject, updatedAt: now })
      .where(scoped(schema.staffNotice.organizationId, organizationId, eq(schema.staffNotice.id, id)));
    return { id, claimedAt: now, destinatarios, ...correo };
  });
}

/**
 * Manda UN aviso de cobranza, si corresponde. Nunca lanza: devuelve en qué
 * quedó (`no_corresponde` si ya salió, no existe o lo tomó otro proceso).
 */
export async function enviarAvisoDeCobranza(
  organizationId: string,
  sujeto: CobranzaSujeto,
  now = new Date()
): Promise<ResultadoAviso> {
  const etiqueta = claveDeAviso(sujeto);
  let envio: Envio | ResultadoAviso;
  try {
    envio = await prepararEnvio(organizationId, sujeto, now);
  } catch (err) {
    console.error(`[avisos] ${etiqueta}: no se pudo preparar (${err instanceof Error ? err.name : "error"})`);
    return "no_corresponde";
  }
  if (typeof envio === "string") return envio;
  return mandarAviso(organizationId, envio, etiqueta);
}

/* ============================================================
 * La periódica
 * ============================================================ */

/**
 * Lo que toca AHORA en una organización: los avisos de inscripción y de pago
 * encolados o fallidos de la última semana, y el resumen semanal si es su
 * momento y no salió.
 */
export async function avisosDeCobranzaPendientes(
  organizationId: string,
  now = new Date()
): Promise<CobranzaSujeto[]> {
  return withOrganizationScope(organizationId, ACTOR_AVISOS, async () => {
    const filas = await getDb()
      .select({
        kind: schema.staffNotice.kind,
        status: schema.staffNotice.status,
        attempts: schema.staffNotice.attempts,
        claimedAt: schema.staffNotice.claimedAt,
        createdAt: schema.staffNotice.createdAt,
        cohortId: schema.staffNotice.cohortId,
        enrollmentId: schema.staffNotice.enrollmentId,
        paymentId: schema.staffNotice.paymentId,
        periodKey: schema.staffNotice.periodKey,
      })
      .from(schema.staffNotice)
      .where(
        scoped(
          schema.staffNotice.organizationId,
          organizationId,
          inArray(schema.staffNotice.kind, [...BILLING_EVENT_KINDS]),
          inArray(schema.staffNotice.status, ["pending", "failed"]),
          gte(schema.staffNotice.createdAt, new Date(now.getTime() - HORIZONTE_REINTENTO_MS))
        )
      )
      .orderBy(asc(schema.staffNotice.createdAt));

    const out: CobranzaSujeto[] = [];
    for (const f of filas) {
      if (!reintentoDeEventoQueToca(f, now)) continue;
      const sujeto = sujetoDeRegistro(f);
      if (sujeto && (sujeto.kind === "inscripcion_nueva" || sujeto.kind === "pago_registrado")) out.push(sujeto);
    }

    const timeZone = await organizationTimezone(organizationId);
    const semana = resumenSemanalQueToca(now, timeZone);
    if (semana) {
      const sujeto = { kind: "morosidad_semanal", periodKey: semana } as const;
      const previo = await leerRegistroDeAviso(organizationId, sujeto);
      if (puedeReclamar(previo, now, { reintentarOmitido: false })) out.push(sujeto);
    }
    return out;
  });
}

export async function runBillingNoticesForOrg(organizationId: string, now = new Date()): Promise<number> {
  const pendientes = await avisosDeCobranzaPendientes(organizationId, now);
  // Uno por uno, cada uno en sus alcances cortos: un fallo no frena al siguiente.
  for (const s of pendientes) await enviarAvisoDeCobranza(organizationId, s, now);
  return pendientes.length;
}

/** La pasada completa de la periódica: avisos de cohorte (039) y de cobranza (041). */
export async function runInternalNoticesForOrg(organizationId: string, now = new Date()): Promise<number> {
  let n = 0;
  try {
    n += await runStaffNoticesForOrg(organizationId, now);
  } finally {
    // Un fallo de los avisos de cohorte no deja sin correr los de cobranza.
    n += await runBillingNoticesForOrg(organizationId, now);
  }
  return n;
}

