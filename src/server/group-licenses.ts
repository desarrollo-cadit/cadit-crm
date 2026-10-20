import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { licenciaOcupada } from "@/lib/license-rules";
import {
  mensajeFaltanLicencias,
  planAsignarAlGrupo,
  planQuitarDelGrupo,
  planSincronizarInscripcion,
  type LicenciaExistente,
} from "@/lib/group-licenses";
import { availableLicenses, bloquearStock, softwareDelGrupo } from "@/server/licenses";

/**
 * 035 (US1, FR-001..FR-007) — Licencias para todo el grupo de una cohorte:
 * las consultas y las escrituras.
 *
 * Las decisiones (qué convertir, reactivar, insertar o liberar; todo o nada)
 * son PURAS y viven en `src/lib/group-licenses.ts`. Acá se leen los hechos y
 * se escribe lo que el plan dice.
 *
 * Toda validación corre ANTES de escribir: devolver un error no revierte la
 * transacción del pedido, así que un grupo a medio asignar tiene que ser
 * imposible por construcción, no por rollback.
 *
 * Quién es "el grupo": las inscripciones cuyo `cohort_id` es la cohorte y
 * cuyo contacto no está de baja (`archived_at` null). En una especialización
 * eso es el paquete (las madres apuntan a la especialización) y en un módulo,
 * sus hijas (FR-007): no hace falta distinguir.
 */

export type GroupLicenseDto = {
  softwareId: string;
  name: string;
  expiresAt: string | null;
  /** Miembros activos del grupo CON la licencia asignada. */
  asignadas: number;
  /** FR-004/FR-016 — Miembros activos SIN ella (se inscribieron sin stock). */
  faltan: number;
};

type Db = ReturnType<typeof getDb>;

async function cohorteConFechas(db: Db, organizationId: string, cohortId: string) {
  const [row] = await db
    .select({
      id: schema.cohort.id,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
    })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  return row ?? null;
}

/** Las inscripciones activas del grupo (contacto no dado de baja). */
async function miembrosActivos(db: Db, organizationId: string, cohortId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId),
        isNull(schema.contact.archivedAt)
      )
    );
  return rows.map((r) => r.id);
}

/** Las filas de `license` de estas inscripciones, con la ocupación de HOY. */
async function licenciasDe(
  db: Db,
  organizationId: string,
  enrollmentIds: readonly string[],
  softwareId?: string
): Promise<(LicenciaExistente & { enrollmentId: string })[]> {
  if (enrollmentIds.length === 0) return [];
  const rows = await db
    .select({
      id: schema.license.id,
      enrollmentId: schema.license.enrollmentId,
      softwareId: schema.license.softwareId,
      assigned: schema.license.assigned,
      source: schema.license.source,
      expiresAt: schema.license.expiresAt,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
    })
    .from(schema.license)
    .innerJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        inArray(schema.license.enrollmentId, [...enrollmentIds]),
        softwareId ? eq(schema.license.softwareId, softwareId) : undefined
      )
    );
  const ahora = new Date();
  return rows.map((r) => ({
    id: r.id,
    enrollmentId: r.enrollmentId,
    softwareId: r.softwareId,
    assigned: r.assigned,
    source: r.source,
    ocupa: licenciaOcupada(
      { assigned: r.assigned, expiresAt: r.expiresAt },
      { startDate: r.startDate, endDate: r.endDate },
      ahora
    ),
  }));
}

/** ¿Una licencia nueva de esta cohorte, con este vencimiento, ocuparía stock? */
function descuentaStock(
  cohorte: { startDate: Date | null; endDate: Date | null },
  expiresAt: Date | null
): boolean {
  return licenciaOcupada({ assigned: true, expiresAt }, cohorte);
}

/* ============================================================
 * Lectura — para la cohorte
 * ============================================================ */

/** Los programas del grupo con cuántos los tienen y cuántos no; `null` → 404. */
export async function listarProgramasDelGrupo(
  organizationId: string,
  cohortId: string
): Promise<GroupLicenseDto[] | null> {
  const db = getDb();
  if (!(await cohorteConFechas(db, organizationId, cohortId))) return null;
  const grupo = await softwareDelGrupo(organizationId, [cohortId]);
  if (grupo.length === 0) return [];
  const miembros = await miembrosActivos(db, organizationId, cohortId);
  const licencias = await licenciasDe(db, organizationId, miembros);
  return grupo.map((g) => {
    const asignadas = new Set(
      licencias.filter((l) => l.softwareId === g.softwareId && l.assigned).map((l) => l.enrollmentId)
    ).size;
    return {
      softwareId: g.softwareId,
      name: g.name,
      expiresAt: g.expiresAt?.toISOString() ?? null,
      asignadas,
      faltan: miembros.length - asignadas,
    };
  });
}

/* ============================================================
 * Escritura — asignar y quitar del grupo
 * ============================================================ */

export type GroupLicenseResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: 404 | 409 | 422;
      code: "not_found" | "invalid_body" | "ya_en_el_grupo" | "no_stock";
      message: string;
    };

/**
 * FR-001/FR-002/FR-010 — Asigna `softwareId` a todo el grupo: una licencia
 * por miembro activo, todo o nada. Las individuales que ya ocupan pasan a ser
 * del grupo sin descontar otra vez.
 */
export async function asignarAlGrupo(
  organizationId: string,
  cohortId: string,
  softwareId: string,
  expiresAt: Date | null,
  userId: string
): Promise<GroupLicenseResult<{ asignadas: number; convertidas: number }>> {
  const db = getDb();
  const cohorte = await cohorteConFechas(db, organizationId, cohortId);
  if (!cohorte) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }
  // En fila con cualquier otra asignación del mismo programa, ANTES de leer el
  // stock y de mirar si ya está: dos clics seguidos no asignan dos veces.
  await bloquearStock(organizationId, [softwareId]);
  const yaEsta = await softwareDelGrupo(organizationId, [cohortId]);
  if (yaEsta.some((g) => g.softwareId === softwareId)) {
    return {
      ok: false,
      status: 409,
      code: "ya_en_el_grupo",
      message: "Ese programa ya está asignado a este grupo",
    };
  }

  const disponibilidad = await availableLicenses(organizationId, softwareId);
  if (!disponibilidad) {
    return { ok: false, status: 422, code: "invalid_body", message: "Software inexistente" };
  }

  const miembros = await miembrosActivos(db, organizationId, cohortId);
  const licencias = await licenciasDe(db, organizationId, miembros, softwareId);
  const plan = planAsignarAlGrupo({
    softwareId,
    miembros: miembros.map((enrollmentId) => ({
      enrollmentId,
      licencias: licencias.filter((l) => l.enrollmentId === enrollmentId),
    })),
    disponibles: disponibilidad.available,
    descuentaStock: descuentaStock(cohorte, expiresAt),
  });
  if (!plan.ok) {
    return {
      ok: false,
      status: 409,
      code: "no_stock",
      message: mensajeFaltanLicencias(disponibilidad.softwareName, plan),
    };
  }

  // Desde acá sólo se escribe: todo lo que podía fallar ya se validó.
  const ahora = new Date();
  await db.insert(schema.cohortGroupSoftware).values({
    id: newId("cohortGroupSoftware"),
    organizationId,
    cohortId,
    softwareId,
    expiresAt,
    createdBy: userId,
  });
  if (plan.convertir.length > 0) {
    // FR-010 — La misma fila, ahora del grupo: no se duplica ni se descuenta.
    // El vencimiento del grupo vale para todos (edge case de la spec).
    await db
      .update(schema.license)
      .set({ source: "grupo", expiresAt })
      .where(
        scoped(schema.license.organizationId, organizationId, inArray(schema.license.id, plan.convertir))
      );
  }
  if (plan.reactivar.length > 0) {
    await db
      .update(schema.license)
      .set({ assigned: true, assignedAt: ahora, source: "grupo", expiresAt })
      .where(
        scoped(schema.license.organizationId, organizationId, inArray(schema.license.id, plan.reactivar))
      );
  }
  if (plan.insertar.length > 0) {
    await db.insert(schema.license).values(
      plan.insertar.map((enrollmentId) => ({
        id: newId("license"),
        organizationId,
        enrollmentId,
        softwareId,
        assigned: true,
        assignedAt: ahora,
        expiresAt,
        source: "grupo" as const,
      }))
    );
  }

  return {
    ok: true,
    data: { asignadas: miembros.length, convertidas: plan.convertir.length },
  };
}

/**
 * FR-005 — Quita el programa del grupo y libera las licencias DEL GRUPO de
 * ese programa en la cohorte (también las de quien esté de baja, y las
 * vencidas). Las individuales no se tocan.
 */
export async function quitarDelGrupo(
  organizationId: string,
  cohortId: string,
  softwareId: string
): Promise<GroupLicenseResult<{ liberadas: number }>> {
  const db = getDb();
  const grupo = await softwareDelGrupo(organizationId, [cohortId]);
  if (!grupo.some((g) => g.softwareId === softwareId)) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Ese programa no está asignado a este grupo",
    };
  }

  const inscripciones = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.cohortId, cohortId))
    );
  const licencias = await licenciasDe(
    db,
    organizationId,
    inscripciones.map((i) => i.id),
    softwareId
  );
  const liberar = planQuitarDelGrupo(licencias, softwareId);

  if (liberar.length > 0) {
    await db
      .update(schema.license)
      .set({ assigned: false, assignedAt: null, expiresAt: null })
      .where(scoped(schema.license.organizationId, organizationId, inArray(schema.license.id, liberar)));
  }
  await db
    .delete(schema.cohortGroupSoftware)
    .where(
      scoped(
        schema.cohortGroupSoftware.organizationId,
        organizationId,
        and(
          eq(schema.cohortGroupSoftware.cohortId, cohortId),
          eq(schema.cohortGroupSoftware.softwareId, softwareId)
        )
      )
    );
  return { ok: true, data: { liberadas: liberar.length } };
}

/* ============================================================
 * Sincronización — altas, "Mudar" y bajas
 * ============================================================ */

/**
 * FR-004/FR-006/FR-007 — Lleva las licencias del grupo de cada inscripción a
 * lo que dice su cohorte HOY. Las cuatro puertas que cambian quién está en un
 * grupo la llaman después de escribir:
 *
 * - `createEnrollment` — el alta normal.
 * - `inscribirEnModulos` (034) — las hijas que se crean solas.
 * - `moverModuloDeRecorrido` ("Mudar") — pierde las del grupo viejo y recibe
 *   las del nuevo.
 * - `archiveOrDeleteContact` (la baja) — un contacto de baja no es del grupo,
 *   así que sus licencias del grupo se liberan.
 *
 * Nunca bloquea: sin stock, la inscripción queda igual y el faltante se ve en
 * la cohorte y en la vista de Licencias. Devuelve qué no se pudo dar.
 */
export async function sincronizarLicenciasDelGrupo(
  organizationId: string,
  enrollmentIds: readonly string[]
): Promise<{ sinStock: { enrollmentId: string; softwareId: string }[] }> {
  if (enrollmentIds.length === 0) return { sinStock: [] };
  const db = getDb();
  const inscripciones = await db
    .select({
      id: schema.enrollment.id,
      cohortId: schema.enrollment.cohortId,
      archivedAt: schema.contact.archivedAt,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        inArray(schema.enrollment.id, [...enrollmentIds])
      )
    );
  if (inscripciones.length === 0) return { sinStock: [] };

  const cohortIds = [
    ...new Set(inscripciones.flatMap((i) => (i.cohortId && !i.archivedAt ? [i.cohortId] : []))),
  ];
  const [grupos, licencias] = await Promise.all([
    softwareDelGrupo(organizationId, cohortIds),
    licenciasDe(
      db,
      organizationId,
      inscripciones.map((i) => i.id)
    ),
  ]);
  // Nada del grupo de nadie y nada del grupo que liberar: no hay qué hacer.
  if (grupos.length === 0 && !licencias.some((l) => l.source === "grupo" && l.assigned)) {
    return { sinStock: [] };
  }

  const programas = [...new Set(grupos.map((g) => g.softwareId))];
  await bloquearStock(organizationId, programas);
  const libres = new Map<string, number>();
  for (const id of programas) {
    libres.set(id, (await availableLicenses(organizationId, id))?.available ?? 0);
  }

  const sinStock: { enrollmentId: string; softwareId: string }[] = [];
  const ahora = new Date();
  for (const i of inscripciones) {
    const suyo = i.archivedAt || !i.cohortId ? [] : grupos.filter((g) => g.cohortId === i.cohortId);
    const fechas = { startDate: i.startDate, endDate: i.endDate };
    const grupo = suyo.map((g) => ({
      softwareId: g.softwareId,
      descuentaStock: descuentaStock(fechas, g.expiresAt),
      expiresAt: g.expiresAt,
    }));
    const plan = planSincronizarInscripcion({
      grupo,
      licencias: licencias.filter((l) => l.enrollmentId === i.id),
      disponibles: libres,
    });
    const vence = (softwareId: string) => grupo.find((g) => g.softwareId === softwareId)?.expiresAt ?? null;

    if (plan.liberar.length > 0) {
      await db
        .update(schema.license)
        .set({ assigned: false, assignedAt: null, expiresAt: null })
        .where(
          scoped(schema.license.organizationId, organizationId, inArray(schema.license.id, plan.liberar))
        );
    }
    for (const c of plan.convertir) {
      await db
        .update(schema.license)
        .set({ source: "grupo", expiresAt: vence(c.softwareId) })
        .where(scoped(schema.license.organizationId, organizationId, eq(schema.license.id, c.id)));
    }
    for (const r of plan.reactivar) {
      await db
        .update(schema.license)
        .set({ assigned: true, assignedAt: ahora, source: "grupo", expiresAt: vence(r.softwareId) })
        .where(scoped(schema.license.organizationId, organizationId, eq(schema.license.id, r.id)));
    }
    if (plan.insertar.length > 0) {
      await db.insert(schema.license).values(
        plan.insertar.map((softwareId) => ({
          id: newId("license"),
          organizationId,
          enrollmentId: i.id,
          softwareId,
          assigned: true,
          assignedAt: ahora,
          expiresAt: vence(softwareId),
          source: "grupo" as const,
        }))
      );
    }
    // El stock que esta inscripción tomó ya no está para la siguiente.
    for (const g of grupo) {
      const tomo =
        g.descuentaStock &&
        (plan.insertar.includes(g.softwareId) ||
          plan.reactivar.some((r) => r.softwareId === g.softwareId));
      if (tomo) libres.set(g.softwareId, (libres.get(g.softwareId) ?? 0) - 1);
    }
    for (const softwareId of plan.sinStock) sinStock.push({ enrollmentId: i.id, softwareId });
  }
  return { sinStock };
}
