"use client";

import { colorCategorico, inicialesDeCurso } from "@/lib/cohort-color";
import { cn } from "@/lib/utils";

/**
 * 2026-10-29 — Cómo se VE un curso en cualquier listado: su avatar con el
 * color de la paleta categórica (el mismo del calendario) y el tono de cada
 * estado de cursada. Nacieron en Académico; los usan también Talleres.
 */

/** Iniciales del curso con SU color de la paleta categórica (estable por id). */
export function AvatarDeCurso({
  courseId,
  nombre,
  apagado = false,
}: {
  courseId: string;
  nombre: string;
  /** Finalizados: el color baja para que la vista vaya a lo vigente. */
  apagado?: boolean;
}) {
  const color = colorCategorico(courseId);
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] text-[13px] font-semibold tracking-wide",
        color.bg,
        color.text,
        apagado && "opacity-75 saturate-50"
      )}
    >
      {inicialesDeCurso(nombre)}
    </span>
  );
}

export type EstadoDeGrupo = "planificada" | "en_curso" | "finalizada";

/** El tono de cada estado: en curso = éxito, planificado = acento, finalizado = apagado. */
export const TONO_DE_ESTADO: Record<
  EstadoDeGrupo,
  { punto: string; activo: string; texto: string; pastilla: string }
> = {
  en_curso: {
    punto: "bg-success",
    activo: "bg-success-soft text-success",
    texto: "text-success",
    pastilla: "bg-success-soft text-success",
  },
  planificada: {
    punto: "bg-brand",
    activo: "bg-brand-soft text-brand-text",
    texto: "text-brand-text",
    pastilla: "bg-brand-soft text-brand-text",
  },
  finalizada: {
    punto: "bg-text-4",
    activo: "bg-accent text-text-2",
    texto: "text-text-3",
    pastilla: "bg-accent text-text-3",
  },
};
