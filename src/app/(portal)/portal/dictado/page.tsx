import { PortalCohortsClient } from "@/components/portal/portal-cohorts-client";

export const dynamic = "force-dynamic";

/**
 * 014 (T024) / 021 — Las camadas del profesor.
 *
 * Vivía en `/portal` hasta que el portal pasó a tener dos audiencias. El
 * contenido no cambió: cambió que ahora tiene una dirección propia, y que se
 * llega por la barra lateral en vez de por ser la única pantalla que había.
 */
export default function PortalDictadoPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Mis camadas</h1>
      <PortalCohortsClient />
    </div>
  );
}
