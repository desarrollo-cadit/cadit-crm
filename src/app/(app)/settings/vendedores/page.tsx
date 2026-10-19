import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { SellersClient } from "@/components/settings/sellers-client";

export const dynamic = "force-dynamic";

/**
 * 2026-10-06 — Vendedores: alta, edición y archivo.
 *
 * Gate propio con `inscripciones.editar`, la misma capacidad que exige la API
 * (`/api/sellers`): la puerta del layout acepta varias capacidades y no
 * alcanza para decidir esta pantalla.
 */
export default async function SellersSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("inscripciones.editar")) redirect("/settings");

  // 040 (US3) — "Dar acceso al panel" crea una cuenta del equipo: `accesos.gestionar`.
  return <SellersClient canGrantAccount={caps.includes("accesos.gestionar")} />;
}
