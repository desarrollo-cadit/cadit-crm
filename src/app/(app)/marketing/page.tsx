import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

/**
 * 045 — Marketing: audiencias y campañas por correo a los contactos propios.
 * Gate en el servidor con `marketing.ver`: esconder el ítem del menú no
 * protege una URL que se puede tipear.
 */
export default async function MarketingPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("marketing.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">Marketing</h1>
      <p className="text-sm text-muted-foreground">Todavía no hay campañas.</p>
    </div>
  );
}
