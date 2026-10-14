import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 (T011/T012, DV-008) — Guardar la plantilla de corrección de una
 * evaluación.
 *
 * Lo que se fija: la plantilla inválida no se guarda y dice por qué; los
 * ejercicios nuevos reciben id; y una vez publicada una corrección, la escala,
 * el mínimo y los ejercicios quedan congelados (409) mientras los nombres se
 * pueden seguir corrigiendo.
 */

const selectQueue: unknown[][] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

const FILA_BASE = {
  id: "asm_1",
  organizationId: "org_1",
  cohortId: "coh_1",
  name: "Trabajo final",
  position: 0,
  required: true,
  dueAt: null,
  scale: "pass_fail",
  minScore: null,
  requiresApproval: false,
  criteria: [],
  textFields: [],
};

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    update: (table: unknown) => ({
      set: (s: Record<string, unknown>) => {
        updates.push({ table: String(table), set: s });
        const chain: Record<string, unknown> = {};
        chain.where = () => chain;
        chain.returning = async () => [{ ...FILA_BASE, ...s }];
        return chain;
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) => {
              if (col === "toString" || col === Symbol.toPrimitive) {
                return () => String(tableName);
              }
              if (typeof col === "symbol") return undefined;
              return `${String(tableName)}.${col}`;
            },
          }
        ),
    }
  ),
}));

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
});

const NUMERICA = {
  scale: "numeric" as const,
  minScore: 60,
  requiresApproval: false,
  criteria: [
    { id: "", name: "Ejercicio 1", maxPoints: 40 },
    { id: "", name: "Ejercicio 2", maxPoints: 30 },
    { id: "", name: "Ejercicio 3", maxPoints: 30 },
  ],
  textFields: [{ id: "", name: "Fortalezas", required: true }],
};

describe("guardarPlantilla", () => {
  it("guarda una numérica 40/30/30 y les da id a ejercicios y campos", async () => {
    const { guardarPlantilla } = await import("@/server/grading");
    selectQueue.push([FILA_BASE]);

    const r = await guardarPlantilla("org_1", "asm_1", NUMERICA);

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe("assessment");
    const set = updates[0]!.set as { criteria: { id: string }[]; textFields: { id: string }[] };
    expect(set.criteria.every((c) => c.id.length > 0)).toBe(true);
    expect(set.textFields.every((f) => f.id.length > 0)).toBe(true);
    if (r.ok) {
      expect(r.data.scale).toBe("numeric");
      expect(r.data.minScore).toBe(60);
      expect(r.data.criteria).toHaveLength(3);
    }
  });

  it("evaluación ajena o inexistente → 404", async () => {
    const { guardarPlantilla } = await import("@/server/grading");
    selectQueue.push([]);
    const r = await guardarPlantilla("org_1", "asm_x", NUMERICA);
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(updates).toHaveLength(0);
  });

  it("ejercicios que no suman 100 → 422 con cuánto falta", async () => {
    const { guardarPlantilla } = await import("@/server/grading");
    selectQueue.push([FILA_BASE]);
    const r = await guardarPlantilla("org_1", "asm_1", {
      ...NUMERICA,
      criteria: NUMERICA.criteria.slice(0, 2),
    });
    expect(r).toMatchObject({ ok: false, status: 422, code: "plantilla_invalida" });
    if (!r.ok) expect(r.message).toContain("faltan 30");
    expect(updates).toHaveLength(0);
  });

  it("con correcciones publicadas, cambiar la escala → 409", async () => {
    const { guardarPlantilla } = await import("@/server/grading");
    selectQueue.push([FILA_BASE], [{ id: "cor_1" }]);
    const r = await guardarPlantilla("org_1", "asm_1", NUMERICA);
    expect(r).toMatchObject({ ok: false, status: 409, code: "plantilla_congelada" });
    expect(updates).toHaveLength(0);
  });

  it("sin correcciones publicadas, cambiar la escala se puede", async () => {
    const { guardarPlantilla } = await import("@/server/grading");
    selectQueue.push([FILA_BASE], []);
    const r = await guardarPlantilla("org_1", "asm_1", NUMERICA);
    expect(r.ok).toBe(true);
  });

  it("con correcciones publicadas, renombrar y pedir aprobación se puede", async () => {
    const { guardarPlantilla } = await import("@/server/grading");
    const criteria = [
      { id: "c1", name: "Ejercicio 1", maxPoints: 40 },
      { id: "c2", name: "Ejercicio 2", maxPoints: 60 },
    ];
    selectQueue.push([{ ...FILA_BASE, scale: "numeric", minScore: 60, criteria }], [{ id: "cor_1" }]);
    const r = await guardarPlantilla("org_1", "asm_1", {
      scale: "numeric",
      minScore: 60,
      requiresApproval: true,
      criteria: criteria.map((c) => ({ ...c, name: `${c.name} — revisado` })),
      textFields: [],
    });
    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });
});

describe("PUT /api/assessments/[id]/template — la puerta", () => {
  it("es del staff con `evaluacion.editar` y valida el cuerpo", () => {
    const fuente = readFileSync(
      path.join(process.cwd(), "src/app/api/assessments/[id]/template/route.ts"),
      "utf8"
    );
    expect(fuente).toMatch(/requireCapability\(\s*"evaluacion\.editar"/);
    expect(fuente).toContain("parseBody");
    expect(fuente).toContain("guardarPlantilla");
    expect(fuente).not.toMatch(/requireTeacherPortal|requireStudentPortal/);
  });
});

/**
 * 031 (T013) — La planilla de la cohorte trae la plantilla de cada evaluación
 * y la nota de cada alumno. El estado sigue saliendo de `passed` (DV-004).
 */
describe("cohortGrading — plantilla y notas", () => {
  it("devuelve la plantilla por evaluación y `scores` por alumno", async () => {
    const { cohortGrading } = await import("@/server/grading");
    const criteria = [
      { id: "c1", name: "Ejercicio 1", maxPoints: 40 },
      { id: "c2", name: "Ejercicio 2", maxPoints: 60 },
    ];
    selectQueue.push([{ id: "coh_1", minAttendancePct: null, courseMinPct: null, timezone: "America/Montevideo" }]);
    selectQueue.push([
      { ...FILA_BASE, scale: "numeric", minScore: 60, criteria },
      { ...FILA_BASE, id: "asm_2", name: "Parcial", position: 1 },
    ]);
    selectQueue.push([
      {
        id: "enr_1",
        enrolledAt: null,
        firstName: "Ana",
        lastName: "Pérez",
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
        attendanceWaiverByName: null,
      },
    ]);
    selectQueue.push([
      { assessment_result: { enrollmentId: "enr_1", assessmentId: "asm_1", passed: true, score: 80 } },
      { assessment_result: { enrollmentId: "enr_1", assessmentId: "asm_2", passed: true, score: null } },
    ]);
    selectQueue.push([], [], []);

    const r = await cohortGrading("org_1", "coh_1");

    expect(r?.assessments[0]).toMatchObject({ scale: "numeric", minScore: 60, criteria });
    expect(r?.assessments[1]).toMatchObject({ scale: "pass_fail", minScore: null, criteria: [] });
    expect(r?.students[0]?.scores).toEqual({ asm_1: 80, asm_2: null });
    expect(r?.students[0]?.results).toEqual({ asm_1: true, asm_2: true });
  });
});
