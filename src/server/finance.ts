import { sql, sum } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export type MonthTotal = { month: string; total: number };
export type FinanceDashboard = { currentMonth: MonthTotal; previousMonth: MonthTotal };

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Suma `enrollment.amount` de la organización cuya fecha de inscripción cae
 * en `[start, end)`. Se usa `enrolledAt` (siempre presente en inscripciones
 * comerciales — `createEnrollment` la fija) con `createdAt` como respaldo
 * para no perder registros si alguna vez falta (spec.md, "agrupado por mes
 * de enrolledAt/createdAt").
 */
async function sumAmountInRange(
  organizationId: string,
  start: Date,
  end: Date
): Promise<number> {
  const db = getDb();
  const dateExpr = sql`coalesce(${schema.enrollment.enrolledAt}, ${schema.enrollment.createdAt})`;
  // Interpolar el Date directo (sin tipo de columna resuelto en este raw sql)
  // hace que postgres.js falle al serializarlo — se pasa como ISO string,
  // que Postgres castea sin problema contra una expresión `timestamp`.
  const rows = await db
    .select({ total: sum(schema.enrollment.amount) })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        sql`${dateExpr} >= ${start.toISOString()} AND ${dateExpr} < ${end.toISOString()}`
      )
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * 005 (T036, US6, FR-019) — total facturado del mes actual vs. el anterior,
 * relativo a `reference` (por defecto, ahora).
 */
export async function monthlyRevenue(
  organizationId: string,
  reference: Date = new Date()
): Promise<FinanceDashboard> {
  const currentStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const currentEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const previousStart = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const previousEnd = currentStart;

  const [currentTotal, previousTotal] = await Promise.all([
    sumAmountInRange(organizationId, currentStart, currentEnd),
    sumAmountInRange(organizationId, previousStart, previousEnd),
  ]);

  return {
    currentMonth: { month: monthKey(currentStart), total: currentTotal },
    previousMonth: { month: monthKey(previousStart), total: previousTotal },
  };
}

export type TrendPoint = { month: string; total: number };

/**
 * 005 iteración 2 (home con gráficos, pedido en vivo del dueño) — total
 * facturado de los últimos `months` meses (incluye el actual), reusando
 * `sumAmountInRange` en vez de duplicar la lógica de `monthlyRevenue`.
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
      return sumAmountInRange(organizationId, start, end).then((total) => ({
        month: monthKey(start),
        total,
      }));
    })
  );
  return points;
}
