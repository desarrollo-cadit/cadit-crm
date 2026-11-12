"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { EncabezadoDeSeccion, Resaltado } from "@/components/listados/filtros";
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
 *
 * `busqueda` marca lo buscado en el título; el filtrado lo hace quien llama.
 */
export function GuiaVideos({
  secciones,
  base,
  busqueda = "",
}: {
  secciones: Seccion[];
  base: string;
  busqueda?: string;
}) {
  const [abierto, setAbierto] = useState<Item | null>(null);

  return (
    <div className="space-y-8">
      {secciones.map((s, i) => (
        <section key={s.grupo} aria-labelledby={`guia-seccion-${i}`}>
          <EncabezadoDeSeccion
            id={`guia-seccion-${i}`}
            titulo={s.grupo}
            cantidad={s.videos.length}
            claseTexto="text-text-3"
            clasePastilla="bg-accent text-text-3"
          />
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {s.videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setAbierto(v)}
                  className="group w-full overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative block aspect-video overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${base}/${v.id}?poster=1`}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-foreground shadow-lg transition-transform duration-200 group-hover:scale-110">
                        <Play className="ml-0.5 h-5 w-5" aria-hidden fill="currentColor" strokeWidth={0} />
                      </span>
                    </span>
                  </span>
                  <span className="block px-3.5 py-3 text-[13.5px] font-medium leading-snug">
                    <Resaltado texto={v.titulo} busqueda={busqueda} />
                  </span>
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
