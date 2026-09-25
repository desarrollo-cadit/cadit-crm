import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { effectiveCourseIdsForContact } from "./access";
import type { OfflineVideoShown } from "@/lib/db/schema";
import { parseVimeoUrl } from "@/lib/vimeo";
import {
  attemptsRemaining,
  courseCompletion,
  topicUnlocked,
  type CourseCompletion,
} from "./logic";
import {
  completedIds,
  courseOutline,
  courseOutlines,
  progressRowsFor,
  quizIdsByCourse,
  type OutlineTopic,
} from "./outline";
import {
  quizStatus,
  thumbnailAssetId,
  toStudentQuestions,
  topicNeighbors,
  type QuizStatus,
  type StudentQuestion,
} from "./portal-logic";

/**
 * cursos-offline (T5) — The STUDENT read side of the library.
 *
 * Same discipline as `src/server/student-portal.ts`, and guarded the same way
 * (`tests/unit/cursos-offline-portal.test.ts`):
 *
 *  - Every exported function starts from `contactId`. There is no read path
 *    that does not go through "which courses does THIS person have".
 *  - A course the person cannot read answers `null`, exactly like one that
 *    does not exist: the route turns both into 404. A 403 would confirm it
 *    exists.
 *  - Read-only. The one student write (an attempt) lives in `submit.ts`.
 *  - The answer key does not travel. Nothing here selects `is_correct`, and
 *    the quiz DTO has no field that could carry it — before or after an
 *    attempt the student sees score and passed, nothing per question.
 *
 * Drafts stay out: a course marked `draft` is not shown to students even if a
 * cohort points at it.
 *
 * T9 — Topics open one after the other (`topicUnlocked`, lesson → topic
 * order across the whole course, defined once in `outline.ts`). A locked
 * topic answers `null` exactly like a missing one: the gate lives here, not
 * in the UI, because a hidden link is still a typed URL away. Quizzes are NOT
 * gated (owner decision).
 */

const {
  offlineCourse,
  offlineTopic,
  offlineQuiz,
  offlineQuestion,
  offlineAnswer,
  offlineQuizAttempt,
} = schema;

export type StudentOfflineCourseCard = {
  id: string;
  title: string;
  hasThumbnail: boolean;
  topics: number;
  quizzesTotal: number;
  quizzesPassed: number;
  completion: CourseCompletion;
};

export type StudentQuizSummary = {
  id: string;
  title: string;
  lessonId: string | null;
  passingPercentage: number;
  attemptsUsed: number;
  /** `null` = unlimited. */
  attemptsRemaining: number | null;
  passed: boolean;
  status: QuizStatus;
};

export type StudentOfflineCourse = {
  id: string;
  title: string;
  descriptionMd: string;
  hasThumbnail: boolean;
  lessons: Array<{
    id: string;
    title: string;
    topics: Array<{ id: string; title: string; completed: boolean; unlocked: boolean }>;
  }>;
  quizzes: StudentQuizSummary[];
  completion: CourseCompletion;
};

export type StudentOfflineTopic = {
  course: { id: string; title: string };
  lessonTitle: string;
  topic: { id: string; title: string; contentMd: string };
  /** `null` = no embeddable video: the topic completes on open. */
  video: { id: string; hash: string | null; shown: OfflineVideoShown } | null;
  progress: { completed: boolean; watchedRatio: number };
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
};

/** One of the person's own attempts: how it went, never which answers were right. */
export type StudentAttempt = {
  attemptNumber: number;
  scorePercentage: number;
  passed: boolean;
  createdAt: string;
};

export type StudentOfflineQuiz = StudentQuizSummary & {
  descriptionMd: string;
  course: { id: string; title: string };
  /** `null` = unlimited. */
  maxAttempts: number | null;
  questions: StudentQuestion[];
  attempts: StudentAttempt[];
};

/* ============================================================
 * Scope
 * ============================================================ */

/** The published library courses this person can read. */
async function readableCourseIds(orgId: string, contactId: string): Promise<string[]> {
  const ids = await effectiveCourseIdsForContact(orgId, contactId);
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select({ id: offlineCourse.id })
    .from(offlineCourse)
    .where(
      scoped(
        offlineCourse.organizationId,
        orgId,
        inArray(offlineCourse.id, ids),
        eq(offlineCourse.status, "published")
      )
    );
  return rows.map((r) => r.id);
}

/** The course, when this person can read it; `null` otherwise (→ 404). */
async function readableCourse(orgId: string, contactId: string, courseId: string) {
  const ids = await readableCourseIds(orgId, contactId);
  if (!ids.includes(courseId)) return null;
  const [course] = await getDb()
    .select({
      id: offlineCourse.id,
      title: offlineCourse.title,
      descriptionMd: offlineCourse.descriptionMd,
      thumbnailUrl: offlineCourse.thumbnailUrl,
    })
    .from(offlineCourse)
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)))
    .limit(1);
  return course ?? null;
}

/**
 * Whether this person can read the course (effective access AND published).
 * The progress writes ask the same question through this one definition.
 */
export async function canReadCourse(
  orgId: string,
  contactId: string,
  courseId: string
): Promise<boolean> {
  return (await readableCourseIds(orgId, contactId)).includes(courseId);
}

/** The embeddable video of a topic; an unparseable URL counts as no video. */
function topicVideo(t: OutlineTopic): StudentOfflineTopic["video"] {
  const ref = parseVimeoUrl(t.videoUrl);
  return ref ? { ...ref, shown: t.videoShown } : null;
}

/** This person's attempts at these quizzes, oldest first. */
async function ownAttempts(orgId: string, contactId: string, quizIds: string[]) {
  if (quizIds.length === 0) return [];
  const rows = await getDb()
    .select({
      quizId: offlineQuizAttempt.quizId,
      attemptNumber: offlineQuizAttempt.attemptNumber,
      scorePercentage: offlineQuizAttempt.scorePercentage,
      passed: offlineQuizAttempt.passed,
      createdAt: offlineQuizAttempt.createdAt,
    })
    .from(offlineQuizAttempt)
    .where(
      scoped(
        offlineQuizAttempt.organizationId,
        orgId,
        eq(offlineQuizAttempt.contactId, contactId),
        inArray(offlineQuizAttempt.quizId, quizIds)
      )
    )
    .orderBy(asc(offlineQuizAttempt.attemptNumber));
  return rows.map((r) => ({
    quizId: r.quizId,
    attemptNumber: r.attemptNumber,
    scorePercentage: Number(r.scorePercentage),
    passed: r.passed,
    createdAt: r.createdAt.toISOString(),
  }));
}

type QuizRow = {
  id: string;
  title: string;
  lessonId: string | null;
  passingPercentage: number;
  retriesAllowed: number | null;
};

function summarize(
  quiz: QuizRow,
  attempts: Array<{ quizId: string; passed: boolean }>
): StudentQuizSummary {
  const mine = attempts.filter((a) => a.quizId === quiz.id);
  const remaining = attemptsRemaining(quiz.retriesAllowed, mine.length);
  const passed = mine.some((a) => a.passed);
  return {
    id: quiz.id,
    title: quiz.title,
    lessonId: quiz.lessonId,
    passingPercentage: quiz.passingPercentage,
    attemptsUsed: mine.length,
    attemptsRemaining: remaining,
    passed,
    status: quizStatus(passed, remaining),
  };
}

const quizColumns = {
  id: offlineQuiz.id,
  title: offlineQuiz.title,
  lessonId: offlineQuiz.lessonId,
  passingPercentage: offlineQuiz.passingPercentage,
  retriesAllowed: offlineQuiz.retriesAllowed,
};

/* ============================================================
 * Reads
 * ============================================================ */

/** The person's library: every readable course with how many quizzes they passed. */
export async function myCourses(
  orgId: string,
  contactId: string
): Promise<StudentOfflineCourseCard[]> {
  const ids = await readableCourseIds(orgId, contactId);
  if (ids.length === 0) return [];

  const [courses, outlines, quizzesByCourse] = await Promise.all([
    getDb()
      .select({
        id: offlineCourse.id,
        title: offlineCourse.title,
        thumbnailUrl: offlineCourse.thumbnailUrl,
      })
      .from(offlineCourse)
      .where(scoped(offlineCourse.organizationId, orgId, inArray(offlineCourse.id, ids)))
      .orderBy(asc(offlineCourse.title)),
    courseOutlines(orgId, ids),
    quizIdsByCourse(orgId, ids),
  ]);

  const allTopicIds = [...outlines.values()].flatMap((o) => o.topics.map((t) => t.id));
  const allQuizIds = [...quizzesByCourse.values()].flat();
  const [progress, attempts] = await Promise.all([
    progressRowsFor(orgId, contactId, allTopicIds),
    ownAttempts(orgId, contactId, allQuizIds),
  ]);
  const done = completedIds(progress);
  const passedQuizIds = new Set(attempts.filter((a) => a.passed).map((a) => a.quizId));

  return courses.map((c) => {
    const topicIds = outlines.get(c.id)?.topics.map((t) => t.id) ?? [];
    const completion = courseCompletion({
      topicIds,
      completedTopicIds: done,
      quizIds: quizzesByCourse.get(c.id) ?? [],
      passedQuizIds,
    });
    return {
      id: c.id,
      title: c.title,
      hasThumbnail: thumbnailAssetId(c.thumbnailUrl) !== null,
      topics: topicIds.length,
      quizzesTotal: completion.quizzesTotal,
      quizzesPassed: completion.quizzesPassed,
      completion,
    };
  });
}

/** One course: lessons → topic titles, and the quizzes with this person's status. */
export async function myCourse(
  orgId: string,
  contactId: string,
  courseId: string
): Promise<StudentOfflineCourse | null> {
  const course = await readableCourse(orgId, contactId, courseId);
  if (!course) return null;

  const [outline, quizzes] = await Promise.all([
    courseOutline(orgId, courseId),
    getDb()
      .select(quizColumns)
      .from(offlineQuiz)
      .where(scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.courseId, courseId)))
      .orderBy(asc(offlineQuiz.position), asc(offlineQuiz.title)),
  ]);

  const orderedIds = outline.topics.map((t) => t.id);
  const [progress, attempts] = await Promise.all([
    progressRowsFor(orgId, contactId, orderedIds),
    ownAttempts(
      orgId,
      contactId,
      quizzes.map((q) => q.id)
    ),
  ]);
  const done = completedIds(progress);

  return {
    id: course.id,
    title: course.title,
    descriptionMd: course.descriptionMd,
    hasThumbnail: thumbnailAssetId(course.thumbnailUrl) !== null,
    lessons: outline.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      topics: outline.topics
        .filter((t) => t.lessonId === l.id)
        .map((t) => ({
          id: t.id,
          title: t.title,
          completed: done.has(t.id),
          unlocked: topicUnlocked(orderedIds, done, t.id),
        })),
    })),
    quizzes: quizzes.map((q) => summarize(q, attempts)),
    completion: courseCompletion({
      topicIds: orderedIds,
      completedTopicIds: done,
      quizIds: quizzes.map((q) => q.id),
      passedQuizIds: attempts.filter((a) => a.passed).map((a) => a.quizId),
    }),
  };
}

/** One topic's content, with the topics before and after it in reading order. */
export async function myTopic(
  orgId: string,
  contactId: string,
  courseId: string,
  topicId: string
): Promise<StudentOfflineTopic | null> {
  const course = await readableCourse(orgId, contactId, courseId);
  if (!course) return null;

  const outline = await courseOutline(orgId, courseId);
  const current = outline.topics.find((t) => t.id === topicId);
  // A topic of ANOTHER course is "not found", even if that course is readable.
  if (!current) return null;

  const orderedIds = outline.topics.map((t) => t.id);
  const progress = await progressRowsFor(orgId, contactId, orderedIds);
  const done = completedIds(progress);
  // Locked = not found: the content does not travel before its turn.
  if (!topicUnlocked(orderedIds, done, current.id)) return null;

  const [content] = await getDb()
    .select({ contentMd: offlineTopic.contentMd })
    .from(offlineTopic)
    .where(scoped(offlineTopic.organizationId, orgId, eq(offlineTopic.id, current.id)))
    .limit(1);

  return {
    course: { id: course.id, title: course.title },
    lessonTitle: outline.lessons.find((l) => l.id === current.lessonId)?.title ?? "",
    topic: { id: current.id, title: current.title, contentMd: content?.contentMd ?? "" },
    video: topicVideo(current),
    progress: {
      completed: done.has(current.id),
      watchedRatio: progress.find((p) => p.topicId === current.id)?.watchedRatio ?? 0,
    },
    ...topicNeighbors(outline.topics, current.id),
  };
}

/**
 * One quiz to take: questions and answer TEXTS, the attempts left and this
 * person's own history. No `is_correct` is selected here.
 */
export async function myQuiz(
  orgId: string,
  contactId: string,
  courseId: string,
  quizId: string
): Promise<StudentOfflineQuiz | null> {
  const course = await readableCourse(orgId, contactId, courseId);
  if (!course) return null;
  const db = getDb();

  const [quiz] = await db
    .select({ ...quizColumns, courseId: offlineQuiz.courseId, descriptionMd: offlineQuiz.descriptionMd })
    .from(offlineQuiz)
    .where(scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.id, quizId)))
    .limit(1);
  if (!quiz || quiz.courseId !== courseId) return null;

  const [questions, attempts] = await Promise.all([
    db
      .select({
        id: offlineQuestion.id,
        questionMd: offlineQuestion.questionMd,
        answerType: offlineQuestion.answerType,
      })
      .from(offlineQuestion)
      .where(scoped(offlineQuestion.organizationId, orgId, eq(offlineQuestion.quizId, quizId)))
      .orderBy(asc(offlineQuestion.position)),
    ownAttempts(orgId, contactId, [quizId]),
  ]);

  const answers = questions.length
    ? await db
        .select({
          id: offlineAnswer.id,
          questionId: offlineAnswer.questionId,
          text: offlineAnswer.text,
        })
        .from(offlineAnswer)
        .where(
          scoped(
            offlineAnswer.organizationId,
            orgId,
            inArray(
              offlineAnswer.questionId,
              questions.map((q) => q.id)
            )
          )
        )
        .orderBy(asc(offlineAnswer.position))
    : [];

  return {
    ...summarize(quiz, attempts),
    descriptionMd: quiz.descriptionMd,
    course: { id: course.id, title: course.title },
    // Remaining with zero used IS the maximum; one rule, one place.
    maxAttempts: attemptsRemaining(quiz.retriesAllowed, 0),
    questions: toStudentQuestions(
      questions.map((q) => ({
        ...q,
        answers: answers.filter((a) => a.questionId === q.id),
      }))
    ),
    attempts: attempts
      .map(({ attemptNumber, scorePercentage, passed, createdAt }) => ({
        attemptNumber,
        scorePercentage,
        passed,
        createdAt,
      }))
      .reverse(),
  };
}

/** The stored thumbnail of a course this person can read; `null` → 404. */
export async function myCourseThumbnailAssetId(
  orgId: string,
  contactId: string,
  courseId: string
): Promise<string | null> {
  const course = await readableCourse(orgId, contactId, courseId);
  return course ? thumbnailAssetId(course.thumbnailUrl) : null;
}
