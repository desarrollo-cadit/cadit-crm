import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { leerPestana } from "@/lib/tab-param";
import { PESTANAS_LICENCIAS } from "@/lib/pestanas";
import { LicensesView } from "@/components/licenses/licenses-view";

export const dynamic = "force-dynamic";

/**
 * 035 (US3) — Licencias por programa. Gate en el servidor y no solo en el
 * menú: un enlace oculto sigue siendo una URL que se puede escribir a mano.
 * El catálogo (alta y edición de programas) sigue con `academico.editar`.
 * Desasignar se ofrece sólo con `licencias.gestionar` (2026-10-26: es de
 * soporte), la capacidad de la ruta.
 *
 * 0089 — `?tab=programas|conciliacion`. La conciliación con Autodesk se opera
 * con `licencias.gestionar`; se ve con `academico.ver`, y las personas y
 * correos solo con `contactos.ver` (lo decide también el servidor).
 */
export default async function LicenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ tab }, session] = await Promise.all([searchParams, getSessionOrNull()]);
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("academico.ver")) redirect("/");
  return (
    <LicensesView
      canEdit={caps.includes("academico.editar")}
      canManage={caps.includes("licencias.gestionar")}
      initialTab={leerPestana(tab, PESTANAS_LICENCIAS, "programas")}
    />
  );
}
