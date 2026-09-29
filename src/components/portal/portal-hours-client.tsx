"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  const [fallo, setFallo] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/portal/hours").catch(() => null);
    if (!res?.ok) {
      setFallo(true);
      return;
    }
    setFallo(false);
    setDatos((await res.json()) as Hours);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!datos) {
    if (!fallo) return <Skeleton className="h-40 w-full" />;
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-destructive">
          No se pudieron cargar las horas dictadas. Intentá nuevamente.
        </p>
        <Button variant="outline" size="sm" onClick={() => void cargar()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (datos.sessions === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No hay clases dictadas registradas a tu nombre. Se mostrarán aquí a
        medida que se registren en el cronograma.
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
              {c.cohortName ?? "Cohorte sin nombre"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {c.sessions} {c.sessions === 1 ? "clase" : "clases"} · {c.hours} h
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Las clases canceladas no se computan. Si detectás alguna diferencia,
        comunicate con la academia; este listado es informativo.
      </p>
    </div>
  );
}
