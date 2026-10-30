"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { CohortDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coincideCohorteConBusqueda } from "@/lib/academic-filters";
import type { FechasDeModulo, VistaPreviaDelClonDto } from "@/lib/clonar-grupo";

function fecha(ymd: string | null): string {
  if (!ymd) return "sin fecha";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** En qué grupos se puede basar uno nuevo: ni módulos sueltos ni talleres. */
export function gruposQueSirvenDeBase(cohorts: readonly CohortDto[]): CohortDto[] {
  return cohorts
    .filter((c) => c.parentCohortId === null && c.courseKind !== "taller")
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * "Basar en un grupo existente" — el selector de arriba del alta de grupo.
 * Elegir uno precarga el formulario (lo hace quien lo monta); acá se elige,
 * se muestra qué más se copia y qué no, y las fechas de cada módulo.
 */
export function CohortBasePicker({
  cohorts,
  base,
  vista,
  cargando,
  error,
  modulos,
  inicioElegido,
  onElegir,
  onQuitar,
  onCambiarModulo,
}: {
  cohorts: readonly CohortDto[];
  base: CohortDto | null;
  vista: VistaPreviaDelClonDto | null;
  cargando: boolean;
  error: string | null;
  modulos: FechasDeModulo[];
  /** Sin inicio no hay fechas que sugerir para los módulos. */
  inicioElegido: boolean;
  onElegir: (cohort: CohortDto) => void;
  onQuitar: () => void;
  onCambiarModulo: (id: string, campo: "startDate" | "endDate", valor: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const candidatos = useMemo(() => gruposQueSirvenDeBase(cohorts), [cohorts]);
  const resultados = useMemo(
    () =>
      busqueda.trim()
        ? candidatos.filter((c) => coincideCohorteConBusqueda(c, busqueda)).slice(0, 8)
        : [],
    [candidatos, busqueda]
  );

  if (!base) {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed p-3">
        <Label htmlFor="cohort-base-search">Basar en un grupo existente (opcional)</Label>
        <Input
          id="cohort-base-search"
          placeholder="Buscá por curso, nombre o profesor…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Copia su configuración, su material y sus evaluaciones. Sin alumnos ni fechas.
        </p>
        {resultados.length > 0 ? (
          <ul className="max-h-48 divide-y overflow-y-auto rounded-md border" aria-label="Grupos encontrados">
            {resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setBusqueda("");
                    onElegir(c);
                  }}
                >
                  <span className="font-medium">{c.name ?? c.courseName}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.courseName}
                    {c.isSpecialization ? " · Especialización" : ""} · {fecha(c.startDate)} —{" "}
                    {fecha(c.endDate)}
                    {c.teacher ? ` · ${c.teacher.name}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : busqueda.trim() ? (
          <p className="text-xs text-muted-foreground">Ningún grupo coincide.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-subtle p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Basado en</p>
          <p className="truncate text-sm font-medium">{base.name ?? base.courseName}</p>
          <p className="text-xs text-muted-foreground">
            {fecha(base.startDate)} — {fecha(base.endDate)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onQuitar} aria-label="Quitar el grupo base">
          <X className="h-4 w-4" aria-hidden />
          Quitar
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : cargando || !vista ? (
        <p className="text-xs text-muted-foreground">Revisando qué se copia…</p>
      ) : (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <p className="font-medium">También se copia</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              <li>{plural(vista.materialCount, "material del grupo", "materiales del grupo")}</li>
              {vista.classMaterialCount > 0 ? (
                <li>
                  {plural(vista.classMaterialCount, "material de clase", "materiales de clase")}, para
                  asignar a mano a las clases nuevas
                </li>
              ) : null}
              <li>{plural(vista.assessmentCount, "evaluación", "evaluaciones")}, con consigna y rúbrica</li>
              {vista.modules.length > 0 ? (
                <li>{plural(vista.modules.length, "módulo", "módulos")}, cada uno con lo suyo</li>
              ) : null}
            </ul>
          </div>
          <div>
            <p className="font-medium">No se copia</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
              <li>Alumnos, asistencia, notas y entregas</li>
              <li>Clases, grabaciones, avisos y certificados</li>
              <li>Enlaces de reunión y de WhatsApp</li>
              <li>Licencias asignadas y la confirmación</li>
            </ul>
          </div>
        </div>
      )}

      {vista && vista.modules.length > 0 ? (
        <section aria-labelledby="cohort-base-modules" className="space-y-1.5">
          <p id="cohort-base-modules" className="text-xs font-medium">
            Fechas de los módulos
          </p>
          {!inicioElegido ? (
            <p className="text-xs text-muted-foreground">
              Elegí la fecha de inicio para ver las fechas sugeridas de cada módulo.
            </p>
          ) : (
            <ol className="space-y-2">
              {vista.modules.map((origen, i) => {
                const m = modulos.find((x) => x.sourceCohortId === origen.id);
                if (!m) return null;
                return (
                  <li key={origen.id} className="rounded-md border bg-card p-2">
                    <p className="text-xs font-medium">
                      {i + 1}. {origen.name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · original {fecha(origen.startDate)} — {fecha(origen.endDate)}
                      </span>
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`base-mod-start-${origen.id}`}>Inicio</Label>
                        <Input
                          id={`base-mod-start-${origen.id}`}
                          type="date"
                          value={m.startDate}
                          onChange={(e) => onCambiarModulo(origen.id, "startDate", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`base-mod-end-${origen.id}`}>Fin</Label>
                        <Input
                          id={`base-mod-end-${origen.id}`}
                          type="date"
                          value={m.endDate ?? ""}
                          min={m.startDate || undefined}
                          onChange={(e) => onCambiarModulo(origen.id, "endDate", e.target.value)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
