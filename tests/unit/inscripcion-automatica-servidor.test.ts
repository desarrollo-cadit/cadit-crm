import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 034 (US1, FR-001..FR-005) — La puerta de servidor que inscribe en módulos.
 *
 * La regla vive en `src/lib/module-auto-enroll.ts` (y su test). Acá se prueba
 * lo que SÓLO el servidor puede romper: que las hijas nazcan sin plata ni
 * vendedor (FR-003), con la fecha de la madre, y que nada corra solo al
 * desplegar.
 */

const selectQueue: unknown[][] = [];
const inserts: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        return Promise.resolve([]);
      },
    }),
  }),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  vi.resetModules();
});

const MADRE_ENROLLED = new Date("2026-03-01T00:00:00.000Z");

describe("inscribirEnModulos", () => {
  it("crea las hijas sin monto, sin cuotas ni vendedor, con la etapa y la fecha de la madre", async () => {
    selectQueue.push(
      // módulos de la especialización
      [{ id: "coh_m1", name: "Revit", courseId: "crs_1", courseName: "Revit", position: 1, startDate: null }],
      // madres
      [
        {
          id: "enr_1",
          stageId: "stg_won",
          enrolledAt: MADRE_ENROLLED,
          nationalId: "1234",
          contactId: "ct_1",
          firstName: "Ana",
          lastName: "Pérez",
          archivedAt: null,
        },
        {
          id: "enr_2",
          stageId: "stg_won",
          enrolledAt: MADRE_ENROLLED,
          nationalId: null,
          contactId: "ct_2",
          firstName: "Beto",
          lastName: null,
          archivedAt: new Date(), // de baja
        },
      ],
      [], // hijas
      [], // inscripciones en los módulos
      [] // exclusiones
    );
    const { inscribirEnModulos } = await import("@/server/module-enrollment");
    const plan = await inscribirEnModulos("org_1", "coh_esp", { moduloIds: ["coh_m1"] });

    expect(plan.aCrear).toHaveLength(1);
    expect(plan.excluidas.map((e) => e.motivo)).toEqual(["baja"]);
    const filas = inserts[0] as Record<string, unknown>[];
    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual(
      expect.objectContaining({
        contactId: "ct_1",
        cohortId: "coh_m1",
        parentEnrollmentId: "enr_1",
        stageId: "stg_won",
        enrolledAt: MADRE_ENROLLED,
        amount: null,
        installments: null,
        sellerId: null,
      })
    );
  });

  it("sin nada que crear no escribe nada", async () => {
    selectQueue.push([]); // la especialización no tiene módulos
    const { inscribirEnModulos } = await import("@/server/module-enrollment");
    const plan = await inscribirEnModulos("org_1", "coh_esp");
    expect(plan.aCrear).toEqual([]);
    expect(inserts).toHaveLength(0);
  });
});

describe("guardas estructurales", () => {
  const ROOT = process.cwd();
  const leer = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

  it("ninguna migración inscribe en módulos al desplegar (FR-005: lo decide el dueño)", () => {
    const sql = leer("drizzle", "0057_especializaciones_operativa.sql");
    expect(sql).not.toMatch(/insert\s+into\s+"?enrollment"?/i);
    expect(sql).not.toMatch(/delete\s+from\s+"?class_session"?/i);
  });

  it("la lista de alumnos del módulo no consulta plata ni contacto (FR-017)", () => {
    const src = leer("src", "server", "module-roster.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).not.toMatch(/\b(amount|installments|sellerId|invoiceNumber|receiptNumber|phone|email|accountLink)\b/);
  });

  it("las hijas automáticas no nombran monto ni vendedor más que para dejarlos en null", () => {
    const src = leer("src", "server", "module-enrollment.ts");
    expect(src).toMatch(/amount:\s*null/);
    expect(src).toMatch(/sellerId:\s*null/);
    expect(src).not.toMatch(/installment\b.*insert/);
  });
});
