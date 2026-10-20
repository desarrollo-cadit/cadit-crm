"use client";

import { useCallback, useEffect, useState } from "react";
import { UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LicenseList } from "@/components/enrollments/license-list";
import { GroupLicensesPanel } from "@/components/cohorts/group-licenses-panel";
import { notify } from "@/lib/notify";

type Estado = "aprobado" | "reprobado" | "pendiente" | "sin_datos";

type Alumno = {
  enrollmentId: string;
  contact: { id: string; name: string; archived: boolean };
  attendancePct: number | null;
  state: Estado;
  reasons: string[];
  otherProgramName: string | null;
  licenseSoftwareIds: string[];
};

type Roster = {
  cohortId: string;
  minAttendancePct: number | null;
  software: { id: string; name: string }[];
  /** 035 (FR-007/FR-012) — Lo asignado al grupo de este módulo. */
  groupSoftware: { id: string; name: string }[];
  students: Alumno[];
};

const ESTADO: Record<Estado, { label: string; variant: "success" | "destructive" | "secondary" | "outline" }> = {
  aprobado: { label: "Aprobado", variant: "success" },
  reprobado: { label: "Reprobado", variant: "destructive" },
  pendiente: { label: "Cursando", variant: "secondary" },
  sin_datos: { label: "Sin datos", variant: "outline" },
};

/**
 * 034 (US4, FR-016/FR-017) — La pestaña Alumnos de un MÓDULO.
 *
 * Una lista, no un roster: quién cursa el módulo, con su asistencia y su
 * estado. Sin botón de inscribir (las inscripciones al módulo salen solas de
 * la especialización), sin acceso al portal ni datos comerciales (se
 * gestionan en la especialización). Las dos acciones que sí son del módulo:
 * sacar a alguien de él y asignarle licencias del módulo.
 */
export function ModuleRosterClient({
  cohortId,
  canEditEnrollments,
  canEditLicenses,
}: {
  cohortId: string;
  /** `inscripciones.editar` — sacar del módulo. */
  canEditEnrollments: boolean;
  /** `academico.editar` — asignar y liberar licencias. */
  canEditLicenses: boolean;
}) {
  const [data, setData] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sacando, setSacando] = useState<Alumno | null>(null);
  const [guardando, setGuardando] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/module-roster`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar la lista de alumnos del módulo");
      return;
    }
    setData((await res.json()) as Roster);
    setError(null);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function sacar() {
    if (!sacando) return;
    setGuardando(true);
    const res = await fetch(`/api/enrollments/${sacando.enrollmentId}/module`, {
      method: "DELETE",
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo sacar al alumno del módulo");
      return;
    }
    notify.success(`${sacando.contact.name} ya no cursa este módulo.`, {
      description: "Su inscripción a la especialización y a los otros módulos quedó igual.",
    });
    setSacando(null);
    void refetch();
  }

  if (error && !data) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <p className="text-xs text-muted-foreground">
        Los alumnos de la especialización entran solos a sus módulos. Para
        inscribir a alguien, el acceso al portal, los cursos offline y los datos
        comerciales, andá a la especialización.
      </p>

      {/* 035 (FR-007) — Un programa para todos los alumnos de ESTE módulo. */}
      <GroupLicensesPanel
        cohortId={cohortId}
        canEdit={canEditLicenses}
        onChanged={() => void refetch()}
      />

      {data.students.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nadie cursa este módulo todavía.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {data.students.map((a) => (
            <li key={a.enrollmentId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <a
                href={`/contacts/${a.contact.id}/legajo?cohort=${encodeURIComponent(cohortId)}`}
                className="min-w-[10rem] font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                {a.contact.name}
              </a>
              {a.contact.archived ? <Badge variant="outline">De baja</Badge> : null}
              {a.otherProgramName ? (
                <Badge variant="secondary">De {a.otherProgramName}</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Asistencia: {a.attendancePct === null ? "sin datos" : `${a.attendancePct}%`}
                {data.minAttendancePct !== null ? ` (mínimo ${data.minAttendancePct}%)` : ""}
              </span>
              <Badge variant={ESTADO[a.state].variant} title={a.reasons.join(" · ")}>
                {ESTADO[a.state].label}
              </Badge>
              <span className="text-xs">
                <LicenseList
                  label="Licencias del módulo"
                  enrollmentId={a.enrollmentId}
                  assignedIds={a.licenseSoftwareIds}
                  options={data.software}
                  group={data.groupSoftware}
                  canEdit={canEditLicenses}
                  onChanged={() => void refetch()}
                />
              </span>
              {canEditEnrollments ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setSacando(a)}
                >
                  <UserMinus className="h-4 w-4" aria-hidden />
                  Sacar del módulo
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {sacando ? (
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">
            Sacar a {sacando.contact.name} de este módulo
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            No va a cursar este módulo: se borra su inscripción al módulo y se
            liberan sus licencias del módulo. Su inscripción a la especialización
            y a los otros módulos no cambia. Si ya tiene asistencia o notas acá,
            no se puede: mudalo a otro grupo desde el Recorrido.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" disabled={guardando} onClick={() => void sacar()}>
              {guardando ? "Sacando…" : "Sacar del módulo"}
            </Button>
            <Button variant="ghost" onClick={() => setSacando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
