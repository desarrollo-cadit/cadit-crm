import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
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
   * endpoints que hoy (FR-032). Cuesta una consulta a `cohort` por apertura de
   * pantalla y es la misma que ya paga `generateSchedule` por el mismo motivo.
   */
  const modulos = session ? await listarModulos(session.organizationId, id) : [];
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
