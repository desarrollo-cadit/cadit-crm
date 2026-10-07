/**
 * 2026-10-07 — La línea de tiempo de «Últimas interacciones» del legajo.
 *
 * PURA y en `lib/`: las fuentes (mensajes de WhatsApp, asistencia, cursos
 * offline, registro de actividad) las junta el servidor; acá solo se decide
 * el ORDEN y el CORTE. Separarlo permite probar la mezcla sin una base.
 */

export const TIMELINE_KINDS = [
  "mensaje",
  "asistencia",
  "cuestionario",
  "tema",
  "actividad",
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export type TimelineEvent = {
  /** Único dentro de la línea: lleva el prefijo de la fila de origen. */
  id: string;
  kind: TimelineKind;
  /** ISO 8601. */
  at: string;
  title: string;
  detail: string | null;
};

export const TIMELINE_LIMIT = 50;

/**
 * Mezcla, ordena de la más reciente a la más vieja y corta.
 *
 * Una fecha que no se puede leer se DESCARTA: mandarla al final la haría
 * pasar por la interacción más vieja, que es afirmar algo que no se sabe.
 * El desempate por `id` hace el orden estable sin importar en qué orden
 * llegaron las fuentes.
 */
export function mergeTimeline(
  sources: readonly (readonly TimelineEvent[])[],
  limit: number = TIMELINE_LIMIT
): TimelineEvent[] {
  return sources
    .flat()
    .map((e) => ({ e, t: Date.parse(e.at) }))
    .filter(({ t }) => Number.isFinite(t))
    .sort((a, b) => b.t - a.t || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
    .slice(0, Math.max(0, limit))
    .map(({ e }) => e);
}
