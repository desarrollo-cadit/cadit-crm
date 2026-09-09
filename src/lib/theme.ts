/**
 * 020 (T014, FR-002) — La preferencia de tema.
 *
 * Vive en una cookie y no en `localStorage`, y el motivo es el destello: el
 * servidor tiene que saber qué tema pintar ANTES de mandar el HTML.
 * `localStorage` solo se lee en el navegador, así que la primera pintura
 * saldría siempre en claro y el tema oscuro llegaría un instante después —
 * un fogonazo blanco en cada carga, que es exactamente lo que alguien elige
 * el tema oscuro para no ver.
 *
 * Es la misma razón por la que el acento ya se inyecta por SSR desde la 002.
 */

export const THEME_COOKIE = "tema";

export type ThemePreference = "light" | "dark";

/** La preferencia guardada, o `light` (DV-001: el default es claro). */
export function parseThemeCookie(raw: string | undefined | null): ThemePreference {
  return raw === "dark" ? "dark" : "light";
}

/** Un año: es una preferencia, no una sesión. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
