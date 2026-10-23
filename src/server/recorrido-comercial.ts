import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { CourseKind } from "@/lib/course-kind";
import {
  historialesComerciales,
  type CursadaComercial,
  type EntradaDeHistorial,
} from "@/lib/recorrido-comercial";
import { asistenciaTomadaSql, relojDeAsistencia, type AttendanceStatus, type RelojDeAsistencia } from "@/server/attendance";
import { inscripcionesNoDictadas } from "@/server/cursadas-no-dictadas";
import { estadoDeAprobacionDeCursada } from "@/server/estado-de-cursada";

/**
 * 046 (DV-003; research R3) — La lectura del recorrido comercial.
 *
 * Lee en lote (≤ 8 consultas por pedido, todas con `scoped()`) y arma las
 * filas que la derivación pura (`src/lib/recorrido-comercial.ts`) convierte
 * en historiales. Para un contacto filtra por `contact_id`; para audiencias y
 * Recompra lee toda la organización (~400 inscripciones hoy).
 *
 * No lee plata: ni cuotas, ni pagos, ni el monto de la inscripción. Un dato
 * que no se debe ver no viaja.
 */

/* ============================================================
 * De las filas leídas a las cursadas (sin base)
 * ============================================================ */

export type InscripcionLeida = {
  enrollment: {
    id: string;
    contactId: string;
    parentEnrollmentId: string | null;
    enrolledAt: Date | null;
    attendanceWaiverAt: Date | null;
    attendanceWaiverReason: string | null;
    attendanceWaiverRevokedAt: Date | null;
  };
  waiverAuthorName: string | null;
  stageKind: "open" | "won" | "lost";
  cohort: {
    id: string;
    name: string | null;
    startDate: Date;
    endDate: Date | null;
    minAttendancePct: number | null;
  };
  course: {
    id: string;
    name: string;
    kind: CourseKind;
    categoryId: string | null;
    minAttendancePct: number | null;
  };
};

export type PiezasDelRecorrido = {
  inscripciones: readonly InscripcionLeida[];
  /** `inscripcionesNoDictadas` (regla `cursadaNuncaDictada`). */
  noDictadas: ReadonlySet<string>;
  clases: readonly {
    id: string;
    cohortId: string;
    date: Date;
    endTime: string | null;
    canceledAt: Date | null;
    tomada: boolean | null;
  }[];
  asistencias: readonly { enrollmentId: string; classSessionId: string; status: AttendanceStatus }[];
  evaluaciones: readonly { id: string; cohortId: string; name: string; required: boolean }[];
  resultados: readonly { enrollmentId: string; assessmentId: string; passed: boolean | null }[];
  certificados: readonly { enrollmentId: string; revokedAt: Date | null }[];
  reloj: RelojDeAsistencia;
};

function agrupar<T>(filas: readonly T[], clave: (f: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    const lista = m.get(k);
    if (lista) lista.push(f);
    else m.set(k, [f]);
  }
  return m;
}

/**
 * Una `CursadaComercial` por inscripción con grupo. La aprobación sale de
 * `estadoDeAprobacionDeCursada`, la misma función que usa el legajo.
 */
export function armarCursadasComerciales(p: PiezasDelRecorrido): CursadaComercial[] {
  const clasesPorGrupo = agrupar(p.clases, (c) => c.cohortId);
  const marcasPorInscripcion = agrupar(p.asistencias, (a) => a.enrollmentId);
  const evaluacionesPorGrupo = agrupar(p.evaluaciones, (e) => e.cohortId);
  const resultadosPorInscripcion = agrupar(p.resultados, (r) => r.enrollmentId);
  const certificadoVigente = new Set(p.certificados.filter((c) => !c.revokedAt).map((c) => c.enrollmentId));

  return p.inscripciones.map(({ enrollment, waiverAuthorName, stageKind, cohort, course }) => {
    const { state } = estadoDeAprobacionDeCursada(
      {
        enrolledAt: enrollment.enrolledAt,
        attendanceWaiverAt: enrollment.attendanceWaiverAt,
        attendanceWaiverReason: enrollment.attendanceWaiverReason,
        attendanceWaiverRevokedAt: enrollment.attendanceWaiverRevokedAt,
        waiverAuthorName,
        cohortMinPct: cohort.minAttendancePct,
        courseMinPct: course.minAttendancePct,
      },
      {
        clases: clasesPorGrupo.get(cohort.id) ?? [],
        asistencias: marcasPorInscripcion.get(enrollment.id) ?? [],
        evaluaciones: evaluacionesPorGrupo.get(cohort.id) ?? [],
        resultados: resultadosPorInscripcion.get(enrollment.id) ?? [],
        reloj: p.reloj,
      }
    );
    return {
      enrollmentId: enrollment.id,
      contactId: enrollment.contactId,
      parentEnrollmentId: enrollment.parentEnrollmentId,
      courseId: course.id,
      courseName: course.name,
      courseKind: course.kind,
      categoryId: course.categoryId,
      cohortId: cohort.id,
      cohortName: cohort.name?.trim() || course.name,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      stageKind,
      nuncaDictada: p.noDictadas.has(enrollment.id),
      aprobacion: state,
      certificadoVigente: certificadoVigente.has(enrollment.id),
    };
  });
}

/* ============================================================
 * Lectura
 * ============================================================ */

/**
 * Las cursadas de la organización (o de los contactos pedidos), listas para
 * `historialesComerciales`.
 */
export async function cargarCursadasComerciales(
  organizationId: string,
  opts: { contactIds?: readonly string[]; now?: Date } = {}
): Promise<CursadaComercial[]> {
  const db = getDb();
  const now = opts.now ?? new Date();
  if (opts.contactIds && opts.contactIds.length === 0) return [];
  const e = schema.enrollment;

  const filas = await db
    .select({
      id: e.id,
      contactId: e.contactId,
      parentEnrollmentId: e.parentEnrollmentId,
      enrolledAt: e.enrolledAt,
      attendanceWaiverAt: e.attendanceWaiverAt,
      attendanceWaiverReason: e.attendanceWaiverReason,
      attendanceWaiverRevokedAt: e.attendanceWaiverRevokedAt,
      waiverAuthorName: schema.user.name,
      stageKind: schema.pipelineStage.kind,
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      confirmedAt: schema.cohort.confirmedAt,
      parentCohortId: schema.cohort.parentCohortId,
      cohortMinPct: schema.cohort.minAttendancePct,
      courseId: schema.course.id,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      categoryId: schema.course.categoryId,
      courseMinPct: schema.course.minAttendancePct,
    })
    .from(e)
    .innerJoin(schema.cohort, eq(schema.cohort.id, e.cohortId))
    .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, e.stageId))
    .leftJoin(schema.user, eq(schema.user.id, e.attendanceWaiverBy))
    .where(
      scoped(
        e.organizationId,
        organizationId,
        opts.contactIds ? inArray(e.contactId, [...opts.contactIds]) : undefined
      )
    );
  if (filas.length === 0) return [];

  const conGrupo = filas.filter((f): f is typeof f & { startDate: Date } => f.startDate !== null);

  // 2026-10-22 — la regla de grupos que nunca salieron, por su dueña.
  const noDictadas = await inscripcionesNoDictadas(
    organizationId,
    conGrupo.map((f) => ({
      id: f.id,
      parentEnrollmentId: f.parentEnrollmentId,
      cohort: {
        confirmedAt: f.confirmedAt,
        startDate: f.startDate,
        endDate: f.endDate,
        parentCohortId: f.parentCohortId,
      },
      courseKind: f.courseKind,
    })),
    now
  );

  // Para un contacto se acota por sus inscripciones y grupos; para toda la
  // organización alcanza con el `organization_id` (sin listas IN enormes).
  const enrollmentIds = conGrupo.map((f) => f.id);
  const cohortIds = [...new Set(conGrupo.map((f) => f.cohortId))];
  const porContacto = Boolean(opts.contactIds);
  const cs = schema.classSession;
  const at = schema.attendance;
  const as = schema.assessment;
  const ar = schema.assessmentResult;
  const ce = schema.certificate;

  const [reloj, clases, asistencias, evaluaciones, resultados, certificados] = await Promise.all([
    relojDeAsistencia(organizationId, now),
    db
      .select({
        id: cs.id,
        cohortId: cs.cohortId,
        date: cs.date,
        endTime: cs.endTime,
        canceledAt: cs.canceledAt,
        tomada: asistenciaTomadaSql(),
      })
      .from(cs)
      .where(scoped(cs.organizationId, organizationId, porContacto ? inArray(cs.cohortId, cohortIds) : undefined)),
    db
      .select({ enrollmentId: at.enrollmentId, classSessionId: at.classSessionId, status: at.status })
      .from(at)
      .where(scoped(at.organizationId, organizationId, porContacto ? inArray(at.enrollmentId, enrollmentIds) : undefined)),
    db
      .select({ id: as.id, cohortId: as.cohortId, name: as.name, required: as.required })
      .from(as)
      .where(scoped(as.organizationId, organizationId, porContacto ? inArray(as.cohortId, cohortIds) : undefined)),
    db
      .select({ enrollmentId: ar.enrollmentId, assessmentId: ar.assessmentId, passed: ar.passed })
      .from(ar)
      .where(scoped(ar.organizationId, organizationId, porContacto ? inArray(ar.enrollmentId, enrollmentIds) : undefined)),
    db
      .select({ enrollmentId: ce.enrollmentId, revokedAt: ce.revokedAt })
      .from(ce)
      .where(scoped(ce.organizationId, organizationId, porContacto ? inArray(ce.enrollmentId, enrollmentIds) : undefined)),
  ]);

  return armarCursadasComerciales({
    inscripciones: conGrupo.map((f) => ({
      enrollment: {
        id: f.id,
        contactId: f.contactId,
        parentEnrollmentId: f.parentEnrollmentId,
        enrolledAt: f.enrolledAt,
        attendanceWaiverAt: f.attendanceWaiverAt,
        attendanceWaiverReason: f.attendanceWaiverReason,
        attendanceWaiverRevokedAt: f.attendanceWaiverRevokedAt,
      },
      waiverAuthorName: f.waiverAuthorName,
      stageKind: f.stageKind,
      cohort: {
        id: f.cohortId,
        name: f.cohortName,
        startDate: f.startDate,
        endDate: f.endDate,
        minAttendancePct: f.cohortMinPct,
      },
      course: {
        id: f.courseId,
        name: f.courseName,
        kind: f.courseKind,
        categoryId: f.categoryId,
        minAttendancePct: f.courseMinPct,
      },
    })),
    noDictadas,
    clases: clases.flatMap((c) => (c.cohortId ? [{ ...c, cohortId: c.cohortId }] : [])),
    asistencias,
    evaluaciones: evaluaciones.flatMap((a) => (a.cohortId ? [{ ...a, cohortId: a.cohortId }] : [])),
    resultados,
    certificados: certificados.flatMap((c) => (c.enrollmentId ? [{ ...c, enrollmentId: c.enrollmentId }] : [])),
    reloj,
  });
}

/** Los historiales de toda la organización, por contacto (audiencias, Recompra). */
export async function historialesDeLaOrganizacion(
  organizationId: string,
  now: Date = new Date()
): Promise<Map<string, EntradaDeHistorial[]>> {
  return historialesComerciales(await cargarCursadasComerciales(organizationId, { now }), now);
}

/* ============================================================
 * La ficha del contacto (US1, US3)
 * ============================================================ */

export type EntradaDeHistorialDto = {
  courseId: string;
  courseName: string;
  estado: EntradaDeHistorial["estado"];
  sinResultado: boolean;
  cohortId: string;
  cohortName: string;
  startDate: string;
  endDate: string | null;
  veces: number;
  especializacion: EntradaDeHistorial["especializacion"];
};

export type SugerenciaDto = {
  courseId: string;
  courseName: string;
  porCursos: string[];
  proximoGrupo: { cohortId: string; name: string; startDate: string } | null;
};

export type RecorridoComercialDto = {
  historial: EntradaDeHistorialDto[];
  sugerencias: SugerenciaDto[];
};

/** Solo los campos del contrato: lo que no está acá no viaja. */
export function historialADto(entradas: readonly EntradaDeHistorial[]): EntradaDeHistorialDto[] {
  return entradas.map((e) => ({
    courseId: e.courseId,
    courseName: e.courseName,
    estado: e.estado,
    sinResultado: e.sinResultado,
    cohortId: e.cohortId,
    cohortName: e.cohortName,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate ? e.endDate.toISOString() : null,
    veces: e.veces,
    especializacion: e.especializacion,
  }));
}

/**
 * Lo que muestra la ficha: qué cursó y qué le podría interesar. `null` si el
 * contacto no es de esta organización (la ruta responde 404).
 *
 * Archivados y dados de baja de marketing aparecen igual: es información
 * para quien atiende (spec, Edge Cases). Las audiencias los excluyen aparte.
 */
export async function recorridoComercialDelContacto(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<RecorridoComercialDto | null> {
  const [contacto] = await getDb()
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!contacto) return null;

  const cursadas = await cargarCursadasComerciales(organizationId, { contactIds: [contactId], now });
  const historial = historialesComerciales(cursadas, now).get(contactId) ?? [];
  return { historial: historialADto(historial), sugerencias: [] };
}
