"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ChevronDown, MapPin } from "lucide-react";
import { GuiaVideos } from "@/components/guia/guia-videos";
import {
  Buscador,
  EncabezadoDeSeccion,
  Resaltado,
  Segmentado,
  SinCoincidencias,
} from "@/components/listados/filtros";
import { usePestanaEnUrl } from "@/components/use-pestana-en-url";
import { coincideConBusqueda } from "@/lib/contact-search";
import type { PestanaGuia } from "@/lib/pestanas";

export type VideoDeGuia = { id: string; titulo: string };
export type SeccionDeVideos = { grupo: string; videos: VideoDeGuia[] };
/** Algo que esta cuenta puede hacer. `href` es la pantalla a la que se llega (si el camino arranca en el menú). */
export type FuncionDeGuia = { clave: string; que: string; donde: string; href: string | null };
export type GrupoDeFunciones = { titulo: string; items: FuncionDeGuia[] };
/** Algo que hace otro rol: sin enlace, porque no se ofrece una puerta que devolvería 403. */
export type FuncionAjena = { clave: string; que: string; roles: string[] };
export type GrupoAjeno = { titulo: string; items: FuncionAjena[] };

type Props = {
  inicial: PestanaGuia;
  videos: SeccionDeVideos[];
  baseVideos: string;
  funciones: GrupoDeFunciones[];
  ajenas: GrupoAjeno[];
};

const TODAS = "__todas";

/**
 * La guía del staff, con el mismo lenguaje que Académico y Contactos: encabezado con
 * su recuadro de ícono y el resumen en píldoras, pestañas en un control segmentado,
 * búsqueda sin tildes (`/` la enfoca) y filtro por sección.
 *
 * Los dos paneles viven SIEMPRE en el HTML y el inactivo se oculta con `hidden`: así la
 * guía no depende de JavaScript para ser legible, y quien la lee sin él ve todo.
 *
 * «Esto lo hace otro rol» sigue siendo un `<details>` cerrado y sin enlaces (DV-001 y
 * FR-007 de 027): lo primero que se ve es lo que SÍ se puede hacer, y no se ofrece una
 * puerta que devolvería 403. `scripts/e2e-selftest.mjs` lo comprueba sobre el HTML.
 */
export function GuiaClient({ inicial, videos, baseVideos, funciones, ajenas }: Props) {
  const [tab, setTab] = usePestanaEnUrl<PestanaGuia>(inicial);
  const [q, setQ] = useState("");
  const [seccion, setSeccion] = useState<string | null>(null);

  const tieneVideos = videos.length > 0;
  const totalVideos = videos.reduce((n, s) => n + s.videos.length, 0);
  const totalFunciones = funciones.reduce((n, g) => n + g.items.length, 0);
  const totalAjenas = ajenas.reduce((n, g) => n + g.items.length, 0);

  const videosVisibles = useMemo(
    () =>
      videos
        .filter((s) => seccion === null || s.grupo === seccion)
        .map((s) => ({
          grupo: s.grupo,
          videos: s.videos.filter((v) => coincideConBusqueda(q, { texto: [v.titulo, s.grupo] })),
        }))
        .filter((s) => s.videos.length > 0),
    [videos, seccion, q]
  );

  const funcionesVisibles = useMemo(
    () =>
      funciones
        .map((g) => ({
          titulo: g.titulo,
          items: g.items.filter((f) => coincideConBusqueda(q, { texto: [f.que, f.donde, g.titulo] })),
        }))
        .filter((g) => g.items.length > 0),
    [funciones, q]
  );

  const ajenasVisibles = useMemo(
    () =>
      ajenas
        .map((g) => ({
          titulo: g.titulo,
          items: g.items.filter((f) => coincideConBusqueda(q, { texto: [f.que, g.titulo, ...f.roles] })),
        }))
        .filter((g) => g.items.length > 0),
    [ajenas, q]
  );

  const limpiar = () => {
    setQ("");
    setSeccion(null);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-success-soft text-brand"
          >
            <BookOpen className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Guía</h1>
            <p className="text-[13px] text-muted-foreground">
              Qué podés hacer, dónde está cada cosa y cómo se hace
            </p>
          </div>
        </div>
        <ul aria-label="Resumen de la guía" className="flex flex-wrap gap-2">
          {tieneVideos && (
            <li className="inline-flex items-center gap-2 rounded-full bg-brand-soft py-1.5 pl-2.5 pr-3 text-[12.5px] font-medium text-brand-text">
              <span aria-hidden className="h-2 w-2 rounded-full bg-brand" />
              <b className="text-[15px] tabular-nums">{totalVideos}</b>{" "}
              {totalVideos === 1 ? "tutorial" : "tutoriales"}
            </li>
          )}
          <li className="inline-flex items-center gap-2 rounded-full bg-success-soft py-1.5 pl-2.5 pr-3 text-[12.5px] font-medium text-success">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
            <b className="text-[15px] tabular-nums">{totalFunciones}</b> {totalFunciones === 1 ? "función tuya" : "funciones tuyas"}
          </li>
        </ul>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 sm:px-6">
        <Segmentado<PestanaGuia>
          etiqueta="Secciones de la guía"
          opciones={[
            ...(tieneVideos ? [{ clave: "tutoriales" as const, etiqueta: "Tutoriales", cantidad: totalVideos }] : []),
            { clave: "funciones" as const, etiqueta: "Lo que puedo hacer", cantidad: totalFunciones },
          ]}
          encendida={(k) => tab === k}
          onElegir={setTab}
        />
        <Buscador
          value={q}
          onChange={setQ}
          placeholder={tab === "tutoriales" ? "Buscar un tutorial…" : "Buscar entre lo que podés hacer…"}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-6xl">
          {/* ------------------------------------------------------- Tutoriales */}
          {tieneVideos && (
            <section hidden={tab !== "tutoriales"} aria-label="Tutoriales en video" className="space-y-5">
              {videos.length > 1 && (
                <Segmentado<string>
                  etiqueta="Sección de los tutoriales"
                  opciones={[
                    { clave: TODAS, etiqueta: "Todas", cantidad: totalVideos },
                    ...videos.map((s) => ({ clave: s.grupo, etiqueta: s.grupo, cantidad: s.videos.length })),
                  ]}
                  encendida={(k) => (k === TODAS ? seccion === null : seccion === k)}
                  onElegir={(k) => setSeccion(k === TODAS ? null : k)}
                />
              )}
              {videosVisibles.length > 0 ? (
                <GuiaVideos secciones={videosVisibles} base={baseVideos} busqueda={q} />
              ) : (
                <SinCoincidencias mensaje="Ningún tutorial coincide con la búsqueda." onLimpiar={limpiar} />
              )}
            </section>
          )}

          {/* ------------------------------------------------ Lo que puedo hacer */}
          <section hidden={tab !== "funciones"} aria-label="Lo que podés hacer">
            <p className="max-w-prose text-[13px] leading-relaxed text-muted-foreground">
              Esta guía sale de los mismos permisos con los que el sistema te deja entrar a cada pantalla: dice
              exactamente lo que tu cuenta puede hacer hoy. Si alguien cambia los permisos de tu rol, cambia sola.
            </p>

            {totalFunciones === 0 ? (
              <p className="mt-6 rounded-lg border border-dashed border-border-strong px-4 py-6 text-sm text-muted-foreground">
                Tu cuenta todavía no tiene un rol asignado, por eso el panel se ve vacío. Quien administra la
                instancia puede asignártelo.
              </p>
            ) : funcionesVisibles.length > 0 ? (
              <div className="mt-6 space-y-8">
                {funcionesVisibles.map((g, i) => (
                  <section key={g.titulo} aria-labelledby={`guia-funciones-${i}`}>
                    <EncabezadoDeSeccion
                      id={`guia-funciones-${i}`}
                      titulo={g.titulo}
                      cantidad={g.items.length}
                      claseTexto="text-text-3"
                      clasePastilla="bg-accent text-text-3"
                    />
                    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                      {g.items.map((f) => (
                        <li key={f.clave} className="px-4 py-3.5">
                          {/* Largo de línea cómodo (≈75 caracteres): el texto de una capacidad puede ser largo. */}
                          <p className="max-w-[75ch] text-sm font-medium leading-snug">
                            <Resaltado texto={f.que} busqueda={q} />
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <p className="flex min-w-0 items-center gap-1.5 text-xs text-text-3">
                              <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                              <span className="min-w-0">
                                <Resaltado texto={f.donde} busqueda={q} />
                              </span>
                            </p>
                            {f.href && (
                              <Link
                                href={f.href}
                                className="-my-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                Abrir <ArrowRight aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                              </Link>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <SinCoincidencias className="mt-6" mensaje="Nada de lo que podés hacer coincide con la búsqueda." onLimpiar={limpiar} />
            )}

            {/*
              DV-001 — Colapsada por default, y con `<details>`: sin JavaScript y sin una
              dependencia. Ocultar lo que la persona no puede hacer es lo correcto en el menú,
              pero en una guía el efecto es el contrario: quien no encuentra «emitir
              certificados» concluye que el sistema no lo hace y le pregunta al dueño.
              FR-007 — Dice QUÉ y QUÉ ROL lo tiene, y nada más: sin enlace (no se ofrece una
              puerta que va a devolver 403) y sin nombres de personas.
            */}
            {totalAjenas > 0 && (
              <details className="group mt-10 overflow-hidden rounded-xl border bg-card">
                <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium hover:bg-subtle">
                  <span>Esto lo hace otro rol ({totalAjenas})</span>
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-text-3 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="border-t px-4 pb-5 pt-4">
                  <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                    Estas funciones existen, pero tu rol no las incluye. Te las mostramos para que sepas a quién
                    pedírsela cuando las necesites.
                  </p>
                  <div className="mt-5 space-y-6">
                    {ajenasVisibles.length > 0 ? (
                      ajenasVisibles.map((g) => (
                        <section key={g.titulo}>
                          <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">{g.titulo}</h3>
                          <ul className="mt-2 space-y-3">
                            {g.items.map((f) => (
                              <li key={f.clave} className="text-sm">
                                <span className="block max-w-[75ch] text-text-2">
                                  <Resaltado texto={f.que} busqueda={q} />
                                </span>
                                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-3">
                                  {f.roles.length > 0 ? (
                                    <>
                                      Lo hace:
                                      {f.roles.map((r) => (
                                        <span key={r} className="rounded-full bg-accent px-2 py-0.5 text-[11.5px] font-medium text-text-2">
                                          {r}
                                        </span>
                                      ))}
                                    </>
                                  ) : (
                                    "Hoy ningún rol lo tiene asignado"
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Nada de esta sección coincide con la búsqueda.</p>
                    )}
                  </div>
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
