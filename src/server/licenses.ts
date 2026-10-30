import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  licenciaDeProfesorOcupada,
  licenciaOcupada,
  licenciasRepetidasEnRecorrido,
} from "@/lib/license-rules";
import { licenciaDelGrupoBloquea, MENSAJE_LICENCIA_DEL_GRUPO } from "@/lib/group-licenses";
import { normalizarCorreo } from "@/lib/contact-identity";
import { correoDeLicencia } from "@/lib/license-email";
import { MENSAJE_LICENCIA_PROPIA_ASIGNAR } from "@/lib/terminos-licencia";
import {
  claveDeStock,
  MENSAJE_EQUIPO_ARCHIVADO,
  MENSAJE_EQUIPO_INEXISTENTE,
} from "@/lib/license-team";
import { asientosAjenos } from "@/server/license-ajenos";

/**
 * 005 (T028, DV-004, US4) — pool de licencias por software.
 *
 * 0089 — El cupo es de cada EQUIPO (`license_team_seat`): con `teamId`,
 * disponibles = cupo de ese equipo − sus licencias ocupadas; sin él, la suma
 * de los cupos de los equipos activos − todas las ocupadas (lo que miran las
 * advertencias de cupo de una cohorte y el widget del inicio).
 *
 * 0091 — `externos`: los asientos que Autodesk tiene ocupados y el campus no
 * cuenta (la última importación del equipo). Restan del disponible: no se
 * promete una licencia que Autodesk ya dio. Sin importaciones es 0.
 */
export type LicenseAvailability = {
  softwareId: string;
  softwareName: string;
  total: number;
  assignedCount: number;
  /** 0091 — Ocupados en Autodesk sin titular en el campus. */
  externos: number;
  available: number;
};

/**
 * 0089 — El cupo total de un programa: el del equipo si `soloEquipo`, o la suma
 * de los equipos NO archivados. Un archivado no tiene licencias ocupadas (no se
 * puede archivar con ellas), así que su cupo no infla el disponible. Se usa
 * sobre `software ⟕ license_team_seat ⟕ license_team`, agrupado por software.
 */
export function cupoTotalSql(soloEquipo: boolean) {
  return soloEquipo
    ? sql<number>`coalesce(sum(${schema.licenseTeamSeat.total}), 0)::int`
    : sql<number>`coalesce(sum(${schema.licenseTeamSeat.total}) filter (where ${schema.licenseTeam.archivedAt} is null), 0)::int`;
}

/**
 * null si el software no existe (o no pertenece a la organización). Con
 * `teamId`, el stock de ESE equipo (0 si el equipo no tiene cupo de este
 * programa); quien lo llama valida que el equipo sea de la organización.
 */
export async function availableLicenses(
  organizationId: string,
  softwareId: string,
  teamId?: string
): Promise<LicenseAvailability | null> {
  const db = getDb();
  const softwareRows = await db
    .select({ name: schema.software.name, total: cupoTotalSql(Boolean(teamId)) })
    .from(schema.software)
    .leftJoin(
      schema.licenseTeamSeat,
      and(
        eq(schema.licenseTeamSeat.softwareId, schema.software.id),
        teamId ? eq(schema.licenseTeamSeat.teamId, teamId) : undefined
      )
    )
    .leftJoin(schema.licenseTeam, eq(schema.licenseTeam.id, schema.licenseTeamSeat.teamId))
    .where(
      scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId))
    )
    .groupBy(schema.software.id, schema.software.name)
    .limit(1);
  const sw = softwareRows[0];
  if (!sw) return null;

  // 023 — Misma regla que el inventario: una licencia de un curso terminado
  // ya no bloquea la asignación de una nueva.
  const assignedCount =
    (await contarOcupadas(organizationId, softwareId, teamId)).get(softwareId) ?? 0;
  // 0091 — Lo que Autodesk tiene ocupado y el campus no cuenta.
  const ajenos = await asientosAjenos(organizationId, { teamId, softwareId });
  const externos = [...ajenos].reduce(
    (suma, [clave, n]) => (clave.endsWith(`|${softwareId}`) ? suma + n : suma),
    0
  );
  return {
    softwareId,
    softwareName: sw.name,
    total: sw.total,
    assignedCount,
    externos,
    available: sw.total - assignedCount - externos,
  };
}

/**
 * 0091 — Opciones de una asignación que viene de la CONCILIACIÓN con Autodesk.
 * `yaOcupaEnAutodesk`: ese asiento ya está ocupado en Autodesk y por eso ya resta
 * del disponible como asiento ajeno; al marcarlo en el campus pasa a ser del
 * campus y el neto no cambia. Sin esto, un equipo lleno rechazaría (409) marcar
 * a quien Autodesk ya tiene, justo lo que la conciliación quiere corregir.
 */
export type OpcionesDeAsignacion = { yaOcupaEnAutodesk?: boolean };

const disponiblesPara = (a: LicenseAvailability, opts?: OpcionesDeAsignacion) =>
  a.available + (opts?.yaOcupaEnAutodesk && a.externos > 0 ? 1 : 0);

/**
 * 0089 — El equipo, si es de la organización: `null` si no existe. Quien asigna
 * (individual o por grupo) lo valida ANTES de tocar el stock.
 */
export async function buscarEquipo(
  organizationId: string,
  teamId: string
): Promise<{ id: string; name: string; archived: boolean } | null> {
  const [fila] = await getDb()
    .select({
      id: schema.licenseTeam.id,
      name: schema.licenseTeam.name,
      archivedAt: schema.licenseTeam.archivedAt,
    })
    .from(schema.licenseTeam)
    .where(scoped(schema.licenseTeam.organizationId, organizationId, eq(schema.licenseTeam.id, teamId)))
    .limit(1);
  return fila ? { id: fila.id, name: fila.name, archived: fila.archivedAt !== null } : null;
}

/** El motivo por el que NO se puede asignar de este equipo, o `null` si se puede. */
export async function motivoDeEquipoNoAsignable(
  organizationId: string,
  teamId: string
): Promise<string | null> {
  const equipo = await buscarEquipo(organizationId, teamId);
  if (!equipo) return MENSAJE_EQUIPO_INEXISTENTE;
  return equipo.archived ? MENSAJE_EQUIPO_ARCHIVADO : null;
}

export type LicenseDto = {
  id: string;
  /** Una inscripción O un profesor (0090): exactamente uno de los dos. */
  enrollmentId: string | null;
  teacherId: string | null;
  softwareId: string;
  /** 0089 — El equipo del que sale su asiento. */
  teamId: string;
  assigned: boolean;
  assignedAt: string | null;
  /** 035 (FR-003) — `grupo` o `individual`. */
  source: "grupo" | "individual";
};

/**
 * 035 — Dos asignaciones simultáneas del mismo programa leían el mismo
 * "quedan 1" y entraban las dos. Un advisory lock de TRANSACCIÓN las pone en
 * fila: la segunda lee el stock después de que la primera escribió. Se suelta
 * solo al terminar la transacción del pedido (`withAuth`). Las llaves se
 * ordenan para que dos pedidos que toman varios stocks no se esperen en cruz.
 *
 * 0089 — El stock es de un EQUIPO y un programa: Uruguay lleno no hace esperar
 * a quien asigna del equipo de Paraguay.
 */
export async function bloquearStock(
  organizationId: string,
  stocks: readonly { teamId: string; softwareId: string }[]
): Promise<void> {
  const db = getDb();
  for (const clave of [...new Set(stocks.map((s) => claveDeStock(s.teamId, s.softwareId)))].sort()) {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"lic:" + organizationId + ":" + clave}))`);
  }
}

/**
 * 035 (FR-008) — Los programas asignados al grupo de una cohorte, con su
 * nombre, vencimiento y (0089) el equipo del que salen. Vive acá (y no en
 * `group-licenses.ts`) porque la asignación individual lo consulta para
 * bloquearse, y `group-licenses.ts` ya importa este módulo.
 */
export async function softwareDelGrupo(
  organizationId: string,
  cohortIds: readonly string[]
): Promise<
  {
    cohortId: string;
    softwareId: string;
    name: string;
    teamId: string;
    teamName: string;
    expiresAt: Date | null;
  }[]
> {
  if (cohortIds.length === 0) return [];
  return getDb()
    .select({
      cohortId: schema.cohortGroupSoftware.cohortId,
      softwareId: schema.cohortGroupSoftware.softwareId,
      name: schema.software.name,
      teamId: schema.cohortGroupSoftware.teamId,
      teamName: schema.licenseTeam.name,
      expiresAt: schema.cohortGroupSoftware.expiresAt,
    })
    .from(schema.cohortGroupSoftware)
    .innerJoin(schema.software, eq(schema.software.id, schema.cohortGroupSoftware.softwareId))
    .innerJoin(schema.licenseTeam, eq(schema.licenseTeam.id, schema.cohortGroupSoftware.teamId))
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
    teacherId: l.teacherId,
    softwareId: l.softwareId,
    teamId: l.teamId,
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
  | { ok: false; status: 422; code: "invalid_body" | "licencia_propia"; message: string }
  | { ok: false; status: 409; code: "no_stock" | "asignado_al_grupo"; message: string };

/**
 * 2026-10-23 — ¿Trajo su propia licencia? La marca de la inscripción o, en la
 * hija de un módulo, la de su madre (la marca vale para todo el recorrido; en
 * el roster de la especialización se tilda en la madre).
 */
export async function tieneLicenciaPropia(
  organizationId: string,
  e: { hadOwnLicense: boolean; parentEnrollmentId: string | null }
): Promise<boolean> {
  if (e.hadOwnLicense) return true;
  if (!e.parentEnrollmentId) return false;
  const [madre] = await getDb()
    .select({ hadOwnLicense: schema.enrollment.hadOwnLicense })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, e.parentEnrollmentId)
      )
    )
    .limit(1);
  return Boolean(madre?.hadOwnLicense);
}

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
 *
 * 0089 — `teamId` es OBLIGATORIO: la licencia sale del cupo de ese equipo y de
 * ningún otro (Uruguay lleno no impide asignar del equipo de Paraguay). Si el
 * programa ya estaba asignado desde otro equipo, pasa a este y pide stock acá.
 */
export async function assignLicense(
  organizationId: string,
  enrollmentId: string,
  softwareId: string,
  teamId: string,
  opts?: OpcionesDeAsignacion
): Promise<AssignLicenseResult> {
  const db = getDb();

  const enrollmentRows = await db
    .select({
      id: schema.enrollment.id,
      parentEnrollmentId: schema.enrollment.parentEnrollmentId,
      cohortId: schema.enrollment.cohortId,
      hadOwnLicense: schema.enrollment.hadOwnLicense,
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

  // 2026-10-23 — "Tenía licencia propia" (de la inscripción o, en la hija de
  // un módulo, de su madre): no se le presta una. Antes de tocar el stock.
  if (
    await tieneLicenciaPropia(organizationId, {
      hadOwnLicense: enrollmentRows[0].hadOwnLicense,
      parentEnrollmentId: enrollmentRows[0].parentEnrollmentId ?? null,
    })
  ) {
    return {
      ok: false,
      status: 422,
      code: "licencia_propia",
      message: MENSAJE_LICENCIA_PROPIA_ASIGNAR,
    };
  }

  // 035 (FR-008) — Lo del grupo no se asigna por alumno, por ninguna vía.
  const bloqueo = await bloqueoPorGrupo(organizationId, enrollmentRows[0].cohortId, softwareId);
  if (bloqueo) {
    return { ok: false, status: 409, code: "asignado_al_grupo", message: bloqueo };
  }

  // 0089 — El equipo tiene que ser de la organización y estar activo.
  const equipo = await buscarEquipo(organizationId, teamId);
  if (!equipo || equipo.archived) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: equipo ? MENSAJE_EQUIPO_ARCHIVADO : MENSAJE_EQUIPO_INEXISTENTE,
    };
  }

  // 035 — En fila con cualquier otra asignación del mismo programa en ese equipo.
  await bloquearStock(organizationId, [{ teamId, softwareId }]);
  const availability = await availableLicenses(organizationId, softwareId, teamId);
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

  // Idempotente: el mismo programa ya asignado, desde ESTE equipo, no descuenta
  // otra vez (escenario 3).
  if (existing?.assigned && existing.teamId === teamId) {
    return { ok: true, license: serializeLicense(existing), warnings: [] };
  }
  if (disponiblesPara(availability, opts) <= 0) {
    return {
      ok: false,
      status: 409,
      code: "no_stock",
      message: `No hay licencias disponibles de ${availability.softwareName} en ${equipo.name}`,
    };
  }

  const now = new Date();
  const row = existing
    ? (
        await db
          .update(schema.license)
          .set({ assigned: true, assignedAt: now, source: "individual", teamId })
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
            teamId,
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

export type EnrollmentLicenseDto = LicenseDto & { softwareName: string; teamName: string };

/**
 * 034 (FR-020) — Las licencias ASIGNADAS de una inscripción, con el nombre del
 * programa y (0089) el del equipo del que salen.
 */
export async function listEnrollmentLicenses(
  organizationId: string,
  enrollmentId: string
): Promise<EnrollmentLicenseDto[]> {
  const filas = await getDb()
    .select({
      license: schema.license,
      softwareName: schema.software.name,
      teamName: schema.licenseTeam.name,
    })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .innerJoin(schema.licenseTeam, eq(schema.license.teamId, schema.licenseTeam.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId),
        eq(schema.license.assigned, true)
      )
    )
    .orderBy(asc(schema.software.name));
  return filas.map((f) => ({
    ...serializeLicense(f.license),
    softwareName: f.softwareName,
    teamName: f.teamName,
  }));
}

/* ============================================================
 * 0090 — Licencias de PROFESORES
 * ============================================================ */

export type AssignTeacherLicenseResult =
  | { ok: true; license: LicenseDto }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string }
  | { ok: false; status: 409; code: "no_stock"; message: string };

/**
 * Asigna una licencia de `softwareId` a un PROFESOR, del cupo de `teamId`. Misma
 * mecánica que `assignLicense` (idempotente, una por programa, 409 `no_stock`,
 * en fila con las demás asignaciones de ese equipo y programa), sin nada de
 * inscripción: ni "licencia propia", ni programas del grupo, ni cohorte. Un
 * profesor sin correo cargado la puede tener igual; solo no se lo reconocerá
 * al conciliar con Autodesk hasta que se cargue.
 */
export async function assignTeacherLicense(
  organizationId: string,
  teacherId: string,
  softwareId: string,
  teamId: string,
  opts?: OpcionesDeAsignacion
): Promise<AssignTeacherLicenseResult> {
  const db = getDb();

  const [profesor] = await db
    .select({ id: schema.teacher.id })
    .from(schema.teacher)
    .where(scoped(schema.teacher.organizationId, organizationId, eq(schema.teacher.id, teacherId)))
    .limit(1);
  if (!profesor) {
    return { ok: false, status: 404, code: "not_found", message: "Profesor no encontrado" };
  }

  const equipo = await buscarEquipo(organizationId, teamId);
  if (!equipo || equipo.archived) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: equipo ? MENSAJE_EQUIPO_ARCHIVADO : MENSAJE_EQUIPO_INEXISTENTE,
    };
  }

  await bloquearStock(organizationId, [{ teamId, softwareId }]);
  const availability = await availableLicenses(organizationId, softwareId, teamId);
  if (!availability) {
    return { ok: false, status: 422, code: "invalid_body", message: "Software inexistente" };
  }

  const [existing] = await db
    .select()
    .from(schema.license)
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.teacherId, teacherId),
        eq(schema.license.softwareId, softwareId)
      )
    )
    .limit(1);

  if (existing?.assigned && existing.teamId === teamId) {
    return { ok: true, license: serializeLicense(existing) };
  }
  if (disponiblesPara(availability, opts) <= 0) {
    return {
      ok: false,
      status: 409,
      code: "no_stock",
      message: `No hay licencias disponibles de ${availability.softwareName} en ${equipo.name}`,
    };
  }

  const now = new Date();
  const row = existing
    ? (
        await db
          .update(schema.license)
          .set({ assigned: true, assignedAt: now, source: "individual", teamId })
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
            teacherId,
            softwareId,
            teamId,
            assigned: true,
            assignedAt: now,
            source: "individual",
          })
          .returning()
      )[0]!;
  return { ok: true, license: serializeLicense(row) };
}

/**
 * Libera la licencia de un profesor (vuelve al stock de su equipo). Con
 * `softwareId`, solo la de ese programa; sin él, todas. Idempotente.
 */
export async function unassignTeacherLicense(
  organizationId: string,
  teacherId: string,
  softwareId?: string
): Promise<{ ok: true; license: LicenseDto | null }> {
  const updated = await getDb()
    .update(schema.license)
    .set({ assigned: false, assignedAt: null })
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.teacherId, teacherId),
        eq(schema.license.assigned, true),
        softwareId ? eq(schema.license.softwareId, softwareId) : undefined
      )
    )
    .returning();
  const row = updated[0];
  return { ok: true, license: row ? serializeLicense(row) : null };
}

export type TeacherLicenseDto = LicenseDto & { softwareName: string; teamName: string };

/** Las licencias ASIGNADAS de un profesor, con el nombre del programa y del equipo. */
export async function listTeacherLicenses(
  organizationId: string,
  teacherId: string
): Promise<TeacherLicenseDto[]> {
  const filas = await getDb()
    .select({
      license: schema.license,
      softwareName: schema.software.name,
      teamName: schema.licenseTeam.name,
    })
    .from(schema.license)
    .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
    .innerJoin(schema.licenseTeam, eq(schema.license.teamId, schema.licenseTeam.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.teacherId, teacherId),
        eq(schema.license.assigned, true)
      )
    )
    .orderBy(asc(schema.software.name));
  return filas.map((f) => ({
    ...serializeLicense(f.license),
    softwareName: f.softwareName,
    teamName: f.teamName,
  }));
}

/* ============================================================
 * 0090 — Cambiar UNA licencia de equipo
 * ============================================================ */

export type MoveLicenseResult =
  | { ok: true; license: LicenseDto }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string }
  | { ok: false; status: 409; code: "no_stock" | "asignado_al_grupo"; message: string };

/**
 * Pasa UNA licencia al cupo de otro equipo (la persona la tiene en el equipo
 * equivocado). Si hoy ocupa un asiento, el destino tiene que tener uno libre.
 * Las del grupo no: su equipo es el del programa del grupo, y se mueven con el
 * programa (`moverProgramaDeEquipo`) para que la sincronización del grupo no
 * las vea en otro equipo.
 */
export async function moverLicenciaDeEquipo(
  organizationId: string,
  licenseId: string,
  teamId: string,
  opts?: OpcionesDeAsignacion
): Promise<MoveLicenseResult> {
  const db = getDb();
  const [fila] = await db
    .select({
      license: schema.license,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
    })
    .from(schema.license)
    .leftJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .where(scoped(schema.license.organizationId, organizationId, eq(schema.license.id, licenseId)))
    .limit(1);
  if (!fila) return { ok: false, status: 404, code: "not_found", message: "Licencia no encontrada" };
  const actual = fila.license;

  if (actual.source === "grupo") {
    return {
      ok: false,
      status: 409,
      code: "asignado_al_grupo",
      message:
        "Es una licencia del grupo: se mueve con el programa, desde el equipo del grupo (Mover a otro equipo)",
    };
  }
  if (actual.teamId === teamId) return { ok: true, license: serializeLicense(actual) };

  const destino = await buscarEquipo(organizationId, teamId);
  if (!destino || destino.archived) {
    return {
      ok: false,
      status: 422,
      code: "invalid_body",
      message: destino ? MENSAJE_EQUIPO_ARCHIVADO : MENSAJE_EQUIPO_INEXISTENTE,
    };
  }

  await bloquearStock(organizationId, [
    { teamId: actual.teamId, softwareId: actual.softwareId },
    { teamId, softwareId: actual.softwareId },
  ]);
  const ahora = new Date();
  const ocupa = actual.teacherId
    ? licenciaDeProfesorOcupada(actual, ahora)
    : licenciaOcupada(actual, { startDate: fila.startDate, endDate: fila.endDate }, ahora);
  if (ocupa) {
    const disponibles = await availableLicenses(organizationId, actual.softwareId, teamId);
    if (!disponibles || disponiblesPara(disponibles, opts) <= 0) {
      return {
        ok: false,
        status: 409,
        code: "no_stock",
        message: `No hay licencias disponibles de ${disponibles?.softwareName ?? "ese programa"} en ${destino.name}`,
      };
    }
  }

  const [movida] = await db
    .update(schema.license)
    .set({ teamId })
    .where(scoped(schema.license.organizationId, organizationId, eq(schema.license.id, licenseId)))
    .returning();
  return { ok: true, license: serializeLicense(movida!) };
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
  softwareId?: string,
  teamId?: string
): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  for (const l of await licenciasOcupadas(organizationId, { softwareId, teamId })) {
    salida.set(l.softwareId, (salida.get(l.softwareId) ?? 0) + 1);
  }
  return salida;
}

/**
 * 0089 — Lo mismo por EQUIPO y programa, con la llave de `claveDeStock`: es la
 * cuenta del stock real (cada equipo tiene el suyo).
 */
export async function contarOcupadasPorEquipo(
  organizationId: string,
  softwareId?: string
): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  for (const l of await licenciasOcupadas(organizationId, { softwareId })) {
    const clave = claveDeStock(l.teamId, l.softwareId);
    salida.set(clave, (salida.get(clave) ?? 0) + 1);
  }
  return salida;
}

/** Las licencias que OCUPAN hoy (`licenciaOcupada`): la única lectura del stock. */
async function licenciasOcupadas(
  organizationId: string,
  filtro: { softwareId?: string; teamId?: string }
): Promise<{ softwareId: string; teamId: string }[]> {
  const db = getDb();
  const licencias = await db
    .select({
      softwareId: schema.license.softwareId,
      teamId: schema.license.teamId,
      teacherId: schema.license.teacherId,
      assigned: schema.license.assigned,
      expiresAt: schema.license.expiresAt,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
    })
    .from(schema.license)
    // 0090 — leftJoin: la licencia de un profesor no tiene inscripción.
    .leftJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        filtro.softwareId ? eq(schema.license.softwareId, filtro.softwareId) : undefined,
        filtro.teamId ? eq(schema.license.teamId, filtro.teamId) : undefined
      )
    );

  const ahora = new Date();
  return licencias.filter((l) =>
    l.teacherId
      ? // 0090 — Un profesor no tiene cohorte: nada la libera salvo desasignarla o vencer.
        licenciaDeProfesorOcupada({ assigned: l.assigned, expiresAt: l.expiresAt }, ahora)
      : licenciaOcupada(
          { assigned: l.assigned, expiresAt: l.expiresAt },
          // El leftJoin trae fechas nulas cuando la inscripción no tiene cohorte:
          // eso es "fechas desconocidas", no "terminó".
          { startDate: l.startDate, endDate: l.endDate },
          ahora
        )
  );
}

/**
 * 005 iteración 2 (home, widget de licencias, pedido en vivo del dueño) —
 * total vs. disponibles por cada software de la organización. Consulta
 * propia (no reusa `listSoftware` de `@/server/software`, que a su vez
 * importa `countAssignedLicenses` de este módulo — evita el ciclo).
 *
 * 0089 — Suma de los equipos activos: el detalle por equipo está en
 * `/api/licenses` y `/api/license-teams`.
 */
export async function listLicenseInventory(
  organizationId: string
): Promise<LicenseAvailability[]> {
  const db = getDb();
  const softwareRows = await db
    .select({
      id: schema.software.id,
      name: schema.software.name,
      total: cupoTotalSql(false),
    })
    .from(schema.software)
    .leftJoin(schema.licenseTeamSeat, eq(schema.licenseTeamSeat.softwareId, schema.software.id))
    .leftJoin(schema.licenseTeam, eq(schema.licenseTeam.id, schema.licenseTeamSeat.teamId))
    .where(scoped(schema.software.organizationId, organizationId))
    .groupBy(schema.software.id, schema.software.name)
    .orderBy(asc(schema.software.name));
  if (softwareRows.length === 0) return [];

  const assignedMap = await contarOcupadas(organizationId);
  // 0091 — Los asientos de Autodesk que el campus no cuenta, por programa.
  const ajenos = await asientosAjenos(organizationId);
  const externosDe = (softwareId: string) =>
    [...ajenos].reduce(
      (suma, [clave, n]) => (clave.endsWith(`|${softwareId}`) ? suma + n : suma),
      0
    );

  return softwareRows.map((s) => {
    const assignedCount = assignedMap.get(s.id) ?? 0;
    const externos = externosDe(s.id);
    return {
      softwareId: s.id,
      softwareName: s.name,
      total: s.total,
      assignedCount,
      externos,
      available: s.total - assignedCount - externos,
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

/**
 * 2026-10-21 — Fija (o borra, con `null`) el correo para la licencia de una
 * inscripción. Llega ya normalizado (`correoNullable`); se vuelve a
 * normalizar por las dudas. Devuelve el correo RESUELTO (`correoDeLicencia`)
 * o `null` si la inscripción no es de la organización (la ruta responde 404).
 */
export async function fijarCorreoDeLicencia(
  organizationId: string,
  enrollmentId: string,
  licenseEmail: string | null
): Promise<{ email: string | null; distinto: boolean; propio: string | null } | null> {
  const db = getDb();
  const propio = normalizarCorreo(licenseEmail);
  const updated = await db
    .update(schema.enrollment)
    .set({ licenseEmail: propio, updatedAt: new Date() })
    .where(
      scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, enrollmentId))
    )
    .returning({ contactId: schema.enrollment.contactId });
  const fila = updated[0];
  if (!fila) return null;
  const contacto = await db
    .select({ email: schema.contact.email })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, fila.contactId)))
    .limit(1);
  return {
    ...correoDeLicencia({ licenseEmail: propio, contactEmail: contacto[0]?.email ?? null }),
    propio,
  };
}

export type CorreoDeLicenciaDto = { email: string | null; distinto: boolean; propio: string | null };

/**
 * 2026-10-21 — El correo de la licencia de varias inscripciones: el suyo, el
 * de su madre (la venta, si es hija de un módulo) o el del alumno. `propio` es
 * lo cargado en la inscripción, para el campo de edición.
 *
 * Vive acá y no en `module-roster.ts`: esa lectura no nombra columnas de
 * contacto (FR-017). Quien la llame decide si la sesión puede ver correos.
 */
export async function correosDeLicenciaPorInscripcion(
  organizationId: string,
  enrollmentIds: string[]
): Promise<Map<string, CorreoDeLicenciaDto>> {
  if (enrollmentIds.length === 0) return new Map();
  const madre = alias(schema.enrollment, "madre");
  const filas = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
      licenseEmail: schema.enrollment.licenseEmail,
      parentLicenseEmail: madre.licenseEmail,
      contactEmail: schema.contact.email,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(madre, eq(schema.enrollment.parentEnrollmentId, madre.id))
    .where(
      scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.id, enrollmentIds))
    );
  return new Map(filas.map((f) => [f.enrollmentId, { ...correoDeLicencia(f), propio: f.licenseEmail }]));
}
