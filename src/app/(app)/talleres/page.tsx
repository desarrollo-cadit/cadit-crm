import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { WorkshopsClient } from "@/components/workshops/workshops-client";

export const dynamic = "force-dynamic";

/**
 * 033 (FR-001) — La sección Talleres.
 *
 * Gate en el servidor y no solo en el menú: un enlace oculto sigue siendo una
 * URL que se puede escribir a mano. Las rutas tienen su propio
 * `requireCapability`; esto decide qué VE la persona, y dice lo mismo.
 */
export default async function TalleresPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const capabilities = sessionCapabilities(session);
  if (!capabilities.includes("academico.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto">
      <WorkshopsClient canEdit={capabilities.includes("academico.editar")} />
    </div>
  );
}
