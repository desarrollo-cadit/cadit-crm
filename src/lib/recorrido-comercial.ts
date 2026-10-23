import { programApprovalState, type ModuleState } from "@/lib/approval";
import { computeCohortStatus } from "@/lib/cohort-status";
import type { CourseKind } from "@/lib/course-kind";

/**
 * 046 (FR-001…FR-003, FR-010, SC-003) — El historial COMERCIAL de cursos de
 * cada persona: qué cursó de verdad, con qué resultado.
 *
 * **Esta es la única definición** de "cursó", "aprobó", "en curso" y "por
 * empezar" con mirada comercial. La usan la ficha del contacto, las
 * sugerencias ("Le podría interesar"), los filtros de audiencias y las
 * métricas de Recompra: si cada uno decidiera la suya, una audiencia "aprobó
 * A" traería a alguien que la ficha muestra como "cursó sin aprobar".
 *
 * Pura: no lee la base ni el reloj. Las dos reglas que ya existían llegan
 * calculadas en cada fila, por sus dueñas (research R2):
 *
 * - `nuncaDictada`: `inscripcionesNoDictadas` (`src/server/cursadas-no-dictadas.ts`,
 *   que usa `cursadaNuncaDictada`), la misma que oculta esos grupos en el portal.
 * - `aprobacion`: `estadoDeAprobacionDeCursada` (`src/server/estado-de-cursada.ts`),
 *   la misma que el legajo. La madre de una especialización se compone acá
 *   con `programApprovalState` sobre sus módulos, igual que el legajo.
 */

export type EstadoComercial = "aprobo" | "curso_sin_aprobar" | "en_curso" | "por_empezar";

/** Una inscripción CON grupo, con todo lo que hace falta para decidir. */
export type CursadaComercial = {
  enrollmentId: string;
  contactId: string;
  parentEnrollmentId: string | null;
  courseId: string;
  courseName: string;
  courseKind: CourseKind;
  categoryId: string | null;
  cohortId: string;
  cohortName: string;
  startDate: Date;
  endDate: Date | null;
  stageKind: "open" | "won" | "lost";
  nuncaDictada: boolean;
  aprobacion: ModuleState;
  certificadoVigente: boolean;
};

/** Un curso del historial de una persona (una sola entrada por curso). */
export type EntradaDeHistorial = {
  courseId: string;
  courseName: string;
  categoryId: string | null;
  estado: EstadoComercial;
  /** "Cursó sin aprobar" porque nadie cargó datos, no porque reprobó. */
  sinResultado: boolean;
  /** El grupo de la cursada que dio el mejor resultado. */
  cohortId: string;
  cohortName: string;
  startDate: Date;
  endDate: Date | null;
  /** El primer inicio de ese curso: la fecha de la "compra" (métricas). */
  primerInicio: Date;
  /** El último grupo que ya empezó (filtro "en los últimos N meses"). */
  ultimoInicioCursado: Date | null;
  /** Cuántas cursadas de ese curso cuentan (recursada = 2). */
  veces: number;
  especializacion: { modulosAprobados: number; modulosTotal: number } | null;
};

export const ESTADO_COMERCIAL_LABEL: Record<EstadoComercial, string> = {
  aprobo: "Aprobó",
  curso_sin_aprobar: "Cursó sin aprobar",
  en_curso: "En curso",
  por_empezar: "Inscripto, por empezar",
};

/** Lo que cuenta como "cursó": empezó en un grupo que se dictó. */
export const ESTADOS_CURSADOS: readonly EstadoComercial[] = ["aprobo", "curso_sin_aprobar", "en_curso"];

export function esCursado(estado: EstadoComercial): boolean {
  return ESTADOS_CURSADOS.includes(estado);
}

/** El rótulo de una entrada, sin acusar a nadie de reprobar si no hay datos. */
export function etiquetaDeEntrada(e: Pick<EntradaDeHistorial, "estado" | "sinResultado">): string {
  if (e.estado === "curso_sin_aprobar" && e.sinResultado) return "Cursó · sin resultado cargado";
  return ESTADO_COMERCIAL_LABEL[e.estado];
}

const RANGO: Record<EstadoComercial, number> = {
  aprobo: 4,
  en_curso: 3,
  curso_sin_aprobar: 2,
  por_empezar: 1,
};

type Decision = { estado: EstadoComercial; sinResultado: boolean } | null;

/**
 * El estado de UNA cursada (research R1). `null` = no cuenta.
 */
function estadoDeCursada(
  c: Pick<CursadaComercial, "startDate" | "endDate" | "stageKind" | "certificadoVigente">,
  aprobacion: ModuleState,
  now: Date
): Decision {
  const status = computeCohortStatus(c.startDate, c.endDate, now);
  if (status === "planificada") {
    // Se cayó antes de empezar: no lo hizo.
    return c.stageKind === "lost" ? null : { estado: "por_empezar", sinResultado: false };
  }
  if (status === "en_curso") {
    // Abandonó a mitad: lo cursó, sin aprobar.
    return c.stageKind === "lost"
      ? { estado: "curso_sin_aprobar", sinResultado: false }
      : { estado: "en_curso", sinResultado: false };
  }
  if (aprobacion === "aprobado" || c.certificadoVigente) return { estado: "aprobo", sinResultado: false };
  return { estado: "curso_sin_aprobar", sinResultado: aprobacion === "sin_datos" };
}

/**
 * Los historiales de todas las personas presentes en `cursadas`, por
 * `contactId`. Cada historial sale ordenado del inicio más reciente al más
 * viejo.
 */
export function historialesComerciales(
  cursadas: readonly CursadaComercial[],
  now: Date
): Map<string, EntradaDeHistorial[]> {
  const hijasDe = new Map<string, CursadaComercial[]>();
  for (const c of cursadas) {
    if (!c.parentEnrollmentId) continue;
    hijasDe.set(c.parentEnrollmentId, [...(hijasDe.get(c.parentEnrollmentId) ?? []), c]);
  }

  const porContactoYCurso = new Map<string, Map<string, EntradaDeHistorial>>();

  for (const c of cursadas) {
    // Los módulos de una especialización viven dentro de su madre.
    if (c.parentEnrollmentId) continue;
    if (c.courseKind === "taller" || c.nuncaDictada) continue;

    const hijas = (hijasDe.get(c.enrollmentId) ?? []).filter((h) => !h.nuncaDictada);
    const aprobacion: ModuleState =
      hijas.length > 0 ? programApprovalState(hijas.map((h) => h.aprobacion)).state : c.aprobacion;
    const decision = estadoDeCursada(c, aprobacion, now);
    if (!decision) continue;

    const nueva: EntradaDeHistorial = {
      courseId: c.courseId,
      courseName: c.courseName,
      categoryId: c.categoryId,
      estado: decision.estado,
      sinResultado: decision.sinResultado,
      cohortId: c.cohortId,
      cohortName: c.cohortName,
      startDate: c.startDate,
      endDate: c.endDate,
      primerInicio: c.startDate,
      ultimoInicioCursado: esCursado(decision.estado) ? c.startDate : null,
      veces: 1,
      especializacion:
        hijas.length > 0
          ? {
              modulosAprobados: hijas.filter((h) => h.aprobacion === "aprobado").length,
              modulosTotal: hijas.length,
            }
          : null,
    };

    const delContacto = porContactoYCurso.get(c.contactId) ?? new Map<string, EntradaDeHistorial>();
    porContactoYCurso.set(c.contactId, delContacto);
    const previa = delContacto.get(c.courseId);
    delContacto.set(c.courseId, previa ? fusionar(previa, nueva) : nueva);
  }

  const resultado = new Map<string, EntradaDeHistorial[]>();
  for (const [contactId, cursos] of porContactoYCurso) {
    resultado.set(
      contactId,
      [...cursos.values()].sort(
        (a, b) => b.startDate.getTime() - a.startDate.getTime() || a.courseName.localeCompare(b.courseName, "es")
      )
    );
  }
  return resultado;
}

/**
 * Recursada (edge case): una sola entrada, con el mejor resultado. A igual
 * resultado gana la cursada más reciente.
 */
function fusionar(a: EntradaDeHistorial, b: EntradaDeHistorial): EntradaDeHistorial {
  const mejor =
    RANGO[b.estado] > RANGO[a.estado] ||
    (RANGO[b.estado] === RANGO[a.estado] && b.startDate.getTime() > a.startDate.getTime())
      ? b
      : a;
  const ultimos = [a.ultimoInicioCursado, b.ultimoInicioCursado].filter((d): d is Date => d !== null);
  return {
    ...mejor,
    primerInicio: a.primerInicio.getTime() <= b.primerInicio.getTime() ? a.primerInicio : b.primerInicio,
    ultimoInicioCursado: ultimos.length
      ? new Date(Math.max(...ultimos.map((d) => d.getTime())))
      : null,
    veces: a.veces + b.veces,
  };
}
