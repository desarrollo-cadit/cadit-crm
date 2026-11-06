import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Currency } from "@/lib/db/schema";
import { scoped } from "@/lib/db/tenant";
import {
  nuevaTitular,
  problemaParaCubrir,
  titularAlQueSumar,
  type MiembroDeVenta,
} from "@/lib/venta-empresa";

/**
 * 2026-11-06 — VENTA DE EMPRESA (escrituras). Las reglas puras viven en
 * `src/lib/venta-empresa.ts`; los guardas que impiden cargar plata en una
 * inscripción cubierta, en `billing.ts` y `enrollments.ts`.
 *
 * Todas estas funciones validan ANTES de escribir y, si algo falla a mitad de
 * camino, LANZAN: devolver un error no revierte la transacción del pedido.
 */

type Fallo = { ok: false; status: 404 | 409 | 422; code: string; message: string };

type Fila = MiembroDeVenta & { deBaja: boolean; amount: number | null };

async function cargarMiembros(
  organizationId: string,
  where: ReturnType<typeof eq>
): Promise<Fila[]> {
  const rows = await getDb()
    .select({
      id: schema.enrollment.id,
      companyId: schema.enrollment.companyId,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      billingEnrollmentId: schema.enrollment.billingEnrollmentId,
      enrolledAt: schema.enrollment.enrolledAt,
      createdAt: schema.enrollment.createdAt,
      amount: schema.enrollment.amount,
      archivedAt: schema.contact.archivedAt,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(scoped(schema.enrollment.organizationId, organizationId, where));
  return rows.map((r) => ({ ...r, deBaja: r.archivedAt !== null }));
}

/** Cuántas cuotas vigentes y pagos no anulados tienen estas inscripciones. */
async function conPlata(
  organizationId: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = getDb();
  const [cuotas, pagos] = await Promise.all([
    db
      .select({ id: schema.installment.enrollmentId })
      .from(schema.installment)
      .where(
        scoped(
          schema.installment.organizationId,
          organizationId,
          and(inArray(schema.installment.enrollmentId, [...ids]), isNull(schema.installment.canceledAt))
        )
      ),
    db
      .select({ id: schema.payment.enrollmentId })
      .from(schema.payment)
      .where(
        scoped(
          schema.payment.organizationId,
          organizationId,
          and(inArray(schema.payment.enrollmentId, [...ids]), isNull(schema.payment.voidedAt))
        )
      ),
  ]);
  return new Set([...cuotas.map((c) => c.id), ...pagos.map((p) => p.id)]);
}

/**
 * La titular a la que se suma un alumno nuevo de la empresa en el grupo, o
 * `null` si todavía no hay ninguna venta de esa empresa ahí (será la titular).
 * Solo cuenta a quienes no están de baja.
 */
export async function titularParaSumar(
  organizationId: string,
  companyId: string,
  cohortId: string
): Promise<string | null> {
  const miembros = await cargarMiembros(
    organizationId,
    and(eq(schema.enrollment.companyId, companyId), eq(schema.enrollment.cohortId, cohortId))!
  );
  return titularAlQueSumar(
    miembros.filter((m) => !m.deBaja),
    companyId,
    cohortId
  );
}

export type PasarAVentaUnicaResult =
  | { ok: true; titularId: string; cubiertas: number }
  | Fallo;

/**
 * Pasa a los alumnos de UNA empresa en UN grupo a una sola venta: la titular
 * lleva el total pactado y las demás quedan cubiertas, sin monto propio.
 *
 * Solo se hace sobre inscripciones SIN cuotas ni pagos: mover plata ya cargada
 * entre inscripciones es una operación contable que no se resuelve acá.
 */
export async function pasarAVentaUnica(
  organizationId: string,
  input: {
    companyId: string;
    cohortId: string;
    titularId: string;
    /** Los alumnos que quedan cubiertos; vacío = todos los demás de la empresa en el grupo. */
    cubiertasIds?: readonly string[];
    total: number;
    currency: Currency;
  }
): Promise<PasarAVentaUnicaResult> {
  if (input.total <= 0 || !Number.isInteger(input.total)) {
    return { ok: false, status: 422, code: "invalid_amount", message: "El total debe ser mayor a cero." };
  }
  const miembros = await cargarMiembros(
    organizationId,
    and(eq(schema.enrollment.companyId, input.companyId), eq(schema.enrollment.cohortId, input.cohortId))!
  );
  const titular = miembros.find((m) => m.id === input.titularId);
  if (!titular) {
    return { ok: false, status: 404, code: "not_found", message: "La inscripción titular no existe en esa empresa y grupo." };
  }
  const candidatas = miembros.filter(
    (m) => m.id !== titular.id && m.parentEnrollmentId === null && m.billingEnrollmentId === null && !m.deBaja
  );
  const aCubrir = input.cubiertasIds?.length
    ? candidatas.filter((m) => input.cubiertasIds!.includes(m.id))
    : candidatas;
  if (aCubrir.length === 0) {
    return { ok: false, status: 422, code: "sin_alumnos", message: "No hay otros alumnos de la empresa para sumar a la venta." };
  }
  for (const m of aCubrir) {
    const problema = problemaParaCubrir(m, titular);
    if (problema) return { ok: false, status: 422, code: problema.code, message: problema.message };
  }

  const tienenPlata = await conPlata(organizationId, [titular.id, ...aCubrir.map((m) => m.id)]);
  if (tienenPlata.size > 0) {
    return {
      ok: false,
      status: 409,
      code: "ya_tiene_cobranza",
      message:
        "Alguna de estas inscripciones ya tiene cuotas o pagos cargados por persona. Hay que anularlos antes de pasarlas a una venta única.",
    };
  }

  const db = getDb();
  const ahora = new Date();
  await db
    .update(schema.enrollment)
    .set({ amount: input.total, currency: input.currency, billingEnrollmentId: null, updatedAt: ahora })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, titular.id)));
  await db
    .update(schema.enrollment)
    .set({ amount: null, currency: input.currency, billingEnrollmentId: titular.id, updatedAt: ahora })
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        inArray(schema.enrollment.id, aCubrir.map((m) => m.id))
      )
    );
  return { ok: true, titularId: titular.id, cubiertas: aCubrir.length };
}

export type CubrirResult = { ok: true } | Fallo;

/** Suma UN alumno a la venta de una titular (misma empresa y grupo). */
export async function cubrirConVenta(
  organizationId: string,
  enrollmentId: string,
  titularId: string
): Promise<CubrirResult> {
  const filas = await cargarMiembros(
    organizationId,
    inArray(schema.enrollment.id, [enrollmentId, titularId])
  );
  const miembro = filas.find((f) => f.id === enrollmentId);
  const titular = filas.find((f) => f.id === titularId);
  if (!miembro || !titular) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  const problema = problemaParaCubrir(miembro, titular);
  if (problema) return { ok: false, status: 422, code: problema.code, message: problema.message };
  if ((await conPlata(organizationId, [enrollmentId])).size > 0) {
    return {
      ok: false,
      status: 409,
      code: "ya_tiene_cobranza",
      message: "Esta inscripción ya tiene cuotas o pagos propios: hay que anularlos antes de sumarla a la venta de la empresa.",
    };
  }
  await getDb()
    .update(schema.enrollment)
    .set({ amount: null, billingEnrollmentId: titularId, updatedAt: new Date() })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)));
  return { ok: true };
}

/**
 * Saca a un alumno de la venta de la empresa: vuelve a cobrarse por sí mismo
 * (queda sin monto: hay que cargárselo). Una TITULAR con cubiertas no se suelta:
 * antes se reasigna la venta (`reasignarTitular`).
 */
export async function soltarDeVenta(
  organizationId: string,
  enrollmentId: string
): Promise<CubrirResult> {
  const [fila] = await cargarMiembros(organizationId, eq(schema.enrollment.id, enrollmentId));
  if (!fila) return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  if (fila.billingEnrollmentId === null) {
    return { ok: false, status: 422, code: "no_esta_cubierta", message: "Esta inscripción no está cubierta por una venta de empresa." };
  }
  await getDb()
    .update(schema.enrollment)
    .set({ billingEnrollmentId: null, updatedAt: new Date() })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId)));
  return { ok: true };
}

/**
 * Si la titular de una venta se va (baja), la venta pasa a la cubierta activa
 * más antigua: se mueven el monto, las cuotas y los pagos, y las demás cubiertas
 * apuntan a la nueva. Sin cubiertas activas no hace nada. Devuelve la nueva
 * titular o `null`.
 */
export async function reasignarTitular(
  organizationId: string,
  titularId: string
): Promise<string | null> {
  const miembros = await cargarMiembros(
    organizationId,
    eq(schema.enrollment.billingEnrollmentId, titularId)
  );
  const nuevaId = nuevaTitular(titularId, miembros);
  if (!nuevaId) return null;

  const db = getDb();
  const [vieja] = await db
    .select({
      amount: schema.enrollment.amount,
      currency: schema.enrollment.currency,
      installments: schema.enrollment.installments,
      paymentNotes: schema.enrollment.paymentNotes,
    })
    .from(schema.enrollment)
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, titularId)))
    .limit(1);
  if (!vieja) return null;

  const ahora = new Date();
  // La nueva titular lleva la venta…
  await db
    .update(schema.enrollment)
    .set({ ...vieja, billingEnrollmentId: null, updatedAt: ahora })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, nuevaId)));
  // …las demás cubiertas apuntan a ella…
  await db
    .update(schema.enrollment)
    .set({ billingEnrollmentId: nuevaId, updatedAt: ahora })
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(eq(schema.enrollment.billingEnrollmentId, titularId), sql`${schema.enrollment.id} <> ${nuevaId}`)
      )
    );
  // …la que se va queda cubierta y sin monto…
  await db
    .update(schema.enrollment)
    .set({ amount: null, installments: null, billingEnrollmentId: nuevaId, updatedAt: ahora })
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, titularId)));
  // …y la plata (cuotas y pagos) se muda con la venta.
  await db
    .update(schema.installment)
    .set({ enrollmentId: nuevaId })
    .where(scoped(schema.installment.organizationId, organizationId, eq(schema.installment.enrollmentId, titularId)));
  await db
    .update(schema.payment)
    .set({ enrollmentId: nuevaId })
    .where(scoped(schema.payment.organizationId, organizationId, eq(schema.payment.enrollmentId, titularId)));
  return nuevaId;
}

export type VentaDeEmpresaEnGrupo = {
  /** La titular a la que se sumaría un alumno nuevo; `null` si todavía no hay alumnos de la empresa. */
  titularId: string | null;
  titularNombre: string | null;
  /** Alumnos activos de la empresa en el grupo (ventas principales). */
  alumnos: number;
  /** Ya se pasó a venta única (alguien está cubierto por la titular). */
  ventaUnica: boolean;
};

/** Qué hay hoy de esta empresa en este grupo, para el formulario de inscripción. */
export async function ventaDeEmpresaEnGrupo(
  organizationId: string,
  companyId: string,
  cohortId: string
): Promise<VentaDeEmpresaEnGrupo> {
  const miembros = (
    await cargarMiembros(
      organizationId,
      and(eq(schema.enrollment.companyId, companyId), eq(schema.enrollment.cohortId, cohortId))!
    )
  ).filter((m) => !m.deBaja && m.parentEnrollmentId === null);
  const titularId = titularAlQueSumar(miembros, companyId, cohortId);
  let titularNombre: string | null = null;
  if (titularId) {
    const [c] = await getDb()
      .select({ firstName: schema.contact.firstName, lastName: schema.contact.lastName })
      .from(schema.enrollment)
      .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
      .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, titularId)))
      .limit(1);
    titularNombre = c ? [c.firstName, c.lastName].filter(Boolean).join(" ") : null;
  }
  return {
    titularId,
    titularNombre,
    alumnos: miembros.length,
    ventaUnica: miembros.some((m) => m.billingEnrollmentId !== null),
  };
}
