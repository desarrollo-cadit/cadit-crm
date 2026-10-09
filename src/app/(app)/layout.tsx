import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { forcedPasswordChangeRedirect } from "@/lib/auth/password-change";
import { portalTeacherId, resolvePortalSession } from "@/lib/auth/portal";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { parseThemeCookie, THEME_COOKIE } from "@/lib/theme";
import { getBranding } from "@/server/branding";
import { listRoles } from "@/server/roles";
import { AppNav } from "@/components/app-nav";
import { AppToaster } from "@/components/ui/toaster";

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
  const authSession = await getAuth().api.getSession({
    headers: await headers(),
  });

  /**
   * Contraseña elegida por otra persona (alta del equipo, `reset-password`):
   * antes de cualquier pantalla, a elegir la propia. `/cambiar-contrasena`
   * vive en `(auth)`, fuera de este caparazón, así que no hay bucle.
   *
   * **Solo las pantallas, no la API, y es deliberado.** Quien tenga una
   * contraseña filtrada puede cambiarla él mismo de todos modos, así que
   * bloquear la API no protegería nada y sumaría riesgo a las tres puertas.
   * Lo que el cambio forzado logra es que la contraseña que viajó por correo
   * deje de servir en cuanto su dueño elige la suya.
   */
  const forced = forcedPasswordChangeRedirect(authSession?.user);
  if (forced) redirect(forced);

  const branding = await getBranding(session.organizationId);

  /**
   * 012 (T029) — El rótulo visible del rol sale de la base cuando existe.
   *
   * Si la organización todavía no tiene los roles sembrados, se muestra la
   * llave cruda en vez de inventar un nombre: es preferible ver `owner` a ver
   * "Equipo" y no saber qué significa.
   */
  const roles = await listRoles(session.organizationId, session.role);
  const roleLabel = roles.find((r) => r.key === session.role)?.name ?? session.role;

  /**
   * 030 (addendum) — ¿Esta cuenta del equipo también es profesor con portal?
   * Solo decide si se ofrece "Ver como"; el panel no cambia en nada.
   */
  const portal = await resolvePortalSession();
  const isAlsoTeacher = portal !== null && portalTeacherId(portal) !== null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppNav
        branding={branding}
        userName={authSession?.user.name ?? "Usuario"}
        roleLabel={roleLabel}
        capabilities={sessionCapabilities(session)}
        theme={parseThemeCookie((await cookies()).get(THEME_COOKIE)?.value)}
        isAlsoTeacher={isAlsoTeacher}
      />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      <AppToaster />
    </div>
  );
}
