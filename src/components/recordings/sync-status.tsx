"use client";

import { useMemo } from "react";
import type { SyncStatusDto } from "@/server/zoom/recordings";

/**
 * 030 US5 — El estado de la sincronización, arriba de la tabla.
 *
 * Presentacional: el sondeo vive en `RecordingsClient`, que es quien sabe
 * cuándo recargar la tabla. Muestra la última corrida de cada conexión
 * (cuándo, resultado, nuevas, adjudicadas, ambiguas, en conflicto y el error
 * legible), "corriendo desde HH:MM" mientras haya una corrida —sea del botón
 * o de la periódica— y cada cuánto corre la periódica, o que está apagada.
 * Colores solo por tokens.
 */

const CORRIDA: Record<string, string> = {
  corriendo: "Corriendo",
  ok: "Completa",
  parcial: "Parcial",
  error: "Con error",
};

export function SyncStatus({ status, timezone }: { status: SyncStatusDto | null; timezone: string }) {
  const fecha = useMemo(
    () => new Intl.DateTimeFormat("es-UY", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }),
    [timezone]
  );
  const hora = useMemo(
    () => new Intl.DateTimeFormat("es-UY", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }),
    [timezone]
  );
  if (!status) return null;
  const conexiones = status.connections;
  if (conexiones.length === 0 && !status.running) return null;

  const intervalo = status.periodicIntervalMin;
  return (
    <div className="space-y-1 text-xs text-muted-foreground" data-sync-status>
      {status.running && (
        <p className="font-medium text-foreground" data-sync-running>
          Sincronización corriendo desde las {hora.format(new Date(status.running.startedAt))}.
        </p>
      )}
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {conexiones.map((c) => (
          <li key={c.id} data-sync-connection={c.id}>
            <span className="font-medium text-foreground">{c.name}</span>
            {c.lastRun ? (
              <>
                {" "}
                · última: {CORRIDA[c.lastRun.status] ?? c.lastRun.status}
                {c.lastRun.finishedAt && <> el {fecha.format(new Date(c.lastRun.finishedAt))}</>}
                {c.lastRun.status !== "corriendo" && (
                  <>
                    {" "}
                    · {c.lastRun.newCount} nuevas · {c.lastRun.assignedCount} adjudicadas
                    {c.lastRun.ambiguousCount > 0 && <> · {c.lastRun.ambiguousCount} ambiguas</>}
                    {c.lastRun.conflictCount > 0 && <> · {c.lastRun.conflictCount} en conflicto</>}
                  </>
                )}
                {c.lastRun.error && <span className="text-destructive"> · {c.lastRun.error}</span>}
              </>
            ) : (
              " · nunca sincronizada"
            )}
          </li>
        ))}
        <li data-sync-periodic={intervalo}>
          {intervalo > 0
            ? `Sincronización automática: cada ${intervalo} min.`
            : "Sincronización automática apagada: solo con el botón."}
        </li>
      </ul>
    </div>
  );
}
