import { eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { contactsToSnapshot, type RecognitionRef, type SnapshotCandidate } from "./logic";
import { courseOutlines, quizRefsByCourse } from "./outline";

/**
 * Deshabilitar un tema o una lección es reversible, y "curso completado" se
 * DERIVA al leer: si el curso se completó mientras ese tema estaba apagado,
 * volver a encenderlo le quitaría el curso a quien ya lo terminó.
 *
 * `snapshotCompletedContacts` se llama JUSTO ANTES de habilitar (la única
 * operación que puede quitarlo): anota, en `offline_course_completion`, a
 * quienes en ese instante cumplen el curso con los temas como están. Desde
 * entonces su curso queda completado y lo que no hicieron es opcional
 * (`courseProgressState` con `completedBefore`).
 *
 * Una sola lectura en lote por curso, no una por alumno. No hay otra
 * escritura en esa tabla.
 */

const {
  offlineTopic,
  offlineLesson,
  offlineTopicProgress,
  offlineQuizAttempt,
  offlineRecognition,
  offlineCourseCompletion,
} = schema;

const CHUNK = 500;

/** How many people were written down. Runs inside the caller's transaction. */
export async function snapshotCompletedContacts(orgId: string, courseId: string): Promise<number> {
  const db = getDb();

  const [outlines, quizzesByCourse] = await Promise.all([
    courseOutlines(orgId, [courseId]),
    quizRefsByCourse(orgId, [courseId]),
  ]);
  const outline = outlines.get(courseId) ?? { lessons: [], topics: [] };
  const quizzes = quizzesByCourse.get(courseId) ?? [];

  // Candidates are searched over EVERY topic, enabled or not: a superset is
  // harmless, `contactsToSnapshot` decides.
  const everyTopicId = (
    await db
      .select({ id: offlineTopic.id })
      .from(offlineTopic)
      .innerJoin(offlineLesson, eq(offlineLesson.id, offlineTopic.lessonId))
      .where(scoped(offlineTopic.organizationId, orgId, eq(offlineLesson.courseId, courseId)))
  ).map((t) => t.id);
  const quizIds = quizzes.map((q) => q.id);

  const [fromProgress, fromAttempts, fromRecognitions, snapshotRows] = await Promise.all([
    everyTopicId.length
      ? db
          .selectDistinct({ contactId: offlineTopicProgress.contactId })
          .from(offlineTopicProgress)
          .where(
            scoped(
              offlineTopicProgress.organizationId,
              orgId,
              inArray(offlineTopicProgress.topicId, everyTopicId),
              isNotNull(offlineTopicProgress.completedAt)
            )
          )
      : Promise.resolve([]),
    quizIds.length
      ? db
          .selectDistinct({ contactId: offlineQuizAttempt.contactId })
          .from(offlineQuizAttempt)
          .where(
            scoped(
              offlineQuizAttempt.organizationId,
              orgId,
              inArray(offlineQuizAttempt.quizId, quizIds),
              eq(offlineQuizAttempt.passed, true)
            )
          )
      : Promise.resolve([]),
    db
      .selectDistinct({ contactId: offlineRecognition.contactId })
      .from(offlineRecognition)
      .where(
        scoped(
          offlineRecognition.organizationId,
          orgId,
          eq(offlineRecognition.courseId, courseId),
          isNull(offlineRecognition.revokedAt)
        )
      ),
    db
      .select({ contactId: offlineCourseCompletion.contactId })
      .from(offlineCourseCompletion)
      .where(scoped(offlineCourseCompletion.organizationId, orgId, eq(offlineCourseCompletion.courseId, courseId))),
  ]);

  const already = new Set(snapshotRows.map((r) => r.contactId));
  const candidateIds = [
    ...new Set([...fromProgress, ...fromAttempts, ...fromRecognitions].map((r) => r.contactId)),
  ].filter((id) => !already.has(id));
  if (candidateIds.length === 0) return 0;

  const enabledTopicIds = outline.topics.map((t) => t.id);
  const topicsDone = new Map<string, Set<string>>();
  const quizzesPassed = new Map<string, Set<string>>();
  const recognitions = new Map<string, RecognitionRef[]>();
  const into = <V>(map: Map<string, V>, key: string, make: () => V) => {
    let value = map.get(key);
    if (value === undefined) map.set(key, (value = make()));
    return value;
  };

  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const slice = candidateIds.slice(i, i + CHUNK);
    const [progress, attempts, recs] = await Promise.all([
      enabledTopicIds.length
        ? db
            .select({ contactId: offlineTopicProgress.contactId, topicId: offlineTopicProgress.topicId })
            .from(offlineTopicProgress)
            .where(
              scoped(
                offlineTopicProgress.organizationId,
                orgId,
                inArray(offlineTopicProgress.contactId, slice),
                inArray(offlineTopicProgress.topicId, enabledTopicIds),
                isNotNull(offlineTopicProgress.completedAt)
              )
            )
        : Promise.resolve([]),
      quizIds.length
        ? db
            .selectDistinct({ contactId: offlineQuizAttempt.contactId, quizId: offlineQuizAttempt.quizId })
            .from(offlineQuizAttempt)
            .where(
              scoped(
                offlineQuizAttempt.organizationId,
                orgId,
                inArray(offlineQuizAttempt.contactId, slice),
                inArray(offlineQuizAttempt.quizId, quizIds),
                eq(offlineQuizAttempt.passed, true)
              )
            )
        : Promise.resolve([]),
      db
        .select({
          contactId: offlineRecognition.contactId,
          lessonId: offlineRecognition.lessonId,
          revokedAt: offlineRecognition.revokedAt,
        })
        .from(offlineRecognition)
        .where(
          scoped(
            offlineRecognition.organizationId,
            orgId,
            inArray(offlineRecognition.contactId, slice),
            eq(offlineRecognition.courseId, courseId),
            isNull(offlineRecognition.revokedAt)
          )
        ),
    ]);
    for (const r of progress) into(topicsDone, r.contactId, () => new Set<string>()).add(r.topicId);
    for (const r of attempts) into(quizzesPassed, r.contactId, () => new Set<string>()).add(r.quizId);
    for (const r of recs) {
      into(recognitions, r.contactId, () => []).push({ lessonId: r.lessonId, revokedAt: r.revokedAt });
    }
  }

  const candidates: SnapshotCandidate[] = candidateIds.map((contactId) => ({
    contactId,
    completedTopicIds: topicsDone.get(contactId) ?? [],
    passedQuizIds: quizzesPassed.get(contactId) ?? [],
    recognitions: recognitions.get(contactId) ?? [],
  }));
  const toWrite = contactsToSnapshot({
    topics: outline.topics,
    quizzes,
    candidates,
    alreadySnapshot: already,
  });

  for (let i = 0; i < toWrite.length; i += CHUNK) {
    await db
      .insert(offlineCourseCompletion)
      .values(
        toWrite.slice(i, i + CHUNK).map((contactId) => ({
          id: newId("offlineCourseCompletion"),
          organizationId: orgId,
          contactId,
          courseId,
        }))
      )
      .onConflictDoNothing();
  }
  return toWrite.length;
}
