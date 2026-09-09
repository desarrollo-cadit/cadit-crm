import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { CargaRapidaClient } from "@/components/settings/carga-rapida-client";

export const dynamic = "force-dynamic";

/**
 * 011 — Lo que falta cargar para que la gestión esté completa.
 *
 * 023 — Gate propio, y no alcanza con el de `settings/layout.tsx`.
 *
 * Ese layout deja pasar a quien tenga `configuracion.editar` **o**
 * `accesos.gestionar`, pero esta pantalla escribe contra
 * `/api/settings/carga-rapida`, que exige `academico.editar` — una capacidad
 * DISTINTA. Alguien con `accesos.gestionar` y sin `academico.editar` entraba,
 * cargaba, y recibía un 403 recién al guardar.
 *
 * Es lo que `app-nav.tsx` llama "una puerta cerrada con cartel de bienvenida",
 * y enseña a desconfiar de lo que muestra la pantalla. La regla del repo es
 * que lo que se VE y lo que el servidor PERMITE digan lo mismo.
 */
export default async function CargaRapidaPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("academico.editar")) redirect("/settings");

  return <CargaRapidaClient />;
}
