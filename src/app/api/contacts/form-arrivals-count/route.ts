import { withAuth } from "@/lib/api";
import { countRecentFormArrivals } from "@/server/intake-forms";

export const dynamic = "force-dynamic";

/**
 * 005 iteración 3 — conteo de contactos llegados por formulario en las
 * últimas 48 h, para el badge del ícono "Contactos" del sidebar (mismo
 * patrón que el badge de no-leídos de "Bandeja" en app-nav.tsx — expuesto
 * acá para que se conecte ahí sin tocar ese archivo).
 */
export const GET = withAuth(async (session) => {
  const count = await countRecentFormArrivals(session.organizationId);
  return Response.json({ count });
});
