import { eq, inArray, isNotNull, isNull, ne, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from "@/lib/branding";
import {
  armarConstancia,
  avisosDeGrupo,
  estadoDeGrupoAlCorte,
  firmaDeConfig,
  nombreDeAlumno,
  nombreDeArchivoConstancia,
  normalizarConfigDeConstancias,
  relojDeCorte,
  type AlumnoDeConstancia,
  type AvisosDeGrupo,
  type ConfigDeConstancias,
  type GrupoDeConstancia,
} from "@/lib/constancia-empresa";
import { renderConstanciaPdf } from "@/lib/constancia-empresa-pdf";
import type { EstadoDeGrupo } from "@/lib/resultado-de-cursada";
import { recesosDeCohorte } from "@/lib/recess";
import { ACADEMY_TIME_ZONE, wallClockInZone } from "@/lib/schedule-time";
import { columnasDeClaseConLista } from "@/server/attendance";
import { parseMetadata } from "@/server/branding";
import { leerRecesos } from "@/server/recesses";
import { cursoNoEsTaller } from "@/server/workshop-scope";
import { grupoTieneEvaluaciones } from "@/lib/taller-config";

/**
 * 2026-10-29 — Lectura de la constancia para una empresa. Solo LEE y le pasa
 * datos planos a `src/lib/constancia-empresa.ts`, que decide todo.
 *
 * Quiénes entran: las inscripciones FACTURADAS a la empresa
 * (`enrollment.company_id`, igual que el reporte por empresa) y no
 * `contact.company_id`: un curso que la persona se pagó sola no se le informa
 * a su empleador. Sin talleres (`cursoNoEsTaller`) y sin las inscripciones en
 * una etapa perdida (abandonó / perdido). En una especialización facturada a
 * la empresa, los módulos son las hijas de esa madre (que no llevan empresa).
 *
 * Sin montos: no se lee ninguna columna de plata.
 */

/* ============================================================
 * Configuración (organization.metadata.constancias)
 * ============================================================ */

async function leerOrganizacion(organizationId: string) {
  const rows = await getDb()
    .select({ metadata: schema.organization.metadata, timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = parseMetadata(rows[0]?.metadata ?? null);
  return {
    timeZone: rows[0]?.timezone ?? ACADEMY_TIME_ZONE,
    branding: rows[0]
      ? normalizeBranding((meta.branding as Partial<Branding> | undefined) ?? null)
      : DEFAULT_BRANDING,
    config: normalizarConfigDeConstancias(
      (meta.constancias as Parameters<typeof normalizarConfigDeConstancias>[0] | undefined) ?? null
    ),
  };
}

export async function getConfigDeConstancias(organizationId: string): Promise<ConfigDeConstancias> {
  return (await leerOrganizacion(organizationId)).config;
}

/** Junto a la marca, en el JSON de la organización: sin migración. */
export async function saveConfigDeConstancias(
  organizationId: string,
  input: { firmaNombre: string; firmaCargo: string; ciudad: string; pie: string }
): Promise<ConfigDeConstancias> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = parseMetadata(rows[0]?.metadata ?? null);
  const config = normalizarConfigDeConstancias(input);
  meta.constancias = config;
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));
  return config;
}

/* ============================================================
 * Lectura
 * ============================================================ */

/** Hoy ("YYYY-MM-DD") en la zona de la academia. */
export function hoyEnLaAcademia(timeZone: string, ahora: Date = new Date()): string {
  return wallClockInZone(ahora, timeZone)?.fecha ?? ahora.toISOString().slice(0, 10);
}

function columnas() {
  return {
    enrollmentId: schema.enrollment.id,
    contactId: schema.enrollment.contactId,
    enrolledAt: schema.enrollment.enrolledAt,
    firstName: schema.contact.firstName,
    lastName: schema.contact.lastName,
    cohortId: schema.cohort.id,
    cohortName: schema.cohort.name,
    isSpecialization: schema.cohort.isSpecialization,
    startDate: schema.cohort.startDate,
    endDate: schema.cohort.endDate,
    daysOfWeek: schema.cohort.daysOfWeek,
    startTime: schema.cohort.startTime,
    endTime: schema.cohort.endTime,
    courseName: schema.course.name,
    courseKind: schema.course.kind,
    registrationStatus: schema.cohort.registrationStatus,
    hasAssessments: schema.cohort.hasAssessments,
  };
}

async function inscripciones(organizationId: string, condicion: SQL) {
  return getDb()
    .select(columnas())
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, schema.enrollment.stageId))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        condicion,
        cursoNoEsTaller(schema.course.kind, schema.cohort.registrationStatus),
        ne(schema.pipelineStage.kind, "lost")
      )
    );
}

type LecturaDeEmpresa = {
  empresa: { id: string; nombre: string };
  timeZone: string;
  branding: Branding;
  config: ConfigDeConstancias;
  grupos: GrupoDeConstancia[];
};

async function leerEmpresa(organizationId: string, companyId: string): Promise<LecturaDeEmpresa | null> {
  const db = getDb();
  const empresas = await db
    .select({ id: schema.company.id, nombre: schema.company.legalName })
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
    .limit(1);
  const empresa = empresas[0];
  if (!empresa) return null;

  const org = await leerOrganizacion(organizationId);
  const facturadas = await inscripciones(organizationId, eq(schema.enrollment.companyId, companyId));
  const madres = facturadas.filter((i) => i.isSpecialization).map((i) => i.enrollmentId);
  const hijas = madres.length
    ? await inscripciones(organizationId, inArray(schema.enrollment.parentEnrollmentId, madres))
    : [];

  const vistas = new Set<string>();
  const filas = [...facturadas, ...hijas].filter((i) => {
    if (i.isSpecialization || vistas.has(i.enrollmentId)) return false;
    vistas.add(i.enrollmentId);
    return true;
  });
  if (filas.length === 0) return { empresa, ...org, grupos: [] };

  const cohortIds = [...new Set(filas.map((f) => f.cohortId))];
  const enrollmentIds = filas.map((f) => f.enrollmentId);
  const [clases, marcas, recesos] = await Promise.all([
    db
      .select(columnasDeClaseConLista())
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          inArray(schema.classSession.cohortId, cohortIds)
        )
      ),
    db
      .select({
        enrollmentId: schema.attendance.enrollmentId,
        classSessionId: schema.attendance.classSessionId,
        status: schema.attendance.status,
      })
      .from(schema.attendance)
      .where(
        scoped(
          schema.attendance.organizationId,
          organizationId,
          inArray(schema.attendance.enrollmentId, enrollmentIds)
        )
      ),
    leerRecesos(db, organizationId, cohortIds),
  ]);

  const grupos: GrupoDeConstancia[] = cohortIds.map((cohortId) => {
    const deEste = filas.filter((f) => f.cohortId === cohortId);
    const g = deEste[0]!;
    const alumnos: AlumnoDeConstancia[] = deEste.map((f) => ({
      enrollmentId: f.enrollmentId,
      firstName: f.firstName,
      lastName: f.lastName,
      enrolledAt: f.enrolledAt,
      marcas: marcas
        .filter((m) => m.enrollmentId === f.enrollmentId)
        .map((m) => ({ classSessionId: m.classSessionId, status: m.status })),
      /**
       * El resultado final CONFIRMADO por el profesor todavía no existe en el
       * sistema (decisión del dueño 2026-10-23, sin implementar). Hasta
       * entonces, un grupo terminado se informa "Resultado pendiente": nunca
       * se deriva "Aprobado" de la asistencia ni de las notas.
       */
      resultadoConfirmado: null,
    }));
    return {
      cohortId,
      curso: g.courseName,
      grupo: g.cohortName,
      startDate: g.startDate,
      endDate: g.endDate,
      daysOfWeek: g.daysOfWeek,
      tieneEvaluaciones: grupoTieneEvaluaciones(g),
      startTime: g.startTime,
      endTime: g.endTime,
      clases: clases
        .filter((c) => c.cohortId === cohortId)
        .map((c) => ({
          id: c.id,
          date: c.date,
          endTime: c.endTime,
          canceledAt: c.canceledAt,
          tomada: Boolean(c.tomada),
        })),
      recesos: recesosDeCohorte(recesos, cohortId),
      alumnos,
    };
  });

  return { empresa, ...org, grupos };
}

/**
 * Las personas de la empresa (`contact.company_id`) con inscripciones que NO
 * están facturadas a ella. Solo para el staff: puede ser un dato mal cargado
 * o un curso que la persona se pagó sola. Las hijas de una especialización
 * no cuentan (siguen a su madre).
 */
async function sinFacturarALaEmpresa(organizationId: string, companyId: string) {
  const filas = await getDb()
    .select({
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.pipelineStage, eq(schema.pipelineStage.id, schema.enrollment.stageId))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.contact.companyId, companyId),
        or(isNull(schema.enrollment.companyId), ne(schema.enrollment.companyId, companyId)),
        isNull(schema.enrollment.parentEnrollmentId),
        isNotNull(schema.enrollment.cohortId),
        cursoNoEsTaller(schema.course.kind, schema.cohort.registrationStatus),
        ne(schema.pipelineStage.kind, "lost")
      )
    );
  const porPersona = new Map<string, { nombre: string; grupos: string[] }>();
  for (const f of filas) {
    const p = porPersona.get(f.contactId) ?? { nombre: nombreDeAlumno(f), grupos: [] };
    p.grupos.push(f.cohortName ?? f.courseName);
    porPersona.set(f.contactId, p);
  }
  return [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type VistaPreviaDeConstancia = {
  corte: string;
  hoy: string;
  firmaConfigurada: boolean;
  grupos: {
    cohortId: string;
    curso: string;
    grupo: string | null;
    estado: EstadoDeGrupo;
    alumnos: number;
    avisos: AvisosDeGrupo;
  }[];
  sinFacturar: { nombre: string; grupos: string[] }[];
};

/** Lo que la pantalla necesita para elegir y advertir. Sin montos. */
export async function vistaPreviaDeConstancia(
  organizationId: string,
  companyId: string,
  corte: string | null,
  ahora: Date = new Date()
): Promise<VistaPreviaDeConstancia | null> {
  const lectura = await leerEmpresa(organizationId, companyId);
  if (!lectura) return null;
  const hoy = hoyEnLaAcademia(lectura.timeZone, ahora);
  const dia = corte ?? hoy;
  const reloj = relojDeCorte(dia, lectura.timeZone, ahora);
  return {
    corte: dia,
    hoy,
    firmaConfigurada: firmaDeConfig(lectura.config) !== null,
    grupos: [...lectura.grupos]
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map((g) => ({
        cohortId: g.cohortId,
        curso: g.curso,
        grupo: g.grupo,
        estado: estadoDeGrupoAlCorte(g, reloj),
        alumnos: g.alumnos.length,
        avisos: avisosDeGrupo(g, reloj),
      })),
    sinFacturar: await sinFacturarALaEmpresa(organizationId, companyId),
  };
}

/**
 * El PDF. `cohortId` null = la constancia GENERAL (todos sus grupos).
 * `null` = la empresa no existe, o no tiene alumnos en ese alcance (404).
 */
export async function constanciaPdf(
  organizationId: string,
  companyId: string,
  opts: { cohortId: string | null; corte: string | null; ahora?: Date }
): Promise<{ bytes: Uint8Array; archivo: { ascii: string; utf8: string } } | null> {
  const lectura = await leerEmpresa(organizationId, companyId);
  if (!lectura) return null;
  const grupos = opts.cohortId
    ? lectura.grupos.filter((g) => g.cohortId === opts.cohortId)
    : lectura.grupos;
  if (grupos.length === 0) return null;

  const ahora = opts.ahora ?? new Date();
  const hoy = hoyEnLaAcademia(lectura.timeZone, ahora);
  const corte = opts.corte ?? hoy;
  const constancia = armarConstancia({
    empresa: lectura.empresa.nombre,
    academia: lectura.branding.name,
    ciudad: lectura.config.ciudad,
    emitidaEl: hoy,
    corte,
    reloj: relojDeCorte(corte, lectura.timeZone, ahora),
    alcance: opts.cohortId ? "grupo" : "general",
    grupos,
    firma: firmaDeConfig(lectura.config),
    pie: lectura.config.pie,
  });
  const unico = opts.cohortId ? grupos[0] : undefined;
  return {
    bytes: await renderConstanciaPdf(constancia),
    archivo: nombreDeArchivoConstancia(
      lectura.empresa.nombre,
      unico ? (unico.grupo ?? unico.curso) : null,
      corte
    ),
  };
}

