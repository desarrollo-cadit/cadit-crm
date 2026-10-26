import { StudentCourseClient } from "@/components/portal/student-course-client";
import { PESTANAS_PORTAL_CURSADA } from "@/lib/pestanas";

export const dynamic = "force-dynamic";

/**
 * 015 (US1, US3, US4) — Una cursada del alumno, en detalle.
 *
 * 2026-10-26 — `?tab=modulos|clases|evaluaciones|material|avisos` abre en esa
 * pestaña. Si no vino o no se conoce, `null`: la de arranque depende de los
 * datos (módulos o clases) y la decide el cliente.
 */
export default async function StudentCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const pedida = PESTANAS_PORTAL_CURSADA.find((p) => p === tab) ?? null;
  return <StudentCourseClient enrollmentId={id} initialTab={pedida} />;
}
