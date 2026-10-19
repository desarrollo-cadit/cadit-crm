"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatearDia } from "@/lib/access-expiry";
import { notify } from "@/lib/notify";

/**
 * 043 — Hasta cuándo ve una persona los contenidos de una cursada, para el
 * staff (roster de la cohorte y legajo).
 *
 * Dice de dónde sale la fecha —calculada (un mes después del fin), fijada a
 * mano (por quién y cuándo), o sin fecha (la cohorte no tiene fin ni clases:
 * no vence)— y, con `academico.editar`, deja fijarla o volver a la calculada.
 * La barrera real es la ruta (`PATCH /api/enrollments/[id]/access-until`).
 */

export type EstadoDeAccesoDto = {
  enrollmentId: string;
  hasta: string | null;
  calculada: string | null;
  referencia: string | null;
  origen: "calculado" | "manual" | "sin_fecha";
  vencido: boolean;
  terminaEn: string | null;
  heredadoDe: string | null;
  fijadoPor: string | null;
  fijadoEn: string | null;
};

/** "Acceso hasta el 14 nov. 2026 · calculado" en una línea, para la tabla. */
export function resumenDeAcceso(e: EstadoDeAccesoDto | undefined): string | null {
  if (!e) return null;
  if (!e.hasta) return "Acceso sin vencimiento";
  const fecha = formatearDia(e.hasta);
  const origen = e.origen === "manual" ? "fijado a mano" : "calculado";
  return e.vencido ? `Acceso vencido el ${fecha} (${origen})` : `Acceso hasta el ${fecha} (${origen})`;
}

export function AccessUntilLine({
  estado,
  canEdit,
  onChanged,
}: {
  estado: EstadoDeAccesoDto | undefined;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState("");
  const [guardando, setGuardando] = useState(false);

  if (!estado) return null;

  async function guardar(accessUntil: string | null) {
    if (!estado) return;
    setGuardando(true);
    const res = await fetch(`/api/enrollments/${estado.enrollmentId}/access-until`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessUntil }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudo guardar la fecha de acceso");
      return;
    }
    notify.success(accessUntil ? "Fecha de acceso guardada" : "Volvió a la fecha calculada");
    setEditando(false);
    onChanged();
  }

  const heredada = estado.heredadoDe !== null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span>
        {estado.hasta ? (
          <>
            Acceso a grabaciones y material {estado.vencido ? "vencido el" : "hasta el"}{" "}
            <strong>{formatearDia(estado.hasta)}</strong>
          </>
        ) : (
          <>Acceso a grabaciones y material sin vencimiento</>
        )}
      </span>
      {estado.vencido && <Badge variant="destructive">Vencido</Badge>}
      {estado.origen === "manual" ? (
        <Badge variant="warning">
          Fijada a mano
          {estado.fijadoPor ? ` por ${estado.fijadoPor}` : ""}
          {estado.fijadoEn ? ` el ${new Date(estado.fijadoEn).toLocaleDateString("es-UY")}` : ""}
        </Badge>
      ) : estado.origen === "calculado" ? (
        <Badge variant="secondary">Calculada: un mes después del fin</Badge>
      ) : (
        <Badge variant="outline">La cohorte no tiene fecha de fin ni clases</Badge>
      )}
      {estado.origen === "manual" && estado.calculada && (
        <span className="text-muted-foreground">(la calculada sería el {formatearDia(estado.calculada)})</span>
      )}
      {heredada && (
        <span className="text-muted-foreground">Se define en la inscripción a la especialización.</span>
      )}

      {canEdit && !heredada && !editando && (
        <>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => {
              setFecha(estado.hasta ?? "");
              setEditando(true);
            }}
          >
            {estado.origen === "manual" ? "Cambiar fecha" : "Extender o cambiar"}
          </button>
          {estado.origen === "manual" && (
            <button
              type="button"
              className="text-muted-foreground underline"
              disabled={guardando}
              onClick={() => void guardar(null)}
            >
              Volver a la calculada
            </button>
          )}
        </>
      )}

      {editando && (
        <span className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
          <label className="sr-only" htmlFor={`acceso-${estado.enrollmentId}`}>
            Acceso hasta
          </label>
          <Input
            id={`acceso-${estado.enrollmentId}`}
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-8 w-40"
          />
          <Button size="sm" disabled={!fecha || guardando} onClick={() => void guardar(fecha)}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </span>
      )}
    </div>
  );
}
