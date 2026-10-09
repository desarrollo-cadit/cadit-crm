"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarSearch, RotateCcw, Search, Unlink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CandidatesDto, ClassOptionDto, RecordingRowDto } from "@/server/zoom/recordings";

type ApiError = { code?: string; message?: string; current?: ClassOptionDto["current"] };

async function leerError(res: Response | null): Promise<ApiError> {
  const body = (await res?.json().catch(() => null)) as { error?: ApiError } | null;
  return body?.error ?? { message: "No pudimos completar la acción. Probá de nuevo en un momento." };
}

/**
 * 030 US3 — Asignar una grabación a una clase, a mano.
 *
 * Tres caminos para llegar a la clase, de lo más probable a lo menos:
 *  1. **Sugeridas**: las candidatas del matcher (si quedó ambigua o en
 *     conflicto) y las clases reales del mismo día.
 *  2. **Cohorte → clase**: se busca la cohorte (o el curso) por texto, se
 *     elige y aparecen todas sus clases reales.
 *  3. **Por día**: todas las clases reales de una fecha, en cualquier aula.
 *
 * Una clase que ya tiene enlace (pegado a mano u otra grabación) se marca, y
 * elegirla pide confirmar QUÉ se reemplaza. Lo que se decide acá no lo
 * deshace ninguna sincronización.
 */
export function AssignDialog({
  row,
  timezone,
  onChanged,
  onClose,
}: {
  row: RecordingRowDto;
  timezone: string;
  onChanged: (row: RecordingRowDto) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<CandidatesDto | null>(null);
  const [q, setQ] = useState("");
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ clase: ClassOptionDto; current: NonNullable<ClassOptionDto["current"]> } | null>(
    null
  );

  const fecha = useMemo(
    () => new Intl.DateTimeFormat("es-UY", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    [timezone]
  );

  const cargar = useCallback(async () => {
    const p = new URLSearchParams();
    if (q.trim().length >= 2) p.set("q", q.trim());
    if (cohortId) p.set("cohortId", cohortId);
    else if (date) p.set("date", date);
    const res = await fetch(`/api/recordings/${row.id}/candidates?${p.toString()}`).catch(() => null);
    if (!res?.ok) {
      setError((await leerError(res)).message ?? null);
      return;
    }
    setData((await res.json()) as CandidatesDto);
  }, [row.id, q, cohortId, date]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function accion(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, init).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      onChanged((await res.json()) as RecordingRowDto);
      return { ok: true as const };
    }
    return { ok: false as const, error: await leerError(res) };
  }

  async function asignar(clase: ClassOptionDto, replace = false) {
    const r = await accion(`/api/recordings/${row.id}/assignment`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classSessionId: clase.id, ...(replace ? { replace: true } : {}) }),
    });
    if (r.ok) {
      setConfirmar(null);
      onClose();
      return;
    }
    if (r.error.code === "requiere_reemplazo" && r.error.current) {
      setConfirmar({ clase, current: r.error.current });
      return;
    }
    setError(r.error.message ?? "No pudimos asignar la grabación.");
  }

  async function desasignar() {
    const r = await accion(`/api/recordings/${row.id}/assignment`, { method: "DELETE" });
    if (!r.ok) setError(r.error.message ?? "No pudimos desasignar la grabación.");
    else void cargar();
  }

  async function volverAAutomatico() {
    const r = await accion(`/api/recordings/${row.id}/assignment/reset`, { method: "POST" });
    if (!r.ok) setError(r.error.message ?? "No pudimos volver a la asignación automática.");
    else void cargar();
  }

  const actual = row.assignment.classSession;

  function opcion(c: ClassOptionDto) {
    const esLaActual = actual?.id === c.id;
    const ajena = c.current && !(c.current.kind === "zoom" && c.current.recordingId === row.id);
    return (
      <li key={c.id}>
        <button
          type="button"
          disabled={busy || c.canceled || esLaActual}
          onClick={() => void asignar(c)}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-sm hover:border-text-3 disabled:cursor-not-allowed disabled:opacity-60"
          data-class-id={c.id}
        >
          <span className="font-medium text-foreground">
            {c.cohortName} · clase {c.number}
          </span>
          <span className="text-muted-foreground">
            {c.startsAt ? fecha.format(new Date(c.startsAt)) : `${c.date} (sin horario)`}
          </span>
          {c.roomName && <span className="text-xs text-muted-foreground">{c.roomName}</span>}
          {c.canceled && <Badge variant="outline">Cancelada</Badge>}
          {esLaActual && <Badge variant="success">Asignada acá</Badge>}
          {!esLaActual && ajena && (
            <Badge variant="warning">{c.current!.kind === "manual" ? "Tiene enlace manual" : "Tiene otra grabación"}</Badge>
          )}
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4" role="region" aria-label="Asignar grabación a una clase">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">Asignar a una clase</p>
          <p className="text-muted-foreground">
            {actual ? (
              <>
                Asignada a <span className="font-medium text-foreground">{actual.cohortName} · clase {actual.number}</span>{" "}
                ({row.assignment.mode === "manual" ? "a mano" : "automática"}).
              </>
            ) : (
              <>Sin clase asignada{row.assignment.mode === "manual" ? " (decisión manual: la sincronización no la cambia)" : ""}.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actual && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void desasignar()}>
              <Unlink className="h-3.5 w-3.5" /> Desasignar
            </Button>
          )}
          {row.assignment.mode === "manual" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void volverAAutomatico()}>
              <RotateCcw className="h-3.5 w-3.5" /> Volver a automático
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {confirmar && (
        <div className="space-y-2 rounded-md border border-warning-border bg-warning-soft p-3 text-sm" role="alert">
          <p className="text-foreground">
            {confirmar.current.kind === "manual"
              ? `${confirmar.clase.cohortName} · clase ${confirmar.clase.number} ya tiene un enlace de grabación cargado a mano. Si seguís, se reemplaza por esta grabación de Zoom.`
              : `${confirmar.clase.cohortName} · clase ${confirmar.clase.number} ya tiene otra grabación de Zoom. Si seguís, esa queda sin clase.`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void asignar(confirmar.clase, true)}>
              Reemplazar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sugeridas</p>
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.suggested.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay clases ese día ni candidatas. Buscá la cohorte abajo.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="sugeridas">
            {data.suggested.map(opcion)}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Buscar otra clase</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-3">
            Cohorte o curso
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                id={`assign-q-${row.id}`}
                className="w-64 pl-8"
                placeholder="Ej.: Revit, Civil 3D…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCohortId(null);
                }}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-3">
            O un día
            <span className="relative">
              <Input
                id={`assign-date-${row.id}`}
                type="date"
                className="w-44"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setCohortId(null);
                }}
              />
            </span>
          </label>
          {(cohortId || date) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCohortId(null);
                setDate("");
              }}
            >
              <CalendarSearch className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </div>

        {data && data.cohorts.length > 0 && !cohortId && (
          <ul className="flex flex-wrap gap-2" data-testid="cohortes">
            {data.cohorts.map((c) => (
              <li key={c.id}>
                <Button size="sm" variant="outline" onClick={() => setCohortId(c.id)}>
                  {c.name}
                  {c.name !== c.courseName && <span className="text-muted-foreground"> · {c.courseName}</span>}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && data && data.cohorts.length === 0 && !cohortId && (
          <p className="text-sm text-muted-foreground">Ninguna cohorte coincide con «{q.trim()}».</p>
        )}

        {data && (cohortId || date) && (
          data.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {cohortId ? "Esa cohorte todavía no tiene cronograma generado." : "No hay clases ese día."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto" data-testid="resultados">
              {data.results.map(opcion)}
            </ul>
          )
        )}
      </section>
    </div>
  );
}
