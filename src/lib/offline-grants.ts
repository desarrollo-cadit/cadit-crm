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
