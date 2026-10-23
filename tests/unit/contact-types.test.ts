import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 US7 (T059; FR-024) — El filtro de Contactos por tipo: conjuntos de ids
 * sacados de la derivación única, aplicados en SQL para no romper la
 * paginación.
 */

vi.mock("@/lib/db", () => ({
  getDb: () => ({}),
  schema: new Proxy({}, { get: (_t, tabla) => new Proxy({}, { get: (_t2, col) => `${String(tabla)}.${String(col)}` }) }),
}));
vi.mock("drizzle-orm", async (original) => ({
  ...(await original<typeof import("drizzle-orm")>()),
  inArray: (col: unknown, ids: unknown) => ({ op: "in", col, ids }),
  notInArray: (col: unknown, ids: unknown) => ({ op: "not_in", col, ids }),
}));

const { condicionDeTipo, idsPorTipo } = await import("@/server/contact-types");

function entrada(p: Partial<EntradaDeHistorial>): EntradaDeHistorial {
  const d = new Date("2025-03-01");
  return {
    courseId: "c",
    courseName: "c",
    categoryId: null,
    estado: "aprobo",
    sinResultado: false,
    cohortId: "g",
    cohortName: "g",
    startDate: d,
    endDate: null,
    primerInicio: d,
    ultimoInicioCursado: d,
    veces: 1,
    activo: false,
    sellerId: null,
    companyId: null,
    especializacion: null,
    ...p,
  };
}

const historiales = new Map<string, EntradaDeHistorial[]>([
  ["ct_activo", [entrada({ estado: "por_empezar", activo: true, ultimoInicioCursado: null })]],
  ["ct_ex", [entrada({})]],
  ["ct_hist", [entrada({ estado: "curso_historico", cohortId: null })]],
  ["ct_vacio", []],
]);

describe("idsPorTipo", () => {
  it("separa alumnos activos y exalumnos; el resto es lead", () => {
    const ids = idsPorTipo(historiales);
    expect(ids.alumno_activo).toEqual(["ct_activo"]);
    expect([...ids.exalumno].sort()).toEqual(["ct_ex", "ct_hist"]);
    expect(ids.tipoDe("ct_vacio")).toBe("lead");
    expect(ids.tipoDe("ct_desconocido")).toBe("lead");
    expect(ids.tipoDe("ct_hist")).toBe("exalumno");
  });
});

describe("condicionDeTipo", () => {
  const ids = idsPorTipo(historiales);

  it("alumnos activos y exalumnos: IN", () => {
    expect(condicionDeTipo("alumno_activo", ids)).toEqual({ op: "in", col: "contact.id", ids: ["ct_activo"] });
    expect(condicionDeTipo("exalumno", ids)).toEqual({
      op: "in",
      col: "contact.id",
      ids: expect.arrayContaining(["ct_ex", "ct_hist"]),
    });
  });

  it("leads: NOT IN (todos los que no son lead), así entra quien no tiene historial", () => {
    expect(condicionDeTipo("lead", ids)).toEqual({
      op: "not_in",
      col: "contact.id",
      ids: expect.arrayContaining(["ct_activo", "ct_ex", "ct_hist"]),
    });
  });

  it("sin tipo no filtra; un tipo sin nadie es una condición falsa", () => {
    expect(condicionDeTipo(null, ids)).toBeUndefined();
    const vacio = idsPorTipo(new Map());
    expect(condicionDeTipo("exalumno", vacio)).toBeDefined();
    expect(condicionDeTipo("exalumno", vacio)).not.toHaveProperty("op");
    expect(condicionDeTipo("lead", vacio)).toBeUndefined();
  });
});

describe("GET /api/contacts — tipo", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "app", "api", "contacts", "route.ts"), "utf8");
  it("acepta `tipo`, lo aplica en el WHERE y devuelve las cantidades por tipo", () => {
    expect(src).toMatch(/tipo:\s*z\.enum/);
    expect(src).toContain("condicionDeTipo(");
    expect(src).toContain("tipos");
  });
});
