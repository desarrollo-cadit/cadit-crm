import { httpUrl } from "@/lib/url-schema";
import { asc, eq, or } from "drizzle-orm";
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
  const contenedores = [input.courseId, input.cohortId, input.classSessionId].filter(
    Boolean
  ).length;

  if (contenedores !== 1) {
    return {
      ok: false,
      status: 422,
      code: "invalid_container",
      message:
        contenedores === 0
          ? "Un material tiene que ir en un curso, en una camada o en una clase"
          : "Un material va en UN solo lugar: curso, camada o clase",
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
    if (!rows[0]) return "Camada inexistente";
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
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
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

