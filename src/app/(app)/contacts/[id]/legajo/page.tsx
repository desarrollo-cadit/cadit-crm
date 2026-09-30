import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { StudentRecordClient } from "@/components/contacts/student-record-client";

export const dynamic = "force-dynamic";

/**
 * 013 (T029, US6) — El legajo del alumno.
 *
 * No lleva gate propio: la ruta `/api/contacts/[id]/record` exige
 * `contactos.ver`, y sin esa capacidad la pantalla muestra el error en vez de
 * datos. Poner un segundo chequeo acá duplicaría la regla en dos lugares que
 * pueden desincronizarse.
 *
 * Inscribir desde el contacto — el botón "Inscribir en una cohorte" se dibuja
 * solo con `inscripciones.editar`, resuelta acá en el servidor y bajada como
 * booleano (mismo patrón que la página de la cohorte). La barrera real es el
 * `requireCapability` de `/api/enrollments`.
 */
export default async function LegajoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionOrNull();
  const canEnroll = session
    ? sessionCapabilities(session).includes("inscripciones.editar")
    : false;
  return (
    <div className="h-full overflow-y-auto">
      <StudentRecordClient contactId={id} canEnroll={canEnroll} />
    </div>
  );
}
