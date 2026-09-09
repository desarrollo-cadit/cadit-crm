import { redirect } from "next/navigation";
import { portalTeacherId, resolvePortalSession, studentContactId } from "@/lib/auth/portal";
import { StudentDashboard } from "@/components/portal/student-dashboard";

export const dynamic = "force-dynamic";

/**
 * 015/021 — La entrada del portal.
 *
 * Una persona puede ser alumno Y profesor (un egresado que después da clases),
 * así que `/portal` no puede ser "la pantalla del profesor" como en 014.
 * Cuando hay vínculo de alumno, el inicio es el suyo —es la audiencia grande,
 * 340 personas— y el profesor llega a lo suyo por la barra lateral. Un
 * profesor puro entra directo a sus cohortes: mandarlo a un tablero vacío para
 * que después haga un clic es hacerle perder el tiempo.
 */
export default async function PortalHomePage() {
  const portal = await resolvePortalSession();
  if (!portal) redirect("/login");

  if (!studentContactId(portal)) {
    if (portalTeacherId(portal)) redirect("/portal/dictado");
    // Sin ninguno de los dos, el layout ya muestra la pantalla de "sin
    // vínculo": acá no hay nada más que decidir.
    return null;
  }

  return <StudentDashboard />;
}
