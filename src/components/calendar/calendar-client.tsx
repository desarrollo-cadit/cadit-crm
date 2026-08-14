"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CohortDto } from "@/lib/types";
import { cn, WEEKDAY_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
/** Eje horario visible — cubre clases diurnas y nocturnas típicas. */
const DAY_START_MIN = 7 * 60; // 07:00
const DAY_END_MIN = 22 * 60; // 22:00
const PX_PER_MIN = 1.1;
const AXIS_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // 0 = lunes
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return start;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayIndex(d: Date) {
  return (d.getDay() + 6) % 7; // 0 = lunes .. 6 = domingo
}

function parseTimeToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

type PositionedSession = {
  cohort: CohortDto;
  dayIndex: number; // 0=lunes..6=domingo, dentro de la semana visible
  hasTime: boolean;
  topPx: number;
  heightPx: number;
};

/**
 * 005 iteración 4 (feedback en vivo: "no fue hecho como pensaba que se vea,
 * estilo Google Calendar, que se vean los horarios de comienzo a fin") —
 * vista SEMANAL con eje horario, no una grilla de mes con el horario como
 * texto al lado. Cada cohorte aparece SOLO en los días de la semana que
 * declara (`daysOfWeek`, iteración 4) dentro de su rango
 * [startDate, endDate] — antes aparecía en TODOS los días del rango
 * (fines de semana incluidos) porque ese campo no existía.
 */
export function CalendarClient() {
  const [cohorts, setCohorts] = useState<CohortDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Un fallo no se traga: un calendario vacío por un 500 es indistinguible de
  // una semana sin clases. Mismo criterio que la pantalla de gestión académica.
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cohorts");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { cohorts: CohortDto[] };
      setCohorts(data.cohorts);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Sesiones posicionadas para la semana visible: por cada cohorte, por cada
  // día de la semana que declara (o todos si no declaró ninguno), si ese día
  // cae dentro de [startDate, endDate] Y en la semana que se está mostrando.
  const { timed, allDayByDay } = useMemo(() => {
    const timedSessions: PositionedSession[] = [];
    const allDay = new Map<number, CohortDto[]>();

    for (const cohort of cohorts) {
      const start = new Date(cohort.startDate);
      const end = cohort.endDate ? new Date(cohort.endDate) : start;
      const declaredDays = cohort.daysOfWeek
        ? new Set(cohort.daysOfWeek.split(",").map(Number))
        : null;
      const startMin = parseTimeToMinutes(cohort.startTime);
      const endMin = parseTimeToMinutes(cohort.endTime);

      weekDays.forEach((day, dayIndex) => {
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const rangeStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const rangeEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        if (dayStart < rangeStart || dayStart > rangeEnd) return;
        if (declaredDays && !declaredDays.has(weekdayIndex(day))) return;

        if (startMin !== null) {
          const clampedStart = Math.max(startMin, DAY_START_MIN);
          const clampedEnd = Math.min(endMin ?? startMin + 60, DAY_END_MIN);
          timedSessions.push({
            cohort,
            dayIndex,
            hasTime: true,
            topPx: (clampedStart - DAY_START_MIN) * PX_PER_MIN,
            heightPx: Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 18),
          });
        } else {
          const list = allDay.get(dayIndex) ?? [];
          list.push(cohort);
          allDay.set(dayIndex, list);
        }
      });
    }
    return { timed: timedSessions, allDayByDay: allDay };
  }, [cohorts, weekDays]);

  const today = isoDay(new Date());
  const currentMinutes =
    currentTime.getHours() * 60 + currentTime.getMinutes();

  const currentTimeTop =
    (currentMinutes - DAY_START_MIN) * PX_PER_MIN;

  const isCurrentTimeVisible =
    isoDay(currentTime) === today &&
    currentMinutes >= DAY_START_MIN &&
    currentMinutes <= DAY_END_MIN;

  const hours = useMemo(
    () => Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => DAY_START_MIN / 60 + i),
    []
  );

  const rangeLabel = `${weekDays[0]!.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} – ${weekDays[6]!.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="font-semibold capitalize">{rangeLabel}</h2>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {!loading && loadError && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-destructive/50 px-4 py-3">
            <p className="text-sm text-destructive">
              No se pudieron cargar las cohortes. El calendario puede estar vacío
              por error, no por falta de clases.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="min-w-[720px]">
            {/* Encabezado de días */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-px">
              <div />
              {weekDays.map((day, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-t-md bg-subtle px-2 py-1.5 text-center text-xs font-medium",
                    isoDay(day) === today && "bg-brand-tint text-brand-text"
                  )}
                >
                  {WEEKDAY_LABELS[i]} <span className="text-muted-foreground">{day.getDate()}</span>
                </div>
              ))}
            </div>

            {/* Fila de "todo el día" (cohortes sin startTime/endTime) */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-px border-b">
              <div className="py-1 text-right text-[10px] text-muted-foreground">todo el día</div>
              {weekDays.map((_, i) => (
                <div key={i} className="flex flex-col gap-0.5 border-l p-1">
                  {(allDayByDay.get(i) ?? []).map((c) => (
                    <Link
                      key={c.id}
                      href={`/cohorts/${c.id}`}
                      className="block truncate rounded bg-brand-tint px-1 py-0.5 text-[10.5px] font-medium text-brand-text hover:opacity-80"
                    >
                      {c.name ?? c.courseName}
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            {/* Grilla horaria */}
            <div className="relative grid grid-cols-[56px_repeat(7,1fr)] gap-px">
              <div className="relative" style={{ height: AXIS_HEIGHT }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground"
                    style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {weekDays.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className="relative border-l"
                  style={{ height: AXIS_HEIGHT }}
                >
                  {isCurrentTimeVisible && isoDay(day) === today && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-20"
                      style={{ top: currentTimeTop }}
                    >
                      <div className="absolute -left-1.5 -top-[4.5px] h-3 w-3 rounded-full bg-red-500" />
                      <div className="h-0.5 w-full bg-red-500" />
                    </div>
                  )}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute w-full border-t"
                      style={{ top: (h * 60 - DAY_START_MIN) * PX_PER_MIN }}
                    />
                  ))}
                  {timed
                    .filter((s) => s.dayIndex === dayIndex)
                    .map((s, idx) => (
                      <Link
                        key={`${s.cohort.id}-${idx}`}
                        href={`/cohorts/${s.cohort.id}`}
                        title={`${s.cohort.name ?? s.cohort.courseName} · ${s.cohort.startTime}–${s.cohort.endTime ?? ""} · ${s.cohort.teacher?.name ?? "sin profesor"}`}
                        className="absolute left-0.5 right-0.5 overflow-hidden rounded border border-brand/40 bg-brand-tint px-1 py-0.5 text-[10.5px] font-medium text-brand-text hover:opacity-90"
                        style={{ top: s.topPx, height: s.heightPx }}
                      >
                        <span className="block truncate">{s.cohort.name ?? s.cohort.courseName}</span>
                        <span className="block truncate text-[9.5px] opacity-80">
                          {s.cohort.startTime}
                          {s.cohort.endTime ? `–${s.cohort.endTime}` : ""}
                        </span>
                      </Link>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
