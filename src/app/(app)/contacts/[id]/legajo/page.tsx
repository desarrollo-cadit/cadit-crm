import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { studentHeader } from "@/server/student-header";
import { StudentHeader } from "@/components/contacts/student-header";
import { StudentTabs } from "@/components/contacts/student-tabs";

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
 *
 * 2026-10-07 — Encabezado con miga y pestañas, como la cohorte.
 *
 * - La miga depende de desde dónde se llegó: el roster agrega `?cohort=<id>`
 *   y la cohorte se resuelve acá, dentro de la organización (ver
 *   `studentHeader`). Un id ajeno cae a «Alumnos» sin decir nada.
 * - El encabezado se lee con `contactos.ver`, la MISMA capacidad que el
 *   legajo: sin ella no se consulta nada y queda el error de siempre.
 * - «Administración» se dibuja con `alumnos.auditoria`; sus datos vienen de
 *   su propia ruta, nunca del legajo.
 */
export default async function LegajoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cohort?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const cohortParam = typeof query.cohort === "string" ? query.cohort : null;
  const session = await getSessionOrNull();
  const caps = session ? sessionCapabilities(session) : [];

  const header =
    session && caps.includes("contactos.ver")
      ? await withTenantTransaction(session, () =>
          studentHeader(session.organizationId, id, cohortParam)
        )
      : null;

  return (
    <div className="flex h-full flex-col">
      {header ? <StudentHeader header={header} /> : null}
      <div className="min-h-0 flex-1">
        <StudentTabs
          contactId={id}
          canEnroll={caps.includes("inscripciones.editar")}
          canAudit={caps.includes("alumnos.auditoria")}
        />
      </div>
    </div>
  );
}
