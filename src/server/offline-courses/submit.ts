import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { effectiveAccessByEnrollment } from "./access";
import { attemptsRemaining, canAttempt, gradeQuiz, type QuizSubmission } from "./logic";
import { buildAnswersGiven, pickAttemptEnrollment } from "./portal-logic";

/**
 * cursos-offline (T5) — The student's one write: submitting a quiz attempt.
 *
 * It lives outside `student.ts` (read-only by test) for the same reason
 * `estudianteEntregar` lives outside `student-portal.ts`. This is the ONLY
 * place that reads `isCorrect` on behalf of a student, and what leaves it is
 * score, passed and attempts — never which questions were right.
 *
 * Everything is checked BEFORE the insert: an error Response does not roll
 * back the tenant transaction, so there must be nothing to roll back. The
 * insert itself uses `onConflictDoNothing` on (quiz, contact, attempt_number)
 * instead of catching the unique violation: a failed statement would leave
 * the request's transaction aborted, while "nothing inserted" is a normal
 * answer that becomes a 409.
 */

export type SubmitAttemptResult =
  | {
      ok: true;
      data: {
        scorePercentage: number;
        passed: boolean;
        attemptNumber: number;
        /** `null` = unlimited. */
        attemptsRemaining: number | null;
      };
    }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

const NOT_FOUND = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "Cuestionario no encontrado",
} as const;

export async function submitAttempt(
  orgId: string,
  contactId: string,
  courseId: string,
  quizId: string,
  submission: QuizSubmission
): Promise<SubmitAttemptResult> {
  // Access: the same rule as the reads — a course the person cannot read and
  // a quiz that does not exist answer the same 404.
  const enrollments = await effectiveAccessByEnrollment(orgId, contactId);
  const enrollmentId = pickAttemptEnrollment(enrollments, courseId);
  if (!enrollmentId) return NOT_FOUND;

  const db = getDb();
  const {
    offlineCourse,
    offlineQuiz,
    offlineQuestion,
    offlineAnswer,
    offlineQuizAttempt,
  } = schema;

  const [quiz] = await db
    .select({
      id: offlineQuiz.id,
      passingPercentage: offlineQuiz.passingPercentage,
      retriesAllowed: offlineQuiz.retriesAllowed,
    })
    .from(offlineQuiz)
    .innerJoin(offlineCourse, eq(offlineCourse.id, offlineQuiz.courseId))
    .where(
      scoped(
        offlineQuiz.organizationId,
        orgId,
        eq(offlineQuiz.id, quizId),
        eq(offlineQuiz.courseId, courseId),
        eq(offlineCourse.status, "published")
      )
    )
    .limit(1);
  if (!quiz) return NOT_FOUND;

  // Counted per CONTACT, across enrollments. The next number comes from the
  // highest one taken: if an old row went away with its enrollment, `count`
  // alone could point at a number that still exists and fail forever.
  const [used] = await db
    .select({ n: count(), last: max(offlineQuizAttempt.attemptNumber) })
    .from(offlineQuizAttempt)
    .where(
      scoped(
        offlineQuizAttempt.organizationId,
        orgId,
        and(eq(offlineQuizAttempt.quizId, quizId), eq(offlineQuizAttempt.contactId, contactId))
      )
    );
  const attemptsUsed = Number(used?.n ?? 0);
  if (!canAttempt(quiz.retriesAllowed, attemptsUsed)) {
    return {
      ok: false,
      status: 409,
      code: "attempts_exhausted",
      message: "Ya no quedan intentos para este cuestionario",
    };
  }

  const questions = await db
    .select({
      id: offlineQuestion.id,
      questionMd: offlineQuestion.questionMd,
      answerType: offlineQuestion.answerType,
      points: offlineQuestion.points,
    })
    .from(offlineQuestion)
    .where(scoped(offlineQuestion.organizationId, orgId, eq(offlineQuestion.quizId, quizId)))
    .orderBy(asc(offlineQuestion.position));
  if (questions.length === 0) {
    // gradeQuiz would answer 0 / not passed; storing it would spend an
    // attempt on bad data.
    return { ok: false, status: 422, code: "quiz_empty", message: "El cuestionario no tiene preguntas" };
  }

  const answers = await db
    .select({
      id: offlineAnswer.id,
      questionId: offlineAnswer.questionId,
      text: offlineAnswer.text,
      isCorrect: offlineAnswer.isCorrect,
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
    .orderBy(asc(offlineAnswer.position));

  const withAnswers = questions.map((q) => ({
    ...q,
    answers: answers.filter((a) => a.questionId === q.id),
  }));
  const given = submission.answers;
  const grade = gradeQuiz(withAnswers, given, quiz.passingPercentage);
  const attemptNumber = Math.max(attemptsUsed, used?.last ?? 0) + 1;

  const inserted = await db
    .insert(offlineQuizAttempt)
    .values({
      id: newId("offlineQuizAttempt"),
      organizationId: orgId,
      quizId,
      enrollmentId,
      contactId,
      attemptNumber,
      scorePercentage: grade.scorePercentage.toFixed(2),
      passed: grade.passed,
      answersGiven: buildAnswersGiven(withAnswers, given),
    })
    .onConflictDoNothing()
    .returning({ id: offlineQuizAttempt.id });

  if (inserted.length === 0) {
    // Another submission of the same person took this attempt number first.
    return {
      ok: false,
      status: 409,
      code: "attempt_conflict",
      message: "Se registró otro envío al mismo tiempo. Recargá la página para ver el resultado.",
    };
  }

  return {
    ok: true,
    data: {
      scorePercentage: grade.scorePercentage,
      passed: grade.passed,
      attemptNumber,
      attemptsRemaining: attemptsRemaining(quiz.retriesAllowed, attemptsUsed + 1),
    },
  };
}
