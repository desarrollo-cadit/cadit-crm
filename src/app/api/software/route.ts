import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { createSoftware, listSoftware, serializeSoftware } from "@/server/software";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "academico.ver",
  async (session) => {
  const rows = await listSoftware(session.organizationId);
  return Response.json({ software: rows.map(serializeSoftware) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** 0089 — Compatibilidad: el cupo en el equipo por defecto. El cupo real es por equipo. */
  totalLicenses: z.number().int().min(0).optional(),
});

// 005 — catálogo básico (nombre). 0089: el cupo se carga por equipo en
// `/api/license-teams/[id]/seats`.
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
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
      },
    },
    { status: 201 }
  );
});
