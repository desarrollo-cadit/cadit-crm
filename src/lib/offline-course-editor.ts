import { parseVimeoUrl, vimeoPageUrl } from "@/lib/vimeo";

/**
 * cursos-offline T11b — The pure half of the staff editor UI.
 *
 * Client-safe on purpose (no Zod schemas, no database types): the question
 * form imports it. The answer-set rule lives HERE and the server's
 * `validateAnswerSet` (editor-logic.ts) delegates to it, so the form can never
 * accept a set the API refuses, or say it differently.
 */

export type EditorAnswerType = "single" | "multiple";

export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 20;

/**
 * A question the grader can answer: at least two options; single choice with
 * exactly ONE correct answer (two would make the right choice ambiguous),
 * multiple choice with at least one (none = nobody can ever get it right).
 * `null` = fine; otherwise the message to show.
 */
export function answerSetProblem(
  answerType: EditorAnswerType,
  answers: ReadonlyArray<{ isCorrect: boolean }>
): string | null {
  if (answers.length < MIN_ANSWERS) return `Una pregunta necesita al menos ${MIN_ANSWERS} respuestas.`;
  const correct = answers.filter((a) => a.isCorrect).length;
  if (answerType === "single" && correct !== 1) {
    return "Una pregunta de opción única necesita exactamente una respuesta correcta.";
  }
  if (answerType === "multiple" && correct < 1) {
    return "Una pregunta de opción múltiple necesita al menos una respuesta correcta.";
  }
  return null;
}

/** A copy of `list` with the element at `from` moved to `to` (unchanged copy if out of range). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** One step up (-1) or down (+1); `null` when it cannot move (edge or unknown id). */
export function moveBy(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  return moveItem(ids, from, to);
}

export type VideoUrlState = { kind: "empty" } | { kind: "invalid" } | { kind: "valid"; pageUrl: string };

/** Same parser as the server, the importer and the player: what is valid here plays there. */
export function videoUrlState(raw: string): VideoUrlState {
  if (!raw.trim()) return { kind: "empty" };
  const ref = parseVimeoUrl(raw);
  return ref ? { kind: "valid", pageUrl: vimeoPageUrl(ref) } : { kind: "invalid" };
}

export const MAX_RETRIES = 1000;

/** The quiz's "reintentos" field: unlimited → `null`, otherwise a whole number 0..1000. */
export function parseRetries(
  unlimited: boolean,
  raw: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (unlimited) return { ok: true, value: null };
  const value = raw.trim();
  if (!/^\d+$/.test(value) || Number(value) > MAX_RETRIES) {
    return { ok: false, message: `Los reintentos deben ser un número entero entre 0 y ${MAX_RETRIES}.` };
  }
  return { ok: true, value: Number(value) };
}
