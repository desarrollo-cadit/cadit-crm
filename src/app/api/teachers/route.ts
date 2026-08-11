import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { createTeacher, listTeachers } from "@/server/teachers";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const teachers = await listTeachers(session.organizationId);
  return Response.json({ teachers });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const id = await createTeacher(session.organizationId, { name: body.data.name });
  return Response.json(
    { teacher: { id, name: body.data.name, hourlyRate: null, courseIds: [] } },
    { status: 201 }
  );
});
