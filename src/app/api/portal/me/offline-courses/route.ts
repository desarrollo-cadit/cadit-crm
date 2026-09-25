import { requireStudentPortal } from "@/lib/portal-api";
import { myCourses } from "@/server/offline-courses/student";

export const dynamic = "force-dynamic";

/** cursos-offline (T5) — The library courses this student can read, with progress. */
export const GET = requireStudentPortal(async (ctx) => {
  const courses = await myCourses(ctx.organizationId, ctx.contactId);
  return Response.json({ courses });
});
