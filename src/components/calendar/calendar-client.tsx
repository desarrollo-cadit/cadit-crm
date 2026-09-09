"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, WEEKDAY_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

// 013 (T012) — `weekdayIndex` se eliminó junto con la proyección que vivía
// acá: el servidor ya devuelve las clases que van en la semana, así que el
// navegador no vuelve a interpretar `daysOfWeek`. La convención (0=lunes) vive
// ahora en un solo lugar, `buildClassSchedule`.

function parseTimeToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** 013 — Una clase del calendario, tal como la devuelve `/api/calendar`. */
type CalendarClass = {
  cohortId: string;
  cohortName: string;
  courseName: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  canceled: boolean;
  /** `true` = proyección: la cohorte todavía no tiene cronograma generado. */
  projected: boolean;
};

export type PositionedSession = {
  klass: CalendarClass;
  dayIndex: number; // 0=lunes..6=domingo, dentro de la semana visible
  hasTime: boolean;
  topPx: number;
  heightPx: number;
  /** Columna dentro del grupo de clases que se solapan, y cuántas son. */
  column: number;
  columns: number;
  startMin: number;
  endMin: number;
};

/**
 * 013 — Paleta por cohorte.
 *
 * El calendario mostraba todo del mismo color, así que una semana con cuatro
 * cursos distintos era un bloque indistinguible. El color no es decoración:
 * es lo que deja reconocer "esto es Revit" de un vistazo, sin leer.
 *
 * Colores planos y no `bg-brand-*` con opacidad: el acento de la marca es uno
 * solo, y bajarle la opacidad da grises, no variedad.
 */
/**
 * 020 (T021) — La paleta de cohortes salió a tokens.
 *
 * Eran los colores crudos de la paleta de Tailwind, que en tema oscuro dejan
 * ocho manchas claras sobre una pantalla negra. Ahora cada cohorte es un par
 * fondo/texto que el tema invierte entero, y el contraste del par está
 * cubierto por `tests/unit/tema-oscuro.test.ts`.
 *
 * (El nombre viejo de la clase no se escribe ni en este comentario: Tailwind
 * escanea los archivos enteros y generaba la regla muerta igual.)
 *
 * Sigue siendo una paleta CATEGÓRICA: su trabajo es que dos cohortes seguidas
 * se distingan de un vistazo, no comunicar un estado.
 */
const COHORT_COLORS = [
  { bg: "bg-cohort-1", border: "border-cohort-1-fg", text: "text-cohort-1-fg" },
  { bg: "bg-cohort-2", border: "border-cohort-2-fg", text: "text-cohort-2-fg" },
  { bg: "bg-cohort-3", border: "border-cohort-3-fg", text: "text-cohort-3-fg" },
  { bg: "bg-cohort-4", border: "border-cohort-4-fg", text: "text-cohort-4-fg" },
  { bg: "bg-cohort-5", border: "border-cohort-5-fg", text: "text-cohort-5-fg" },
  { bg: "bg-cohort-6", border: "border-cohort-6-fg", text: "text-cohort-6-fg" },
  { bg: "bg-cohort-7", border: "border-cohort-7-fg", text: "text-cohort-7-fg" },
  { bg: "bg-cohort-8", border: "border-cohort-8-fg", text: "text-cohort-8-fg" },
] as const;

/**
 * El color se deriva del id de la cohorte, no de su posición en la lista: así
 * una cohorte conserva SU color entre semanas y entre recargas. Si dependiera
 * del orden, cambiaría de color al aparecer una cohorte nueva.
 */
export function cohortColor(cohortId: string) {
  let hash = 0;
  for (let i = 0; i < cohortId.length; i++) {
    hash = (hash * 31 + cohortId.charCodeAt(i)) | 0;
  }
  return COHORT_COLORS[Math.abs(hash) % COHORT_COLORS.length]!;
}

/**
 * 013 — Reparte en columnas las clases que se pisan en el mismo día.
 *
 * Sin esto, dos clases a la misma hora se dibujan una ENCIMA de la otra: se ve
 * una sola y la de abajo desaparece. Es el mismo reparto que hace cualquier
 * calendario: se agrupan las que se solapan y cada grupo se divide en tantas
 * columnas como haga falta.
 *
 * Se agrupa por SOLAPAMIENTO real y no por hora exacta: una clase de 9 a 11 y
 * otra de 10 a 12 también se pisan, aunque no empiecen juntas.
 */
export function repartirEnColumnas(sesiones: PositionedSession[]): PositionedSession[] {
  const orden = [...sesiones].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin
  );

  const salida: PositionedSession[] = [];
  let grupo: PositionedSession[] = [];
  let finDelGrupo = -Infinity;

  const cerrarGrupo = () => {
    if (grupo.length === 0) return;
    // Dentro del grupo, cada clase toma la primera columna libre.
    const finPorColumna: number[] = [];
    for (const s of grupo) {
      let col = finPorColumna.findIndex((fin) => fin <= s.startMin);
      if (col === -1) {
        col = finPorColumna.length;
        finPorColumna.push(s.endMin);
      } else {
        finPorColumna[col] = s.endMin;
      }
      s.column = col;
    }
    const total = finPorColumna.length;
    for (const s of grupo) s.columns = total;
    salida.push(...grupo);
    grupo = [];
    finDelGrupo = -Infinity;
  };

  for (const s of orden) {
    if (grupo.length > 0 && s.startMin >= finDelGrupo) cerrarGrupo();
    grupo.push(s);
    finDelGrupo = Math.max(finDelGrupo, s.endMin);
  }
  cerrarGrupo();

  return salida;
}

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
  const [classes, setClasses] = useState<CalendarClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [currentTime, setCurrentTime] = useState(() => new Date());

  /**
   * 013 (T012, FR-004) — Se piden las CLASES de la semana visible, no las
   * cohortes.
   *
   * Antes leía `/api/cohorts` y repetía acá los días de la semana declarados.
   * Eso tenía dos problemas: **una clase cancelada seguía apareciendo**
   * (SC-002) porque nadie miraba `class_session`, y la lógica de proyección
   * vivía duplicada en el navegador. Ahora la calcula el servidor con la misma
   * función que genera el cronograma de verdad.
   *
   * Un fallo no se traga: un calendario vacío por un 500 es indistinguible de
   * una semana sin clases.
   */
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const from = weekStart.toISOString();
      const to = addDays(weekStart, 7).toISOString();
      const res = await fetch(
        `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { classes: CalendarClass[] };
      setClasses(data.classes);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

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
    const allDay = new Map<number, CalendarClass[]>();

    // Ya no se proyecta acá: el servidor devuelve las clases que van en esta
    // semana, reales o proyectadas. Lo único que queda es POSICIONARLAS.
    const indicePorDia = new Map<string, number>();
    weekDays.forEach((d, i) => indicePorDia.set(isoDay(d), i));

    for (const klass of classes) {
      const dayIndex = indicePorDia.get(isoDay(new Date(klass.date)));
      if (dayIndex === undefined) continue;

      const startMin = parseTimeToMinutes(klass.startTime);
      const endMin = parseTimeToMinutes(klass.endTime);

      if (startMin !== null) {
        const clampedStart = Math.max(startMin, DAY_START_MIN);
        const clampedEnd = Math.min(endMin ?? startMin + 60, DAY_END_MIN);
        timedSessions.push({
          klass,
          dayIndex,
          hasTime: true,
          topPx: (clampedStart - DAY_START_MIN) * PX_PER_MIN,
          heightPx: Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 18),
          column: 0,
          columns: 1,
          startMin: clampedStart,
          endMin: clampedEnd,
        });
      } else {
        const list = allDay.get(dayIndex) ?? [];
        list.push(klass);
        allDay.set(dayIndex, list);
      }
    }

    // El reparto en columnas es POR DÍA: dos clases del martes se pisan entre
    // sí, pero una del martes y otra del jueves no tienen nada que ver.
    const repartidas: PositionedSession[] = [];
    for (let d = 0; d < 7; d++) {
      repartidas.push(
        ...repartirEnColumnas(timedSessions.filter((s) => s.dayIndex === d))
      );
    }

    return { timed: repartidas, allDayByDay: allDay };
  }, [classes, weekDays]);

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
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-danger-border px-4 py-3">
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
          /*
            021 — Antes era un "Cargando…" suelto: la pantalla quedaba casi
            vacía y después saltaba de golpe a la grilla completa. El esqueleto
            ya ocupa la forma que va a tener, y es lo que usa el resto de la
            app.
          */
          <div className="min-w-[720px] space-y-px">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-px">
              <div />
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-t-md" />
              ))}
            </div>
            <Skeleton className="h-[420px] w-full" />
          </div>
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
                      key={`${c.cohortId}-${c.date}`}
                      href={`/cohorts/${c.cohortId}`}
                      className="block truncate rounded bg-brand-tint px-1 py-0.5 text-[10.5px] font-medium text-brand-text hover:opacity-80"
                    >
                      {c.cohortName}
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
                      <div className="absolute -left-1.5 -top-[4.5px] h-3 w-3 rounded-full bg-now-line" />
                      <div className="h-0.5 w-full bg-now-line" />
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
                    .map((s, idx) => {
                      const color = cohortColor(s.klass.cohortId);
                      // Reparto horizontal: cada clase ocupa su columna dentro
                      // del grupo de las que se pisan. Con `columns === 1` da
                      // el ancho completo de siempre.
                      const anchoPct = 100 / s.columns;
                      return (
                        <Link
                          key={`${s.klass.cohortId}-${idx}`}
                          href={`/cohorts/${s.klass.cohortId}`}
                          title={`${s.klass.cohortName} · ${s.klass.startTime ?? "sin horario"}–${s.klass.endTime ?? ""}${s.klass.canceled ? " · CANCELADA" : ""}${s.klass.projected ? " · proyección (sin cronograma generado)" : ""}`}
                          /**
                           * 013 — Color POR COHORTE, no por estado.
                           *
                           * Antes todo iba con el acento de la marca, así que
                           * una semana con cuatro cursos era un bloque
                           * indistinguible. Y como hoy NINGUNA cohorte tiene
                           * cronograma, el estilo de "proyección" —apagado—
                           * se comía el calendario entero: se veía todo gris.
                           *
                           * Ahora el color dice DE QUÉ es la clase, y el borde
                           * punteado dice que todavía es una proyección. Son
                           * dos informaciones distintas y no compiten.
                           *
                           * Cancelada sí pierde el color: dejó de ser una
                           * clase a la que ir. Pero no desaparece, o la semana
                           * queda idéntica a una donde nunca existió.
                           */
                          className={cn(
                            "absolute overflow-hidden rounded px-1 py-0.5 text-[10.5px] font-medium shadow-sm transition-shadow hover:shadow-md",
                            s.klass.canceled
                              ? "border border-dashed border-border-strong bg-muted text-muted-foreground line-through"
                              : cn(
                                  color.bg,
                                  color.text,
                                  /*
                                    021 — El borde izquierdo grueso se sacó:
                                    un borde de color de más de 1px en una
                                    tarjeta es decoración, y acá no agregaba
                                    nada — el RELLENO ya dice de qué cohorte es
                                    la clase. Lo único que el borde tiene que
                                    comunicar es real vs proyección, y para eso
                                    alcanza sólido contra punteado.

                                    (El nombre de la clase vieja no se escribe
                                    ni acá: Tailwind escanea el archivo entero
                                    y vuelve a generar la regla muerta.)
                                  */
                                  cn(
                                    "border",
                                    color.border,
                                    s.klass.projected && "border-dashed"
                                  )
                                )
                          )}
                          style={{
                            top: s.topPx,
                            height: s.heightPx,
                            left: `calc(${s.column * anchoPct}% + 2px)`,
                            width: `calc(${anchoPct}% - 4px)`,
                          }}
                        >
                          <span className="block truncate">{s.klass.cohortName}</span>
                          {/* Con dos o más clases pisadas la columna es angosta:
                              repetir el horario ahí solo agrega ruido. */}
                          {s.columns === 1 && (
                            <span className="block truncate text-[9.5px] opacity-80">
                              {s.klass.startTime}
                              {s.klass.endTime ? `–${s.klass.endTime}` : ""}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
