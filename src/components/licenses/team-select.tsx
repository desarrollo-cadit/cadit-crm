"use client";

import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/select";

/**
 * 0089 — El selector de «Equipo» que acompaña a toda asignación de licencia
 * (individual, de un grupo). Cada licencia descuenta del cupo del equipo que se
 * elige acá, así que el selector muestra cuántas quedan en cada uno para el
 * programa elegido y no ofrece los que no tienen.
 */

export type EquipoOpcion = {
  id: string;
  name: string;
  archived: boolean;
  seats: { softwareId: string; total: number; ocupadas: number; libres: number }[];
};

const CLAVE_ULTIMO_EQUIPO = "licencias:ultimo-equipo";

/** Conveniencia por persona: puede no haber `localStorage` (ventana privada). */
export function leerEquipoRecordado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_ULTIMO_EQUIPO);
  } catch {
    return null;
  }
}

export function recordarEquipo(teamId: string): void {
  try {
    window.localStorage.setItem(CLAVE_ULTIMO_EQUIPO, teamId);
  } catch {
    /* sin almacenamiento: se vuelve a elegir la próxima vez */
  }
}

/**
 * Una lectura compartida: una fila de roster por alumno monta uno de estos
 * selectores, y un pedido por fila sería cientos. Se reusa durante unos
 * segundos y se pide de nuevo tras cada asignación (`cargarEquipos(true)`).
 */
let enCurso: { en: number; promesa: Promise<EquipoOpcion[]> } | null = null;

export function cargarEquipos(forzar = false): Promise<EquipoOpcion[]> {
  if (!forzar && enCurso && Date.now() - enCurso.en < 10_000) return enCurso.promesa;
  const promesa = fetch("/api/license-teams")
    .then(async (res) => {
      if (!res.ok) return [];
      const body = (await res.json()) as { teams: EquipoOpcion[] };
      return body.teams;
    })
    .catch(() => []);
  enCurso = { en: Date.now(), promesa };
  return promesa;
}

/** Los equipos de licencias, o `null` mientras cargan. Sin `activo`, no pide nada. */
export function useEquiposDeLicencias(activo = true) {
  const [equipos, setEquipos] = useState<EquipoOpcion[] | null>(null);
  const recargar = useCallback(async () => {
    setEquipos(await cargarEquipos(true));
  }, []);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    void cargarEquipos().then((e) => {
      if (vigente) setEquipos(e);
    });
    return () => {
      vigente = false;
    };
  }, [activo]);
  return { equipos, recargar };
}

/** Las libres de un programa en un equipo (0 si el equipo no tiene cupo de él). */
export function libresDe(equipo: EquipoOpcion, softwareId: string): number {
  return equipo.seats.find((s) => s.softwareId === softwareId)?.libres ?? 0;
}

/**
 * El equipo con el que arranca el selector: el último que usó esta persona si
 * sigue activo y tiene cupo del programa; si no, el primero que tiene.
 */
export function equipoInicial(equipos: readonly EquipoOpcion[], softwareId: string | null): string {
  const activos = equipos.filter((e) => !e.archived);
  const conCupo = softwareId ? activos.filter((e) => libresDe(e, softwareId) > 0) : activos;
  const recordado = leerEquipoRecordado();
  return (
    conCupo.find((e) => e.id === recordado)?.id ??
    activos.find((e) => e.id === recordado)?.id ??
    conCupo[0]?.id ??
    activos[0]?.id ??
    ""
  );
}

export function TeamSelect({
  equipos,
  softwareId,
  value,
  onChange,
  className = "h-7 w-auto px-1.5 py-0.5 text-xs",
  label = "Equipo de licencias",
}: {
  equipos: readonly EquipoOpcion[];
  /** Con programa elegido, cada opción dice cuántas libres tiene y se desactiva sin cupo. */
  softwareId: string | null;
  value: string;
  onChange: (teamId: string) => void;
  className?: string;
  label?: string;
}) {
  const activos = equipos.filter((e) => !e.archived);
  return (
    <Select
      className={className}
      value={value}
      aria-label={label}
      onChange={(ev) => {
        recordarEquipo(ev.target.value);
        onChange(ev.target.value);
      }}
    >
      {activos.length === 0 && <option value="">sin equipos</option>}
      {activos.map((e) => {
        const libres = softwareId ? libresDe(e, softwareId) : null;
        return (
          <option key={e.id} value={e.id} disabled={libres !== null && libres <= 0}>
            {libres === null ? e.name : `${e.name} · ${libres > 0 ? `${libres} libres` : "sin cupo"}`}
          </option>
        );
      })}
    </Select>
  );
}
