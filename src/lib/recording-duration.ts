/**
 * 2026-10-16 — Por debajo de esto una grabación de Zoom es un arranque en
 * falso (Zoom abre una grabación nueva cada vez que se detiene y se reanuda):
 * no se adjudica sola. Caso real: EBIM 14 · Módulo 1, 15/10, una de 0 min y la
 * clase de 88 min, y la de 0 se quedó con la clase.
 *
 * Vive en `lib/` (pura) para que la pantalla de Grabaciones diga lo mismo que
 * la adjudicación sin importar el servidor.
 */
export const MINUTOS_MINIMOS_GRABACION = 5;

/** Sin duración conocida NO es corta: ante la duda, se adjudica como siempre. */
export function esGrabacionCorta(durationMin: number | null): boolean {
  return durationMin !== null && durationMin < MINUTOS_MINIMOS_GRABACION;
}
