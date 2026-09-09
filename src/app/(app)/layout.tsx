import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { resolvePortalSession } from "@/lib/auth/portal";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { parseThemeCookie, THEME_COOKIE } from "@/lib/theme";
import { getBranding } from "@/server/branding";
import { listRoles } from "@/server/roles";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) {
    /**
     * 014 (T024) — Un profesor entra con las mismas credenciales pero no tiene
     * fila en `member`, así que `getSessionOrNull` devuelve null. Sin este
     * desvío iría a `/login`, se loguearía bien, y volvería a `/login`: un
     * bucle en el que la cuenta funciona y la persona no puede entrar a nada.
     *
     * Se resuelve acá y no en el login porque acá pasan TODAS las entradas al
     * panel, incluido un enlace viejo o un marcador guardado.
     */
    const portal = await resolvePortalSession();
    redirect(portal ? "/portal" : "/login");
  }
  const branding = await getBranding(session.organizationId);
  const authSession = await getAuth().api.getSession({
    headers: await headers(),
  });

  /**
   * 012 (T029) — El rótulo visible del rol sale de la base cuando existe.
   *
   * Si la organización todavía no tiene los roles sembrados, se muestra la
   * llave cruda en vez de inventar un nombre: es preferible ver `owner` a ver
   * "Equipo" y no saber qué significa.
   */
  const roles = await listRoles(session.organizationId, session.role);
  const roleLabel = roles.find((r) => r.key === session.role)?.name ?? session.role;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppNav
        branding={branding}
        userName={authSession?.user.name ?? "Usuario"}
        roleLabel={roleLabel}
        capabilities={sessionCapabilities(session)}
        theme={parseThemeCookie((await cookies()).get(THEME_COOKIE)?.value)}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
