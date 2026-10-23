import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 (T028; US4, FR-008, FR-010) — Los filtros de historial entran a la
 * evaluación de audiencias de la 045 como UNA condición más (IN / NOT IN
 * sobre `contact.id`), y todo lo que la 045 garantiza —exclusiones por
 * prueba, baja, archivado y sin correo— sigue pasando igual.
 */

const selectQueue: unknown[][] = [];
const wheres: unknown[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "orderBy", "limit", "groupBy"]) c[m] = () => c;
  c.where = (w: unknown) => {
    wheres.push(w);
    return c;
  };
  c.getSQL = () => ({ queryChunks: [] });
  (c as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => chain(), selectDistinct: () => chain() }),
  schema: new Proxy(
    {},
    { get: (_t, tabla) => new Proxy({}, { get: (_t2, col) => `${String(tabla)}.${String(col)}` }) }
  ),
}));

vi.mock("@/lib/db/tenant", () => ({
  scoped: (_col: unknown, _org: unknown, ...conds: unknown[]) => ({ scoped: conds.filter(Boolean) }),
}));

vi.mock("drizzle-orm", async (original) => ({
  ...(await original<typeof import("drizzle-orm")>()),
  inArray: (col: unknown, ids: unknown) => ({ op: "in", col, ids }),
  notInArray: (col: unknown, ids: unknown) => ({ op: "not_in", col, ids }),
}));

const historiales = vi.fn<() => Promise<Map<string, EntradaDeHistorial[]>>>();
vi.mock("@/server/recorrido-comercial", () => ({ historialesDeLaOrganizacion: () => historiales() }));
vi.mock("@/server/course-routes", () => ({ rutasPorCurso: async () => new Map([["arq", ["mep"]]]) }));

const { condicionDeHistorial, evaluarAudiencia } = await import("@/server/marketing/audiences");

function entrada(courseId: string, estado: EntradaDeHistorial["estado"]): EntradaDeHistorial {
  const d = new Date("2025-03-01");
  return {
    courseId,
    courseName: courseId,
    categoryId: null,
    estado,
    sinResultado: false,
    cohortId: "g",
    cohortName: "g",
    startDate: d,
    endDate: null,
    primerInicio: d,
    ultimoInicioCursado: d,
    veces: 1,
    activo: false,
    especializacion: null,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  wheres.length = 0;
  historiales.mockReset();
  historiales.mockResolvedValue(
    new Map([
      ["ct_a", [entrada("arq", "aprobo")]],
      ["ct_b", [entrada("arq", "aprobo"), entrada("mep", "por_empezar")]],
      ["ct_c", [entrada("nav", "aprobo")]],
    ])
  );
});

describe("condicionDeHistorial", () => {
  it("sin filtros de historial no lee historiales ni agrega condición", async () => {
    expect(await condicionDeHistorial("org_1", { v: 1, courseIds: ["arq"] })).toBeUndefined();
    expect(historiales).not.toHaveBeenCalled();
  });

  it("«aprobó A y no hizo B» → contact.id IN (quienes cumplen)", async () => {
    const c = await condicionDeHistorial("org_1", {
      v: 1,
      historyApprovedCourseIds: ["arq"],
      historyNotDoneCourseIds: ["mep"],
    });
    expect(c).toEqual({ op: "in", col: "contact.id", ids: ["ct_a"] });
  });

  it("solo «no hizo B» → contact.id NOT IN (quienes lo hicieron), así entran los leads", async () => {
    const c = await condicionDeHistorial("org_1", { v: 1, historyNotDoneCourseIds: ["mep"] });
    expect(c).toEqual({ op: "not_in", col: "contact.id", ids: ["ct_b"] });
  });

  it("nadie cumple → condición falsa (no «sin filtro»)", async () => {
    const c = await condicionDeHistorial("org_1", { v: 1, historyApprovedCourseIds: ["zzz"] });
    expect(c).toBeDefined();
    expect(c).not.toHaveProperty("op");
  });

  it("el atajo de ruta usa las rutas guardadas", async () => {
    const c = await condicionDeHistorial("org_1", { v: 1, historyNextStepOfCourseId: "arq" });
    expect(c).toEqual({ op: "in", col: "contact.id", ids: ["ct_a"] });
  });
});

describe("evaluarAudiencia con historial + filtros de la 045", () => {
  it("la condición de historial se suma a las de la 045, y las exclusiones siguen aplicando", async () => {
    const fila = (contactId: string, p: Record<string, unknown> = {}) => ({
      contactId,
      firstName: contactId,
      lastName: null,
      email: `${contactId}@x.com`,
      createdAt: new Date("2026-01-01"),
      archivedAt: null,
      prueba: false,
      baja: false,
      ...p,
    });
    // La consulta de candidatos (ya filtrada por la base) devuelve estas filas.
    selectQueue.push([
      fila("ct_a"),
      fila("ct_baja", { baja: true }),
      fila("ct_arch", { archivedAt: new Date("2026-05-01") }),
      fila("ct_sin", { email: null }),
    ]);
    const r = await evaluarAudiencia(
      "org_1",
      { v: 1, companyIds: ["emp_1"], historyApprovedCourseIds: ["arq"] },
      { page: 1, pageSize: 25 }
    );
    expect(r.count).toBe(1);
    expect(r.recipients.map((x) => x.contactId)).toEqual(["ct_a"]);
    expect(r.excluded).toMatchObject({ baja: 1, archivado: 1, sin_correo: 1 });

    // La consulta de `contact` lleva el filtro de empresa Y el de historial.
    const deContacto = wheres.at(-1) as { scoped: unknown[] };
    expect(deContacto.scoped).toContainEqual({ op: "in", col: "contact.companyId", ids: ["emp_1"] });
    expect(deContacto.scoped).toContainEqual({ op: "in", col: "contact.id", ids: ["ct_a", "ct_b"] });
  });
});
