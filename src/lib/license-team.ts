import { z } from "zod";

/**
 * 0087 — Licencias por equipo (Uruguay ATC, Paraguay ATC…).
 *
 * Reglas PURAS. El stock ya no es uno por programa: cada equipo de Autodesk
 * tiene su propio cupo por programa (`license_team_seat`) y cada licencia
 * descuenta del equipo que se eligió al asignarla. Las consultas viven en
 * `src/server/license-teams.ts` y `src/server/licenses.ts`.
 */

/** El equipo que la migración 0087 creó para lo que ya existía. */
export const EQUIPO_POR_DEFECTO = "Sin asignar";

/**
 * La llave del stock: UN equipo y UN programa. Una sola función para que el
 * conteo, el candado y los planes del grupo no puedan armarla distinto.
 */
export function claveDeStock(teamId: string, softwareId: string): string {
  // Nunca un carácter nulo: la llave también viaja a Postgres (candado de stock)
  // y `0x00` no es válido en un texto. Los ids no llevan `|`.
  return `${teamId}|${softwareId}`;
}

export type CupoDeEquipo = {
  teamId: string;
  softwareId: string;
  total: number;
  /** Las que OCUPAN hoy (`licenciaOcupada`), no las asignadas alguna vez. */
  ocupadas: number;
  /**
   * 0089 — Asientos que Autodesk tiene ocupados y el campus no cuenta (la última
   * importación del equipo). Restan de lo libre.
   */
  externos: number;
  libres: number;
};

/**
 * Cupo − ocupadas − externos, por equipo y programa. `ocupadas` y `externos`
 * vienen de `claveDeStock`.
 */
export function armarCupos(
  cupos: readonly { teamId: string; softwareId: string; total: number }[],
  ocupadas: ReadonlyMap<string, number>,
  externos: ReadonlyMap<string, number> = new Map()
): CupoDeEquipo[] {
  return cupos.map((c) => {
    const n = ocupadas.get(claveDeStock(c.teamId, c.softwareId)) ?? 0;
    const x = externos.get(claveDeStock(c.teamId, c.softwareId)) ?? 0;
    return { ...c, ocupadas: n, externos: x, libres: c.total - n - x };
  });
}

/**
 * Subir el cupo siempre se puede; bajarlo por debajo de lo que el equipo ya
 * ocupa no (la misma regla de 005 FR-004, ahora por equipo). Todo o nada:
 * devuelve el primer motivo, o `null` si todos los cupos pedidos valen.
 */
export function motivoDeCupoInvalido(
  pedidos: readonly { softwareId: string; total: number; programa: string }[],
  ocupadas: ReadonlyMap<string, number>,
  teamId: string,
  equipo: string
): string | null {
  for (const p of pedidos) {
    const n = ocupadas.get(claveDeStock(teamId, p.softwareId)) ?? 0;
    if (p.total < n) {
      return `No se puede bajar ${p.programa} de ${n} licencias en ${equipo}: ya hay ${n} ocupadas`;
    }
  }
  return null;
}

export const MENSAJE_EQUIPO_INEXISTENTE = "Equipo de licencias inexistente";
export const MENSAJE_EQUIPO_ARCHIVADO = "Ese equipo está archivado: elegí otro";

export const equipoNuevoSchema = z.object({
  name: z.string().trim().min(1).max(80),
  autodeskAlias: z.string().trim().max(120).nullable().optional(),
});

export const equipoEdicionSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  autodeskAlias: z.string().trim().max(120).nullable().optional(),
  archived: z.boolean().optional(),
});

export const cuposSchema = z.object({
  seats: z
    .array(
      z.object({
        softwareId: z.string().min(1).max(64),
        total: z.number().int().min(0).max(100000),
      })
    )
    .max(500),
});

/** El alias vacío es «sin alias». */
export function aliasNormalizado(alias: string | null | undefined): string | null {
  const limpio = alias?.trim();
  return limpio ? limpio : null;
}

/**
 * 0088 — Mover un programa de un equipo a otro (el cupo y TODAS sus licencias
 * juntos): «AutoCAD figura en el equipo 1 y es del 2».
 *
 * Si el destino ya tiene ese programa NO se suma en silencio: el cupo de la
 * carga equivocada inflaría el del equipo bueno. Se rechaza (409) y solo se
 * suman los cupos si quien mueve lo confirmó (`sumar`). Y el destino nunca
 * queda con menos cupo que lo que va a ocupar (la regla de 005 FR-004).
 */
export type PlanDeMovimiento =
  | { ok: true; nuevoTotal: number; suma: boolean }
  | { ok: false; code: "programa_en_destino" | "sin_cupo"; message: string };

export function planDeMovimientoDePrograma(p: {
  programa: string;
  destino: string;
  totalOrigen: number;
  totalDestino: number;
  /** El destino ya tiene cupo de este programa o licencias suyas. */
  destinoTiene: boolean;
  sumar: boolean;
  ocupadasOrigen: number;
  ocupadasDestino: number;
}): PlanDeMovimiento {
  if (p.destinoTiene && !p.sumar) {
    return {
      ok: false,
      code: "programa_en_destino",
      message: `${p.destino} ya tiene ${p.totalDestino} licencias de ${p.programa}: al mover se suman los cupos (${p.totalDestino} + ${p.totalOrigen}). Confirmalo para seguir.`,
    };
  }
  const nuevoTotal = p.destinoTiene ? p.totalDestino + p.totalOrigen : p.totalOrigen;
  const ocupadas = p.ocupadasOrigen + p.ocupadasDestino;
  if (nuevoTotal < ocupadas) {
    return {
      ok: false,
      code: "sin_cupo",
      message: `No se puede mover ${p.programa} a ${p.destino}: quedaría con cupo para ${nuevoTotal} y ${ocupadas} licencias ocupadas`,
    };
  }
  return { ok: true, nuevoTotal, suma: p.destinoTiene };
}

export const moverProgramaSchema = z.object({
  softwareId: z.string().min(1).max(64),
  toTeamId: z.string().min(1).max(64),
  /** Confirmación de que, si el destino ya tiene el programa, se suman los cupos. */
  sumar: z.boolean().optional(),
});

export const moverLicenciaSchema = z.object({ teamId: z.string().min(1).max(64) });

export const MENSAJE_MISMO_EQUIPO = "Elegí un equipo distinto del actual";
