import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 043 — `estadosDeAcceso`: la madre, las hijas y los módulos de una
 * especialización, juntados desde la base y decididos por la regla pura.
 */

const tablas: Record<string, unknown[]> = {};
const updates: Array<Record<string, unknown>> = [];

function chain() {
  let tabla = "";
  const c: Record<string, unknown> = {};
  c.from = (t: { __name: string }) => {
    tabla = t.__name;
    return c;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(tablas[tabla] ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({
    select: () => chain(),
    update: () => ({
      set: (s: Record<string, unknown>) => {
        updates.push(s);
        return { where: () => Promise.resolve([]) };
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
            get: (_t2, col) => (col === "__name" ? String(tableName) : `${String(tableName)}.${String(col)}`),
          }
        ),
    }
  ),
}));

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  updates.length = 0;
  vi.resetModules();
});

const ORG = "org_1";
const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const insc = (id: string, cohortId: string | null, parent: string | null = null, accessUntil: Date | null = null) => ({
  id,
  parentEnrollmentId: parent,
  cohortId,
  accessUntil,
  accessUntilSetAt: accessUntil ? d("2026-10-01") : null,
  accessUntilSetByName: accessUntil ? "Lucía" : null,
});
const coh = (id: string, endDate: Date | null, parentCohortId: string | null = null, isSpecialization = false) => ({
  id,
  endDate,
  parentCohortId,
  isSpecialization,
});

describe("043 — estadosDeAcceso", () => {
  it("especialización: madre e hijas comparten el estado del ÚLTIMO módulo", async () => {
    tablas.organization = [{ timezone: "America/Montevideo" }];
    tablas.enrollment = [insc("madre", "ebim"), insc("h1", "m1", "madre"), insc("h3", "m3", "madre")];
    tablas.cohort = [
      coh("ebim", null, null, true),
      coh("m1", d("2026-03-31"), "ebim"),
      coh("m2", null, "ebim"),
      coh("m3", d("2026-08-31"), "ebim"),
    ];
    // m2 no tiene fin pero sí clases: su referencia es la última clase.
    tablas.classSession = [{ cohortId: "m2", last: d("2026-06-15") }];

    const { estadosDeAcceso } = await import("@/server/access-expiry");
    // A mitad de septiembre: el módulo 1 terminó hace meses y sigue visible.
    const e = await estadosDeAcceso(ORG, ["h1", "madre"], new Date("2026-09-15T12:00:00.000Z"));
    expect(e.get("madre")).toMatchObject({ referencia: "2026-08-31", hasta: "2026-09-30", vencido: false });
    expect(e.get("h1")).toMatchObject({ hasta: "2026-09-30", vencido: false, heredadoDe: "madre" });
  });

  it("especialización con un módulo sin fecha: no vence", async () => {
    tablas.organization = [{ timezone: "America/Montevideo" }];
    tablas.enrollment = [insc("madre", "ebim")];
    tablas.cohort = [coh("ebim", null, null, true), coh("m1", d("2026-03-31"), "ebim"), coh("m2", null, "ebim")];
    const { estadosDeAcceso } = await import("@/server/access-expiry");
    const e = await estadosDeAcceso(ORG, ["madre"], new Date("2030-01-01T00:00:00.000Z"));
    expect(e.get("madre")).toMatchObject({ hasta: null, origen: "sin_fecha", vencido: false });
  });

  it("cursada simple: un mes después del fin; la fecha manual manda y lleva autor", async () => {
    tablas.organization = [{ timezone: "America/Montevideo" }];
    tablas.enrollment = [insc("a", "c1"), insc("b", "c1", null, d("2027-03-01"))];
    tablas.cohort = [coh("c1", d("2026-01-31"))];
    const { estadosDeAcceso } = await import("@/server/access-expiry");
    const e = await estadosDeAcceso(ORG, ["a", "b"], new Date("2026-10-19T12:00:00.000Z"));
    expect(e.get("a")).toMatchObject({ hasta: "2026-02-28", origen: "calculado", vencido: true });
    expect(e.get("b")).toMatchObject({
      hasta: "2027-03-01",
      calculada: "2026-02-28",
      origen: "manual",
      vencido: false,
      fijadoPor: "Lucía",
    });
  });

  it("0083 — entrega final + prórroga APROBADA (assessment_extension) de la inscripción", async () => {
    tablas.organization = [{ timezone: "America/Montevideo" }];
    tablas.enrollment = [insc("a", "c1"), insc("b", "c1")];
    tablas.cohort = [{ ...coh("c1", d("2026-11-30")), deliveryDeadline: d("2026-12-15") }];
    // Solo `a` tiene prórroga: 23:59 del 10/02/2027 en Montevideo.
    tablas.assessmentExtension = [{ enrollmentId: "a", cohortId: "c1", dueAt: new Date("2027-02-11T02:59:00.000Z") }];
    const { estadosDeAcceso } = await import("@/server/access-expiry");
    const e = await estadosDeAcceso(ORG, ["a", "b"], new Date("2027-01-20T12:00:00.000Z"));
    expect(e.get("a")).toMatchObject({ referencia: "2026-12-15", hasta: "2027-02-10", vencido: false });
    expect(e.get("b")).toMatchObject({ referencia: "2026-12-15", hasta: "2027-01-15", vencido: true });
  });

  it("cohorte sin fin ni clases: no vence", async () => {
    tablas.organization = [{ timezone: "America/Montevideo" }];
    tablas.enrollment = [insc("a", "c1")];
    tablas.cohort = [coh("c1", null)];
    const { estadosDeAcceso } = await import("@/server/access-expiry");
    const e = await estadosDeAcceso(ORG, ["a"], new Date("2030-01-01T00:00:00.000Z"));
    expect(e.get("a")).toMatchObject({ origen: "sin_fecha", vencido: false });
  });
});

describe("043 — fijar la fecha a mano", () => {
  it("en una hija: 422, la fecha es de la madre; no escribe", async () => {
    tablas.enrollment = [{ id: "h1", parentEnrollmentId: "madre", cohortId: "m1" }];
    const { fijarAccesoHasta } = await import("@/server/access-expiry");
    const r = await fijarAccesoHasta(ORG, "h1", "2027-01-01", "usr_1");
    expect(r).toMatchObject({ ok: false, status: 422, code: "acceso_en_la_madre" });
    expect(updates).toEqual([]);
  });

  it("inexistente: 404", async () => {
    const { fijarAccesoHasta } = await import("@/server/access-expiry");
    const r = await fijarAccesoHasta(ORG, "nada", "2027-01-01", "usr_1");
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("escribe SOLO la fecha y quién/cuándo", async () => {
    tablas.enrollment = [{ id: "e1", parentEnrollmentId: null, cohortId: "c1" }];
    const { fijarAccesoHasta } = await import("@/server/access-expiry");
    const r = await fijarAccesoHasta(ORG, "e1", "2027-01-01", "usr_1");
    expect(r).toEqual({ ok: true, data: { accessUntil: "2027-01-01" } });
    expect(Object.keys(updates[0]!).sort()).toEqual(
      ["accessUntil", "accessUntilSetAt", "accessUntilSetBy", "updatedAt"].sort()
    );
    expect(updates[0]!.accessUntil).toEqual(d("2027-01-01"));
    expect(updates[0]!.accessUntilSetBy).toBe("usr_1");
  });
});
