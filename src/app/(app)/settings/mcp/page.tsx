import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listarTokens } from "@/server/mcp/tokens";
import { McpTokensClient } from "@/components/settings/mcp-tokens-client";

export const dynamic = "force-dynamic";

/**
 * 0092 — Configuración › Conexión con Claude: los tokens con los que una
 * persona del equipo conecta Claude a esta instancia (`/api/mcp`).
 *
 * Gate propio con `accesos.gestionar`, la misma capacidad que exigen las rutas
 * `/api/settings/mcp-tokens*`. Nunca viaja el hash ni el valor de un token ya
 * emitido: solo los últimos cuatro caracteres.
 */
export default async function McpSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("accesos.gestionar")) redirect("/settings");

  const tokens = await withTenantTransaction(
    { organizationId: session.organizationId, userId: session.userId },
    () => listarTokens(session.organizationId)
  );

  return (
    <McpTokensClient
      initial={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        last4: t.last4,
        userName: t.userName,
        userEmail: t.userEmail,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        revokedAt: t.revokedAt?.toISOString() ?? null,
      }))}
    />
  );
}
