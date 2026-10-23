import { eq, gte, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { periodoDeRecompra } from "@/lib/marketing/recompra";
import {
  alumnosPorPeriodo,
  comprasDelPeriodo,
  cursosMasCursados,
  embudoPorOrigen,
  empresasQueMasCapacitan,
  empresasVsParticulares,
  evolucionPorCurso,
  ingresosPorCurso,
  recompraResumen,
  ventasPorAnio,
  ventasPorVendedor,
  type ContextoDeReportes,
} from "@/lib/reportes";
import { relojDeAsistencia } from "@/server/attendance";
import { idsPorTipo } from "@/server/contact-types";
import { historialesDeLaOrganizacion } from "@/server/recorrido-comercial";

/**
 * 046 US8 (FR-027…FR-031; DV-023) — Los reportes del inicio en un viaje: la
 * derivación del historial se lee una vez y las agregaciones son puras
 * (`src/lib/reportes.ts`).
 *
 * **Un dato que no se debe ver no viaja**: los pagos se consultan SOLO con
 * `conIngresos` (la ruta lo decide por `cobranza.ver`); sin eso, la clave
 * `ingresosPorCurso` no existe en la respuesta.
 */

export type ReportesDto = {
  periodo: { desde: string | null; hasta: string | null };
  empresasExcluidas: number;
  cursosMasCursados: {
    conGratuitos: ReturnType<typeof cursosMasCursados>;
    sinGratuitos: ReturnType<typeof cursosMasCursados>;
  };
  alumnosPorPeriodo: ReturnType<typeof alumnosPorPeriodo>;
  empresasQueMasCapacitan: ReturnType<typeof empresasQueMasCapacitan>;
  embudoPorOrigen: ReturnType<typeof embudoPorOrigen>;
  recompra: ReturnType<typeof recompraResumen>;
  ventasPorAnio: ReturnType<typeof ventasPorAnio>;
  ventasPorVendedor: ReturnType<typeof ventasPorVendedor>;
  empresasVsParticulares: ReturnType<typeof empresasVsParticulares>;
  evolucionPorCurso: ReturnType<typeof evolucionPorCurso>;
  ingresosPorCurso?: ReturnType<typeof ingresosPorCurso>;
};

export async function reportesDeLaOrganizacion(
  organizationId: string,
  rango: { desde: string | null; hasta: string | null },
  opts: { conIngresos: boolean },
  now: Date = new Date()
): Promise<{ ok: true; reportes: ReportesDto } | { ok: false; message: string }> {
  const { timeZone } = await relojDeAsistencia(organizationId, now);
  const leido = periodoDeRecompra(rango.desde, rango.hasta, timeZone);
  if (!leido.ok) return leido;
  const periodo = leido.periodo;

  const db = getDb();
  const [historiales, gratuitos, empresas, vendedores, contactos] = await Promise.all([
    historialesDeLaOrganizacion(organizationId, now),
    db
      .select({ id: schema.course.id })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.isFree, true))),
    db
      .select({
        id: schema.company.id,
        legalName: schema.company.legalName,
        tradeName: schema.company.tradeName,
        excludeFromReports: schema.company.excludeFromReports,
      })
      .from(schema.company)
      .where(scoped(schema.company.organizationId, organizationId)),
    db
      .select({ id: schema.seller.id, name: schema.seller.name })
      .from(schema.seller)
      .where(scoped(schema.seller.organizationId, organizationId)),
    db
      .select({ id: schema.contact.id, source: schema.contact.source, createdAt: schema.contact.createdAt })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId)),
  ]);

  const ctx: ContextoDeReportes = {
    cursosGratuitos: new Set(gratuitos.map((c) => c.id)),
    empresasExcluidas: new Set(empresas.filter((e) => e.excludeFromReports).map((e) => e.id)),
    vendedores: new Map(vendedores.map((v) => [v.id, v.name])),
    empresas: new Map(empresas.map((e) => [e.id, e.tradeName?.trim() || e.legalName])),
  };
  const compras = comprasDelPeriodo(historiales, periodo, ctx);
  const tipos = idsPorTipo(historiales);

  const reportes: ReportesDto = {
    periodo: periodo.etiqueta,
    empresasExcluidas: ctx.empresasExcluidas.size,
    cursosMasCursados: {
      conGratuitos: cursosMasCursados(compras, ctx, { incluirGratuitos: true }),
      sinGratuitos: cursosMasCursados(compras, ctx, { incluirGratuitos: false }),
    },
    alumnosPorPeriodo: alumnosPorPeriodo(compras),
    empresasQueMasCapacitan: empresasQueMasCapacitan(compras, ctx),
    embudoPorOrigen: embudoPorOrigen(contactos, tipos.tipoDe, periodo),
    recompra: recompraResumen(historiales, periodo, ctx),
    ventasPorAnio: ventasPorAnio(compras, ctx),
    ventasPorVendedor: ventasPorVendedor(compras, ctx),
    empresasVsParticulares: empresasVsParticulares(compras, ctx),
    evolucionPorCurso: evolucionPorCurso(compras, ctx),
  };

  if (opts.conIngresos) {
    const p = schema.payment;
    const pagos = await db
      .select({ courseName: schema.course.name, currency: p.currency, amount: p.amount })
      .from(p)
      .innerJoin(schema.enrollment, eq(schema.enrollment.id, p.enrollmentId))
      .innerJoin(schema.cohort, eq(schema.cohort.id, schema.enrollment.cohortId))
      .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
      .where(
        scoped(
          p.organizationId,
          organizationId,
          isNull(p.voidedAt),
          periodo.desde ? gte(p.paidAt, periodo.desde) : undefined,
          periodo.hastaExclusivo ? lt(p.paidAt, periodo.hastaExclusivo) : undefined
        )
      );
    reportes.ingresosPorCurso = ingresosPorCurso(pagos);
  }

  return { ok: true, reportes };
}
