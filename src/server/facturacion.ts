import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  avisoDeFacturaRepetida,
  condicionDePago,
  enLaVista,
  normalizarNumero,
  resumenDeCobro,
  type EstadoFacturacion,
  type FilaFacturacion,
} from "@/lib/facturacion";

/**
 * 042 — Facturación: la pantalla de lo que falta facturar y las DOS únicas
 * escrituras de `facturacion.editar`.
 *
 * Las escrituras tocan columnas de documento y nada más: el número y quién y
 * cuándo lo anotó. No reusan `updateEnrollmentCommercial` a propósito: esa
 * función cambia montos, y una ruta que la llama "solo con el número" está a
 * un campo de body de cambiar el precio (`tests/unit/facturacion-servidor.test.ts`
 * fija las columnas exactas del `set`).
 */

type Fallo = { ok: false; status: 404 | 409 | 422; code: string; message: string };

function nombre(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter((s) => s && s.trim()).join(" ").trim() || "Sin nombre";
}

/* ============================================================
 * La pantalla
 * ============================================================ */

/**
 * Las ventas de la pestaña pedida, ya con lo que hace falta para facturar.
 *
 * El SQL acota lo barato (madres con cohorte); la decisión de quién va en la
 * pestaña la toma `enLaVista`, la misma regla del correo de T-7/T-2. Los
 * filtros (cohorte, fechas, confirmadas, empresa) se aplican en la pantalla
 * con `filtrarFacturacion`, para que el CSV sea exactamente lo que se ve.
 */
export async function listarFacturacion(
  organizationId: string,
  estado: EstadoFacturacion,
  /** `contactos.ver`: sin ella cédula y celular no se leen ni viajan. */
  conContacto = false
): Promise<FilaFacturacion[]> {
  const rows = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
      enrollmentNationalId: schema.enrollment.nationalId,
      contactNationalId: schema.contact.nationalId,
      contactPhone: schema.contact.phone,
      contactId: schema.enrollment.contactId,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      amount: schema.enrollment.amount,
      currency: schema.enrollment.currency,
      invoiceNumber: schema.enrollment.invoiceNumber,
      invoiceRecordedAt: schema.enrollment.invoiceRecordedAt,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      archivedAt: schema.contact.archivedAt,
      cohortName: schema.cohort.name,
      startDate: schema.cohort.startDate,
      confirmedAt: schema.cohort.confirmedAt,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      sellerName: schema.seller.name,
      companyId: schema.company.id,
      legalName: schema.company.legalName,
      taxId: schema.company.taxId,
      billingEmail: schema.company.billingEmail,
      paymentTerms: schema.company.paymentTerms,
      paymentTermDays: schema.company.paymentTermDays,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.seller, eq(schema.enrollment.sellerId, schema.seller.id))
    .leftJoin(schema.company, eq(schema.enrollment.companyId, schema.company.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        isNull(schema.enrollment.parentEnrollmentId)
      )
    )
    .orderBy(asc(schema.cohort.startDate), asc(schema.contact.firstName), asc(schema.contact.lastName));

  const enVista = rows.filter((r) =>
    enLaVista(
      {
        cohortId: r.cohortId,
        parentEnrollmentId: r.parentEnrollmentId,
        courseKind: r.courseKind,
        deBaja: r.archivedAt !== null,
        invoiceNumber: r.invoiceNumber,
      },
      estado
    )
  );

  // El cobro sale de las MISMAS cuotas y pagos de Cobranza (no hay otro registro).
  const ids = enVista.map((r) => r.enrollmentId);
  const [cuotas, pagos] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          getDb()
            .select({
              id: schema.installment.id,
              enrollmentId: schema.installment.enrollmentId,
              amount: schema.installment.amount,
              dueDate: schema.installment.dueDate,
              canceledAt: schema.installment.canceledAt,
            })
            .from(schema.installment)
            .where(scoped(schema.installment.organizationId, organizationId, inArray(schema.installment.enrollmentId, ids))),
          getDb()
            .select({
              enrollmentId: schema.payment.enrollmentId,
              installmentId: schema.payment.installmentId,
              amount: schema.payment.amount,
              voidedAt: schema.payment.voidedAt,
            })
            .from(schema.payment)
            .where(scoped(schema.payment.organizationId, organizationId, inArray(schema.payment.enrollmentId, ids))),
        ]);
  const cuotasDe = Map.groupBy(cuotas, (c) => c.enrollmentId);
  const pagosDe = Map.groupBy(pagos, (p) => p.enrollmentId);
  const ahora = new Date();

  return enVista.map((r) => ({
      enrollmentId: r.enrollmentId,
      contactId: r.contactId,
      alumno: nombre(r.firstName, r.lastName),
      // La cédula de la inscripción manda (es la que se usó al facturar); si no
      // hay, la del contacto.
      cedula: conContacto ? r.enrollmentNationalId?.trim() || r.contactNationalId?.trim() || null : null,
      celular: conContacto ? r.contactPhone?.trim() || null : null,
      curso: r.courseName,
      cohorte: r.cohortName,
      cohortId: r.cohortId!,
      // `cohort.start_date` se guarda a medianoche UTC del día: se lee en UTC.
      inicio: r.startDate.toISOString().slice(0, 10),
      confirmada: r.confirmedAt !== null,
      vendedor: r.sellerName,
      amount: r.amount,
      currency: r.currency,
      invoiceNumber: normalizarNumero(r.invoiceNumber),
      invoiceRecordedAt: r.invoiceRecordedAt?.toISOString() ?? null,
      empresa: r.legalName
        ? {
            id: r.companyId!,
            razonSocial: r.legalName,
            rut: r.taxId,
            billingEmail: r.billingEmail,
            condicion: condicionDePago(r.paymentTerms, r.paymentTermDays),
          }
        : null,
      cobro: resumenDeCobro(
        {
          pactado: r.amount,
          cuotas: cuotasDe.get(r.enrollmentId) ?? [],
          pagos: pagosDe.get(r.enrollmentId) ?? [],
        },
        ahora
      ),
    }));
}

/* ============================================================
 * Factura (en la inscripción)
 * ============================================================ */

export type RegistrarFacturaResult =
  | {
      ok: true;
      factura: { enrollmentId: string; invoiceNumber: string | null; invoiceRecordedAt: string | null };
      /** Número repetido en otra persona: se guardó igual (ver `avisoDeFacturaRepetida`). */
      aviso: string | null;
    }
  | Fallo;

/**
 * Anota, corrige o borra el número de factura de una venta.
 *
 * - Una inscripción HIJA → 422: la plata (y la factura) vive en la madre.
 * - El mismo número que ya tenía → no escribe: reestampar el autor diría que
 *   alguien corrigió algo que no cambió.
 * - Número repetido en otra persona → se guarda y se AVISA (no bloquea: una
 *   factura de empresa cubre a varios).
 */
export async function registrarFactura(
  organizationId: string,
  enrollmentId: string,
  raw: string | null,
  actorId: string
): Promise<RegistrarFacturaResult> {
  const db = getDb();
  const [actual] = await db
    .select({
      id: schema.enrollment.id,
      contactId: schema.enrollment.contactId,
      companyId: schema.enrollment.companyId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      invoiceNumber: schema.enrollment.invoiceNumber,
      invoiceRecordedAt: schema.enrollment.invoiceRecordedAt,
    })
    .from(schema.enrollment)
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)))
    .limit(1);
  if (!actual) return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  if (actual.parentEnrollmentId) {
    return {
      ok: false,
      status: 422,
      code: "factura_en_la_madre",
      message: "Esta inscripción es de un módulo: la factura se anota en la inscripción principal, que es la que lleva el monto.",
    };
  }

  const numero = normalizarNumero(raw);
  if (numero === normalizarNumero(actual.invoiceNumber)) {
    return {
      ok: true,
      factura: {
        enrollmentId,
        invoiceNumber: numero,
        invoiceRecordedAt: actual.invoiceRecordedAt?.toISOString() ?? null,
      },
      aviso: null,
    };
  }

  let aviso: string | null = null;
  if (numero) {
    const otras = await db
      .select({
        contactId: schema.enrollment.contactId,
        companyId: schema.enrollment.companyId,
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
      })
      .from(schema.enrollment)
      .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          and(
            ne(schema.enrollment.id, enrollmentId),
            sql`lower(btrim(${schema.enrollment.invoiceNumber})) = lower(${numero})`
          )
        )
      );
    aviso = avisoDeFacturaRepetida(
      { contactId: actual.contactId, companyId: actual.companyId },
      otras.map((o) => ({ contactId: o.contactId, companyId: o.companyId, alumno: nombre(o.firstName, o.lastName) }))
    );
  }

  const ahora = new Date();
  const [fila] = await db
    .update(schema.enrollment)
    .set({ invoiceNumber: numero, invoiceRecordedAt: ahora, invoiceRecordedBy: actorId, updatedAt: ahora })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)))
    .returning({ id: schema.enrollment.id });
  if (!fila) return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };

  return {
    ok: true,
    factura: { enrollmentId, invoiceNumber: numero, invoiceRecordedAt: ahora.toISOString() },
    aviso,
  };
}

/* ============================================================
 * Factura de una empresa (varios alumnos del mismo grupo)
 * ============================================================ */

export type RegistrarFacturaDeEmpresaResult =
  | { ok: true; facturas: { enrollmentId: string; invoiceNumber: string | null }[]; avisos: string[] }
  | Fallo;

/**
 * 2026-11-06 — Anota UN número de factura en todas las ventas de una empresa
 * en un mismo grupo (a la empresa se le emite una sola factura por sus
 * alumnos). Cada venta se escribe con `registrarFactura`, así que el autor, la
 * fecha y el "no reestampar si no cambió" son los de siempre.
 *
 * Todo o nada: primero se valida que TODAS sean ventas principales de la misma
 * empresa y del mismo grupo; recién después se escribe. Si una escritura falla
 * a mitad de camino se LANZA, para que la transacción del pedido revierta lo
 * ya escrito (devolver una `Response` de error no revierte).
 */
export async function registrarFacturaDeEmpresa(
  organizationId: string,
  enrollmentIds: readonly string[],
  raw: string | null,
  actorId: string
): Promise<RegistrarFacturaDeEmpresaResult> {
  const ids = [...new Set(enrollmentIds)];
  const filas = await getDb()
    .select({
      id: schema.enrollment.id,
      companyId: schema.enrollment.companyId,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
    })
    .from(schema.enrollment)
    .where(scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.id, ids)));

  if (filas.length !== ids.length) {
    return { ok: false, status: 404, code: "not_found", message: "Alguna inscripción no existe." };
  }
  const empresas = new Set(filas.map((f) => f.companyId));
  const grupos = new Set(filas.map((f) => f.cohortId));
  if (empresas.size !== 1 || [...empresas][0] === null || grupos.size !== 1) {
    return {
      ok: false,
      status: 422,
      code: "no_es_de_una_empresa",
      message: "Solo se puede anotar una factura común a ventas de la misma empresa y del mismo grupo.",
    };
  }
  if (filas.some((f) => f.parentEnrollmentId)) {
    return {
      ok: false,
      status: 422,
      code: "factura_en_la_madre",
      message: "Alguna inscripción es de un módulo: la factura se anota en la inscripción principal.",
    };
  }

  const facturas: { enrollmentId: string; invoiceNumber: string | null }[] = [];
  const avisos: string[] = [];
  for (const id of ids) {
    const r = await registrarFactura(organizationId, id, raw, actorId);
    if (!r.ok) throw new Error(r.message);
    facturas.push({ enrollmentId: id, invoiceNumber: r.factura.invoiceNumber });
    if (r.aviso && !avisos.includes(r.aviso)) avisos.push(r.aviso);
  }
  return { ok: true, facturas, avisos };
}

/* ============================================================
 * Recibo (en el pago)
 * ============================================================ */

export type RegistrarReciboResult =
  | { ok: true; recibo: { paymentId: string; receiptNumber: string | null; receiptRecordedAt: string | null } }
  | Fallo;

/**
 * Anota, corrige o borra el número de recibo de un PAGO (DV-006 de 008: el
 * recibo es del pago; la factura, de la inscripción). Un pago anulado no se
 * toca: su registro es la explicación de un hueco en la caja y queda como
 * estaba.
 */
export async function registrarRecibo(
  organizationId: string,
  paymentId: string,
  raw: string | null,
  actorId: string
): Promise<RegistrarReciboResult> {
  const db = getDb();
  const [pago] = await db
    .select({
      id: schema.payment.id,
      voidedAt: schema.payment.voidedAt,
      receiptNumber: schema.payment.receiptNumber,
      receiptRecordedAt: schema.payment.receiptRecordedAt,
    })
    .from(schema.payment)
    .where(scoped(schema.payment.organizationId, organizationId, eq(schema.payment.id, paymentId)))
    .limit(1);
  if (!pago) return { ok: false, status: 404, code: "not_found", message: "Pago no encontrado" };
  if (pago.voidedAt) {
    return { ok: false, status: 409, code: "pago_anulado", message: "El pago está anulado: su recibo no se modifica." };
  }

  const numero = normalizarNumero(raw);
  if (numero === normalizarNumero(pago.receiptNumber)) {
    return {
      ok: true,
      recibo: { paymentId, receiptNumber: numero, receiptRecordedAt: pago.receiptRecordedAt?.toISOString() ?? null },
    };
  }
  const ahora = new Date();
  const [fila] = await db
    .update(schema.payment)
    .set({ receiptNumber: numero, receiptRecordedAt: ahora, receiptRecordedBy: actorId })
    .where(scoped(schema.payment.organizationId, organizationId, eq(schema.payment.id, paymentId)))
    .returning({ id: schema.payment.id });
  if (!fila) return { ok: false, status: 404, code: "not_found", message: "Pago no encontrado" };

  return { ok: true, recibo: { paymentId, receiptNumber: numero, receiptRecordedAt: ahora.toISOString() } };
}
