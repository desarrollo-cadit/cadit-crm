import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (T032, US4, FR-002/FR-003/FR-004): el pool de licencias se descuenta
 * al asignar y se libera al liberar/dar de baja; asignar con
 * `available === 0` rechaza (409 no_stock); bajar `totalLicenses` por
 * debajo de lo asignado rechaza.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
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
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          returning: () => Promise.resolve([{ ...(values as object) }]),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([{ id: "lic_updated", ...(set as object) }]),
          }),
        };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  selectQueue.length = 0;
});

describe("availableLicenses (T028, DV-004)", () => {
  it("total - assignedCount", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    selectQueue.push(
      [{ name: "Revit", totalLicenses: 5 }],
      [{ n: 3 }]
    );
    const availability = await availableLicenses("org_1", "sw_1");
    expect(availability).toEqual({
      softwareId: "sw_1",
      softwareName: "Revit",
      total: 5,
      assignedCount: 3,
      available: 2,
    });
  });

  it("software inexistente → null", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    selectQueue.push([]);
    const availability = await availableLicenses("org_1", "sw_x");
    expect(availability).toBeNull();
  });
});

describe("assignLicense (T028, FR-003)", () => {
  it("con available === 0 y sin licencia previa, rechaza 409 no_stock", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }], // enrollment existe
      [{ name: "Revit", totalLicenses: 2 }], // software
      [{ n: 2 }], // assignedCount === total → available 0
      [] // sin license previa
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1");
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "no_stock",
      message: "No hay licencias disponibles de Revit",
    });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("con stock disponible y sin licencia previa, inserta la licencia asignada", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ name: "Revit", totalLicenses: 5 }],
      [{ n: 1 }], // available = 4
      [] // sin license previa
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1");
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    const values = inserts[0]!.values as { assigned: boolean; softwareId: string };
    expect(values.assigned).toBe(true);
    expect(values.softwareId).toBe("sw_1");
  });

  it("inscripción inexistente → 404", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push([]); // enrollment no encontrado
    const result = await assignLicense("org_1", "enr_x", "sw_1");
    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Inscripción no encontrada",
    });
  });

  it("reasignar el MISMO software ya asignado es idempotente (no descuenta de nuevo)", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ name: "Revit", totalLicenses: 5 }],
      [{ n: 5 }], // available = 0, pero ya está asignada a este enrollment
      [{ id: "lic_1", enrollmentId: "enr_1", softwareId: "sw_1", assigned: true, assignedAt: new Date() }]
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1");
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

describe("unassignLicense (T028, FR-002 escenario 3)", () => {
  it("libera la licencia asignada (assigned=false, assignedAt=null)", async () => {
    const { unassignLicense } = await import("@/server/licenses");
    const result = await unassignLicense("org_1", "enr_1");
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as { assigned: boolean; assignedAt: null };
    expect(set.assigned).toBe(false);
    expect(set.assignedAt).toBeNull();
    expect(result).not.toBeNull();
  });
});

describe("countAssignedLicenses (T031, FR-004)", () => {
  it("devuelve el conteo de licencias asignadas de un software", async () => {
    const { countAssignedLicenses } = await import("@/server/licenses");
    selectQueue.push([{ n: 4 }]);
    const n = await countAssignedLicenses("org_1", "sw_1");
    expect(n).toBe(4);
  });
});

describe("updateSoftware (T031, FR-004)", () => {
  it("rechaza bajar totalLicenses por debajo de las asignadas", async () => {
    const { updateSoftware } = await import("@/server/software");
    selectQueue.push([{ n: 5 }]); // countAssignedLicenses
    const result = await updateSoftware("org_1", "sw_1", { totalLicenses: 3 });
    expect(result).toEqual({
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "No se puede bajar de 5 licencias: ya hay 5 asignadas",
    });
    expect(updates).toHaveLength(0);
  });

  it("permite editar totalLicenses cuando el nuevo total no baja de lo asignado", async () => {
    const { updateSoftware } = await import("@/server/software");
    selectQueue.push([{ n: 5 }]); // countAssignedLicenses
    const result = await updateSoftware("org_1", "sw_1", { totalLicenses: 5 });
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });
});

/**
 * 005 iteración 2 (home, widget de licencias, pedido en vivo del dueño) —
 * total vs. disponibles por software, sin depender de `listSoftware` de
 * `@/server/software` (evita el ciclo software.ts → licenses.ts).
 */
describe("listLicenseInventory (iteración 2)", () => {
  it("cruza total por software con asignadas agrupadas por softwareId", async () => {
    selectQueue.push(
      [
        { id: "sw_1", name: "Revit", totalLicenses: 5 },
        { id: "sw_2", name: "Civil3D", totalLicenses: 2 },
      ],
      [{ softwareId: "sw_1", n: 3 }]
    );
    const { listLicenseInventory } = await import("@/server/licenses");
    const inventory = await listLicenseInventory("org_1");

    expect(inventory).toEqual([
      { softwareId: "sw_1", softwareName: "Revit", total: 5, assignedCount: 3, available: 2 },
      { softwareId: "sw_2", softwareName: "Civil3D", total: 2, assignedCount: 0, available: 2 },
    ]);
  });

  it("sin software cargado, devuelve un arreglo vacío sin consultar asignadas", async () => {
    selectQueue.push([]);
    const { listLicenseInventory } = await import("@/server/licenses");
    const inventory = await listLicenseInventory("org_1");
    expect(inventory).toEqual([]);
  });
});
