import { StudentCourseClient } from "@/components/portal/student-course-client";

export const dynamic = "force-dynamic";

/** 015 (US1, US3, US4) — Una cursada del alumno, en detalle. */
export default async function StudentCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentCourseClient enrollmentId={id} />;
}
