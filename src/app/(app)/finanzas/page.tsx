import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { FinanzasClient } from "@/components/finanzas/finanzas-client";

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
export default async function FinanzasPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("cobranza.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto">
      <FinanzasClient />
    </div>
  );
}
