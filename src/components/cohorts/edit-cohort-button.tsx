"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { CohortDto, CourseDto, SoftwareDto, TeacherDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CohortForm } from "@/components/academic/cohort-form";
import { notify } from "@/lib/notify";

type Datos = {
  cohort: CohortDto;
  courses: CourseDto[];
  teachers: TeacherDto[];
  software: SoftwareDto[];
  /** La madre, si es un módulo: el formulario la nombra. */
  cohorts: CohortDto[];
};

async function leer<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/**
 * Editar la cohorte desde adentro, con el MISMO formulario que el listado.
 *
 * Lo que el formulario necesita se pide recién al abrirlo: quien entra a la
 * cohorte a tomar asistencia no paga cuatro consultas que no va a usar.
 */
export function EditCohortButton({ cohortId }: { cohortId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);

  async function abrir() {
    setCargando(true);
    try {
      const [{ cohort }, { courses }, { teachers }, { software }] = await Promise.all([
        leer<{ cohort: CohortDto }>(`/api/cohorts/${cohortId}`),
        leer<{ courses: CourseDto[] }>("/api/courses"),
        leer<{ teachers: TeacherDto[] }>("/api/teachers"),
        leer<{ software: SoftwareDto[] }>("/api/software"),
      ]);
      const madre = cohort.parentCohortId
        ? await leer<{ cohort: CohortDto }>(`/api/cohorts/${cohort.parentCohortId}`)
            .then((d) => [d.cohort])
            .catch(() => [])
        : [];
      setDatos({ cohort, courses, teachers, software, cohorts: madre });
    } catch {
      notify.error("No se pudo abrir el grupo para editarla. Probá de nuevo en un momento.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void abrir()} loading={cargando}>
        <Pencil className="h-3.5 w-3.5" />
        Editar grupo
      </Button>
      {datos && (
        <CohortForm
          courses={datos.courses}
          teachers={datos.teachers}
          software={datos.software}
          cohorts={datos.cohorts}
          initial={datos.cohort}
          onClose={() => setDatos(null)}
          onSaved={() => {
            setDatos(null);
            // Recarga entera y no `router.refresh()`: las pestañas piden sus
            // datos desde el cliente (clases, calendario proyectado), y un
            // cambio de días o fechas tiene que verse en todas.
            window.location.reload();
          }}
          onTeacherCreated={(t) =>
            setDatos((prev) => (prev ? { ...prev, teachers: [...prev.teachers, t] } : prev))
          }
        />
      )}
    </>
  );
}
