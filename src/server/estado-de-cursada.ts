import {
  attendancePercentage,
  resolveMinAttendance,
  type AttendanceStatus,
  type RelojDeAsistencia,
} from "@/server/attendance";
import { dispensaDeInscripcion, estadoDeModulo } from "@/server/grading";
import type { DispensaDeAsistencia, ModuleState } from "@/lib/approval";
import { afirmadoConSugerencia, grupoSinResultado, type ResultadoFinal } from "@/lib/resultado-final";

/**
 * 046 (research R2) — La aprobación de UNA cursada, tal como la decide el
 * legajo (013/028/030).
 *
 * Vivía adentro de `armarCursada` (`src/server/student-record.ts`). Se extrajo
 * sin cambiar su lógica para que el recorrido comercial (046) la use en vez
 * de copiarla: si cada pantalla decidiera la suya, el legajo y los segmentos
 * de marketing dirían cosas distintas de la misma persona.
 *
 * No lee la base: recibe las piezas YA filtradas para esta inscripción (las
 * clases de su grupo, sus marcas, las evaluaciones del grupo, sus resultados).
 */

export type InscripcionParaAprobar = {
  enrolledAt: Date | null;
  attendanceWaiverAt: Date | null;
  attendanceWaiverReason: string | null;
  attendanceWaiverRevokedAt: Date | null;
  /** Quién otorgó la dispensa, resuelto a nombre (puede faltar). */
  waiverAuthorName: string | null;
  cohortMinPct: number | null;
  courseMinPct: number | null;
  /**
   * 2026-10-29 — `false` = taller configurado SIN evaluaciones. Regla: no hay
   * resultado que afirmar (ni aprobado ni reprobado ni pendiente): el estado
   * es `sin_datos`; la asistencia se sigue informando. Omitido = sí.
   */
  tieneEvaluaciones?: boolean;
  /**
   * 0086 — El resultado final CONFIRMADO (`enrollment_final_result`), o
   * `null`. Es lo único que esta función devuelve como hecho en `state`.
   */
  resultadoConfirmado: ResultadoFinal | null;
  /**
   * 2026-10-29 — Las fechas del grupo: si TERMINÓ sin la asistencia completa
   * (`grupoSinResultado`, sobre `piezas.clases`) no hay resultado.
   */
  grupo: { startDate: Date | null; endDate: Date | null };
};

export type PiezasDeCursada = {
  clases: readonly {
    id: string;
    date: Date;
    endTime: string | null;
    canceledAt: Date | null;
    tomada: boolean | null;
  }[];
  asistencias: readonly { classSessionId: string; status: AttendanceStatus }[];
  evaluaciones: readonly { id: string; name: string; required: boolean }[];
  resultados: readonly { assessmentId: string; passed: boolean | null }[];
  reloj: RelojDeAsistencia;
};

export type AprobacionDeCursada = {
  /** `null` = no hay una sola marca de esta persona (no es 0%). */
  attendancePct: number | null;
  minAttendancePct: number | null;
  assessments: { name: string; passed: boolean | null; required: boolean }[];
  dispensa: DispensaDeAsistencia | null;
  /**
   * 0086 — Lo AFIRMADO: el resultado confirmado; sin confirmar, `pendiente`
   * (o `sin_datos` si no hay nada cargado). Nunca el cálculo.
   */
  state: ModuleState;
  reasons: string[];
  /** 0086 — La sugerencia del sistema (notas + asistencia), solo para el staff. */
  sugerencia: { state: ModuleState; reasons: string[] };
  /** 2026-10-29 — El grupo terminó sin la asistencia completa: no hay resultado. */
  sinResultado: boolean;
};

export function estadoDeAprobacionDeCursada(
  inscripcion: InscripcionParaAprobar,
  piezas: PiezasDeCursada
): AprobacionDeCursada {
  /**
   * 013 (T034) — **0% porque nadie pasó lista NO es 0% porque no vino.**
   * Sin una sola marca de la persona, el porcentaje es `null`.
   */
  const pct =
    piezas.asistencias.length === 0
      ? null
      : attendancePercentage(
          piezas.clases.map((c) => ({
            sessionDate: c.date,
            endTime: c.endTime,
            canceled: Boolean(c.canceledAt),
            tomada: Boolean(c.tomada),
            status: piezas.asistencias.find((a) => a.classSessionId === c.id)?.status ?? null,
          })),
          inscripcion.enrolledAt,
          piezas.reloj
        );

  const minPct = resolveMinAttendance(inscripcion.cohortMinPct, inscripcion.courseMinPct);

  const assessments = piezas.evaluaciones.map((a) => ({
    name: a.name,
    passed: piezas.resultados.find((r) => r.assessmentId === a.id)?.passed ?? null,
    required: a.required,
  }));

  /**
   * 028 (FR-024) — La dispensa saltea la compuerta de asistencia y nada más.
   * Sin dispensa, `estadoDeModulo` devuelve lo mismo que `approvalState`
   * salvo el `sin_datos` del legajo (030).
   */
  const dispensa = dispensaDeInscripcion({
    attendanceWaiverAt: inscripcion.attendanceWaiverAt,
    attendanceWaiverReason: inscripcion.attendanceWaiverReason,
    attendanceWaiverRevokedAt: inscripcion.attendanceWaiverRevokedAt,
    attendanceWaiverByName: inscripcion.waiverAuthorName,
  });
  const sugerencia = estadoDeModulo(
    assessments.filter((r) => r.required).map((r) => r.passed),
    pct,
    minPct,
    dispensa
  );

  /**
   * 0086 (decisión del dueño 2026-10-23) — Ninguna aprobación es automática:
   * lo que se afirma es el resultado CONFIRMADO. Sin confirmar, el legajo y el
   * recorrido dicen `pendiente` (o `sin_datos`, que no afirma nada).
   */
  const sinResultado = grupoSinResultado(
    inscripcion.grupo,
    piezas.clases.map((c) => ({ date: c.date, endTime: c.endTime, canceledAt: c.canceledAt, tomada: c.tomada })),
    piezas.reloj
  );
  // 2026-10-29 — Taller sin evaluaciones: no hay resultado que afirmar (sin_datos).
  if (inscripcion.tieneEvaluaciones === false) {
    return {
      attendancePct: pct,
      minAttendancePct: minPct,
      assessments: [],
      dispensa,
      state: "sin_datos",
      reasons: ["Este grupo no tiene evaluaciones"],
      sugerencia,
      sinResultado,
    };
  }
  const { state, reasons } = afirmadoConSugerencia(inscripcion.resultadoConfirmado, sugerencia, sinResultado);

  return {
    attendancePct: pct,
    minAttendancePct: minPct,
    assessments,
    dispensa,
    state,
    reasons,
    sugerencia,
    sinResultado,
  };
}
