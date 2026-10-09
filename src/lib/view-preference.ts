/**
 * 030 (addendum) — "Ver como: Equipo / Profesor", para la persona que es las
 * dos cosas (un profesor que también es del equipo).
 *
 * Es una PREFERENCIA de navegación, no un permiso: elegir "Profesor" no le
 * saca nada al panel ni le da nada al portal. Cada puerta sigue preguntando
 * lo suyo (`member` para el panel, `account_link` para el portal). Lo único
 * que decide la cookie es a dónde lleva `/` al entrar.
 *
 * Va en COOKIE y no en `localStorage` por lo mismo que el tema: el servidor
 * decide la redirección antes de mandar HTML.
 */

export const VIEW_COOKIE = "vista";

export type ViewPreference = "equipo" | "profesor";

/** Un año: es una preferencia, no una sesión. */
export const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Lo guardado, o `equipo` (el panel es el default para quien es staff). */
export function parseViewCookie(raw: string | undefined | null): ViewPreference {
  return raw === "profesor" ? "profesor" : "equipo";
}

/**
 * A dónde lleva `/`: al portal SOLO si eligió Profesor y lo es de verdad. Una
 * cookie vieja no puede mandar al portal a quien ya no tiene acceso.
 */
export function landingRedirect(view: ViewPreference, who: { isTeacher: boolean }): "/portal" | null {
  return view === "profesor" && who.isTeacher ? "/portal" : null;
}
