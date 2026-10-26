import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { FinanzasClient } from "@/components/finanzas/finanzas-client";
import { leerPestana } from "@/lib/tab-param";
import { PESTANAS_FINANZAS } from "@/lib/pestanas";

export const dynamic = "force-dynamic";

/**
 * 026 (FR-006/FR-009) — El cierre contable del mes, en una sola pantalla.
 *
 * Hasta acá la cobranza se operaba DENTRO del roster de cada cohorte. Para
 * armar el cierre de un mes, administración tenía que abrir las 41 cohortes de
 * a una y anotar a mano lo que encontrara en cada una.
 *
 * Gate en el servidor y no sólo en el menú: esconder el enlace no protege una
 * URL que se puede tipear. El endpoint tiene su propio `requireCapability`;
 * esto decide qué VE la persona, y tiene que decir lo mismo.
 *
 * Toda la superficie es de STAFF: no aparece en ningún portal ni se expone
 * bajo `/api/portal/`.
 */
export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("cobranza.ver")) redirect("/");
  const { tab } = await searchParams;

  return (
    <div className="h-full overflow-y-auto">
      <FinanzasClient initialTab={leerPestana(tab, PESTANAS_FINANZAS, "caja")} />
    </div>
  );
}
