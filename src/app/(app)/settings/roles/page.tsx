import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { RolesClient } from "@/components/settings/roles-client";

export const dynamic = "force-dynamic";

/**
 * 012 — Roles y capacidades, editables sin deploy.
 *
 * 023 — Gate propio: `settings/layout.tsx` deja pasar con
 * `configuracion.editar` **o** `accesos.gestionar`, pero toda la API de roles
 * exige `configuracion.editar`. Quien entre solo con `accesos.gestionar` veía
 * la pantalla vacía y un error al guardar, sin entender por qué.
 */
export default async function RolesSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("configuracion.editar")) {
    redirect("/settings");
  }

  return <RolesClient />;
}
