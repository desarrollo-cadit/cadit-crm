import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { createIntakeForm, listIntakeForms } from "@/server/intake-forms";

export const dynamic = "force-dynamic";

/** 005 iteración 3 — CRUD de formularios de captación (settings/forms). */
export const GET = withAuth(async (session) => {
  const forms = await listIntakeForms(session.organizationId);
  return Response.json({ forms });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  courseId: z.string().min(1).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const form = await createIntakeForm(session.organizationId, {
    name: body.data.name,
    courseId: body.data.courseId ?? null,
  });
  return Response.json({ form }, { status: 201 });
});
