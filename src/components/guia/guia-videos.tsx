"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Modal } from "@/components/ui/modal";

type Item = { id: string; titulo: string };
type Seccion = { grupo: string; videos: Item[] };

/**
 * Los mini-tutoriales de la guía: una grilla de tarjetas con su portada, y el
 * video en un diálogo al hacer clic. Sin dependencias: el reproductor es el del
 * navegador (`<video controls>`), que ya trae pantalla completa y velocidad.
 *
 * `base` es la ruta de la audiencia (`/api/guia/videos`, `/api/portal/guia/alumno`…):
 * cada una tiene su propia puerta en el servidor. Acá no se decide quién ve qué;
 * llegan solo los videos que la página ya filtró.
 */
export function GuiaVideos({ secciones, base }: { secciones: Seccion[]; base: string }) {
  const [abierto, setAbierto] = useState<Item | null>(null);

  return (
    <div className="space-y-6">
      {secciones.map((s) => (
        <section key={s.grupo}>
          <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">{s.grupo}</h3>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setAbierto(v)}
                  className="group w-full overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative block aspect-video bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${base}/${v.id}?poster=1`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-lg transition-transform group-hover:scale-110">
                        <Play className="h-5 w-5" aria-hidden />
                      </span>
                    </span>
                  </span>
                  <span className="block px-3 py-2.5 text-sm font-medium leading-snug">{v.titulo}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {abierto && (
        <Modal onClose={() => setAbierto(null)} labelledBy="guia-video-titulo" className="max-w-4xl p-3 sm:p-4">
          <h3 id="guia-video-titulo" className="mb-3 pr-8 text-sm font-semibold">
            {abierto.titulo}
          </h3>
          {/* Los subtítulos van dibujados en el propio video. */}
          <video
            key={abierto.id}
            src={`${base}/${abierto.id}`}
            poster={`${base}/${abierto.id}?poster=1`}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="w-full rounded-md"
          />
        </Modal>
      )}
    </div>
  );
}
