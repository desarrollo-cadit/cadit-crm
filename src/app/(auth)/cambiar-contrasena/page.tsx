import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { PasswordChangeForm } from "@/components/auth/password-change-form";

export const dynamic = "force-dynamic";

/**
 * Elegir la contraseña propia: forzado en el primer ingreso, voluntario
 * después.
 *
 * Vive en `(auth)` y no en `(app)` ni en `(portal)` por dos motivos. Uno es
 * que sirve a las dos audiencias con la misma pantalla. El otro es el que
 * importa: esos caparazones son los que redirigen ACÁ, y si la pantalla
 * colgara de uno de ellos, la persona obligada a cambiarla rebotaría contra sí
 * misma para siempre.
 *
 * Pide sesión de Better Auth y nada más: ni membresía (alumnos y profesores
 * no tienen) ni vínculo de portal (el staff no tiene).
 */
export default async function CambiarContrasenaPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return <PasswordChangeForm forced={session.user.mustChangePassword === true} />;
}
