import type { OfflineAnswersGiven, OfflineAnswerType } from "@/lib/db/schema";
import type { GivenAnswers } from "./logic";

/**
 * cursos-offline (T5) — Pure decisions behind the student portal.
 *
 * No database here, same as `logic.ts`: the queries in `student.ts` and
 * `submit.ts` feed these plain data, and each one is tested on its own
 * (`tests/unit/cursos-offline-portal-logic.test.ts`).
 */

/* ============================================================
 * Which enrollment an attempt is recorded against
 * ============================================================ */

export interface EnrollmentCourses {
  id: string;
  createdAt: Date;
  /** The courses this enrollment effectively grants. */
  courseIds: string[];
}

/**
 * Attempts are counted per CONTACT, but the row still hangs from one
 * enrollment. Among the enrollments that grant the course, the earliest
 * created wins; a tie on the date falls back to the id so the answer does not
 * depend on the order the database returned the rows in.
 */
export function pickAttemptEnrollment(
  enrollments: EnrollmentCourses[],
  courseId: string
): string | null {
  const candidates = enrollments
    .filter((e) => e.courseIds.includes(courseId))
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  return candidates[0]?.id ?? null;
}

/* ============================================================
 * The answers snapshot stored with an attempt
 * ============================================================ */

export interface SnapshotQuestion {
  id: string;
  questionMd: string;
  answers: Array<{ id: string; text: string }>;
}

/**
 * Every question of the quiz, in quiz order, with the answers the student
 * chose in ANSWER order and their texts. Ids that are not answers of that
 * question are dropped: they have no text to keep, and grading already
 * counted them as wrong.
 */
export function buildAnswersGiven(
  questions: SnapshotQuestion[],
  given: GivenAnswers
): OfflineAnswersGiven {
  return questions.map((question) => {
    const chosen = new Set(given[question.id] ?? []);
    const picked = question.answers.filter((a) => chosen.has(a.id));
    return {
      questionId: question.id,
      questionText: question.questionMd,
      answerIds: picked.map((a) => a.id),
      answerTexts: picked.map((a) => a.text),
    };
  });
}

/* ============================================================
 * The quiz a student receives
 * ============================================================ */

/** Deliberately without `isCorrect`: the type cannot carry the answer key. */
export type StudentQuestion = {
  id: string;
  questionMd: string;
  answerType: OfflineAnswerType;
  answers: Array<{ id: string; text: string }>;
};

/**
 * Builds each object field by field instead of spreading: a spread would copy
 * whatever extra column a future select brings along, `isCorrect` included.
 */
export function toStudentQuestions(
  questions: Array<{
    id: string;
    questionMd: string;
    answerType: OfflineAnswerType;
    answers: Array<{ id: string; text: string }>;
  }>
): StudentQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    questionMd: q.questionMd,
    answerType: q.answerType,
    answers: q.answers.map((a) => ({ id: a.id, text: a.text })),
  }));
}

export type QuizStatus = "aprobado" | "reconocido" | "disponible" | "sin_intentos";

/**
 * Passed wins: once approved, the remaining attempts are not the news. A quiz
 * covered by a recognition (and not passed here) reads "reconocido" — still
 * open to take, but nothing pending.
 */
export function quizStatus(passed: boolean, remaining: number | null, recognized = false): QuizStatus {
  if (passed) return "aprobado";
  if (recognized) return "reconocido";
  return remaining === null || remaining > 0 ? "disponible" : "sin_intentos";
}

/* ============================================================
 * Navigation and thumbnails
 * ============================================================ */

type TopicRef = { id: string; title: string };

/** The course's topics in reading order → the ones around `topicId`. */
export function topicNeighbors(
  ordered: TopicRef[],
  topicId: string
): { prev: TopicRef | null; next: TopicRef | null } {
  const i = ordered.findIndex((t) => t.id === topicId);
  if (i < 0) return { prev: null, next: null };
  const pick = (t: TopicRef | undefined) => (t ? { id: t.id, title: t.title } : null);
  return { prev: pick(ordered[i - 1]), next: pick(ordered[i + 1]) };
}

const MEDIA_THUMBNAIL = /^\/api\/media\/([\w.-]{1,64})$/;

/**
 * The importer stores thumbnails as `/api/media/<assetId>`. That route asks
 * for `inbox.ver`, so the library serves the file through its own routes;
 * this reads the asset id back. Anything else (an old hot-link) → null.
 */
export function thumbnailAssetId(thumbnailUrl: string | null): string | null {
  if (!thumbnailUrl) return null;
  return MEDIA_THUMBNAIL.exec(thumbnailUrl)?.[1] ?? null;
}
