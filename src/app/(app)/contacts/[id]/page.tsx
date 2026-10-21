import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 2026-10-21 — La ficha del contacto ES su legajo.
 *
 * `/contacts/[id]` no existía y la enlazan el correo de "nuevo interesado"
 * (`src/lib/lead-notices.ts`) y la pantalla de Facturación: los dos daban
 * 404. Esta ruta redirige en vez de duplicar la pantalla, y así sigue
 * funcionando para los correos que ya se mandaron. El permiso lo exige el
 * legajo, no esta redirección.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/contacts/${encodeURIComponent(id)}/legajo`);
}
