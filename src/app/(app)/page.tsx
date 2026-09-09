import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { FinancePanel } from "@/components/dashboard/finance-panel";
import { TodayPanel } from "@/components/dashboard/today-panel";
import { LicenseInventoryPanel } from "@/components/dashboard/license-inventory-panel";
import { OverduePanel } from "@/components/finance/overdue-panel";

export const dynamic = "force-dynamic";

/**
 * 005 (T039, US6) — home de la app. Antes `/` solo redirigía a `/inbox`
 * (`src/app/page.tsx`, ahora eliminado); esa ruta no tenía contenido propio
 * donde "integrar el dashboard financiero" como pide el spec, así que esta
 * fase la convierte en un home real dentro del layout autenticado — ver
 * reporte final de la fase para el detalle de esta decisión. `/inbox` sigue
 * accesible desde el sidebar como antes.
 *
 * Iteración 2 (pedido en vivo del dueño) — suma el widget de licencias
 * disponibles FUERA del `fullAccess`: es información operativa, no
 * financiera, así que también es visible para `role: "soporte"`.
 */
export default async function HomePage() {
  const session = await getSessionOrNull();
  /**
   * 012 (T029) — Se pregunta por la CAPACIDAD, no por el nombre del rol.
   *
   * Antes decía `session?.role !== "soporte"`, y eso ataba la pantalla a un
   * rol puntual: el día que los roles se renombran —que es exactamente lo que
   * hace esta fase— el panel financiero se le abría a quien no debía, sin que
   * fallara nada. Preguntar por `cobranza.ver` sobrevive a cualquier cambio de
   * nombres y respeta lo que la dueña configure desde la pantalla de roles.
   */
  const fullAccess = session
    ? sessionCapabilities(session).includes("cobranza.ver")
    : false;

  const authSession = await getAuth().api.getSession({ headers: await headers() });

  /**
   * 021 — El inicio dejó de abrir con un encabezado que decía "Inicio".
   *
   * Se quitó a propósito: el título de una pantalla que dice el nombre de la
   * pantalla no le informa nada a nadie, y ocupaba la franja más valiosa. En
   * su lugar va el saludo y el día, que es lo que hace que esto se sienta
   * TUYO y no un panel de administración genérico.
   *
   * El orden también cambió: primero qué pasa HOY, después la plata del mes.
   * Lo financiero es importante y no es urgente; las clases de las próximas
   * horas son las dos cosas.
   */
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full flex-1 space-y-6 overflow-y-auto p-6">
        <TodayPanel nombre={authSession?.user.name ?? "que tal"} />

        {fullAccess && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Este mes
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <FinancePanel />
              {/* 008 — la morosidad va junto a las finanzas y con el mismo gate. */}
              <OverduePanel />
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Licencias
          </h2>
          <LicenseInventoryPanel />
        </section>
      </div>
    </div>
  );
}
