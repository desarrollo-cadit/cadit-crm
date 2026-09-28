import { z } from "zod";
import { parseVimeoUrl } from "@/lib/vimeo";
import { slugify } from "@/lib/utils";
import {
  OFFLINE_ANSWER_TYPES,
  OFFLINE_COURSE_STATUSES,
  OFFLINE_VIDEO_SHOWN,
  type OfflineAnswerType,
} from "@/lib/db/schema";

/**
 * cursos-offline T11 — The pure half of editing the library from the staff UI.
 *
 * `editor.ts` does the reads and writes; every decision it takes BEFORE
 * writing lives here and is tested branch by branch
 * (`tests/unit/cursos-offline-editor.test.ts`): is this a valid new order, is
 * this answer set gradable, may this be deleted, is this a Vimeo video.
 */

export type EditorError = { ok: false; status: 404 | 409 | 422; code: string; message: string };
export type EditorResult<T> = { ok: true; data: T } | EditorError;

const fail = (status: EditorError["status"], code: string, message: string): EditorError => ({
  ok: false,
  status,
  code,
  message,
});

/* ============================================================
 * Ordering
 * ============================================================ */

/**
 * A reorder sends the FULL list of the parent's children in their new order.
 * It must be exactly those ids — no missing one (it would keep a stale
 * position), no stranger (it could belong to another course), no duplicate.
 */
export function validateReorder(currentIds: string[], requestedIds: string[]): EditorError | null {
  const requested = new Set(requestedIds);
  const current = new Set(currentIds);
  const same =
    requested.size === requestedIds.length &&
    requested.size === current.size &&
    requestedIds.every((id) => current.has(id));
  return same
    ? null
    : fail(422, "invalid_order", "El orden debe incluir exactamente los elementos actuales, sin repetir.");
}

/* ============================================================
 * Slug
 * ============================================================ */

/** `slugify(title)`, suffixed `-2`, `-3`… until it is not among `taken`. */
export function uniqueSlug(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(title);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/* ============================================================
 * Answers
 * ============================================================ */

export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 20;

/**
 * A question the grader can answer: at least two options; single choice with
 * exactly ONE correct answer (two would make the right choice ambiguous),
 * multiple choice with at least one (none = nobody can ever get it right).
 */
export function validateAnswerSet(
  answerType: OfflineAnswerType,
  answers: Array<{ isCorrect: boolean }>
): EditorError | null {
  if (answers.length < MIN_ANSWERS) {
    return fail(422, "invalid_answers", `Una pregunta necesita al menos ${MIN_ANSWERS} respuestas.`);
  }
  const correct = answers.filter((a) => a.isCorrect).length;
  if (answerType === "single" && correct !== 1) {
    return fail(422, "invalid_answers", "Una pregunta de opción única necesita exactamente una respuesta correcta.");
  }
  if (answerType === "multiple" && correct < 1) {
    return fail(422, "invalid_answers", "Una pregunta de opción múltiple necesita al menos una respuesta correcta.");
  }
  return null;
}

export type AnswerInput = { id?: string; text: string; isCorrect: boolean };

export type AnswerSetPlan = {
  update: Array<{ id: string; text: string; isCorrect: boolean; position: number }>;
  insert: Array<{ text: string; isCorrect: boolean; position: number }>;
  remove: string[];
};

/**
 * The answers are REPLACED as a set: an entry with an id updates that answer,
 * one without an id is new, and an existing answer that did not come back is
 * removed. Position = index in the list. An id that is not one of this
 * question's answers is refused (it could be another question's).
 * Attempts are unaffected: they keep a text snapshot (`answers_given`).
 */
export function planAnswerSet(existingIds: string[], answers: AnswerInput[]): EditorResult<AnswerSetPlan> {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const plan: AnswerSetPlan = { update: [], insert: [], remove: [] };
  for (const [position, answer] of answers.entries()) {
    const { text, isCorrect } = answer;
    if (answer.id === undefined) {
      plan.insert.push({ text, isCorrect, position });
      continue;
    }
    if (!existing.has(answer.id) || seen.has(answer.id)) {
      return fail(422, "invalid_answers", "Una respuesta no pertenece a esta pregunta o está repetida.");
    }
    seen.add(answer.id);
    plan.update.push({ id: answer.id, text, isCorrect, position });
  }
  plan.remove = existingIds.filter((id) => !seen.has(id));
  return { ok: true, data: plan };
}

/* ============================================================
 * Deletion
 * ============================================================ */

export type HistoryCounts = { attempts: number; progress: number };
export type DeletableKind = "course" | "lesson" | "topic" | "quiz";

const HISTORY_MESSAGE: Record<DeletableKind, string> = {
  course:
    "El curso tiene historial de alumnos (intentos o progreso) y no se puede eliminar. Pasalo a borrador para ocultarlo.",
  lesson:
    "La lección tiene temas con progreso de alumnos y no se puede eliminar. Pasá el curso a borrador si querés ocultarlo.",
  topic:
    "El tema tiene progreso de alumnos y no se puede eliminar. Pasá el curso a borrador si querés ocultarlo.",
  quiz: "El cuestionario tiene intentos de alumnos y no se puede eliminar. Pasá el curso a borrador si querés ocultarlo.",
};

/**
 * Deleting content with student history would cascade that history away
 * (attempts and progress rows reference the content). So: a course is blocked
 * by any attempt or progress below it, a lesson/topic by progress, a quiz by
 * attempts. Questions are not guarded: attempts keep their own snapshot.
 */
export function deleteGuard(kind: DeletableKind, history: HistoryCounts): EditorError | null {
  const blocked =
    kind === "course"
      ? history.attempts > 0 || history.progress > 0
      : kind === "quiz"
        ? history.attempts > 0
        : history.progress > 0;
  return blocked ? fail(409, "has_history", HISTORY_MESSAGE[kind]) : null;
}

/* ============================================================
 * Video
 * ============================================================ */

/**
 * Empty → no video. Otherwise it must be a URL `parseVimeoUrl` accepts — the
 * same rule the player and the importer use, so a saved URL is always one a
 * student can watch (a URL the player cannot parse would lock the topic).
 */
export function normalizeVideoUrl(raw: string | null | undefined): EditorResult<string | null> {
  const value = raw?.trim() ?? "";
  if (!value) return { ok: true, data: null };
  if (!parseVimeoUrl(value)) {
    return fail(
      422,
      "invalid_video_url",
      "La URL de video no es un video de Vimeo válido. Pegá el enlace del video, por ejemplo https://vimeo.com/123456789."
    );
  }
  return { ok: true, data: value };
}

/* ============================================================
 * Bodies (Zod, with limits)
 * ============================================================
 * No `.default()` here: `parseBody` types its result by the schema INPUT, so
 * an omitted field stays `undefined` and `editor.ts` applies the default
 * (draft, 80%, unlimited retries, 1 point, "after", empty markdown). */

const id = z.string().min(1).max(64);
const title = z.string().trim().min(1, "El título es obligatorio").max(200);
const markdown = z.string().max(50_000);

const atLeastOneField = (value: object) => Object.keys(value).length > 0;
const EMPTY_PATCH = { message: "No hay nada para cambiar" };

export const courseBodySchema = z
  .object({
    title,
    descriptionMd: markdown.optional(),
    status: z.enum(OFFLINE_COURSE_STATUSES).optional(),
  })
  .strict();

export const coursePatchSchema = z
  .object({
    title: title.optional(),
    descriptionMd: markdown.optional(),
    status: z.enum(OFFLINE_COURSE_STATUSES).optional(),
  })
  .strict()
  .refine(atLeastOneField, EMPTY_PATCH);

export const lessonBodySchema = z.object({ title, contentMd: markdown.optional() }).strict();

export const lessonPatchSchema = z
  .object({ title: title.optional(), contentMd: markdown.optional() })
  .strict()
  .refine(atLeastOneField, EMPTY_PATCH);

const videoUrl = z.string().max(500).nullable();

export const topicBodySchema = z
  .object({
    title,
    contentMd: markdown.optional(),
    videoUrl: videoUrl.optional(),
    videoShown: z.enum(OFFLINE_VIDEO_SHOWN).optional(),
  })
  .strict();

export const topicPatchSchema = z
  .object({
    title: title.optional(),
    contentMd: markdown.optional(),
    videoUrl: videoUrl.optional(),
    videoShown: z.enum(OFFLINE_VIDEO_SHOWN).optional(),
    /** Move the topic to another lesson of the same course (appended at its end). */
    lessonId: id.optional(),
  })
  .strict()
  .refine(atLeastOneField, EMPTY_PATCH);

const passingPercentage = z.number().int().min(0).max(100);
const retriesAllowed = z.number().int().min(0).max(1000).nullable();

export const quizBodySchema = z
  .object({
    title,
    descriptionMd: markdown.optional(),
    passingPercentage: passingPercentage.optional(),
    retriesAllowed: retriesAllowed.optional(),
    lessonId: id.nullable().optional(),
  })
  .strict();

export const quizPatchSchema = z
  .object({
    title: title.optional(),
    descriptionMd: markdown.optional(),
    passingPercentage: passingPercentage.optional(),
    retriesAllowed: retriesAllowed.optional(),
    lessonId: id.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, EMPTY_PATCH);

const answers = z
  .array(
    z
      .object({
        id: id.optional(),
        text: z.string().trim().min(1, "Una respuesta no puede estar vacía").max(2000),
        isCorrect: z.boolean(),
      })
      .strict()
  )
  .max(MAX_ANSWERS);

const questionFields = {
  questionMd: z.string().trim().min(1, "La pregunta es obligatoria").max(10_000),
  answerType: z.enum(OFFLINE_ANSWER_TYPES),
  points: z.number().int().min(0).max(1000),
  answers,
};

export const questionBodySchema = z
  .object({ ...questionFields, points: questionFields.points.optional() })
  .strict();

export const questionPatchSchema = z
  .object({
    questionMd: questionFields.questionMd.optional(),
    answerType: questionFields.answerType.optional(),
    points: questionFields.points.optional(),
    answers: answers.optional(),
  })
  .strict()
  .refine(atLeastOneField, EMPTY_PATCH);

export const orderBodySchema = z.object({ ids: z.array(id).max(2000) }).strict();

export type CourseBody = z.infer<typeof courseBodySchema>;
export type CoursePatch = z.infer<typeof coursePatchSchema>;
export type LessonBody = z.infer<typeof lessonBodySchema>;
export type LessonPatch = z.infer<typeof lessonPatchSchema>;
export type TopicBody = z.infer<typeof topicBodySchema>;
export type TopicPatch = z.infer<typeof topicPatchSchema>;
export type QuizBody = z.infer<typeof quizBodySchema>;
export type QuizPatch = z.infer<typeof quizPatchSchema>;
export type QuestionBody = z.infer<typeof questionBodySchema>;
export type QuestionPatch = z.infer<typeof questionPatchSchema>;
