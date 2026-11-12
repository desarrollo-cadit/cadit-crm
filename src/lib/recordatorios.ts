import { z } from "zod";
import { wallClockInZone } from "@/lib/schedule-time";

/**
 * Recordatorios de seguimiento sobre un contacto — reglas puras (sin base, sin
 * red). «Llamarlo el jueves»: un motivo y un DÍA de calendario en la zona de la
 * organización.
 *
 * Un recordatorio NO es contacto: agendarlo no apaga el «nuevo» de un lead
 * (`src/lib/form-arrivals.ts`). Lo ve y lo resuelve cualquiera con
 * `inscripciones.seguimiento`; se guarda quién.
 */

export const MOTIVO_MAX = 500;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` que además es un día real del calendario (no 2026-02-30). */
export function esDiaValido(dia: string): boolean {
  if (!DIA.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

export const recordatorioBodySchema = z.object({
  reason: z.string().trim().min(1, "Escribí el motivo").max(MOTIVO_MAX),
  dueDate: z.string().refine(esDiaValido, "La fecha no es válida"),
});
export type RecordatorioBody = z.infer<typeof recordatorioBodySchema>;

/** `PATCH /api/contact-reminders/[id]`. */
export const recordatorioAccionSchema = z.object({
  action: z.enum(["hecho", "reabrir", "eliminar"]),
});
export type RecordatorioAccion = z.infer<typeof recordatorioAccionSchema>["action"];

/** Hoy (`YYYY-MM-DD`) en la zona de la organización. Zona inválida → UTC. */
export function hoyEnZona(now: Date, timeZone: string): string {
  return wallClockInZone(now, timeZone)?.fecha ?? now.toISOString().slice(0, 10);
}

/** Días de calendario de `a` a `b` (positivo si `b` es posterior). */
export function diasEntreDias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Una fecha en el pasado (antes de hoy en la zona de la organización) no se puede agendar. */
export function fechaEnElPasado(dueDate: string, now: Date, timeZone: string): boolean {
  return dueDate < hoyEnZona(now, timeZone);
}

/** «vencido» = el día ya llegó (hoy incluido) y sigue sin resolverse. */
export function estaVencido(dueDate: string, now: Date, timeZone: string): boolean {
  return dueDate <= hoyEnZona(now, timeZone);
}

export type EstadoDeRecordatorio = "vencido" | "hoy" | "proximo";

export function estadoDeRecordatorio(dueDate: string, now: Date, timeZone: string): EstadoDeRecordatorio {
  const hoy = hoyEnZona(now, timeZone);
  if (dueDate < hoy) return "vencido";
  return dueDate === hoy ? "hoy" : "proximo";
}

/** «vence hoy» / «venció hace 3 días» / «vence en 2 días». */
export function cuandoVence(dueDate: string, now: Date, timeZone: string): string {
  return cuandoVenceDesde(dueDate, hoyEnZona(now, timeZone));
}

/** Lo mismo, con «hoy» ya resuelto (`YYYY-MM-DD`): lo usa el cliente, que recibe el día del servidor. */
export function cuandoVenceDesde(dueDate: string, hoy: string): string {
  const d = diasEntreDias(hoy, dueDate);
  if (d === 0) return "vence hoy";
  if (d === -1) return "venció ayer";
  if (d < 0) return `venció hace ${-d} días`;
  if (d === 1) return "vence mañana";
  return `vence en ${d} días`;
}

/** `2026-11-12` → `12/11/2026`. */
export function fechaDeRecordatorio(dueDate: string): string {
  const [a, m, d] = dueDate.split("-");
  return `${d}/${m}/${a}`;
}

export type RecordatorioDto = {
  id: string;
  contactId: string;
  reason: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  createdAt: string;
  authorName: string | null;
  /** `null` mientras está pendiente. */
  doneAt: string | null;
  doneByName: string | null;
};

/** Pendientes primero, el más próximo (o más atrasado) arriba; después los hechos, el último resuelto arriba. */
export function ordenarRecordatorios<T extends Pick<RecordatorioDto, "dueDate" | "createdAt" | "doneAt">>(
  lista: readonly T[]
): T[] {
  return [...lista].sort((a, b) => {
    const ah = a.doneAt !== null;
    const bh = b.doneAt !== null;
    if (ah !== bh) return ah ? 1 : -1;
    if (ah && bh) return Date.parse(b.doneAt!) - Date.parse(a.doneAt!);
    return a.dueDate.localeCompare(b.dueDate) || Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
}
