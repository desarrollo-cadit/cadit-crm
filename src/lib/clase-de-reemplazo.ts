import { diaCalendario, diaComoFecha, esDiaValido } from "@/lib/access-expiry";
import { ENTREGA_FINAL_ANTES_DEL_FIN, entregaFinalValida } from "@/lib/entrega-final";

/**
 * 2026-10-30 — La clase de REEMPLAZO de una suspendida, y qué les pasa a las
 * fechas del grupo: las reglas, puras.
 *
 * La clase nueva la crea `reprogramarClase` (src/server/class-changes.ts), el
 * ÚNICO camino. Si cae después del fin del grupo, el fin pasa a ser ese día
 * —en la misma transacción que la clase— y, si el grupo tiene entrega final,
 * quien reprograma elige qué hacer con ella:
 *
 * - `mantener`: sólo si sigue siendo ESTRICTAMENTE posterior al fin nuevo
 *   (`entregaFinalValida`);
 * - `correr`: se mueve los mismos días que el fin;
 * - `fecha`: otra, también posterior al fin nuevo.
 *
 * Todo es día de calendario `"YYYY-MM-DD"`, como `cohort.end_date` (medianoche
 * UTC). El servidor recalcula con lo que dice la base: nunca usa un fin que
 * mande el cliente. El vencimiento del acceso se deriva al leer de estas dos
 * fechas (`src/lib/access-expiry.ts`), así que no hay nada más que escribir.
 */

export type OpcionDeEntrega =
  | { tipo: "mantener" }
  | { tipo: "correr" }
  | { tipo: "fecha"; fecha: string };

const DIA_MS = 86_400_000;

export function sumarDias(ymd: string, n: number): string {
  return diaCalendario(new Date(diaComoFecha(ymd).getTime() + n * DIA_MS));
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((diaComoFecha(hasta).getTime() - diaComoFecha(desde).getTime()) / DIA_MS);
}

/** "25/11": así lo dice la pantalla. */
export function diaCorto(ymd: string): string {
  const [, mes, dia] = ymd.split("-");
  return `${dia}/${mes}`;
}

type Fechas = {
  /** `cohort.end_date` como día; `null` = el grupo no tiene fin (no hay nada que extender). */
  endDate: string | null;
  deliveryDeadline: string | null;
  /** El día de la clase de reemplazo. */
  reemplazo: string;
};

export type EfectoDelReemplazo = {
  extiendeFin: boolean;
  finNuevo: string | null;
  diasCorridos: number;
  /** "La clase de reemplazo queda después del fin del grupo (20/11). La fecha de fin pasa a ser 25/11." */
  aviso: string | null;
  /** El fin se mueve y el grupo tiene entrega final: hay que elegir qué hacer con ella. */
  pideEntrega: boolean;
  /** La entrega final corrida los mismos días que el fin. */
  entregaCorrida: string | null;
  /** La entrega actual sigue siendo posterior al fin nuevo. */
  mantenerPermitido: boolean;
};

/** Lo que la pantalla muestra ANTES de confirmar. */
export function efectoDelReemplazo(f: Fechas): EfectoDelReemplazo {
  if (!f.endDate || f.reemplazo <= f.endDate) {
    return {
      extiendeFin: false,
      finNuevo: null,
      diasCorridos: 0,
      aviso: null,
      pideEntrega: false,
      entregaCorrida: null,
      mantenerPermitido: true,
    };
  }
  const diasCorridos = diasEntre(f.endDate, f.reemplazo);
  return {
    extiendeFin: true,
    finNuevo: f.reemplazo,
    diasCorridos,
    aviso: `La clase de reemplazo queda después del fin del grupo (${diaCorto(f.endDate)}). La fecha de fin pasa a ser ${diaCorto(f.reemplazo)}.`,
    pideEntrega: f.deliveryDeadline !== null,
    entregaCorrida: f.deliveryDeadline ? sumarDias(f.deliveryDeadline, diasCorridos) : null,
    mantenerPermitido: f.deliveryDeadline === null || f.deliveryDeadline > f.reemplazo,
  };
}

export type ErrorDeReemplazo = { ok: false; status: 403 | 409 | 422; code: string; message: string };

/** Qué escribir en el grupo. `null` = esa fecha no cambia. */
export type PlanDeReemplazo =
  | { ok: true; endDate: string | null; deliveryDeadline: string | null }
  | ErrorDeReemplazo;

export function planDeReemplazo(
  input: Fechas & {
    /** Quien reprograma vio el aviso y lo confirmó. */
    confirmaExtension: boolean;
    /** `academico.editar`: mover el fin y la entrega es editar el grupo. */
    puedeMoverFechas: boolean;
    opcion: OpcionDeEntrega | null;
  }
): PlanDeReemplazo {
  const efecto = efectoDelReemplazo(input);
  if (!efecto.extiendeFin || !efecto.finNuevo) return { ok: true, endDate: null, deliveryDeadline: null };
  const fin = efecto.finNuevo;

  if (!input.puedeMoverFechas) {
    return {
      ok: false,
      status: 403,
      code: "fin_del_grupo_sin_permiso",
      message: `${efecto.aviso} Mover la fecha de fin lo puede hacer quien tiene «Crear y editar cursos y grupos».`,
    };
  }
  if (!input.confirmaExtension) {
    return { ok: false, status: 409, code: "reemplazo_despues_del_fin", message: efecto.aviso ?? "" };
  }
  if (!input.deliveryDeadline) return { ok: true, endDate: fin, deliveryDeadline: null };

  const opcion = input.opcion;
  if (!opcion) {
    return {
      ok: false,
      status: 422,
      code: "opcion_de_entrega_requerida",
      message: "El grupo tiene entrega final: elegí qué hacer con ella.",
    };
  }
  if (opcion.tipo === "mantener") {
    if (!efecto.mantenerPermitido) {
      return {
        ...ENTREGA_FINAL_ANTES_DEL_FIN,
        ok: false,
        message: `La entrega final (${diaCorto(input.deliveryDeadline)}) no queda después del fin nuevo (${diaCorto(fin)}): correla los mismos días o elegí otra fecha.`,
      };
    }
    return { ok: true, endDate: fin, deliveryDeadline: null };
  }
  if (opcion.tipo === "correr") {
    return { ok: true, endDate: fin, deliveryDeadline: efecto.entregaCorrida };
  }
  if (!esDiaValido(opcion.fecha)) {
    return { ok: false, status: 422, code: "invalid_body", message: "La fecha de entrega final no es válida." };
  }
  if (!entregaFinalValida(diaComoFecha(fin), diaComoFecha(opcion.fecha))) {
    return { ...ENTREGA_FINAL_ANTES_DEL_FIN, ok: false };
  }
  return { ok: true, endDate: fin, deliveryDeadline: opcion.fecha };
}
