"use client";

import { useCallback, useEffect, useState } from "react";
import { AttendanceClient } from "@/components/cohorts/attendance-client";
import { GradingClient } from "@/components/cohorts/grading-client";
import {
  RecorridoGrid,
  type AlumnoDelRecorrido,
  type ColumnaDelRecorrido,
} from "@/components/cohorts/recorrido-grid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Programa = {
  modules: (ColumnaDelRecorrido & { cohortId: string })[];
  students?: AlumnoDelRecorrido[];
};

/**
 * 029 — Asistencia y Evaluación de una ESPECIALIZACIÓN.
 *
 * La madre no tiene planilla propia —la asistencia y las notas viven en cada
 * módulo—, y estas pestañas quedaban vacías. Ahora hay un selector:
 *
 * - **Todos**: el resumen alumno × módulo (asistencia real y estado), de solo
 *   lectura. Es la misma grilla del Recorrido, sin acciones.
 * - **Un módulo**: la planilla de ESE módulo, el mismo componente que se ve
 *   entrando al módulo, editable con las mismas capacidades.
 */
export function ProgramSheetSwitcher({
  cohortId,
  kind,
  canEditGrading,
  canIssueCertificates,
}: {
  cohortId: string;
  kind: "attendance" | "grading";
  canEditGrading: boolean;
  canIssueCertificates: boolean;
}) {
  const [data, setData] = useState<Programa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/program`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar los módulos de la especialización");
      return;
    }
    setData((await res.json()) as Programa);
    setError(null);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!data) {
    return error ? (
      <div className="space-y-3 p-6">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    ) : (
      <div className="space-y-2 p-6">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (data.modules.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Esta especialización todavía no tiene módulos.
      </p>
    );
  }

  const opciones = [
    { id: null, label: "Todos" },
    ...data.modules.map((m) => ({ id: m.cohortId, label: m.label })),
  ];

  return (
    <div className="flex h-full flex-col">
      <div
        role="group"
        aria-label="Módulo a mostrar"
        className="flex flex-wrap gap-1 border-b px-6 py-2"
      >
        {opciones.map((o) => (
          <button
            key={o.id ?? "todos"}
            type="button"
            aria-pressed={elegido === o.id}
            onClick={() => setElegido(o.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              elegido === o.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {elegido === null ? (
          data.students === undefined ? (
            <p className="p-6 text-sm text-muted-foreground">
              El resumen por módulo requiere permiso de evaluación. Elegí un módulo para ver su
              planilla.
            </p>
          ) : data.students.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Todavía no hay nadie inscripto en esta especialización.
            </p>
          ) : (
            <div className="p-6">
              <RecorridoGrid columnas={data.modules} alumnos={data.students} ahora={new Date()} />
            </div>
          )
        ) : kind === "attendance" ? (
          <AttendanceClient key={elegido} cohortId={elegido} />
        ) : (
          <GradingClient
            key={elegido}
            cohortId={elegido}
            canEdit={canEditGrading}
            canIssueCertificates={canIssueCertificates}
          />
        )}
      </div>
    </div>
  );
}
