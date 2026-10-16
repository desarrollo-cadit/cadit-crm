import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { licenciaOcupada, licenciasRepetidasEnRecorrido } from "@/lib/license-rules";
import { licenciaDelGrupoBloquea, MENSAJE_LICENCIA_DEL_GRUPO } from "@/lib/group-licenses";

/**
 * 005 (T028, DV-004, US4) — pool de licencias por software: disponibles =
 * `software.total_licenses - count(license WHERE software_id = X AND
 * assigned = true)`.
 */
export type LicenseAvailability = {
  softwareId: string;
  softwareName: string;
  total: number;
  assignedCount: number;
  available: number;
};

/** null si el software no existe (o no pertenece a la organización). */
export async function availableLicenses(
  organizationId: string,
  softwareId: string
): Promise<LicenseAvailability | null> {
  const db = getDb();
  const softwareRows = await db
    .select({ name: schema.software.name, totalLicenses: schema.software.totalLicenses })
    .from(schema.software)
    .where(
      scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId))
    )
    .limit(1);
  const sw = softwareRows[0];
  if (!sw) return null;

  // 023 — Misma regla que el inventario: una licencia de un curso terminado
  // ya no bloquea la asignación de una nueva.
  const assignedCount = (await contarOcupadas(organizationId, softwareId)).get(softwareId) ?? 0;
  return {
    softwareId,
    softwareName: sw.name,
    total: sw.totalLicenses,
    assignedCount,
    available: sw.totalLicenses - assignedCount,
  };
}

export type LicenseDto = {
  id: string;
  enrollmentId: string;
  softwareId: string;
  assigned: boolean;
  assignedAt: string | null;
  /** 035 (FR-003) — `grupo` o `individual`. */
  source: "grupo" | "individual";
};

/**
 * 035 — Dos asignaciones simultáneas del mismo programa leían el mismo
 * "quedan 1" y entraban las dos. Un advisory lock de TRANSACCIÓN por
 * (organización, programa) las pone en fila: la segunda lee el stock después
 * de que la primera escribió. Se suelta solo al terminar la transacción del
 * pedido (`withAuth`). Los ids se ordenan para que dos pedidos que toman
 * varios programas no se esperen en cruz.
 */
export async function bloquearStock(
  organizationId: string,
  softwareIds: readonly string[]
): Promise<void> {
  const db = getDb();
  for (const id of [...new Set(softwareIds)].sort()) {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"lic:" + organizationId + ":" + id}))`);
  }
}

/**
 * 035 (FR-008) — Los programas asignados al grupo de una cohorte, con su
 * nombre y vencimiento. Vive acá (y no en `group-licenses.ts`) porque la
 * asignación individual lo consulta para bloquearse, y `group-licenses.ts`
 * ya importa este módulo.
 */
export async function softwareDelGrupo(
  organizationId: string,
  cohortIds: readonly string[]
): Promise<{ cohortId: string; softwareId: string; name: string; expiresAt: Date | null }[]> {
  if (cohortIds.length === 0) return [];
  return getDb()
    .select({
      cohortId: schema.cohortGroupSoftware.cohortId,
      softwareId: schema.cohortGroupSoftware.softwareId,
      name: schema.software.name,
      expiresAt: schema.cohortGroupSoftware.expiresAt,
    })
    .from(schema.cohortGroupSoftware)
    .innerJoin(schema.software, eq(schema.software.id, schema.cohortGroupSoftware.softwareId))
    .where(
      scoped(
        schema.cohortGroupSoftware.organizationId,
        organizationId,
        inArray(schema.cohortGroupSoftware.cohortId, [...cohortIds])
      )
    )
    .orderBy(asc(schema.software.name));
}

/** 035 (FR-008) — El motivo, si el programa es del grupo de la cohorte de la inscripción. */
async function bloqueoPorGrupo(
  organizationId: string,
  cohortId: string | null | undefined,
  softwareId: string
): Promise<string | null> {
  if (!cohortId) return null;
  const grupo = await softwareDelGrupo(organizationId, [cohortId]);
  if (!licenciaDelGrupoBloquea(grupo.map((g) => g.softwareId), softwareId)) return null;
  return MENSAJE_LICENCIA_DEL_GRUPO(grupo.find((g) => g.softwareId === softwareId)?.name ?? "Ese programa");
}

function serializeLicense(l: typeof schema.license.$inferSelect): LicenseDto {
  return {
    id: l.id,
    enrollmentId: l.enrollmentId,
    softwareId: l.softwareId,
    assigned: l.assigned,
    assignedAt: l.assignedAt?.toISOString() ?? null,
    source: l.source ?? "individual",
  };
}

export type AssignLicenseResult =
  | {
      ok: true;
      license: LicenseDto;
      /**
       * 034 (edge case) — Programas que quedan TANTO en el paquete (la madre)
       * como en un módulo (una hija) de la misma persona. Está permitido —son
       * inscripciones distintas y cada una descuenta stock—, pero casi siempre
       * es un error de carga, así que se avisa sin bloquear.
       */
      warnings: string[];
    }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string }
  | { ok: false; status: 409; code: "no_stock" | "asignado_al_grupo"; message: string };

/**
 * 005 (T028, FR-003) — asigna una licencia de `softwareId` a la inscripción;
 * rechaza si el pool disponible es cero.
 *
 * 034 (FR-020..FR-022) — Una inscripción admite VARIAS licencias, a lo sumo
 * una por programa (índice único `enrollment_id, software_id`). Asignar un
 * programa ya asignado es idempotente (no descuenta de nuevo); asignar OTRO
 * agrega una licencia en vez de mover la que había, que era la regla de 005.
 * Una licencia liberada (`assigned = false`) del mismo programa se reactiva:
 * no se duplica la fila.
 */
export async function assignLicense(
  organizationId: string,
  enrollmentId: string,
  softwareId: string
): Promise<AssignLicenseResult> {
  const db = getDb();

  const enrollmentRows = await db
    .select({
      id: schema.enrollment.id,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      cohortId: schema.enrollment.cohortId,
    })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  if (!enrollmentRows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  // 035 (FR-008) — Lo del grupo no se asigna por alumno, por ninguna vía.
  const bloqueo = await bloqueoPorGrupo(organizationId, enrollmentRows[0].cohortId, softwareId);
  if (bloqueo) {
    return { ok: false, status: 409, code: "asignado_al_grupo", message: bloqueo };
  }

  // 035 — En fila con cualquier otra asignación del mismo programa.
  await bloquearStock(organizationId, [softwareId]);
  const availability = await availableLicenses(organizationId, softwareId);
  if (!availability) {
    return { ok: false, status: 422, code: "invalid_body", message: "Software inexistente" };
  }

  const existingRows = await db
    .select()
    .from(schema.license)
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId),
        eq(schema.license.softwareId, softwareId)
      )
    )
    .limit(1);
  const existing = existingRows[0] ?? null;

  // Idempotente: el mismo programa ya asignado no descuenta otra vez (escenario 3).
  if (existing?.assigned) {
    return { ok: true, license: serializeLicense(existing), warnings: [] };
  }
  if (availability.available <= 0) {
    return {
      ok: false,
      status: 409,
      code: "no_stock",
      message: `No hay licencias disponibles de ${availability.softwareName}`,
    };
  }

  const now = new Date();
  const row = existing
    ? (
        await db
          .update(schema.license)
          .set({ assigned: true, assignedAt: now, source: "individual" })
          .where(
            scoped(schema.license.organizationId, organizationId, eq(schema.license.id, existing.id))
          )
          .returning()
      )[0]!
    : (
        await db
          .insert(schema.license)
          .values({
            id: newId("license"),
            organizationId,
            enrollmentId,
            softwareId,
            assigned: true,
            assignedAt: now,
            source: "individual",
          })
          .returning()
      )[0]!;

  const warnings = await licenciasRepetidasDeLaPersona(
    organizationId,
    enrollmentId,
    enrollmentRows[0].parentEnrollmentId ?? null
  );
  return { ok: true, license: serializeLicense(row), warnings };
}

/**
 * 034 — Los programas repetidos entre el paquete y los módulos del mismo
 * recorrido. Si la inscripción es una hija, se compara con su madre; si es una
 * madre, con todas sus hijas. Una inscripción suelta no tiene con qué
 * compararse y no consulta nada más.
 */
async function licenciasRepetidasDeLaPersona(
  organizationId: string,
  enrollmentId: string,
  parentEnrollmentId: string | null
): Promise<string[]> {
  const db = getDb();
  const madreId = parentEnrollmentId ?? enrollmentId;
  const hijas = parentEnrollmentId
    ? [enrollmentId]
    : (
        await db
          .select({ id: schema.enrollment.id })
          .from(schema.enrollment)
          .where(
            scoped(
              schema.enrollment.organizationId,
              organizationId,
              eq(schema.enrollment.parentEnrollmentId, enrollmentId)
            )
          )
      ).map((h) => h.id);
  if (hijas.length === 0) return [];

  const filas = await db
    .select({
      enrollmentId: schema.license.enrollmentId,
      softwareId: schema.license.softwareId,
      softwareName: schema.software.name,
    })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.assigned, true),
        inArray(schema.license.enrollmentId, [madreId, ...hijas])
      )
    );
  return licenciasRepetidasEnRecorrido(
    filas.filter((f) => f.enrollmentId === madreId),
    filas.filter((f) => f.enrollmentId !== madreId)
  );
}

/**
 * 005 (T028, FR-002/FR-003 escenario 3) — libera licencias de una
 * inscripción (vuelven al pool disponible). Idempotente.
 *
 * 034 — Con `softwareId`, sólo la de ese programa; sin él, todas las de la
 * inscripción (el comportamiento de antes, cuando había una sola). Devuelve
 * la primera liberada, o `null` si no había ninguna asignada.
 *
 * 035 (FR-008) — Sólo libera INDIVIDUALES. Un programa del grupo de la
 * cohorte se rechaza con 409 (se quita desde la cohorte); "liberar todas" sin
 * `softwareId` deja las del grupo donde están.
 */
export type UnassignLicenseResult =
  | { ok: true; license: LicenseDto | null }
  | { ok: false; status: 409; code: "asignado_al_grupo"; message: string };

export async function unassignLicense(
  organizationId: string,
  enrollmentId: string,
  softwareId?: string
): Promise<UnassignLicenseResult> {
  const db = getDb();
  if (softwareId) {
    const inscripcion = await db
      .select({ cohortId: schema.enrollment.cohortId })
      .from(schema.enrollment)
      .where(
        scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId))
      )
      .limit(1);
    const bloqueo = await bloqueoPorGrupo(organizationId, inscripcion[0]?.cohortId, softwareId);
    if (bloqueo) return { ok: false, status: 409, code: "asignado_al_grupo", message: bloqueo };
  }
  const updated = await db
    .update(schema.license)
    .set({ assigned: false, assignedAt: null })
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId),
        eq(schema.license.assigned, true),
        eq(schema.license.source, "individual"),
        softwareId ? eq(schema.license.softwareId, softwareId) : undefined
      )
    )
    .returning();
  const row = updated[0];
  return { ok: true, license: row ? serializeLicense(row) : null };
}

export type EnrollmentLicenseDto = LicenseDto & { softwareName: string };

/** 034 (FR-020) — Las licencias ASIGNADAS de una inscripción, con el nombre del programa. */
export async function listEnrollmentLicenses(
  organizationId: string,
  enrollmentId: string
): Promise<EnrollmentLicenseDto[]> {
  const filas = await getDb()
    .select({ license: schema.license, softwareName: schema.software.name })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId),
        eq(schema.license.assigned, true)
      )
    )
    .orderBy(asc(schema.software.name));
  return filas.map((f) => ({ ...serializeLicense(f.license), softwareName: f.softwareName }));
}


/**
 * 023 — `licenciaOcupada` vive en `@/lib/license-rules` desde la 035: la
 * vista de Licencias y el plan del grupo la necesitan sin arrastrar la base.
 * Se re-exporta para los llamadores de siempre.
 */
export { licenciaOcupada };

/**
 * 023 — Cuántas licencias están OCUPADAS, por software.
 *
 * Un solo lugar que aplica `licenciaOcupada`. Antes había tres consultas
 * distintas contando `assigned = true` —el inventario, el chequeo de
 * disponibilidad y el conteo por software— y con la regla vieja las tres
 * daban lo mismo. Con la regla nueva, tres copias serían tres formas de
 * empezar a diferir.
 */
export async function contarOcupadas(
  organizationId: string,
  softwareId?: string
): Promise<Map<string, number>> {
  const db = getDb();
  const licencias = await db
    .select({
      softwareId: schema.license.softwareId,
      assigned: schema.license.assigned,
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
        softwareId ? eq(schema.license.softwareId, softwareId) : undefined
      )
    );

  const ahora = new Date();
  const salida = new Map<string, number>();
  for (const l of licencias) {
    const ocupada = licenciaOcupada(
      { assigned: l.assigned, expiresAt: l.expiresAt },
      // El leftJoin trae fechas nulas cuando la inscripción no tiene cohorte:
      // eso es "fechas desconocidas", no "terminó".
      { startDate: l.startDate, endDate: l.endDate },
      ahora
    );
    if (ocupada) salida.set(l.softwareId, (salida.get(l.softwareId) ?? 0) + 1);
  }
  return salida;
}

/**
 * 005 iteración 2 (home, widget de licencias, pedido en vivo del dueño) —
 * total vs. disponibles por cada software de la organización. Consulta
 * propia (no reusa `listSoftware` de `@/server/software`, que a su vez
 * importa `countAssignedLicenses` de este módulo — evita el ciclo).
 */
export async function listLicenseInventory(
  organizationId: string
): Promise<LicenseAvailability[]> {
  const db = getDb();
  const softwareRows = await db
    .select({
      id: schema.software.id,
      name: schema.software.name,
      totalLicenses: schema.software.totalLicenses,
    })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId))
    .orderBy(asc(schema.software.name));
  if (softwareRows.length === 0) return [];

  const assignedMap = await contarOcupadas(organizationId);

  return softwareRows.map((s) => {
    const assignedCount = assignedMap.get(s.id) ?? 0;
    return {
      softwareId: s.id,
      softwareName: s.name,
      total: s.totalLicenses,
      assignedCount,
      available: s.totalLicenses - assignedCount,
    };
  });
}

/** 005 (T031, FR-004) — cuántas licencias de este software están asignadas. */
export async function countAssignedLicenses(
  organizationId: string,
  softwareId: string
): Promise<number> {
  return (await contarOcupadas(organizationId, softwareId)).get(softwareId) ?? 0;
}
