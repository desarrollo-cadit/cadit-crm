import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { OfflineVideoShown } from "@/lib/db/schema";
import type { CompletionSource, StoredProgress } from "./logic";

/**
 * cursos-offline (T9) — The reads that the student side (`student.ts`), the
 * progress writes (`progress.ts`) and the staff panel share: a course's
 * topics in reading order, a person's progress rows and passed quizzes.
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

const { offlineLesson, offlineTopic, offlineQuiz, offlineQuizAttempt, offlineTopicProgress } = schema;

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

/** The quizzes of these courses, per course, in quiz order. */
export async function quizIdsByCourse(
  orgId: string,
  courseIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return out;
  const rows = await getDb()
    .select({ id: offlineQuiz.id, courseId: offlineQuiz.courseId })
    .from(offlineQuiz)
    .where(scoped(offlineQuiz.organizationId, orgId, inArray(offlineQuiz.courseId, courseIds)))
    .orderBy(asc(offlineQuiz.position), asc(offlineQuiz.title));
  for (const r of rows) out.get(r.courseId)?.push(r.id);
  return out;
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
