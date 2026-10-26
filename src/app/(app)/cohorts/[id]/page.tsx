import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { cohorteEsEspecializacion } from "@/server/program-modules";
import { CohortTabs } from "@/components/cohorts/cohort-tabs";
import { CohortHeader } from "@/components/cohorts/cohort-header";
import { encabezadoDeCohorte } from "@/server/cohort-header";
import { estadoDeConfirmacion } from "@/server/cohort-confirmation";
import { leerPestana } from "@/lib/tab-param";
import { ALIAS_DEL_GRUPO, pestanasDelGrupo } from "@/lib/pestanas";

export const dynamic = "force-dynamic";

export default async function CohortPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
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
   * 028 (seguimiento) — ¿Es la camada de una especialización? Se pregunta por
   * la MARCA explícita (`cohort.is_specialization`), no por la presencia de
   * módulos: una especialización recién creada no tiene ninguno, y es
   * justamente la que necesita la pestaña para armarse. Tampoco por una
   * heurística sobre el nombre del curso.
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
  /**
   * 029 — El encabezado (miga, nombre, fechas, módulo N de M) se lee en la
   * MISMA transacción, con la misma capacidad que la pestaña de la
   * especialización: dice lo mismo, de qué está hecha la cohorte.
   */
  const { isSpecialization, header, confirmation } =
    session && puedeVerPrograma
      ? await withTenantTransaction(session, async () => ({
          isSpecialization: await cohorteEsEspecializacion(session.organizationId, id),
          header: await encabezadoDeCohorte(session.organizationId, id),
          // 039 — Confirmación y avisos internos, en la MISMA transacción (RLS).
          confirmation: await estadoDeConfirmacion(session.organizationId, id),
        }))
      : { isSpecialization: false, header: null, confirmation: null };
  /**
   * 2026-10-26 — `?tab=` elige la pestaña, validada contra las que ESTE grupo
   * le muestra a ESTA persona (la misma `pestanasDelGrupo` que dibuja la
   * barra): Recorrido fuera de una especialización o Cursos offline sin
   * `academico.ver` caen a la default, no se abren.
   */
  const esModulo = header?.partOf != null;
  const pestanas = pestanasDelGrupo({
    esEspecializacion: isSpecialization,
    verCursosOffline: puedeVerPrograma && !esModulo,
  });
  const pestanaPorDefecto = isSpecialization ? "recorrido" : "alumnos";
  const initialTab = leerPestana(tab, pestanas, pestanaPorDefecto, ALIAS_DEL_GRUPO);
  return (
    <div className="flex h-full flex-col">
      {header ? (
        <CohortHeader
          header={header}
          cohortId={id}
          canEdit={caps.includes("academico.editar")}
          confirmation={confirmation}
          canConfirm={caps.includes("cohortes.confirmar")}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <CohortTabs
          cohortId={id}
          canEnroll={fullAccess}
          canViewAcademic={puedeVerPrograma}
          canEditAcademic={caps.includes("academico.editar")}
          canEditAttendance={caps.includes("asistencia.editar")}
          canEditGrading={caps.includes("evaluacion.editar")}
          canEditEnrollments={caps.includes("inscripciones.editar")}
          canIssueCertificates={caps.includes("certificados.emitir")}
          canManageAccess={caps.includes("accesos.gestionar")}
          // 040 (DV-001) — checklist y correos; el rol Ventas no la tiene.
          canFollowUp={caps.includes("inscripciones.seguimiento")}
          // 042 — anotar el número de recibo de un pago, sin tocar la plata.
          canInvoice={caps.includes("facturacion.editar")}
          // 2026-10-26 — asignar y quitar licencias es de soporte; coordinación las ve.
          canManageLicenses={caps.includes("licencias.gestionar")}
          esEspecializacion={isSpecialization}
          // 034 (FR-016) — un módulo es el que tiene especialización arriba.
          esModulo={esModulo}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
