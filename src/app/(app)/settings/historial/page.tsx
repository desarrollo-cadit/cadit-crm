import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listarImportaciones } from "@/server/historial-import";
import { HistorialImportClient } from "@/components/settings/historial-import-client";

export const dynamic = "force-dynamic";

/**
 * 046 US6 — Configuración › Importar historial: la planilla de cursadas
 * 2020–2024. Gate propio con `historial.importar`, la misma capacidad que
 * exigen las rutas `/api/historial/importaciones*` (por defecto, solo
 * Dirección).
 */
export default async function HistorialImportPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("historial.importar")) redirect("/settings");

  const importaciones = await withTenantTransaction(
    { organizationId: session.organizationId, userId: session.userId },
    () => listarImportaciones(session.organizationId)
  );

  return <HistorialImportClient initial={importaciones} />;
}
