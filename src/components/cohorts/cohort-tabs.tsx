"use client";

import { usePestanaEnUrl } from "@/components/use-pestana-en-url";
import { pestanasDelGrupo, type PestanaDelGrupo } from "@/lib/pestanas";
import { AttendanceClient } from "@/components/cohorts/attendance-client";
import { AnnouncementsClient } from "@/components/cohorts/announcements-client";
import { CohortOfflineCoursesClient } from "@/components/offline-courses/cohort-offline-courses-client";
import { ClassesClient } from "@/components/cohorts/classes-client";
import { GradingClient } from "@/components/cohorts/grading-client";
import { ProgramClassesClient } from "@/components/cohorts/program-classes-client";
import { ProgramClient } from "@/components/cohorts/program-client";
import { ProgramSheetSwitcher } from "@/components/cohorts/program-sheet-switcher";
import { RosterClient } from "@/components/cohorts/roster-client";
import { ModuleRosterClient } from "@/components/cohorts/module-roster-client";

const ETIQUETA: Record<PestanaDelGrupo, string> = {
  recorrido: "Recorrido",
  alumnos: "Alumnos",
  clases: "Clases",
  asistencia: "Asistencia",
  evaluacion: "Evaluación",
  avisos: "Avisos",
  "cursos-offline": "Cursos offline",
};

/**
 * 009 — La cohorte pasa a tener dos vistas: el roster de alumnos (005) y la
 * planilla de asistencia. Pestañas y no dos páginas porque se alternan todo
 * el tiempo: se toma asistencia y se vuelve a mirar el checklist del mismo
 * alumno.
 */
export function CohortTabs({
  cohortId,
  canEnroll,
  canViewAcademic,
  canEditAcademic,
  canEditAttendance,
  canEditGrading,
  canEditEnrollments,
  canIssueCertificates,
  canConfirmResults = false,
  canManageAccess,
  canFollowUp = false,
  canInvoice = false,
  canManageLicenses = false,
  esEspecializacion,
  esModulo = false,
  initialTab,
}: {
  /**
   * 2026-10-26 — Pestaña inicial, de `?tab=`. El servidor la valida contra
   * `pestanasDelGrupo`: una pestaña que este grupo o esta persona no tiene
   * llega como `undefined` y abre la default.
   */
  initialTab?: PestanaDelGrupo;
  /**
   * 2026-10-26 — `licencias.gestionar`: asignar y quitar licencias (por
   * alumno, del grupo y el correo de la licencia). Sin ella se ven, sin
   * controles.
   */
  canManageLicenses?: boolean;
  /** 040 (DV-001) — `inscripciones.seguimiento`: checklist y correos del roster. */
  canFollowUp?: boolean;
  /** 042 — `facturacion.editar`: anotar el número de recibo de un pago. */
  canInvoice?: boolean;
  cohortId: string;
  /**
   * 034 (US4, FR-016/FR-017) — ¿Es un MÓDULO de una especialización? Entonces
   * la pestaña Alumnos es una lista de quién lo cursa (sin inscribir, sin
   * portal, sin plata) y no hay Cursos offline: eso se gestiona en la
   * especialización. Una cohorte común no cambia (FR-019).
   */
  esModulo?: boolean;
  canEnroll: boolean;
  /**
   * cursos-offline — `academico.ver`: the "Cursos offline" tab and the
   * per-student panel in the roster. Without it they are not drawn at all
   * (their fetches would answer 403).
   */
  canViewAcademic: boolean;
  /** 013 — `academico.editar`: generar el cronograma. */
  canEditAcademic: boolean;
  /** 013 — `asistencia.editar`: cargar enlaces y grabaciones (DV-001c). */
  canEditAttendance: boolean;
  /** 014 — `evaluacion.editar`: crear, copiar y corregir evaluaciones. */
  canEditGrading: boolean;
  /** 028 — `inscripciones.editar`: mudar una cursada o armar una recursada. */
  canEditEnrollments: boolean;
  /** 024 — `certificados.emitir`: emitir y anular son la MISMA capacidad. */
  canIssueCertificates: boolean;
  /** 0086 — `correcciones.aprobar`: confirmar o corregir el resultado final. */
  canConfirmResults?: boolean;
  /** 2026-10-05 — `accesos.gestionar`: el acceso al portal a toda la cohorte. */
  canManageAccess: boolean;
  /**
   * 028 (seguimiento) — ¿Esta cohorte está MARCADA como especialización?
   *
   * La pestaña se agrega SÓLO en ese caso, y la condición es la columna
   * `cohort.is_specialization` —no contar hijos: una especialización recién
   * creada no tiene ninguno y es la que más necesita la pestaña para armarse—,
   * nunca una heurística sobre el nombre del curso. Una pestaña de más en las
   * 33 cohortes simples ya es un cambio de pantalla, y FR-032 es un requisito
   * duro.
   */
  esEspecializacion: boolean;
}) {
  // 029 — En una especialización se entra por el Recorrido: es la pantalla
  // que responde "¿cómo va cada uno, módulo por módulo?".
  // 2026-10-26 — La pestaña vive en `?tab=` (la valida el servidor).
  const [tab, setTab] = usePestanaEnUrl<PestanaDelGrupo>(
    initialTab ?? (esEspecializacion ? "recorrido" : "alumnos")
  );

  // El ORDEN y qué pestañas existen los decide `pestanasDelGrupo` (la misma
  // lista que valida `?tab=` en el servidor):
  // - 029 — En una especialización, el Recorrido va PRIMERO y es la pestaña
  //   por defecto: antes de mirar clases o notas, lo que hay que ver es de
  //   qué está hecha y cómo va cada alumno.
  // - 013 — Después de saber QUIÉNES cursan, lo que se mira es CUÁNDO.
  //   Asistencia y evaluación vienen después; Avisos al final: es
  //   comunicación, no gestión de la cursada.
  // - cursos-offline — al final: complementa la cursada, no la conduce.
  //   034 (FR-016) — un módulo no asigna cursos offline: eso es de la
  //   especialización.
  const pestanas = pestanasDelGrupo({
    esEspecializacion,
    verCursosOffline: canViewAcademic && !esModulo,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b px-6 pt-4">
        {pestanas.map((key) => ({ key, label: ETIQUETA[key] })).map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === "alumnos" && esModulo ? (
          <ModuleRosterClient
            cohortId={cohortId}
            canEditEnrollments={canEditEnrollments}
            canEditLicenses={canManageLicenses}
          />
        ) : tab === "alumnos" ? (
          <RosterClient
            cohortId={cohortId}
            canEnroll={canEnroll}
            canViewOfflineCourses={canViewAcademic}
            canEditOfflineCourses={canEditAcademic}
            canManageAccess={canManageAccess}
            canEditLicenses={canManageLicenses}
            canFollowUp={canFollowUp}
            canInvoice={canInvoice}
          />
        ) : tab === "recorrido" ? (
          <ProgramClient
            cohortId={cohortId}
            canEditAcademic={canEditAcademic}
            canEditEnrollments={canEditEnrollments}
            canEditGrading={canEditGrading}
          />
        ) : tab === "clases" && esEspecializacion ? (
          <ProgramClassesClient cohortId={cohortId} canEdit={canEditAcademic} />
        ) : (tab === "asistencia" || tab === "evaluacion") && esEspecializacion ? (
          <ProgramSheetSwitcher
            key={tab}
            cohortId={cohortId}
            kind={tab === "asistencia" ? "attendance" : "grading"}
            canEditGrading={canEditGrading}
            canIssueCertificates={canIssueCertificates}
            canConfirmResults={canConfirmResults}
            canEditAttendance={canEditAttendance}
          />
        ) : tab === "clases" ? (
          <ClassesClient
            cohortId={cohortId}
            canEdit={canEditAcademic}
            canEditLinks={canEditAttendance}
          />
        ) : tab === "asistencia" ? (
          <AttendanceClient cohortId={cohortId} canEdit={canEditAttendance} />
        ) : tab === "cursos-offline" ? (
          <CohortOfflineCoursesClient cohortId={cohortId} canEdit={canEditAcademic} />
        ) : tab === "evaluacion" ? (
          <GradingClient
            cohortId={cohortId}
            canEdit={canEditGrading}
            canIssueCertificates={canIssueCertificates}
            canConfirmResults={canConfirmResults}
          />
        ) : (
          <AnnouncementsClient cohortId={cohortId} canPublish={canEditAcademic} />
        )}
      </div>
    </div>
  );
}
