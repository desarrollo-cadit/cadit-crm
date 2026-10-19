import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { FacturacionClient } from "@/components/facturacion/facturacion-client";

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
export default async function FacturacionPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("cobranza.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto">
      <FacturacionClient puedeFacturar={caps.includes("facturacion.editar")} />
    </div>
  );
}
