import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 029 — Tomar asistencia y cargar resultados en UNA sentencia, no una por fila.
 *
 * `markAttendance` y `recordResults` hacían un INSERT … ON CONFLICT por alumno:
 * una planilla de 40 eran 40 viajes a la base dentro de la misma transacción.
 * Ahora es un solo INSERT multi-fila con `excluded.*`. Lo que NO cambia: qué se
 * pisa y qué no (la nota interna solo cuando se la trae; el autor de la
 * asistencia sí se pisa), la validación previa y lo que devuelven.
 */

type Insert = { values: Record<string, unknown>[]; set: Record<string, unknown> | null };
let inserts: Insert[] = [];
let selectRows: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy", "innerJoin"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectRows),
    insert: () => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const registro: Insert = { values: Array.isArray(v) ? v : [v], set: null };
        inserts.push(registro);
        return {
          onConflictDoUpdate: async (cfg: { set: Record<string, unknown> }) => {
            registro.set = cfg.set;
            return [];
          },
        };
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

const { markAttendance } = await import("@/server/attendance");
const { recordResults } = await import("@/server/grading");

beforeEach(() => {
  inserts = [];
  selectRows = [];
});

describe("markAttendance — una sola sentencia", () => {
  it("marca a toda la planilla con UN insert multi-fila", async () => {
    selectRows = [{ id: "cls_1", canceledAt: null }];
    const r = await markAttendance(
      "org_1",
      "cls_1",
      [
        { enrollmentId: "enr_1", status: "presente" },
        { enrollmentId: "enr_2", status: "ausente", notes: "avisó" },
        { enrollmentId: "enr_3", status: "tarde" },
      ],
      "usr_prof"
    );
    expect(r).toEqual({ ok: true, data: { marked: 3 } });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values.map((v) => v.enrollmentId)).toEqual(["enr_1", "enr_2", "enr_3"]);
    expect(inserts[0]!.values.every((v) => v.recordedBy === "usr_prof")).toBe(true);
    expect(inserts[0]!.values[1]!.notes).toBe("avisó");
    // La corrección pisa estado, nota y autor: los toma de la fila propuesta.
    expect(Object.keys(inserts[0]!.set!).sort()).toEqual(
      ["notes", "recordedBy", "status", "updatedAt"].sort()
    );
  });

  it("la misma inscripción dos veces: gana la última, como en el bucle", async () => {
    selectRows = [{ id: "cls_1", canceledAt: null }];
    const r = await markAttendance("org_1", "cls_1", [
      { enrollmentId: "enr_1", status: "presente" },
      { enrollmentId: "enr_1", status: "ausente" },
    ]);
    // `marked` cuenta lo que quedó escrito: una fila, no dos pedidos.
    expect(r).toEqual({ ok: true, data: { marked: 1 } });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toHaveLength(1);
    expect(inserts[0]!.values[0]!.status).toBe("ausente");
  });

  it("sin filas no escribe nada", async () => {
    selectRows = [{ id: "cls_1", canceledAt: null }];
    expect(await markAttendance("org_1", "cls_1", [])).toEqual({
      ok: true,
      data: { marked: 0 },
    });
    expect(inserts).toHaveLength(0);
  });

  it("una clase cancelada se rechaza antes de escribir", async () => {
    selectRows = [{ id: "cls_1", canceledAt: new Date() }];
    const r = await markAttendance("org_1", "cls_1", [
      { enrollmentId: "enr_1", status: "presente" },
    ]);
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe("recordResults — una sentencia por forma de fila", () => {
  it("toda la planilla con nota: UN insert que pisa la nota", async () => {
    selectRows = [{ id: "asm_1" }];
    const r = await recordResults(
      "org_1",
      "asm_1",
      [
        { enrollmentId: "enr_1", passed: true, notes: null },
        { enrollmentId: "enr_2", passed: false, notes: "rehacer" },
      ],
      "usr_1"
    );
    expect(r).toEqual({ ok: true, data: { recorded: 2 } });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toHaveLength(2);
    expect(Object.keys(inserts[0]!.set!).sort()).toEqual(["notes", "passed", "updatedAt"]);
  });

  it("sin nota (corrección de entrega): no toca la nota interna ni el autor", async () => {
    selectRows = [{ id: "asm_1" }];
    await recordResults("org_1", "asm_1", [{ enrollmentId: "enr_1", passed: true }], "usr_1");
    expect(inserts).toHaveLength(1);
    expect(Object.keys(inserts[0]!.set!).sort()).toEqual(["passed", "updatedAt"]);
  });

  it("mezcla de las dos formas: a lo sumo dos sentencias, nunca una por alumno", async () => {
    selectRows = [{ id: "asm_1" }];
    await recordResults("org_1", "asm_1", [
      { enrollmentId: "enr_1", passed: true },
      { enrollmentId: "enr_2", passed: true, notes: "ok" },
      { enrollmentId: "enr_3", passed: false },
    ]);
    expect(inserts).toHaveLength(2);
    expect(inserts.flatMap((i) => i.values.map((v) => v.enrollmentId)).sort()).toEqual([
      "enr_1",
      "enr_2",
      "enr_3",
    ]);
  });

  it("evaluación ajena: 404 y nada escrito", async () => {
    selectRows = [];
    const r = await recordResults("org_1", "asm_x", [{ enrollmentId: "enr_1", passed: true }]);
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
