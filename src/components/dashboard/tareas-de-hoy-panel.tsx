"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { GrupoDeTareas, Urgencia } from "@/lib/tareas-del-dia";

/**
 * 2026-10-26 — "Para resolver hoy": la bandeja de tareas del inicio.
 *
 * Va al lado de "Hoy" (las clases del día, `today-panel.tsx`) y no adentro:
 * aquel dice qué PASA hoy, esta qué hay que HACER. Las tareas son derivadas
 * (`src/lib/tareas-del-dia.ts`): no hay "hecho" que tildar, se van solas
 * cuando el dato se arregla. Cada regla es una fila plegable con su cantidad;
 * cada item, un enlace al lugar exacto donde se resuelve.
 */
export function TareasDeHoyPanel() {
  const [grupos, setGrupos] = useState<GrupoDeTareas[] | null>(null);
  const [error, setError] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

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

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold">Para resolver hoy</h2>
      </div>

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
        <p className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          Nada pendiente por hoy.
        </p>
      ) : (
        <ul className="divide-y">
          {grupos.map((g) => {
            const abierto = abiertos[g.ruleId] ?? false;
            return (
              <li key={g.ruleId}>
                <button
                  type="button"
                  onClick={() => setAbiertos((a) => ({ ...a, [g.ruleId]: !abierto }))}
                  aria-expanded={abierto}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent"
                >
                  {abierto ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">{g.resumen}</span>
                  </span>
                  <MarcaDeUrgencia urgencia={g.urgencia} />
                </button>
                {abierto && (
                  <ul className="border-t bg-subtle">
                    {g.items.map((t, i) => (
                      <li key={`${t.href}-${i}`}>
                        <Link
                          href={t.href}
                          className="flex items-center gap-3 py-2 pl-12 pr-5 transition-colors hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{t.titulo}</span>
                            {t.detalle && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {t.detalle}
                              </span>
                            )}
                          </span>
                          {t.urgencia === "alta" && <MarcaDeUrgencia urgencia="alta" />}
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
    </section>
  );
}

/** Solo lo urgente lleva marca: si todo se destaca, nada se destaca. */
function MarcaDeUrgencia({ urgencia }: { urgencia: Urgencia }) {
  if (urgencia !== "alta") return null;
  return (
    <span className="shrink-0 rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
      urgente
    </span>
  );
}
