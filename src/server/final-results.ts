import { eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { ApprovalState } from "@/lib/approval";
import { computeCohortStatus } from "@/lib/cohort-status";
import type { EstadoDeGrupo } from "@/lib/resultado-de-cursada";
import {
  MOTIVO_DE_ANULACION_POR_RESULTADO,
  puedeConfirmarResultado,
  type ConfirmacionDeResultado,
} from "@/lib/resultado-final";
import { revokeCertificate } from "@/server/certificates";
import { cohortGrading } from "@/server/grading";
import type { ResultadoConfirmadoDto } from "@/server/resultados-confirmados";

/**
 * 0086 — El CIERRE de una cursada: la lista para confirmar el resultado final
 * de cada alumno y la escritura de esa confirmación.
 *
 * Decisión del dueño (2026-10-23): ninguna aprobación es automática. El
 * profesor del grupo (o Coordinación con `correcciones.aprobar`) parte de la
 * SUGERENCIA (notas + asistencia) y confirma o corrige cada resultado cuando
 * el grupo terminó. Nada de esto corre solo: cada fila la escribe un clic.
 *
 * Las dos puertas (staff y profesor) llaman a estas funciones; quién puede y
 * sobre qué grupo lo decide la ruta (y, para el profesor, su alcance en
 * `src/server/teacher-portal.ts`).
 */

export type FilaDeCierre = {
  enrollmentId: string;
  nombre: string;
  /** "X de Y clases": las que cuentan para el porcentaje. */
  asistencia: { presentes: number; cuentan: number; pct: number | null };
  /** Las obligatorias: cuántas aprobó, desaprobó y faltan corregir. */
  evaluaciones: { obligatorias: number; aprobadas: number; reprobadas: number; sinCorregir: number };
  /** La SUGERENCIA del sistema; nunca un hecho. */
  sugerido: ApprovalState;
  razones: string[];
  /** Lo confirmado (quién y cuándo), o `null`. */
  confirmado: ResultadoConfirmadoDto | null;
  /** Madre de una especialización: se confirma en cada módulo, no acá. */
  porModulos: boolean;
  /** Solo para el staff: el profesor no ve certificados. */
  certificado?: "ninguno" | "vigente" | "suspendido" | "anulado";
};

export type CierreDeCursadaDto = {
  cohortId: string;
  estadoDelGrupo: EstadoDeGrupo;
  /** `true` cuando el grupo terminó COMPLETO: recién ahí se confirma. */
  confirmable: boolean;
  /** 2026-10-29 — Toda clase dictada con la asistencia tomada (`grupoCompleto`). */
  grupoCompleto: boolean;
  minAttendancePct: number | null;
  alumnos: FilaDeCierre[];
};

type Db = ReturnType<typeof getDb>;

async function fechasDelGrupo(db: Db, organizationId: string, cohortId: string) {
  const rows = await db
    .select({ startDate: schema.cohort.startDate, endDate: schema.cohort.endDate })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Las inscripciones del lote que son MADRE (tienen hijas). */
async function madresEntre(db: Db, organizationId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const hijas = await db
    .select({ parentEnrollmentId: schema.enrollment.parentEnrollmentId })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        inArray(schema.enrollment.parentEnrollmentId, [...ids])
      )
    );
  return new Set(hijas.map((h) => h.parentEnrollmentId).filter((x): x is string => x !== null));
}

/**
 * La lista de cierre de un grupo, o `null` si el grupo no existe en esta
 * organización. Lee la planilla (`cohortGrading`): la sugerencia es la MISMA
 * regla que ve el staff, con la dispensa adentro.
 */
export async function cierreDeCursada(
  organizationId: string,
  cohortId: string,
  now: Date = new Date()
): Promise<CierreDeCursadaDto | null> {
  const db = getDb();
  const grupo = await fechasDelGrupo(db, organizationId, cohortId);
  if (!grupo) return null;
  const planilla = await cohortGrading(organizationId, cohortId);
  if (!planilla) return null;

  const estadoDelGrupo = computeCohortStatus(grupo.startDate, grupo.endDate, now, planilla.timezone);
  const madres = await madresEntre(
    db,
    organizationId,
    planilla.students.map((s) => s.enrollmentId)
  );
  const obligatorias = planilla.assessments.filter((a) => a.required);

  return {
    cohortId,
    estadoDelGrupo,
    confirmable: estadoDelGrupo === "finalizada" && planilla.grupoCompleto,
    grupoCompleto: planilla.grupoCompleto,
    minAttendancePct: planilla.minAttendancePct,
    alumnos: planilla.students.map((s) => {
      const resultados = obligatorias.map((a) => s.results[a.id] ?? null);
      return {
        enrollmentId: s.enrollmentId,
        nombre: s.contactName,
        asistencia: { ...s.attendance, pct: s.attendancePct },
        evaluaciones: {
          obligatorias: obligatorias.length,
          aprobadas: resultados.filter((r) => r === true).length,
          reprobadas: resultados.filter((r) => r === false).length,
          sinCorregir: resultados.filter((r) => r === null).length,
        },
        sugerido: s.state,
        razones: s.reasons,
        confirmado: s.finalResult,
        porModulos: madres.has(s.enrollmentId),
        certificado: !s.certificate
          ? "ninguno"
          : s.certificate.revokedAt
            ? "anulado"
            : s.certificate.suspended
              ? "suspendido"
              : "vigente",
      };
    }),
  };
}

export type ConfirmacionResult =
  | { ok: true; data: { confirmados: number; certificadosAnulados: number } }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * Confirma (o corrige) el resultado final de alumnos de UN grupo.
 *
 * - Solo con el grupo TERMINADO (422 `grupo_no_finalizado`) y COMPLETO
 *   (422 `grupo_incompleto`: falta pasar lista en alguna clase dictada).
 * - Toda inscripción tiene que ser de este grupo (404, como si no existiera).
 * - La madre de una especialización no se confirma (422
 *   `se_confirma_por_modulos`): sale de sus módulos.
 * - Guarda la sugerencia del momento (`suggested_result`) y quién confirmó.
 *   Corregir uno ya confirmado PISA la fila con el autor y la fecha nuevos.
 * - Confirmar "reprobado" ANULA el certificado vigente de esa inscripción y,
 *   si es un módulo, el general de su especialización (mismo mecanismo de
 *   anulación de siempre, con motivo y autor).
 *
 * Las validaciones van antes de escribir; si una anulación falla a mitad, se
 * LANZA para que la transacción del pedido revierta todo.
 */
export async function confirmarResultados(
  organizationId: string,
  cohortId: string,
  entries: readonly ConfirmacionDeResultado[],
  userId: string | null,
  now: Date = new Date()
): Promise<ConfirmacionResult> {
  const cierre = await cierreDeCursada(organizationId, cohortId, now);
  if (!cierre) return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };

  const porId = new Map(cierre.alumnos.map((a) => [a.enrollmentId, a]));
  for (const e of entries) {
    const alumno = porId.get(e.enrollmentId);
    if (!alumno) {
      return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada en este grupo" };
    }
    const puede = puedeConfirmarResultado({
      estadoDelGrupo: cierre.estadoDelGrupo,
      grupoCompleto: cierre.grupoCompleto,
      tieneModulos: alumno.porModulos,
    });
    if (!puede.ok) return { ok: false, status: 422, code: puede.code, message: puede.message };
  }

  const db = getDb();
  const t = schema.enrollmentFinalResult;
  for (const e of entries) {
    const sugerido = porId.get(e.enrollmentId)!.sugerido;
    await db
      .insert(t)
      .values({
        id: newId("enrollmentFinalResult"),
        organizationId,
        enrollmentId: e.enrollmentId,
        result: e.result,
        suggestedResult: sugerido,
        note: e.note ?? null,
        confirmedBy: userId,
        confirmedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: t.enrollmentId,
        set: {
          result: e.result,
          suggestedResult: sugerido,
          note: e.note ?? null,
          confirmedBy: userId,
          confirmedAt: now,
          updatedAt: now,
        },
        // La llave de conflicto es global: el UPDATE solo toca filas de esta organización.
        setWhere: eq(t.organizationId, organizationId),
      });
  }

  const certificadosAnulados = await anularPorReprobados(
    organizationId,
    entries.filter((e) => e.result === "reprobado").map((e) => e.enrollmentId),
    userId
  );

  return { ok: true, data: { confirmados: entries.length, certificadosAnulados } };
}

/**
 * Los certificados VIGENTES (sin anular) de las inscripciones reprobadas y de
 * sus madres: se anulan con `revokeCertificate`, el mecanismo de siempre.
 */
async function anularPorReprobados(
  organizationId: string,
  reprobadas: readonly string[],
  userId: string | null
): Promise<number> {
  if (reprobadas.length === 0) return 0;
  const db = getDb();
  const madres = await db
    .select({ id: schema.enrollment.id, parentEnrollmentId: schema.enrollment.parentEnrollmentId })
    .from(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.id, [...reprobadas]))
    );
  const motivoDe = new Map<string, string>(reprobadas.map((id) => [id, MOTIVO_DE_ANULACION_POR_RESULTADO]));
  for (const m of madres) {
    if (m.parentEnrollmentId && !motivoDe.has(m.parentEnrollmentId)) {
      motivoDe.set(m.parentEnrollmentId, `${MOTIVO_DE_ANULACION_POR_RESULTADO} en un módulo`);
    }
  }

  // `debeAnularCertificado`: reprobado + certificado vigente (sin anular).
  const vigentes = await db
    .select({ id: schema.certificate.id, enrollmentId: schema.certificate.enrollmentId })
    .from(schema.certificate)
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        inArray(schema.certificate.enrollmentId, [...motivoDe.keys()]),
        isNull(schema.certificate.revokedAt)
      )
    );

  let anulados = 0;
  for (const c of vigentes) {
    const r = await revokeCertificate(organizationId, c.id, {
      reason: motivoDe.get(c.enrollmentId) ?? MOTIVO_DE_ANULACION_POR_RESULTADO,
      revokedBy: userId,
    });
    // Lanza: un resultado reprobado con su certificado vivo no puede quedar escrito.
    if (!r.ok) throw new Error(`No se pudo anular el certificado ${c.id}: ${r.message}`);
    anulados += 1;
  }
  return anulados;
}
