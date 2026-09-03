import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { createVirtualRoom, listVirtualRooms } from "@/server/virtual-rooms";

export const dynamic = "force-dynamic";

/**
 * 023 (US1) — Las aulas virtuales de la academia.
 *
 * `academico.ver` y no `configuracion.editar` para leer: coordinación arma el
 * cronograma y necesita saber qué aulas hay, sin poder tocar la configuración
 * de la instancia.
 */
export const GET = requireCapability("academico.ver", async (session) => {
  const rooms = await listVirtualRooms(session.organizationId);
  return Response.json({ rooms });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().url(),
  accountEmail: z.string().trim().email().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
    const body = await parseBody(req, createSchema);
    if (!body.ok) return body.response;

    const result = await createVirtualRoom(session.organizationId, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ room: result.data }, { status: 201 });
  }
);
