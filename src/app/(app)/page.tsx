import { getSessionOrNull } from "@/lib/auth/session";
import { FinancePanel } from "@/components/dashboard/finance-panel";
import { LicenseInventoryPanel } from "@/components/dashboard/license-inventory-panel";

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
  const fullAccess = session?.role !== "soporte";

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h2 className="font-semibold">Inicio</h2>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        {!fullAccess && (
          <p className="mb-4 text-sm text-muted-foreground">
            Bienvenido/a — usá el menú para ir a la bandeja o a tus cohortes.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {fullAccess && <FinancePanel />}
          <LicenseInventoryPanel />
        </div>
      </div>
    </div>
  );
}
