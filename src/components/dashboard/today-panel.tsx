"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { agendaDeHoy, type ClaseDeLaAgenda } from "@/lib/agenda-de-hoy";
import { ACADEMY_TIME_ZONE } from "@/lib/schedule-time";
import { cn } from "@/lib/utils";

export type ClaseDeHoy = ClaseDeLaAgenda & {
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  projected: boolean;
};

type Summary = {
  students: number;
  activeCohorts: number;
  upcomingCohorts: number;
  teachers: number;
  today: ClaseDeHoy[];
  timeZone?: string;
};

/**
 * 2026-10-26 — El inicio, rediseñado alrededor de tres preguntas: qué hay que
 * HACER (Para resolver), qué PASA hoy (la agenda) y cómo va el mes.
 *
 * Arriba, el saludo y el pulso de la academia en píldoras chicas: siguen
 * siendo enlaces a donde vive cada número, pero ya no compiten con lo que hay
 * que resolver. Debajo, la fila principal: "Para resolver" a la izquierda
 * (lo llega armado desde el servidor, según capacidades) y la agenda a la
 * derecha. Si la persona no tiene ninguna regla, la agenda ocupa la fila.
 *
 * Una sola lectura de `/api/dashboard/summary` alimenta el pulso y la agenda.
 */
export function TodayPanel({ nombre, paraResolver }: { nombre: string; paraResolver?: ReactNode }) {
  const [datos, setDatos] = useState<Summary | null>(null);
  const ahora = useAhora();

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/summary").catch(() => null);
      if (res?.ok) setDatos((await res.json()) as Summary);
      else setDatos({ students: 0, activeCohorts: 0, upcomingCohorts: 0, teachers: 0, today: [] });
    })();
  }, []);

  const timeZone = datos?.timeZone ?? ACADEMY_TIME_ZONE;
  const hoy = ahora.toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });

  return (
    <>
      {/* El saludo hace que la pantalla sea DE alguien. */}
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
            Hola, {nombre.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm first-letter:uppercase text-muted-foreground">{hoy}</p>
        </div>
        {datos === null ? (
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-7 w-36 rounded-full" />
            ))}
          </div>
        ) : (
          <PulsoDelInicio datos={datos} />
        )}
      </section>

      <section
        className={cn(
          "grid items-start gap-[18px]",
          paraResolver && "min-[1100px]:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"
        )}
      >
        {paraResolver}
        <div className="min-w-0 rounded-lg border bg-card">
          <div className="flex items-baseline justify-between gap-3 px-5 pb-2.5 pt-3.5">
            <h2 className="text-sm font-semibold">Agenda de hoy</h2>
            <Link
              href="/calendar"
              className="text-xs font-medium text-brand-text underline-offset-4 hover:underline"
            >
              Ver el calendario →
            </Link>
          </div>
          {datos === null ? (
            <div className="space-y-2 px-5 pb-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ) : (
            <AgendaDeHoy clases={datos.today} timeZone={timeZone} now={ahora} />
          )}
        </div>
      </section>
    </>
  );
}

/** "Ahora", que avanza solo: la línea de la agenda se mueve con el reloj. */
function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return ahora;
}

/**
 * El pulso de la academia: los mismos números y enlaces que antes eran
 * tarjetas grandes, ahora como píldoras calladas a la derecha del saludo.
 */
export function PulsoDelInicio({ datos }: { datos: Summary }) {
  const clases = datos.today.length;
  const pildoras = [
    { valor: datos.activeCohorts, label: "grupos en curso", href: "/academico" },
    { valor: datos.upcomingCohorts, label: "arrancan en 30 días", href: "/academico" },
    { valor: datos.students, label: "inscripciones", href: "/contacts" },
    { valor: clases, label: clases === 1 ? "clase hoy" : "clases hoy", href: "/calendar" },
  ];
  return (
    <nav aria-label="El pulso de la academia" className="flex flex-wrap gap-1.5">
      {pildoras.map((p) => (
        <Link
          key={p.label}
          href={p.href}
          className="inline-flex items-baseline gap-1.5 rounded-full border bg-card px-3 py-1 text-[13px] text-text-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <b className="font-semibold tabular-nums text-foreground">{p.valor}</b>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * La agenda de hoy como línea de tiempo: lo que terminó, apagado; lo que está
 * en curso, con su marca; y una línea de "ahora" entre las clases, con la hora
 * de la academia. El corte lo decide `agendaDeHoy` (pura, con tests).
 */
export function AgendaDeHoy({
  clases,
  timeZone,
  now,
}: {
  clases: readonly ClaseDeHoy[];
  timeZone: string;
  now: Date;
}) {
  if (clases.length === 0) {
    /* Un vacío que dice qué significa, no un guion. */
    return (
      <p className="px-5 pb-8 pt-4 text-center text-sm text-muted-foreground">
        No hay clases programadas para hoy.
      </p>
    );
  }

  const agenda = agendaDeHoy(clases, { timeZone, now });
  const lineaDeAhora = (
    <li key="ahora" aria-hidden className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2.5 py-0.5">
      <span className="text-[11px] font-semibold tabular-nums text-text-2">{agenda.horaActual}</span>
      <i className="block h-0.5 rounded-full bg-barra-rotulo" />
    </li>
  );

  return (
    <ol className="relative px-5 pb-3.5 pt-1" aria-label="Clases de hoy">
      {/* El hilo vertical que une los puntos. */}
      <span aria-hidden className="absolute bottom-6 left-[88.5px] top-4 w-px bg-border" />
      {agenda.filas.flatMap((c, i) => {
        const terminada = c.estado === "terminada";
        const enCurso = c.estado === "en_curso";
        const fila = (
          <li
            key={`${c.cohortId}-${i}`}
            className={cn(
              "relative grid grid-cols-[52px_14px_minmax(0,1fr)] items-start gap-2.5 py-1.5",
              enCurso && "-mx-2 rounded-md bg-brand-tint px-2"
            )}
          >
            <span
              className={cn(
                "pt-px text-[13px] font-semibold tabular-nums",
                terminada && "font-medium text-muted-foreground"
              )}
            >
              {c.startTime ?? "—"}
            </span>
            <span
              aria-hidden
              className={cn(
                "relative z-[1] mt-[5px] h-[9px] w-[9px] justify-self-center rounded-full border-2",
                terminada
                  ? "border-border-strong bg-border-strong"
                  : enCurso
                    ? "border-brand bg-brand"
                    : "border-brand bg-card"
              )}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Link
                  href={`/cohorts/${c.cohortId}`}
                  className={cn(
                    "max-w-full truncate text-sm font-medium hover:underline",
                    terminada && "text-muted-foreground"
                  )}
                >
                  {c.courseName}
                </Link>
                {enCurso && (
                  <span className="rounded-full bg-brand-soft px-[7px] py-px text-[10.5px] font-semibold text-brand-text">
                    en curso
                  </span>
                )}
                {/* 013 — Una clase proyectada es un DIBUJO: el grupo todavía
                    no generó su cronograma. */}
                {c.projected && (
                  <span className="rounded-full border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                    proyectada
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.cohortName ?? "Sin nombre de grupo"}
                {c.endTime && ` · ${terminada ? "terminó" : "termina"} ${c.endTime}`}
              </span>
            </span>
          </li>
        );
        return i === agenda.ahoraAntesDe ? [lineaDeAhora, fila] : [fila];
      })}
      {agenda.ahoraAntesDe === agenda.filas.length && lineaDeAhora}
    </ol>
  );
}
