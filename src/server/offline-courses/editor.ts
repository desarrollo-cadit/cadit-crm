import { and, asc, count, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { MEDIA_LIMITS, saveMediaFile } from "@/server/whatsapp/media";
import {
  deleteGuard,
  normalizeVideoUrl,
  planAnswerSet,
  uniqueSlug,
  validateAnswerSet,
  validateReorder,
  type CourseBody,
  type CoursePatch,
  type EditorError,
  type EditorResult,
  type HistoryCounts,
  type LessonBody,
  type LessonPatch,
  type QuestionBody,
  type QuestionPatch,
  type QuizBody,
  type QuizPatch,
  type TopicBody,
  type TopicPatch,
} from "./editor-logic";

/**
 * cursos-offline T11 — Staff writes on the library (courses, lessons, topics,
 * quizzes, questions, answers).
 *
 * Every function answers `{ ok: true, data } | { ok: false, status, code,
 * message }` and runs EVERY check before its first write: a route that returns
 * an error Response does not roll the tenant transaction back (CLAUDE.md), so
 * a half-applied edit must be impossible by construction.
 *
 * Nested ids are always resolved THROUGH the course of the URL: a lesson,
 * topic, quiz or question of another course is "not found", never edited.
 *
 * Rows created here carry `legacy_ref = NULL` (migration 0045): they have no
 * LearnDash origin, and the importer never matches them.
 *
 * No author columns: who did it is recorded by the transaction's
 * `app.current_actor`, like every other staff write.
 */

const { offlineCourse, offlineLesson, offlineTopic, offlineQuiz, offlineQuestion, offlineAnswer } = schema;
const { offlineQuizAttempt, offlineTopicProgress, offlineRecognition, mediaAsset } = schema;

/** The route's answer: `{ ...data }` with `successStatus`, or the error envelope. */
export function editorResponse<T extends object>(result: EditorResult<T>, successStatus = 200): Response {
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json(result.data, { status: successStatus });
}

/** The full phrase, not a noun: Spanish agrees in gender ("Lección no encontrada"). */
const notFound = (message: string): EditorError => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (code: string, message: string): EditorError => ({ ok: false, status: 422, code, message });
const ok = <T>(data: T): EditorResult<T> => ({ ok: true, data });
const now = () => new Date();

/* ============================================================
 * Resolution through the course of the URL
 * ============================================================ */

async function courseExists(orgId: string, courseId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: offlineCourse.id })
    .from(offlineCourse)
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)))
    .limit(1);
  return !!row;
}

async function lessonOf(orgId: string, courseId: string, lessonId: string) {
  const [row] = await getDb()
    .select({ id: offlineLesson.id })
    .from(offlineLesson)
    .where(scoped(offlineLesson.organizationId, orgId, eq(offlineLesson.id, lessonId), eq(offlineLesson.courseId, courseId)))
    .limit(1);
  return row ?? null;
}

async function topicOf(orgId: string, courseId: string, topicId: string) {
  const [row] = await getDb()
    .select({ id: offlineTopic.id, lessonId: offlineTopic.lessonId })
    .from(offlineTopic)
    .innerJoin(offlineLesson, eq(offlineLesson.id, offlineTopic.lessonId))
    .where(
      scoped(
        offlineTopic.organizationId,
        orgId,
        eq(offlineLesson.organizationId, orgId),
        eq(offlineTopic.id, topicId),
        eq(offlineLesson.courseId, courseId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function quizOf(orgId: string, courseId: string, quizId: string) {
  const [row] = await getDb()
    .select({ id: offlineQuiz.id })
    .from(offlineQuiz)
    .where(scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.id, quizId), eq(offlineQuiz.courseId, courseId)))
    .limit(1);
  return row ?? null;
}

async function questionOf(orgId: string, quizId: string, questionId: string) {
  const [row] = await getDb()
    .select({ id: offlineQuestion.id, answerType: offlineQuestion.answerType })
    .from(offlineQuestion)
    .where(
      scoped(offlineQuestion.organizationId, orgId, eq(offlineQuestion.id, questionId), eq(offlineQuestion.quizId, quizId))
    )
    .limit(1);
  return row ?? null;
}

/** Next free position among the rows matching `where` (0 for the first one). */
async function nextPosition(
  table: typeof offlineLesson | typeof offlineTopic | typeof offlineQuiz | typeof offlineQuestion,
  where: SQL
): Promise<number> {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(${table.position})` })
    .from(table)
    .where(where);
  return row?.max == null ? 0 : Number(row.max) + 1;
}

/* ============================================================
 * History (what blocks a delete)
 * ============================================================ */

async function attemptsWhere(orgId: string, condition: SQL): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(offlineQuizAttempt)
    .innerJoin(offlineQuiz, eq(offlineQuiz.id, offlineQuizAttempt.quizId))
    .where(scoped(offlineQuizAttempt.organizationId, orgId, eq(offlineQuiz.organizationId, orgId), condition));
  return Number(row?.n ?? 0);
}

async function progressWhere(orgId: string, condition: SQL): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(offlineTopicProgress)
    .innerJoin(offlineTopic, eq(offlineTopic.id, offlineTopicProgress.topicId))
    .innerJoin(offlineLesson, eq(offlineLesson.id, offlineTopic.lessonId))
    .where(
      scoped(
        offlineTopicProgress.organizationId,
        orgId,
        eq(offlineTopic.organizationId, orgId),
        eq(offlineLesson.organizationId, orgId),
        condition
      )
    );
  return Number(row?.n ?? 0);
}

/** Active or revoked: a revoked recognition is still the record of who decided what. */
async function recognitionsWhere(orgId: string, condition: SQL): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(offlineRecognition)
    .where(scoped(offlineRecognition.organizationId, orgId, condition));
  return Number(row?.n ?? 0);
}

const noHistory: HistoryCounts = { attempts: 0, progress: 0 };

/* ============================================================
 * Reordering
 * ============================================================ */

type OrderedTable = typeof offlineLesson | typeof offlineTopic | typeof offlineQuiz | typeof offlineQuestion;

/**
 * Validates `ids` against the current children (exactly them, no duplicate)
 * and then writes position = index, only where it changed.
 */
async function reorder(
  orgId: string,
  table: OrderedTable,
  parentColumn: PgColumn,
  parentId: string,
  ids: string[]
): Promise<EditorResult<{ ids: string[] }>> {
  const db = getDb();
  const current = await db
    .select({ id: table.id, position: table.position })
    .from(table)
    .where(scoped(table.organizationId, orgId, eq(parentColumn, parentId)));
  const error = validateReorder(
    current.map((r) => r.id),
    ids
  );
  if (error) return error;

  const positionOf = new Map(current.map((r) => [r.id, r.position]));
  for (const [position, id] of ids.entries()) {
    if (positionOf.get(id) === position) continue;
    await db
      .update(table)
      .set({ position, updatedAt: now() })
      .where(scoped(table.organizationId, orgId, eq(table.id, id)));
  }
  return ok({ ids });
}

/* ============================================================
 * Courses
 * ============================================================ */

async function takenSlugs(orgId: string, exceptCourseId?: string): Promise<string[]> {
  const rows = await getDb()
    .select({ slug: offlineCourse.slug })
    .from(offlineCourse)
    .where(scoped(offlineCourse.organizationId, orgId, exceptCourseId ? ne(offlineCourse.id, exceptCourseId) : undefined));
  return rows.map((r) => r.slug);
}

export async function createCourse(orgId: string, body: CourseBody): Promise<EditorResult<{ id: string; slug: string }>> {
  const id = newId("offlineCourse");
  const slug = uniqueSlug(body.title, await takenSlugs(orgId));
  await getDb().insert(offlineCourse).values({
    id,
    organizationId: orgId,
    legacyRef: null,
    title: body.title,
    slug,
    descriptionMd: body.descriptionMd ?? "",
    status: body.status ?? "draft",
  });
  return ok({ id, slug });
}

/** The slug stays as it was: it is an identifier, renaming the course does not move it. */
export async function updateCourse(
  orgId: string,
  courseId: string,
  patch: CoursePatch
): Promise<EditorResult<{ id: string }>> {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  await getDb()
    .update(offlineCourse)
    .set({ ...patch, updatedAt: now() })
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)));
  return ok({ id: courseId });
}

/** Blocked (409) with any attempt, progress or recognition below it; otherwise everything cascades. */
export async function deleteCourse(orgId: string, courseId: string): Promise<EditorResult<{ id: string }>> {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  const blocked = deleteGuard("course", {
    attempts: await attemptsWhere(orgId, eq(offlineQuiz.courseId, courseId)),
    progress: await progressWhere(orgId, eq(offlineLesson.courseId, courseId)),
    recognitions: await recognitionsWhere(orgId, eq(offlineRecognition.courseId, courseId)),
  });
  if (blocked) return blocked;
  await getDb().delete(offlineCourse).where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)));
  return ok({ id: courseId });
}

export type ThumbnailFile = { mimeType: string; sizeBytes: number; fileName: string; data: Buffer };

/**
 * Same storage as every other upload (a `media_asset` + the file in
 * `MEDIA_DIR/<org>/<assetId>`, like the importer's thumbnails), and the same
 * image limits as the inbox (jpeg/png/webp, 5 MB). The thumbnail routes
 * (staff and portal) already serve `/api/media/<assetId>` URLs.
 */
export async function setCourseThumbnail(
  orgId: string,
  courseId: string,
  file: ThumbnailFile
): Promise<EditorResult<{ thumbnailUrl: string }>> {
  const limit = MEDIA_LIMITS.image;
  if (!limit.mimes.test(file.mimeType) || file.sizeBytes > limit.maxBytes || file.sizeBytes === 0) {
    return invalid("invalid_image", `Se espera una ${limit.label}.`);
  }
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");

  const assetId = newId("mediaAsset");
  const storagePath = await saveMediaFile(orgId, assetId, file.data);
  const db = getDb();
  await db.insert(mediaAsset).values({
    id: assetId,
    organizationId: orgId,
    kind: "image",
    mimeType: file.mimeType,
    fileName: file.fileName.slice(0, 200) || "miniatura",
    fileSize: file.sizeBytes,
    storagePath,
    fetchStatus: "available",
  });
  const thumbnailUrl = `/api/media/${assetId}`;
  await db
    .update(offlineCourse)
    .set({ thumbnailUrl, updatedAt: now() })
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)));
  return ok({ thumbnailUrl });
}

export async function clearCourseThumbnail(orgId: string, courseId: string): Promise<EditorResult<{ id: string }>> {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  await getDb()
    .update(offlineCourse)
    .set({ thumbnailUrl: null, updatedAt: now() })
    .where(scoped(offlineCourse.organizationId, orgId, eq(offlineCourse.id, courseId)));
  return ok({ id: courseId });
}

/* ============================================================
 * Lessons
 * ============================================================ */

export async function createLesson(
  orgId: string,
  courseId: string,
  body: LessonBody
): Promise<EditorResult<{ id: string; position: number }>> {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  const id = newId("offlineLesson");
  const position = await nextPosition(
    offlineLesson,
    scoped(offlineLesson.organizationId, orgId, eq(offlineLesson.courseId, courseId))
  );
  await getDb().insert(offlineLesson).values({
    id,
    organizationId: orgId,
    courseId,
    legacyRef: null,
    title: body.title,
    contentMd: body.contentMd ?? "",
    position,
  });
  return ok({ id, position });
}

export async function updateLesson(
  orgId: string,
  courseId: string,
  lessonId: string,
  patch: LessonPatch
): Promise<EditorResult<{ id: string }>> {
  if (!(await lessonOf(orgId, courseId, lessonId))) return notFound("Lección no encontrada");
  await getDb()
    .update(offlineLesson)
    .set({ ...patch, updatedAt: now() })
    .where(scoped(offlineLesson.organizationId, orgId, eq(offlineLesson.id, lessonId)));
  return ok({ id: lessonId });
}

/** Blocked by progress on any of its topics. Its quizzes stay (course-level, `set null`). */
export async function deleteLesson(
  orgId: string,
  courseId: string,
  lessonId: string
): Promise<EditorResult<{ id: string }>> {
  if (!(await lessonOf(orgId, courseId, lessonId))) return notFound("Lección no encontrada");
  const blocked = deleteGuard("lesson", {
    ...noHistory,
    progress: await progressWhere(orgId, eq(offlineLesson.id, lessonId)),
    recognitions: await recognitionsWhere(orgId, eq(offlineRecognition.lessonId, lessonId)),
  });
  if (blocked) return blocked;
  await getDb().delete(offlineLesson).where(scoped(offlineLesson.organizationId, orgId, eq(offlineLesson.id, lessonId)));
  return ok({ id: lessonId });
}

export async function reorderLessons(orgId: string, courseId: string, ids: string[]) {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  return reorder(orgId, offlineLesson, offlineLesson.courseId, courseId, ids);
}

/* ============================================================
 * Topics
 * ============================================================ */

export async function createTopic(
  orgId: string,
  courseId: string,
  lessonId: string,
  body: TopicBody
): Promise<EditorResult<{ id: string; position: number }>> {
  if (!(await lessonOf(orgId, courseId, lessonId))) return notFound("Lección no encontrada");
  const video = normalizeVideoUrl(body.videoUrl);
  if (!video.ok) return video;
  const id = newId("offlineTopic");
  const position = await nextPosition(
    offlineTopic,
    scoped(offlineTopic.organizationId, orgId, eq(offlineTopic.lessonId, lessonId))
  );
  await getDb().insert(offlineTopic).values({
    id,
    organizationId: orgId,
    lessonId,
    legacyRef: null,
    title: body.title,
    contentMd: body.contentMd ?? "",
    videoUrl: video.data,
    videoShown: body.videoShown ?? "after",
    position,
  });
  return ok({ id, position });
}

/**
 * `lessonId` moves the topic to another lesson OF THE SAME COURSE, at its end.
 * Progress rows follow the topic (they point at its id), so a completed topic
 * stays completed wherever it lands.
 */
export async function updateTopic(
  orgId: string,
  courseId: string,
  topicId: string,
  patch: TopicPatch
): Promise<EditorResult<{ id: string; lessonId: string }>> {
  const topic = await topicOf(orgId, courseId, topicId);
  if (!topic) return notFound("Tema no encontrado");

  const { lessonId: targetLessonId, videoUrl, ...fields } = patch;
  const set: Partial<typeof offlineTopic.$inferInsert> = { ...fields };
  if (videoUrl !== undefined) {
    const video = normalizeVideoUrl(videoUrl);
    if (!video.ok) return video;
    set.videoUrl = video.data;
  }
  if (targetLessonId !== undefined && targetLessonId !== topic.lessonId) {
    if (!(await lessonOf(orgId, courseId, targetLessonId))) {
      return invalid("invalid_lesson", "La lección de destino no es de este curso.");
    }
    set.lessonId = targetLessonId;
    set.position = await nextPosition(
      offlineTopic,
      scoped(offlineTopic.organizationId, orgId, eq(offlineTopic.lessonId, targetLessonId))
    );
  }

  await getDb()
    .update(offlineTopic)
    .set({ ...set, updatedAt: now() })
    .where(scoped(offlineTopic.organizationId, orgId, eq(offlineTopic.id, topicId)));
  return ok({ id: topicId, lessonId: set.lessonId ?? topic.lessonId });
}

export async function deleteTopic(orgId: string, courseId: string, topicId: string): Promise<EditorResult<{ id: string }>> {
  if (!(await topicOf(orgId, courseId, topicId))) return notFound("Tema no encontrado");
  const blocked = deleteGuard("topic", {
    ...noHistory,
    progress: await progressWhere(orgId, eq(offlineTopic.id, topicId)),
  });
  if (blocked) return blocked;
  await getDb().delete(offlineTopic).where(scoped(offlineTopic.organizationId, orgId, eq(offlineTopic.id, topicId)));
  return ok({ id: topicId });
}

export async function reorderTopics(orgId: string, courseId: string, lessonId: string, ids: string[]) {
  if (!(await lessonOf(orgId, courseId, lessonId))) return notFound("Lección no encontrada");
  return reorder(orgId, offlineTopic, offlineTopic.lessonId, lessonId, ids);
}

/* ============================================================
 * Quizzes
 * ============================================================ */

/** A quiz may hang from a lesson, but only one of its own course. */
async function checkQuizLesson(orgId: string, courseId: string, lessonId: string | null | undefined) {
  if (lessonId == null) return null;
  return (await lessonOf(orgId, courseId, lessonId))
    ? null
    : invalid("invalid_lesson", "La lección elegida no es de este curso.");
}

export async function createQuiz(
  orgId: string,
  courseId: string,
  body: QuizBody
): Promise<EditorResult<{ id: string; position: number }>> {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  const lessonError = await checkQuizLesson(orgId, courseId, body.lessonId);
  if (lessonError) return lessonError;
  const id = newId("offlineQuiz");
  const position = await nextPosition(offlineQuiz, scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.courseId, courseId)));
  await getDb().insert(offlineQuiz).values({
    id,
    organizationId: orgId,
    courseId,
    lessonId: body.lessonId ?? null,
    legacyRef: null,
    title: body.title,
    descriptionMd: body.descriptionMd ?? "",
    passingPercentage: body.passingPercentage ?? 80,
    retriesAllowed: body.retriesAllowed ?? null,
    position,
  });
  return ok({ id, position });
}

/**
 * Allowed even with attempts: each attempt keeps its own score, passed flag
 * and answer snapshot, so editing the quiz does not rewrite anybody's history.
 */
export async function updateQuiz(
  orgId: string,
  courseId: string,
  quizId: string,
  patch: QuizPatch
): Promise<EditorResult<{ id: string }>> {
  if (!(await quizOf(orgId, courseId, quizId))) return notFound("Cuestionario no encontrado");
  const lessonError = await checkQuizLesson(orgId, courseId, patch.lessonId);
  if (lessonError) return lessonError;
  await getDb()
    .update(offlineQuiz)
    .set({ ...patch, updatedAt: now() })
    .where(scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.id, quizId)));
  return ok({ id: quizId });
}

export async function deleteQuiz(orgId: string, courseId: string, quizId: string): Promise<EditorResult<{ id: string }>> {
  if (!(await quizOf(orgId, courseId, quizId))) return notFound("Cuestionario no encontrado");
  const blocked = deleteGuard("quiz", {
    ...noHistory,
    attempts: await attemptsWhere(orgId, eq(offlineQuiz.id, quizId)),
  });
  if (blocked) return blocked;
  await getDb().delete(offlineQuiz).where(scoped(offlineQuiz.organizationId, orgId, eq(offlineQuiz.id, quizId)));
  return ok({ id: quizId });
}

export async function reorderQuizzes(orgId: string, courseId: string, ids: string[]) {
  if (!(await courseExists(orgId, courseId))) return notFound("Curso no encontrado");
  return reorder(orgId, offlineQuiz, offlineQuiz.courseId, courseId, ids);
}

/* ============================================================
 * Questions + answers
 * ============================================================ */

async function answersOf(orgId: string, questionId: string) {
  return getDb()
    .select({ id: offlineAnswer.id, isCorrect: offlineAnswer.isCorrect })
    .from(offlineAnswer)
    .where(scoped(offlineAnswer.organizationId, orgId, eq(offlineAnswer.questionId, questionId)))
    .orderBy(asc(offlineAnswer.position));
}

export async function createQuestion(
  orgId: string,
  courseId: string,
  quizId: string,
  body: QuestionBody
): Promise<EditorResult<{ id: string; position: number }>> {
  if (!(await quizOf(orgId, courseId, quizId))) return notFound("Cuestionario no encontrado");
  const answersError = validateAnswerSet(body.answerType, body.answers);
  if (answersError) return answersError;
  if (body.answers.some((a) => a.id !== undefined)) {
    return invalid("invalid_answers", "Una pregunta nueva no puede traer respuestas existentes.");
  }

  const db = getDb();
  const id = newId("offlineQuestion");
  const position = await nextPosition(
    offlineQuestion,
    scoped(offlineQuestion.organizationId, orgId, eq(offlineQuestion.quizId, quizId))
  );
  await db.insert(offlineQuestion).values({
    id,
    organizationId: orgId,
    quizId,
    legacyRef: null,
    questionMd: body.questionMd,
    answerType: body.answerType,
    points: body.points ?? 1,
    position,
  });
  await db.insert(offlineAnswer).values(
    body.answers.map((a, index) => ({
      id: newId("offlineAnswer"),
      organizationId: orgId,
      questionId: id,
      legacyRef: null,
      text: a.text,
      isCorrect: a.isCorrect,
      position: index,
    }))
  );
  return ok({ id, position });
}

/**
 * `answers`, when present, REPLACES the set (see `planAnswerSet`). The final
 * (type, answers) pair is validated as a whole BEFORE writing: switching a
 * question to "single" while it has two correct answers is refused even if
 * the body only changed the type.
 */
export async function updateQuestion(
  orgId: string,
  courseId: string,
  quizId: string,
  questionId: string,
  patch: QuestionPatch
): Promise<EditorResult<{ id: string }>> {
  if (!(await quizOf(orgId, courseId, quizId))) return notFound("Cuestionario no encontrado");
  const question = await questionOf(orgId, quizId, questionId);
  if (!question) return notFound("Pregunta no encontrada");

  const existing = await answersOf(orgId, questionId);
  const finalType = patch.answerType ?? question.answerType;
  const answersError = validateAnswerSet(finalType, patch.answers ?? existing);
  if (answersError) return answersError;
  const plan = patch.answers
    ? planAnswerSet(
        existing.map((a) => a.id),
        patch.answers
      )
    : null;
  if (plan && !plan.ok) return plan;

  const db = getDb();
  const { answers: _answers, ...fields } = patch;
  await db
    .update(offlineQuestion)
    .set({ ...fields, updatedAt: now() })
    .where(scoped(offlineQuestion.organizationId, orgId, eq(offlineQuestion.id, questionId)));

  if (plan) {
    const { update, insert, remove } = plan.data;
    if (remove.length > 0) {
      await db
        .delete(offlineAnswer)
        .where(scoped(offlineAnswer.organizationId, orgId, eq(offlineAnswer.questionId, questionId), inArray(offlineAnswer.id, remove)));
    }
    for (const a of update) {
      await db
        .update(offlineAnswer)
        .set({ text: a.text, isCorrect: a.isCorrect, position: a.position, updatedAt: now() })
        .where(scoped(offlineAnswer.organizationId, orgId, and(eq(offlineAnswer.id, a.id), eq(offlineAnswer.questionId, questionId))));
    }
    if (insert.length > 0) {
      await db.insert(offlineAnswer).values(
        insert.map((a) => ({
          id: newId("offlineAnswer"),
          organizationId: orgId,
          questionId,
          legacyRef: null,
          text: a.text,
          isCorrect: a.isCorrect,
          position: a.position,
        }))
      );
    }
  }
  return ok({ id: questionId });
}

/** Not guarded: attempts keep the question text and chosen answers in their snapshot. */
export async function deleteQuestion(
  orgId: string,
  courseId: string,
  quizId: string,
  questionId: string
): Promise<EditorResult<{ id: string }>> {
  if (!(await quizOf(orgId, courseId, quizId))) return notFound("Cuestionario no encontrado");
  if (!(await questionOf(orgId, quizId, questionId))) return notFound("Pregunta no encontrada");
  await getDb()
    .delete(offlineQuestion)
    .where(scoped(offlineQuestion.organizationId, orgId, eq(offlineQuestion.id, questionId)));
  return ok({ id: questionId });
}

export async function reorderQuestions(orgId: string, courseId: string, quizId: string, ids: string[]) {
  if (!(await quizOf(orgId, courseId, quizId))) return notFound("Cuestionario no encontrado");
  return reorder(orgId, offlineQuestion, offlineQuestion.quizId, quizId, ids);
}
