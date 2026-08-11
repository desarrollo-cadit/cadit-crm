import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { createCourse, listCourses } from "@/server/courses";

export const dynamic = "force-dynamic";

// 004/005 (T011) — la función server ya existía de la Fase 1; faltaba la ruta.
export const GET = withAuth(async (session) => {
  const rows = await listCourses(session.organizationId);
  return Response.json({
    courses: rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const id = await createCourse(session.organizationId, {
    name: body.data.name,
    description: body.data.description ?? null,
  });
  return Response.json(
    { course: { id, name: body.data.name, description: body.data.description ?? null } },
    { status: 201 }
  );
});
