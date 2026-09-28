import { parseBody, requireCapability } from "@/lib/api";
import { courseBodySchema } from "@/server/offline-courses/editor-logic";
import { createCourse, editorResponse } from "@/server/offline-courses/editor";
import { listCourses } from "@/server/offline-courses/library";

export const dynamic = "force-dynamic";

/** cursos-offline (T4) — The library, for staff: titles, status and counts. */
export const GET = requireCapability("academico.ver", async (session) => {
  const courses = await listCourses(session.organizationId);
  return Response.json({ courses });
});

/** T11 — New course (draft unless said otherwise). → 201 `{ id, slug }`. */
export const POST = requireCapability("academico.editar", async (session, req: Request) => {
  const body = await parseBody(req, courseBodySchema);
  if (!body.ok) return body.response;
  return editorResponse(await createCourse(session.organizationId, body.data), 201);
});
