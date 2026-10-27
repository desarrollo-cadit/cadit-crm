/**
 * 2026-10-27 — "Las clases de este grupo cambiaron": lo avisa quien las cambia
 * sin ser la pestaña Clases (confirmar el grupo genera el cronograma solo) y
 * lo escucha la pestaña para volver a pedirlas. Un evento del navegador, sin
 * estado compartido: si la pestaña no está montada, al abrirla pide igual.
 */
const EVENTO = "cadit:clases-cambiaron";

export function avisarQueCambiaronLasClases(cohortId: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENTO, { detail: cohortId }));
}

/** Devuelve la función que deja de escuchar (para el `useEffect`). */
export function alCambiarLasClases(cohortId: string, fn: () => void): () => void {
  const handler = (e: Event) => {
    if ((e as CustomEvent<string>).detail === cohortId) fn();
  };
  window.addEventListener(EVENTO, handler);
  return () => window.removeEventListener(EVENTO, handler);
}
