import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { createTeacher, listTeachers } from "@/server/teachers";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "academico.ver",
  async (session) => {
  const teachers = await listTeachers(session.organizationId);
  return Response.json({ teachers });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).nullable().optional(),
  // 023 — Texto libre: los títulos varían por país y por carrera, y una
  // lista cerrada siempre le queda corta a alguien.
  title: z.string().trim().max(80).nullable().optional(),
});

export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const id = await createTeacher(session.organizationId, {
    name: body.data.name,
    email: body.data.email ?? null,
    title: body.data.title ?? null,
  });
  return Response.json(
    {
      teacher: {
        id,
        name: body.data.name,
        hourlyRate: null,
        email: body.data.email ?? null,
        title: body.data.title ?? null,
        courseIds: [],
        hasPhoto: false,
      },
    },
    { status: 201 }
  );
});
