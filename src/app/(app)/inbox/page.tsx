import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { InboxClient } from "@/components/inbox/inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  // Inscribir desde el contacto — la capacidad se resuelve en el servidor y
  // baja como booleano; el panel de detalles solo decide si dibuja el botón.
  const session = await getSessionOrNull();
  const canEnroll = session
    ? sessionCapabilities(session).includes("inscripciones.editar")
    : false;
  return <InboxClient canEnroll={canEnroll} />;
}
