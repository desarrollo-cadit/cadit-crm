import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { enrollmentCourseStates } from "./access";
import { planRecognition, type RecognitionRequest } from "./logic";

/**
 * cursos-offline — Recognizing what a student completed in the previous
 * academy: a whole course or some of its lessons, always with a reason.
 *
 * A recognition is its OWN record. Nothing here writes topic progress or quiz
 * attempts (guarded in `tests/unit/cursos-offline-reconocimiento.test.ts`):
 * those keep meaning "what the student did here", and completion is derived
 * from both (`courseProgressState`). Revoking sets `revoked_at` and leaves
 * real progress exactly as it was.
 *
 * Recognitions belong to the CONTACT, like progress, so they follow the
 * person across enrollments. Staff reaches them through an enrollment, and
 * the course must be one that enrollment reads — the same rule as the
 * one-topic override (`staffCompleteTopic`).
 *
 * Every check runs BEFORE the first write: an error Response does not roll
 * back the tenant transaction.
 */

export type RecognitionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

const { offlineRecognition, offlineLesson, enrollment, user } = schema;

const ENROLLMENT_NOT_FOUND = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Inscripción no encontrada",
} as const;

async function enrollmentContact(orgId: string, enrollmentId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ contactId: enrollment.contactId })
    .from(enrollment)
    .where(scoped(enrollment.organizationId, orgId, eq(enrollment.id, enrollmentId)))
    .limit(1);
  return row?.contactId ?? null;
}

async function activeFor(orgId: string, contactId: string, courseId: string) {
  return getDb()
    .select({ lessonId: offlineRecognition.lessonId })
    .from(offlineRecognition)
    .where(
      scoped(
        offlineRecognition.organizationId,
        orgId,
        eq(offlineRecognition.contactId, contactId),
        eq(offlineRecognition.courseId, courseId),
        isNull(offlineRecognition.revokedAt)
      )
    );
}

/**
 * Recognizes the course or the chosen lessons for the enrollment's student.
 * Idempotent: what an active recognition already covers is not written again
 * (`planRecognition`), and the partial unique indexes absorb a concurrent
 * duplicate (`onConflictDoNothing`, so the transaction is not aborted).
 */
export async function recognizeForEnrollment(
  orgId: string,
  enrollmentId: string,
  request: RecognitionRequest,
  userId: string
): Promise<RecognitionResult<{ created: number }>> {
  const contactId = await enrollmentContact(orgId, enrollmentId);
  if (!contactId) return ENROLLMENT_NOT_FOUND;

  const states = (await enrollmentCourseStates(orgId, enrollmentId)) ?? [];
  const reads = states.some(
    (c) => c.courseId === request.courseId && (c.state === "inherited" || c.state === "granted")
  );
  if (!reads) {
    return {
      ok: false,
      status: 422,
      code: "course_not_assigned",
      message: "El alumno no tiene acceso a este curso offline",
    };
  }

  const lessons = await getDb()
    .select({ id: offlineLesson.id })
    .from(offlineLesson)
    .where(scoped(offlineLesson.organizationId, orgId, eq(offlineLesson.courseId, request.courseId)))
    .orderBy(asc(offlineLesson.position));

  const plan = planRecognition(
    request,
    lessons.map((l) => l.id),
    await activeFor(orgId, contactId, request.courseId)
  );
  if (!plan.ok) return plan;
  if (plan.lessonIds.length === 0) return { ok: true, data: { created: 0 } };

  const inserted = await getDb()
    .insert(offlineRecognition)
    .values(
      plan.lessonIds.map((lessonId) => ({
        id: newId("offlineRecognition"),
        organizationId: orgId,
        contactId,
        courseId: request.courseId,
        lessonId,
        reason: request.reason,
        recognizedBy: userId,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: offlineRecognition.id });
  return { ok: true, data: { created: inserted.length } };
}

/**
 * Revokes one recognition of the enrollment's student. A recognition of
 * someone else answers 404 like one that does not exist. Revoking twice is a
 * no-op that keeps the first revocation's author and date.
 */
export async function revokeRecognition(
  orgId: string,
  enrollmentId: string,
  recognitionId: string,
  userId: string
): Promise<RecognitionResult<{ revoked: true }>> {
  const contactId = await enrollmentContact(orgId, enrollmentId);
  if (!contactId) return ENROLLMENT_NOT_FOUND;

  const [row] = await getDb()
    .select({ id: offlineRecognition.id })
    .from(offlineRecognition)
    .where(
      scoped(
        offlineRecognition.organizationId,
        orgId,
        eq(offlineRecognition.id, recognitionId),
        eq(offlineRecognition.contactId, contactId)
      )
    )
    .limit(1);
  if (!row) return { ok: false, status: 404, code: "not_found", message: "Reconocimiento no encontrado" };

  await getDb()
    .update(offlineRecognition)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(
      scoped(
        offlineRecognition.organizationId,
        orgId,
        and(eq(offlineRecognition.id, row.id), isNull(offlineRecognition.revokedAt))
      )
    );
  return { ok: true, data: { revoked: true } };
}

export type StaffRecognition = {
  id: string;
  /** `null` = the whole course. */
  lessonId: string | null;
  reason: string;
  recognizedByName: string | null;
  recognizedAt: string;
};

/** STAFF read: the active recognitions per course, with the reason and who recognized them. */
export async function recognitionDetailsFor(
  orgId: string,
  contactId: string,
  courseIds: string[]
): Promise<Map<string, StaffRecognition[]>> {
  const out = new Map<string, StaffRecognition[]>(courseIds.map((id) => [id, []]));
  if (courseIds.length === 0) return out;
  const rows = await getDb()
    .select({
      id: offlineRecognition.id,
      courseId: offlineRecognition.courseId,
      lessonId: offlineRecognition.lessonId,
      reason: offlineRecognition.reason,
      recognizedAt: offlineRecognition.recognizedAt,
      recognizedByName: user.name,
    })
    .from(offlineRecognition)
    .leftJoin(user, eq(user.id, offlineRecognition.recognizedBy))
    .where(
      scoped(
        offlineRecognition.organizationId,
        orgId,
        eq(offlineRecognition.contactId, contactId),
        inArray(offlineRecognition.courseId, courseIds),
        isNull(offlineRecognition.revokedAt)
      )
    )
    .orderBy(asc(offlineRecognition.recognizedAt));
  for (const r of rows) {
    out.get(r.courseId)?.push({
      id: r.id,
      lessonId: r.lessonId,
      reason: r.reason,
      recognizedByName: r.recognizedByName ?? null,
      recognizedAt: r.recognizedAt.toISOString(),
    });
  }
  return out;
}
