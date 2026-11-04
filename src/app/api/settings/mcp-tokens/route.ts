import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { emitirToken, listarTokens } from "@/server/mcp/tokens";

export const dynamic = "force-dynamic";

const emitirSchema = z.object({ name: z.string().trim().min(1).max(80) });

/**
 * 0092 — Los tokens del MCP remoto de la organización. Nunca devuelve el hash
 * ni el valor: solo los últimos cuatro caracteres, para reconocerlos.
 *
 * `accesos.gestionar` porque un token es una forma de entrar (la misma puerta
 * que el alta del equipo). La lista de capacidades es cerrada, así que no se
 * inventó una nueva en este corte.
 */
export const GET = requireCapability("accesos.gestionar", async (session) => {
  return Response.json({ tokens: await listarTokens(session.organizationId) });
});

/**
 * Emite un token A NOMBRE DE QUIEN LO PIDE: no se puede emitir uno para otra
 * persona, así que nadie obtiene capacidades que no tiene. La respuesta trae
 * el valor en claro UNA vez; no hay forma de volver a verlo.
 */
export const POST = requireCapability("accesos.gestionar", async (session, req: Request) => {
  const body = await parseBody(req, emitirSchema);
  if (!body.ok) return body.response;

  const emitido = await emitirToken(session.organizationId, session.userId, body.data.name);
  return Response.json(
    {
      token: {
        id: emitido.id,
        name: emitido.name,
        last4: emitido.last4,
        createdAt: emitido.createdAt,
      },
      // Se muestra una sola vez; en la base queda únicamente su hash.
      value: emitido.token,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
});
