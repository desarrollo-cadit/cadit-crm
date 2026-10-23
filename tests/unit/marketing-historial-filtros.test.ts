import { describe, expect, it } from "vitest";
import type { AudienceFilters } from "@/lib/marketing/audience";
import {
  contactosQueCumplen,
  cumpleFiltrosDeHistorial,
  tieneFiltrosDeHistorial,
} from "@/lib/marketing/historial-filtros";
import { historialesComerciales, type CursadaComercial, type EntradaDeHistorial } from "@/lib/recorrido-comercial";

/**
 * 046 (T026; US4, FR-008…FR-010) — Los filtros de historial de las audiencias,
 * evaluados sobre la MISMA derivación que la ficha (`historialesComerciales`).
 */

const NOW = new Date("2026-10-23T12:00:00Z");
const ctx = { rutas: new Map([["arq", ["mep", "est"]]]), now: NOW };
const f = (x: Omit<AudienceFilters, "v">): AudienceFilters => ({ v: 1, ...x });

let n = 0;
function cursada(contactId: string, courseId: string, p: Partial<CursadaComercial> = {}): CursadaComercial {
  n++;
  return {
    enrollmentId: `e${n}`,
    contactId,
    parentEnrollmentId: null,
    courseId,
    courseName: courseId,
    courseKind: "curso",
    categoryId: courseId === "nav" ? "cat_coord" : "cat_bim",
    cohortId: `g${n}`,
    cohortName: "Grupo",
    startDate: new Date("2025-03-01"),
    endDate: new Date("2025-05-01"),
    stageKind: "open",
    nuncaDictada: false,
    aprobacion: "aprobado",
    certificadoVigente: false,
    ...p,
  };
}

const historialDe = (filas: CursadaComercial[], id = "ct"): EntradaDeHistorial[] =>
  historialesComerciales(filas, NOW).get(id) ?? [];

describe("tieneFiltrosDeHistorial", () => {
  it("solo con alguna clave de historial", () => {
    expect(tieneFiltrosDeHistorial(f({ courseIds: ["arq"] }))).toBe(false);
    expect(tieneFiltrosDeHistorial(f({ historyNotDoneCourseIds: ["mep"] }))).toBe(true);
    expect(tieneFiltrosDeHistorial(f({ historyRecent: { months: 3 } }))).toBe(true);
  });
});

describe("cumpleFiltrosDeHistorial — cada filtro", () => {
  const aprobo = historialDe([cursada("ct", "arq")]);
  const reprobo = historialDe([cursada("ct", "arq", { aprobacion: "reprobado" })]);
  const porEmpezar = historialDe([
    cursada("ct", "arq", { startDate: new Date("2026-11-10"), endDate: new Date("2027-01-10") }),
  ]);

  it("cursó: aprobó o cursó sin aprobar sí; por empezar no", () => {
    const filtro = f({ historyTakenCourseIds: ["arq"] });
    expect(cumpleFiltrosDeHistorial(aprobo, filtro, ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(reprobo, filtro, ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(porEmpezar, filtro, ctx)).toBe(false);
  });

  it("aprobó / cursó sin aprobar", () => {
    expect(cumpleFiltrosDeHistorial(aprobo, f({ historyApprovedCourseIds: ["arq"] }), ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(reprobo, f({ historyApprovedCourseIds: ["arq"] }), ctx)).toBe(false);
    expect(cumpleFiltrosDeHistorial(reprobo, f({ historyNotApprovedCourseIds: ["arq"] }), ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(aprobo, f({ historyNotApprovedCourseIds: ["arq"] }), ctx)).toBe(false);
  });

  it("no hizo: inscripto por empezar YA cuenta como hecho", () => {
    expect(cumpleFiltrosDeHistorial(porEmpezar, f({ historyNotDoneCourseIds: ["arq"] }), ctx)).toBe(false);
    expect(cumpleFiltrosDeHistorial(aprobo, f({ historyNotDoneCourseIds: ["mep"] }), ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial([], f({ historyNotDoneCourseIds: ["mep"] }), ctx)).toBe(true);
  });

  it("un grupo que nunca se dictó no cuenta como cursado (FR-002 en segmentos)", () => {
    const h = historialDe([cursada("ct", "arq", { nuncaDictada: true })]);
    expect(cumpleFiltrosDeHistorial(h, f({ historyTakenCourseIds: ["arq"] }), ctx)).toBe(false);
    expect(cumpleFiltrosDeHistorial(h, f({ historyNotDoneCourseIds: ["arq"] }), ctx)).toBe(true);
  });

  it("últimos N meses, por curso o por categoría", () => {
    const reciente = historialDe([
      cursada("ct", "nav", { startDate: new Date("2026-06-01"), endDate: new Date("2026-08-01") }),
    ]);
    expect(cumpleFiltrosDeHistorial(reciente, f({ historyRecent: { months: 6 } }), ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(reciente, f({ historyRecent: { months: 3 } }), ctx)).toBe(false);
    expect(
      cumpleFiltrosDeHistorial(reciente, f({ historyRecent: { months: 12, categoryIds: ["cat_coord"] } }), ctx)
    ).toBe(true);
    expect(
      cumpleFiltrosDeHistorial(reciente, f({ historyRecent: { months: 12, categoryIds: ["cat_bim"] } }), ctx)
    ).toBe(false);
    expect(
      cumpleFiltrosDeHistorial(reciente, f({ historyRecent: { months: 12, courseIds: ["nav"] } }), ctx)
    ).toBe(true);
    expect(cumpleFiltrosDeHistorial(aprobo, f({ historyRecent: { months: 12 } }), ctx)).toBe(false);
  });

  it("atajo: siguiente paso de la ruta = cursó X y no hizo ninguno de sus siguientes (FR-009)", () => {
    const filtro = f({ historyNextStepOfCourseId: "arq" });
    expect(cumpleFiltrosDeHistorial(aprobo, filtro, ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(historialDe([cursada("ct", "arq"), cursada("ct", "est")]), filtro, ctx)).toBe(
      false
    );
    // Sin siguientes cargados: alcanza con haberlo cursado.
    expect(cumpleFiltrosDeHistorial(historialDe([cursada("ct", "nav")]), f({ historyNextStepOfCourseId: "nav" }), ctx)).toBe(
      true
    );
  });
});

describe("contactosQueCumplen — «aprobaron A y no hicieron B» (US4-1)", () => {
  const filas: CursadaComercial[] = [];
  for (let i = 0; i < 10; i++) filas.push(cursada(`ct${i}`, "arq"));
  for (let i = 0; i < 3; i++) filas.push(cursada(`ct${i}`, "mep", { aprobacion: "pendiente" }));
  filas.push(cursada("otro", "nav"));
  const historiales = historialesComerciales(filas, NOW);

  it("10 aprobaron A, 3 ya con B → la audiencia trae a los 7 restantes", () => {
    const r = contactosQueCumplen(
      historiales,
      f({ historyApprovedCourseIds: ["arq"], historyNotDoneCourseIds: ["mep"] }),
      ctx
    );
    expect(r.modo).toBe("incluir");
    expect([...r.ids].sort()).toEqual(["ct3", "ct4", "ct5", "ct6", "ct7", "ct8", "ct9"]);
  });

  it("solo «no hizo B» alcanza a quien no tiene historial: se expresa como exclusión", () => {
    const r = contactosQueCumplen(historiales, f({ historyNotDoneCourseIds: ["mep"] }), ctx);
    expect(r.modo).toBe("excluir");
    expect([...r.ids].sort()).toEqual(["ct0", "ct1", "ct2"]);
  });
});

describe("cursadas históricas (046 US6, FR-021)", () => {
  const h =
    historialesComerciales([], NOW, [
      {
        contactId: "ct",
        courseId: "arq",
        courseLabel: "arq",
        courseName: "arq",
        categoryId: "cat_bim",
        takenOn: new Date("2026-03-01T00:00:00Z"),
        edition: null,
      },
    ]).get("ct") ?? [];

  it("cuentan para cursó, no hizo y últimos N meses", () => {
    expect(cumpleFiltrosDeHistorial(h, f({ historyTakenCourseIds: ["arq"] }), ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(h, f({ historyNotDoneCourseIds: ["arq"] }), ctx)).toBe(false);
    expect(cumpleFiltrosDeHistorial(h, f({ historyRecent: { months: 12, categoryIds: ["cat_bim"] } }), ctx)).toBe(
      true
    );
    expect(cumpleFiltrosDeHistorial(h, f({ historyNextStepOfCourseId: "arq" }), ctx)).toBe(true);
  });

  it("nunca para aprobó ni cursó sin aprobar (no se sabe)", () => {
    expect(cumpleFiltrosDeHistorial(h, f({ historyApprovedCourseIds: ["arq"] }), ctx)).toBe(false);
    expect(cumpleFiltrosDeHistorial(h, f({ historyNotApprovedCourseIds: ["arq"] }), ctx)).toBe(false);
  });
});

describe("tipo de contacto (046 US7, FR-025)", () => {
  const exalumno = historialDe([cursada("ct", "arq")]);
  const activo = historialDe([
    cursada("ct", "arq", { startDate: new Date("2026-11-10"), endDate: new Date("2027-01-10") }),
  ]);

  it("filtra por tipo, derivado del historial", () => {
    expect(cumpleFiltrosDeHistorial(exalumno, f({ contactTypes: ["exalumno"] }), ctx)).toBe(true);
    expect(cumpleFiltrosDeHistorial(activo, f({ contactTypes: ["exalumno"] }), ctx)).toBe(false);
    expect(cumpleFiltrosDeHistorial(activo, f({ contactTypes: ["alumno_activo", "exalumno"] }), ctx)).toBe(true);
  });

  it("lead alcanza a quien no tiene historial (se expresa como exclusión)", () => {
    expect(tieneFiltrosDeHistorial(f({ contactTypes: ["lead"] }))).toBe(true);
    expect(cumpleFiltrosDeHistorial([], f({ contactTypes: ["lead"] }), ctx)).toBe(true);
    const r = contactosQueCumplen(historialesComerciales([cursada("x", "arq")], NOW), f({ contactTypes: ["lead"] }), ctx);
    expect(r).toEqual({ modo: "excluir", ids: ["x"] });
  });
});
