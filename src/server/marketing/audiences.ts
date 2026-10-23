import { asc, desc, eq, exists, gte, inArray, lt, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { etiquetaDeCohorte } from "@/lib/cohortes-inscribibles";
import { whereDeBajaActiva } from "./bajas";
import { contactosQueCumplen, tieneFiltrosDeHistorial } from "@/lib/marketing/historial-filtros";
import { historialesDeLaOrganizacion } from "@/server/recorrido-comercial";
import { rutasPorCurso } from "@/server/course-routes";
import {
  AudienceFiltersSchema,
  ORIGEN_WHATSAPP,
  particionarAudiencia,
  rangoDeAlta,
  type AudienceFilters,
  type CandidatoAudiencia,
  type DestinatarioDeAudiencia,
  type ExclusionCounts,
} from "@/lib/marketing/audience";

/**
 * 045 (research R4; FR-001…FR-005, FR-027) — Audiencias: opciones de los
 * filtros, CRUD y la evaluación.
 *
 * **Un solo camino arma destinatarios**: `candidatosDeAudiencia`. Es la única
 * lectura de `contact` de todo `src/server/marketing` que alimenta un envío, y
 * SIEMPRE trae si el contacto es de prueba (`is_test`, constitución 1.8.0
 * II.d) y si tiene una baja activa por contacto o por correo (II.b).
 * `tests/unit/marketing-guard.test.ts` lo fija.
 *
 * Todo por `scoped()` y dentro de la transacción del pedido (RLS). Sin SQL
 * crudo: cada filtro es un `EXISTS` armado con Drizzle; `AND` entre filtros e
 * `IN` dentro de cada uno.
 */

export type AudienceRecipientDto = { contactId: string; name: string; email: string };

export type AudiencePreviewDto = {
  count: number;
  overCap: boolean;
  excluded: ExclusionCounts;
  recipients: AudienceRecipientDto[];
  page: number;
  pageSize: number;
};

export type AudienceDto = {
  id: string;
  name: string;
  filters: AudienceFilters;
  createdAt: string;
  createdByName: string | null;
};

export type OpcionesDeFiltros = {
  sources: { value: string; label: string; count: number }[];
  stages: { id: string; name: string; kind: "open" | "won" | "lost" }[];
  cohorts: { id: string; name: string; courseName: string; startDate: string | null }[];
  courses: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  /** 046 — categorías del catálogo, para "cursó algo de una categoría". */
  categories: { id: string; name: string }[];
};

/** Lo que se congela por destinatario al confirmar el envío (DV-008). */
export type DestinatarioConVariables = DestinatarioDeAudiencia & {
  vars: Record<string, string>;
};

/**
 * Los filtros guardados se validan también AL LEER. Un `jsonb` que no pasa no
 * se interpreta como "sin filtros" —eso sería mandarle a toda la base—: se
 * lanza, y el pedido falla cerrado.
 */
export function leerFiltros(raw: unknown): AudienceFilters {
  const parsed = AudienceFiltersSchema.safeParse(raw);
  if (!parsed.success) throw new Error("marketing: filtros de audiencia inválidos en la base");
  return parsed.data;
}

/* ============================================================
 * Opciones de los filtros
 * ============================================================ */

function etiquetaDeOrigen(value: string): string {
  const m = /^formulario:(.+)$/.exec(value);
  return m ? `Formulario: ${m[1]!.trim()}` : value;
}

export async function opcionesDeFiltros(orgId: string): Promise<OpcionesDeFiltros> {
  const db = getDb();
  const cfs = schema.contactFormSubmission;
  const conv = schema.conversation;

  const deContacto = await db
    .select({ source: schema.contact.source, contactId: schema.contact.id })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, orgId, sql`${schema.contact.source} is not null`));
  const deFormularios = await db
    .selectDistinct({ source: cfs.source, contactId: cfs.contactId })
    .from(cfs)
    .where(scoped(cfs.organizationId, orgId));
  const conWhatsapp = await db
    .selectDistinct({ contactId: conv.contactId })
    .from(conv)
    .where(scoped(conv.organizationId, orgId, eq(conv.isTest, false)));

  const porOrigen = new Map<string, Set<string>>();
  const whatsapp = new Set<string>(conWhatsapp.map((r) => r.contactId));
  for (const r of [...deContacto, ...deFormularios]) {
    const source = r.source?.trim();
    if (!source) continue;
    if (source === ORIGEN_WHATSAPP) {
      whatsapp.add(r.contactId);
      continue;
    }
    const set = porOrigen.get(source) ?? new Set<string>();
    set.add(r.contactId);
    porOrigen.set(source, set);
  }
  const sources = [
    { value: ORIGEN_WHATSAPP, label: "WhatsApp", count: whatsapp.size },
    ...[...porOrigen.entries()]
      .map(([value, set]) => ({ value, label: etiquetaDeOrigen(value), count: set.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")),
  ];

  const stages = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, orgId))
    .orderBy(asc(schema.pipelineStage.position));

  const cohortRows = await db
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      courseName: schema.course.name,
      startDate: schema.cohort.startDate,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
    .where(scoped(schema.cohort.organizationId, orgId))
    .orderBy(desc(schema.cohort.startDate));

  const courses = await db
    .select({ id: schema.course.id, name: schema.course.name })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, orgId))
    .orderBy(asc(schema.course.name));

  const companyRows = await db
    .select({
      id: schema.company.id,
      legalName: schema.company.legalName,
      tradeName: schema.company.tradeName,
    })
    .from(schema.company)
    .where(scoped(schema.company.organizationId, orgId))
    .orderBy(asc(schema.company.legalName));

  const categories = await db
    .select({ id: schema.courseCategory.id, name: schema.courseCategory.name })
    .from(schema.courseCategory)
    .where(scoped(schema.courseCategory.organizationId, orgId))
    .orderBy(asc(schema.courseCategory.name));

  return {
    sources,
    stages,
    categories,
    cohorts: cohortRows.map((c) => ({
      id: c.id,
      name: etiquetaDeCohorte({ courseName: c.courseName, name: c.name }),
      courseName: c.courseName,
      startDate: c.startDate ? c.startDate.toISOString().slice(0, 10) : null,
    })),
    courses,
    companies: companyRows.map((c) => ({ id: c.id, name: c.tradeName?.trim() || c.legalName })),
  };
}

/* ============================================================
 * Evaluación — el ÚNICO camino que arma destinatarios
 * ============================================================ */

/** Un `EXISTS` sobre las inscripciones del contacto, con la condición dada. */
function conInscripcion(orgId: string, condicion: SQL | undefined): SQL {
  const e = schema.enrollment;
  return exists(
    getDb()
      .select({ uno: sql`1` })
      .from(e)
      .where(scoped(e.organizationId, orgId, eq(e.contactId, schema.contact.id), condicion))
  );
}

async function zonaDeLaOrganizacion(orgId: string): Promise<string> {
  const [row] = await getDb()
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(scoped(schema.organization.id, orgId))
    .limit(1);
  return row?.timezone ?? "America/Montevideo";
}

/**
 * 046 (US4; FR-008…FR-010, DV-007, DV-008) — Los filtros de historial como UNA
 * condición sobre `contact.id`. Quién cumple lo decide la función pura
 * `contactosQueCumplen` sobre los historiales de `historialesComerciales`, la
 * misma derivación que la ficha del contacto: no hay una versión SQL de
 * "cursó" o "aprobó" que pueda divergir.
 *
 * Sin filtros de historial no se lee nada. Las exclusiones de la 045 (prueba,
 * baja, archivado, sin correo, duplicado) no se tocan: siguen en
 * `candidatosDeAudiencia` y `particionarAudiencia`.
 */
export async function condicionDeHistorial(orgId: string, f: AudienceFilters): Promise<SQL | undefined> {
  if (!tieneFiltrosDeHistorial(f)) return undefined;
  const now = new Date();
  const [historiales, rutas] = await Promise.all([
    historialesDeLaOrganizacion(orgId, now),
    f.historyNextStepOfCourseId ? rutasPorCurso(orgId) : Promise.resolve(new Map<string, string[]>()),
  ]);
  const { modo, ids } = contactosQueCumplen(historiales, f, { rutas, now });
  if (modo === "excluir") return ids.length > 0 ? notInArray(schema.contact.id, ids) : undefined;
  return ids.length > 0 ? inArray(schema.contact.id, ids) : sql`false`;
}

/** Las condiciones de los filtros sobre `contact` (AND entre filtros). */
async function condicionesDeFiltros(orgId: string, f: AudienceFilters): Promise<SQL[]> {
  const db = getDb();
  const ct = schema.contact;
  const conds: SQL[] = [];

  if (f.sources) {
    const reales = f.sources.filter((s) => s !== ORIGEN_WHATSAPP);
    const partes: SQL[] = [];
    if (reales.length > 0) {
      const cfs = schema.contactFormSubmission;
      partes.push(inArray(ct.source, reales));
      partes.push(
        exists(
          db
            .select({ uno: sql`1` })
            .from(cfs)
            .where(scoped(cfs.organizationId, orgId, eq(cfs.contactId, ct.id), inArray(cfs.source, reales)))
        )
      );
    }
    if (f.sources.includes(ORIGEN_WHATSAPP)) {
      const conv = schema.conversation;
      partes.push(eq(ct.source, ORIGEN_WHATSAPP));
      partes.push(
        exists(
          db
            .select({ uno: sql`1` })
            .from(conv)
            .where(scoped(conv.organizationId, orgId, eq(conv.contactId, ct.id), eq(conv.isTest, false)))
        )
      );
    }
    conds.push(or(...partes)!);
  }

  if (f.stageIds) conds.push(conInscripcion(orgId, inArray(schema.enrollment.stageId, f.stageIds)));

  if (f.cohortIds) {
    // Incluye las hijas de una especialización elegida (sus módulos).
    const hijas = db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(scoped(schema.cohort.organizationId, orgId, inArray(schema.cohort.parentCohortId, f.cohortIds)));
    conds.push(
      conInscripcion(
        orgId,
        or(inArray(schema.enrollment.cohortId, f.cohortIds), inArray(schema.enrollment.cohortId, hijas))
      )
    );
  }

  if (f.courseIds) {
    const e = schema.enrollment;
    conds.push(
      exists(
        db
          .select({ uno: sql`1` })
          .from(e)
          .innerJoin(schema.cohort, eq(schema.cohort.id, e.cohortId))
          .where(
            scoped(e.organizationId, orgId, eq(e.contactId, ct.id), inArray(schema.cohort.courseId, f.courseIds))
          )
      )
    );
  }

  if (f.interestCourseIds) {
    conds.push(conInscripcion(orgId, inArray(schema.enrollment.interestCourseId, f.interestCourseIds)));
  }

  if (f.companyIds) conds.push(inArray(ct.companyId, f.companyIds));

  if (f.createdFrom || f.createdTo) {
    const { desde, hastaExclusivo } = rangoDeAlta(
      f.createdFrom,
      f.createdTo,
      await zonaDeLaOrganizacion(orgId)
    );
    if (desde) conds.push(gte(ct.createdAt, desde));
    if (hastaExclusivo) conds.push(lt(ct.createdAt, hastaExclusivo));
  }

  const historial = await condicionDeHistorial(orgId, f);
  if (historial) conds.push(historial);

  return conds;
}

/**
 * Los contactos que cumplen los filtros, cada uno con si es de prueba y si
 * tiene baja activa. ESTA es la lectura que define a quién le llega una
 * campaña: no hay otra.
 */
export async function candidatosDeAudiencia(
  orgId: string,
  filters: AudienceFilters
): Promise<CandidatoAudiencia[]> {
  const db = getDb();
  const conds = await condicionesDeFiltros(orgId, filters);

  // 1.8.0 II.d — prueba: alguna conversación del Laboratorio.
  const esPrueba = exists(
    db
      .select({ uno: sql`1` })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          orgId,
          eq(schema.conversation.contactId, schema.contact.id),
          eq(schema.conversation.isTest, true)
        )
      )
  );
  // 1.8.0 II.b — baja activa por contacto O por correo normalizado (DV-011):
  // la MISMA regla que consulta el ejecutor antes de cada envío.
  const tieneBaja = exists(
    db
      .select({ uno: sql`1` })
      .from(schema.marketingUnsubscribe)
      .where(
        whereDeBajaActiva(orgId, {
          contactId: schema.contact.id,
          email: sql`lower(trim(${schema.contact.email}))`,
        })!
      )
  );

  const rows = await db
    .select({
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
      createdAt: schema.contact.createdAt,
      archivedAt: schema.contact.archivedAt,
      prueba: sql<boolean>`${esPrueba}`,
      baja: sql<boolean>`${tieneBaja}`,
    })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, orgId, ...conds));

  return rows.map((r) => ({
    contactId: r.contactId,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    createdAt: r.createdAt,
    prueba: r.prueba === true,
    baja: r.baja === true,
    archivado: r.archivedAt !== null,
  }));
}

/** Vista previa: cantidad, excluidos por motivo y una página ordenada por nombre. */
export async function evaluarAudiencia(
  orgId: string,
  filters: AudienceFilters,
  opts: { page: number; pageSize: number }
): Promise<AudiencePreviewDto> {
  const particion = particionarAudiencia(await candidatosDeAudiencia(orgId, filters));
  const page = Math.max(1, Math.floor(opts.page));
  const inicio = (page - 1) * opts.pageSize;
  return {
    count: particion.count,
    overCap: particion.overCap,
    excluded: particion.excluded,
    recipients: particion.recipients
      .slice(inicio, inicio + opts.pageSize)
      .map((r) => ({ contactId: r.contactId, name: r.name, email: r.email })),
    page,
    pageSize: opts.pageSize,
  };
}

/**
 * La lista COMPLETA para confirmar un envío, con las variables de cada
 * persona: `curso_de_interes` sale del lead más reciente que lo tenga.
 */
export async function destinatariosDeAudiencia(
  orgId: string,
  filters: AudienceFilters
): Promise<{
  recipients: DestinatarioConVariables[];
  excluded: ExclusionCounts;
  count: number;
  overCap: boolean;
}> {
  const particion = particionarAudiencia(await candidatosDeAudiencia(orgId, filters));
  const ids = particion.recipients.map((r) => r.contactId);
  const cursoDe = new Map<string, string>();
  if (ids.length > 0) {
    const e = schema.enrollment;
    const intereses = await getDb()
      .select({ contactId: e.contactId, courseName: schema.course.name })
      .from(e)
      .innerJoin(schema.course, eq(schema.course.id, e.interestCourseId))
      .where(scoped(e.organizationId, orgId, inArray(e.contactId, ids)))
      .orderBy(desc(e.createdAt));
    for (const i of intereses) {
      if (!cursoDe.has(i.contactId)) cursoDe.set(i.contactId, i.courseName);
    }
  }
  return {
    ...particion,
    recipients: particion.recipients.map((r): DestinatarioConVariables => {
      const curso = cursoDe.get(r.contactId);
      const vars: Record<string, string> = {};
      if (curso) vars.curso_de_interes = curso;
      return { ...r, vars };
    }),
  };
}

/* ============================================================
 * CRUD
 * ============================================================ */

type FilaAudiencia = {
  id: string;
  name: string;
  filters: unknown;
  createdAt: Date;
  createdByName: string | null;
};

function toAudienceDto(r: FilaAudiencia): AudienceDto {
  return {
    id: r.id,
    name: r.name,
    filters: leerFiltros(r.filters),
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdByName,
  };
}

function seleccionDeAudiencia() {
  const a = schema.marketingAudience;
  return getDb()
    .select({
      id: a.id,
      name: a.name,
      filters: a.filters,
      createdAt: a.createdAt,
      createdByName: schema.user.name,
    })
    .from(a)
    .leftJoin(schema.user, eq(schema.user.id, a.createdBy));
}

export async function listarAudiencias(orgId: string): Promise<AudienceDto[]> {
  const a = schema.marketingAudience;
  const rows = await seleccionDeAudiencia()
    .where(scoped(a.organizationId, orgId))
    .orderBy(asc(a.name));
  return rows.map(toAudienceDto);
}

export async function obtenerAudiencia(orgId: string, id: string): Promise<AudienceDto | null> {
  const a = schema.marketingAudience;
  const [row] = await seleccionDeAudiencia().where(scoped(a.organizationId, orgId, eq(a.id, id))).limit(1);
  return row ? toAudienceDto(row) : null;
}

/** ¿Hay OTRA audiencia con ese nombre (sin distinguir mayúsculas)? */
async function nombreOcupado(orgId: string, name: string, salvoId?: string): Promise<boolean> {
  const a = schema.marketingAudience;
  const [row] = await getDb()
    .select({ id: a.id })
    .from(a)
    .where(
      scoped(
        a.organizationId,
        orgId,
        eq(sql`lower(${a.name})`, name.toLowerCase()),
        salvoId ? ne(a.id, salvoId) : undefined
      )
    )
    .limit(1);
  return Boolean(row);
}

export type ResultadoAudiencia =
  | { ok: true; audience: AudienceDto }
  | { ok: false; code: "duplicate" | "not_found" | "invalid_body" };

export async function crearAudiencia(
  orgId: string,
  userId: string,
  input: { name: string; filters: AudienceFilters }
): Promise<ResultadoAudiencia> {
  const name = input.name.trim();
  if (await nombreOcupado(orgId, name)) return { ok: false, code: "duplicate" };
  const id = newId("marketingAudience");
  await getDb().insert(schema.marketingAudience).values({
    id,
    organizationId: orgId,
    name,
    filters: input.filters,
    createdBy: userId,
  });
  const audience = await obtenerAudiencia(orgId, id);
  if (!audience) throw new Error("marketing: la audiencia recién creada no se pudo leer");
  return { ok: true, audience };
}

export async function actualizarAudiencia(
  orgId: string,
  id: string,
  patch: { name?: string; filters?: AudienceFilters }
): Promise<ResultadoAudiencia> {
  if (patch.name === undefined && patch.filters === undefined) {
    return { ok: false, code: "invalid_body" };
  }
  const a = schema.marketingAudience;
  const [existe] = await getDb()
    .select({ id: a.id })
    .from(a)
    .where(scoped(a.organizationId, orgId, eq(a.id, id)))
    .limit(1);
  if (!existe) return { ok: false, code: "not_found" };

  const name = patch.name?.trim();
  if (name !== undefined && (await nombreOcupado(orgId, name, id))) {
    return { ok: false, code: "duplicate" };
  }
  await getDb()
    .update(a)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(patch.filters !== undefined ? { filters: patch.filters } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(a.organizationId, orgId, eq(a.id, id)));
  const audience = await obtenerAudiencia(orgId, id);
  if (!audience) return { ok: false, code: "not_found" };
  return { ok: true, audience };
}

/**
 * Borrar una audiencia no toca las campañas: quedan con `audience_id = NULL`
 * y conservan su copia de los filtros (FR-005). La FK ya lo hace con
 * `set null`; se escribe explícito para que no dependa de un detalle del
 * esquema que nadie mira.
 */
export async function borrarAudiencia(orgId: string, id: string): Promise<boolean> {
  const a = schema.marketingAudience;
  const mc = schema.marketingCampaign;
  const [existe] = await getDb()
    .select({ id: a.id })
    .from(a)
    .where(scoped(a.organizationId, orgId, eq(a.id, id)))
    .limit(1);
  if (!existe) return false;
  await getDb()
    .update(mc)
    .set({ audienceId: null, updatedAt: new Date() })
    .where(scoped(mc.organizationId, orgId, eq(mc.audienceId, id)));
  await getDb().delete(a).where(scoped(a.organizationId, orgId, eq(a.id, id)));
  return true;
}
