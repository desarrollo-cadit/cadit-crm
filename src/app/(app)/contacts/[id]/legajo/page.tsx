import { StudentRecordClient } from "@/components/contacts/student-record-client";

export const dynamic = "force-dynamic";

/**
 * 013 (T029, US6) — El legajo del alumno.
 *
 * No lleva gate propio: la ruta `/api/contacts/[id]/record` exige
 * `contactos.ver`, y sin esa capacidad la pantalla muestra el error en vez de
 * datos. Poner un segundo chequeo acá duplicaría la regla en dos lugares que
 * pueden desincronizarse.
 */
export default async function LegajoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full overflow-y-auto">
      <StudentRecordClient contactId={id} />
    </div>
  );
}
