import { count, eq, gte, inArray, isNull, lte, max, min, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { Capability } from "@/lib/capabilities";
import type { RelojDeAsistencia } from "@/lib/attendance-percentage";
import {
  DIAS_DE_ASISTENCIA,
  DIAS_DE_LEADS,
  HORAS_PARA_CONTACTAR,
  VENTANA_DE_FACTURACION,
  armarBandeja,
  reglasPermitidas,
  tareasDeAsistencia,
  tareasDeConfirmacion,
  tareasDeFacturacion,
  tareasDeGrabaciones,
  tareasDeLeads,
  tareasDeProrrogas,
  tareasDeResultadosFinales,
  tareasDeSugerenciasDeZoom,
  type ClaseParaTarea,
  type GrupoDeTareas,
  type ReglaDeTarea,
  type TareaDeHoy,
} from "@/lib/tareas-del-dia";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { gruposSinResultado } from "@/server/resultados-confirmados";

/**
 * 2026-10-26 — La lectura de "Hoy". Las reglas viven en
 * `src/lib/tareas-del-dia.ts`; acá solo se traen sus filas.
 *
 * - **Solo se consulta lo que la sesión puede ver**: una regla sin su
 *   capacidad no corre, y su dato no se lee (un dato que no se debe ver no
 *   viaja — tampoco al proceso).
 * - **En lote**: una consulta por dato para toda la organización, nunca una
 *   por grupo.
 * - Las consultas acotan por fecha con margen de un día a cada lado (las
 *   fechas se guardan a medianoche UTC del día); el corte exacto, en la zona
 *   de la academia, lo hace la regla pura.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export async function tareasDelDia(
  organizationId: string,
  capacidades: readonly Capability[],
  now: Date = new Date()
): Promise<GrupoDeTareas[]> {
  const reglas = reglasPermitidas(capacidades);
  if (reglas.length === 0) return [];

  const timeZone = await organizationTimezone(organizationId);
  const reloj: RelojDeAsistencia = { timeZone, now };

  const lectores: Record<ReglaDeTarea, () => Promise<TareaDeHoy[]>> = {
    asistencia_zoom: async () =>
      tareasDeSugerenciasDeZoom(await clasesConSugerencia(organizationId, now), reloj),
    asistencia: async () => tareasDeAsistencia(await clasesSinMarcas(organizationId, now), reloj),
    grabaciones: async () => tareasDeGrabaciones(await grabacionesParaResolver(organizationId), reloj),
    confirmar: async () => tareasDeConfirmacion(await gruposPorConfirmar(organizationId, now), reloj),
    facturar: async () => tareasDeFacturacion(await ventasSinFactura(organizationId, now), reloj),
    leads: async () => tareasDeLeads(await enviosSinRespuesta(organizationId, now), now),
    prorrogas: async () => tareasDeProrrogas(await pedidosDeProrrogaPendientes(organizationId), reloj),
    resultados: async () =>
      tareasDeResultadosFinales(await gruposSinResultadoFinal(organizationId, now), reloj),
  };

  const tareas = await Promise.all(reglas.map((r) => lectores[r]()));
  return armarBandeja(tareas.flat());
}

/* ============================================================ asistencia */

/**
 * Las clases no canceladas de los últimos 14 días (hasta hoy) y, en dos
 * consultas agregadas más, sus marcas y los inscriptos activos de su grupo.
 * Las fechas del grupo viajan para que la regla pura deje afuera a los
 * finalizados (`computeCohortStatus`, la de Académico).
 */
async function clasesSinMarcas(organizationId: string, now: Date) {
  const clases = await getDb()
    .select({
      classSessionId: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      cohortStartDate: schema.cohort.startDate,
      cohortEndDate: schema.cohort.endDate,
      date: schema.classSession.date,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
    })
    .from(schema.classSession)
    .innerJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        isNull(schema.classSession.canceledAt),
        ne(schema.course.kind, "taller"),
        gte(schema.classSession.date, new Date(now.getTime() - (DIAS_DE_ASISTENCIA + 1) * DIA_MS)),
        lte(schema.classSession.date, new Date(now.getTime() + DIA_MS))
      )
    );
  return completarClases(organizationId, clases);
}

/**
 * Constitución 1.9.0 — Las clases con una sugerencia de Zoom lista y sin
 * confirmar, de CUALQUIER fecha (el relleno hacia atrás incluido).
 */
async function clasesConSugerencia(organizationId: string, now: Date) {
  const f = schema.zoomAttendanceFetch;
  const clases = await getDb()
    .select({
      classSessionId: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      cohortStartDate: schema.cohort.startDate,
      cohortEndDate: schema.cohort.endDate,
      date: schema.classSession.date,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
    })
    .from(f)
    .innerJoin(schema.classSession, eq(f.classSessionId, schema.classSession.id))
    .innerJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        f.organizationId,
        organizationId,
        eq(f.status, "lista"),
        isNull(f.reviewedAt),
        isNull(schema.classSession.canceledAt),
        ne(schema.course.kind, "taller"),
        lte(schema.classSession.date, new Date(now.getTime() + DIA_MS))
      )
    );
  return completarClases(organizationId, clases);
}

type FilaDeClase = {
  classSessionId: string;
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  courseKind: ClaseParaTarea["courseKind"];
  cohortStartDate: Date;
  cohortEndDate: Date | null;
  date: Date;
  endTime: string | null;
  canceledAt: Date | null;
};

/** Marcas, inscriptos activos y sugerencia de Zoom, en tres consultas agregadas. */
async function completarClases(organizationId: string, clases: FilaDeClase[]): Promise<ClaseParaTarea[]> {
  if (clases.length === 0) return [];
  const db = getDb();

  const sesiones = clases.map((c) => c.classSessionId);
  const grupos = [...new Set(clases.map((c) => c.cohortId))];

  const f = schema.zoomAttendanceFetch;
  const [marcas, inscriptos, sugerencias] = await Promise.all([
    db
      .select({ classSessionId: schema.attendance.classSessionId, n: count() })
      .from(schema.attendance)
      .where(
        scoped(
          schema.attendance.organizationId,
          organizationId,
          inArray(schema.attendance.classSessionId, sesiones)
        )
      )
      .groupBy(schema.attendance.classSessionId),
    db
      .select({ cohortId: schema.enrollment.cohortId, n: count() })
      .from(schema.enrollment)
      .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          inArray(schema.enrollment.cohortId, grupos),
          isNull(schema.contact.archivedAt)
        )
      )
      .groupBy(schema.enrollment.cohortId),
    db
      .select({ classSessionId: f.classSessionId })
      .from(f)
      .where(
        scoped(f.organizationId, organizationId, inArray(f.classSessionId, sesiones), eq(f.status, "lista"), isNull(f.reviewedAt))
      ),
  ]);
  const conSugerencia = new Set(sugerencias.map((x) => x.classSessionId));
  const marcasPorClase = new Map(marcas.map((m) => [m.classSessionId, m.n]));
  const inscriptosPorGrupo = new Map(inscriptos.map((i) => [i.cohortId, i.n]));

  return clases.map((c) => ({
    classSessionId: c.classSessionId,
    cohortId: c.cohortId,
    cohortName: c.cohortName,
    courseName: c.courseName,
    courseKind: c.courseKind,
    cohortStartDate: c.cohortStartDate,
    cohortEndDate: c.cohortEndDate,
    date: c.date,
    endTime: c.endTime,
    canceled: c.canceledAt !== null,
    inscriptosActivos: inscriptosPorGrupo.get(c.cohortId) ?? 0,
    marcas: marcasPorClase.get(c.classSessionId) ?? 0,
    sugerenciaZoom: conSugerencia.has(c.classSessionId),
  }));
}

/* ============================================================ grabaciones */

/**
 * Las grabaciones ambiguas o en conflicto, agregadas por estado (cuántas y el
 * inicio de la más vieja) en UNA consulta. Las faltantes en Zoom
 * (`missing_in_zoom_at`) quedan afuera: se van a borrar solas.
 */
async function grabacionesParaResolver(organizationId: string) {
  const t = schema.zoomRecording;
  const filas = await getDb()
    .select({ estado: t.assignmentState, cantidad: count(), masVieja: min(t.startTime) })
    .from(t)
    .where(
      scoped(
        t.organizationId,
        organizationId,
        inArray(t.assignmentState, ["ambigua", "conflicto"]),
        isNull(t.missingInZoomAt)
      )
    )
    .groupBy(t.assignmentState);
  return filas.flatMap((f) => {
    const masVieja = aFecha(f.masVieja);
    return masVieja ? [{ estado: f.estado, cantidad: Number(f.cantidad), masVieja }] : [];
  });
}

/* ============================================================ confirmar */

/** Grupos sin confirmar que empiezan entre ayer y dentro de 8 días. */
async function gruposPorConfirmar(organizationId: string, now: Date) {
  return getDb()
    .select({
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      parentCohortId: schema.cohort.parentCohortId,
      startDate: schema.cohort.startDate,
      confirmedAt: schema.cohort.confirmedAt,
      status: schema.cohort.status,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        isNull(schema.cohort.confirmedAt),
        isNull(schema.cohort.parentCohortId),
        gte(schema.cohort.startDate, new Date(now.getTime() - 2 * DIA_MS)),
        lte(schema.cohort.startDate, new Date(now.getTime() + 9 * DIA_MS))
      )
    );
}

/* ============================================================ facturar */

/**
 * Las ventas madre sin número de grupos dentro de la ventana. Sin montos:
 * la regla no los usa y la bandeja no los muestra.
 */
async function ventasSinFactura(organizationId: string, now: Date) {
  const rows = await getDb()
    .select({
      cohortId: schema.enrollment.cohortId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      archivedAt: schema.contact.archivedAt,
      invoiceNumber: schema.enrollment.invoiceNumber,
      startDate: schema.cohort.startDate,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        isNull(schema.enrollment.parentEnrollmentId),
        gte(schema.cohort.startDate, new Date(now.getTime() - (VENTANA_DE_FACTURACION.despues + 1) * DIA_MS)),
        lte(schema.cohort.startDate, new Date(now.getTime() + (VENTANA_DE_FACTURACION.antes + 1) * DIA_MS))
      )
    );
  return rows.flatMap((r) =>
    r.cohortId
      ? [
          {
            cohortId: r.cohortId,
            cohortName: r.cohortName,
            courseName: r.courseName,
            courseKind: r.courseKind,
            parentEnrollmentId: r.parentEnrollmentId,
            deBaja: r.archivedAt !== null,
            invoiceNumber: r.invoiceNumber,
            startDate: r.startDate,
          },
        ]
      : []
  );
}

/* ============================================================ leads */

/**
 * Los formularios de los últimos 30 días con más de 24 horas, de contactos
 * activos, y en otra consulta agregada la última actividad de esos contactos.
 */
async function enviosSinRespuesta(organizationId: string, now: Date) {
  const db = getDb();
  const envios = await db
    .select({
      contactId: schema.contactFormSubmission.contactId,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      source: schema.contactFormSubmission.source,
      interestName: schema.contactFormSubmission.interestName,
      submittedAt: schema.contactFormSubmission.createdAt,
    })
    .from(schema.contactFormSubmission)
    .innerJoin(schema.contact, eq(schema.contactFormSubmission.contactId, schema.contact.id))
    .where(
      scoped(
        schema.contactFormSubmission.organizationId,
        organizationId,
        isNull(schema.contact.archivedAt),
        gte(schema.contactFormSubmission.createdAt, new Date(now.getTime() - DIAS_DE_LEADS * DIA_MS)),
        lte(schema.contactFormSubmission.createdAt, new Date(now.getTime() - HORAS_PARA_CONTACTAR * 60 * 60 * 1000))
      )
    );
  if (envios.length === 0) return [];

  const ultimas = await db
    .select({ contactId: schema.contactActivity.contactId, ultima: max(schema.contactActivity.createdAt) })
    .from(schema.contactActivity)
    .where(
      scoped(
        schema.contactActivity.organizationId,
        organizationId,
        inArray(schema.contactActivity.contactId, [...new Set(envios.map((e) => e.contactId))])
      )
    )
    .groupBy(schema.contactActivity.contactId);
  const ultimaPorContacto = new Map(ultimas.map((u) => [u.contactId, u.ultima]));

  return envios.map((e) => ({
    contactId: e.contactId,
    nombre: [e.firstName, e.lastName].filter((s) => s?.trim()).join(" ").trim() || "Sin nombre",
    source: e.source,
    interestName: e.interestName,
    submittedAt: e.submittedAt,
    ultimaActividad: aFecha(ultimaPorContacto.get(e.contactId)),
  }));
}

/* ============================================================ prórrogas */

/**
 * 0083 — Los pedidos de prórroga PENDIENTES, con el grupo de su evaluación,
 * en una consulta. Sin el motivo ni el alumno: la bandeja no los muestra.
 */
async function pedidosDeProrrogaPendientes(organizationId: string) {
  const r = schema.assessmentExtensionRequest;
  return getDb()
    .select({
      cohortId: schema.assessment.cohortId,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      createdAt: r.createdAt,
    })
    .from(r)
    .innerJoin(schema.assessment, eq(r.assessmentId, schema.assessment.id))
    .innerJoin(schema.cohort, eq(schema.assessment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(r.organizationId, organizationId, eq(r.status, "pendiente")));
}

/* ============================================================ resultados finales */

/**
 * 0086 — Los grupos que ya terminaron (con un día de margen) y cuántas
 * inscripciones tienen sin resultado final confirmado, en UNA consulta
 * agregada, y si el grupo está COMPLETO (`gruposSinResultado`, una lectura
 * más en lote). La madre de una especialización no cuenta: se confirma en sus
 * módulos. El corte exacto (`finalizada`) lo hace la regla.
 */
async function gruposSinResultadoFinal(organizationId: string, now: Date) {
  const e = schema.enrollment;
  const fr = schema.enrollmentFinalResult;
  const filas = await getDb()
    .select({
      cohortId: schema.cohort.id,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      courseKind: schema.course.kind,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      sinConfirmar: count(),
    })
    .from(e)
    .innerJoin(schema.cohort, eq(e.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(fr, eq(fr.enrollmentId, e.id))
    .where(
      scoped(
        e.organizationId,
        organizationId,
        isNull(fr.id),
        ne(schema.course.kind, "taller"),
        lte(schema.cohort.endDate, new Date(now.getTime() + DIA_MS)),
        sql`not exists (select 1 from ${e} as hija where hija.parent_enrollment_id = ${e.id} and hija.organization_id = ${organizationId})`
      )
    )
    .groupBy(
      schema.cohort.id,
      schema.cohort.name,
      schema.course.name,
      schema.course.kind,
      schema.cohort.startDate,
      schema.cohort.endDate
    );
  const incompletos = await gruposSinResultado(organizationId, filas.map((f) => f.cohortId), now);
  return filas.map((f) => ({
    ...f,
    sinConfirmar: Number(f.sinConfirmar),
    completo: !incompletos.has(f.cohortId),
  }));
}

/**
 * `max()` de un timestamp: drizzle lo tipa como `Date`, pero postgres-js lo
 * puede devolver como texto en un agregado (como `sum()` en `minorFromDb`).
 */
function aFecha(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

