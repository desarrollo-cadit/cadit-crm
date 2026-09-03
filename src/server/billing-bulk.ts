import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { generateInstallmentPlan, recordPayment } from "@/server/billing";

/**
 * 022 — Cobranza en BLOQUE.
 *
 * La maquinaria de cobranza está completa desde la 008. Lo que faltaba era
 * poder usarla sobre 383 inscripciones: de a una son 192 recorridos de
 * "abrir cohorte → abrir alumno → abrir panel → cargar", y ese trabajo no se
 * hace nunca. La limitación no era de la interfaz — era la razón por la que la
 * cobranza seguía en cero.
 */

/**
 * Qué hacer con el lote. **Se declara, no se adivina.**
 *
 * El sistema no puede deducir si una inscripción ya se cobró o se cobra en
 * cuotas: eso lo sabe el dueño. Y la medición mostró por qué importa — **152
 * inscripciones ya tienen número de factura y 236 tienen notas de pago**
 * ("transferencia", "Tarjeta OCA"). Esa plata YA entró. Generarles un plan de
 * cuotas a futuro haría que el sistema le mande avisos de morosidad a quienes
 * ya pagaron.
 */
export type ModoCobranza =
  /** Ya se cobró: una cuota por el total, saldada el día que se indique. */
  | {
      kind: "cobrada";
      paidAt: Date;
      method: "efectivo" | "transferencia" | "tarjeta" | "otro";
    }
  /** Se va a cobrar: plan de N cuotas desde una fecha. */
  | { kind: "plan"; count: number; firstDueDate: Date };

export type SaltadaMotivo =
  | "sin_monto"
  | "ya_tiene_plan"
  | "no_encontrada"
  /**
   * 023 — El pago no entró por un motivo que decide `recordPayment`: cuota
   * inválida, importe en cero, idempotencia. Existe porque antes esto se
   * reportaba como `sin_monto`, que es OTRA cosa y además falsa —la
   * inscripción sí tenía monto, si no no habría llegado hasta acá—. El
   * `motivo` es la llave con la que se agrupa y se asertea; el `detalle`
   * trae el mensaje real.
   */
  | "fallo_pago";

export type ResultadoLote = {
  aplicadas: number;
  saltadas: { enrollmentId: string; motivo: SaltadaMotivo; detalle: string }[];
};

/** El texto de cada motivo, en un solo lugar. */
export const MOTIVOS: Record<SaltadaMotivo, string> = {
  sin_monto:
    "No tiene monto cargado: no hay qué repartir en cuotas. Cargalo en la ficha de inscripción.",
  ya_tiene_plan:
    "Ya tiene cuotas generadas. Se dejó como estaba: rehacer un plan es una acción aparte y de a una.",
  no_encontrada: "No existe en esta organización.",
  fallo_pago:
    "El pago no se pudo registrar. El detalle dice por qué; la cuota quedó creada y sin pagar.",
};

/**
 * Decide qué pasa con UNA inscripción. **Pura**: es la regla que puede fallar
 * en silencio sobre 192 registros, y probarla no debería necesitar una base.
 */
export function decidirCobranza(inscripcion: {
  amount: number | null;
  yaTienePlan: boolean;
}): { aplica: boolean; motivo?: SaltadaMotivo } {
  // El orden importa: sin monto no hay nada que hacer, tenga plan o no.
  if (inscripcion.amount === null || inscripcion.amount <= 0) {
    return { aplica: false, motivo: "sin_monto" };
  }
  // Constitución IV: correr el lote dos veces no puede duplicar nada.
  if (inscripcion.yaTienePlan) return { aplica: false, motivo: "ya_tiene_plan" };
  return { aplica: true };
}

/**
 * Aplica el modo elegido a un lote de inscripciones.
 *
 * **Nunca falla entero.** Con 192 registros, cortar en el primer problema
 * dejaría el lote a medias y sin forma de saber dónde quedó. Cada inscripción
 * se resuelve por su cuenta y al final se informa qué se hizo y qué no, con el
 * motivo (FR-007).
 */
export async function applyBillingToBatch(
  organizationId: string,
  enrollmentIds: string[],
  modo: ModoCobranza,
  actorId?: string | null
): Promise<ResultadoLote> {
  if (enrollmentIds.length === 0) return { aplicadas: 0, saltadas: [] };

  const db = getDb();

  const inscripciones = await db
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
        inArray(schema.enrollment.id, enrollmentIds)
      )
    );

  /**
   * Una sola consulta para saber quiénes YA tienen plan, en vez de una por
   * inscripción: con 192, el N+1 se nota.
   */
  const conPlan = await db
    .selectDistinct({ enrollmentId: schema.installment.enrollmentId })
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        inArray(schema.installment.enrollmentId, enrollmentIds)
      )
    );
  const yaTienenPlan = new Set(conPlan.map((r) => r.enrollmentId));

  const salida: ResultadoLote = { aplicadas: 0, saltadas: [] };
  const encontradas = new Set(inscripciones.map((i) => i.id));

  for (const id of enrollmentIds) {
    if (!encontradas.has(id)) {
      salida.saltadas.push({
        enrollmentId: id,
        motivo: "no_encontrada",
        detalle: MOTIVOS.no_encontrada,
      });
    }
  }

  for (const insc of inscripciones) {
    const decision = decidirCobranza({
      amount: insc.amount,
      yaTienePlan: yaTienenPlan.has(insc.id),
    });
    if (!decision.aplica) {
      const motivo = decision.motivo ?? "sin_monto";
      salida.saltadas.push({
        enrollmentId: insc.id,
        motivo,
        detalle: MOTIVOS[motivo],
      });
      continue;
    }

    if (modo.kind === "plan") {
      const r = await generateInstallmentPlan(organizationId, insc.id, {
        count: modo.count,
        firstDueDate: modo.firstDueDate,
      });
      if (r.ok) salida.aplicadas += 1;
      else
        salida.saltadas.push({
          enrollmentId: insc.id,
          motivo: "ya_tiene_plan",
          detalle: r.message,
        });
      continue;
    }

    /**
     * Modo "ya cobrada": UNA cuota por el total, vencida el día del pago, y el
     * pago que la salda.
     *
     * Se hace con las MISMAS funciones que usa la carga de a una, no con un
     * insert propio: así el estado derivado (pagada / parcial / vencida) y la
     * morosidad siguen saliendo de un solo lugar.
     */
    const plan = await generateInstallmentPlan(organizationId, insc.id, {
      count: 1,
      firstDueDate: modo.paidAt,
    });
    if (!plan.ok) {
      salida.saltadas.push({
        enrollmentId: insc.id,
        motivo: "ya_tiene_plan",
        detalle: plan.message,
      });
      continue;
    }

    const pago = await recordPayment(organizationId, insc.id, {
      installmentId: plan.data[0]?.id ?? null,
      amount: insc.amount ?? 0,
      paidAt: modo.paidAt,
      method: modo.method,
      notes: "Registrado en bloque: el cobro ya había ocurrido.",
      /**
       * La llave de idempotencia es de la INSCRIPCIÓN, no del lote: si el lote
       * se repite —o se pisa con otro que incluya a la misma persona— el pago
       * no se duplica.
       */
      idempotencyKey: `bulk-cobrada-${insc.id}`,
      recordedBy: actorId ?? null,
    });
    if (pago.ok) salida.aplicadas += 1;
    else
      salida.saltadas.push({
        enrollmentId: insc.id,
        motivo: "fallo_pago",
        detalle: pago.message,
      });
  }

  return salida;
}

/**
 * Las inscripciones de una cohorte, para aplicarle el lote entero.
 *
 * Existe porque el caso real es "cargar la cobranza de ESTA cohorte", no
 * "elegir 18 casillas a mano". La selección puntual sigue siendo posible —
 * la ruta acepta una lista— pero no puede ser el único camino, o volvemos al
 * problema que esta fase vino a resolver.
 */
export async function enrollmentIdsDeCohorte(
  organizationId: string,
  cohortId: string
): Promise<string[]> {
  const filas = await getDb()
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    );
  return filas.map((f) => f.id);
}

export type PreviewLote = {
  total: number;
  aplicables: number;
  sinMonto: number;
  yaTienenPlan: number;
};

/**
 * Cuántas inscripciones de una cohorte están en condiciones, ANTES de tocar
 * nada.
 *
 * La pantalla lo necesita para poder decir "vas a afectar 18 de 24, y estas 6
 * no porque…" en vez de que la persona lo descubra recién después de apretar.
 */
export async function previewLote(
  organizationId: string,
  cohortId: string
): Promise<PreviewLote> {
  const db = getDb();

  const inscripciones = await db
    .select({ id: schema.enrollment.id, amount: schema.enrollment.amount })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    );

  if (inscripciones.length === 0) {
    return { total: 0, aplicables: 0, sinMonto: 0, yaTienenPlan: 0 };
  }

  const conPlan = await db
    .selectDistinct({ enrollmentId: schema.installment.enrollmentId })
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        inArray(
          schema.installment.enrollmentId,
          inscripciones.map((i) => i.id)
        )
      )
    );
  const yaTienen = new Set(conPlan.map((r) => r.enrollmentId));

  let aplicables = 0;
  let sinMonto = 0;
  let yaTienenPlan = 0;
  for (const i of inscripciones) {
    const d = decidirCobranza({ amount: i.amount, yaTienePlan: yaTienen.has(i.id) });
    if (d.aplica) aplicables += 1;
    else if (d.motivo === "sin_monto") sinMonto += 1;
    else yaTienenPlan += 1;
  }

  return { total: inscripciones.length, aplicables, sinMonto, yaTienenPlan };
}
