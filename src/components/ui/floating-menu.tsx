"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Menú chico anclado a una celda o a un encabezado. `fixed` para que el
 * desplazamiento de la tabla no lo recorte; se cierra con Escape, con un clic
 * afuera o al desplazar.
 */
export function MenuFlotante({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const volverA = useRef<Element | null>(null);
  // El efecto se monta UNA vez: `onClose` llega nuevo en cada render.
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    volverA.current = document.activeElement;
    ref.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
    const fuera = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cerrar.current();
    };
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar.current();
      }
    };
    const scroll = () => cerrar.current();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", scroll, true);
      (volverA.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // Que no se salga de la ventana por la derecha ni por abajo.
  const left = typeof window === "undefined" ? x : Math.min(x, window.innerWidth - 232);
  const top = typeof window === "undefined" ? y : Math.min(y, window.innerHeight - 220);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 w-56 rounded-md border bg-card p-1 text-xs shadow-pop"
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = [
          ...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? []),
        ];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      {children}
    </div>
  );
}

export function ItemDeMenu({
  onSelect,
  disabled = false,
  hint,
  children,
}: {
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      title={hint}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled ? "cursor-not-allowed text-muted-foreground" : "hover:bg-accent focus:bg-accent"
      )}
    >
      {children}
      {disabled && hint ? <span className="sr-only">. {hint}</span> : null}
    </button>
  );
}
