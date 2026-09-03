"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, GraduationCap, Sparkles, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type ClaseDeHoy = {
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  startTime: string | null;
  endTime: string | null;
  projected: boolean;
};

type Summary = {
  students: number;
  activeCohorts: number;
  upcomingCohorts: number;
  teachers: number;
  today: ClaseDeHoy[];
};

/**
 * 021 — El resumen del día.
 *
 * Antes el inicio abría con tres tarjetas de finanzas y licencias:
 * información correcta y completamente impersonal. Lo que faltaba no era un
 * número más, era **una respuesta a "¿qué pasa hoy?"** — que es la pregunta
 * con la que cualquiera abre la plataforma a las nueve de la mañana.
 *
 * Las cifras van arriba y **grandes**: un número de 13px con una etiqueta de
 * 13px al lado no es un indicador, es una fila de tabla. Y las clases de hoy
 * van primero que la facturación a propósito: la plata del mes no cambia lo
 * que hay que hacer en las próximas horas.
 */
export function TodayPanel({ nombre }: { nombre: string }) {
  const [datos, setDatos] = useState<Summary | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dashboard/summary").catch(() => null);
      if (res?.ok) setDatos((await res.json()) as Summary);
      else setDatos({ students: 0, activeCohorts: 0, upcomingCohorts: 0, teachers: 0, today: [] });
    })();
  }, []);

  const hoy = new Date().toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section className="space-y-5">
      {/* El saludo hace que la pantalla sea DE alguien. Es barato y cambia
          por completo cómo se siente entrar. */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {nombre.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-sm capitalize text-muted-foreground">{hoy}</p>
      </div>

      {datos === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra
            icono={<Users className="h-4 w-4" />}
            valor={datos.students}
            label="inscripciones"
            href="/contacts"
          />
          <Cifra
            icono={<GraduationCap className="h-4 w-4" />}
            valor={datos.activeCohorts}
            label="cohortes en curso"
            href="/academico"
            destacada
          />
          <Cifra
            icono={<Sparkles className="h-4 w-4" />}
            valor={datos.upcomingCohorts}
            label="arrancan en 30 días"
            href="/academico"
          />
          <Cifra
            icono={<CalendarDays className="h-4 w-4" />}
            valor={datos.today.length}
            label={datos.today.length === 1 ? "clase hoy" : "clases hoy"}
            href="/calendar"
          />
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Hoy</h2>
          <Link
            href="/calendar"
            className="text-xs font-medium text-brand-text underline-offset-4 hover:underline"
          >
            Ver el calendario
          </Link>
        </div>

        {datos === null ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : datos.today.length === 0 ? (
          /* Un vacío que dice qué significa, no un guion. */
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No hay clases programadas para hoy.
          </p>
        ) : (
          <ul className="divide-y">
            {datos.today.map((c, i) => (
              <li
                key={`${c.cohortId}-${i}`}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-accent"
              >
                {/* La hora primero y en tabular: es por lo que se escanea la
                    lista, y sin `tabular-nums` las cifras bailan. */}
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                  {c.startTime ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/cohorts/${c.cohortId}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {c.courseName}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.cohortName ?? "Sin nombre de edición"}
                    {c.endTime && ` · termina ${c.endTime}`}
                  </span>
                </span>
                {/* 013 — Una clase proyectada es un DIBUJO: la cohorte todavía
                    no generó su cronograma. Decirlo evita que alguien la
                    busque en la planilla de asistencia y no la encuentre. */}
                {c.projected && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    proyectada
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Cifra({
  icono,
  valor,
  label,
  href,
  destacada,
}: {
  icono: React.ReactNode;
  valor: number;
  label: string;
  href: string;
  /** La que importa hoy lleva el color de la marca. Una sola: si todas se
      destacan, ninguna se destaca. */
  destacada?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 transition-colors ${
        destacada
          ? "border-brand-soft bg-brand-tint hover:border-brand"
          : "bg-card hover:bg-accent"
      }`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
          destacada ? "text-brand-text" : "text-muted-foreground"
        }`}
      >
        {icono}
        {label}
      </span>
      <p
        className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${
          destacada ? "text-brand-text" : ""
        }`}
      >
        {valor}
      </p>
    </Link>
  );
}
