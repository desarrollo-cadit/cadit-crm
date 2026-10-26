import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { leerPestana } from "@/lib/tab-param";
import { FILTRO_POR_PESTANA_DE_CONTACTOS, PESTANAS_CONTACTOS } from "@/lib/pestanas";
import { ContactsClient } from "@/components/contacts/contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  // Inscribir desde el contacto — "Inscribir alumno" (contacto nuevo + cohorte)
  // se dibuja solo con `inscripciones.editar`, resuelta en el servidor.
  const [{ tab }, session] = await Promise.all([searchParams, getSessionOrNull()]);
  const canEnroll = session
    ? sessionCapabilities(session).includes("inscripciones.editar")
    : false;
  // 2026-10-26 — `?tab=todos|leads|alumnos-activos|exalumnos`.
  const pestana = leerPestana(tab, PESTANAS_CONTACTOS, "todos");
  return (
    <ContactsClient
      canEnroll={canEnroll}
      initialTab={FILTRO_POR_PESTANA_DE_CONTACTOS[pestana]}
    />
  );
}
