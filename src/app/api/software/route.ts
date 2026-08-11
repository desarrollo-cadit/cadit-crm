import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { createSoftware, listSoftware, serializeSoftware } from "@/server/software";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const rows = await listSoftware(session.organizationId);
  return Response.json({ software: rows.map(serializeSoftware) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  totalLicenses: z.number().int().min(0).optional(),
});

// 005 — catálogo básico (nombre, total de licencias). El PATCH que valida
// stock asignado (FR-004) es T031 (US4), fuera de este alcance.
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const id = await createSoftware(session.organizationId, {
    name: body.data.name,
    totalLicenses: body.data.totalLicenses,
  });
  return Response.json(
    {
      software: {
        id,
        name: body.data.name,
        totalLicenses: body.data.totalLicenses ?? 0,
      },
    },
    { status: 201 }
  );
});
