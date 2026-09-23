import { z } from "zod";
import { httpUrl } from "@/lib/url-schema";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { createVirtualRoom, listVirtualRooms } from "@/server/virtual-rooms";

export const dynamic = "force-dynamic";

/** Solo el literal "1" enciende las archivadas: cualquier otra cosa es un error. */
const listQuerySchema = z.object({ includeArchived: z.literal("1").optional() });

/**
 * 023 (US1) — Las aulas virtuales de la academia.
 *
 * `academico.ver` y no `configuracion.editar` para leer: coordinación arma el
 * cronograma y necesita saber qué aulas hay, sin poder tocar la configuración
 * de la instancia.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, req: Request) => {
    /*
      023 US5 — `?includeArchived=1` trae también las dadas de baja.

      Lo pide la pantalla de clases, y por un motivo concreto: un aula
      archivada no se OFRECE —el servidor rechaza asignarla—, pero la clase que
      ya la tenía asignada tiene que poder NOMBRARLA. Sin ellas en la lista esa
      fila quedaría en blanco, borrando el único rastro de dónde se dictó, que
      es justo la evidencia que la baja lógica existe para conservar (FR-009).
    */
    const query = listQuerySchema.safeParse({
      includeArchived: new URL(req.url).searchParams.get("includeArchived") ?? undefined,
    });
    if (!query.success) {
      return apiError(422, "invalid_query", "includeArchived solo acepta el valor 1.");
    }
    const includeArchived = query.data.includeArchived === "1";
    const rooms = await listVirtualRooms(session.organizationId, { includeArchived });
    return Response.json({ rooms });
  }
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: httpUrl,
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
