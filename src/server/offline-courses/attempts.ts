import { desc, eq, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";

/**
 * cursos-offline (T4) — Attempt history, STAFF read side.
 *
 * Score and passed only. The answers snapshot (`answers_given`) stays in the
 * database: the history screens answer "how did they do", and the snapshot
 * exists so that answer survives a re-import, not to be browsed.
 */

export type OfflineAttemptRow = {
  attemptId: string;
  quizTitle: string;
  courseTitle: string;
  attemptNumber: number;
  scorePercentage: number;
  passed: boolean;
  createdAt: string;
  enrollmentId: string;
  studentName?: string;
};

const { offlineQuizAttempt, offlineQuiz, offlineCourse, enrollment, contact } = schema;

async function attemptsWhere(orgId: string, condition: SQL, withStudent: boolean) {
  const rows = await getDb()
    .select({
      attemptId: offlineQuizAttempt.id,
      quizTitle: offlineQuiz.title,
      courseTitle: offlineCourse.title,
      attemptNumber: offlineQuizAttempt.attemptNumber,
      scorePercentage: offlineQuizAttempt.scorePercentage,
      passed: offlineQuizAttempt.passed,
      createdAt: offlineQuizAttempt.createdAt,
      enrollmentId: offlineQuizAttempt.enrollmentId,
      firstName: contact.firstName,
      lastName: contact.lastName,
    })
    .from(offlineQuizAttempt)
    .innerJoin(offlineQuiz, eq(offlineQuiz.id, offlineQuizAttempt.quizId))
    .innerJoin(offlineCourse, eq(offlineCourse.id, offlineQuiz.courseId))
    .innerJoin(enrollment, eq(enrollment.id, offlineQuizAttempt.enrollmentId))
    .innerJoin(contact, eq(contact.id, offlineQuizAttempt.contactId))
    .where(scoped(offlineQuizAttempt.organizationId, orgId, condition))
    .orderBy(desc(offlineQuizAttempt.createdAt));

  return rows.map(
    ({ firstName, lastName, scorePercentage, createdAt, ...r }): OfflineAttemptRow => ({
      ...r,
      scorePercentage: Number(scorePercentage),
      createdAt: createdAt.toISOString(),
      ...(withStudent ? { studentName: fullName({ firstName, lastName }) } : {}),
    })
  );
}

export function attemptsForEnrollment(orgId: string, enrollmentId: string) {
  return attemptsWhere(orgId, eq(offlineQuizAttempt.enrollmentId, enrollmentId), false);
}

/** Every attempt made through an enrollment of this cohort, newest first. */
export function attemptsForCohort(orgId: string, cohortId: string) {
  return attemptsWhere(orgId, eq(enrollment.cohortId, cohortId), true);
}
