import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { RecessManager } from "@/components/academic/recess-manager";

export const dynamic = "force-dynamic";

/**
 * 034 (US2, FR-006) — Configuración › Recesos: los días sin clase de TODA la
 * academia ("Receso de verano: 15/12 al 31/01").
 *
 * `academico.editar`, la misma capacidad que exigen `POST/DELETE
 * /api/recesses` y la que genera el cronograma: cargar un receso borra clases
 * del cronograma. Los recesos de UNA cohorte se cargan desde su pestaña Clases.
 */
export default async function RecesosPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("academico.editar")) redirect("/settings");

  return (
    <div className="max-w-3xl">
      <RecessManager canEdit />
    </div>
  );
}
