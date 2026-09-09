import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const capabilities = sessionCapabilities(session);

  /**
   * 012 (T029) — Quien no puede configurar NI gestionar accesos no entra a
   * esta sección. El corte va acá, en el servidor, y no solo escondiendo el
   * enlace del menú: un enlace oculto sigue siendo una URL que se puede
   * escribir a mano.
   *
   * Las rutas de API tienen su propio `requireCapability`, así que esto es la
   * segunda red — pero es la que decide qué VE la persona, y por eso importa
   * que sea consistente con lo que el servidor le va a permitir.
   */
  const puedeEntrar =
    capabilities.includes("configuracion.editar") ||
    capabilities.includes("accesos.gestionar");
  if (!puedeEntrar) redirect("/");

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h2 className="font-semibold">Configuración</h2>
      </header>
      <div className="flex min-h-0 flex-1">
        <SettingsNav capabilities={capabilities} />
        <div className="min-w-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
