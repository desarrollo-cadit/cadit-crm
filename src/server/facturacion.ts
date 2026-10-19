import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  avisoDeFacturaRepetida,
  condicionDePago,
  enLaVista,
  normalizarNumero,
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
  estado: EstadoFacturacion
): Promise<FilaFacturacion[]> {
  const rows = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
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

  return rows
    .filter((r) =>
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
    )
    .map((r) => ({
      enrollmentId: r.enrollmentId,
      contactId: r.contactId,
      alumno: nombre(r.firstName, r.lastName),
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
            razonSocial: r.legalName,
            rut: r.taxId,
            billingEmail: r.billingEmail,
            condicion: condicionDePago(r.paymentTerms, r.paymentTermDays),
          }
        : null,
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
