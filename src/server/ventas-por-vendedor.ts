import { asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CURRENCIES, type Currency } from "@/lib/db/schema";
import { scoped } from "@/lib/db/tenant";
import { organizationTimezone, resolverPeriodo, type Periodo } from "@/server/finanzas-periodo";

/**
 * 2026-10-06 (decisión del dueño) — Ventas por vendedor, para que
 * administración pague comisiones.
 *
 * Las reglas, y por qué:
 *
 * - **Una venta es una inscripción MADRE con cohorte.** El lead sin cohorte
 *   es interés, no venta. La hija de una especialización es un módulo del
 *   paquete que ya se vendió en la madre: contarla duplica la venta.
 * - **Fecha de venta: `enrolled_at`, con `created_at` de respaldo** — el
 *   mismo criterio que el facturado del panel (`finance.ts`). `createEnrollment`
 *   siempre fija `enrolled_at`; el respaldo cubre filas viejas sin ella.
 * - **El período se corta en la zona de la academia** (`resolverPeriodo`, el
 *   mismo del cierre): una venta de la última noche del mes es de ese mes.
 * - **Nunca se suman monedas.** Un total por moneda, en el orden fijo de
 *   `CURRENCIES`; no existe un total general (ROADMAP, 2026-09-07).
 * - **"Sin vendedor" es un grupo propio**, al final, para corregirlo.
 * - **El alumno dado de baja sigue, marcado**: la venta ocurrió y la comisión
 *   se decide afuera del CRM.
 * - **Sin porcentajes de comisión**: el dueño no los especificó, y un número
 *   inventado acá se paga.
 */

export type VendedorDeVenta = { id: string; name: string; archived: boolean };

/** Una inscripción tal como sale de la base, antes de decidir si es una venta del período. */
export type VentaDelPeriodo = {
  enrollmentId: string;
  cohortId: string | null;
  parentEnrollmentId: string | null;
  fecha: Date;
  importe: number | null;
  currency: Currency;
  alumno: string;
  alumnoDeBaja: boolean;
  cohorte: string;
  curso: string;
  vendedor: VendedorDeVenta | null;
};

export type FilaVenta = {
  enrollmentId: string;
  cohortId: string;
  fecha: string;
  alumno: string;
  alumnoDeBaja: boolean;
  cohorte: string;
  curso: string;
  importe: number | null;
  currency: Currency;
};

/** El total de UNA moneda. No existe ningún otro. */
export type TotalVendedor = { currency: Currency; total: number; ventas: number };

export type GrupoVendedor = {
  /** `null` = "Sin vendedor". */
  vendedor: VendedorDeVenta | null;
  filas: FilaVenta[];
  totales: TotalVendedor[];
  /** Ventas sin monto cargado: se listan, pero no aportan un importe inventado. */
  sinMonto: number;
};

export type VentasPorVendedor = {
  grupos: GrupoVendedor[];
  /** Cuántas ventas del período no tienen vendedor. */
  sinVendedor: number;
};

/** El criterio, sin base de datos. La consulta sólo acota: la regla vive acá. */
export function armarVentasPorVendedor(
  ventas: readonly VentaDelPeriodo[],
  periodo: Pick<Periodo, "desde" | "hasta">
): VentasPorVendedor {
  const desde = periodo.desde.getTime();
  const hasta = periodo.hasta.getTime();

  const porVendedor = new Map<string, { vendedor: VendedorDeVenta | null; filas: FilaVenta[] }>();
  for (const v of ventas) {
    if (v.cohortId === null || v.parentEnrollmentId !== null) continue;
    const t = v.fecha.getTime();
    if (t < desde || t >= hasta) continue;

    const clave = v.vendedor?.id ?? "";
    const grupo = porVendedor.get(clave) ?? { vendedor: v.vendedor, filas: [] };
    grupo.filas.push({
      enrollmentId: v.enrollmentId,
      cohortId: v.cohortId,
      fecha: v.fecha.toISOString(),
      alumno: v.alumno,
      alumnoDeBaja: v.alumnoDeBaja,
      cohorte: v.cohorte,
      curso: v.curso,
      importe: v.importe,
      currency: v.currency,
    });
    porVendedor.set(clave, grupo);
  }

  const grupos: GrupoVendedor[] = [...porVendedor.values()]
    .map(({ vendedor, filas }) => {
      filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.enrollmentId.localeCompare(b.enrollmentId));
      const totales: TotalVendedor[] = [];
      for (const currency of CURRENCIES) {
        const deEsaMoneda = filas.filter((f) => f.currency === currency);
        if (deEsaMoneda.length === 0) continue;
        totales.push({
          currency,
          total: deEsaMoneda.reduce((s, f) => s + (f.importe ?? 0), 0),
          ventas: deEsaMoneda.length,
        });
      }
      return { vendedor, filas, totales, sinMonto: filas.filter((f) => f.importe === null).length };
    })
    .sort((a, b) => {
      if (!a.vendedor) return 1;
      if (!b.vendedor) return -1;
      return a.vendedor.name.localeCompare(b.vendedor.name, "es") || a.vendedor.id.localeCompare(b.vendedor.id);
    });

  return {
    grupos,
    sinVendedor: grupos.find((g) => g.vendedor === null)?.filas.length ?? 0,
  };
}

const nombre = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ").trim();

/** El reporte de un período, con el período resuelto en la zona de la organización. */
export async function ventasPorVendedor(
  organizationId: string,
  opciones: { mes?: string | null } = {},
  ahora: Date = new Date()
): Promise<VentasPorVendedor & { periodo: Periodo }> {
  const timezone = await organizationTimezone(organizationId);
  const periodo = resolverPeriodo(opciones.mes, timezone, ahora);
  const fechaDeVenta = sql`coalesce(${schema.enrollment.enrolledAt}, ${schema.enrollment.createdAt})`;

  const filas = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      enrolledAt: schema.enrollment.enrolledAt,
      createdAt: schema.enrollment.createdAt,
      importe: schema.enrollment.amount,
      currency: schema.enrollment.currency,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      contactArchivedAt: schema.contact.archivedAt,
      cohorte: schema.cohort.name,
      curso: schema.course.name,
      sellerId: schema.seller.id,
      sellerName: schema.seller.name,
      sellerArchivedAt: schema.seller.archivedAt,
    })
    .from(schema.enrollment)
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.seller, eq(schema.enrollment.sellerId, schema.seller.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        isNotNull(schema.enrollment.cohortId),
        isNull(schema.enrollment.parentEnrollmentId),
        // ISO y no el Date crudo: en un `sql` sin tipo de columna resuelto,
        // postgres.js no sabe serializarlo (mismo motivo que en finance.ts).
        sql`${fechaDeVenta} >= ${periodo.desde.toISOString()} AND ${fechaDeVenta} < ${periodo.hasta.toISOString()}`
      )
    )
    .orderBy(asc(fechaDeVenta), asc(schema.enrollment.id));

  const ventas: VentaDelPeriodo[] = filas.map((f) => ({
    enrollmentId: f.enrollmentId,
    cohortId: f.cohortId,
    parentEnrollmentId: f.parentEnrollmentId,
    fecha: f.enrolledAt ?? f.createdAt,
    importe: f.importe,
    currency: f.currency,
    alumno: nombre(f.firstName, f.lastName),
    alumnoDeBaja: f.contactArchivedAt !== null,
    cohorte: f.cohorte ?? f.curso,
    curso: f.curso,
    vendedor:
      f.sellerId && f.sellerName
        ? { id: f.sellerId, name: f.sellerName, archived: f.sellerArchivedAt !== null }
        : null,
  }));

  return { periodo, ...armarVentasPorVendedor(ventas, periodo) };
}
