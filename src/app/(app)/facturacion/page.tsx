import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { FacturacionClient } from "@/components/facturacion/facturacion-client";
import { leerPestana } from "@/lib/tab-param";
import { PESTANAS_FACTURACION } from "@/lib/pestanas";

export const dynamic = "force-dynamic";

/**
 * 042 — Las ventas que faltan facturar.
 *
 * `cobranza.ver`, como el menú y como `GET /api/facturacion`: cada fila lleva
 * el monto pactado. Registrar el número desde la fila pide además
 * `facturacion.editar`; sin ella la pantalla es de lectura y no ofrece
 * botones que devolverían 403.
 *
 * Gate en el servidor y no sólo en el menú: esconder el enlace no protege una
 * URL que se puede tipear.
 */
export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; grupo?: string | string[] }>;
}) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("cobranza.ver")) redirect("/");
  const { tab, grupo } = await searchParams;
  // 2026-10-26 — `?grupo=<id>` abre filtrada por ese grupo (el enlace de
  // "Para resolver hoy"). Un valor raro o repetido se ignora.
  const grupoInicial = typeof grupo === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(grupo) ? grupo : null;

  return (
    <div className="h-full overflow-y-auto">
      <FacturacionClient
        puedeFacturar={caps.includes("facturacion.editar")}
        initialTab={leerPestana(tab, PESTANAS_FACTURACION, "pendientes")}
        initialCohortId={grupoInicial}
      />
    </div>
  );
}
