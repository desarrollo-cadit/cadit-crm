"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
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
  editable: boolean;
  students: {
    enrollmentId: string;
    name: string;
    status: Status | null;
    recordedByName: string | null;
    recordedAt: string | null;
  }[];
};

/**
 * Cuatro estados, pero **tres botones**. `justificado` existe en el modelo y
 * se muestra si ya está puesto, pero no compite por el pulgar: en el medio de
 * la clase se decide presente / tarde / ausente, y justificar un ausente es
 * una conversación posterior que hace la coordinación.
 */
const BOTONES: { valor: Status; label: string; activo: string }[] = [
  { valor: "presente", label: "Vino", activo: "bg-success text-on-state border-success" },
  { valor: "tarde", label: "Tarde", activo: "bg-warning text-on-state border-warning" },
  { valor: "ausente", label: "Faltó", activo: "bg-danger text-on-state border-danger" },
];

function cuando(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * 014 (T026, FR-009/SC-004) — Toma de asistencia **pensada para el celular
 * primero**.
 *
 * Las decisiones de diseño salen de cómo se usa de verdad: de pie, con una
 * mano, mientras entra gente al aula.
 *
 * - Botones de 44px de alto: el mínimo para un pulgar sin mirar.
 * - **Guarda al tocar**, sin botón de "Guardar". Un formulario que hay que
 *   confirmar al final es un formulario que se pierde cuando suena el teléfono.
 * - Nadie arranca "presente" por defecto: marcar a todos presentes de entrada
 *   convierte el olvido en una afirmación falsa. Hay un atajo, pero es un acto
 *   deliberado.
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
  const [guardando, setGuardando] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/classes/${classSessionId}/attendance`).catch(
      () => null
    );
    if (!res?.ok) {
      setError("No se pudo cargar la clase.");
      return;
    }
    setSheet((await res.json()) as Sheet);
  }, [classSessionId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function marcar(entries: { enrollmentId: string; status: Status }[]) {
    const primero = entries[0];
    setGuardando(entries.length === 1 && primero ? primero.enrollmentId : "todos");

    // Optimista: el pulgar ya se movió, la pantalla tiene que acompañar.
    setSheet((prev) =>
      prev
        ? {
            ...prev,
            students: prev.students.map((s) => {
              const e = entries.find((x) => x.enrollmentId === s.enrollmentId);
              return e ? { ...s, status: e.status } : s;
            }),
          }
        : prev
    );

    const res = await fetch(`/api/portal/classes/${classSessionId}/attendance`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    }).catch(() => null);
    setGuardando(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar.");
      // Y se vuelve a lo que dice el servidor: mostrar una marca que no se
      // guardó es peor que no mostrar ninguna.
      void refetch();
      return;
    }
    setError(null);
    void refetch();
  }

  if (!sheet) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sinMarcar = sheet.students.filter((s) => s.status === null);

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

      {!sheet.editable && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {sheet.classSession.canceled
            ? "Esta clase está cancelada: no cuenta para la asistencia."
            : "La cohorte ya finalizó. Podés ver la asistencia, pero no cambiarla."}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {sheet.editable && sinMarcar.length > 0 && (
        <button
          type="button"
          disabled={guardando !== null}
          onClick={() =>
            void marcar(
              sinMarcar.map((s) => ({ enrollmentId: s.enrollmentId, status: "presente" }))
            )
          }
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Marcar presentes a los {sinMarcar.length} que faltan
        </button>
      )}

      <ul className="divide-y rounded-lg border">
        {sheet.students.map((s) => (
          <li key={s.enrollmentId} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {s.name}
              </span>
              <div className="flex shrink-0 gap-1">
                {BOTONES.map((b) => (
                  <button
                    key={b.valor}
                    type="button"
                    disabled={!sheet.editable || guardando !== null}
                    aria-pressed={s.status === b.valor}
                    aria-label={`${s.name}: ${b.label}`}
                    onClick={() =>
                      void marcar([{ enrollmentId: s.enrollmentId, status: b.valor }])
                    }
                    className={`h-11 min-w-[64px] rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                      s.status === b.valor ? b.activo : "hover:bg-accent"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {s.status === "justificado" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Marcado como justificado por la academia.
              </p>
            )}
            {/* DV-001 — quién dejó el dato así. Sin esto, una corrección no se
                puede revisar después. */}
            {s.recordedByName && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {s.recordedByName}
                {s.recordedAt &&
                  ` · ${new Date(s.recordedAt).toLocaleDateString("es-UY")}`}
              </p>
            )}
          </li>
        ))}
      </ul>

      {sheet.students.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Esta cohorte todavía no tiene alumnos inscriptos.
        </p>
      )}
    </div>
  );
}
