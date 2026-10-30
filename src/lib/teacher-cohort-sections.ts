/**
 * 2026-10-30 — Las secciones de "Mis grupos" en el portal del profesor, sin
 * pantalla: En curso, Próximos y Finalizados, en ese orden.
 *
 * Con 18 grupos (los de Ovidio) lo que se dicta hoy va arriba; lo próximo
 * después, el que empieza antes primero; lo terminado al final, el más
 * reciente primero. El estado lo decide el servidor (`computeCohortStatus`).
 */

export type GrupoDelProfesor = {
  status: "planificada" | "en_curso" | "finalizada";
  startDate: string;
};

export type SeccionesDeMisGrupos<T> = { enCurso: T[]; proximos: T[]; finalizados: T[] };

export function seccionesDeMisGrupos<T extends GrupoDelProfesor>(
  grupos: readonly T[]
): SeccionesDeMisGrupos<T> {
  const recientePrimero = (a: T, b: T) => b.startDate.localeCompare(a.startDate);
  return {
    enCurso: grupos.filter((g) => g.status === "en_curso").sort(recientePrimero),
    proximos: grupos
      .filter((g) => g.status === "planificada")
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    finalizados: grupos.filter((g) => g.status === "finalizada").sort(recientePrimero),
  };
}
