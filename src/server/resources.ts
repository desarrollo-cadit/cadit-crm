import { httpUrl } from "@/lib/url-schema";
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/db/schema";

/**
 * 013 (T021, FR-006/FR-007) — El material de cursada.
 *
 * Son ENLACES: el sistema guarda dónde está la guía, no la guía. Es la
 * decisión marco de archivos, y es lo que evita que esta fase empuje una
 * cuarta dependencia de runtime (constitución II).
 */

export type ResourceDto = {
  id: string;
  title: string;
  url: string;
  kind: ResourceKind;
  position: number;
  courseId: string | null;
  cohortId: string | null;
  classSessionId: string | null;
  courseModuleId: string | null;
};

/**
 * 0084 — Un adjunto de la CONSIGNA de una evaluación (o de una evaluación
 * modelo del curso). Es un `resource` con su propio contenedor, y viaja con
 * lo mínimo: título, enlace y tipo.
 */
export type AdjuntoDto = { id: string; title: string; url: string; kind: ResourceKind };

export type ResourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

export type ResourceInput = {
  title: string;
  url: string;
  kind?: ResourceKind;
  courseId?: string | null;
  /** 023 — Material de la CAMADA: lo ven sus alumnos y nadie más. */
  cohortId?: string | null;
  classSessionId?: string | null;
  courseModuleId?: string | null;
  /** 0084 — Adjunto de la consigna de una evaluación del grupo. */
  assessmentId?: string | null;
  /** 0084 — Adjunto de una evaluación modelo del curso. */
  courseAssessmentTemplateId?: string | null;
};

/**
 * 013 (T020) — Decide si un recurso puede existir. Pura y sin base.
 *
 * **Un recurso cuelga de un curso O de una clase, nunca de los dos.** Sin
 * contenedor no se puede mostrar en ninguna pantalla; con los dos aparecería
 * duplicado, en la ficha del curso y en la clase.
 *
 * Lo mismo impone el CHECK `resource_contenedor_unico` en Postgres. Se valida
 * ANTES del insert no por desconfianza, sino porque un constraint violado
 * llega como un 500 sin explicación y esto es un 422 que dice qué pasó —
 * mismo criterio que `validateAccountLink` en 012.
 */
export function validateResource(input: ResourceInput): ResourceResult<ResourceInput> {
  /**
   * 023 — Tres contenedores, y exactamente uno. Se cuenta en vez de comparar
   * de a pares: con tres opciones, `a === b` deja de alcanzar y escribir las
   * combinaciones a mano es como se olvida una.
   */
  const contenedores = [
    input.courseId,
    input.cohortId,
    input.classSessionId,
    // 0084 — los adjuntos de una consigna: cuarto y quinto contenedor.
    input.assessmentId,
    input.courseAssessmentTemplateId,
  ].filter(Boolean).length;

  if (contenedores !== 1) {
    return {
      ok: false,
      status: 422,
      code: "invalid_container",
      message:
        contenedores === 0
          ? "Un material tiene que ir en un curso, en un grupo o en una clase"
          : "Un material va en UN solo lugar: curso, grupo o clase",
    };
  }

  if (!input.title.trim()) {
    return { ok: false, status: 422, code: "invalid_title", message: "Falta el título" };
  }

  /**
   * Se exige una URL absoluta y no cualquier texto: un "enlace" que no abre
   * nada es peor que un material ausente, porque el alumno lo aprieta y cree
   * que el problema es suyo.
   *
   * 025 — La regla es `httpUrl` y no un `new URL()` a mano. Esta copia era
   * correcta, pero era una copia: el módulo compartido se creó justo porque
   * la misma regla escrita en varios lados se vuelve a escribir mal en el
   * siguiente lugar. Dos validaciones que HOY coinciden son dos que mañana
   * divergen sin que nadie lo note.
   */
  if (!httpUrl.safeParse(input.url).success) {
    return {
      ok: false,
      status: 422,
      code: "invalid_url",
      message: "El enlace tiene que empezar con http:// o https://",
    };
  }

  if (input.kind && !RESOURCE_KINDS.includes(input.kind)) {
    return { ok: false, status: 422, code: "invalid_kind", message: "Tipo desconocido" };
  }

  return { ok: true, data: input };
}

function serialize(row: typeof schema.resource.$inferSelect): ResourceDto {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    kind: row.kind,
    position: row.position,
    courseId: row.courseId,
    cohortId: row.cohortId,
    classSessionId: row.classSessionId,
    courseModuleId: row.courseModuleId,
  };
}

/** Material de un curso (aplica a todas sus cohortes) o de una clase puntual. */
export async function listResources(
  organizationId: string,
  filtro: { courseId?: string; cohortId?: string; classSessionId?: string }
): Promise<ResourceDto[]> {
  /**
   * 023 — Los tres filtros son EXCLUYENTES y se piden de a uno. Quien quiera
   * "todo lo que ve esta camada" tiene que pedir el del curso y el de la
   * camada y unirlos: son dos alcances distintos —el programa oficial y lo
   * que agregó esta edición— y mezclarlos acá escondería cuál es cuál.
   */
  const donde = filtro.courseId
    ? eq(schema.resource.courseId, filtro.courseId)
    : filtro.cohortId
      ? eq(schema.resource.cohortId, filtro.cohortId)
      : filtro.classSessionId
        ? eq(schema.resource.classSessionId, filtro.classSessionId)
        : undefined;
  if (!donde) return [];

  const rows = await getDb()
    .select()
    .from(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, donde))
    .orderBy(asc(schema.resource.position), asc(schema.resource.createdAt));
  return rows.map(serialize);
}

/**
 * Lo que ve una cohorte: el programa oficial del curso primero y lo que
 * agregó esa cohorte después, sin repetir. Es la unión que pide el comentario
 * de `listResources`, en un solo lugar para las dos puertas (profesor y
 * alumno).
 */
export function materialVisibleDeCohorte(
  delCurso: readonly ResourceDto[],
  deLaCohorte: readonly ResourceDto[]
): ResourceDto[] {
  const vistos = new Set<string>();
  return [...delCurso, ...deLaCohorte].filter((r) => {
    if (vistos.has(r.id)) return false;
    vistos.add(r.id);
    return true;
  });
}

/** El material que ve una cohorte: el de su curso más el suyo propio. */
export async function listCohortMaterial(
  organizationId: string,
  alcance: { courseId: string | null; cohortId: string }
): Promise<ResourceDto[]> {
  const [delCurso, deLaCohorte] = await Promise.all([
    alcance.courseId
      ? listResources(organizationId, { courseId: alcance.courseId })
      : Promise.resolve([]),
    listResources(organizationId, { cohortId: alcance.cohortId }),
  ]);
  return materialVisibleDeCohorte(delCurso, deLaCohorte);
}

/**
 * 029 — El material de CADA clase de una cohorte, repartido por clase.
 *
 * Existe para cortar el N+1 de la pestaña Clases: antes cada fila montaba su
 * panel y pedía lo suyo. Recibe filas ya ordenadas y conserva ese orden; se
 * queda solo con lo que cuelga de una clase y devuelve el MISMO DTO que el
 * pedido por clase — ni una columna más.
 */
export function agruparMaterialPorClase(
  rows: readonly ResourceDto[]
): Record<string, ResourceDto[]> {
  const porClase: Record<string, ResourceDto[]> = {};
  for (const r of rows) {
    if (!r.classSessionId) continue;
    // Se rearma a propósito y no se empuja `r`: el tipo admite filas más
    // anchas (con `organizationId`, `createdAt`…) y lo que viaja al cliente es
    // el DTO exacto, ni una columna más.
    const dto: ResourceDto = {
      id: r.id,
      title: r.title,
      url: r.url,
      kind: r.kind,
      position: r.position,
      courseId: r.courseId,
      cohortId: r.cohortId,
      classSessionId: r.classSessionId,
      courseModuleId: r.courseModuleId,
    };
    (porClase[r.classSessionId] ??= []).push(dto);
  }
  return porClase;
}

/**
 * 029 — Todo el material de clase de una cohorte en UNA consulta.
 *
 * Si la cohorte es una especialización, entran también las clases de sus
 * módulos (`parent_cohort_id`): la pestaña Clases de la madre las muestra
 * agrupadas por módulo, y pedirlas módulo por módulo sería el mismo N+1 con
 * otro nombre. Mismas reglas de visibilidad que `listResources`: el material
 * es contenido del curso y lo ve quien ve lo académico.
 */
export async function listClassResourcesOfCohort(
  organizationId: string,
  cohortId: string
): Promise<Record<string, ResourceDto[]>> {
  const rows = await getDb()
    .select({
      id: schema.resource.id,
      title: schema.resource.title,
      url: schema.resource.url,
      kind: schema.resource.kind,
      position: schema.resource.position,
      courseId: schema.resource.courseId,
      cohortId: schema.resource.cohortId,
      classSessionId: schema.resource.classSessionId,
      courseModuleId: schema.resource.courseModuleId,
    })
    .from(schema.resource)
    .innerJoin(schema.classSession, eq(schema.resource.classSessionId, schema.classSession.id))
    .innerJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
    .where(
      scoped(
        schema.resource.organizationId,
        organizationId,
        or(eq(schema.cohort.id, cohortId), eq(schema.cohort.parentCohortId, cohortId))
      )
    )
    .orderBy(asc(schema.resource.position), asc(schema.resource.createdAt));
  return agruparMaterialPorClase(rows);
}

/**
 * Confirma que el contenedor y el módulo del temario que llegan del cliente
 * pertenecen a `organizationId`. Las FK se verifican fuera de RLS: sin esto,
 * un material propio podría apuntar a un curso, camada o clase de OTRA
 * organización con solo conocer su id — misma disciplina que
 * `validateCohortForeignKeys`.
 */
async function validateResourceForeignKeys(
  organizationId: string,
  input: ResourceInput
): Promise<string | null> {
  const db = getDb();
  if (input.courseId) {
    const rows = await db
      .select({ id: schema.course.id })
      .from(schema.course)
      .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, input.courseId)))
      .limit(1);
    if (!rows[0]) return "Curso inexistente";
  }
  if (input.cohortId) {
    const rows = await db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, input.cohortId)))
      .limit(1);
    if (!rows[0]) return "Grupo inexistente";
  }
  if (input.classSessionId) {
    const rows = await db
      .select({ id: schema.classSession.id })
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          eq(schema.classSession.id, input.classSessionId)
        )
      )
      .limit(1);
    if (!rows[0]) return "Clase inexistente";
  }
  if (input.courseModuleId) {
    const rows = await db
      .select({ id: schema.courseModule.id })
      .from(schema.courseModule)
      .where(
        scoped(
          schema.courseModule.organizationId,
          organizationId,
          eq(schema.courseModule.id, input.courseModuleId)
        )
      )
      .limit(1);
    if (!rows[0]) return "Módulo del temario inexistente";
  }
  return null;
}

export async function createResource(
  organizationId: string,
  input: ResourceInput
): Promise<ResourceResult<ResourceDto>> {
  const valid = validateResource(input);
  if (!valid.ok) return valid;

  const fkError = await validateResourceForeignKeys(organizationId, input);
  if (fkError) {
    return { ok: false, status: 422, code: "invalid_reference", message: fkError };
  }

  const inserted = await getDb()
    .insert(schema.resource)
    .values({
      id: newId("resource"),
      organizationId,
      courseId: input.courseId ?? null,
      cohortId: input.cohortId ?? null,
      classSessionId: input.classSessionId ?? null,
      courseModuleId: input.courseModuleId ?? null,
      assessmentId: input.assessmentId ?? null,
      courseAssessmentTemplateId: input.courseAssessmentTemplateId ?? null,
      title: input.title.trim(),
      url: input.url.trim(),
      kind: input.kind ?? "enlace",
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    return { ok: false, status: 422, code: "not_created", message: "No se pudo guardar" };
  }
  return { ok: true, data: serialize(row) };
}

export async function deleteResource(
  organizationId: string,
  id: string
): Promise<ResourceResult<{ id: string }>> {
  const deleted = await getDb()
    .delete(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, eq(schema.resource.id, id)))
    .returning();

  if (!deleted[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Material no encontrado" };
  }
  return { ok: true, data: { id } };
}

/* ============================================================
 * 0088 — Material de clase del grupo en que se basó el alta
 * ============================================================
 *
 * "Basar en un grupo existente" copia el material de las CLASES del origen
 * como material del grupo, recordando de qué clase venía: el grupo nuevo
 * todavía no tiene clases. Se asigna a mano, una por una.
 */

export type MaterialPorAsignarDto = {
  id: string;
  title: string;
  url: string;
  kind: ResourceKind;
  /** Número de la clase de origen: sugiere la del mismo número. */
  originClassNumber: number | null;
  /** "Clase 3 · 12/03 · Muros". */
  originClassLabel: string;
};

/** El material del grupo que todavía recuerda su clase de origen. */
export async function materialPorAsignar(
  organizationId: string,
  cohortId: string
): Promise<MaterialPorAsignarDto[]> {
  const rows = await getDb()
    .select({
      id: schema.resource.id,
      title: schema.resource.title,
      url: schema.resource.url,
      kind: schema.resource.kind,
      originClassNumber: schema.resource.originClassNumber,
      originClassLabel: schema.resource.originClassLabel,
    })
    .from(schema.resource)
    .where(
      scoped(
        schema.resource.organizationId,
        organizationId,
        and(eq(schema.resource.cohortId, cohortId), isNotNull(schema.resource.originClassLabel))
      )
    )
    .orderBy(asc(schema.resource.originClassNumber), asc(schema.resource.position));
  return rows.map((r) => ({ ...r, originClassLabel: r.originClassLabel ?? "" }));
}

/**
 * Mueve un material del grupo a UNA de sus clases: deja de colgar del grupo
 * (un solo contenedor, `resource_contenedor_unico`) y olvida su clase de
 * origen. La clase tiene que ser del MISMO grupo; si no, 404 como si no
 * existiera.
 */
export async function asignarMaterialAClase(
  organizationId: string,
  resourceId: string,
  classSessionId: string
): Promise<ResourceResult<{ id: string; classSessionId: string }>> {
  const db = getDb();
  const [material] = await db
    .select({ id: schema.resource.id, cohortId: schema.resource.cohortId })
    .from(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, eq(schema.resource.id, resourceId)))
    .limit(1);
  if (!material?.cohortId) {
    return { ok: false, status: 404, code: "not_found", message: "Material no encontrado" };
  }
  const [clase] = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        and(
          eq(schema.classSession.id, classSessionId),
          eq(schema.classSession.cohortId, material.cohortId)
        )
      )
    )
    .limit(1);
  if (!clase) {
    return { ok: false, status: 404, code: "class_not_found", message: "Clase no encontrada en este grupo" };
  }
  await db
    .update(schema.resource)
    .set({
      cohortId: null,
      classSessionId,
      originClassNumber: null,
      originClassLabel: null,
      updatedAt: new Date(),
    })
    .where(scoped(schema.resource.organizationId, organizationId, eq(schema.resource.id, resourceId)));
  return { ok: true, data: { id: resourceId, classSessionId } };
}

/* ============================================================
 * 0084 — Los adjuntos de la consigna de una evaluación
 * ============================================================
 *
 * Reusan `resource` (enlaces, nunca archivos: constitución II) con dos
 * contenedores propios —`assessment_id` y `course_assessment_template_id`—
 * para que no aparezcan como material del grupo o del curso. Quien llama ya
 * verificó que la evaluación (o el modelo) es de la organización.
 */

export type ContenedorDeAdjuntos =
  | { assessmentId: string }
  | { courseAssessmentTemplateId: string };

export type AdjuntoInput = { title: string; url: string };

function condicionDeContenedor(c: ContenedorDeAdjuntos) {
  return "assessmentId" in c
    ? eq(schema.resource.assessmentId, c.assessmentId)
    : eq(schema.resource.courseAssessmentTemplateId, c.courseAssessmentTemplateId);
}

/** Los adjuntos de varias evaluaciones (o modelos) en UNA consulta, por contenedor. */
export async function adjuntosPorContenedor(
  organizationId: string,
  tipo: "assessment" | "courseAssessmentTemplate",
  ids: readonly string[]
): Promise<Map<string, AdjuntoDto[]>> {
  const out = new Map<string, AdjuntoDto[]>();
  if (ids.length === 0) return out;
  const columna =
    tipo === "assessment" ? schema.resource.assessmentId : schema.resource.courseAssessmentTemplateId;
  const rows = await getDb()
    .select({
      id: schema.resource.id,
      title: schema.resource.title,
      url: schema.resource.url,
      kind: schema.resource.kind,
      contenedor: columna,
    })
    .from(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, inArray(columna, [...ids])))
    .orderBy(asc(schema.resource.position), asc(schema.resource.createdAt));
  for (const r of rows) {
    if (!r.contenedor) continue;
    const lista = out.get(r.contenedor) ?? [];
    lista.push({ id: r.id, title: r.title, url: r.url, kind: r.kind });
    out.set(r.contenedor, lista);
  }
  return out;
}

/**
 * Reemplaza TODOS los adjuntos de un contenedor (la lista entera, en orden).
 * Nadie apunta a un `resource` por su id, así que borrar y volver a insertar
 * no rompe ninguna referencia. Cada enlace pasa por `validateResource`: la
 * misma regla de URL que el resto del material.
 */
export async function reemplazarAdjuntos(
  organizationId: string,
  contenedor: ContenedorDeAdjuntos,
  adjuntos: readonly AdjuntoInput[]
): Promise<ResourceResult<AdjuntoDto[]>> {
  for (const a of adjuntos) {
    const v = validateResource({ ...a, ...contenedor });
    if (!v.ok) return v;
  }
  const db = getDb();
  await db
    .delete(schema.resource)
    .where(scoped(schema.resource.organizationId, organizationId, condicionDeContenedor(contenedor)));
  if (adjuntos.length === 0) return { ok: true, data: [] };
  const inserted = await db
    .insert(schema.resource)
    .values(
      adjuntos.map((a, i) => ({
        id: newId("resource"),
        organizationId,
        assessmentId: "assessmentId" in contenedor ? contenedor.assessmentId : null,
        courseAssessmentTemplateId:
          "courseAssessmentTemplateId" in contenedor ? contenedor.courseAssessmentTemplateId : null,
        title: a.title.trim(),
        url: a.url.trim(),
        kind: "enlace" as const,
        position: i,
      }))
    )
    .returning();
  return {
    ok: true,
    data: inserted.map((r) => ({ id: r.id, title: r.title, url: r.url, kind: r.kind })),
  };
}

/** Copia los adjuntos de un contenedor a otro (filas NUEVAS: la copia no comparte nada). */
export async function copiarAdjuntos(
  organizationId: string,
  pares: readonly { desde: ContenedorDeAdjuntos; hacia: ContenedorDeAdjuntos }[]
): Promise<void> {
  const db = getDb();
  for (const { desde, hacia } of pares) {
    const origen = await db
      .select({ title: schema.resource.title, url: schema.resource.url, kind: schema.resource.kind })
      .from(schema.resource)
      .where(scoped(schema.resource.organizationId, organizationId, condicionDeContenedor(desde)))
      .orderBy(asc(schema.resource.position), asc(schema.resource.createdAt));
    if (origen.length === 0) continue;
    await db.insert(schema.resource).values(
      origen.map((r, i) => ({
        id: newId("resource"),
        organizationId,
        assessmentId: "assessmentId" in hacia ? hacia.assessmentId : null,
        courseAssessmentTemplateId:
          "courseAssessmentTemplateId" in hacia ? hacia.courseAssessmentTemplateId : null,
        title: r.title,
        url: r.url,
        kind: r.kind,
        position: i,
      }))
    );
  }
}

/* ============================================================
 * 013 (T022, FR-008) — Anuncios por cohorte
 * ============================================================ */

export type AnnouncementDto = {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  createdAt: string;
};

/**
 * Los últimos avisos de una cohorte, del más nuevo al más viejo.
 *
 * **No notifica** (DV-003): se registra y se ve. El aviso llega con 017. Lo
 * que resuelve hoy —que "no me enteré" deje de ser una discusión— lo dan el
 * autor y la fecha, no la notificación.
 */
export async function listAnnouncements(
  organizationId: string,
  cohortId: string
): Promise<AnnouncementDto[]> {
  const rows = await getDb()
    .select({
      id: schema.announcement.id,
      title: schema.announcement.title,
      body: schema.announcement.body,
      createdAt: schema.announcement.createdAt,
      authorName: schema.user.name,
    })
    .from(schema.announcement)
    .leftJoin(schema.user, eq(schema.announcement.authorUserId, schema.user.id))
    .where(
      scoped(
        schema.announcement.organizationId,
        organizationId,
        eq(schema.announcement.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.announcement.createdAt));

  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
    }))
    .reverse();
}

export async function createAnnouncement(
  organizationId: string,
  cohortId: string,
  authorUserId: string,
  input: { title: string; body: string }
): Promise<ResourceResult<AnnouncementDto>> {
  if (!input.title.trim() || !input.body.trim()) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "El aviso necesita título y cuerpo",
    };
  }

  const cohorte = await getDb()
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }

  const inserted = await getDb()
    .insert(schema.announcement)
    .values({
      id: newId("announcement"),
      organizationId,
      cohortId,
      authorUserId,
      title: input.title.trim(),
      body: input.body.trim(),
    })
    .returning();

  const row = inserted[0]!;
  return {
    ok: true,
    data: {
      id: row.id,
      title: row.title,
      body: row.body,
      authorName: null,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

