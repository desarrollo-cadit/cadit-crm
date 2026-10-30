import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0090 — Mover un programa de un equipo a otro («AutoCAD figura en el equipo 1
 * y es del 2») y cambiar de equipo UNA licencia. El programa se mueve entero:
 * el cupo, TODAS sus licencias y el equipo de los grupos que lo tienen; si algo
 * no cierra no se escribe nada.
 */

type Escritura = { table: unknown; set?: Record<string, unknown>; values?: Record<string, unknown> };
const updates: Escritura[] = [];
const inserts: Escritura[] = [];
const deletes: unknown[] = [];
const conflictos: Record<string, unknown>[] = [];
const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    execute: async () => [],
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return {
          onConflictDoUpdate: (c: { set: Record<string, unknown> }) => {
            conflictos.push(c.set);
            return Promise.resolve();
          },
          returning: () => Promise.resolve([{ ...values }]),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "lic_1", ...set }]),
            then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve),
          }),
        };
      },
    }),
    delete: (table: unknown) => ({
      where: () => {
        deletes.push(table);
        return Promise.resolve();
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

beforeEach(() => {
  updates.length = 0;
  inserts.length = 0;
  deletes.length = 0;
  conflictos.length = 0;
  selectQueue.length = 0;
});

const VIVA = new Date("2099-12-31T00:00:00.000Z");
const INICIO = new Date("2020-01-01T00:00:00.000Z");
const ocupada = () => ({
  softwareId: "sw_cad",
  teamId: "team_1",
  teacherId: null,
  assigned: true,
  expiresAt: null,
  startDate: INICIO,
  endDate: VIVA,
});

const T1 = { id: "team_1", name: "Equipo 1", archivedAt: null };
const T2 = { id: "team_2", name: "Equipo 2", archivedAt: null };

/**
 * El orden en que `moverProgramaDeEquipo` lee: equipos, programa, cupos,
 * licencias del origen y del destino (conteos), grupos del origen, y las
 * ocupadas de cada lado.
 */
function preparar(o: {
  equipos?: unknown[];
  cupos: { teamId: string; total: number }[];
  licenciasOrigen: number;
  licenciasDestino?: number;
  grupos?: number;
  ocupadasOrigen: unknown[];
  ocupadasDestino?: unknown[];
}) {
  selectQueue.push(
    o.equipos ?? [T1, T2],
    [{ name: "AutoCAD" }],
    o.cupos,
    [{ n: o.licenciasOrigen }],
    [{ n: o.licenciasDestino ?? 0 }],
    [{ n: o.grupos ?? 0 }],
    o.ocupadasOrigen,
    o.ocupadasDestino ?? []
  );
}

describe("moverProgramaDeEquipo", () => {
  it("mueve el cupo, las licencias y el equipo del grupo de una vez", async () => {
    const { moverProgramaDeEquipo } = await import("@/server/license-teams");
    preparar({
      cupos: [{ teamId: "team_1", total: 10 }],
      licenciasOrigen: 4,
      grupos: 1,
      ocupadasOrigen: [ocupada(), ocupada(), ocupada(), ocupada()],
    });
    const result = await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_2");
    expect(result).toEqual({ ok: true, data: { movidas: 4, grupos: 1, total: 10 } });
    // licencias y programa del grupo → equipo destino
    expect(updates.map((u) => u.set)).toEqual([{ teamId: "team_2" }, { teamId: "team_2" }]);
    // el cupo aparece en el destino y desaparece del origen
    expect(inserts[0]!.values).toMatchObject({ teamId: "team_2", softwareId: "sw_cad", total: 10 });
    expect(conflictos[0]).toMatchObject({ total: 10 });
    expect(deletes).toHaveLength(1);
  });

  it("si el destino ya tiene el programa NO suma en silencio: 409 y no escribe", async () => {
    const { moverProgramaDeEquipo } = await import("@/server/license-teams");
    preparar({
      cupos: [
        { teamId: "team_1", total: 10 },
        { teamId: "team_2", total: 30 },
      ],
      licenciasOrigen: 4,
      ocupadasOrigen: [ocupada()],
    });
    const result = await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_2");
    expect(result).toMatchObject({ ok: false, status: 409, code: "programa_en_destino" });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it("confirmada la suma, el destino queda con los dos cupos", async () => {
    const { moverProgramaDeEquipo } = await import("@/server/license-teams");
    preparar({
      cupos: [
        { teamId: "team_1", total: 10 },
        { teamId: "team_2", total: 30 },
      ],
      licenciasOrigen: 2,
      ocupadasOrigen: [ocupada()],
    });
    const result = await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_2", true);
    expect(result).toMatchObject({ ok: true, data: { total: 40 } });
    expect(inserts[0]!.values).toMatchObject({ total: 40 });
  });

  it("rechaza si el destino quedaría con menos cupo que lo ocupado (422) sin escribir nada", async () => {
    const { moverProgramaDeEquipo } = await import("@/server/license-teams");
    preparar({
      cupos: [{ teamId: "team_1", total: 2 }],
      licenciasOrigen: 3,
      ocupadasOrigen: [ocupada(), ocupada(), ocupada()],
    });
    const result = await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_2");
    expect(result).toMatchObject({ ok: false, status: 422, code: "sin_cupo" });
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it("el destino tiene que existir y estar activo; el mismo equipo no vale", async () => {
    const { moverProgramaDeEquipo } = await import("@/server/license-teams");
    expect(await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_1")).toMatchObject({
      ok: false,
      status: 422,
    });
    selectQueue.push([T1]);
    expect(await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_x")).toMatchObject({
      ok: false,
      status: 422,
    });
    selectQueue.push([T1, { ...T2, archivedAt: new Date() }]);
    expect(await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_2")).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(updates).toHaveLength(0);
  });

  it("un equipo que no tiene ese programa → 404", async () => {
    const { moverProgramaDeEquipo } = await import("@/server/license-teams");
    preparar({ cupos: [], licenciasOrigen: 0, ocupadasOrigen: [] });
    expect(await moverProgramaDeEquipo("org_1", "team_1", "sw_cad", "team_2")).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("moverLicenciaDeEquipo", () => {
  const fila = (license: Record<string, unknown>) => ({
    license: {
      id: "lic_1",
      enrollmentId: "enr_1",
      teacherId: null,
      softwareId: "sw_cad",
      teamId: "team_1",
      assigned: true,
      expiresAt: null,
      source: "individual",
      ...license,
    },
    startDate: INICIO,
    endDate: VIVA,
  });

  it("pasa al destino si tiene un asiento libre", async () => {
    const { moverLicenciaDeEquipo } = await import("@/server/licenses");
    selectQueue.push([fila({})], [T2], [{ name: "AutoCAD", total: 3 }], [ocupada()]);
    const result = await moverLicenciaDeEquipo("org_1", "lic_1", "team_2");
    expect(result.ok).toBe(true);
    expect(updates[0]!.set).toEqual({ teamId: "team_2" });
  });

  it("sin asiento libre en el destino: 409 no_stock", async () => {
    const { moverLicenciaDeEquipo } = await import("@/server/licenses");
    selectQueue.push([fila({})], [T2], [{ name: "AutoCAD", total: 1 }], [ocupada()]);
    expect(await moverLicenciaDeEquipo("org_1", "lic_1", "team_2")).toMatchObject({
      ok: false,
      status: 409,
      code: "no_stock",
    });
    expect(updates).toHaveLength(0);
  });

  it("una del grupo se mueve con el programa, no suelta (409)", async () => {
    const { moverLicenciaDeEquipo } = await import("@/server/licenses");
    selectQueue.push([fila({ source: "grupo" })]);
    expect(await moverLicenciaDeEquipo("org_1", "lic_1", "team_2")).toMatchObject({
      ok: false,
      status: 409,
      code: "asignado_al_grupo",
    });
  });

  it("la de un profesor también se puede cambiar de equipo", async () => {
    const { moverLicenciaDeEquipo } = await import("@/server/licenses");
    selectQueue.push(
      [fila({ enrollmentId: null, teacherId: "tch_1" })],
      [T2],
      [{ name: "AutoCAD", total: 2 }],
      []
    );
    expect((await moverLicenciaDeEquipo("org_1", "lic_1", "team_2")).ok).toBe(true);
  });

  it("licencia inexistente → 404", async () => {
    const { moverLicenciaDeEquipo } = await import("@/server/licenses");
    selectQueue.push([]);
    expect(await moverLicenciaDeEquipo("org_1", "lic_x", "team_2")).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
