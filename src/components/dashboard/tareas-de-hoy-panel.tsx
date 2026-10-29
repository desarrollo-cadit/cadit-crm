"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { GrupoDeTareas, ReglaDeTarea, Urgencia } from "@/lib/tareas-del-dia";
import { cn } from "@/lib/utils";
import { ZonaConScroll } from "./zona-con-scroll";

/**
 * 2026-10-26 — "Para resolver": la bandeja de tareas del inicio, y la zona con
 * presencia de la pantalla (encabezado propio con el tinte del acento y el
 * total de pendientes).
 *
 * Va al lado de la agenda y no adentro: aquella dice qué PASA hoy, esta qué
 * hay que HACER. Las tareas son derivadas (`src/lib/tareas-del-dia.ts`): no
 * hay "hecho" que tildar, se van solas cuando el dato se arregla. Cada regla
 * es una fila plegable con su cantidad; cada item, un enlace al lugar exacto
 * donde se resuelve, con la acción dicha en palabras.
 */
export function TareasDeHoyPanel() {
  const [grupos, setGrupos] = useState<GrupoDeTareas[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hoy").catch(() => null);
      if (res?.ok) {
        setGrupos(((await res.json()) as { grupos: GrupoDeTareas[] }).grupos);
      } else {
        setError(true);
        setGrupos([]);
      }
    })();
  }, []);

  return <ParaResolver grupos={grupos} error={error} />;
}

/** Lo que dice el enlace de cada item: el verbo de lo que se hace allá. */
export const ACCION_DE_REGLA: Record<ReglaDeTarea, string> = {
  asistencia_zoom: "Revisar y confirmar",
  asistencia: "Pasar asistencia",
  grabaciones: "Resolver",
  confirmar: "Confirmar o cancelar",
  facturar: "Ir a facturación",
  leads: "Abrir seguimiento",
  prorrogas: "Aprobar o rechazar",
  resultados: "Confirmar resultados",
};

/** Presentacional: `null` = cargando. */
export function ParaResolver({ grupos, error = false }: { grupos: GrupoDeTareas[] | null; error?: boolean }) {
  // La primera regla (la más urgente) abre desplegada: la pantalla arranca
  // mostrando QUÉ hacer, no solo cuánto.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  // Se cuentan UNIDADES (en asistencia, clases), no items: un item es un grupo.
  const total = grupos?.reduce((s, g) => s + g.cantidad, 0) ?? null;

  return (
    <section
      aria-labelledby="para-resolver"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-brand-soft bg-card shadow-sm"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-brand-soft bg-brand-tint px-5 py-3.5">
        <h2 id="para-resolver" className="flex items-center gap-2.5 text-base font-semibold text-brand-text">
          Para resolver
          {total !== null && !error && (
            <span className="inline-grid h-[26px] min-w-[26px] place-items-center rounded-full bg-brand px-2 text-[13px] font-semibold tabular-nums text-on-accent">
              {total}
            </span>
          )}
        </h2>
      </div>

      {/* Lado a lado con la agenda, mismo alto: la lista se desplaza adentro. */}
      <ZonaConScroll>
        {grupos === null ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : error ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No pudimos cargar las tareas. Volvé a intentar en un momento.
          </p>
        ) : grupos.length === 0 ? (
          /* Un vacío tranquilo: que no haya nada es la buena noticia. */
          <div className="flex items-center gap-3 px-5 py-6">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-success-border bg-success-soft text-success">
              <Check className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Nada pendiente por hoy.</p>
              <p className="text-xs text-muted-foreground">Cuando haya algo para resolver, aparece acá.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {grupos.map((g, indice) => {
              const abierto = abiertos[g.ruleId] ?? indice === 0;
              const urgente = g.urgencia === "alta";
              // Dentro de una regla urgente, se marca CUÁL item lo es; si todos
              // lo son, la marca de la regla ya lo dijo.
              const mixta = urgente && g.items.some((t) => t.urgencia !== "alta");
              return (
                <li key={g.ruleId}>
                  <button
                    type="button"
                    onClick={() => setAbiertos((a) => ({ ...a, [g.ruleId]: !abierto }))}
                    aria-expanded={abierto}
                    className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "text-center text-[22px] font-semibold leading-none tabular-nums",
                        urgente && "text-warning"
                      )}
                    >
                      {g.cantidad}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{g.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{g.resumen}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MarcaDeUrgencia urgencia={g.urgencia} />
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                          abierto && "rotate-90"
                        )}
                        aria-hidden
                      />
                    </span>
                  </button>
                  {abierto && (
                    <ul className="divide-y border-t bg-subtle">
                      {g.items.map((t, i) => (
                        <li key={`${t.href}-${i}`}>
                          <Link
                            href={t.href}
                            className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 pl-5 pr-5 transition-colors hover:bg-accent sm:pl-[76px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-sm">{t.titulo}</span>
                                {mixta && t.urgencia === "alta" && (
                                  <span className="shrink-0 rounded-full border border-warning-border bg-warning-soft px-1.5 text-[10px] font-medium text-warning">
                                    urgente
                                  </span>
                                )}
                              </span>
                              {t.detalle && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {t.detalle}
                                </span>
                              )}
                            </span>
                            <span className="whitespace-nowrap text-xs font-medium text-brand-text group-hover:underline">
                              {ACCION_DE_REGLA[t.ruleId]} →
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ZonaConScroll>
    </section>
  );
}

/** Urgente lleva el color de advertencia; lo de la semana, un gris quieto. */
function MarcaDeUrgencia({ urgencia }: { urgencia: Urgencia }) {
  return urgencia === "alta" ? (
    <span className="whitespace-nowrap rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
      Urgente
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Esta semana
    </span>
  );
}
