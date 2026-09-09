import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listarModulos } from "@/server/program-modules";
import { CohortTabs } from "@/components/cohorts/cohort-tabs";

export const dynamic = "force-dynamic";

export default async function CohortPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionOrNull();
  // 012 (T029) — Por capacidad, no por nombre de rol: inscribir con datos
  // comerciales exige `inscripciones.editar`, que es lo que de verdad separa
  // a quien puede de quien no.
  const fullAccess = session
    ? sessionCapabilities(session).includes("inscripciones.editar")
    : false;
  // 013 — Las capacidades se resuelven en el SERVIDOR y bajan como booleanos:
  // el cliente no decide permisos, solo decide qué dibuja. Las rutas tienen su
  // propio `requireCapability`, así que esto es lo que la persona VE, no la
  // barrera.
  const caps = session ? sessionCapabilities(session) : [];
  /**
   * 028 fase 4 (FR-033) — ¿Es la camada de una especialización? Se pregunta
   * por la PRESENCIA de módulos, que es un dato, y no por una bandera de
   * configuración ni por una heurística sobre el nombre del curso.
   *
   * Se resuelve acá y no con una llamada del cliente a propósito: las 33
   * cohortes simples tienen que seguir pidiendo exactamente los mismos
   * endpoints que hoy (FR-032).
   *
   * ============================================================
   * Y va DENTRO de `withTenantTransaction`, que no es opcional
   * ============================================================
   *
   * `cohort` es una tabla de dominio con la política `tenant_isolation`, y un
   * server component NO pasa por `withAuth`: `getSessionOrNull()` sólo llama a
   * `requireSession()`, que no abre ninguna transacción. `set_config(...,
   * true)` es transaction-local por diseño, así que fuera de una transacción
   * `app.current_org` no existe, la política compara contra NULL y la consulta
   * devuelve CERO filas — sin error, sin log y sin aviso.
   *
   * El síntoma sería `esEspecializacion` en `false` para siempre bajo
   * `cadit_app`: la pestaña no aparecería nunca y toda la fase 4 sería código
   * muerto en producción.
   *
   * El precedente que engaña es `guia/page.tsx`, que también lee del server
   * component: lee `role`, una de las CINCO tablas deliberadamente fuera de
   * RLS. `cohort` no es una de ellas.
   *
   * La pestaña se pinta con la MISMA capacidad que exige
   * `/api/cohorts/[id]/program` (`academico.ver`). Sin eso, una sesión sin esa
   * capacidad vería una pestaña cuyo fetch le contesta 403. Y de paso: quien
   * no puede verla tampoco paga la consulta.
   */
  const puedeVerPrograma = caps.includes("academico.ver");
  const modulos =
    session && puedeVerPrograma
      ? await withTenantTransaction(session, () =>
          listarModulos(session.organizationId, id)
        )
      : [];
  return (
    <CohortTabs
      cohortId={id}
      canEnroll={fullAccess}
      canEditAcademic={caps.includes("academico.editar")}
      canEditAttendance={caps.includes("asistencia.editar")}
      canEditGrading={caps.includes("evaluacion.editar")}
      canEditEnrollments={caps.includes("inscripciones.editar")}
      esEspecializacion={modulos.length > 0}
    />
  );
}
