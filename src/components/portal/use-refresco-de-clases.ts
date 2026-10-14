"use client";

import { useEffect, useRef } from "react";

/**
 * Vuelve a pedir los datos cuando puede cambiar lo que se ve de una clase.
 *
 * El servidor decide si el botón "Ingresar" se muestra (`meetingLinkVisible`,
 * 15 min antes por defecto) en el momento del pedido. La pantalla, en cambio,
 * se pedía UNA vez: quien abría el portal a las 18:00 para esperar la clase de
 * las 18:30 nunca veía aparecer el botón a las 18:15 sin recargar.
 *
 * Dos disparadores, y ninguno es un sondeo permanente:
 * - mientras haya una clase cerca (empieza en las próximas 2 h o terminó hace
 *   menos de 2 h), se vuelve a pedir cada minuto;
 * - al volver a la pestaña, porque el reloj siguió corriendo mientras no se
 *   miraba.
 */
export const VENTANA_CERCANA_MS = 2 * 60 * 60_000;
export const CADA_MS = 60_000;

export function hayClaseCerca(
  clases: readonly { startsAt: string | null; endsAt?: string | null }[],
  ahora: number
): boolean {
  return clases.some((c) => {
    if (!c.startsAt) return false;
    const inicio = new Date(c.startsAt).getTime();
    const fin = c.endsAt ? new Date(c.endsAt).getTime() : inicio;
    return inicio - VENTANA_CERCANA_MS <= ahora && ahora <= fin + VENTANA_CERCANA_MS;
  });
}

export function useRefrescoDeClases(
  clases: readonly { startsAt: string | null; endsAt?: string | null }[] | null,
  refetch: () => void
) {
  // El último `refetch` sin reiniciar los temporizadores en cada render.
  const refetchRef = useRef(refetch);
  const clasesRef = useRef(clases);
  useEffect(() => {
    refetchRef.current = refetch;
    clasesRef.current = clases;
  });

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (hayClaseCerca(clasesRef.current ?? [], Date.now())) refetchRef.current();
    };
    const id = window.setInterval(tick, CADA_MS);

    const alVolver = () => {
      if (document.visibilityState === "visible") refetchRef.current();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);
}
