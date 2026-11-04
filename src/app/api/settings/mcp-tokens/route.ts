import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import {
  emitirToken,
  listarTokens,
  rolesLigables,
  validarRolParaToken,
} from "@/server/mcp/tokens";

export const dynamic = "force-dynamic";

const emitirSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /**
   * 0095 — Ligar el token a un rol (un token por perfil). Ausente o `null` =
   * token de persona: usa el rol de quien lo emite.
   */
  roleId: z.string().trim().min(1).max(100).nullish(),
});

/**
 * 0092/0095 — Los tokens del MCP remoto de la organización. Nunca devuelve el
 * hash ni el valor: solo los últimos cuatro caracteres, para reconocerlos.
 * Devuelve también los roles a los que quien mira puede ligar un token nuevo
 * (`roles`): la pantalla no ofrece lo que el servidor va a rechazar.
 *
 * `accesos.gestionar` porque un token es una forma de entrar (la misma puerta
 * que el alta del equipo). La lista de capacidades es cerrada, así que no se
 * inventó una nueva.
 */
export const GET = requireCapability("accesos.gestionar", async (session) => {
  const [tokens, roles] = await Promise.all([
    listarTokens(session.organizationId),
    rolesLigables(session.organizationId, sessionCapabilities(session)),
  ]);
  return Response.json({
    tokens,
    roles: roles.map((r) => ({ id: r.id, name: r.name })),
  });
});

/**
 * Emite un token A NOMBRE DE QUIEN LO PIDE. Sin `roleId` hereda su rol; con
 * `roleId` es un token de PERFIL con las capacidades de ese rol, y solo se
 * puede ligar a un rol cuyas capacidades quien emite ya tiene (403
 * `escalation`, la misma regla que el alta de Equipo): nadie obtiene por esta
 * vía más de lo que puede hacer hoy. La respuesta trae el valor en claro UNA
 * vez; no hay forma de volver a verlo.
 */
export const POST = requireCapability("accesos.gestionar", async (session, req: Request) => {
  const body = await parseBody(req, emitirSchema);
  if (!body.ok) return body.response;

  let rol: { id: string; name: string } | null = null;
  if (body.data.roleId) {
    const validado = await validarRolParaToken(
      session.organizationId,
      body.data.roleId,
      sessionCapabilities(session)
    );
    if (!validado.ok) return apiError(validado.status, validado.code, validado.message);
    rol = validado.data;
  }

  const emitido = await emitirToken(
    session.organizationId,
    session.userId,
    body.data.name,
    rol?.id ?? null
  );
  return Response.json(
    {
      token: {
        id: emitido.id,
        name: emitido.name,
        last4: emitido.last4,
        createdAt: emitido.createdAt,
        roleId: rol?.id ?? null,
        roleName: rol?.name ?? null,
      },
      // Se muestra una sola vez; en la base queda únicamente su hash.
      value: emitido.token,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
});
