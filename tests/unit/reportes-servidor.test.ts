import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 US8 (T072; FR-028, FR-031) — Los reportes desde el servidor: los
 * ingresos solo se consultan y viajan con `cobranza.ver`.
 */

const desde: string[] = [];
const resultados = new Map<string, unknown[]>();

function chain() {
  let tabla = "";
  const c: Record<string, unknown> = {};
  c.from = (t: { __table: string }) => {
    tabla = t.__table;
    desde.push(tabla);
    return c;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "groupBy", "orderBy"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(resultados.get(tabla) ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => chain() }),
  schema: new Proxy(
    {},
    {
      get: (_t, nombre) =>
        new Proxy({ __table: String(nombre) }, { get: (t, col) => (col === "__table" ? t.__table : `${String(nombre)}.${String(col)}`) }),
    }
  ),
}));

const historial = new Map<string, EntradaDeHistorial[]>();
vi.mock("@/server/recorrido-comercial", () => ({ historialesDeLaOrganizacion: async () => historial }));
vi.mock("@/server/attendance", () => ({
  relojDeAsistencia: async () => ({ timeZone: "America/Montevideo", now: new Date("2026-10-23T12:00:00Z") }),
}));

const { reportesDeLaOrganizacion } = await import("@/server/reportes");

beforeEach(() => {
  desde.length = 0;
  resultados.clear();
});

describe("reportesDeLaOrganizacion", () => {
  it("sin cobranza.ver: no consulta pagos y la respuesta no tiene ingresos", async () => {
    const r = await reportesDeLaOrganizacion("org_1", { desde: null, hasta: null }, { conIngresos: false });
    if (!r.ok) throw new Error(r.message);
    expect(desde).not.toContain("payment");
    expect("ingresosPorCurso" in r.reportes).toBe(false);
  });

  it("con cobranza.ver: consulta pagos y devuelve ingresos por curso y moneda", async () => {
    resultados.set("payment", [{ courseName: "ARQ", currency: "UYU", amount: 500 }]);
    const r = await reportesDeLaOrganizacion("org_1", { desde: null, hasta: null }, { conIngresos: true });
    if (!r.ok) throw new Error(r.message);
    expect(desde).toContain("payment");
    expect(r.reportes.ingresosPorCurso).toEqual([{ currency: "UYU", cursos: [{ label: "ARQ", cobrado: 500 }] }]);
  });

  it("cuenta las empresas excluidas para avisarlo", async () => {
    resultados.set("company", [
      { id: "e1", legalName: "Uno", tradeName: null, excludeFromReports: true },
      { id: "e2", legalName: "Dos", tradeName: null, excludeFromReports: false },
    ]);
    const r = await reportesDeLaOrganizacion("org_1", { desde: null, hasta: null }, { conIngresos: false });
    expect(r.ok && r.reportes.empresasExcluidas).toBe(1);
  });

  it("un período inválido es un error, no se calcula nada", async () => {
    const r = await reportesDeLaOrganizacion("org_1", { desde: "2025-05-01", hasta: "2025-01-01" }, { conIngresos: false });
    expect(r.ok).toBe(false);
  });
});

describe("GET /api/dashboard/reportes", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "app", "api", "dashboard", "reportes", "route.ts"), "utf8");
  it("pide `reportes.ver` y decide los ingresos por `cobranza.ver`", () => {
    expect(src).toMatch(/export const GET = requireCapability\(\s*"reportes\.ver"/);
    expect(src).toContain('includes("cobranza.ver")');
    expect(src).toContain('"invalid_query"');
  });
});
