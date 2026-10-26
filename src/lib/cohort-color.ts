/**
 * 020 (T021) — La paleta de cohortes vive en tokens (`--cohort-N-bg/fg`).
 *
 * Cada entrada es un par fondo/texto que el tema invierte entero, y el
 * contraste del par está cubierto por `tests/unit/tema-oscuro.test.ts`.
 *
 * Es una paleta CATEGÓRICA: su trabajo es que dos cosas seguidas se distingan
 * de un vistazo, no comunicar un estado.
 *
 * 2026-10-26 — Salió del calendario para que Académico la reuse: el calendario
 * pinta cada COHORTE por su id y Académico pinta cada CURSO por el suyo.
 * (Tailwind escanea `src/**`: las clases de abajo se generan igual.)
 */
const COLORES_CATEGORICOS = [
  { bg: "bg-cohort-1", border: "border-cohort-1-fg", text: "text-cohort-1-fg" },
  { bg: "bg-cohort-2", border: "border-cohort-2-fg", text: "text-cohort-2-fg" },
  { bg: "bg-cohort-3", border: "border-cohort-3-fg", text: "text-cohort-3-fg" },
  { bg: "bg-cohort-4", border: "border-cohort-4-fg", text: "text-cohort-4-fg" },
  { bg: "bg-cohort-5", border: "border-cohort-5-fg", text: "text-cohort-5-fg" },
  { bg: "bg-cohort-6", border: "border-cohort-6-fg", text: "text-cohort-6-fg" },
  { bg: "bg-cohort-7", border: "border-cohort-7-fg", text: "text-cohort-7-fg" },
  { bg: "bg-cohort-8", border: "border-cohort-8-fg", text: "text-cohort-8-fg" },
] as const;

export type ColorCategorico = (typeof COLORES_CATEGORICOS)[number];

/**
 * El color se deriva de una clave estable (un id), no de la posición en una
 * lista: así conserva SU color entre recargas y no cambia cuando aparece otro.
 */
export function colorCategorico(clave: string): ColorCategorico {
  let hash = 0;
  for (let i = 0; i < clave.length; i++) {
    hash = (hash * 31 + clave.charCodeAt(i)) | 0;
  }
  return COLORES_CATEGORICOS[Math.abs(hash) % COLORES_CATEGORICOS.length]!;
}

/** Conectores que no dan inicial: "Dynamo para Revit" es DR, no DP. */
const CONECTORES = new Set(["de", "del", "la", "el", "los", "las", "en", "para", "y", "a", "con"]);

/** Las iniciales del avatar de un curso: dos letras, nunca vacío. */
export function inicialesDeCurso(nombre: string): string {
  const palabras = nombre
    .split(/[\s—–\-·:/]+/)
    .filter((p) => p.length > 0 && !CONECTORES.has(p.toLowerCase()));
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return [...palabras[0]!].slice(0, 2).join("").toUpperCase();
  return palabras
    .slice(0, 2)
    .map((p) => [...p][0]!)
    .join("")
    .toUpperCase();
}
