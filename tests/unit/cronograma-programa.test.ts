import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 029 — "Generar cronograma de todos los módulos": UN pedido, UNA transacción,
 * UN insert.
 *
 * Cada módulo sigue las reglas de siempre (`buildClassSchedule`, sin copia):
 * el que ya tiene clases NO se toca —regenerar duplicaría—, y al que le faltan
 * fechas o días se lo saltea DICIENDO por qué. Nada de eso tumba a los demás.
 */

let selectQueue: unknown[][] = [];
let distinctQueue: unknown[][] = [];
let inserts: Record<string, unknown>[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "innerJoin", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    selectDistinct: () => thenableChain(distinctQueue.shift() ?? []),
    insert: () => ({
      values: async (v: Record<string, unknown>[]) => {
        inserts.push(v);
        return [];
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

const { planDeCronogramaDelPrograma, generateProgramSchedule } = await import(
  "@/server/attendance"
);

// Fechas LOCALES: `buildClassSchedule` recorre días en la hora del servidor.
const d = (s: string) => new Date(`${s}T00:00:00`);

function modulo(id: string, p: Record<string, unknown> = {}) {
  return {
    id,
    name: `Módulo ${id}`,
    courseName: "Curso",
    position: 10,
    startDate: d("2026-03-02"),
    endDate: d("2026-03-16"),
    daysOfWeek: "0", // lunes: 2, 9 y 16 de marzo
    startTime: "18:30",
    endTime: "20:30",
    teacherId: "tch_1",
    ...p,
  };
}

beforeEach(() => {
  selectQueue = [];
  distinctQueue = [];
  inserts = [];
});

describe("planDeCronogramaDelPrograma (pura)", () => {
  it("genera los módulos listos y saltea, con motivo, los demás", () => {
    const plan = planDeCronogramaDelPrograma(
      [
        modulo("m1"),
        modulo("m2", { position: 20 }),
        modulo("m3", { position: 30, endDate: null }),
        modulo("m4", { position: 40, daysOfWeek: null }),
      ],
      new Set(["m2"])
    );
    expect(plan.filas.map((f) => f.cohortId)).toEqual(["m1", "m1", "m1"]);
    expect(plan.filas.map((f) => f.number)).toEqual([1, 2, 3]);
    expect(plan.filas[0]).toMatchObject({ teacherId: "tch_1", startTime: "18:30", hours: 2 });
    expect(plan.generated).toEqual([{ cohortId: "m1", label: "Módulo 1 — Módulo m1", classes: 3 }]);
    expect(plan.skipped.map((s) => [s.cohortId, s.reason])).toEqual([
      ["m2", "ya_tiene_clases"],
      ["m3", "sin_fecha_fin"],
      ["m4", "sin_dias"],
    ]);
    expect(plan.skipped.every((s) => s.message.length > 0)).toBe(true);
  });

  it("un rango que no produce clases se saltea, no se inserta vacío", () => {
    const plan = planDeCronogramaDelPrograma(
      [modulo("m1", { startDate: d("2026-03-03"), endDate: d("2026-03-04") })],
      new Set()
    );
    expect(plan.filas).toHaveLength(0);
    expect(plan.skipped[0]!.reason).toBe("sin_clases");
  });
});

describe("generateProgramSchedule", () => {
  it("todos los módulos en UN insert", async () => {
    selectQueue = [
      [{ id: "coh_ebim", isSpecialization: true }],
      [modulo("m1"), modulo("m2", { position: 20 })],
    ];
    distinctQueue = [[]];
    const r = await generateProgramSchedule("org_1", "coh_ebim");
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toHaveLength(6);
    expect(new Set(inserts[0]!.map((f) => f.organizationId))).toEqual(new Set(["org_1"]));
  });

  it("nada que generar: no escribe y lo explica", async () => {
    selectQueue = [[{ id: "coh_ebim", isSpecialization: true }], [modulo("m1")]];
    distinctQueue = [[{ cohortId: "m1" }]];
    const r = await generateProgramSchedule("org_1", "coh_ebim");
    expect(inserts).toHaveLength(0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.skipped[0]!.reason).toBe("ya_tiene_clases");
  });

  it("una cohorte común no es un programa: 422", async () => {
    selectQueue = [[{ id: "coh_1", isSpecialization: false }], []];
    const r = await generateProgramSchedule("org_1", "coh_1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
    expect(inserts).toHaveLength(0);
  });

  it("cohorte ajena o inexistente: 404", async () => {
    selectQueue = [[]];
    const r = await generateProgramSchedule("org_1", "coh_x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe("rotularClasesDelPrograma (pura)", () => {
  it("rotula por el LUGAR y devuelve en el orden del programa", async () => {
    const { rotularClasesDelPrograma } = await import("@/server/classes");
    const base = { projected: true, cannotGenerateReason: null, classes: [] };
    const r = rotularClasesDelPrograma(
      {
        cohortId: "coh_ebim",
        timezone: "America/Montevideo",
        modules: [
          { cohortId: "b", name: null, position: 20, ...base },
          { cohortId: "a", name: "Arq", position: 10, ...base },
        ],
      },
      [
        { id: "b", name: null, courseName: "Revit MEP", position: 20, startDate: d("2026-05-01") },
        { id: "a", name: "Arq", courseName: "Revit", position: 10, startDate: d("2026-03-01") },
      ]
    );
    expect(r.modules.map((m) => m.label)).toEqual(["Módulo 1 — Arq", "Módulo 2 — Revit MEP"]);
  });
});
