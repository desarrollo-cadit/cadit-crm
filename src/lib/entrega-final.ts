import { diaCalendario } from "@/lib/access-expiry";
import { classEndsAt, classInstant, wallClockInZone } from "@/lib/schedule-time";

/**
 * 0083 — La ENTREGA FINAL del grupo y los pedidos de prórroga: las reglas,
 * puras.
 *
 * `cohort.delivery_deadline` es un DÍA de calendario (medianoche UTC, como
 * `end_date`). Se vuelve instante en UN solo lugar —`instanteDeEntregaFinal`,
 * con `classInstant` a las 23:59 de la zona de la academia, igual que un
 * plazo cargado a mano— y de ahí:
 *
 * - las evaluaciones SIN plazo propio la heredan (`plazoDeEvaluacion`);
 * - un plazo propio no puede pasarla (`plazoSuperaEntregaFinal`): lo que va
 *   más allá es por persona, con una prórroga;
 * - el alumno ve "En período de entrega" entre el fin de las clases y su
 *   entrega efectiva (`periodoDeEntrega`);
 * - el acceso a los contenidos vence un mes después (`src/lib/access-expiry.ts`).
 */

export const HORA_DE_ENTREGA_FINAL = "23:59";

export const ENTREGA_FINAL_ANTES_DEL_FIN = {
  status: 422,
  code: "entrega_final_antes_del_fin",
  message: "La entrega final tiene que ser posterior a la fecha de fin del grupo.",
} as const;

export const PLAZO_SUPERA_ENTREGA_FINAL = {
  status: 422,
  code: "plazo_supera_entrega_final",
  message:
    "El plazo no puede pasar la entrega final del grupo. Para darle más tiempo a una persona, otorgale una prórroga.",
} as const;

/**
 * La entrega final tiene que ser ESTRICTAMENTE posterior al fin. Se compara
 * el día de calendario, no el instante: los dos son "días".
 */
export function entregaFinalValida(endDate: Date | null, deadline: Date | null): boolean {
  if (!endDate || !deadline) return true;
  return diaCalendario(deadline) > diaCalendario(endDate);
}

/** El instante de la entrega final: las 23:59 del día, en la zona de la academia. */
export function instanteDeEntregaFinal(deadline: Date | null, timeZone: string): Date | null {
  if (!deadline) return null;
  return classInstant(deadline, HORA_DE_ENTREGA_FINAL, timeZone);
}

/** El plazo del GRUPO para una evaluación: el suyo, o el de la entrega final. */
export function plazoDeEvaluacion(dueAt: Date | null, entregaFinal: Date | null): Date | null {
  return dueAt ?? entregaFinal;
}

/** Un plazo propio posterior a la entrega final del grupo. */
export function plazoSuperaEntregaFinal(dueAt: Date | null, entregaFinal: Date | null): boolean {
  if (!dueAt || !entregaFinal) return false;
  return dueAt.getTime() > entregaFinal.getTime();
}

/** El más tardío de los instantes; `null` si no hay ninguno. */
function masTardio(instantes: Array<Date | null>): Date | null {
  let max: Date | null = null;
  for (const d of instantes) if (d && (!max || d.getTime() > max.getTime())) max = d;
  return max;
}

export type PeriodoDeEntrega = { hasta: string };

/**
 * "En período de entrega": las clases terminaron (pasó el día de fin; sin
 * fin, terminó la última clase no cancelada) y todavía no pasó la entrega
 * efectiva de ESTA persona — la más tardía entre la entrega final del grupo
 * y sus prórrogas aprobadas.
 *
 * Sin fecha de fin ni clases no se sabe si terminó, y sin entrega final del
 * grupo no hay período de entrega (una prórroga suelta es de UNA evaluación,
 * no del cierre del curso): en los dos casos, `null`.
 */
export function periodoDeEntrega(
  input: {
    endDate: Date | null;
    ultimaClase: { date: Date; endTime: string | null } | null;
    entregaFinal: Date | null;
    prorrogas: readonly Date[];
  },
  timeZone: string,
  now: Date
): PeriodoDeEntrega | null {
  const finDeClases = input.endDate
    ? classEndsAt(input.endDate, null, timeZone)
    : input.ultimaClase
      ? classEndsAt(input.ultimaClase.date, input.ultimaClase.endTime, timeZone)
      : null;
  if (!input.entregaFinal) return null;
  if (!finDeClases || finDeClases.getTime() > now.getTime()) return null;

  const hasta = masTardio([input.entregaFinal, ...input.prorrogas]);
  if (!hasta || now.getTime() > hasta.getTime()) return null;
  return { hasta: hasta.toISOString() };
}

/** "En período de entrega · hasta el 15/12", con el día de la academia. */
export function textoDePeriodoDeEntrega(hastaIso: string, timeZone: string): string {
  const fecha = wallClockInZone(new Date(hastaIso), timeZone)?.fecha ?? hastaIso.slice(0, 10);
  const [, mes, dia] = fecha.split("-");
  return `En período de entrega · hasta el ${dia}/${mes}`;
}

export type ErrorDePedido = { status: 422; code: string; message: string };

/**
 * El pedido de prórroga del alumno: con motivo, y para una fecha POSTERIOR
 * a su plazo vigente (sin plazo, posterior a ahora). Pedir una fecha que ya
 * tiene no es pedir una prórroga.
 */
export function validarPedidoDeProrroga(
  input: { solicitada: Date | null; vigente: Date | null; motivo: string },
  now: Date
): ErrorDePedido | null {
  if (!input.motivo.trim()) {
    return { status: 422, code: "motivo_requerido", message: "Contanos por qué necesitás más tiempo." };
  }
  if (!input.solicitada) {
    return { status: 422, code: "invalid_due_at", message: "La fecha pedida no es válida." };
  }
  const piso = input.vigente ?? now;
  if (input.solicitada.getTime() <= piso.getTime()) {
    return {
      status: 422,
      code: "fecha_no_posterior",
      message: input.vigente
        ? "La fecha pedida tiene que ser posterior a tu plazo actual."
        : "La fecha pedida tiene que ser posterior a hoy.",
    };
  }
  return null;
}
