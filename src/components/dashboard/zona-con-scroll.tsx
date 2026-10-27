"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 2026-10-27 — La zona que se desplaza ADENTRO de una tarjeta del inicio
 * ("Para resolver" y "Agenda de hoy" comparten alto en pantallas anchas): el
 * encabezado de la tarjeta queda quieto y solo esto se mueve.
 *
 * - El scroll interno vale solo desde 1100px, donde las dos tarjetas van lado
 *   a lado. Más angosto se apilan con su alto natural: nada de un scroll
 *   adentro de otro en el celular.
 * - Cuando hay más contenido abajo, el borde inferior se desvanece
 *   (`.scroll-con-borde` en `globals.css`, con máscara: sin colores, sirve
 *   igual en los dos temas).
 * - `enfocar` (un selector) se trae a la vista UNA vez, al cargar, si la zona
 *   desborda — la línea de "ahora" de la agenda. Con movimiento reducido,
 *   salta; si no, se desliza.
 */
export function ZonaConScroll({
  children,
  className,
  enfocar,
  listo = true,
}: {
  children: ReactNode;
  className?: string;
  enfocar?: string;
  /** Recién cuando el contenido real llegó (no el esqueleto) se enfoca. */
  listo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hayMas, setHayMas] = useState(false);
  const enfocado = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setHayMas(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    ro?.observe(el);
    for (const hijo of Array.from(el.children)) ro?.observe(hijo);
    return () => {
      el.removeEventListener("scroll", medir);
      ro?.disconnect();
    };
  }, [children]);

  useEffect(() => {
    if (!enfocar || !listo || enfocado.current) return;
    const el = ref.current;
    const destino = el?.querySelector<HTMLElement>(enfocar);
    if (!el || !destino) return;
    enfocado.current = true;
    if (el.scrollHeight <= el.clientHeight) return;
    // Un poco de aire arriba: se ve también la clase anterior.
    const top = destino.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 48;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: Math.max(0, top), behavior: quieto ? "auto" : "smooth" });
  }, [enfocar, listo, children]);

  return (
    <div
      ref={ref}
      data-hay-mas={hayMas ? "true" : undefined}
      className={cn("scroll-con-borde min-[1100px]:min-h-0 min-[1100px]:flex-1 min-[1100px]:overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}
