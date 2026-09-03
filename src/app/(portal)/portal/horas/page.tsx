import { PortalHoursClient } from "@/components/portal/portal-hours-client";

export const dynamic = "force-dynamic";

/**
 * 014 (T030) — Mis horas dictadas.
 *
 * 021 — Se le sacó el "volver": con barra lateral, un enlace de vuelta arriba
 * de cada pantalla es una segunda navegación que compite con la primera.
 */
export default function PortalHoursPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Mis horas dictadas</h1>
      <PortalHoursClient />
    </div>
  );
}
