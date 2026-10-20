import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { AreasClient } from "@/components/settings/areas-client";

export const dynamic = "force-dynamic";

/**
 * 029 (US4) + 039 — Configuración › Áreas: casilla y copias de Ventas, Soporte,
 * Administración y Nuevos interesados, y el interruptor de la derivación del agente.
 *
 * Gate propio con `areas.configurar`, la misma capacidad que exigen las rutas
 * `/api/settings/areas*`: la puerta del layout acepta varias capacidades y no
 * alcanza para decidir esta pantalla.
 */
export default async function AreasSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("areas.configurar")) redirect("/settings");

  return <AreasClient />;
}
