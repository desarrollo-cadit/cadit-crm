import { asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { OfflineVideoShown } from "@/lib/db/schema";
import {
  courseProgressState,
  type CompletionSource,
  type CourseProgressState,
  type RecognitionRef,
  type StoredProgress,
} from "./logic";

/**
 * cursos-offline (T9) — The reads that the student side (`student.ts`), the
 * progress writes (`progress.ts`) and the staff panel share: a course's
 * topics in reading order, a person's progress rows, passed quizzes and
 * active recognitions, and the completion derived from all of them.
 *
 * No access decision here: every caller has already answered "can this
 * person / this enrollment read the course". Keeping ONE definition of the
 * reading order matters because the gate (`topicUnlocked`) is only as good as
 * the order it is fed — two slightly different orders would let a student
 * open a topic the course page shows as locked.
 *
 * Read-only and without the answer key (guarded in
 * `tests/unit/cursos-offline-portal.test.ts`).
 */

const { offlineLesson, offlineTopic, offlineQuiz, offlineQuizAttempt, offlineTopicProgress, offlineRecognition } =
  schema;

export type OutlineTopic = {
  id: string;
  lessonId: string;
  title: string;
  videoUrl: string | null;
  videoShown: OfflineVideoShown;
};

export type CourseOutline = {
  lessons: Array<{ id: string; title: string }>;
  /** Reading order: lesson position, then topic position inside the lesson. */
  topics: OutlineTopic[];
};

/** Every requested course's outline; a course without lessons gets an empty one. */
export async function courseOutlines(
  orgId: string,
  courseIds: string[]
): Promise<Map<string, CourseOutline>> {
  const out = new Map<string, CourseOutline>(courseIds.map((id) => [id, { lessons: [], topics: [] }]));
  if (courseIds.length === 0) return out;
  const db = getDb();

  const lessons = await db
    .select({ id: offlineLesson.id, courseId: offlineLesson.courseId, title: offlineLesson.title })
    .from(offlineLesson)
    .where(scoped(offlineLesson.organizationId, orgId, inArray(offlineLesson.courseId, courseIds)))
    .orderBy(asc(offlineLesson.position), asc(offlineLesson.title));
  if (lessons.length === 0) return out;

  const topics = await db
    .select({
      id: offlineTopic.id,
      lessonId: offlineTopic.lessonId,
      title: offlineTopic.title,
      videoUrl: offlineTopic.videoUrl,
      videoShown: offlineTopic.videoShown,
    })
    .from(offlineTopic)
    .where(
      scoped(
        offlineTopic.organizationId,
        orgId,
        inArray(
          offlineTopic.lessonId,
          lessons.map((l) => l.id)
        )
      )
    )
    .orderBy(asc(offlineTopic.position), asc(offlineTopic.title));

  for (const lesson of lessons) {
    const outline = out.get(lesson.courseId);
    if (!outline) continue;
    outline.lessons.push({ id: lesson.id, title: lesson.title });
    outline.topics.push(...topics.filter((t) => t.lessonId === lesson.id));
  }
  return out;
}

export async function courseOutline(orgId: string, courseId: string): Promise<CourseOutline> {
  return (await courseOutlines(orgId, [courseId])).get(courseId) ?? { lessons: [], topics: [] };
}

export type ProgressRow = StoredProgress & { topicId: string; completedBy: string | null };

/** This person's progress rows for these topics (topics never opened have none). */
export async function progressRowsFor(
  orgId: string,
  contactId: string,
  topicIds: string[]
): Promise<ProgressRow[]> {
  if (topicIds.length === 0) return [];
  const rows = await getDb()
    .select({
      topicId: offlineTopicProgress.topicId,
      watchedRatio: offlineTopicProgress.watchedRatio,
      completedAt: offlineTopicProgress.completedAt,
      completionSource: offlineTopicProgress.completionSource,
      completedBy: offlineTopicProgress.completedBy,
    })
    .from(offlineTopicProgress)
    .where(
      scoped(
        offlineTopicProgress.organizationId,
        orgId,
        eq(offlineTopicProgress.contactId, contactId),
        inArray(offlineTopicProgress.topicId, topicIds)
      )
    );
  return rows.map((r) => ({
    ...r,
    watchedRatio: Number(r.watchedRatio),
    completionSource: (r.completionSource ?? null) as CompletionSource | null,
  }));
}

export const completedIds = (rows: ProgressRow[]) =>
  new Set(rows.filter((r) => r.completedAt !== null).map((r) => r.topicId));

export type QuizRef = { id: string; lessonId: string | null };

/** The quizzes of these courses, per course, in quiz order, with the lesson they hang from. */
export async function quizRefsByCourse(
  orgId: string,
  courseIds: string[]
): Promise<Map<string, QuizRef[]>> {
  const out = new Map<string, QuizRef[]>(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return out;
  const rows = await getDb()
    .select({ id: offlineQuiz.id, courseId: offlineQuiz.courseId, lessonId: offlineQuiz.lessonId })
    .from(offlineQuiz)
    .where(scoped(offlineQuiz.organizationId, orgId, inArray(offlineQuiz.courseId, courseIds)))
    .orderBy(asc(offlineQuiz.position), asc(offlineQuiz.title));
  for (const r of rows) out.get(r.courseId)?.push({ id: r.id, lessonId: r.lessonId });
  return out;
}

/**
 * This person's ACTIVE recognitions in these courses — scope only. The
 * reason and the author are staff data and are not selected here: this read
 * also feeds the student portal.
 */
export async function recognitionsFor(
  orgId: string,
  contactId: string,
  courseIds: string[]
): Promise<Map<string, RecognitionRef[]>> {
  const out = new Map<string, RecognitionRef[]>(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return out;
  const rows = await getDb()
    .select({
      courseId: offlineRecognition.courseId,
      lessonId: offlineRecognition.lessonId,
      revokedAt: offlineRecognition.revokedAt,
    })
    .from(offlineRecognition)
    .where(
      scoped(
        offlineRecognition.organizationId,
        orgId,
        eq(offlineRecognition.contactId, contactId),
        inArray(offlineRecognition.courseId, courseIds),
        isNull(offlineRecognition.revokedAt)
      )
    );
  for (const r of rows) out.get(r.courseId)?.push({ lessonId: r.lessonId, revokedAt: r.revokedAt });
  return out;
}

export type ContactCourseProgress = {
  outline: CourseOutline;
  quizzes: QuizRef[];
  /** This person's progress rows for the course's topics. */
  rows: ProgressRow[];
  state: CourseProgressState;
};

/**
 * Per course: the outline, the quizzes, this person's rows and THE derived
 * state (`courseProgressState`). Every completion read — staff panel, student
 * portal, the sequential gate of the progress writes — starts here, so they
 * cannot count a recognized lesson differently.
 */
export async function contactCourseProgress(
  orgId: string,
  contactId: string,
  courseIds: string[]
): Promise<Map<string, ContactCourseProgress>> {
  const [outlines, quizzes, recognitions] = await Promise.all([
    courseOutlines(orgId, courseIds),
    quizRefsByCourse(orgId, courseIds),
    recognitionsFor(orgId, contactId, courseIds),
  ]);
  const topicIds = [...outlines.values()].flatMap((o) => o.topics.map((t) => t.id));
  const [rows, passed] = await Promise.all([
    progressRowsFor(orgId, contactId, topicIds),
    passedQuizIdsFor(
      orgId,
      contactId,
      [...quizzes.values()].flat().map((q) => q.id)
    ),
  ]);
  const done = completedIds(rows);

  const out = new Map<string, ContactCourseProgress>();
  for (const courseId of courseIds) {
    const outline = outlines.get(courseId) ?? { lessons: [], topics: [] };
    const courseQuizzes = quizzes.get(courseId) ?? [];
    const ids = new Set(outline.topics.map((t) => t.id));
    out.set(courseId, {
      outline,
      quizzes: courseQuizzes,
      rows: rows.filter((r) => ids.has(r.topicId)),
      state: courseProgressState({
        topics: outline.topics,
        quizzes: courseQuizzes,
        completedTopicIds: done,
        passedQuizIds: passed,
        recognitions: recognitions.get(courseId) ?? [],
      }),
    });
  }
  return out;
}

const emptyProgress = (): ContactCourseProgress => ({
  outline: { lessons: [], topics: [] },
  quizzes: [],
  rows: [],
  state: courseProgressState({
    topics: [],
    quizzes: [],
    completedTopicIds: [],
    passedQuizIds: [],
    recognitions: [],
  }),
});

export async function contactCourseProgressOne(
  orgId: string,
  contactId: string,
  courseId: string
): Promise<ContactCourseProgress> {
  return (await contactCourseProgress(orgId, contactId, [courseId])).get(courseId) ?? emptyProgress();
}

/** Quizzes this person passed at least once (attempts count per contact). */
export async function passedQuizIdsFor(
  orgId: string,
  contactId: string,
  quizIds: string[]
): Promise<Set<string>> {
  if (quizIds.length === 0) return new Set();
  const rows = await getDb()
    .selectDistinct({ quizId: offlineQuizAttempt.quizId })
    .from(offlineQuizAttempt)
    .where(
      scoped(
        offlineQuizAttempt.organizationId,
        orgId,
        eq(offlineQuizAttempt.contactId, contactId),
        eq(offlineQuizAttempt.passed, true),
        inArray(offlineQuizAttempt.quizId, quizIds)
      )
    );
  return new Set(rows.map((r) => r.quizId));
}
