import { metricasDeRecompra, type PeriodoDeRecompra } from "@/lib/marketing/recompra";
import type { EntradaDeHistorial, TipoDeContacto } from "@/lib/recorrido-comercial";

/**
 * 046 US8 (FR-027…FR-031) — Los reportes del inicio, PUROS.
 *
 * Todo sale de los historiales de la derivación única
 * (`historialesComerciales`): un grupo que nunca se dictó no cuenta, una
 * cursada histórica sí (cuando el período la cubre). Una **compra** es una
 * entrada del historial fechada por su primer inicio, como en Recompra.
 *
 * - Las compras de una empresa marcada "Excluir de los reportes" no cuentan
 *   en NINGÚN reporte.
 * - Los cursos marcados "Gratuito" no cuentan en los reportes de ventas
 *   (ventas por año, por vendedor, empresas vs particulares, evolución) y en
 *   "Cursos más cursados" solo si se pide.
 *
 * Sin nombres de personas: solo cifras, cursos, empresas y vendedores.
 */

export const OTROS = "Otros";
export const SIN_VENDEDOR = "Sin vendedor";
const TOP = 10;

export type ContextoDeReportes = {
  cursosGratuitos: ReadonlySet<string>;
  empresasExcluidas: ReadonlySet<string>;
  /** id → nombre */
  vendedores: ReadonlyMap<string, string>;
  /** id → nombre */
  empresas: ReadonlyMap<string, string>;
};

export type Compra = { contactId: string; entrada: EntradaDeHistorial };

const anioDe = (d: Date) => String(d.getUTCFullYear());
const trimestreDe = (d: Date) => `${d.getUTCFullYear()}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
const porcentaje = (parte: number, total: number) => (total === 0 ? 0 : Math.round((parte / total) * 1000) / 10);

function enPeriodo(d: Date, periodo: PeriodoDeRecompra): boolean {
  return (
    (!periodo.desde || d.getTime() >= periodo.desde.getTime()) &&
    (!periodo.hastaExclusivo || d.getTime() < periodo.hastaExclusivo.getTime())
  );
}

const excluida = (e: EntradaDeHistorial, ctx: ContextoDeReportes) =>
  e.companyId !== null && ctx.empresasExcluidas.has(e.companyId);

const esVenta = (e: EntradaDeHistorial, ctx: ContextoDeReportes) => !ctx.cursosGratuitos.has(e.courseId);

/** Las compras cuyo primer inicio cae en el período, sin las de empresas excluidas. */
export function comprasDelPeriodo(
  historiales: ReadonlyMap<string, readonly EntradaDeHistorial[]>,
  periodo: PeriodoDeRecompra,
  ctx: ContextoDeReportes
): Compra[] {
  const compras: Compra[] = [];
  for (const [contactId, historial] of historiales) {
    for (const entrada of historial) {
      if (excluida(entrada, ctx) || !enPeriodo(entrada.primerInicio, periodo)) continue;
      compras.push({ contactId, entrada });
    }
  }
  return compras;
}

function contarPor<T>(items: readonly T[], clave: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(clave(i), (m.get(clave(i)) ?? 0) + 1);
  return m;
}

const ordenarAsc = <T>(m: Map<string, T>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));

/** 1. Cursos más cursados: top 10 y el resto en "Otros". */
export function cursosMasCursados(
  compras: readonly Compra[],
  ctx: ContextoDeReportes,
  opts: { incluirGratuitos: boolean }
): { label: string; cursadas: number }[] {
  const nombres = new Map<string, string>();
  const elegidas = compras.filter((c) => opts.incluirGratuitos || esVenta(c.entrada, ctx));
  for (const c of elegidas) nombres.set(c.entrada.courseId, c.entrada.courseName);
  const ordenados = [...contarPor(elegidas, (c) => c.entrada.courseId).entries()]
    .map(([id, cursadas]) => ({ label: nombres.get(id) ?? id, cursadas }))
    .sort((a, b) => b.cursadas - a.cursadas || a.label.localeCompare(b.label, "es"));
  if (ordenados.length <= TOP) return ordenados;
  const resto = ordenados.slice(TOP).reduce((s, c) => s + c.cursadas, 0);
  return [...ordenados.slice(0, TOP), { label: OTROS, cursadas: resto }];
}

/** 2. Alumnos (personas distintas con una compra) por año y por trimestre. */
export function alumnosPorPeriodo(compras: readonly Compra[]): {
  porAnio: { periodo: string; alumnos: number }[];
  porTrimestre: { periodo: string; alumnos: number }[];
} {
  const agrupar = (clave: (d: Date) => string) => {
    const m = new Map<string, Set<string>>();
    for (const c of compras) {
      const k = clave(c.entrada.primerInicio);
      const s = m.get(k) ?? new Set<string>();
      s.add(c.contactId);
      m.set(k, s);
    }
    return ordenarAsc(m).map(([periodo, s]) => ({ periodo, alumnos: s.size }));
  };
  return { porAnio: agrupar(anioDe), porTrimestre: agrupar(trimestreDe) };
}

/** 3. Empresas que más capacitan: compras con empresa, top 10. */
export function empresasQueMasCapacitan(
  compras: readonly Compra[],
  ctx: ContextoDeReportes
): { companyId: string; nombre: string; cursadas: number }[] {
  const conEmpresa = compras.filter((c) => c.entrada.companyId !== null);
  return [...contarPor(conEmpresa, (c) => c.entrada.companyId!).entries()]
    .map(([companyId, cursadas]) => ({ companyId, nombre: ctx.empresas.get(companyId) ?? "Empresa", cursadas }))
    .sort((a, b) => b.cursadas - a.cursadas || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, TOP);
}

/** 6. Cursos vendidos por año (sin gratuitos). */
export function ventasPorAnio(compras: readonly Compra[], ctx: ContextoDeReportes): { anio: string; ventas: number }[] {
  return ordenarAsc(contarPor(compras.filter((c) => esVenta(c.entrada, ctx)), (c) => anioDe(c.entrada.primerInicio))).map(
    ([anio, ventas]) => ({ anio, ventas })
  );
}

/** 7. Ventas por vendedor y año (sin gratuitos); sin vendedor va aparte. */
export function ventasPorVendedor(
  compras: readonly Compra[],
  ctx: ContextoDeReportes
): { vendedor: string; porAnio: Record<string, number>; total: number }[] {
  const filas = new Map<string, Record<string, number>>();
  for (const c of compras) {
    if (!esVenta(c.entrada, ctx)) continue;
    const vendedor = c.entrada.sellerId ? (ctx.vendedores.get(c.entrada.sellerId) ?? SIN_VENDEDOR) : SIN_VENDEDOR;
    const anio = anioDe(c.entrada.primerInicio);
    const fila = filas.get(vendedor) ?? {};
    fila[anio] = (fila[anio] ?? 0) + 1;
    filas.set(vendedor, fila);
  }
  return [...filas.entries()]
    .map(([vendedor, porAnio]) => ({
      vendedor,
      porAnio,
      total: Object.values(porAnio).reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.total - a.total || a.vendedor.localeCompare(b.vendedor, "es"));
}

/** 8. Empresas vs particulares por año (sin gratuitos): "empresa" = la compra tiene empresa. */
export function empresasVsParticulares(
  compras: readonly Compra[],
  ctx: ContextoDeReportes
): { anio: string; empresa: number; particular: number }[] {
  const m = new Map<string, { empresa: number; particular: number }>();
  for (const c of compras) {
    if (!esVenta(c.entrada, ctx)) continue;
    const anio = anioDe(c.entrada.primerInicio);
    const fila = m.get(anio) ?? { empresa: 0, particular: 0 };
    if (c.entrada.companyId) fila.empresa++;
    else fila.particular++;
    m.set(anio, fila);
  }
  return ordenarAsc(m).map(([anio, f]) => ({ anio, ...f }));
}

/** 9. Evolución por curso: compras por año de cada curso (sin gratuitos) y los 5 más cursados. */
export function evolucionPorCurso(
  compras: readonly Compra[],
  ctx: ContextoDeReportes
): {
  anios: string[];
  cursos: { courseId: string; label: string; total: number; porAnio: Record<string, number> }[];
  top: string[];
} {
  const anios = new Set<string>();
  const cursos = new Map<string, { courseId: string; label: string; total: number; porAnio: Record<string, number> }>();
  for (const c of compras) {
    if (!esVenta(c.entrada, ctx)) continue;
    const anio = anioDe(c.entrada.primerInicio);
    anios.add(anio);
    const curso = cursos.get(c.entrada.courseId) ?? {
      courseId: c.entrada.courseId,
      label: c.entrada.courseName,
      total: 0,
      porAnio: {},
    };
    curso.total++;
    curso.porAnio[anio] = (curso.porAnio[anio] ?? 0) + 1;
    cursos.set(c.entrada.courseId, curso);
  }
  const lista = [...cursos.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "es"));
  return { anios: [...anios].sort(), cursos: lista, top: lista.slice(0, 5).map((c) => c.courseId) };
}

/* ============================================================
 * 4. Embudo de leads por origen
 * ============================================================ */

/** El origen visible de un contacto, de `contact.source` (DV-024). */
export function origenDeContacto(source: string | null): string {
  const s = source?.trim() ?? "";
  if (s.startsWith("formulario:Taller")) return "Taller";
  if (s.startsWith("formulario:")) return `Formulario: ${s.slice("formulario:".length).trim()}`;
  if (s === "whatsapp") return "WhatsApp";
  if (s.startsWith("importacion:")) return "Importación";
  return "Carga manual";
}

export function embudoPorOrigen(
  contactos: readonly { id: string; source: string | null; createdAt: Date }[],
  tipoDe: (contactId: string) => TipoDeContacto,
  periodo: PeriodoDeRecompra
): { origen: string; leads: number; inscriptos: number; conversion: number }[] {
  const m = new Map<string, { leads: number; inscriptos: number }>();
  for (const c of contactos) {
    if (!enPeriodo(c.createdAt, periodo)) continue;
    // Un contacto importado se crea el día de la importación, pero no es un
    // interesado de ese día: son exalumnos de otros años. No es un lead.
    if (c.source?.trim().startsWith("importacion:")) continue;
    const origen = origenDeContacto(c.source);
    const fila = m.get(origen) ?? { leads: 0, inscriptos: 0 };
    fila.leads++;
    if (tipoDe(c.id) !== "lead") fila.inscriptos++;
    m.set(origen, fila);
  }
  return [...m.entries()]
    .map(([origen, f]) => ({ origen, ...f, conversion: porcentaje(f.inscriptos, f.leads) }))
    .sort((a, b) => b.leads - a.leads || a.origen.localeCompare(b.origen, "es"));
}

/* ============================================================
 * 5. Recompra (reusa la de Marketing)
 * ============================================================ */

export function recompraResumen(
  historiales: ReadonlyMap<string, readonly EntradaDeHistorial[]>,
  periodo: PeriodoDeRecompra,
  ctx: ContextoDeReportes
): { tasa: number; personas: number; recompraron: number; pares: { fromName: string; toName: string; personas: number }[] } {
  const sinExcluidas = new Map(
    [...historiales.entries()]
      .map(([id, h]) => [id, h.filter((e) => !excluida(e, ctx))] as const)
      .filter(([, h]) => h.length > 0)
  );
  const m = metricasDeRecompra(sinExcluidas, periodo);
  return {
    tasa: m.tasa,
    personas: m.personas,
    recompraron: m.recompraron,
    pares: m.pares.slice(0, 5).map((p) => ({ fromName: p.fromName, toName: p.toName, personas: p.personas })),
  };
}

/* ============================================================
 * 10. Ingresos cobrados por curso (solo con `cobranza.ver`)
 * ============================================================ */

/** Por moneda (nunca se suman monedas distintas), el curso que más cobró primero, top 10. */
export function ingresosPorCurso(
  pagos: readonly { courseName: string; currency: string; amount: number }[]
): { currency: string; cursos: { label: string; cobrado: number }[] }[] {
  const porMoneda = new Map<string, Map<string, number>>();
  for (const p of pagos) {
    const m = porMoneda.get(p.currency) ?? new Map<string, number>();
    m.set(p.courseName, (m.get(p.courseName) ?? 0) + p.amount);
    porMoneda.set(p.currency, m);
  }
  return [...porMoneda.entries()].map(([currency, m]) => ({
    currency,
    cursos: [...m.entries()]
      .map(([label, cobrado]) => ({ label, cobrado }))
      .sort((a, b) => b.cobrado - a.cobrado || a.label.localeCompare(b.label, "es"))
      .slice(0, TOP),
  }));
}
