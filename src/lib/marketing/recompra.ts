import { rangoDeAlta } from "@/lib/marketing/audience";
import type { EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 (US5; FR-011, research R5) — Las métricas de recompra, PURAS, sobre los
 * mismos historiales que la ficha y las audiencias (`historialesComerciales`):
 * un grupo que nunca se dictó tampoco cuenta acá (SC-003).
 *
 * - Una compra es una entrada del historial, fechada por el primer inicio de
 *   ese curso. Por empezar también es una compra.
 * - Personas: con al menos una compra en el período.
 * - Recompraron: con una compra del período que no es su primera.
 * - Tiempo entre cursos y pares: compras consecutivas cuya segunda cae en el
 *   período, contadas por persona.
 *
 * Sin plata y sin nombres de personas: solo cifras y nombres de cursos.
 */

export const MAX_PARES = 10;

export type PeriodoDeRecompra = {
  desde: Date | null;
  hastaExclusivo: Date | null;
  etiqueta: { desde: string | null; hasta: string | null };
};

export type ParDeCursos = {
  fromCourseId: string;
  fromName: string;
  toCourseId: string;
  toName: string;
  personas: number;
};

export type MetricasDeRecompra = {
  periodo: { desde: string | null; hasta: string | null };
  personas: number;
  recompraron: number;
  /** Porcentaje con un decimal. */
  tasa: number;
  diasPromedioEntreCursos: number | null;
  paresMedidos: number;
  pares: ParDeCursos[];
};

const DIA_MS = 24 * 60 * 60 * 1000;

function esDia(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * El período pedido (`AAAA-MM-DD`, ambos opcionales) en instantes de la zona
 * de la organización, con el último día entero (`rangoDeAlta`, la misma regla
 * que el filtro de fecha de alta de las audiencias).
 */
export function periodoDeRecompra(
  desde: string | null,
  hasta: string | null,
  timeZone: string
): { ok: true; periodo: PeriodoDeRecompra } | { ok: false; message: string } {
  if ((desde && !esDia(desde)) || (hasta && !esDia(hasta))) {
    return { ok: false, message: "Las fechas tienen que ser días válidos (AAAA-MM-DD)." };
  }
  if (desde && hasta && desde > hasta) {
    return { ok: false, message: "La fecha «desde» tiene que ser anterior o igual a la fecha «hasta»." };
  }
  const { desde: d, hastaExclusivo } = rangoDeAlta(desde ?? undefined, hasta ?? undefined, timeZone);
  return { ok: true, periodo: { desde: d, hastaExclusivo, etiqueta: { desde, hasta } } };
}

export function metricasDeRecompra(
  historiales: ReadonlyMap<string, readonly EntradaDeHistorial[]>,
  periodo: PeriodoDeRecompra
): MetricasDeRecompra {
  const enPeriodo = (d: Date) =>
    (!periodo.desde || d.getTime() >= periodo.desde.getTime()) &&
    (!periodo.hastaExclusivo || d.getTime() < periodo.hastaExclusivo.getTime());

  let personas = 0;
  let recompraron = 0;
  const gaps: number[] = [];
  const pares = new Map<string, ParDeCursos>();

  for (const historial of historiales.values()) {
    const compras = [...historial].sort(
      (a, b) =>
        a.primerInicio.getTime() - b.primerInicio.getTime() || a.courseName.localeCompare(b.courseName, "es")
    );
    if (!compras.some((c) => enPeriodo(c.primerInicio))) continue;
    personas++;
    let recompro = false;
    for (let i = 1; i < compras.length; i++) {
      const antes = compras[i - 1]!;
      const despues = compras[i]!;
      if (!enPeriodo(despues.primerInicio)) continue;
      recompro = true;
      gaps.push((despues.primerInicio.getTime() - antes.primerInicio.getTime()) / DIA_MS);
      const clave = `${antes.courseId}→${despues.courseId}`;
      const par = pares.get(clave) ?? {
        fromCourseId: antes.courseId,
        fromName: antes.courseName,
        toCourseId: despues.courseId,
        toName: despues.courseName,
        personas: 0,
      };
      par.personas++;
      pares.set(clave, par);
    }
    if (recompro) recompraron++;
  }

  return {
    periodo: periodo.etiqueta,
    personas,
    recompraron,
    tasa: personas === 0 ? 0 : Math.round((recompraron / personas) * 1000) / 10,
    diasPromedioEntreCursos:
      gaps.length === 0 ? null : Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
    paresMedidos: gaps.length,
    pares: [...pares.values()]
      .sort(
        (a, b) =>
          b.personas - a.personas ||
          a.fromName.localeCompare(b.fromName, "es") ||
          a.toName.localeCompare(b.toName, "es")
      )
      .slice(0, MAX_PARES),
  };
}
