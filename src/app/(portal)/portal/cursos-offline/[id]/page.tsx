import { StudentOfflineCourseClient } from "@/components/portal/student-offline-courses";

export const dynamic = "force-dynamic";

/** cursos-offline (T5) — One offline course: lessons, topics and quizzes. */
export default async function StudentOfflineCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentOfflineCourseClient courseId={id} />;
}
