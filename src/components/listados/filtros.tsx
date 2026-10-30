"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { tramosResaltados } from "@/lib/contact-search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 2026-10-29 — Las piezas de un listado del staff: una tarjeta con buscador y
 * filtros, su resumen al pie ("Mostrando N de M" + etiquetas quitables), el
 * resaltado de lo buscado y la caja de "nada coincide". Nacieron en Académico
 * (2026-10-26) y se comparten para que todos los listados se vean y se usen
 * igual. No saben de qué es la lista: todo lo específico llega por props, y la
 * lógica de filtrado vive en cada `src/lib/*-filters.ts` (puro, con tests).
 */

/* ------------------------------------------------------------ Resaltado */

/** El texto con lo buscado marcado. `<mark>` de React, nunca `innerHTML`. */
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

/* ------------------------------------------------------------ Tarjeta */

/**
 * La tarjeta única de filtros: la fila de controles arriba y, al pie, el
 * `ResumenDeFiltros` (u otro pie) que se pase en `pie`.
 */
export function TarjetaDeFiltros({
  children,
  pie,
  className,
}: {
  children: ReactNode;
  pie?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card shadow-sm", className)}>
      <div className="flex flex-wrap items-center gap-2.5 p-2.5">{children}</div>
      {pie}
    </div>
  );
}

/* ------------------------------------------------------------ Buscador */

/**
 * "/" lleva el foco al buscador (si no se está escribiendo en otro campo),
 * Escape lo vacía y la ✕ lo vacía y devuelve el foco.
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

/* ------------------------------------------------------------ Segmentado */

export type OpcionDeSegmentado<K extends string> = {
  clave: K;
  etiqueta: string;
  /** Se muestra al lado, en números tabulares. Sin dato, no se muestra. */
  cantidad?: number | null;
  /** Clase del punto de color (un token, p. ej. `bg-success`). Sin ella, sin punto. */
  punto?: string;
  /**
   * Clases de la opción ENCENDIDA (p. ej. `bg-success-soft text-success`).
   * Sin ellas, la encendida es la tarjeta blanca con sombra.
   */
  tono?: string;
};

/**
 * Control segmentado. Quién está encendido lo decide `encendida`, así sirve
 * igual para elección única (el tipo de contacto) y múltiple (el estado de
 * los grupos, donde "Todos" se enciende cuando están todos).
 */
export function Segmentado<K extends string>({
  etiqueta,
  opciones,
  encendida,
  onElegir,
}: {
  /** Nombre accesible del grupo de botones. */
  etiqueta: string;
  opciones: readonly OpcionDeSegmentado<K>[];
  encendida: (clave: K) => boolean;
  onElegir: (clave: K) => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className="inline-flex flex-wrap gap-0.5 rounded-md border bg-secondary p-[3px]"
    >
      {opciones.map((o) => {
        const on = encendida(o.clave);
        return (
          <button
            key={o.clave}
            type="button"
            aria-pressed={on}
            onClick={() => onElegir(o.clave)}
            className={cn(
              base,
              on
                ? o.tono
                  ? cn("font-medium", o.tono)
                  : "bg-card font-medium text-foreground shadow-sm"
                : "text-text-3 hover:text-foreground"
            )}
          >
            {o.punto && <span aria-hidden className={cn("h-[7px] w-[7px] rounded-full", o.punto)} />}
            {o.etiqueta}
            {o.cantidad != null && (
              <span className={cn("text-[11.5px] tabular-nums", on && o.tono ? "" : "text-text-3")}>
                {o.cantidad}
              </span>
            )}
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
            "absolute top-[calc(100%+6px)] z-20 max-h-[min(60vh,420px)] w-max min-w-[220px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-md border bg-card p-1.5 shadow-pop",
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

function Cantidad({ valor }: { valor: number | null | undefined }) {
  if (valor == null) return null;
  return <span className="text-xs tabular-nums text-text-3">{valor}</span>;
}

/** Una opción de elección única dentro de un `Desplegable`. */
export function OpcionUnica({
  elegida,
  cantidad,
  onElegir,
  children,
}: {
  elegida: boolean;
  cantidad?: number | null;
  onElegir: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" data-opcion aria-pressed={elegida} onClick={onElegir} className={OPCION}>
      <span className={cn("flex items-center gap-2", elegida && "font-medium text-brand-text")}>
        <Check aria-hidden className={cn("h-3.5 w-3.5", elegida ? "" : "invisible")} />
        {children}
      </span>
      <Cantidad valor={cantidad} />
    </button>
  );
}

/** Una opción con casilla dentro de un `Desplegable`. */
export function OpcionMarcable({
  marcada,
  cantidad,
  onAlternar,
  children,
}: {
  marcada: boolean;
  cantidad?: number | null;
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
      <Cantidad valor={cantidad} />
    </label>
  );
}

/** Una acción al pie del menú, separada por una línea (p. ej. "Ver todos"). */
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

/* ------------------------------------------------------------ Rango de fechas */

/**
 * 2026-10-30 — "Desde [fecha] hasta [fecha]" en una pastilla del alto de los
 * desplegables, teñida cuando tiene alguna fecha. Los `id` son opcionales
 * (Grabaciones los conserva para el E2E).
 */
export function RangoDeFechas({
  etiqueta = "Desde",
  desde,
  hasta,
  onDesde,
  onHasta,
  idDesde,
  idHasta,
}: {
  etiqueta?: string;
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  idDesde?: string;
  idHasta?: string;
}) {
  const activo = Boolean(desde || hasta);
  const campo =
    "rounded-sm bg-transparent text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-x-2 rounded-md border px-3 py-1 text-[13px]",
        activo ? "border-brand-soft bg-brand-tint text-brand-text" : "bg-card text-text-2"
      )}
    >
      <label className="flex items-center gap-2">
        {etiqueta}
        <input type="date" id={idDesde} value={desde} onChange={(e) => onDesde(e.target.value)} className={campo} />
      </label>
      <label className="flex items-center gap-2">
        hasta
        <input type="date" id={idHasta} value={hasta} onChange={(e) => onHasta(e.target.value)} className={campo} />
      </label>
    </div>
  );
}

/* ------------------------------------------------------------ Resumen */

export type FiltroActivo = { clave: string; etiqueta: string; quitar: () => void };

/**
 * "Mostrando N de M <sustantivo>" + una etiqueta quitable por filtro +
 * Limpiar. `mostrando` admite texto para un rango paginado ("1–20").
 */
export function ResumenDeFiltros({
  mostrando,
  total,
  sustantivo,
  activos,
  onLimpiar,
}: {
  mostrando: number | string;
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

/* ------------------------------------------------------------ Encabezado de sección */

/**
 * El título de una sección de la lista (p. ej. "En curso", "Próximos"): en el
 * tono de su estado, con la cantidad en una pastilla y una línea hasta el
 * borde. `id` es para el `aria-labelledby` de la sección.
 */
export function EncabezadoDeSeccion({
  id,
  titulo,
  cantidad,
  claseTexto,
  clasePastilla,
}: {
  id: string;
  titulo: string;
  cantidad: number;
  /** Color del título (un token, p. ej. `text-success`). */
  claseTexto: string;
  /** Fondo y color de la pastilla de la cantidad. */
  clasePastilla: string;
}) {
  return (
    <h3
      id={id}
      className={cn(
        "mb-2 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.04em]",
        claseTexto
      )}
    >
      {titulo}
      <span
        className={cn(
          "rounded-full px-2 py-px text-[11px] font-semibold normal-case tracking-normal tabular-nums",
          clasePastilla
        )}
      >
        {cantidad}
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </h3>
  );
}

/* ------------------------------------------------------------ Sin coincidencias */

/**
 * La lista quedó vacía POR LOS FILTROS (no porque no haya datos): lo dice y
 * ofrece limpiarlos. El vacío "todavía no hay nada" es otro y lo arma cada
 * pantalla.
 */
export function SinCoincidencias({
  mensaje,
  onLimpiar,
  className,
}: {
  mensaje: string;
  onLimpiar: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border-strong p-7 text-center text-sm text-muted-foreground",
        className
      )}
    >
      <p>{mensaje}</p>
      <Button size="sm" className="mt-3" onClick={onLimpiar}>
        Limpiar filtros
      </Button>
    </div>
  );
}
