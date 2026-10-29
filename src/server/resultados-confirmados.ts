import { eq, inArray, or } from "drizzle-orm";
import { grupoEmiteCertificado, grupoTieneEvaluaciones } from "@/lib/taller-config";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { ApprovalState } from "@/lib/approval";
import {
  estadoAfirmado,
  grupoSinResultado,
  programaConfirmado,
  type EstadoAfirmado,
  type ResultadoFinal,
} from "@/lib/resultado-final";
import { asistenciaTomadaSql, relojDeAsistencia } from "@/server/attendance";

/**
 * 0086 — La LECTURA del resultado final confirmado. Separada de la escritura
 * (`src/server/final-results.ts`) para que cualquier consumidor —la planilla,
 * los certificados, el portal, el legajo, el recorrido— la use sin arrastrar
 * la planilla ni la emisión, y para que los tests la reemplacen sola.
 *
 * Todo en lote: una consulta por pedido, nunca una por inscripción.
 */

export type ResultadoConfirmadoDto = {
  result: ResultadoFinal;
  /** La sugerencia del sistema al momento de confirmar. */
  suggestedResult: ApprovalState;
  note: string | null;
  confirmedAt: string;
  /** `null` = quien confirmó ya no está en el sistema. */
  confirmedByName: string | null;
};

/** El resultado confirmado de cada inscripción que lo tiene. */
export async function resultadosConfirmados(
  organizationId: string,
  enrollmentIds: readonly string[]
): Promise<Map<string, ResultadoConfirmadoDto>> {
  const ids = [...new Set(enrollmentIds)];
  if (ids.length === 0) return new Map();
  const t = schema.enrollmentFinalResult;
  const filas = await getDb()
    .select({
      enrollmentId: t.enrollmentId,
      result: t.result,
      suggestedResult: t.suggestedResult,
      note: t.note,
      confirmedAt: t.confirmedAt,
      confirmedByName: schema.user.name,
    })
    .from(t)
    .leftJoin(schema.user, eq(t.confirmedBy, schema.user.id))
    .where(scoped(t.organizationId, organizationId, inArray(t.enrollmentId, ids)));
  return new Map(
    filas.map((f) => [
      f.enrollmentId,
      {
        result: f.result,
        suggestedResult: f.suggestedResult as ApprovalState,
        note: f.note,
        confirmedAt: f.confirmedAt.toISOString(),
        confirmedByName: f.confirmedByName ?? null,
      },
    ])
  );
}

/** Solo el resultado (`aprobado | reprobado`), o `null` sin confirmar. */
export async function resultadoConfirmadoPorInscripcion(
  organizationId: string,
  enrollmentIds: readonly string[]
): Promise<Map<string, ResultadoFinal>> {
  const m = await resultadosConfirmados(organizationId, enrollmentIds);
  return new Map([...m].map(([id, r]) => [id, r.result]));
}

/**
 * (Decisión del dueño, 2026-10-29) Los grupos del lote que TERMINARON sin la
 * asistencia completa (`grupoSinResultado`): no tienen resultado, sus
 * certificados cuentan como anulados y no entran al circuito de confirmación.
 * Dos consultas en lote (fechas del grupo y sus clases con `tomada`).
 */
export async function gruposSinResultado(
  organizationId: string,
  cohortIds: readonly string[],
  now: Date = new Date()
): Promise<Set<string>> {
  const ids = [...new Set(cohortIds)];
  if (ids.length === 0) return new Set();
  const db = getDb();
  const [reloj, grupos, clases] = await Promise.all([
    relojDeAsistencia(organizationId, now),
    db
      .select({ id: schema.cohort.id, startDate: schema.cohort.startDate, endDate: schema.cohort.endDate })
      .from(schema.cohort)
      .where(scoped(schema.cohort.organizationId, organizationId, inArray(schema.cohort.id, ids))),
    db
      .select({
        cohortId: schema.classSession.cohortId,
        date: schema.classSession.date,
        endTime: schema.classSession.endTime,
        canceledAt: schema.classSession.canceledAt,
        tomada: asistenciaTomadaSql(),
      })
      .from(schema.classSession)
      .where(scoped(schema.classSession.organizationId, organizationId, inArray(schema.classSession.cohortId, ids))),
  ]);
  const salida = new Set<string>();
  for (const g of grupos) {
    const deEste = clases.filter((c) => c.cohortId === g.id);
    if (grupoSinResultado({ startDate: g.startDate ?? null, endDate: g.endDate ?? null }, deEste, reloj)) {
      salida.add(g.id);
    }
  }
  return salida;
}

export type { EstadoAfirmado };

/**
 * El estado AFIRMADO de cada inscripción: el confirmado, o `pendiente`. En la
 * madre de una especialización (la que tiene hijas), la regla de programa
 * sobre los resultados CONFIRMADOS de sus módulos. Un grupo terminado e
 * incompleto no tiene resultado (`sinResultado`): lo confirmado no cuenta.
 * Es lo que decide si un certificado vale (`visibilidadDeCertificado`).
 */
export async function estadosAfirmados(
  organizationId: string,
  enrollmentIds: readonly string[],
  now: Date = new Date()
): Promise<Map<string, EstadoAfirmado>> {
  const ids = [...new Set(enrollmentIds)];
  if (ids.length === 0) return new Map();
  const filas = await getDb()
    .select({
      id: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      courseKind: schema.course.kind,
      registrationStatus: schema.cohort.registrationStatus,
      hasAssessments: schema.cohort.hasAssessments,
      issuesCertificate: schema.cohort.issuesCertificate,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        or(inArray(schema.enrollment.id, ids), inArray(schema.enrollment.parentEnrollmentId, ids))
      )
    );
  const [confirmados, incompletos] = await Promise.all([
    resultadoConfirmadoPorInscripcion(organizationId, filas.map((f) => f.id)),
    gruposSinResultado(
      organizationId,
      filas.flatMap((f) => (f.cohortId ? [f.cohortId] : [])),
      now
    ),
  ]);
  const cohorteDe = new Map(filas.map((f) => [f.id, f.cohortId]));
  const sinResultadoDe = (id: string) => {
    const c = cohorteDe.get(id);
    return c ? incompletos.has(c) : false;
  };

  /**
   * 2026-10-29 — Taller configurado SIN evaluaciones: no hay resultado que
   * confirmar, así que para el certificado se lo da por cumplido (la
   * asistencia completa sigue mandando vía `sinResultado`). Y "no emite"
   * suspende lo emitido.
   */
  const porId = new Map(filas.map((f) => [f.id, f]));
  const sinEvals = (id: string) => {
    const f = porId.get(id);
    return f ? !grupoTieneEvaluaciones(f) : false;
  };
  const noEmite = (id: string) => {
    const f = porId.get(id);
    return f ? !grupoEmiteCertificado(f) : false;
  };

  const salida = new Map<string, EstadoAfirmado>();
  for (const id of ids) {
    const hijas = filas.filter((f) => f.parentEnrollmentId === id);
    if (hijas.length > 0) {
      const alguna = hijas.some((h) => sinResultadoDe(h.id));
      salida.set(id, {
        state: programaConfirmado(
          hijas.map((h) => (sinResultadoDe(h.id) ? null : (confirmados.get(h.id) ?? null)))
        ).state,
        sinResultado: alguna,
        noEmite: noEmite(id),
      });
      continue;
    }
    const sinResultado = sinResultadoDe(id);
    salida.set(id, {
      state: sinResultado
        ? "pendiente"
        : sinEvals(id)
          ? "aprobado"
          : estadoAfirmado(confirmados.get(id) ?? null).state,
      sinResultado,
      noEmite: noEmite(id),
    });
  }
  return salida;
}
