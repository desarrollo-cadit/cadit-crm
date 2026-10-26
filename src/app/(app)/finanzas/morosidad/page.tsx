import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { OverduePanel } from "@/components/finance/overdue-panel";

export const dynamic = "force-dynamic";

/**
 * 2026-10-26 — La lista entera de morosidad, con el filtro de atraso mínimo.
 *
 * Vivía en el inicio, a lo ancho; el inicio rediseñado muestra solo las
 * personas con más atraso y trae acá. Cuelga de Finanzas para que el menú
 * encienda ese ítem. `cobranza.ver` en el servidor, igual que el endpoint:
 * esconder el enlace no protege una URL que se puede escribir.
 */
export default async function MorosidadPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("cobranza.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1240px] space-y-4 p-6">
        <Link href="/" className="text-xs font-medium text-brand-text hover:underline">
          ← Volver al inicio
        </Link>
        <OverduePanel />
      </div>
    </div>
  );
}
