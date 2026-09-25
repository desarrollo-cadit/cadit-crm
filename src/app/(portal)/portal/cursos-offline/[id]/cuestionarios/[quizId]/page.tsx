import { StudentOfflineQuizClient } from "@/components/portal/student-offline-quiz";

export const dynamic = "force-dynamic";

/** cursos-offline (T5) — Taking a quiz: form, result and own attempts. */
export default async function StudentOfflineQuizPage({
  params,
}: {
  params: Promise<{ id: string; quizId: string }>;
}) {
  const { id, quizId } = await params;
  return <StudentOfflineQuizClient courseId={id} quizId={quizId} />;
}
