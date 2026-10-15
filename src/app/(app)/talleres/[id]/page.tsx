import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { WorkshopDetailClient } from "@/components/workshops/workshop-detail-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 033 (US2/US3) — Una edición de taller y su lista de inscriptos.
 *
 * Las capacidades llegan como booleanos para decidir qué botones se dibujan;
 * lo que de verdad protege es la ruta de la API, y el estado de pago ni
 * siquiera viaja sin `cobranza.ver`.
 */
export default async function TallerPage({ params }: Props) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const capabilities = sessionCapabilities(session);
  if (!capabilities.includes("academico.ver")) redirect("/");
  const { id } = await params;

  return (
    <div className="h-full overflow-y-auto">
      <WorkshopDetailClient
        editionId={id}
        canEdit={capabilities.includes("academico.editar")}
        canEditAttendees={capabilities.includes("inscripciones.editar")}
        canSeeBilling={capabilities.includes("cobranza.ver")}
      />
    </div>
  );
}
