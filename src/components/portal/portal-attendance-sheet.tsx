"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Status = "presente" | "tarde" | "ausente" | "justificado";

type Sheet = {
  classSession: {
    id: string;
    number: number;
    date: string;
    topic: string | null;
    canceled: boolean;
  };
  cohort: { status: "planificada" | "en_curso" | "finalizada" };
  students: {
    enrollmentId: string;
    name: string;
    status: Status | null;
    recordedByName: string | null;
    recordedAt: string | null;
  }[];
};

/** Los mismos colores de estado que usaba la planilla cuando marcaba. */
const ESTADOS: Record<Status, { label: string; clase: string }> = {
  presente: { label: "Presente", clase: "bg-success text-on-state border-success" },
  tarde: { label: "Tarde", clase: "bg-warning text-on-state border-warning" },
  ausente: { label: "Ausente", clase: "bg-danger text-on-state border-danger" },
  justificado: { label: "Justificado", clase: "border-border text-muted-foreground" },
};

function cuando(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * 014 (T026) — La asistencia de una clase, como la ve el profesor.
 *
 * Desde 2026-10-26 es **solo consulta**: pasar lista es de Coordinación. El
 * profesor ve quién vino, quién dejó cada marca y cuándo, pero no hay botones
 * de estado ni "Todos presentes" — la ruta del portal tampoco acepta
 * escrituras, así que un botón acá sería una puerta pintada en la pared.
 */
export function PortalAttendanceSheet({
  classSessionId,
  onBack,
}: {
  classSessionId: string;
  onBack: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/classes/${classSessionId}/attendance`).catch(
      () => null
    );
    if (!res?.ok) {
      // 404: la clase se borró o se reprogramó (la reprogramada es OTRA clase).
      setError(
        res?.status === 404
          ? "Esta clase ya no está disponible: puede que la hayan borrado o reprogramado. Volvé al listado para ver las clases vigentes."
          : "No pudimos cargar la clase. Podés reintentar o volver al listado."
      );
      return;
    }
    setError(null);
    setSheet((await res.json()) as Sheet);
  }, [classSessionId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!sheet) {
    // Primero el error: si no, una carga fallida queda como "cargando" para
    // siempre, sin mensaje y sin forma de volver.
    if (error) {
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a las clases
          </button>
          <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sinMarcar = sheet.students.filter((s) => s.status === null).length;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a las clases
      </button>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Clase {sheet.classSession.number}
        </h2>
        <p className="text-sm text-muted-foreground">
          {cuando(sheet.classSession.date)}
          {sheet.classSession.topic && ` · ${sheet.classSession.topic}`}
        </p>
      </div>

      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {sheet.classSession.canceled
          ? "Esta clase está suspendida: no cuenta para la asistencia."
          : "La asistencia la registra la coordinación. Acá podés consultarla; si ves algún error, avisale a la coordinación."}
      </p>

      {!sheet.classSession.canceled && sinMarcar > 0 && sheet.students.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {sinMarcar === 1
            ? "1 alumno todavía sin registrar."
            : `${sinMarcar} alumnos todavía sin registrar.`}
        </p>
      )}

      <ul className="divide-y rounded-lg border">
        {sheet.students.map((s) => {
          const estado = s.status ? ESTADOS[s.status] : null;
          return (
            <li key={s.enrollmentId} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {s.name}
                </span>
                <span
                  className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                    estado ? estado.clase : "border-dashed text-muted-foreground"
                  }`}
                >
                  {estado ? estado.label : "Sin registrar"}
                </span>
              </div>

              {/* DV-001 — quién dejó el dato así. */}
              {s.recordedByName && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {s.recordedByName}
                  {s.recordedAt &&
                    ` · ${new Date(s.recordedAt).toLocaleDateString("es-UY")}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {sheet.students.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Este grupo aún no tiene alumnos inscriptos.
        </p>
      )}
    </div>
  );
}
