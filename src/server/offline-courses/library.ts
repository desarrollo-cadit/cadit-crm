import { asc, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { OfflineAnswerType, OfflineCourseStatus } from "@/lib/db/schema";
import { thumbnailAssetId } from "./portal-logic";

/**
 * cursos-offline (T4) — The STAFF read side of the library.
 *
 * Staff only: the detail carries `isCorrect` on every answer. The student
 * portal (T5) has its own reads and must never reuse `courseDetail` — the
 * correct answers do not travel to a student, before or after an attempt.
 */

export type OfflineCourseSummary = {
  id: string;
  title: string;
  status: OfflineCourseStatus;
  thumbnailUrl: string | null;
  lessons: number;
  topics: number;
  quizzes: number;
};

export type OfflineCourseDetail = {
  id: string;
  title: string;
  status: OfflineCourseStatus;
  descriptionMd: string;
  thumbnailUrl: string | null;
  lessons: Array<{
    id: string;
    title: string;
    contentMd: string;
    topics: Array<{
      id: string;
      title: string;
      contentMd: string;
      videoUrl: string | null;
      videoShown: "before" | "after";
    }>;
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    descriptionMd: string;
    lessonId: string | null;
    passingPercentage: number;
    retriesAllowed: number | null;
    questions: Array<{
      id: string;
      questionMd: string;
      answerType: OfflineAnswerType;
      points: number;
      answers: Array<{ id: string; text: string; isCorrect: boolean }>;
    }>;
  }>;
};

/** Counts per course, grouped in the database instead of loading every topic. */
async function countBy<K extends string>(
  rows: Promise<Array<{ key: K | null; n: number }>>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const r of await rows) if (r.key) out.set(r.key, Number(r.n));
  return out;
}

export async function listCourses(orgId: string): Promise<OfflineCourseSummary[]> {
  const db = getDb();
  const { offlineCourse, offlineLesson, offlineTopic, offlineQuiz } = schema;

  const [courses, lessons, topics, quizzes] = await Promise.all([
    db
      .select({
        id: offlineCourse.id,
        title: offlineCourse.title,
        status: offlineCourse.status,
        thumbnailUrl: offlineCourse.thumbnailUrl,
      })
      .from(offlineCourse)
      .where(scoped(offlineCourse.organizationId, orgId))
      .orderBy(asc(offlineCourse.title)),
    countBy(
      db
        .select({ key: offlineLesson.courseId, n: count() })
        .from(offlineLesson)
        .where(scoped(offlineLesson.organizationId, orgId))
        .groupBy(offlineLesson.courseId)
    ),
    countBy(
      db
        .select({ key: offlineLesson.courseId, n: count() })
        .from(offlineTopic)
        .innerJoin(offlineLesson, eq(offlineLesson.id, offlineTopic.lessonId))
        .where(scoped(offlineTopic.organizationId, orgId))
        .groupBy(offlineLesson.courseId)
    ),
    countBy(
      db
        .select({ key: offlineQuiz.courseId, n: count() })
        .from(offlineQuiz)
        .where(scoped(offlineQuiz.organizationId, orgId))
        .groupBy(offlineQuiz.courseId)
    ),
  ]);

  return courses.map((c) => ({
    ...c,
    lessons: lessons.get(c.id) ?? 0,
    topics: topics.get(c.id) ?? 0,
    quizzes: quizzes.get(c.id) ?? 0,
  }));
}

/** The stored thumbnail's asset id, or `null` (unknown course, no thumbnail). */
export async function courseThumbnailAssetId(
  orgId: string,
  courseId: string
): Promise<string | null> {
  const [course] = await getDb()
    .select({ thumbnailUrl: schema.offlineCourse.thumbnailUrl })
    .from(schema.offlineCourse)
    .where(scoped(schema.offlineCourse.organizationId, orgId, eq(schema.offlineCourse.id, courseId)))
    .limit(1);
  return thumbnailAssetId(course?.thumbnailUrl ?? null);
}

/** `null` when the course does not exist in this organization → the route answers 404. */
export async function courseDetail(
  orgId: string,
  courseId: string
): Promise<OfflineCourseDetail | null> {
  const db = getDb();
  const { offlineCourse, offlineLesson, offlineTopic, offlineQuiz, offlineQuestion, offlineAnswer } =
    schema;

  const [course] = await db
    .select({
      id: offlineCourse.id,
      title: offlineCourse.title,
      status: offlineCourse.status,
      descriptionMd: offlineCourse.descriptionMd,
      thumbnailUrl: offlineCourse.thumbnailUrl,
    })
    .from(offlineCourse)
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)))
    .limit(1);
  if (!course) return null;

  const [lessons, quizzes] = await Promise.all([
    db
      .select({
        id: offlineLesson.id,
        title: offlineLesson.title,
        contentMd: offlineLesson.contentMd,
      })
      .from(offlineLesson)
      .where(scoped(offlineLesson.organizationId, orgId, eq(offlineLesson.courseId, courseId)))
      .orderBy(asc(offlineLesson.position), asc(offlineLesson.title)),
    db
      .select({
        id: offlineQuiz.id,
        title: offlineQuiz.title,
        descriptionMd: offlineQuiz.descriptionMd,
        lessonId: offlineQuiz.lessonId,
        passingPercentage: offlineQuiz.passingPercentage,
        retriesAllowed: offlineQuiz.retriesAllowed,
      })
      .from(offlineQuiz)
      .where(scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.courseId, courseId)))
      .orderBy(asc(offlineQuiz.position), asc(offlineQuiz.title)),
  ]);

  const lessonIds = lessons.map((l) => l.id);
  const quizIds = quizzes.map((q) => q.id);

  const [topics, questions] = await Promise.all([
    lessonIds.length
      ? db
          .select({
            id: offlineTopic.id,
            lessonId: offlineTopic.lessonId,
            title: offlineTopic.title,
            contentMd: offlineTopic.contentMd,
            videoUrl: offlineTopic.videoUrl,
            videoShown: offlineTopic.videoShown,
          })
          .from(offlineTopic)
          .where(scoped(offlineTopic.organizationId, orgId, inArray(offlineTopic.lessonId, lessonIds)))
          .orderBy(asc(offlineTopic.position), asc(offlineTopic.title))
      : Promise.resolve([]),
    quizIds.length
      ? db
          .select({
            id: offlineQuestion.id,
            quizId: offlineQuestion.quizId,
            questionMd: offlineQuestion.questionMd,
            answerType: offlineQuestion.answerType,
            points: offlineQuestion.points,
          })
          .from(offlineQuestion)
          .where(
            scoped(offlineQuestion.organizationId, orgId, inArray(offlineQuestion.quizId, quizIds))
          )
          .orderBy(asc(offlineQuestion.position))
      : Promise.resolve([]),
  ]);

  const questionIds = questions.map((q) => q.id);
  const answers = questionIds.length
    ? await db
        .select({
          id: offlineAnswer.id,
          questionId: offlineAnswer.questionId,
          text: offlineAnswer.text,
          isCorrect: offlineAnswer.isCorrect,
        })
        .from(offlineAnswer)
        .where(
          scoped(offlineAnswer.organizationId, orgId, inArray(offlineAnswer.questionId, questionIds))
        )
        .orderBy(asc(offlineAnswer.position))
    : [];

  return {
    ...course,
    lessons: lessons.map((l) => ({
      ...l,
      topics: topics
        .filter((t) => t.lessonId === l.id)
        .map(({ id, title, contentMd, videoUrl, videoShown }) => ({
          id,
          title,
          contentMd,
          videoUrl,
          videoShown,
        })),
    })),
    quizzes: quizzes.map((q) => ({
      ...q,
      questions: questions
        .filter((qs) => qs.quizId === q.id)
        .map(({ id, questionMd, answerType, points }) => ({
          id,
          questionMd,
          answerType,
          points,
          answers: answers
            .filter((a) => a.questionId === id)
            .map(({ id: answerId, text, isCorrect }) => ({ id: answerId, text, isCorrect })),
        })),
    })),
  };
}
