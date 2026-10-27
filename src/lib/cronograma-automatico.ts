import { computeCohortStatus } from "@/lib/cohort-status";

/**
 * 2026-10-27 — Cuándo se genera SOLO el cronograma de un grupo.
 *
 * Decisión del dueño: los grupos nuevos dejan de depender del botón
 * «Generar cronograma». Se genera solo cuando se cumplen las dos cosas:
 *
 *  1. El grupo está CONFIRMADO ("sale"). Nunca antes.
 *  2. Tiene todo lo que hace falta: inicio, fin, días y horario.
 *
 * Dos disparos: al confirmar, y al editar un grupo YA confirmado cuyos datos
 * pasan de incompletos a completos. Un grupo que ya estaba completo antes de
 * editarlo no genera: si no tiene clases es porque nunca las generó (un
 * grupo anterior a esta regla) o porque alguien las borró a propósito.
 *
 * Un grupo finalizado nunca genera: los grupos viejos no se tocan.
 *
 * Esto decide SOLO lo que `generateSchedule` no sabe (confirmación,
 * finalizado, horario y el disparo de la edición). Lo demás —fecha de fin,
 * días, especialización, cronograma existente, recesos, rango vacío— lo sigue
 * decidiendo `generateSchedule` y su mensaje es el que se muestra.
 */

export type GrupoParaCronograma = {
  startDate: Date;
  endDate: Date | null;
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  confirmedAt: Date | null;
};

export type DisparoDeCronograma =
  | { disparo: "confirmacion"; despues: GrupoParaCronograma }
  | { disparo: "edicion"; antes: GrupoParaCronograma; despues: GrupoParaCronograma };

export type DecisionDeCronograma =
  | { generar: true }
  | { generar: false; motivo: "sin_confirmar" | "finalizado" | "sin_cambios" | "sin_horario" };

/** El aviso cuando falta el horario: `generateSchedule` genera clases sin hora, así que no lo dice. */
export const SIN_HORARIO =
  "El grupo todavía no tiene horario. Cuando lo cargues, se van a generar las clases.";

function tieneHorario(g: GrupoParaCronograma): boolean {
  return Boolean(g.startTime && g.endTime);
}

/** Inicio (siempre está), fin, días y horario. */
export function cronogramaCompleto(g: GrupoParaCronograma): boolean {
  return Boolean(g.endDate && g.daysOfWeek && tieneHorario(g));
}

export function debeGenerarCronograma(
  d: DisparoDeCronograma,
  now: Date,
  timeZone: string
): DecisionDeCronograma {
  const g = d.despues;
  if (!g.confirmedAt) return { generar: false, motivo: "sin_confirmar" };
  if (computeCohortStatus(g.startDate, g.endDate, now, timeZone) === "finalizada") {
    return { generar: false, motivo: "finalizado" };
  }
  if (d.disparo === "edicion" && cronogramaCompleto(d.antes)) {
    return { generar: false, motivo: "sin_cambios" };
  }
  if (!tieneHorario(g)) return { generar: false, motivo: "sin_horario" };
  return { generar: true };
}

/**
 * 2026-10-27 (decisión del dueño) — Para el cronograma automático, un módulo
 * cuenta como confirmado si lo está su especialización: lo que se confirma es
 * el programa. SOLO para esto: no se escribe `confirmed_at` en el módulo (eso
 * dispararía avisos de facturación por módulo; ver el reporte del cambio).
 */
export function confirmacionEfectiva(propia: Date | null, deLaMadre: Date | null): Date | null {
  return propia ?? deLaMadre;
}

/** Lo que viaja en la respuesta para que la pantalla lo diga. */
export type CronogramaAutomatico =
  | {
      estado: "generado";
      clases: number;
      mensaje: string;
      /** Especialización: algún módulo no generó por falta de datos (la pantalla avisa en amarillo). */
      conFaltantes?: boolean;
    }
  | { estado: "faltan_datos"; mensaje: string };

/**
 * Confirmar una especialización genera el cronograma de cada módulo; esto
 * resume lo que pasó en uno solo. `null` = ningún módulo tenía nada que decir
 * (todos con clases, o sin módulos).
 */
export function resumenDeModulos(
  modulos: { nombre: string; resultado: CronogramaAutomatico | null }[]
): CronogramaAutomatico | null {
  const generados = modulos.flatMap((m) => (m.resultado?.estado === "generado" ? [m.resultado.clases] : []));
  const faltan = modulos.flatMap((m) =>
    m.resultado?.estado === "faltan_datos" ? [`«${m.nombre}»: ${m.resultado.mensaje}`] : []
  );
  if (generados.length === 0 && faltan.length === 0) return null;
  if (generados.length === 0) {
    return { estado: "faltan_datos", mensaje: `Ningún módulo generó clases. ${faltan.join(" ")}` };
  }
  const clases = generados.reduce((a, b) => a + b, 0);
  const n = generados.length;
  const base = `${clases === 1 ? "Se generó 1 clase" : `Se generaron ${clases} clases`} en ${n} ${n === 1 ? "módulo" : "módulos"}.`;
  return {
    estado: "generado",
    clases,
    conFaltantes: faltan.length > 0,
    mensaje: faltan.length > 0 ? `${base} Sin clases todavía: ${faltan.join(" ")}` : base,
  };
}

/** Los motivos de `generateSchedule` que son "te falta algo" (y no "ya está" o "no corresponde"). */
const FALTAN_DATOS = new Set(["no_end_date", "no_days", "empty_schedule", "sin_horario"]);

/**
 * El resultado de `generateSchedule` (o `sin_horario`) para la pantalla.
 * `null` = no hay nada que decir: ya tenía clases, es una especialización
 * (cada módulo genera el suyo) o el grupo no existe.
 */
export function resultadoDeCronogramaAutomatico(
  r: { ok: true; clases: number } | { ok: false; code: string; message: string }
): CronogramaAutomatico | null {
  if (r.ok) {
    return {
      estado: "generado",
      clases: r.clases,
      mensaje: r.clases === 1 ? "Se generó 1 clase." : `Se generaron ${r.clases} clases.`,
    };
  }
  if (FALTAN_DATOS.has(r.code)) return { estado: "faltan_datos", mensaje: r.message };
  return null;
}
