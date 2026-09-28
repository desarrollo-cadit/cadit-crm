import { StudentOfflineTopicClient } from "@/components/portal/student-offline-courses";

export const dynamic = "force-dynamic";

/** cursos-offline (T5) — One topic, with previous/next navigation. */
export default async function StudentOfflineTopicPage({
  params,
}: {
  params: Promise<{ id: string; topicId: string }>;
}) {
  const { id, topicId } = await params;
  return <StudentOfflineTopicClient courseId={id} topicId={topicId} />;
}
