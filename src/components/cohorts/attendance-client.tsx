"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AttendanceStatus = "presente" | "tarde" | "ausente" | "justificado";

type Session = {
  id: string;
  number: number;
  date: string;
  hours: number | null;
  topic: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
};

type Student = {
  enrollmentId: string;
  contactName: string;
  percentage: number | null;
  meetsMinimum: boolean | null;
  bySession: Record<string, AttendanceStatus>;
};

type Sheet = {
  minAttendancePct: number | null;
  sessions: Session[];
  students: Student[];
};

/** Abreviatura de cada estado para la grilla; el nombre largo va en el title. */
const STATUS_SHORT: Record<AttendanceStatus, string> = {
  presente: "P",
  tarde: "T",
  ausente: "A",
  justificado: "J",
};

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  presente: "bg-brand-tint text-primary",
  tarde: "bg-brand-tint text-primary",
  ausente: "bg-danger-soft text-destructive",
  justificado: "bg-secondary text-muted-foreground",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
}

/**
 * 009 — Planilla de asistencia de una cohorte.
 *
 * Una clase por columna y un alumno por fila: es la forma en que se lee una
 * lista de asistencia en papel, y permite ver de un golpe quién se está
 * quedando afuera del mínimo.
 *
 * El porcentaje NO se guarda: lo calcula el servidor cada vez, porque depende
 * de qué clases se cancelaron y de cuándo entró cada alumno —y las dos cosas
 * cambian después de tomada la asistencia—.
 */
export function AttendanceClient({ cohortId }: { cohortId: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/attendance`).catch(() => null);
    if (res?.ok) setSheet((await res.json()) as Sheet);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function readError(res: Response | null, fallback: string) {
    const body = (await res?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return body?.error?.message ?? fallback;
  }

  async function generateSchedule() {
    setBusy(true);
    const res = await fetch(`/api/cohorts/${cohortId}/attendance`, {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    setError(res?.ok ? null : await readError(res, "No se pudo generar el cronograma"));
    void refetch();
  }

  async function mark(sessionId: string, enrollmentId: string, status: AttendanceStatus) {
    const res = await fetch(`/api/class-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attendance: [{ enrollmentId, status }] }),
    }).catch(() => null);
    setError(res?.ok ? null : await readError(res, "No se pudo guardar la asistencia"));
    void refetch();
  }

  async function cancelSession(sessionId: string) {
    const reason = window.prompt("¿Por qué se cancela la clase?");
    if (!reason?.trim()) return;
    const res = await fetch(`/api/class-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelReason: reason.trim() }),
    }).catch(() => null);
    setError(res?.ok ? null : await readError(res, "No se pudo cancelar la clase"));
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!sheet) {
    return <p className="p-6 text-sm text-muted-foreground">No se pudo cargar la asistencia.</p>;
  }

  if (sheet.sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">Esta cohorte todavía no tiene cronograma</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Se genera una clase por cada día de cursada declarado, entre la fecha de
          inicio y la de fin. Es una acción explícita: dar de alta cuarenta clases
          sin querer es difícil de deshacer.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button loading={busy} onClick={() => void generateSchedule()}>
          {!busy && <CalendarPlus className="h-4 w-4" />}
          {busy ? "Generando…" : "Generar cronograma"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {sheet.sessions.length} clases ·{" "}
          {sheet.minAttendancePct === null
            ? "sin mínimo de asistencia definido"
            : `mínimo para aprobar: ${sheet.minAttendancePct}%`}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader className="bg-subtle">
            <TableRow>
              <TableHead className="sticky left-0 bg-subtle">Alumno</TableHead>
              {sheet.sessions.map((s) => (
                <TableHead key={s.id} className="text-center">
                  <span className={cn(s.canceledAt && "line-through opacity-60")}>
                    {formatDate(s.date)}
                  </span>
                  <button
                    type="button"
                    title={
                      s.canceledAt
                        ? `Cancelada: ${s.cancelReason ?? ""}`
                        : "Cancelar esta clase"
                    }
                    aria-label={`Cancelar clase ${s.number}`}
                    disabled={Boolean(s.canceledAt)}
                    className="ml-1 align-middle text-muted-foreground hover:text-destructive disabled:opacity-40"
                    onClick={() => void cancelSession(s.id)}
                  >
                    <Ban className="inline h-3 w-3" />
                  </button>
                </TableHead>
              ))}
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.students.map((st) => (
              <TableRow key={st.enrollmentId}>
                <TableCell className="sticky left-0 bg-card font-medium">
                  {st.contactName}
                </TableCell>
                {sheet.sessions.map((s) => {
                  const status = st.bySession[s.id];
                  return (
                    <TableCell key={s.id} className="p-1 text-center">
                      <Select
                        aria-label={`${st.contactName}, clase ${s.number}`}
                        disabled={Boolean(s.canceledAt)}
                        className={cn(
                          "h-7 w-14 px-1 text-center text-xs",
                          status && STATUS_CLASS[status]
                        )}
                        value={status ?? ""}
                        onChange={(e) =>
                          void mark(s.id, st.enrollmentId, e.target.value as AttendanceStatus)
                        }
                      >
                        <option value="">—</option>
                        {(Object.keys(STATUS_SHORT) as AttendanceStatus[]).map((k) => (
                          <option key={k} value={k}>
                            {STATUS_SHORT[k]}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                  );
                })}
                <TableCell className="text-right">
                  {st.percentage === null ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <Badge variant={st.meetsMinimum === false ? "destructive" : "success"}>
                      {st.percentage}%
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        P presente · T tarde (cuenta como presente) · A ausente · J justificado.
        Las clases canceladas y las anteriores a la inscripción de cada alumno no
        cuentan para el porcentaje.
      </p>
    </div>
  );
}
