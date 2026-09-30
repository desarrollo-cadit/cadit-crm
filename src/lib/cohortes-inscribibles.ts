/**
 * Inscribir desde el contacto — qué cohortes se ofrecen en el selector del
 * formulario de inscripción cuando no se abrió desde una cohorte.
 *
 * Pura a propósito: la regla decide qué se le ofrece al staff, y probarla no
 * debería necesitar una base ni un navegador.
 *
 * - Las `finalizada` quedan afuera: inscribir en una cursada terminada es,
 *   casi siempre, un clic equivocado. El estado viene ya calculado por
 *   `computeCohortStatus` en el DTO de `/api/cohorts`.
 * - Los módulos de una especialización (`parentCohortId`) también: el
 *   servidor rechaza una inscripción suelta contra un módulo (028, FR-010).
 * - Orden por fecha de inicio ascendente: lo que está en curso o empieza
 *   pronto es lo que más se busca.
 */
export type CohorteInscribible = {
  id: string;
  courseName: string;
  name: string | null;
  startDate: string;
  status: "planificada" | "en_curso" | "finalizada";
  parentCohortId: string | null;
};

export function cohortesInscribibles<T extends CohorteInscribible>(cohortes: T[]): T[] {
  return cohortes
    .filter((c) => c.status !== "finalizada" && c.parentCohortId == null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** "Curso — Cohorte", o solo el curso cuando la cohorte no tiene nombre propio. */
export function etiquetaDeCohorte(c: { courseName: string; name: string | null }): string {
  const nombre = c.name?.trim();
  return nombre && nombre !== c.courseName ? `${c.courseName} — ${nombre}` : c.courseName;
}
