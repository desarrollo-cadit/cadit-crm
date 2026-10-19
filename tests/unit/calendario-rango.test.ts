import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 029 — El calendario pide a la base SOLO las clases de la semana que mira.
 *
 * `listCalendarClasses` traía todas las `class_session` de la organización y
 * filtraba en JavaScript: cada cambio de semana leía años de cronograma. Ahora
 * el rango va en el WHERE.
 *
 * La trampa que esto abre, y que este archivo cierra: "¿esta cohorte ya tiene
 * cronograma?" NO se puede deducir de las filas del rango. Una cohorte con 30
 * clases, ninguna esta semana, empezaría a dibujar proyección encima de su
 * cronograma real. Esa pregunta se contesta aparte, sin rango.
 */

const { gteSpy, lteSpy } = vi.hoisted(() => ({ gteSpy: vi.fn(), lteSpy: vi.fn() }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const orig = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...orig,
    gte: (...a: Parameters<typeof orig.gte>) => {
      gteSpy(...a);
      return orig.gte(...a);
    },
    lte: (...a: Parameters<typeof orig.lte>) => {
      lteSpy(...a);
      return orig.lte(...a);
    },
  };
});

let selectQueue: unknown[][] = [];
let distinctQueue: unknown[][] = [];
let selectArgs: unknown[] = [];

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
    select: (cols?: unknown) => {
      selectArgs.push(cols);
      return thenableChain(selectQueue.shift() ?? []);
    },
    selectDistinct: () => thenableChain(distinctQueue.shift() ?? []),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const { listCalendarClasses } = await import("@/server/classes");

const from = new Date("2026-09-21T00:00:00Z");
const to = new Date("2026-09-27T23:59:59Z");

const cohorte = {
  id: "coh_1",
  name: "Revit lunes",
  courseName: "Revit",
  startDate: new Date("2026-08-03T00:00:00Z"),
  endDate: new Date("2026-12-14T00:00:00Z"),
  daysOfWeek: "0",
  startTime: "18:30",
  endTime: "21:30",
  parentCohortId: null,
  isSpecialization: false,
  teacherId: "tch_tit",
};

beforeEach(() => {
  selectQueue = [];
  distinctQueue = [];
  selectArgs = [];
  gteSpy.mockClear();
  lteSpy.mockClear();
});

describe("listCalendarClasses — el rango va a la base", () => {
  it("filtra las clases por fecha en el WHERE", async () => {
    selectQueue = [[cohorte], []];
    distinctQueue = [[]];
    await listCalendarClasses("org_1", from, to);
    expect(gteSpy).toHaveBeenCalledWith("classSession.date", from);
    expect(lteSpy).toHaveBeenCalledWith("classSession.date", to);
  });

  it("una cohorte con cronograma pero sin clases esta semana NO se proyecta", async () => {
    selectQueue = [[cohorte], []];
    distinctQueue = [[{ cohortId: "coh_1" }]];
    const r = await listCalendarClasses("org_1", from, to);
    expect(r).toEqual([]);
  });

  it("sin cronograma, se dibuja la proyección de la semana", async () => {
    selectQueue = [[cohorte], []];
    distinctQueue = [[]];
    const r = await listCalendarClasses("org_1", from, to);
    expect(r).toHaveLength(1);
    expect(r[0]!.projected).toBe(true);
  });

  it("las reales del rango se devuelven tal cual", async () => {
    selectQueue = [
      [cohorte],
      [
        {
          cohortId: "coh_1",
          date: new Date("2026-09-21T21:30:00Z"),
          startTime: "18:30",
          endTime: "21:30",
          canceledAt: new Date(),
        },
      ],
    ];
    distinctQueue = [[{ cohortId: "coh_1" }]];
    const r = await listCalendarClasses("org_1", from, to);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ projected: false, canceled: true, cohortId: "coh_1" });
  });
});

/**
 * 044 — El profesor de cada clase y el filtro por profesor.
 *
 * Orden de lecturas: cohortes, clases del rango, recesos, profesores.
 */
describe("listCalendarClasses — profesor (044)", () => {
  const profesores = [
    { id: "tch_tit", name: "Titular" },
    { id: "tch_sup", name: "Suplente" },
  ];
  const real = (p: Record<string, unknown> = {}) => ({
    cohortId: "coh_1",
    date: new Date("2026-09-21T00:00:00Z"),
    startTime: "18:30",
    endTime: "21:30",
    canceledAt: null,
    teacherId: null,
    ...p,
  });

  it("la proyección usa el profesor de la cohorte", async () => {
    selectQueue = [[cohorte], [], [], profesores];
    distinctQueue = [[]];
    const r = await listCalendarClasses("org_1", from, to);
    expect(r[0]).toMatchObject({ projected: true, teacherId: "tch_tit", teacherName: "Titular" });
  });

  it("la suplencia de la clase manda sobre la cohorte", async () => {
    selectQueue = [
      [cohorte],
      [real({ teacherId: "tch_sup" }), real({ date: new Date("2026-09-22T00:00:00Z") })],
      [],
      profesores,
    ];
    distinctQueue = [[{ cohortId: "coh_1" }]];
    const r = await listCalendarClasses("org_1", from, to);
    expect(r.map((c) => c.teacherId)).toEqual(["tch_sup", "tch_tit"]);
    expect(r[0]!.teacherName).toBe("Suplente");
  });

  it("sin profesor en la clase ni en la cohorte: null", async () => {
    selectQueue = [[{ ...cohorte, teacherId: null }], [], [], profesores];
    distinctQueue = [[]];
    const r = await listCalendarClasses("org_1", from, to);
    expect(r[0]).toMatchObject({ teacherId: null, teacherName: null });
  });

  it("filtra por profesor en el servidor, incluida la suplencia", async () => {
    selectQueue = [
      [cohorte],
      [real({ teacherId: "tch_sup" }), real({ date: new Date("2026-09-22T00:00:00Z") })],
      [],
      profesores,
    ];
    distinctQueue = [[{ cohortId: "coh_1" }]];
    const r = await listCalendarClasses("org_1", from, to, ["tch_sup"]);
    expect(r).toHaveLength(1);
    expect(r[0]!.teacherId).toBe("tch_sup");
  });

  it("«Sin profesor» trae solo las clases sin profesor", async () => {
    selectQueue = [[{ ...cohorte, teacherId: null }], [], [], profesores];
    distinctQueue = [[]];
    expect(await listCalendarClasses("org_1", from, to, ["sin-profesor"])).toHaveLength(1);

    selectQueue = [[cohorte], [], [], profesores];
    distinctQueue = [[]];
    expect(await listCalendarClasses("org_1", from, to, ["sin-profesor"])).toHaveLength(0);
  });

  it("la tarifa por hora NO se lee (040: es dinero)", async () => {
    selectQueue = [[cohorte], [], [], profesores];
    distinctQueue = [[]];
    await listCalendarClasses("org_1", from, to);
    const columnas = JSON.stringify(selectArgs);
    expect(columnas).not.toContain("hourlyRate");
    expect(columnas).toContain("teacher.name");
  });
});
