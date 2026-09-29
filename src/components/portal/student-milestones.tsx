"use client";

import { Check, Circle, CircleDashed, Minus, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/portal/student-bits";
import { ChipDeEstado } from "@/components/portal/campus";

/**
 * 024 — El recorrido de la cursada: dónde estoy, qué logré, qué falta.
 *
 * Es una LÍNEA DE TIEMPO y no una grilla de medallas, y la diferencia no es
 * estética. Una medalla dice "lograste algo" sin decir cuándo ni respecto de
 * qué; una línea ubica a la persona: esto ya pasó, acá estoy, esto viene.
 * Motivar es mostrar el camino, no repartir premios.
 *
 * Cada hito es un HECHO con fecha, o un hecho que todavía no pasó. No hay
 * puntos, ni niveles, ni rachas: nada que el sistema tenga que inventar. La
 * regla la hace cumplir `buildMilestones()`, en el servidor.
 */

export type MilestoneState =
  | "cumplido"
  | "en_curso"
  | "pendiente"
  | "no_alcanzado"
  | "sin_datos";

export type Milestone = {
  key: string;
  label: string;
  detail: string | null;
  state: MilestoneState;
  at: string | null;
};

const ESTILO: Record<
  MilestoneState,
  { Icon: LucideIcon; punto: string; texto: string; rotulo: string | null }
> = {
  cumplido: {
    Icon: Check,
    punto: "border-brand bg-brand text-on-accent",
    texto: "text-foreground",
    rotulo: null,
  },
  en_curso: {
    Icon: Circle,
    punto: "border-brand bg-background text-brand",
    texto: "font-semibold text-foreground",
    rotulo: "Etapa actual",
  },
  pendiente: {
    Icon: CircleDashed,
    punto: "border-border bg-background text-text-4",
    texto: "text-text-3",
    rotulo: null,
  },
  no_alcanzado: {
    Icon: X,
    punto: "border-danger-border bg-danger-soft text-danger",
    texto: "text-foreground",
    rotulo: null,
  },
  /**
   * Ni cumplido ni fallado: el sistema no sabe. **0% porque nadie pasó lista
   * no es 0% porque no vino** — por eso este estado existe y se dibuja
   * apagado, sin la cruz roja.
   */
  sin_datos: {
    Icon: Minus,
    punto: "border-border bg-secondary text-text-4",
    texto: "text-text-3",
    rotulo: null,
  },
};

export function StudentMilestones({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;

  const logrados = milestones.filter((m) => m.state === "cumplido").length;
  /**
   * El último hito cumplido lleva un chip. Uno solo: un chip en cada renglón
   * deja de celebrar, y "el último que lograste" es un hecho con fecha, no
   * algo que el sistema tenga que inventar.
   */
  const ultimoLogrado = [...milestones].reverse().find((m) => m.state === "cumplido")?.key;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Tu recorrido
        </h2>
        <p className="text-sm font-medium tabular-nums text-text-3">
          {logrados} / {milestones.length}
        </p>
      </div>

      <ol className="mt-5">
        {milestones.map((m, i) => {
          const estilo = ESTILO[m.state];
          const ultimo = i === milestones.length - 1;
          return (
            <li key={m.key} className="relative flex gap-3.5 pb-5 last:pb-0">
              {/*
                La línea que une los hitos se dibuja desde el punto hacia
                abajo, y no en el último: una línea que cae al vacío sugiere
                que falta algo que no existe.
              */}
              {!ultimo && (
                <span
                  className={cn(
                    // Lo recorrido, línea llena; lo que falta, de trazos: la
                    // misma convención que ProgresoDeClases.
                    "absolute left-[13px] top-7 h-[calc(100%-1.75rem)]",
                    m.state === "cumplido"
                      ? "w-0.5 -translate-x-[0.5px] bg-brand"
                      : "w-0 border-l border-dashed border-border-strong"
                  )}
                  aria-hidden
                />
              )}

              <span
                className={cn(
                  "relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2",
                  estilo.punto
                )}
              >
                <estilo.Icon
                  className={cn("h-3.5 w-3.5", m.state === "en_curso" && "fill-current")}
                  strokeWidth={m.state === "cumplido" ? 3 : 2}
                />
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <p className={cn("text-sm", estilo.texto)}>{m.label}</p>
                  {m.key === ultimoLogrado && (
                    <ChipDeEstado tono="curso">
                      Último cumplido
                    </ChipDeEstado>
                  )}
                  {estilo.rotulo && (
                    <ChipDeEstado tono="atencion">
                      {estilo.rotulo}
                    </ChipDeEstado>
                  )}
                </div>
                {(m.detail || m.at) && (
                  <p className="mt-0.5 text-xs text-text-3">
                    {m.at && formatDate(m.at)}
                    {m.at && m.detail && " · "}
                    {m.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
