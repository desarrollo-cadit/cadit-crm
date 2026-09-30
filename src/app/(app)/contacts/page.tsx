import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { ContactsClient } from "@/components/contacts/contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  // Inscribir desde el contacto — "Inscribir alumno" (contacto nuevo + cohorte)
  // se dibuja solo con `inscripciones.editar`, resuelta en el servidor.
  const session = await getSessionOrNull();
  const canEnroll = session
    ? sessionCapabilities(session).includes("inscripciones.editar")
    : false;
  return <ContactsClient canEnroll={canEnroll} />;
}
