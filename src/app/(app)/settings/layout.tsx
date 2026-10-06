import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { primerDestinoDeSettings } from "@/lib/nav";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const capabilities = sessionCapabilities(session);

  /**
   * 012 (T029) — Quien no puede abrir ninguna pestaña no entra a esta
   * sección. Desde 2026-10-06 se DERIVA de `SETTINGS_TABS` (Vendedores pide
   * `inscripciones.editar`, una tercera capacidad): una lista escrita a mano
   * acá dejaría afuera a quien la barra le muestra una pestaña. El corte va acá, en el servidor, y no solo escondiendo el
   * enlace del menú: un enlace oculto sigue siendo una URL que se puede
   * escribir a mano.
   *
   * Las rutas de API tienen su propio `requireCapability`, así que esto es la
   * segunda red — pero es la que decide qué VE la persona, y por eso importa
   * que sea consistente con lo que el servidor le va a permitir.
   */
  if (primerDestinoDeSettings(capabilities) === null) redirect("/");

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
