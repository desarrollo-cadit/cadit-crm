import { asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import {
  sanitizeCapabilities,
  sessionCapabilities,
  type Capability,
} from "@/lib/capabilities";
import { hashDeToken, nuevoToken, pareceTokenMcp } from "@/lib/mcp-token";
import { resolveMembership } from "@/server/auth/on-signup";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { escalationError, type RolesResult } from "@/server/roles";

/**
 * 0092/0095 — Los tokens del MCP remoto: emitir, listar, revocar y, sobre todo,
 * resolver "¿quién es este token?".
 *
 * Un token no lleva capacidades propias: se resuelven al usarlo.
 *
 *  - **Token de persona** (`role_id` nulo): las del rol de su dueña, con la
 *    MISMA regla que la sesión (`resolveMembership` + `sessionCapabilities`),
 *    así que un cambio de rol o sacarla del equipo se nota en el pedido
 *    siguiente, sin revocar nada.
 *  - **Token de perfil** (`role_id`): las de ESE rol y nada más. Quien lo emitió
 *    (`user_id`) tiene que seguir en el equipo, y solo pudo ligarlo a un rol
 *    cuyas capacidades ya tiene (`escalationError`, la regla del alta de
 *    Equipo). Si el rol cambia, el token lo sigue; si se borra, el token se
 *    borra con él (cascada) y deja de servir: nunca cae a algo más amplio.
 */

export type ContextoMcp = {
  tokenId: string;
  organizationId: string;
  userId: string;
  capacidades: readonly Capability[];
};

/** `last_used_at` no se escribe en cada pedido: con un minuto de margen alcanza. */
const MARGEN_DE_USO_MS = 60_000;

/**
 * Del token en claro a la persona que lo tiene, o `null` si no sirve (mal
 * formado, desconocido, revocado, o su dueña ya no está en el equipo).
 *
 * Es el único camino que entra SIN sesión y SIN saber de antemano de qué
 * organización es el pedido, y por eso no es una excepción a RLS: igual que
 * `/api/bot/*`, resuelve la organización única de la instancia y busca el hash
 * DENTRO de su alcance. `mcp_token` conserva su política `tenant_isolation`.
 */
export async function resolverToken(
  token: string,
  now: Date = new Date()
): Promise<ContextoMcp | null> {
  if (!pareceTokenMcp(token)) return null;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return null;

  return withOrganizationScope(organizationId, "system:mcp-auth", async () => {
    const db = getDb();
    const filas = await db
      .select({
        id: schema.mcpToken.id,
        userId: schema.mcpToken.userId,
        roleId: schema.mcpToken.roleId,
        lastUsedAt: schema.mcpToken.lastUsedAt,
      })
      .from(schema.mcpToken)
      .where(
        scoped(
          schema.mcpToken.organizationId,
          organizationId,
          eq(schema.mcpToken.tokenHash, hashDeToken(token)),
          isNull(schema.mcpToken.revokedAt)
        )
      )
      .limit(1);
    const fila = filas[0];
    if (!fila) return null;

    // Quien lo emitió tiene que seguir en el equipo, sea token de persona o de perfil.
    const membresia = await resolveMembership(fila.userId);
    if (!membresia || membresia.organizationId !== organizationId) return null;

    let capacidades: readonly Capability[];
    if (fila.roleId) {
      // Perfil: las capacidades del rol, leídas ahora. Sin el rol, no hay token.
      const roles = await db
        .select({ capabilities: schema.role.capabilities })
        .from(schema.role)
        .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, fila.roleId)))
        .limit(1);
      const rol = roles[0];
      if (!rol) return null;
      capacidades = sanitizeCapabilities(rol.capabilities);
    } else {
      capacidades = sessionCapabilities({
        role: membresia.role,
        // `capabilities` es jsonb: lo que no está en la lista cerrada no entra.
        capabilities:
          membresia.capabilities == null
            ? undefined
            : sanitizeCapabilities(membresia.capabilities),
      });
    }

    if (!fila.lastUsedAt || now.getTime() - fila.lastUsedAt.getTime() > MARGEN_DE_USO_MS) {
      await db
        .update(schema.mcpToken)
        .set({ lastUsedAt: now })
        .where(scoped(schema.mcpToken.organizationId, organizationId, eq(schema.mcpToken.id, fila.id)));
    }

    return { tokenId: fila.id, organizationId, userId: fila.userId, capacidades };
  });
}

export type TokenEmitido = {
  id: string;
  name: string;
  last4: string;
  createdAt: Date;
  roleId: string | null;
  /** El valor en claro: esta respuesta es la única vez que existe. */
  token: string;
};

export type RolLigable = { id: string; name: string; capabilities: Capability[] };

/**
 * Los roles REALES de la organización a los que `capacidadesDeQuienEmite`
 * puede ligarle un token: los que no tienen nada que ella no tenga. Una
 * organización sin roles sembrados no ofrece ninguno (los de código no son
 * filas con id): ahí quedan los tokens de persona.
 */
export async function rolesLigables(
  organizationId: string,
  capacidadesDeQuienEmite: readonly Capability[]
): Promise<RolLigable[]> {
  const filas = await getDb()
    .select({
      id: schema.role.id,
      name: schema.role.name,
      capabilities: schema.role.capabilities,
    })
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId))
    .orderBy(asc(schema.role.name));
  return filas
    .map((f) => ({ id: f.id, name: f.name, capabilities: sanitizeCapabilities(f.capabilities) }))
    .filter((r) => escalationError(r.capabilities, capacidadesDeQuienEmite) === null);
}

/**
 * ¿Puede quien emite ligar un token a este rol? 404 si no existe en la
 * organización, 403 `escalation` si el rol puede algo que ella no puede.
 */
export async function validarRolParaToken(
  organizationId: string,
  roleId: string,
  capacidadesDeQuienEmite: readonly Capability[]
): Promise<RolesResult<{ id: string; name: string }>> {
  const filas = await getDb()
    .select({
      id: schema.role.id,
      name: schema.role.name,
      capabilities: schema.role.capabilities,
    })
    .from(schema.role)
    .where(scoped(schema.role.organizationId, organizationId, eq(schema.role.id, roleId)))
    .limit(1);
  const rol = filas[0];
  if (!rol) return { ok: false, status: 404, code: "not_found", message: "Rol no encontrado" };

  const escalada = escalationError(sanitizeCapabilities(rol.capabilities), capacidadesDeQuienEmite);
  if (escalada) return escalada;
  return { ok: true, data: { id: rol.id, name: rol.name } };
}

/**
 * Emite un token a nombre de `userId` (quien lo pide). Con `roleId` es un token
 * de perfil: el llamador YA validó el rol con `validarRolParaToken`. Corre
 * dentro del alcance del pedido.
 */
export async function emitirToken(
  organizationId: string,
  userId: string,
  name: string,
  roleId: string | null = null
): Promise<TokenEmitido> {
  const nuevo = nuevoToken();
  const id = newId("mcpToken");
  const createdAt = new Date();
  await getDb().insert(schema.mcpToken).values({
    id,
    organizationId,
    userId,
    roleId,
    name,
    tokenHash: nuevo.hash,
    last4: nuevo.last4,
    createdAt,
  });
  return { id, name, last4: nuevo.last4, createdAt, token: nuevo.token, roleId };
}

export type TokenListado = {
  id: string;
  name: string;
  last4: string;
  /** `null` = token de persona. */
  roleId: string | null;
  roleName: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

/** Los tokens de la organización, los vigentes primero. Nunca el hash ni el valor. */
export async function listarTokens(organizationId: string): Promise<TokenListado[]> {
  const filas = await getDb()
    .select({
      id: schema.mcpToken.id,
      name: schema.mcpToken.name,
      last4: schema.mcpToken.last4,
      roleId: schema.mcpToken.roleId,
      roleName: schema.role.name,
      userId: schema.mcpToken.userId,
      userName: schema.user.name,
      userEmail: schema.user.email,
      createdAt: schema.mcpToken.createdAt,
      lastUsedAt: schema.mcpToken.lastUsedAt,
      revokedAt: schema.mcpToken.revokedAt,
    })
    .from(schema.mcpToken)
    .innerJoin(schema.user, eq(schema.mcpToken.userId, schema.user.id))
    .leftJoin(schema.role, eq(schema.mcpToken.roleId, schema.role.id))
    .where(scoped(schema.mcpToken.organizationId, organizationId))
    .orderBy(desc(schema.mcpToken.createdAt));
  return [...filas].sort((a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null));
}

/** Revoca (marca, no borra). `false` si no existe en la organización o ya estaba revocado. */
export async function revocarToken(organizationId: string, id: string): Promise<boolean> {
  const filas = await getDb()
    .update(schema.mcpToken)
    .set({ revokedAt: new Date() })
    .where(
      scoped(
        schema.mcpToken.organizationId,
        organizationId,
        eq(schema.mcpToken.id, id),
        isNull(schema.mcpToken.revokedAt)
      )
    )
    .returning({ id: schema.mcpToken.id });
  return filas.length > 0;
}
