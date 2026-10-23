import type { AudienceFilters } from "@/lib/marketing/audience";
import { esCursado, type EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 (US4; FR-008…FR-010) — Los filtros de audiencia por historial de
 * cursos, PUROS.
 *
 * Se evalúan sobre el historial que arma `historialesComerciales`, la misma
 * derivación que muestra la ficha del contacto: "aprobó", "cursó" y "no se
 * dictó" significan lo mismo en la ficha y en la campaña (FR-010, SC-003).
 *
 * AND entre filtros; "alguno de" dentro de cada lista.
 */

type EntradaParaFiltrar = Pick<EntradaDeHistorial, "courseId" | "categoryId" | "estado" | "ultimoInicioCursado">;

export type ContextoDeHistorial = {
  /** Origen → siguientes, en orden (`rutasPorCurso`). */
  rutas: ReadonlyMap<string, readonly string[]>;
  now: Date;
};

export function tieneFiltrosDeHistorial(f: AudienceFilters): boolean {
  return Boolean(
    f.historyTakenCourseIds ||
      f.historyApprovedCourseIds ||
      f.historyNotApprovedCourseIds ||
      f.historyNotDoneCourseIds ||
      f.historyRecent ||
      f.historyNextStepOfCourseId
  );
}

function menosMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() - meses);
  return r;
}

export function cumpleFiltrosDeHistorial(
  historial: readonly EntradaParaFiltrar[],
  f: AudienceFilters,
  ctx: ContextoDeHistorial
): boolean {
  const cursoAlguno = (ids: readonly string[]) =>
    historial.some((e) => ids.includes(e.courseId) && esCursado(e.estado));
  const hizoAlguno = (ids: readonly string[]) => historial.some((e) => ids.includes(e.courseId));

  if (f.historyTakenCourseIds && !cursoAlguno(f.historyTakenCourseIds)) return false;
  if (
    f.historyApprovedCourseIds &&
    !historial.some((e) => f.historyApprovedCourseIds!.includes(e.courseId) && e.estado === "aprobo")
  ) {
    return false;
  }
  if (
    f.historyNotApprovedCourseIds &&
    !historial.some((e) => f.historyNotApprovedCourseIds!.includes(e.courseId) && e.estado === "curso_sin_aprobar")
  ) {
    return false;
  }
  if (f.historyNotDoneCourseIds && hizoAlguno(f.historyNotDoneCourseIds)) return false;

  if (f.historyRecent) {
    const { months, courseIds, categoryIds } = f.historyRecent;
    const desde = menosMeses(ctx.now, months).getTime();
    const sinListas = !courseIds && !categoryIds;
    const cumple = historial.some(
      (e) =>
        esCursado(e.estado) &&
        e.ultimoInicioCursado !== null &&
        e.ultimoInicioCursado.getTime() >= desde &&
        e.ultimoInicioCursado.getTime() <= ctx.now.getTime() &&
        (sinListas ||
          (courseIds?.includes(e.courseId) ?? false) ||
          (e.categoryId !== null && (categoryIds?.includes(e.categoryId) ?? false)))
    );
    if (!cumple) return false;
  }

  if (f.historyNextStepOfCourseId) {
    const origen = f.historyNextStepOfCourseId;
    if (!cursoAlguno([origen])) return false;
    if (hizoAlguno(ctx.rutas.get(origen) ?? [])) return false;
  }

  return true;
}

/**
 * Quiénes cumplen, dicho de la forma que la consulta de audiencias puede
 * sumar como UNA condición (DV-008):
 *
 * - `incluir`: `contact.id IN (ids)`, cuando un historial vacío no cumple;
 * - `excluir`: `contact.id NOT IN (ids)`, cuando un historial vacío SÍ cumple
 *   (p. ej. solo "no hizo Y"), para alcanzar también a quien nunca cursó.
 */
export function contactosQueCumplen(
  historiales: ReadonlyMap<string, readonly EntradaParaFiltrar[]>,
  f: AudienceFilters,
  ctx: ContextoDeHistorial
): { modo: "incluir" | "excluir"; ids: string[] } {
  const vacioCumple = cumpleFiltrosDeHistorial([], f, ctx);
  const ids: string[] = [];
  for (const [contactId, historial] of historiales) {
    const cumple = cumpleFiltrosDeHistorial(historial, f, ctx);
    if (cumple !== vacioCumple) ids.push(contactId);
  }
  return { modo: vacioCumple ? "excluir" : "incluir", ids };
}
