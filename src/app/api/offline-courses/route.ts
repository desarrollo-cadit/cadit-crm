import { requireCapability } from "@/lib/api";
import { listCourses } from "@/server/offline-courses/library";

export const dynamic = "force-dynamic";

/** cursos-offline (T4) — The library, for staff: titles, status and counts. */
export const GET = requireCapability("academico.ver", async (session) => {
  const courses = await listCourses(session.organizationId);
  return Response.json({ courses });
});
