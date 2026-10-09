/**
 * 030 (addendum) — La botonera de una tabla paginada: la primera, la última y
 * las vecinas de la actual, con "…" en los huecos.
 *
 * Un hueco de UNA sola página se muestra como número: una elipsis que esconde
 * exactamente un botón ocupa lo mismo y obliga a adivinar qué hay detrás.
 */
export type PaginationItem = number | "…";

export function paginationItems(current: number, totalPages: number): PaginationItem[] {
  const total = Math.max(1, totalPages);
  const actual = Math.min(Math.max(1, current), total);
  const visibles = new Set<number>([1, total]);
  for (let p = actual - 1; p <= actual + 1; p++) if (p >= 1 && p <= total) visibles.add(p);
  // En los bordes se completa a tres vecinas para que la botonera no "salte".
  if (actual <= 2) for (let p = 1; p <= Math.min(3, total); p++) visibles.add(p);
  if (actual >= total - 1) for (let p = Math.max(1, total - 2); p <= total; p++) visibles.add(p);

  const ordenadas = [...visibles].sort((a, b) => a - b);
  const out: PaginationItem[] = [];
  for (const p of ordenadas) {
    const anterior = out.at(-1);
    if (typeof anterior === "number" && p - anterior === 2) out.push(anterior + 1);
    else if (typeof anterior === "number" && p - anterior > 2) out.push("…");
    out.push(p);
  }
  return out;
}
