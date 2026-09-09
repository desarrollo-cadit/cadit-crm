"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type ThemePreference } from "@/lib/theme";

/**
 * 020 (T014) — El conmutador de tema.
 *
 * Hace dos cosas y las dos hacen falta:
 *
 * 1. Cambia `data-theme` en el `<html>` **al instante**. Sin esto habría que
 *    esperar un viaje al servidor para ver el cambio, y un tema que tarda en
 *    aplicarse se siente roto.
 * 2. Guarda la cookie, para que la PRÓXIMA carga ya salga del servidor con el
 *    tema puesto y no haya destello.
 *
 * No lleva capacidad: es una preferencia de la persona, no un permiso.
 */
export function ThemeToggle({
  initial,
  size = "touch",
}: {
  initial: ThemePreference;
  /**
   * 020 — `touch` da 44px, el mínimo para un pulgar: es lo que corresponde en
   * el portal, que se usa en el celular. `compact` es para la barra lateral
   * del panel, que mide 224px de ancho — meter ahí un blanco de 44px le come
   * el lugar al nombre de la persona.
   */
  size?: "touch" | "compact";
}) {
  const [tema, setTema] = useState<ThemePreference>(initial);
  const compacto = size === "compact";

  function alternar() {
    const siguiente: ThemePreference = tema === "dark" ? "light" : "dark";
    setTema(siguiente);
    document.documentElement.dataset.theme = siguiente;
    document.cookie = `${THEME_COOKIE}=${siguiente}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={tema === "dark" ? "Tema claro" : "Tema oscuro"}
      className={
        compacto
          ? "shrink-0 rounded p-1 text-text-3 transition-colors hover:text-foreground"
          : "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-3 transition-colors hover:bg-accent hover:text-foreground"
      }
    >
      {tema === "dark" ? (
        <Sun className={compacto ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.7} />
      ) : (
        <Moon className={compacto ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.7} />
      )}
    </button>
  );
}
