import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  aliasNormalizado,
  armarCupos,
  EQUIPO_POR_DEFECTO,
  MENSAJE_EQUIPO_ARCHIVADO,
  MENSAJE_EQUIPO_INEXISTENTE,
  MENSAJE_MISMO_EQUIPO,
  motivoDeCupoInvalido,
  planDeMovimientoDePrograma,
  type CupoDeEquipo,
} from "@/lib/license-team";
import { bloquearStock, contarOcupadas, contarOcupadasPorEquipo } from "@/server/licenses";
import { asientosAjenos } from "@/server/license-ajenos";

/**
 * 0089 — Equipos de licencias (Uruguay ATC, Paraguay ATC…) y su cupo por
 * programa. El stock de cada licencia sale del equipo que se eligió al
 * asignarla; acá se administran los equipos y sus cupos. Las cuentas son
 * puras (`src/lib/license-team.ts`).
 */

export type EquipoDto = {
  id: string;
  name: string;
  autodeskAlias: string | null;
  archived: boolean;
  /** Un renglón por programa que el equipo tiene en cupo (aunque sea 0). */
  seats: CupoDeEquipo[];
};

type Db = ReturnType<typeof getDb>;

async function cuposDe(db: Db, organizationId: string, teamIds?: readonly string[]) {
  return db
    .select({
      teamId: schema.licenseTeamSeat.teamId,
      softwareId: schema.licenseTeamSeat.softwareId,
      total: schema.licenseTeamSeat.total,
    })
    .from(schema.licenseTeamSeat)
    .where(
      scoped(
        schema.licenseTeamSeat.organizationId,
        organizationId,
        teamIds ? inArray(schema.licenseTeamSeat.teamId, [...teamIds]) : undefined
      )
    );
}

/** Todos los equipos de la organización (los archivados al final), con su cupo y lo ocupado. */
export async function listarEquipos(organizationId: string): Promise<EquipoDto[]> {
  const db = getDb();
  const equipos = await db
    .select({
      id: schema.licenseTeam.id,
      name: schema.licenseTeam.name,
      autodeskAlias: schema.licenseTeam.autodeskAlias,
      archivedAt: schema.licenseTeam.archivedAt,
    })
    .from(schema.licenseTeam)
    .where(scoped(schema.licenseTeam.organizationId, organizationId))
    .orderBy(asc(schema.licenseTeam.name));
  if (equipos.length === 0) return [];
  const cupos = armarCupos(
    await cuposDe(db, organizationId),
    await contarOcupadasPorEquipo(organizationId),
    await asientosAjenos(organizationId)
  );
  return equipos
    .map((e) => ({
      id: e.id,
      name: e.name,
      autodeskAlias: e.autodeskAlias,
      archived: e.archivedAt !== null,
      seats: cupos.filter((c) => c.teamId === e.id),
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "es"));
}

export type EquipoResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: 404 | 409 | 422;
      code: "not_found" | "invalid_body" | "nombre_duplicado" | "equipo_en_uso";
      message: string;
    };

async function nombreTomado(
  db: Db,
  organizationId: string,
  name: string,
  exceptId?: string
): Promise<boolean> {
  const filas = await db
    .select({ id: schema.licenseTeam.id })
    .from(schema.licenseTeam)
    .where(
      scoped(
        schema.licenseTeam.organizationId,
        organizationId,
        sql`lower(${schema.licenseTeam.name}) = lower(${name})`
      )
    );
  return filas.some((f) => f.id !== exceptId);
}

const MENSAJE_NOMBRE_DUPLICADO = "Ya hay un equipo con ese nombre";

export async function crearEquipo(
  organizationId: string,
  input: { name: string; autodeskAlias?: string | null }
): Promise<EquipoResult<EquipoDto>> {
  const db = getDb();
  if (await nombreTomado(db, organizationId, input.name)) {
    return { ok: false, status: 409, code: "nombre_duplicado", message: MENSAJE_NOMBRE_DUPLICADO };
  }
  const id = newId("licenseTeam");
  await db.insert(schema.licenseTeam).values({
    id,
    organizationId,
    name: input.name,
    autodeskAlias: aliasNormalizado(input.autodeskAlias),
  });
  return {
    ok: true,
    data: {
      id,
      name: input.name,
      autodeskAlias: aliasNormalizado(input.autodeskAlias),
      archived: false,
      seats: [],
    },
  };
}

/**
 * Cambia nombre, alias o archivo. Archivar un equipo que TODAVÍA se usa (con
 * licencias ocupadas o como equipo de un grupo) se rechaza: sacarlo de los
 * selectores no puede dejar licencias colgando de un equipo que ya no se ve.
 */
export async function editarEquipo(
  organizationId: string,
  teamId: string,
  input: { name?: string; autodeskAlias?: string | null; archived?: boolean }
): Promise<EquipoResult<{ id: string }>> {
  const db = getDb();
  const [actual] = await db
    .select({ archivedAt: schema.licenseTeam.archivedAt })
    .from(schema.licenseTeam)
    .where(scoped(schema.licenseTeam.organizationId, organizationId, eq(schema.licenseTeam.id, teamId)))
    .limit(1);
  if (!actual) return { ok: false, status: 404, code: "not_found", message: "Equipo no encontrado" };

  if (input.name !== undefined && (await nombreTomado(db, organizationId, input.name, teamId))) {
    return { ok: false, status: 409, code: "nombre_duplicado", message: MENSAJE_NOMBRE_DUPLICADO };
  }

  if (input.archived === true && actual.archivedAt === null) {
    const ocupadas = [...(await contarOcupadas(organizationId, undefined, teamId)).values()].reduce(
      (suma, n) => suma + n,
      0
    );
    const [{ grupos } = { grupos: 0 }] = await db
      .select({ grupos: count() })
      .from(schema.cohortGroupSoftware)
      .where(
        scoped(
          schema.cohortGroupSoftware.organizationId,
          organizationId,
          eq(schema.cohortGroupSoftware.teamId, teamId)
        )
      );
    if (ocupadas > 0 || grupos > 0) {
      return {
        ok: false,
        status: 409,
        code: "equipo_en_uso",
        message:
          ocupadas > 0
            ? `No se puede archivar: tiene ${ocupadas} ${ocupadas === 1 ? "licencia ocupada" : "licencias ocupadas"}`
            : "No se puede archivar: es el equipo de las licencias de un grupo",
      };
    }
  }

  await db
    .update(schema.licenseTeam)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.autodeskAlias !== undefined ? { autodeskAlias: aliasNormalizado(input.autodeskAlias) } : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? (actual.archivedAt ?? new Date()) : null }
        : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.licenseTeam.organizationId, organizationId, eq(schema.licenseTeam.id, teamId)));
  return { ok: true, data: { id: teamId } };
}

/**
 * Fija el cupo del equipo en varios programas, TODO O NADA: bajar un cupo por
 * debajo de lo que el equipo ya ocupa se rechaza (la regla de 005 FR-004, por
 * equipo) y no se escribe ninguno. Subir siempre se puede.
 */
export async function fijarCupos(
  organizationId: string,
  teamId: string,
  seats: readonly { softwareId: string; total: number }[]
): Promise<EquipoResult<{ seats: CupoDeEquipo[] }>> {
  const db = getDb();
  const [equipo] = await db
    .select({ name: schema.licenseTeam.name })
    .from(schema.licenseTeam)
    .where(scoped(schema.licenseTeam.organizationId, organizationId, eq(schema.licenseTeam.id, teamId)))
    .limit(1);
  if (!equipo) return { ok: false, status: 404, code: "not_found", message: "Equipo no encontrado" };

  const ids = [...new Set(seats.map((s) => s.softwareId))];
  const programas = ids.length
    ? await db
        .select({ id: schema.software.id, name: schema.software.name })
        .from(schema.software)
        .where(scoped(schema.software.organizationId, organizationId, inArray(schema.software.id, ids)))
    : [];
  if (programas.length !== ids.length) {
    return { ok: false, status: 422, code: "invalid_body", message: "Programa inexistente" };
  }
  const nombre = new Map(programas.map((p) => [p.id, p.name]));

  // En fila con las asignaciones de esos programas en ESTE equipo.
  await bloquearStock(
    organizationId,
    ids.map((softwareId) => ({ teamId, softwareId }))
  );
  const ocupadas = await contarOcupadasPorEquipo(organizationId);
  const motivo = motivoDeCupoInvalido(
    seats.map((s) => ({ ...s, programa: nombre.get(s.softwareId) ?? "El programa" })),
    ocupadas,
    teamId,
    equipo.name
  );
  if (motivo) return { ok: false, status: 422, code: "invalid_body", message: motivo };

  const ahora = new Date();
  for (const s of seats) {
    await db
      .insert(schema.licenseTeamSeat)
      .values({ organizationId, teamId, softwareId: s.softwareId, total: s.total, updatedAt: ahora })
      .onConflictDoUpdate({
        target: [schema.licenseTeamSeat.teamId, schema.licenseTeamSeat.softwareId],
        set: { total: s.total, updatedAt: ahora },
      });
  }
  return {
    ok: true,
    data: { seats: armarCupos(await cuposDe(db, organizationId, [teamId]), ocupadas) },
  };
}

export type MoverProgramaResult =
  | { ok: true; data: { movidas: number; grupos: number; total: number } }
  | {
      ok: false;
      status: 404 | 409 | 422;
      code: "not_found" | "invalid_body" | "programa_en_destino" | "sin_cupo";
      message: string;
    };

/**
 * 0090 — Mueve un PROGRAMA de un equipo a otro: su cupo y TODAS sus licencias
 * (asignadas o no) y, si el programa es de un grupo, el equipo de ese grupo.
 * Todo en la transacción del pedido, y en fila con las asignaciones de los dos
 * stocks. El origen termina sin cupo de ese programa; el destino, con el
 * cupo movido (o sumado, si ya tenía y quien movió lo confirmó: `sumar`) y
 * nunca por debajo de lo que va a ocupar. Se puede mover desde un equipo
 * archivado (es la forma de vaciarlo); el destino tiene que estar activo.
 */
export async function moverProgramaDeEquipo(
  organizationId: string,
  fromTeamId: string,
  softwareId: string,
  toTeamId: string,
  sumar = false
): Promise<MoverProgramaResult> {
  const db = getDb();
  if (fromTeamId === toTeamId) {
    return { ok: false, status: 422, code: "invalid_body", message: MENSAJE_MISMO_EQUIPO };
  }

  const equipos = await db
    .select({
      id: schema.licenseTeam.id,
      name: schema.licenseTeam.name,
      archivedAt: schema.licenseTeam.archivedAt,
    })
    .from(schema.licenseTeam)
    .where(
      scoped(schema.licenseTeam.organizationId, organizationId, inArray(schema.licenseTeam.id, [fromTeamId, toTeamId]))
    );
  const origen = equipos.find((e) => e.id === fromTeamId);
  const destino = equipos.find((e) => e.id === toTeamId);
  if (!origen) return { ok: false, status: 404, code: "not_found", message: "Equipo no encontrado" };
  if (!destino) {
    return { ok: false, status: 422, code: "invalid_body", message: MENSAJE_EQUIPO_INEXISTENTE };
  }
  if (destino.archivedAt) {
    return { ok: false, status: 422, code: "invalid_body", message: MENSAJE_EQUIPO_ARCHIVADO };
  }

  const [programa] = await db
    .select({ name: schema.software.name })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId)))
    .limit(1);
  if (!programa) return { ok: false, status: 422, code: "invalid_body", message: "Programa inexistente" };

  await bloquearStock(organizationId, [
    { teamId: fromTeamId, softwareId },
    { teamId: toTeamId, softwareId },
  ]);

  const cupos = await db
    .select({ teamId: schema.licenseTeamSeat.teamId, total: schema.licenseTeamSeat.total })
    .from(schema.licenseTeamSeat)
    .where(
      scoped(
        schema.licenseTeamSeat.organizationId,
        organizationId,
        eq(schema.licenseTeamSeat.softwareId, softwareId),
        inArray(schema.licenseTeamSeat.teamId, [fromTeamId, toTeamId])
      )
    );
  const cupoOrigen = cupos.find((c) => c.teamId === fromTeamId);
  const cupoDestino = cupos.find((c) => c.teamId === toTeamId);

  const licenciasDe = (teamId: string) =>
    db
      .select({ n: count() })
      .from(schema.license)
      .where(
        scoped(
          schema.license.organizationId,
          organizationId,
          eq(schema.license.teamId, teamId),
          eq(schema.license.softwareId, softwareId)
        )
      );
  const [[{ n: licenciasOrigen } = { n: 0 }], [{ n: licenciasDestino } = { n: 0 }]] = await Promise.all([
    licenciasDe(fromTeamId),
    licenciasDe(toTeamId),
  ]);
  const [{ n: gruposOrigen } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.cohortGroupSoftware)
    .where(
      scoped(
        schema.cohortGroupSoftware.organizationId,
        organizationId,
        eq(schema.cohortGroupSoftware.teamId, fromTeamId),
        eq(schema.cohortGroupSoftware.softwareId, softwareId)
      )
    );
  if (!cupoOrigen && licenciasOrigen === 0 && gruposOrigen === 0) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: `${origen.name} no tiene ${programa.name}`,
    };
  }

  const ocupadasOrigen = (await contarOcupadas(organizationId, softwareId, fromTeamId)).get(softwareId) ?? 0;
  const ocupadasDestino = (await contarOcupadas(organizationId, softwareId, toTeamId)).get(softwareId) ?? 0;
  const plan = planDeMovimientoDePrograma({
    programa: programa.name,
    destino: destino.name,
    totalOrigen: cupoOrigen?.total ?? 0,
    totalDestino: cupoDestino?.total ?? 0,
    destinoTiene: Boolean(cupoDestino && cupoDestino.total > 0) || licenciasDestino > 0,
    sumar,
    ocupadasOrigen,
    ocupadasDestino,
  });
  if (!plan.ok) return { ok: false, status: plan.code === "sin_cupo" ? 422 : 409, code: plan.code, message: plan.message };

  const ahora = new Date();
  await db
    .update(schema.license)
    .set({ teamId: toTeamId })
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.teamId, fromTeamId),
        eq(schema.license.softwareId, softwareId)
      )
    );
  await db
    .update(schema.cohortGroupSoftware)
    .set({ teamId: toTeamId })
    .where(
      scoped(
        schema.cohortGroupSoftware.organizationId,
        organizationId,
        eq(schema.cohortGroupSoftware.teamId, fromTeamId),
        eq(schema.cohortGroupSoftware.softwareId, softwareId)
      )
    );
  await db
    .insert(schema.licenseTeamSeat)
    .values({ organizationId, teamId: toTeamId, softwareId, total: plan.nuevoTotal, updatedAt: ahora })
    .onConflictDoUpdate({
      target: [schema.licenseTeamSeat.teamId, schema.licenseTeamSeat.softwareId],
      set: { total: plan.nuevoTotal, updatedAt: ahora },
    });
  await db
    .delete(schema.licenseTeamSeat)
    .where(
      and(
        eq(schema.licenseTeamSeat.organizationId, organizationId),
        eq(schema.licenseTeamSeat.teamId, fromTeamId),
        eq(schema.licenseTeamSeat.softwareId, softwareId)
      )
    );
  return { ok: true, data: { movidas: licenciasOrigen, grupos: gruposOrigen, total: plan.nuevoTotal } };
}

/**
 * El equipo en el que cae un programa nuevo cargado con cupo (`POST
 * /api/software` con `totalLicenses`, que scripts y la demo siguen mandando):
 * el primer equipo activo, o «Sin asignar» si la organización todavía no tiene
 * ninguno.
 */
export async function equipoPorDefecto(organizationId: string): Promise<string> {
  const db = getDb();
  const equipos = await db
    .select({ id: schema.licenseTeam.id, archivedAt: schema.licenseTeam.archivedAt })
    .from(schema.licenseTeam)
    .where(scoped(schema.licenseTeam.organizationId, organizationId))
    .orderBy(asc(schema.licenseTeam.createdAt), asc(schema.licenseTeam.id));
  const activo = equipos.find((e) => e.archivedAt === null);
  if (activo) return activo.id;
  const id = newId("licenseTeam");
  await db.insert(schema.licenseTeam).values({ id, organizationId, name: EQUIPO_POR_DEFECTO });
  return id;
}
