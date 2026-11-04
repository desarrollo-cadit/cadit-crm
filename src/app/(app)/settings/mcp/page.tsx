import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listarTokens, rolesLigables } from "@/server/mcp/tokens";
import { McpTokensClient } from "@/components/settings/mcp-tokens-client";

export const dynamic = "force-dynamic";

/**
 * 0092/0095 — Configuración › Conexión con Claude: los tokens con los que una
 * persona del equipo conecta Claude a esta instancia (`/api/mcp`), de persona o
 * ligados a un rol (un perfil).
 *
 * Gate propio con `accesos.gestionar`, la misma capacidad que exigen las rutas
 * `/api/settings/mcp-tokens*`. Nunca viaja el hash ni el valor de un token ya
 * emitido: solo los últimos cuatro caracteres.
 */
export default async function McpSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("accesos.gestionar")) redirect("/settings");

  const { tokens, roles } = await withTenantTransaction(
    { organizationId: session.organizationId, userId: session.userId },
    async () => ({
      tokens: await listarTokens(session.organizationId),
      roles: await rolesLigables(session.organizationId, sessionCapabilities(session)),
    })
  );

  return (
    <McpTokensClient
      initial={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        last4: t.last4,
        roleId: t.roleId,
        roleName: t.roleName,
        userName: t.userName,
        userEmail: t.userEmail,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        revokedAt: t.revokedAt?.toISOString() ?? null,
      }))}
      initialRoles={roles.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
