"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Cohort = {
  id: string;
  name: string | null;
  courseName: string;
  /**
   * 028 (FR-029) — Cuando esta cohorte es un MÓDULO de un programa, su nombre
   * y su número de orden. `null` en una cohorte suelta.
   *
   * Es lo único que el portal del profesor gana con las especializaciones:
   * "Módulo 2" a secas no dice de cuál de las cuatro EBIM es. Nada del árbol
   * viaja hasta acá — ni los módulos hermanos, ni sus alumnos, ni sus notas.
   */
  program: { name: string; position: number | null } | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  classroom: string | null;
  status: "planificada" | "en_curso" | "finalizada";
  role: "titular" | "suplente";
  students: number;
};

const ESTADO: Record<
  Cohort["status"],
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  en_curso: { label: "En curso", variant: "success" },
  planificada: { label: "Por empezar", variant: "warning" },
  finalizada: { label: "Finalizada", variant: "secondary" },
};

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * 014 (T024) — Mis cohortes.
 *
 * **Ovidio tiene 18.** Una lista plana de 18 tarjetas iguales es inservible un
 * martes a las 18:30, así que las que están EN CURSO van primero y separadas:
 * lo que se usa hoy no debería competir con lo que terminó el año pasado.
 */
export function PortalCohortsClient() {
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/cohorts").catch(() => null);
      if (!res?.ok) {
        setError("No se pudieron cargar tus cohortes.");
        setCohorts([]);
        return;
      }
      const body = (await res.json()) as { cohorts: Cohort[] };
      setCohorts(body.cohorts);
    })();
  }, []);

  if (cohorts === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  if (cohorts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">Todavía no tenés cohortes asignadas</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Cuando la academia te asigne una, o cuando cubras una clase, va a
          aparecer acá.
        </p>
      </div>
    );
  }

  const activas = cohorts.filter((c) => c.status !== "finalizada");
  const cerradas = cohorts.filter((c) => c.status === "finalizada");

  return (
    <div className="space-y-6">
      <Grupo titulo="Ahora" cohorts={activas} vacio="Ninguna cohorte abierta." />
      {cerradas.length > 0 && (
        <Grupo titulo={`Finalizadas (${cerradas.length})`} cohorts={cerradas} />
      )}
    </div>
  );
}

function Grupo({
  titulo,
  cohorts,
  vacio,
}: {
  titulo: string;
  cohorts: Cohort[];
  vacio?: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h2>
      {cohorts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="space-y-2">
          {cohorts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/cohortes/${c.id}`}
                className="block rounded-lg border p-[var(--portal-card-pad)] shadow-sm transition-colors hover:border-brand-soft hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{c.courseName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {c.name ?? "Sin nombre de edición"}
                    </p>
                    {c.program && (
                      <p className="truncate text-xs text-text-3">
                        {c.program.position !== null &&
                          `Módulo ${c.program.position} · `}
                        {c.program.name}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={ESTADO[c.status].variant}>
                      {ESTADO[c.status].label}
                    </Badge>
                    {/* Por qué te aparece una cohorte que no es tuya. */}
                    {c.role === "suplente" && (
                      <span className="text-[10px] text-muted-foreground">
                        suplencia
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {fecha(c.startDate)}
                    {c.startTime && ` · ${c.startTime}`}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {c.students} {c.students === 1 ? "alumno" : "alumnos"}
                  </span>
                  {c.classroom && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {c.classroom}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
