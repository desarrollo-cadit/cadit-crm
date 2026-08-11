"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CohortDto } from "@/lib/types";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días de la grilla del mes (incluye días del mes anterior/siguiente para completar semanas Lun-Dom). */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = lunes
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

/**
 * 005 (T040, US6, FR-018) — calendario de camadas por fecha, sobre
 * `listCohorts` (T008, ya existía) — sin datos nuevos. Cada camada aparece
 * en cada día dentro de su rango [startDate, endDate ?? startDate].
 */
export function CalendarClient() {
  const [cohorts, setCohorts] = useState<CohortDto[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const refetch = useCallback(async () => {
    const res = await fetch("/api/cohorts").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { cohorts: CohortDto[] };
    setCohorts(data.cohorts);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const cohortsByDay = useMemo(() => {
    const map = new Map<string, CohortDto[]>();
    for (const cohort of cohorts) {
      const start = new Date(cohort.startDate);
      const end = cohort.endDate ? new Date(cohort.endDate) : start;
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      // Evita rangos absurdamente largos en la grilla (defensivo).
      let guard = 0;
      while (cursor <= last && guard < 366) {
        const key = isoDay(cursor);
        const list = map.get(key) ?? [];
        list.push(cohort);
        map.set(key, list);
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    }
    return map;
  }, [cohorts]);

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const today = isoDay(new Date());

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <h2 className="font-semibold capitalize">
          {month.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="bg-subtle px-2 py-1.5 text-center font-medium text-muted-foreground">
              {w}
            </div>
          ))}
          {grid.map((day) => {
            const key = isoDay(day);
            const inMonth = day.getMonth() === month.getMonth();
            const dayCohorts = cohortsByDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={`min-h-[92px] bg-card p-1.5 ${inMonth ? "" : "opacity-40"} ${
                  key === today ? "ring-1 ring-inset ring-primary" : ""
                }`}
              >
                <span className="text-[11px] text-muted-foreground">{day.getDate()}</span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayCohorts.slice(0, 3).map((c) => (
                    <Link
                      key={c.id}
                      href={`/cohorts/${c.id}`}
                      title={`${c.name ?? c.courseName} · ${c.teacher?.name ?? "sin profesor"}`}
                      className="block truncate rounded bg-brand-tint px-1 py-0.5 text-[10.5px] font-medium text-brand-text hover:opacity-80"
                    >
                      {c.startTime && (
                        <span className="mr-1 opacity-80">
                          {c.startTime}
                          {c.endTime ? `–${c.endTime}` : ""}
                        </span>
                      )}
                      {c.name ?? c.courseName}
                    </Link>
                  ))}
                  {dayCohorts.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayCohorts.length - 3} más
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
