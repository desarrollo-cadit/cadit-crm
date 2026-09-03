import { asc, eq, gte, isNull, lt, sum } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * 008 — Cobranza: plan de cuotas y registro de pagos.
 *
 * El estado de una cuota NO se persiste (DV-003): se deriva de sus pagos y de
 * la fecha. Persistirlo obliga a un job nocturno que se desincroniza, y una
 * cuota marcada "al día" que en realidad venció es peor que no tener el dato.
 */

export type InstallmentStatus = "pagada" | "parcial" | "vencida" | "pendiente";

export type InstallmentDto = {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  currency: Currency;
  /** Suma de pagos NO anulados imputados a esta cuota. */
  paid: number;
  balance: number;
  status: InstallmentStatus;
  canceledAt: string | null;
  notes: string | null;
};

export type PaymentDto = {
  id: string;
  installmentId: string | null;
  amount: number;
  currency: Currency;
  paidAt: string;
  method: "efectivo" | "transferencia" | "tarjeta" | "otro";
  receiptNumber: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

/* ============================================================
 * Funciones puras — el criterio, sin base de datos
 * ============================================================ */

/**
 * Reparte `amount` en `count` cuotas mensuales desde `firstDueDate`.
 *
 * El resto de la división entera va a la PRIMERA cuota, no a la última: si
 * 100.000 se divide en 3, el alumno paga 33.334 + 33.333 + 33.333. Cargar el
 * resto al final haría que la última cuota —la que más se demora— sea la
 * distinta, y es la que peor se explica por teléfono.
 *
 * La suma SIEMPRE da exactamente `amount` (regla de integridad 1 del
 * data-model): sin eso, un plan de cuotas puede cobrar de menos sin que nadie
 * lo note.
 */
export function buildInstallmentPlan(
  amount: number,
  count: number,
  firstDueDate: Date
): { number: number; amount: number; dueDate: Date }[] {
  if (count < 1) throw new Error("El plan necesita al menos una cuota");
  if (amount < 0) throw new Error("El monto no puede ser negativo");

  const base = Math.floor(amount / count);
  const remainder = amount - base * count;

  return Array.from({ length: count }, (_, i) => {
    const dueDate = new Date(firstDueDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    return {
      number: i + 1,
      amount: i === 0 ? base + remainder : base,
      dueDate,
    };
  });
}

/**
 * Estado derivado de una cuota. `now` se inyecta para poder probar el
 * vencimiento sin depender del reloj de la máquina.
 */
export function installmentStatus(
  amount: number,
  paid: number,
  dueDate: Date,
  now: Date = new Date()
): InstallmentStatus {
  if (paid >= amount) return "pagada";
  if (dueDate < now) return "vencida";
  if (paid > 0) return "parcial";
  return "pendiente";
}

/** Total adeudado: cuotas vigentes menos lo efectivamente pagado. */
export function outstandingBalance(
  installments: { amount: number; paid: number; canceledAt: Date | null }[]
): number {
  return installments
    .filter((i) => !i.canceledAt)
    .reduce((sum, i) => sum + Math.max(0, i.amount - i.paid), 0);
}

/* ============================================================
 * Operaciones sobre la base
 * ============================================================ */

export type BillingResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

/**
 * Genera el plan de cuotas de una inscripción.
 *
 * Si ya hay cuotas vigentes, se rechaza en vez de pisarlas: rearmar un plan
 * es una decisión comercial (una refinanciación), no un efecto colateral de
 * volver a apretar un botón.
 */
export async function generateInstallmentPlan(
  organizationId: string,
  enrollmentId: string,
  input: { count: number; firstDueDate: Date }
): Promise<BillingResult<InstallmentDto[]>> {
  const db = getDb();

  const rows = await db
    .select({
      id: schema.enrollment.id,
      amount: schema.enrollment.amount,
      currency: schema.enrollment.currency,
    })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  const enrollment = rows[0];
  if (!enrollment) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }
  if (enrollment.amount === null) {
    return {
      ok: false,
      status: 422,
      code: "no_amount",
      message: "La inscripción no tiene monto cargado: no hay qué repartir en cuotas",
    };
  }

  const existing = await db
    .select({ id: schema.installment.id })
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        eq(schema.installment.enrollmentId, enrollmentId)
      )
    );
  if (existing.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "plan_exists",
      message: "La inscripción ya tiene un plan de cuotas. Anulá el actual antes de rearmarlo.",
    };
  }

  const plan = buildInstallmentPlan(enrollment.amount, input.count, input.firstDueDate);
  await db.insert(schema.installment).values(
    plan.map((p) => ({
      id: newId("installment"),
      organizationId,
      enrollmentId,
      number: p.number,
      dueDate: p.dueDate,
      amount: p.amount,
      currency: enrollment.currency,
    }))
  );

  const listed = await listInstallments(organizationId, enrollmentId);
  return { ok: true, data: listed };
}

/** Cuotas de una inscripción con su saldo y estado ya derivados. */
export async function listInstallments(
  organizationId: string,
  enrollmentId: string,
  now: Date = new Date()
): Promise<InstallmentDto[]> {
  const db = getDb();

  const [installments, payments] = await Promise.all([
    db
      .select()
      .from(schema.installment)
      .where(
        scoped(
          schema.installment.organizationId,
          organizationId,
          eq(schema.installment.enrollmentId, enrollmentId)
        )
      )
      .orderBy(asc(schema.installment.number)),
    db
      .select()
      .from(schema.payment)
      .where(
        scoped(
          schema.payment.organizationId,
          organizationId,
          eq(schema.payment.enrollmentId, enrollmentId)
        )
      ),
  ]);

  // Un pago anulado no cuenta para ningún saldo (regla de integridad 4).
  const paidByInstallment = new Map<string, number>();
  for (const p of payments) {
    if (p.voidedAt || !p.installmentId) continue;
    paidByInstallment.set(
      p.installmentId,
      (paidByInstallment.get(p.installmentId) ?? 0) + p.amount
    );
  }

  return installments.map((i) => {
    const paid = paidByInstallment.get(i.id) ?? 0;
    return {
      id: i.id,
      number: i.number,
      dueDate: i.dueDate.toISOString(),
      amount: i.amount,
      currency: i.currency,
      paid,
      balance: Math.max(0, i.amount - paid),
      status: i.canceledAt
        ? "pagada" // una cuota anulada no debe nada; no ensucia la morosidad
        : installmentStatus(i.amount, paid, i.dueDate, now),
      canceledAt: i.canceledAt?.toISOString() ?? null,
      notes: i.notes,
    };
  });
}

export type RecordPaymentInput = {
  installmentId?: string | null;
  amount: number;
  paidAt: Date;
  method: "efectivo" | "transferencia" | "tarjeta" | "otro";
  receiptNumber?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  recordedBy?: string | null;
};

/**
 * Registra un pago. Acepta el pago PARCIAL (DV-002): la caja de una academia
 * recibe lo que el alumno trae, y rechazar el parcial empuja al equipo de
 * vuelta al Excel justo en el caso incómodo.
 */
export async function recordPayment(
  organizationId: string,
  enrollmentId: string,
  input: RecordPaymentInput
): Promise<BillingResult<PaymentDto>> {
  const db = getDb();

  if (input.amount <= 0) {
    return { ok: false, status: 422, code: "invalid_amount", message: "El monto debe ser mayor a cero" };
  }

  // Idempotencia (FR-011): el mismo intento no crea dos pagos.
  if (input.idempotencyKey) {
    const dup = await db
      .select()
      .from(schema.payment)
      .where(
        scoped(
          schema.payment.organizationId,
          organizationId,
          eq(schema.payment.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (dup[0]) return { ok: true, data: serializePayment(dup[0]) };
  }

  const enrollmentRows = await db
    .select({ id: schema.enrollment.id, currency: schema.enrollment.currency })
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
  if (!enrollment) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  let currency: Currency = enrollment.currency;

  if (input.installmentId) {
    const instRows = await db
      .select()
      .from(schema.installment)
      .where(
        scoped(
          schema.installment.organizationId,
          organizationId,
          eq(schema.installment.id, input.installmentId)
        )
      )
      .limit(1);
    const inst = instRows[0];
    if (!inst || inst.enrollmentId !== enrollmentId) {
      return {
        ok: false,
        status: 422,
        code: "invalid_installment",
        message: "La cuota no pertenece a esta inscripción",
      };
    }
    // FR-004: un pago va en la moneda de su cuota. Un cambio de moneda se
    // modela como plan nuevo, no como un pago suelto en otra divisa.
    currency = inst.currency;
  }

  const inserted = await db
    .insert(schema.payment)
    .values({
      id: newId("payment"),
      organizationId,
      enrollmentId,
      installmentId: input.installmentId ?? null,
      amount: input.amount,
      currency,
      paidAt: input.paidAt,
      method: input.method,
      receiptNumber: input.receiptNumber ?? null,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      recordedBy: input.recordedBy ?? null,
    })
    .returning();

  return { ok: true, data: serializePayment(inserted[0]!) };
}

/**
 * Anula un pago. NO lo borra (FR-006): un pago mal cargado que desaparece
 * deja la caja del mes sin explicación. Queda con su motivo y deja de contar.
 */
export async function voidPayment(
  organizationId: string,
  paymentId: string,
  input: { reason: string; voidedBy?: string | null }
): Promise<BillingResult<PaymentDto>> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.payment)
    .where(
      scoped(schema.payment.organizationId, organizationId, eq(schema.payment.id, paymentId))
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) {
    return { ok: false, status: 404, code: "not_found", message: "Pago no encontrado" };
  }
  if (existing.voidedAt) {
    return { ok: false, status: 409, code: "already_voided", message: "El pago ya estaba anulado" };
  }

  const updated = await db
    .update(schema.payment)
    .set({
      voidedAt: new Date(),
      voidedBy: input.voidedBy ?? null,
      voidReason: input.reason,
    })
    .where(eq(schema.payment.id, paymentId))
    .returning();

  return { ok: true, data: serializePayment(updated[0]!) };
}

export async function listPayments(
  organizationId: string,
  enrollmentId: string
): Promise<PaymentDto[]> {
  const rows = await getDb()
    .select()
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        eq(schema.payment.enrollmentId, enrollmentId)
      )
    )
    .orderBy(asc(schema.payment.paidAt));
  return rows.map(serializePayment);
}

/**
 * 008 (T009) — Rearma el plan de cuotas: la refinanciación.
 *
 * Las cuotas viejas NO se borran, se ANULAN (`canceled_at`). Borrarlas haría
 * desaparecer la evidencia de lo que se había pactado antes, que es
 * justamente lo que se quiere poder mostrar cuando el alumno pregunta por qué
 * cambió su cuota.
 *
 * `409` si ya hay pagos imputados: los pagos apuntan a cuotas concretas, y
 * anular una cuota que ya recibió plata dejaría ese pago colgado de una
 * obligación que dejó de existir. Refinanciar con pagos hechos es una
 * operación contable distinta y no se resuelve apretando un botón.
 */
export async function replaceInstallmentPlan(
  organizationId: string,
  enrollmentId: string,
  input: { count: number; firstDueDate: Date }
): Promise<BillingResult<InstallmentDto[]>> {
  const db = getDb();

  const current = await listInstallments(organizationId, enrollmentId);
  const vigentes = current.filter((i) => !i.canceledAt);
  if (vigentes.length === 0) {
    return generateInstallmentPlan(organizationId, enrollmentId, input);
  }

  const conPagos = vigentes.filter((i) => i.paid > 0);
  if (conPagos.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "plan_has_payments",
      message: `No se puede rearmar el plan: la cuota #${conPagos[0]!.number} ya tiene pagos registrados. Anulá los pagos primero si fue un error.`,
    };
  }

  const rows = await db
    .select({ amount: schema.enrollment.amount, currency: schema.enrollment.currency })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  const enrollment = rows[0];
  if (!enrollment || enrollment.amount === null) {
    return {
      ok: false,
      status: 422,
      code: "no_amount",
      message: "La inscripción no tiene monto cargado",
    };
  }

  const now = new Date();
  await db
    .update(schema.installment)
    .set({ canceledAt: now, updatedAt: now })
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        eq(schema.installment.enrollmentId, enrollmentId),
        isNull(schema.installment.canceledAt)
      )
    );

  // El número sigue la numeración anterior: #1..#3 anuladas, #4..#9 vigentes.
  // Reiniciar en 1 chocaría con el índice único y, peor, haría que dos filas
  // distintas se llamen "cuota 1" en el historial del alumno.
  const offset = current.reduce((max, i) => Math.max(max, i.number), 0);
  const plan = buildInstallmentPlan(enrollment.amount, input.count, input.firstDueDate);
  await db.insert(schema.installment).values(
    plan.map((p) => ({
      id: newId("installment"),
      organizationId,
      enrollmentId,
      number: offset + p.number,
      dueDate: p.dueDate,
      amount: p.amount,
      currency: enrollment.currency,
      notes: `Refinanciación del ${now.toLocaleDateString("es-UY")}`,
    }))
  );

  return { ok: true, data: await listInstallments(organizationId, enrollmentId) };
}

/* ============================================================
 * Morosidad y caja cobrada (T020-T026)
 * ============================================================ */

export type OverdueRow = {
  enrollmentId: string;
  contact: { id: string; name: string };
  cohort: { id: string; name: string };
  overdueCount: number;
  overdueAmount: number;
  currency: Currency;
  oldestDueDate: string;
  daysOverdue: number;
};

export type OverdueDashboard = {
  asOf: string;
  byCurrency: { currency: Currency; overdueTotal: number; enrollments: number }[];
  rows: OverdueRow[];
};

const DAY_MS = 86_400_000;

/**
 * 008 (T020) — Quién debe y desde cuándo.
 *
 * Los totales van SIEMPRE separados por moneda: sumar $57.000 uruguayos con
 * 10.000.000 de guaraníes da un número que no significa nada, y convertir
 * exigiría un tipo de cambio que el CRM no tiene ni debe inventar.
 *
 * Una inscripción aparece una sola vez, con sus cuotas vencidas agregadas:
 * la pregunta operativa es "a quién llamo", no "qué cuota está vencida".
 */
export async function listOverdue(
  organizationId: string,
  filters: { cohortId?: string | null; minDaysOverdue?: number | null } = {},
  now: Date = new Date()
): Promise<OverdueDashboard> {
  const db = getDb();

  const rows = await db
    .select({
      installment: schema.installment,
      enrollmentId: schema.enrollment.id,
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
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
        lt(schema.installment.dueDate, now),
        filters.cohortId ? eq(schema.cohort.id, filters.cohortId) : undefined
      )
    );

  // Pagos no anulados de esas inscripciones, para descontar del vencido.
  const paidByInstallment = new Map<string, number>();
  if (rows.length > 0) {
    const payments = await db
      .select({ installmentId: schema.payment.installmentId, amount: schema.payment.amount })
      .from(schema.payment)
      .where(
        scoped(
          schema.payment.organizationId,
          organizationId,
          isNull(schema.payment.voidedAt)
        )
      );
    for (const p of payments) {
      if (!p.installmentId) continue;
      paidByInstallment.set(
        p.installmentId,
        (paidByInstallment.get(p.installmentId) ?? 0) + p.amount
      );
    }
  }

  const byEnrollment = new Map<string, OverdueRow>();
  for (const r of rows) {
    const balance = r.installment.amount - (paidByInstallment.get(r.installment.id) ?? 0);
    if (balance <= 0) continue; // vencida pero ya saldada: no es morosidad

    const existing = byEnrollment.get(r.enrollmentId);
    const oldest =
      existing && new Date(existing.oldestDueDate) < r.installment.dueDate
        ? new Date(existing.oldestDueDate)
        : r.installment.dueDate;

    byEnrollment.set(r.enrollmentId, {
      enrollmentId: r.enrollmentId,
      contact: {
        id: r.contactId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
      },
      cohort: { id: r.cohortId, name: r.cohortName ?? r.courseName },
      overdueCount: (existing?.overdueCount ?? 0) + 1,
      overdueAmount: (existing?.overdueAmount ?? 0) + balance,
      currency: r.installment.currency,
      oldestDueDate: oldest.toISOString(),
      daysOverdue: Math.floor((now.getTime() - oldest.getTime()) / DAY_MS),
    });
  }

  const min = filters.minDaysOverdue ?? 0;
  const result = [...byEnrollment.values()]
    .filter((r) => r.daysOverdue >= min)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const byCurrency = CURRENCIES.map((currency) => {
    const of = result.filter((r) => r.currency === currency);
    return {
      currency,
      overdueTotal: of.reduce((s, r) => s + r.overdueAmount, 0),
      enrollments: of.length,
    };
  });

  return { asOf: now.toISOString(), byCurrency, rows: result };
}

/**
 * 008 (T024) — Cuánto ENTRÓ en un rango, por moneda.
 *
 * Mira `payment.paid_at` y no `created_at`: la caja de agosto es la plata que
 * entró en agosto, aunque se haya cargado en septiembre. Los pagos anulados
 * no cuentan.
 */
export async function collectedByCurrency(
  organizationId: string,
  start: Date,
  end: Date
): Promise<{ currency: Currency; total: number }[]> {
  const rows = await getDb()
    .select({ currency: schema.payment.currency, total: sum(schema.payment.amount) })
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        isNull(schema.payment.voidedAt),
        gte(schema.payment.paidAt, start),
        lt(schema.payment.paidAt, end)
      )
    )
    .groupBy(schema.payment.currency);

  const byCurrency = new Map(rows.map((r) => [r.currency, Number(r.total ?? 0)]));
  return CURRENCIES.map((currency) => ({
    currency,
    total: byCurrency.get(currency) ?? 0,
  }));
}

function serializePayment(p: typeof schema.payment.$inferSelect): PaymentDto {
  return {
    id: p.id,
    installmentId: p.installmentId,
    amount: p.amount,
    currency: p.currency,
    paidAt: p.paidAt.toISOString(),
    method: p.method,
    receiptNumber: p.receiptNumber,
    notes: p.notes,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    voidReason: p.voidReason,
  };
}
