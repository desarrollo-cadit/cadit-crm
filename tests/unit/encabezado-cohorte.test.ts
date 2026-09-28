import { describe, expect, it, vi } from "vitest";
import { armarEncabezadoDeCohorte } from "@/lib/cohort-header";

/**
 * 029 — El encabezado de `/cohorts/[id]`: dónde estoy y cómo vuelvo.
 *
 * La página era solo pestañas: ni nombre, ni fechas, ni cómo volver. En un
 * módulo, la única forma de llegar a su especialización era abrir el
 * formulario de edición. El encabezado se arma en una función PURA para que
 * la regla del rótulo —el ordinal sale del LUGAR, nunca de `position`— tenga
 * un test sin base.
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const comun = {
  id: "coh_plain",
  name: "Revit — lunes",
  courseName: "Revit",
  startDate: d("2026-03-02"),
  endDate: d("2026-06-29"),
  isSpecialization: false,
  parentCohortId: null,
  position: null,
};

describe("armarEncabezadoDeCohorte", () => {
  it("cohorte común: Académico › cohorte, sin insignia ni vecinos", () => {
    const e = armarEncabezadoDeCohorte(comun, null, []);
    expect(e.title).toBe("Revit — lunes");
    expect(e.crumbs).toEqual([
      { label: "Académico", href: "/academico" },
      { label: "Revit — lunes", href: null },
    ]);
    expect(e.badge).toBeNull();
    expect(e.prev).toBeNull();
    expect(e.next).toBeNull();
    expect(e.startDate).toBe("2026-03-02T00:00:00.000Z");
    expect(e.endDate).toBe("2026-06-29T00:00:00.000Z");
  });

  it("sin nombre propio se rotula con el curso", () => {
    const e = armarEncabezadoDeCohorte({ ...comun, name: null }, null, []);
    expect(e.title).toBe("Revit");
  });

  it("especialización: lleva la insignia", () => {
    const e = armarEncabezadoDeCohorte(
      { ...comun, id: "coh_ebim", name: "EBIM 13", isSpecialization: true },
      null,
      []
    );
    expect(e.badge).toBe("Especialización");
    expect(e.crumbs.map((c) => c.label)).toEqual(["Académico", "EBIM 13"]);
  });

  describe("módulo", () => {
    const madre = { id: "coh_ebim", name: "EBIM 13", courseName: "EBIM" };
    // Posiciones 10/20/30: el rótulo tiene que decir 1, 2 y 3.
    const hermanos = [
      { id: "m3", name: "Coordinación", courseName: "Navis", position: 30, startDate: d("2026-07-01") },
      { id: "m1", name: "Revit Arq", courseName: "Revit", position: 10, startDate: d("2026-03-01") },
      { id: "m2", name: null, courseName: "Revit MEP", position: 20, startDate: d("2026-05-01") },
    ];

    it("miga: Académico › especialización › Módulo N — nombre", () => {
      const e = armarEncabezadoDeCohorte(
        { ...comun, id: "m2", name: null, courseName: "Revit MEP", parentCohortId: "coh_ebim", position: 20 },
        madre,
        hermanos
      );
      expect(e.crumbs).toEqual([
        { label: "Académico", href: "/academico" },
        { label: "EBIM 13", href: "/cohorts/coh_ebim" },
        { label: "Módulo 2 — Revit MEP", href: null },
      ]);
      expect(e.title).toBe("Módulo 2 — Revit MEP");
      expect(e.badge).toBe("Módulo 2 de 3");
      expect(e.prev).toEqual({ href: "/cohorts/m1", label: "Módulo 1" });
      expect(e.next).toEqual({ href: "/cohorts/m3", label: "Módulo 3" });
    });

    it("el primero no tiene anterior; el último no tiene siguiente", () => {
      const primero = armarEncabezadoDeCohorte(
        { ...comun, id: "m1", name: "Revit Arq", parentCohortId: "coh_ebim", position: 10 },
        madre,
        hermanos
      );
      expect(primero.prev).toBeNull();
      expect(primero.next?.href).toBe("/cohorts/m2");

      const ultimo = armarEncabezadoDeCohorte(
        { ...comun, id: "m3", name: "Coordinación", parentCohortId: "coh_ebim", position: 30 },
        madre,
        hermanos
      );
      expect(ultimo.next).toBeNull();
      expect(ultimo.prev?.href).toBe("/cohorts/m2");
    });

    it("un módulo sin posición no inventa número: se rotula con el nombre", () => {
      const e = armarEncabezadoDeCohorte(
        { ...comun, id: "mx", name: "Suelto", parentCohortId: "coh_ebim", position: null },
        madre,
        [...hermanos, { id: "mx", name: "Suelto", courseName: "X", position: null, startDate: d("2026-08-01") }]
      );
      expect(e.title).toBe("Suelto");
      expect(e.badge).toBe("Módulo");
    });

    it("madre inaccesible: la miga no la inventa", () => {
      const e = armarEncabezadoDeCohorte(
        { ...comun, id: "m1", parentCohortId: "coh_ebim", position: 10 },
        null,
        []
      );
      expect(e.crumbs.map((c) => c.label)).toEqual(["Académico", "Revit — lunes"]);
    });
  });
});

describe("encabezadoDeCohorte — lecturas", () => {
  it("una cohorte común se resuelve con UNA consulta (no mira hermanos)", async () => {
    vi.resetModules();
    let consultas = 0;
    const cola: unknown[][] = [[comun]];
    vi.doMock("@/lib/db", () => ({
      getDb: () => ({
        select: () => {
          consultas++;
          const filas = cola.shift() ?? [];
          const chain: Record<string, unknown> = {};
          for (const m of ["from", "innerJoin", "where", "limit"]) chain[m] = () => chain;
          chain.then = (r: (v: unknown) => void) => Promise.resolve(filas).then(r);
          return chain;
        },
      }),
      schema: new Proxy(
        {},
        { get: (_t, t) => new Proxy({}, { get: (_t2, c) => `${String(t)}.${String(c)}` }) }
      ),
    }));
    const { encabezadoDeCohorte } = await import("@/server/cohort-header");
    const e = await encabezadoDeCohorte("org_1", "coh_plain");
    expect(consultas).toBe(1);
    expect(e?.title).toBe("Revit — lunes");
    vi.doUnmock("@/lib/db");
  });
});
