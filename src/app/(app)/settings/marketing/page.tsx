import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { marketingSettingsDto } from "@/server/marketing/settings";
import { MarketingSettingsClient } from "@/components/settings/marketing-settings-client";

export const dynamic = "force-dynamic";

/**
 * 045 (US5) — Configuración › Marketing: el buzón de marketing (separado del
 * de los correos de los cursos), el remitente y el pie de las campañas.
 *
 * Gate propio con `marketing.configurar`, la misma capacidad que exigen las
 * rutas `/api/settings/marketing*`. La credencial de M365 no viaja: el DTO
 * solo dice si está configurada.
 */
export default async function MarketingSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("marketing.configurar")) redirect("/settings");

  const settings = await withTenantTransaction(
    { organizationId: session.organizationId, userId: session.userId },
    () => marketingSettingsDto(session.organizationId)
  );

  return <MarketingSettingsClient initial={settings} />;
}
