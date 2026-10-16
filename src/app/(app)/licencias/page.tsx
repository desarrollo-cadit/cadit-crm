import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { LicensesView } from "@/components/licenses/licenses-view";

export const dynamic = "force-dynamic";

/**
 * 035 (US3) — Licencias por programa. Gate en el servidor y no solo en el
 * menú: un enlace oculto sigue siendo una URL que se puede escribir a mano.
 * Desasignar se ofrece sólo con `academico.editar`, la capacidad de la ruta.
 */
export default async function LicenciasPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("academico.ver")) redirect("/");
  return <LicensesView canEdit={caps.includes("academico.editar")} />;
}
