"use client";

import { useEffect, useState } from "react";

/**
 * 021 — Lee un token del tema en runtime.
 *
 * Existe por una razón concreta y acotada: **hay librerías que reciben un
 * color, no una clase**. Recharts pinta las barras con una prop `fill`, así
 * que no hay forma de pasarle `bg-brand` — y por eso el gráfico del inicio
 * tenía el verde de WhatsApp escrito a mano desde la 005, en el elemento más
 * visible de la pantalla y sin relación con la marca de la academia.
 *
 * Se vuelve a leer cuando cambia `data-theme`: si no, al pasar a oscuro el
 * gráfico se quedaría con el acento del tema claro.
 *
 * **No es la puerta de atrás para saltear los tokens.** Todo lo que se pueda
 * resolver con una clase de Tailwind se resuelve con una clase; esto es para
 * lo que de verdad no puede.
 */
export function useCssVar(nombre: string, fallback: string): string {
  const [valor, setValor] = useState(fallback);

  useEffect(() => {
    const leer = () => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue(nombre)
        .trim();
      if (v) setValor(v);
    };
    leer();

    // El conmutador de tema cambia `data-theme` en el <html>.
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, [nombre]);

  return valor;
}
