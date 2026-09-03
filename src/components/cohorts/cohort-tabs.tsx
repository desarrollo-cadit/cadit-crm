"use client";

import { useState } from "react";
import { AttendanceClient } from "@/components/cohorts/attendance-client";
import { AnnouncementsClient } from "@/components/cohorts/announcements-client";
import { ClassesClient } from "@/components/cohorts/classes-client";
import { GradingClient } from "@/components/cohorts/grading-client";
import { RosterClient } from "@/components/cohorts/roster-client";

/**
 * 009 — La cohorte pasa a tener dos vistas: el roster de alumnos (005) y la
 * planilla de asistencia. Pestañas y no dos páginas porque se alternan todo
 * el tiempo: se toma asistencia y se vuelve a mirar el checklist del mismo
 * alumno.
 */
export function CohortTabs({
  cohortId,
  canEnroll,
  canEditAcademic,
  canEditAttendance,
  canEditGrading,
}: {
  cohortId: string;
  canEnroll: boolean;
  /** 013 — `academico.editar`: generar el cronograma. */
  canEditAcademic: boolean;
  /** 013 — `asistencia.editar`: cargar enlaces y grabaciones (DV-001c). */
  canEditAttendance: boolean;
  /** 014 — `evaluacion.editar`: crear, copiar y corregir evaluaciones. */
  canEditGrading: boolean;
}) {
  const [tab, setTab] = useState<
    "roster" | "classes" | "attendance" | "grading" | "announcements"
  >("roster");

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b px-6 pt-4">
        {(
          [
            { key: "roster", label: "Alumnos" },
            // 013 — Va segunda: después de saber QUIÉNES cursan, lo que se
            // mira es CUÁNDO. Asistencia y evaluación vienen después.
            { key: "classes", label: "Clases" },
            { key: "attendance", label: "Asistencia" },
            { key: "grading", label: "Evaluación" },
            // 013 — Última: es comunicación, no gestión de la cursada.
            { key: "announcements", label: "Avisos" },
          ] as const
        ).map((t) => (
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "roster" ? (
          <RosterClient cohortId={cohortId} canEnroll={canEnroll} />
        ) : tab === "classes" ? (
          <ClassesClient
            cohortId={cohortId}
            canEdit={canEditAcademic}
            canEditLinks={canEditAttendance}
          />
        ) : tab === "attendance" ? (
          <AttendanceClient cohortId={cohortId} />
        ) : tab === "grading" ? (
          <GradingClient cohortId={cohortId} canEdit={canEditGrading} />
        ) : (
          <AnnouncementsClient cohortId={cohortId} canPublish={canEditAcademic} />
        )}
      </div>
    </div>
  );
}
