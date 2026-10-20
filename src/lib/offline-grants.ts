import { z } from "zod";
import { esDiaValido } from "@/lib/access-expiry";

/**
 * 043 — Acceso directo a un curso offline: las decisiones, puras.
 *
 * Un acceso directo es de una PERSONA (contacto), no de una inscripción: así
 * se le da un curso a alguien que nunca cursó una cohorte. Lleva fecha
 * límite obligatoria y vence solo, al leer (`src/lib/access-expiry.ts`).
 */

/** Un día `YYYY-MM-DD` real, tal como lo manda un `<input type="date">`. */
export const diaDeAccesoSchema = z
  .string()
  .refine(esDiaValido, { message: "La fecha tiene que ser un día válido (AAAA-MM-DD)." });

export const NOTA_MAX = 500;

export type PlanIndividual = { kind: "insert" } | { kind: "update"; id: string } | { kind: "none" };

/**
 * Asignar a UNA persona fija la fecha que se pide, más tarde o más temprano:
 * quien la carga a mano está decidiendo esa fecha. La misma fecha no escribe.
 */
export function planAsignacionIndividual(
  activo: { id: string; hasta: string } | null,
  hasta: string
): PlanIndividual {
  if (!activo) return { kind: "insert" };
  if (activo.hasta === hasta) return { kind: "none" };
  return { kind: "update", id: activo.id };
}

export type PlanEmpresa = {
  /** Sin acceso directo activo: se crea uno. `antesQuitado` = tuvo uno y se le quitó. */
  crear: Array<{ contactId: string; name: string; antesQuitado: boolean }>;
  /** Con acceso activo que vence ANTES de la fecha nueva: se extiende. */
  extender: Array<{ grantId: string; contactId: string; name: string; desde: string }>;
  /** Con acceso activo hasta la fecha nueva o después: no se toca. */
  sinCambios: Array<{ grantId: string; contactId: string; name: string; hasta: string }>;
};

/**
 * "Asignar a toda la empresa" = un acceso INDIVIDUAL por cada persona que la
 * empresa tiene HOY. Quien entre después no lo recibe.
 *
 * Idempotente: repetirlo no duplica (el índice único de la base tampoco lo
 * permitiría) y nunca acorta: a quien ya tiene acceso solo se le extiende si
 * la fecha nueva es posterior. Acortar es una decisión sobre una persona, y
 * se toma de a una.
 */
export function planAsignacionPorEmpresa(
  personas: Array<{ id: string; name: string }>,
  activos: Array<{ id: string; contactId: string; hasta: string }>,
  hasta: string,
  revocadosAntes: string[]
): PlanEmpresa {
  const plan: PlanEmpresa = { crear: [], extender: [], sinCambios: [] };
  const quitados = new Set(revocadosAntes);
  for (const p of personas) {
    const activo = activos.find((a) => a.contactId === p.id);
    if (!activo) {
      plan.crear.push({ contactId: p.id, name: p.name, antesQuitado: quitados.has(p.id) });
    } else if (activo.hasta < hasta) {
      plan.extender.push({ grantId: activo.id, contactId: p.id, name: p.name, desde: activo.hasta });
    } else {
      plan.sinCambios.push({ grantId: activo.id, contactId: p.id, name: p.name, hasta: activo.hasta });
    }
  }
  return plan;
}

/* ============================================================
 * 045 — Desde la empresa (`/empresas`)
 * ============================================================ */

export type CursoDeEmpresa = {
  courseId: string;
  courseTitle: string;
  /** Personas distintas con acceso directo VIGENTE a este curso. */
  personas: number;
  /** El vencimiento más próximo y el más lejano entre esas personas. */
  primeraHasta: string;
  ultimaHasta: string;
};

/**
 * Qué cursos offline tiene HOY la gente de una empresa por acceso directo:
 * cuántas personas y entre qué fechas vencen. Lo vencido no cuenta (es lo
 * que tuvieron, no lo que tienen).
 */
export function resumenDeCursosDeEmpresa(
  accesos: Array<{ contactId: string; courseId: string; courseTitle: string; hasta: string; vencido: boolean }>
): CursoDeEmpresa[] {
  const porCurso = new Map<string, { courseTitle: string; personas: Set<string>; fechas: string[] }>();
  for (const a of accesos) {
    if (a.vencido) continue;
    const curso = porCurso.get(a.courseId) ?? { courseTitle: a.courseTitle, personas: new Set(), fechas: [] };
    curso.personas.add(a.contactId);
    curso.fechas.push(a.hasta);
    porCurso.set(a.courseId, curso);
  }
  return [...porCurso.entries()]
    .map(([courseId, c]) => {
      const fechas = [...c.fechas].sort();
      return {
        courseId,
        courseTitle: c.courseTitle,
        personas: c.personas.size,
        primeraHasta: fechas[0]!,
        ultimaHasta: fechas[fechas.length - 1]!,
      };
    })
    .sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, "es"));
}

/**
 * "Extender" desde la empresa solo corre la fecha hacia adelante: acortar es
 * una decisión sobre una persona que se toma en el curso o en el legajo, a
 * propósito, no con el botón de extender.
 */
export function esExtension(desde: string, hasta: string): boolean {
  return esDiaValido(hasta) && hasta > desde;
}
