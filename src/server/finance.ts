import { sql, sum } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { scoped } from "@/lib/db/tenant";
import { collectedByCurrency } from "@/server/billing";

/** Total facturado en UNA moneda. Nunca se suma con el de otra. */
export type CurrencyTotal = { currency: Currency; total: number };

/**
 * 007 (corrección) — totales de un mes, uno por moneda. Antes esto era un
 * `total: number` único que sumaba `enrollment.amount` ignorando
 * `enrollment.currency`: un alumno de Paraguay pagando en guaraníes inflaba
 * el mismo número que uno de Uruguay pagando en pesos. Convertir exigiría un
 * tipo de cambio que el CRM no tiene, y que no debe inventar — así que los
 * totales se reportan separados y la suma cruzada deja de ser representable.
 */
export type MonthTotals = { month: string; totals: CurrencyTotal[] };
export type FinanceDashboard = {
  currentMonth: MonthTotals;
  previousMonth: MonthTotals;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Agrupa las filas de la BD en un total por moneda, en el orden fijo de
 * `CURRENCIES` y completando con 0 las que no tuvieron movimiento. El orden
 * estable importa: el panel y el gráfico leen por posición y no deben
 * reordenarse mes a mes según qué moneda vendió.
 */
function toCurrencyTotals(rows: { currency: string | null; total: unknown }[]): CurrencyTotal[] {
  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    if (!row.currency) continue;
    byCurrency.set(row.currency, Number(row.total ?? 0));
  }
  return CURRENCIES.map((currency) => ({
    currency,
    total: byCurrency.get(currency) ?? 0,
  }));
}

/**
 * Suma `enrollment.amount` de la organización cuya fecha de inscripción cae
 * en `[start, end)`, AGRUPADO POR `enrollment.currency`. Se usa `enrolledAt`
 * (siempre presente en inscripciones comerciales — `createEnrollment` la fija)
 * con `createdAt` como respaldo para no perder registros si alguna vez falta
 * (spec.md, "agrupado por mes de enrolledAt/createdAt").
 */
async function sumByCurrencyInRange(
  organizationId: string,
  start: Date,
  end: Date
): Promise<CurrencyTotal[]> {
  const db = getDb();
  const dateExpr = sql`coalesce(${schema.enrollment.enrolledAt}, ${schema.enrollment.createdAt})`;
  // Interpolar el Date directo (sin tipo de columna resuelto en este raw sql)
  // hace que postgres.js falle al serializarlo — se pasa como ISO string,
  // que Postgres castea sin problema contra una expresión `timestamp`.
  const rows = await db
    .select({ currency: schema.enrollment.currency, total: sum(schema.enrollment.amount) })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        sql`${dateExpr} >= ${start.toISOString()} AND ${dateExpr} < ${end.toISOString()}`
      )
    )
    .groupBy(schema.enrollment.currency);
  return toCurrencyTotals(rows);
}

/**
 * 005 (T036, US6, FR-019) — total facturado del mes actual vs. el anterior,
 * relativo a `reference` (por defecto, ahora), separado por moneda (007).
 */
export async function monthlyRevenue(
  organizationId: string,
  reference: Date = new Date()
): Promise<FinanceDashboard> {
  const currentStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const currentEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const previousStart = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const previousEnd = currentStart;

  const [currentTotals, previousTotals] = await Promise.all([
    sumByCurrencyInRange(organizationId, currentStart, currentEnd),
    sumByCurrencyInRange(organizationId, previousStart, previousEnd),
  ]);

  return {
    currentMonth: { month: monthKey(currentStart), totals: currentTotals },
    previousMonth: { month: monthKey(previousStart), totals: previousTotals },
  };
}

/**
 * 008 (T024/T025) — Lo COBRADO, con la misma forma que lo facturado.
 *
 * Comparte `monthKey` y el tipo `MonthTotals` a propósito: el panel del home
 * pone los dos números uno al lado del otro, y si divergen en formato o en
 * orden de monedas la comparación deja de leerse de un vistazo.
 *
 * La diferencia está en QUÉ se suma: facturado mira `enrollment.amount` por
 * fecha de inscripción; cobrado mira `payment.paid_at`. Un mes puede tener
 * mucho facturado y poco cobrado, y ese hueco es justamente el dato que esta
 * feature vino a hacer visible.
 */
export async function collectedRevenue(
  organizationId: string,
  reference: Date = new Date()
): Promise<FinanceDashboard> {
  const currentStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const currentEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const previousStart = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);

  const [current, previous] = await Promise.all([
    collectedByCurrency(organizationId, currentStart, currentEnd),
    collectedByCurrency(organizationId, previousStart, currentStart),
  ]);

  return {
    currentMonth: { month: monthKey(currentStart), totals: current },
    previousMonth: { month: monthKey(previousStart), totals: previous },
  };
}

/** 008 — Serie de cobrado de los últimos `months` meses, para el gráfico. */
export async function collectedTrend(
  organizationId: string,
  months = 6,
  reference: Date = new Date()
): Promise<MonthTotals[]> {
  const points: MonthTotals[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(reference.getFullYear(), reference.getMonth() - i, 1);
    const end = new Date(reference.getFullYear(), reference.getMonth() - i + 1, 1);
    points.push({
      month: monthKey(start),
      totals: await collectedByCurrency(organizationId, start, end),
    });
  }
  return points;
}

export type TrendPoint = MonthTotals;

/**
 * 005 iteración 2 (home con gráficos, pedido en vivo del dueño) — total
 * facturado de los últimos `months` meses (incluye el actual), reusando
 * `sumByCurrencyInRange` en vez de duplicar la lógica de `monthlyRevenue`.
 */
export async function revenueTrend(
  organizationId: string,
  months = 6,
  reference: Date = new Date()
): Promise<TrendPoint[]> {
  const points = await Promise.all(
    Array.from({ length: months }, (_, idx) => {
      const offset = months - 1 - idx;
      const start = new Date(reference.getFullYear(), reference.getMonth() - offset, 1);
      const end = new Date(reference.getFullYear(), reference.getMonth() - offset + 1, 1);
      return sumByCurrencyInRange(organizationId, start, end).then((totals) => ({
        month: monthKey(start),
        totals,
      }));
    })
  );
  return points;
}

/**
 * 007 — qué monedas tuvieron movimiento en la ventana observada. El panel
 * muestra una pestaña por moneda activa: con una sola moneda (el caso normal)
 * queda idéntico a antes, y solo aparecen las pestañas cuando de verdad hay
 * más de una. Se calcula acá y no en el cliente para que el panel no tenga
 * que recorrer la serie entera ni conocer el orden de `CURRENCIES`.
 */
export function activeCurrencies(points: MonthTotals[]): Currency[] {
  const active = CURRENCIES.filter((currency) =>
    points.some((point) =>
      point.totals.some((t) => t.currency === currency && t.total !== 0)
    )
  );
  // Sin ninguna venta todavía no hay "moneda activa", pero el panel necesita
  // una para renderizar: la de por defecto de la organización.
  return active.length > 0 ? [...active] : ["UYU"];
}
