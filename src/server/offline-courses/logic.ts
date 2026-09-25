import { z } from "zod";

/**
 * cursos-offline — Pure rules of the offline library: who reads which course,
 * how a quiz is graded and how many attempts are left.
 *
 * No database here on purpose: these are the decisions the feature document
 * fixes, and they are tested branch by branch
 * (`tests/unit/cursos-offline-{acceso,calificacion}.test.ts`). The queries
 * feed them plain data.
 */

/* ============================================================
 * Access
 * ============================================================ */

export type AccessMode = "grant" | "revoke";

export interface AccessOverride {
  courseId: string;
  mode: AccessMode;
}

/** What one enrollment brings: the courses of its cohort + its own overrides. */
export interface EnrollmentAccessInput {
  cohortCourseIds: string[];
  overrides: AccessOverride[];
}

/**
 * - `inherited`: the cohort has it and nothing overrides it.
 * - `granted`: an individual grant (whether or not the cohort has it).
 * - `revoked`: the cohort has it and the enrollment revokes it.
 * - `none`: no access — including a revoke on a course the cohort lacks.
 */
export type AccessState = "inherited" | "granted" | "revoked" | "none";

/**
 * effective(enrollment, course) = (cohort assigned AND NOT revoke) OR grant.
 *
 * Grant wins over a revoke on the same course because the rule is an OR. The
 * unique index on (enrollment, course) makes that pair impossible in the
 * database; the function still answers it the way the rule reads.
 */
export function accessState(courseId: string, input: EnrollmentAccessInput): AccessState {
  const modes = input.overrides.filter((o) => o.courseId === courseId).map((o) => o.mode);
  if (modes.includes("grant")) return "granted";
  if (!input.cohortCourseIds.includes(courseId)) return "none";
  return modes.includes("revoke") ? "revoked" : "inherited";
}

const isEffective = (state: AccessState) => state === "inherited" || state === "granted";

/** The course ids one enrollment can read, without duplicates. */
export function resolveEffectiveAccess(input: EnrollmentAccessInput): string[] {
  const candidates = new Set([
    ...input.cohortCourseIds,
    ...input.overrides.map((o) => o.courseId),
  ]);
  return [...candidates].filter((id) => isEffective(accessState(id, input)));
}

/**
 * A student's courses = the UNION over their enrollments. A revoke in one
 * enrollment does not hide a course that another enrollment gives.
 */
export function studentCourseIds(enrollments: EnrollmentAccessInput[]): string[] {
  const out = new Set<string>();
  for (const enrollment of enrollments) {
    for (const id of resolveEffectiveAccess(enrollment)) out.add(id);
  }
  return [...out];
}

/* ============================================================
 * Staff assignment (the write decisions, kept pure)
 * ============================================================ */

/**
 * The cohort multi-check REPLACES the set: insert what is new, delete what
 * was unchecked, leave the rest alone (its row, author and date survive).
 */
export function planCohortCourses(
  currentIds: string[],
  desiredIds: string[]
): { toInsert: string[]; toDelete: string[] } {
  const current = new Set(currentIds);
  const desired = new Set(desiredIds);
  return {
    toInsert: [...desired].filter((id) => !current.has(id)),
    toDelete: [...current].filter((id) => !desired.has(id)),
  };
}

export type OverrideAction = AccessMode | "clear";

export type OverridePlan =
  | { kind: "none" }
  | { kind: "insert"; mode: AccessMode }
  | { kind: "update"; id: string; mode: AccessMode }
  | { kind: "delete"; id: string };

/**
 * One (enrollment, course) row at most — the partial unique index says so.
 * grant/revoke upsert that row; "clear" removes it, so the enrollment goes
 * back to whatever the cohort says. Repeating the current mode writes nothing.
 */
export function planOverride(
  existing: { id: string; mode: AccessMode } | null,
  action: OverrideAction
): OverridePlan {
  if (action === "clear") return existing ? { kind: "delete", id: existing.id } : { kind: "none" };
  if (!existing) return { kind: "insert", mode: action };
  if (existing.mode === action) return { kind: "none" };
  return { kind: "update", id: existing.id, mode: action };
}

export interface CourseState {
  courseId: string;
  title: string;
  state: AccessState;
  cohortHas: boolean;
  /** The individual row, if any — the panel offers "Restablecer" only then. */
  override: AccessMode | null;
}

/** The per-student panel: one state per library course, in library order. */
export function courseStatesFor(
  courses: Array<{ id: string; title: string }>,
  input: EnrollmentAccessInput
): CourseState[] {
  return courses.map((course) => ({
    courseId: course.id,
    title: course.title,
    state: accessState(course.id, input),
    cohortHas: input.cohortCourseIds.includes(course.id),
    override: input.overrides.find((o) => o.courseId === course.id)?.mode ?? null,
  }));
}

/* ============================================================
 * Grading
 * ============================================================ */

export interface GradableQuestion {
  id: string;
  answerType: "single" | "multiple";
  points: number;
  answers: Array<{ id: string; isCorrect: boolean }>;
}

/** questionId → the answer ids the student chose. */
export type GivenAnswers = Record<string, string[]>;

export interface QuizGrade {
  /** 0–100, rounded to 2 decimals (fits `numeric(5,2)`). */
  scorePercentage: number;
  passed: boolean;
  /** Internal: which questions scored. Never sent to the student. */
  correctQuestionIds: string[];
}

function isAnsweredCorrectly(question: GradableQuestion, chosenRaw: string[] | undefined): boolean {
  const chosen = new Set(chosenRaw ?? []);
  // Unanswered is wrong — also for a malformed question with no correct
  // answer, where "nothing chosen" would otherwise equal the correct set.
  if (chosen.size === 0) return false;

  const correct = new Set(question.answers.filter((a) => a.isCorrect).map((a) => a.id));
  if (correct.size === 0) return false;

  if (question.answerType === "single") {
    const [only] = [...chosen];
    return chosen.size === 1 && only !== undefined && correct.has(only);
  }

  // multiple: exact set match. Any id outside the correct set (a wrong answer,
  // another question's answer, an unknown id) breaks the equality.
  if (chosen.size !== correct.size) return false;
  return [...chosen].every((id) => correct.has(id));
}

/**
 * Score = correct points / total points × 100, 2 decimals; passed = score ≥
 * passing percentage.
 *
 * A quiz with no questions (or worth 0 points in total) returns score 0 and
 * NOT passed instead of throwing: the importer already skips empty quizzes,
 * so reaching this is bad data, and "passed" would be a false statement about
 * a person. Returning keeps the request alive; the caller can refuse to store
 * it.
 */
export function gradeQuiz(
  questions: GradableQuestion[],
  given: GivenAnswers,
  passingPercentage: number
): QuizGrade {
  let totalPoints = 0;
  let earnedPoints = 0;
  const correctQuestionIds: string[] = [];

  for (const question of questions) {
    totalPoints += question.points;
    if (isAnsweredCorrectly(question, given[question.id])) {
      earnedPoints += question.points;
      correctQuestionIds.push(question.id);
    }
  }

  if (totalPoints <= 0) {
    return { scorePercentage: 0, passed: false, correctQuestionIds };
  }

  const scorePercentage = Math.round((earnedPoints / totalPoints) * 10000) / 100;
  return {
    scorePercentage,
    passed: scorePercentage >= passingPercentage,
    correctQuestionIds,
  };
}

/* ============================================================
 * Retries
 * ============================================================ */

/**
 * `retriesAllowed` counts retakes AFTER the first attempt, so the maximum is
 * 1 + retriesAllowed. `null` = unlimited → `null`. Attempts are counted per
 * contact, across enrollments (the caller counts them that way).
 */
export function attemptsRemaining(
  retriesAllowed: number | null,
  attemptsUsed: number
): number | null {
  if (retriesAllowed === null) return null;
  const maxAttempts = 1 + Math.max(0, retriesAllowed);
  return Math.max(0, maxAttempts - attemptsUsed);
}

export function canAttempt(retriesAllowed: number | null, attemptsUsed: number): boolean {
  const remaining = attemptsRemaining(retriesAllowed, attemptsUsed);
  return remaining === null || remaining > 0;
}

/* ============================================================
 * Submission payload
 * ============================================================ */

const MAX_ID_LENGTH = 64;
const MAX_ANSWERS_PER_QUESTION = 50;
const MAX_QUESTIONS = 500;

const idSchema = z.string().min(1).max(MAX_ID_LENGTH);

/**
 * The body the student portal POSTs: `{ answers: { [questionId]: answerId[] } }`.
 * An empty list is a legitimate "left blank" (graded as wrong). The limits
 * only bound the payload; which ids are valid is decided by `gradeQuiz`.
 */
export const validateSubmission = z.object({
  answers: z
    .record(idSchema, z.array(idSchema).max(MAX_ANSWERS_PER_QUESTION))
    .refine((answers) => Object.keys(answers).length <= MAX_QUESTIONS, {
      message: `at most ${MAX_QUESTIONS} questions`,
    }),
});

export type QuizSubmission = z.infer<typeof validateSubmission>;

/* ============================================================
 * Progress (export v2: Vimeo videos + sequential topics)
 * ============================================================ */

/** Share of the video that must really be played for the topic to count. */
export const VIDEO_COMPLETE_THRESHOLD = 0.9;

export interface PlayedRange {
  start: number;
  end: number;
}

export interface VideoProgress {
  watchedRatio: number;
  complete: boolean;
}

/**
 * Coverage of the REAL played ranges (Vimeo `played`), merged and clamped to
 * [0, duration]. Never the `ended` event: seeking to the end is not watching.
 * A non-positive duration is unknown → 0, not complete.
 */
export function isVideoComplete(playedRanges: PlayedRange[], duration: number): VideoProgress {
  if (!(duration > 0)) return { watchedRatio: 0, complete: false };
  const ranges = playedRanges
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(duration, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  let covered = 0;
  let cursor = 0;
  for (const r of ranges) {
    const from = Math.max(cursor, r.start);
    if (r.end > from) covered += r.end - from;
    cursor = Math.max(cursor, r.end);
  }
  const watchedRatio = Math.min(1, covered / duration);
  return { watchedRatio, complete: watchedRatio >= VIDEO_COMPLETE_THRESHOLD };
}

/**
 * Topics open one after the other across the whole course (lesson → topic
 * order): the first is always open, topic k needs topic k-1 complete.
 * A topic outside the course is locked.
 */
export function topicUnlocked(
  orderedTopicIds: string[],
  completedTopicIds: Iterable<string>,
  topicId: string
): boolean {
  const index = orderedTopicIds.indexOf(topicId);
  if (index < 0) return false;
  if (index === 0) return true;
  return new Set(completedTopicIds).has(orderedTopicIds[index - 1]!);
}

export interface CourseCompletionInput {
  topicIds: string[];
  completedTopicIds: Iterable<string>;
  quizIds: string[];
  passedQuizIds: Iterable<string>;
}

export interface CourseCompletion {
  topicsDone: number;
  topicsTotal: number;
  quizzesPassed: number;
  quizzesTotal: number;
  completed: boolean;
}

/**
 * Completed = every topic complete AND every quiz passed (a course without
 * quizzes needs only its topics). An empty course is never "completed": that
 * would be a claim about a person with nothing behind it.
 */
export function courseCompletion(input: CourseCompletionInput): CourseCompletion {
  const topics = new Set(input.topicIds);
  const quizzes = new Set(input.quizIds);
  const done = new Set([...input.completedTopicIds].filter((id) => topics.has(id)));
  const passed = new Set([...input.passedQuizIds].filter((id) => quizzes.has(id)));
  const topicsTotal = topics.size;
  const quizzesTotal = quizzes.size;
  return {
    topicsDone: done.size,
    topicsTotal,
    quizzesPassed: passed.size,
    quizzesTotal,
    completed:
      topicsTotal + quizzesTotal > 0 && done.size === topicsTotal && passed.size === quizzesTotal,
  };
}
