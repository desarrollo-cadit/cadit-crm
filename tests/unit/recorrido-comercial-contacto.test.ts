import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 046 (T011; US1, FR-004) — El historial comercial del contacto: viaja con
 * `contactos.ver`, sin plata, y un contacto ajeno es 404.
 */

const selectQueue: unknown[][] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => chain(), selectDistinct: () => chain() }),
  schema: new Proxy(
    {},
    {
      get: (_t, tabla) =>
        new Proxy({}, { get: (_t2, col) => `${String(tabla)}.${String(col)}` }),
    }
  ),
}));

const { historialADto, recorridoComercialDelContacto } = await import("@/server/recorrido-comercial");

beforeEach(() => {
  selectQueue.length = 0;
});

describe("historialADto", () => {
  it("serializa fechas a ISO y solo lleva los campos del contrato (sin plata)", () => {
    const [dto] = historialADto([
      {
        courseId: "crs_arq",
        courseName: "Revit Arquitectura",
        categoryId: "cat_bim",
        estado: "aprobo",
        sinResultado: false,
        cohortId: "coh_1",
        cohortName: "Marzo",
        startDate: new Date("2025-03-01T00:00:00Z"),
        endDate: null,
        primerInicio: new Date("2025-03-01T00:00:00Z"),
        ultimoInicioCursado: new Date("2025-03-01T00:00:00Z"),
        veces: 1,
        especializacion: null,
      },
    ]);
    expect(dto).toEqual({
      courseId: "crs_arq",
      courseName: "Revit Arquitectura",
      estado: "aprobo",
      sinResultado: false,
      cohortId: "coh_1",
      cohortName: "Marzo",
      startDate: "2025-03-01T00:00:00.000Z",
      endDate: null,
      veces: 1,
      especializacion: null,
    });
  });
});

describe("recorridoComercialDelContacto", () => {
  it("contacto ajeno o inexistente → null (la ruta responde 404)", async () => {
    selectQueue.push([]); // el contacto no está en la organización
    expect(await recorridoComercialDelContacto("org_1", "ct_otro")).toBeNull();
  });

  it("contacto sin cursadas → historial vacío y sin sugerencias", async () => {
    selectQueue.push([{ id: "ct_1" }]); // el contacto
    selectQueue.push([]); // sus inscripciones
    expect(await recorridoComercialDelContacto("org_1", "ct_1")).toEqual({ historial: [], sugerencias: [] });
  });
});

describe("GET /api/contacts/[id]/recorrido-comercial", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src", "app", "api", "contacts", "[id]", "recorrido-comercial", "route.ts"),
    "utf8"
  );

  it("pide `contactos.ver` y responde 404 si no hay contacto", () => {
    expect(src).toMatch(/export const GET = requireCapability\(\s*"contactos\.ver"/);
    expect(src).toMatch(/apiError\(404, "not_found"/);
    expect(src).toContain("recorridoComercialDelContacto(");
  });
});
