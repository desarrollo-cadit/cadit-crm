import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { ContactsClient } from "@/components/contacts/contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  // Inscribir desde el contacto — "Inscribir alumno" (contacto nuevo + cohorte)
  // se dibuja solo con `inscripciones.editar`, resuelta en el servidor.
  const session = await getSessionOrNull();
  const caps = session ? sessionCapabilities(session) : [];
  // 2026-10-26 — "Unificar con…" en el 409 de duplicado, solo con `contactos.unificar`.
  return (
    <ContactsClient
      canEnroll={caps.includes("inscripciones.editar")}
      canMerge={caps.includes("contactos.unificar")}
    />
  );
}
