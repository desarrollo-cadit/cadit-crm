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

export type EstadoComercial =
  | "aprobo"
  | "curso_sin_aprobar"
  | "en_curso"
  | "por_empezar"
  /** 046 US6 — una cursada de la planilla 2020–2024: se cursó, no se sabe si aprobó. */
  | "curso_historico";

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
  /**
   * 2026-10-29 — Grupo de taller configurado SIN evaluaciones: no hay
   * aprobación que afirmar. Terminado, se informa "curso_historico" (se
   * cursó, sin resultado) y nunca "curso_sin_aprobar" ni "aprobo".
   */
  sinEvaluaciones?: boolean;
  aprobacion: ModuleState;
  certificadoVigente: boolean;
  /** 046 US8 — el vendedor y la empresa de la inscripción (de la madre, en un módulo). */
  sellerId?: string | null;
  companyId?: string | null;
};

/**
 * 046 US6 (FR-021) — Una cursada de la planilla histórica
 * (`historical_course_taking`): sin grupo ni inscripción. `courseId` null =
 * el curso no se asoció al catálogo y queda como texto.
 */
export type RegistroHistorico = {
  contactId: string;
  courseId: string | null;
  courseLabel: string;
  /** El nombre del curso del catálogo, o el texto de la planilla. */
  courseName: string;
  categoryId: string | null;
  takenOn: Date;
  edition: string | null;
  /** 046 US8 — el vendedor y la empresa asociados en la importación. */
  sellerId?: string | null;
  companyId?: string | null;
};

/**
 * Sin tildes, en minúsculas y con los espacios colapsados. La comparte el
 * importador del historial (046 US6) para asociar cursos y vendedores.
 */
export function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La llave de un curso que solo existe como texto: dos filas con "Revit  MEP"
 * y "revit mep" son el mismo curso. La usan el historial y la deduplicación
 * del importador.
 */
export function claveDeCursoTexto(label: string): string {
  return `texto:${plano(label)}`;
}

/** Un curso del historial de una persona (una sola entrada por curso). */
export type EntradaDeHistorial = {
  /** El id del catálogo, o `texto:<nombre>` si vino de la planilla sin asociar. */
  courseId: string;
  courseName: string;
  categoryId: string | null;
  estado: EstadoComercial;
  /** "Cursó sin aprobar" porque nadie cargó datos, no porque reprobó. */
  sinResultado: boolean;
  /** El grupo de la cursada que dio el mejor resultado; `null` en un registro histórico. */
  cohortId: string | null;
  /** El nombre del grupo, o "Edición N" de un registro histórico. */
  cohortName: string | null;
  startDate: Date;
  endDate: Date | null;
  /** El primer inicio de ese curso: la fecha de la "compra" (métricas). */
  primerInicio: Date;
  /** El último grupo que ya empezó (filtro "en los últimos N meses"). */
  ultimoInicioCursado: Date | null;
  /** Cuántas cursadas de ese curso cuentan (recursada = 2). */
  veces: number;
  /**
   * 046 US7 — Alguna cursada de este curso está en curso o por empezar. Se
   * guarda aparte del estado porque la recursada puede tener "aprobó" (lo
   * mejor) y a la vez estar inscripta de nuevo.
   */
  activo: boolean;
  /** 046 US8 (DV-022) — El vendedor y la empresa de la compra (la primera de ese curso). */
  sellerId: string | null;
  companyId: string | null;
  especializacion: { modulosAprobados: number; modulosTotal: number } | null;
};

export const ESTADO_COMERCIAL_LABEL: Record<EstadoComercial, string> = {
  aprobo: "Aprobó",
  curso_sin_aprobar: "Cursó sin aprobar",
  en_curso: "En curso",
  por_empezar: "Inscripto, por empezar",
  curso_historico: "Cursó (registro histórico)",
};

/** Lo que cuenta como "cursó": empezó en un grupo que se dictó. */
export const ESTADOS_CURSADOS: readonly EstadoComercial[] = [
  "aprobo",
  "curso_sin_aprobar",
  "en_curso",
  "curso_historico",
];

export function esCursado(estado: EstadoComercial): boolean {
  return ESTADOS_CURSADOS.includes(estado);
}

/**
 * 046 US7 (FR-023) — El tipo de un contacto, derivado de su historial (nunca
 * guardado). Precedencia: alumno activo > exalumno > lead. Un grupo que nunca
 * se dictó no aparece en el historial, así que no hace alumno a nadie.
 */
export type TipoDeContacto = "lead" | "alumno_activo" | "exalumno";

export const TIPOS_DE_CONTACTO: readonly TipoDeContacto[] = ["lead", "alumno_activo", "exalumno"];

export const TIPO_DE_CONTACTO_LABEL: Record<TipoDeContacto, string> = {
  lead: "Lead",
  alumno_activo: "Alumno activo",
  exalumno: "Exalumno",
};

export function tipoDeContacto(historial: readonly Pick<EntradaDeHistorial, "estado" | "activo">[]): TipoDeContacto {
  if (historial.some((e) => e.activo)) return "alumno_activo";
  if (historial.some((e) => esCursado(e.estado))) return "exalumno";
  return "lead";
}

/** El rótulo de una entrada, sin acusar a nadie de reprobar si no hay datos. */
export function etiquetaDeEntrada(e: Pick<EntradaDeHistorial, "estado" | "sinResultado">): string {
  if (e.estado === "curso_sin_aprobar" && e.sinResultado) return "Cursó · sin resultado cargado";
  return ESTADO_COMERCIAL_LABEL[e.estado];
}

/**
 * 046 US6 (DV-012) — Un dato real del mismo curso gana a un registro
 * histórico: el histórico no sabe si aprobó.
 */
const RANGO: Record<EstadoComercial, number> = {
  aprobo: 5,
  en_curso: 4,
  curso_sin_aprobar: 3,
  curso_historico: 2,
  por_empezar: 1,
};

type Decision = { estado: EstadoComercial; sinResultado: boolean } | null;

/**
 * El estado de UNA cursada (research R1). `null` = no cuenta.
 */
function estadoDeCursada(
  c: Pick<
    CursadaComercial,
    "startDate" | "endDate" | "stageKind" | "certificadoVigente" | "sinEvaluaciones"
  >,
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
  if (c.sinEvaluaciones) return { estado: "curso_historico", sinResultado: false };
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
  now: Date,
  historicos: readonly RegistroHistorico[] = []
): Map<string, EntradaDeHistorial[]> {
  const hijasDe = new Map<string, CursadaComercial[]>();
  for (const c of cursadas) {
    if (!c.parentEnrollmentId) continue;
    hijasDe.set(c.parentEnrollmentId, [...(hijasDe.get(c.parentEnrollmentId) ?? []), c]);
  }

  const porContactoYCurso = new Map<string, Map<string, EntradaDeHistorial>>();
  const agregar = (contactId: string, nueva: EntradaDeHistorial) => {
    const delContacto = porContactoYCurso.get(contactId) ?? new Map<string, EntradaDeHistorial>();
    porContactoYCurso.set(contactId, delContacto);
    const previa = delContacto.get(nueva.courseId);
    delContacto.set(nueva.courseId, previa ? fusionar(previa, nueva) : nueva);
  };

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
      activo: decision.estado === "en_curso" || decision.estado === "por_empezar",
      sellerId: c.sellerId ?? null,
      companyId: c.companyId ?? null,
      especializacion:
        hijas.length > 0
          ? {
              modulosAprobados: hijas.filter((h) => h.aprobacion === "aprobado").length,
              modulosTotal: hijas.length,
            }
          : null,
    };

    agregar(c.contactId, nueva);
  }

  // 046 US6 — Las cursadas de la planilla: "cursó (registro histórico)".
  for (const r of historicos) {
    agregar(r.contactId, {
      courseId: r.courseId ?? claveDeCursoTexto(r.courseLabel),
      courseName: r.courseName,
      categoryId: r.categoryId,
      estado: "curso_historico",
      sinResultado: false,
      cohortId: null,
      cohortName: r.edition?.trim() ? `Edición ${r.edition.trim()}` : null,
      startDate: r.takenOn,
      endDate: null,
      primerInicio: r.takenOn,
      ultimoInicioCursado: r.takenOn,
      veces: 1,
      activo: false,
      sellerId: r.sellerId ?? null,
      companyId: r.companyId ?? null,
      especializacion: null,
    });
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
  const primera = a.primerInicio.getTime() <= b.primerInicio.getTime() ? a : b;
  return {
    ...mejor,
    primerInicio: primera.primerInicio,
    ultimoInicioCursado: ultimos.length
      ? new Date(Math.max(...ultimos.map((d) => d.getTime())))
      : null,
    veces: a.veces + b.veces,
    activo: a.activo || b.activo,
    // 046 US8 (DV-022) — la venta es la de la PRIMERA compra de ese curso.
    sellerId: primera.sellerId,
    companyId: primera.companyId,
  };
}
