"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Hours = {
  sessions: number;
  hours: number;
  byCohort: {
    cohortId: string;
    cohortName: string | null;
    sessions: number;
    hours: number;
  }[];
};

/**
 * 014 (T030, US5/FR-010) — Mis horas dictadas.
 *
 * **Sin tarifa, ni la suya ni la de nadie.** El campo no viaja en la respuesta,
 * así que no hay nada que esconder acá. Lo que resuelve esta pantalla es que el
 * profesor pueda controlar que le liquiden las clases correctas — para eso
 * alcanza con saber cuáles fueron.
 */
export function PortalHoursClient() {
  const [datos, setDatos] = useState<Hours | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/hours").catch(() => null);
      if (res?.ok) setDatos((await res.json()) as Hours);
    })();
  }, []);

  if (!datos) return <Skeleton className="h-40 w-full" />;

  if (datos.sessions === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Todavía no hay clases dictadas registradas a tu nombre. Aparecen acá a
        medida que se cargan en el cronograma.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-semibold">{datos.sessions}</p>
          <p className="text-xs text-muted-foreground">clases dictadas</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-2xl font-semibold">{datos.hours}</p>
          <p className="text-xs text-muted-foreground">horas</p>
        </div>
      </div>

      <ul className="divide-y rounded-lg border">
        {datos.byCohort.map((c) => (
          <li key={c.cohortId} className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0 truncate text-sm">
              {c.cohortName ?? "Sin nombre de edición"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {c.sessions} {c.sessions === 1 ? "clase" : "clases"} · {c.hours} h
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Las clases canceladas no se cuentan: no se dictaron. Si ves algo que no
        cierra, habla con la academia — este listado es informativo.
      </p>
    </div>
  );
}
