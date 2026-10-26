"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { tramosResaltados } from "@/lib/contact-search";
import { colorCategorico, inicialesDeCurso } from "@/lib/cohort-color";
import { COURSE_KIND_LABEL, type CourseKind } from "@/lib/course-kind";
import { cn } from "@/lib/utils";

/**
 * 2026-10-26 — Las piezas de la barra de Académico (buscar + filtros en una
 * sola tarjeta) y de sus listas. Sin lógica de filtrado: eso vive en
 * `src/lib/academic-filters.ts`, puro y con tests.
 */

/* ------------------------------------------------------------ Resaltado */

/** El nombre con lo buscado marcado. `<mark>` de React, nunca `innerHTML`. */
export function Resaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  if (!busqueda.trim()) return <>{texto}</>;
  return (
    <>
      {tramosResaltados(texto, busqueda).map((t, i) =>
        t.marca ? (
          <mark key={i} className="rounded-sm bg-warning-soft px-px text-inherit">
            {t.texto}
          </mark>
        ) : (
          <span key={i}>{t.texto}</span>
        )
      )}
    </>
  );
}

/* ------------------------------------------------------------ Avatar y tipo */

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

/** Curso / Módulo / Taller, cada uno con un par distinto de la paleta. */
const COLOR_DE_TIPO: Record<CourseKind, string> = {
  curso: "bg-cohort-1 text-cohort-1-fg",
  modulo: "bg-cohort-4 text-cohort-4-fg",
  taller: "bg-cohort-8 text-cohort-8-fg",
};

export function EtiquetaDeTipo({ kind }: { kind: CourseKind }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-px text-[11px] font-medium",
        COLOR_DE_TIPO[kind]
      )}
    >
      {COURSE_KIND_LABEL[kind]}
    </span>
  );
}

/* ------------------------------------------------------------ Buscador */

/**
 * "/" lleva el foco al buscador (si no se está escribiendo en otro campo) y
 * la ✕ lo vacía y devuelve el foco.
 */
export function Buscador({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  return (
    <div className="relative min-w-0 flex-[1_1_280px]">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-4"
      />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        className="h-9 w-full rounded-md border bg-subtle pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-text-3 focus:border-brand focus:bg-card focus:ring-[3px] focus:ring-brand-soft [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-accent text-text-3 hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-card px-1.5 text-[11px] text-text-3 sm:block"
        >
          /
        </kbd>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Segmentado de estado */

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

/**
 * Estado como control segmentado, con selección MÚLTIPLE (`nextStatusFilter`):
 * el caso diario es "planificados + en curso" sin el archivo de finalizados,
 * y un segmentado de una sola opción lo perdería. "Todos" se ve encendido
 * cuando están los tres.
 */
export function SegmentadoDeEstado({
  orden,
  etiquetas,
  value,
  total,
  conteos,
  onTodos,
  onAlternar,
}: {
  orden: readonly EstadoDeGrupo[];
  etiquetas: Record<EstadoDeGrupo, string>;
  value: ReadonlySet<EstadoDeGrupo>;
  total: number;
  conteos: Record<EstadoDeGrupo, number>;
  onTodos: () => void;
  onAlternar: (estado: EstadoDeGrupo) => void;
}) {
  const todos = value.size === orden.length;
  const base =
    "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      role="group"
      aria-label="Estado"
      className="inline-flex flex-wrap gap-0.5 rounded-md border bg-secondary p-[3px]"
    >
      <button
        type="button"
        aria-pressed={todos}
        onClick={onTodos}
        className={cn(
          base,
          todos ? "bg-card font-medium text-foreground shadow-sm" : "text-text-3 hover:text-foreground"
        )}
      >
        Todos <span className="text-[11.5px] tabular-nums text-text-3">{total}</span>
      </button>
      {orden.map((e) => {
        const on = !todos && value.has(e);
        return (
          <button
            key={e}
            type="button"
            aria-pressed={on}
            onClick={() => onAlternar(e)}
            className={cn(
              base,
              on ? cn("font-medium", TONO_DE_ESTADO[e].activo) : "text-text-3 hover:text-foreground"
            )}
          >
            <span aria-hidden className={cn("h-[7px] w-[7px] rounded-full", TONO_DE_ESTADO[e].punto)} />
            {etiquetas[e]}
            <span className={cn("text-[11.5px] tabular-nums", on ? "" : "text-text-3")}>{conteos[e]}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Desplegable */

/**
 * Botón "Etiqueta: valor ▾" con un menú anclado. Escape y el clic afuera lo
 * cierran (Escape devuelve el foco al botón); las flechas recorren las
 * opciones. Se tiñe cuando su filtro no está en el valor por defecto.
 */
export function Desplegable({
  etiqueta,
  valor,
  activo,
  alinear = "izquierda",
  children,
}: {
  etiqueta: string;
  valor: string;
  activo: boolean;
  alinear?: "izquierda" | "derecha";
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    caja.current?.querySelector<HTMLElement>("[data-opcion]")?.focus();
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button
        ref={boton}
        type="button"
        aria-haspopup="true"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          activo
            ? "border-brand-soft bg-brand-tint text-brand-text"
            : "bg-card text-text-2 hover:bg-accent"
        )}
      >
        {etiqueta}:{" "}
        <b className={cn("font-medium", activo ? "text-brand-text" : "text-foreground")}>{valor}</b>
        <ChevronDown aria-hidden className="h-3.5 w-3.5 text-text-4" />
      </button>
      {abierto && (
        <div
          className={cn(
            "absolute top-[calc(100%+6px)] z-20 w-max min-w-[220px] max-w-[calc(100vw-32px)] rounded-md border bg-card p-1.5 shadow-pop",
            alinear === "derecha" ? "right-0" : "left-0"
          )}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const items = [...(caja.current?.querySelectorAll<HTMLElement>("[data-opcion]") ?? [])];
            const i = items.indexOf(document.activeElement as HTMLElement);
            const n = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
            items[n]?.focus();
          }}
        >
          {children(() => {
            setAbierto(false);
            boton.current?.focus();
          })}
        </div>
      )}
    </div>
  );
}

const OPCION =
  "flex w-full items-center justify-between gap-3 rounded-[7px] px-2.5 py-[7px] text-left text-[13px] hover:bg-accent focus:bg-accent focus-visible:outline-none";

/** Una opción de elección única (el año). */
export function OpcionUnica({
  elegida,
  cantidad,
  onElegir,
  children,
}: {
  elegida: boolean;
  cantidad: number;
  onElegir: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" data-opcion aria-pressed={elegida} onClick={onElegir} className={OPCION}>
      <span className={cn("flex items-center gap-2", elegida && "font-medium text-brand-text")}>
        <Check aria-hidden className={cn("h-3.5 w-3.5", elegida ? "" : "invisible")} />
        {children}
      </span>
      <span className="text-xs tabular-nums text-text-3">{cantidad}</span>
    </button>
  );
}

/** Una opción con casilla (los tipos). */
export function OpcionMarcable({
  marcada,
  cantidad,
  onAlternar,
  children,
}: {
  marcada: boolean;
  cantidad: number;
  onAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <label className={cn(OPCION, "cursor-pointer")}>
      <span className="flex items-center gap-2.5">
        <input
          type="checkbox"
          data-opcion
          checked={marcada}
          onChange={onAlternar}
          className="h-[15px] w-[15px] accent-primary"
        />
        {children}
      </span>
      <span className="text-xs tabular-nums text-text-3">{cantidad}</span>
    </label>
  );
}

export function OpcionAccion({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <>
      <hr className="mx-0.5 my-1 border-border" />
      <button type="button" data-opcion onClick={onClick} className={cn(OPCION, "text-brand-text")}>
        {children}
      </button>
    </>
  );
}

/* ------------------------------------------------------------ Resumen */

export type FiltroActivo = { clave: string; etiqueta: string; quitar: () => void };

/** "Mostrando N de M grupos" + una etiqueta quitable por filtro + Limpiar. */
export function ResumenDeFiltros({
  mostrando,
  total,
  sustantivo,
  activos,
  onLimpiar,
}: {
  mostrando: number;
  total: number;
  sustantivo: { uno: string; varios: string };
  activos: FiltroActivo[];
  onLimpiar: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center gap-2 rounded-b-lg border-t bg-subtle px-3 py-2 text-[12.5px] text-text-3"
    >
      <span>
        Mostrando <b className="font-semibold tabular-nums text-foreground">{mostrando}</b> de{" "}
        <span className="tabular-nums">{total}</span> {total === 1 ? sustantivo.uno : sustantivo.varios}
      </span>
      {activos.map((f) => (
        <span
          key={f.clave}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card py-0.5 pl-2.5 pr-1 text-text-2"
        >
          <span className="truncate">{f.etiqueta}</span>
          <button
            type="button"
            aria-label={`Quitar filtro ${f.etiqueta}`}
            onClick={f.quitar}
            className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent text-text-3 hover:text-foreground"
          >
            <X aria-hidden className="h-3 w-3" />
          </button>
        </span>
      ))}
      {activos.length > 0 && (
        <button
          type="button"
          onClick={onLimpiar}
          className="ml-auto font-medium text-brand-text hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
