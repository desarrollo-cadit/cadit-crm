import { BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { ReportsPanel } from "@/components/dashboard/reports-panel";

export const dynamic = "force-dynamic";

/**
 * 2026-10-26 — Los reportes, en su propia pantalla.
 *
 * Vivían al pie del inicio y lo hacían larguísimo; el inicio quedó para
 * actuar y para el día, y deja una fila que trae acá. Mismo `ReportsPanel` y
 * misma regla: `reportes.ver` (Dirección y Coordinación) en el servidor, y los
 * ingresos por curso los decide el endpoint con `cobranza.ver`.
 */
export default async function ReportesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("reportes.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] space-y-5 p-6">
        <header>
          <h1 className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-5 w-5" aria-hidden />
            Reportes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cursos más vendidos, alumnos por período, empresas, embudo de leads por origen, recompra y
            ventas por año y por vendedor.
          </p>
        </header>
        <ReportsPanel />
      </div>
    </div>
  );
}
