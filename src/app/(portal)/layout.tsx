import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import {
  portalTeacherId,
  resolvePortalSession,
  studentContactId,
} from "@/lib/auth/portal";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { getBranding } from "@/server/branding";
import { studentNavCourses } from "@/server/student-portal";
import { Barlow_Condensed } from "next/font/google";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalWorld } from "@/components/portal/portal-world";
import { parseThemeCookie, THEME_COOKIE } from "@/lib/theme";

/**
 * La voz de los rótulos del mundo del alumno ("Cianotipo de obra"): una
 * condensada técnica, como la letra de un cajetín de plano. Se carga solo en
 * el portal —el panel del staff no la necesita— y, como Geist, next/font la
 * descarga en BUILD y la sirve self-hosted.
 */
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

/**
 * 021 — El caparazón del portal: **la misma forma que el panel**.
 *
 * 014 lo había resuelto con un encabezado angosto y una columna de 768px
 * centrada, pensando en el profesor de pie en el aula. Se ganó el celular y se
 * perdió el escritorio: en un monitor quedaba media pantalla vacía y una
 * navegación que no se parecía en nada a la del panel que la misma gente usa
 * todos los días. La corrección es una sola barra lateral, la del panel, con
 * la intensidad del portal; el celular lo cubre el cajón de `PortalNav`.
 *
 * `data-surface="portal"` (020/T021) enciende la intensidad de portal para
 * todo lo que cuelgue de acá. Es un atributo y no una clase porque lo que
 * cambia son TOKENS, no estilos: el mismo sistema, más presente.
 */
export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const portal = await resolvePortalSession();
  if (!portal) redirect("/login");

  const teacherId = portalTeacherId(portal);
  const contactId = studentContactId(portal);

  /**
   * Una cuenta de portal sin vínculo de alumno ni de profesor no ve una
   * pantalla rota ni un 403 crudo: se le dice qué es esto y qué falta. Pasa
   * cuando alguien de baja conserva la cuenta (DV-007 de 012).
   */
  if (!teacherId && !contactId) {
    return <SinVinculo />;
  }

  const branding = await getBranding(portal.organizationId);
  const authSession = await getAuth().api.getSession({ headers: await headers() });

  /**
   * Las cursadas del menú se leen adentro del alcance de la organización: el
   * layout corre fuera de las rutas de API, así que no hereda la transacción
   * que declara `app.current_org` y sin esto RLS devolvería cero filas.
   */
  const courses = contactId
    ? await withOrganizationScope(portal.organizationId, `portal:${portal.userId}`, () =>
        studentNavCourses(portal.organizationId, contactId)
      )
    : [];

  return (
    <div
      data-surface="portal"
      className={`${barlowCondensed.variable} flex min-h-screen flex-col bg-background md:h-screen md:flex-row md:overflow-hidden`}
    >
      {/*
        El mundo del alumno se enciende adentro, por ruta: una misma persona
        puede ser alumno y profesor, y cada pantalla lleva el mundo de su
        audiencia. `bg-background` va en `main` y no solo en el contenedor
        porque el contenedor queda afuera del mundo.
      */}
      <PortalWorld isStudent={Boolean(contactId)}>
        <PortalNav
          branding={branding}
          userName={authSession?.user.name ?? "Usuario"}
          audience={{ isStudent: Boolean(contactId), isTeacher: Boolean(teacherId) }}
          courses={courses}
          theme={parseThemeCookie((await cookies()).get(THEME_COOKIE)?.value)}
        />

        {/*
          El contenido scrollea por dentro en escritorio —igual que el panel— y
          por fuera en celular, donde el encabezado es pegajoso y el cajón vive
          sobre todo lo demás.
        */}
        <main className="min-w-0 flex-1 bg-background md:overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </PortalWorld>
    </div>
  );
}

function SinVinculo() {
  return (
    <div
      data-surface="portal"
      className="flex min-h-screen items-center justify-center bg-background p-4"
    >
      <div className="max-w-md rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-base font-semibold">Cuenta pendiente de vinculación</p>
        <p className="mt-2 text-sm text-muted-foreground">
          La cuenta existe, pero aún no está asociada a una inscripción ni a un
          registro de profesor. Si sos alumno o profesor de la academia,
          comunicate con la academia para habilitarla.
        </p>
      </div>
    </div>
  );
}
