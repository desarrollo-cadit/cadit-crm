import { describe, expect, it } from "vitest";
import { accesoOfflineDeContacto, pickVigentes } from "@/server/offline-courses/logic";
import {
  diaDeAccesoSchema,
  planAsignacionIndividual,
  planAsignacionPorEmpresa,
} from "@/lib/offline-grants";

/**
 * 043 — Cursos offline: acceso por cohorte (con vencimiento) ∪ acceso directo
 * a una persona (con fecha propia, sin inscripción).
 */

const vigente = { vencido: false, hasta: "2026-12-01" };
const vencido = { vencido: true, hasta: "2026-09-01" };
const sinFecha = { vencido: false, hasta: null };

const inscripcion = (
  id: string,
  acceso: { vencido: boolean; hasta: string | null },
  cohortCourseIds: string[],
  overrides: Array<{ courseId: string; mode: "grant" | "revoke" }> = []
) => ({ id, createdAt: new Date("2026-01-01"), input: { cohortCourseIds, overrides }, acceso });

describe("043 — la unión de accesos offline", () => {
  it("una cohorte vencida no da nada: ni lo heredado ni lo otorgado a esa inscripción", () => {
    const r = accesoOfflineDeContacto(
      [inscripcion("e1", vencido, ["A"], [{ courseId: "B", mode: "grant" }])],
      []
    );
    expect([...r.keys()]).toEqual([]);
  });

  it("una cohorte vigente da lo suyo, con su fecha", () => {
    const r = accesoOfflineDeContacto([inscripcion("e1", vigente, ["A"])], []);
    expect(r.get("A")).toBe("2026-12-01");
  });

  it("la quita de 035 sigue valiendo dentro de la cohorte", () => {
    const r = accesoOfflineDeContacto(
      [inscripcion("e1", vigente, ["A"], [{ courseId: "A", mode: "revoke" }])],
      []
    );
    expect(r.has("A")).toBe(false);
  });

  it("un acceso directo vigente da el curso aunque una cohorte lo haya quitado", () => {
    const r = accesoOfflineDeContacto(
      [inscripcion("e1", vigente, ["A"], [{ courseId: "A", mode: "revoke" }])],
      [{ courseId: "A", hasta: "2026-11-01", vencido: false }]
    );
    expect(r.get("A")).toBe("2026-11-01");
  });

  it("un acceso directo vencido no da nada", () => {
    const r = accesoOfflineDeContacto([], [{ courseId: "A", hasta: "2026-01-01", vencido: true }]);
    expect(r.size).toBe(0);
  });

  it("varias fuentes del mismo curso: gana la fecha más tarde; sin fecha gana a todas", () => {
    const r = accesoOfflineDeContacto(
      [inscripcion("e1", vigente, ["A", "B"]), inscripcion("e2", sinFecha, ["B"])],
      [{ courseId: "A", hasta: "2027-03-01", vencido: false }]
    );
    expect(r.get("A")).toBe("2027-03-01");
    expect(r.get("B")).toBeNull();
  });

  it("pickVigentes deja sólo las inscripciones con acceso, con sus cursos efectivos", () => {
    const v = pickVigentes([
      inscripcion("e1", vencido, ["A"]),
      inscripcion("e2", vigente, ["B"], [{ courseId: "C", mode: "grant" }]),
    ]);
    expect(v.map((e) => e.id)).toEqual(["e2"]);
    expect(v[0]!.courseIds.sort()).toEqual(["B", "C"]);
  });
});

describe("043 — asignar a una persona", () => {
  it("sin acceso activo: se crea", () => {
    expect(planAsignacionIndividual(null, "2026-12-31")).toEqual({ kind: "insert" });
  });
  it("con acceso activo: se cambia la fecha (más tarde o más temprano)", () => {
    expect(planAsignacionIndividual({ id: "g1", hasta: "2026-11-01" }, "2026-12-31")).toEqual({
      kind: "update",
      id: "g1",
    });
    expect(planAsignacionIndividual({ id: "g1", hasta: "2026-11-01" }, "2026-10-01")).toEqual({
      kind: "update",
      id: "g1",
    });
  });
  it("la misma fecha no escribe", () => {
    expect(planAsignacionIndividual({ id: "g1", hasta: "2026-11-01" }, "2026-11-01")).toEqual({
      kind: "none",
    });
  });
});

describe("043 — asignar a toda una empresa", () => {
  const personas = [
    { id: "c1", name: "Ana" },
    { id: "c2", name: "Bruno" },
    { id: "c3", name: "Carla" },
    { id: "c4", name: "Diego" },
  ];
  const activos = [
    { id: "g2", contactId: "c2", hasta: "2026-11-30" },
    { id: "g3", contactId: "c3", hasta: "2027-06-30" },
  ];

  it("crea para quien no tiene, extiende sólo si la fecha nueva es posterior, no toca al resto", () => {
    const plan = planAsignacionPorEmpresa(personas, activos, "2026-12-31", ["c4"]);
    expect(plan.crear.map((p) => p.contactId)).toEqual(["c1", "c4"]);
    expect(plan.crear.find((p) => p.contactId === "c4")?.antesQuitado).toBe(true);
    expect(plan.extender).toEqual([
      { grantId: "g2", contactId: "c2", name: "Bruno", desde: "2026-11-30" },
    ]);
    expect(plan.sinCambios).toEqual([
      { grantId: "g3", contactId: "c3", name: "Carla", hasta: "2027-06-30" },
    ]);
  });

  it("es idempotente: aplicar el plan y volver a planear no deja nada por hacer", () => {
    const despues = [
      ...activos.map((a) => (a.contactId === "c2" ? { ...a, hasta: "2026-12-31" } : a)),
      { id: "g1", contactId: "c1", hasta: "2026-12-31" },
      { id: "g4", contactId: "c4", hasta: "2026-12-31" },
    ];
    const plan = planAsignacionPorEmpresa(personas, despues, "2026-12-31", []);
    expect(plan.crear).toEqual([]);
    expect(plan.extender).toEqual([]);
    expect(plan.sinCambios).toHaveLength(4);
  });

  it("una empresa sin personas: plan vacío", () => {
    expect(planAsignacionPorEmpresa([], [], "2026-12-31", [])).toEqual({
      crear: [],
      extender: [],
      sinCambios: [],
    });
  });
});

describe("043 — la fecha que llega del navegador", () => {
  it("acepta un día real y rechaza el resto", () => {
    expect(diaDeAccesoSchema.safeParse("2026-12-31").success).toBe(true);
    expect(diaDeAccesoSchema.safeParse("2026-02-30").success).toBe(false);
    expect(diaDeAccesoSchema.safeParse("31/12/2026").success).toBe(false);
    expect(diaDeAccesoSchema.safeParse(null).success).toBe(false);
  });
});
