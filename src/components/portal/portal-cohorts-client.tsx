"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ACADEMY_TIME_ZONE, conZona } from "@/lib/schedule-time";
import { porcentajeDeProgreso, type ProgresoDeCursada } from "@/lib/cohort-progress";
import { seccionesDeMisGrupos } from "@/lib/teacher-cohort-sections";
import { EncabezadoDeSeccion } from "@/components/listados/filtros";
import { AvatarDeCurso, TONO_DE_ESTADO, type EstadoDeGrupo } from "@/components/listados/curso-visual";

type Cohort = {
  id: string;
  /** 2026-10-30 — Para el color del avatar (el mismo del curso en Académico y el calendario). */
  courseId: string;
  name: string | null;
  courseName: string;
  /**
   * 028 (FR-029) — Cuando esta cohorte es un MÓDULO de un programa, su nombre
   * y el LUGAR del módulo dentro de él. `null` en una cohorte suelta.
   *
   * Es lo único que el portal del profesor gana con las especializaciones:
   * "Módulo 2" a secas no dice de cuál de las cuatro EBIM es. Nada del árbol
   * viaja hasta acá — ni los módulos hermanos, ni sus alumnos, ni sus notas.
   *
   * `ordinal` y no `position`: el número guardado es una CLAVE DE ORDEN, y una
   * especialización cargada 10/20/30 —el hueco que se deja para insertar un
   * módulo en el medio— haría que esta pantalla dijera "Módulo 30". El ordinal
   * lo deriva el servidor del lugar en el programa, igual que la grilla del
   * staff y el recorrido del alumno.
   */
  program: { name: string; ordinal: number | null } | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  classroom: string | null;
  status: "planificada" | "en_curso" | "finalizada";
  role: "titular" | "suplente";
  students: number;
  /** 2026-10-30 — "Clase X de Y"; `null` sin cronograma. */
  progress?: ProgresoDeCursada | null;
};

const ESTADO: Record<
  Cohort["status"],
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  en_curso: { label: "En curso", variant: "success" },
  planificada: { label: "Por iniciar", variant: "warning" },
  finalizada: { label: "Finalizado", variant: "secondary" },
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
  // La zona de la academia: la hora de cada cohorte se dice en ella.
  const [timezone, setTimezone] = useState<string>(ACADEMY_TIME_ZONE);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/cohorts").catch(() => null);
      if (!res?.ok) {
        setError("No pudimos cargar tus grupos. Suele ser algo momentáneo: en unos minutos deberían aparecer.");
        setCohorts([]);
        return;
      }
      const body = (await res.json()) as { cohorts: Cohort[]; timezone?: string };
      if (body.timezone) setTimezone(body.timezone);
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
        <p className="text-sm font-medium">No tenés grupos asignados</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Los grupos se mostrarán aquí cuando la academia te asigne uno o te
          designe como suplente en una clase.
        </p>
      </div>
    );
  }

  /**
   * 2026-10-30 — Como Académico: secciones con el tono de su estado y su
   * cantidad (En curso, Próximos, Finalizados), y cada grupo con el color de
   * su curso y "Clase X de Y".
   */
  const { enCurso, proximos, finalizados } = seccionesDeMisGrupos(cohorts);

  return (
    <div className="space-y-6">
      {enCurso.length === 0 && proximos.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay grupos en curso ni por empezar.</p>
      )}
      {enCurso.length > 0 && (
        <Grupo id="mis-grupos-en-curso" titulo="En curso" tono="en_curso" cohorts={enCurso} timezone={timezone} />
      )}
      {proximos.length > 0 && (
        <Grupo id="mis-grupos-proximos" titulo="Próximos" tono="planificada" cohorts={proximos} timezone={timezone} />
      )}
      {finalizados.length > 0 && (
        <Grupo
          id="mis-grupos-finalizados"
          titulo="Finalizados"
          tono="finalizada"
          cohorts={finalizados}
          timezone={timezone}
        />
      )}
    </div>
  );
}

/** "Clase 6 de 10 · 60 %" con su barra, como en el listado de Académico. */
function BarraDeProgreso({ progreso }: { progreso: ProgresoDeCursada }) {
  const pct = porcentajeDeProgreso(progreso);
  return (
    <div className="mt-3 flex min-w-0 flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Clase {progreso.dictadas} de {progreso.total}
        </span>
        <span className="tabular-nums">{pct} %</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Clase ${progreso.dictadas} de ${progreso.total}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-accent"
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Grupo({
  id,
  titulo,
  tono,
  cohorts,
  timezone,
}: {
  id: string;
  titulo: string;
  tono: EstadoDeGrupo;
  cohorts: Cohort[];
  /** Zona de la academia, para decir de qué zona es la hora. */
  timezone: string;
}) {
  const colores = TONO_DE_ESTADO[tono];
  return (
    <section aria-labelledby={id}>
      <EncabezadoDeSeccion
        id={id}
        titulo={titulo}
        cantidad={cohorts.length}
        claseTexto={colores.texto}
        clasePastilla={colores.pastilla}
      />
      <ul className="space-y-2">
        {cohorts.map((c) => (
          <li key={c.id}>
            <Link
              href={`/portal/cohortes/${c.id}`}
              className="block rounded-lg border bg-card p-[var(--portal-card-pad)] shadow-sm transition-colors hover:border-brand-soft hover:bg-accent"
            >
              <div className="flex items-start gap-3">
                <AvatarDeCurso
                  courseId={c.courseId ?? c.id}
                  nombre={c.courseName}
                  apagado={c.status === "finalizada"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{c.courseName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.name ?? "Grupo sin nombre"}
                  </p>
                  {c.program && (
                    <p className="truncate text-xs text-text-3">
                      {c.program.ordinal !== null &&
                        `Módulo ${c.program.ordinal} · `}
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
                  {c.startTime && ` · ${conZona(c.startTime, timezone)}`}
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
              {c.status === "en_curso" && c.progress && <BarraDeProgreso progreso={c.progress} />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
