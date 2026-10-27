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

/**
 * 2026-10-27 — Por debajo de `ZOOM_MIN_RECORDING_MIN` (default 15) la
 * grabación ni se GUARDA: una clase real nunca dura 15 minutos (pruebas,
 * arranques por error). Es otra regla que la de arriba: aquella decide qué no
 * se adjudica entre lo guardado; esta, qué no entra. Sin duración conocida se
 * guarda (no se descarta lo que no se puede juzgar) y `minimo` 0 apaga el
 * filtro.
 */
export const MINIMO_PARA_GUARDAR_POR_DEFECTO = 15;

export function seGuardaLaGrabacion(durationMin: number | null, minimo: number): boolean {
  return minimo <= 0 || durationMin === null || durationMin >= minimo;
}
