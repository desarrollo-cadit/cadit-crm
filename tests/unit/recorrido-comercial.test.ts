import { describe, expect, it } from "vitest";
import {
  esCursado,
  etiquetaDeEntrada,
  historialesComerciales,
  type CursadaComercial,
} from "@/lib/recorrido-comercial";

/**
 * 046 (T006; FR-001…FR-003, SC-003) — LA derivación del historial comercial.
 * La usan la ficha, las sugerencias, las audiencias y Recompra.
 */

const NOW = new Date("2026-10-23T12:00:00Z");

let n = 0;
function cursada(p: Partial<CursadaComercial> = {}): CursadaComercial {
  n++;
  return {
    enrollmentId: `enr_${n}`,
    contactId: "ct_ana",
    parentEnrollmentId: null,
    courseId: "crs_arq",
    courseName: "Revit Arquitectura",
    courseKind: "curso",
    categoryId: "cat_bim",
    cohortId: `coh_${n}`,
    cohortName: "Revit Arquitectura — Marzo",
    startDate: new Date("2025-03-01"),
    endDate: new Date("2025-05-01"),
    stageKind: "open",
    nuncaDictada: false,
    aprobacion: "aprobado",
    certificadoVigente: false,
    ...p,
  };
}

const deAna = (filas: CursadaComercial[]) => historialesComerciales(filas, NOW).get("ct_ana") ?? [];

describe("historialesComerciales — estados (FR-001)", () => {
  it("aprobó, cursó sin aprobar, en curso y por empezar", () => {
    const h = deAna([
      cursada({ courseId: "a", courseName: "A", aprobacion: "aprobado" }),
      cursada({ courseId: "b", courseName: "B", aprobacion: "reprobado" }),
      cursada({
        courseId: "c",
        courseName: "C",
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-12-01"),
        aprobacion: "pendiente",
      }),
      cursada({
        courseId: "d",
        courseName: "D",
        startDate: new Date("2026-11-10"),
        endDate: new Date("2027-01-10"),
        aprobacion: "sin_datos",
      }),
    ]);
    const porCurso = Object.fromEntries(h.map((e) => [e.courseId, e.estado]));
    expect(porCurso).toEqual({
      a: "aprobo",
      b: "curso_sin_aprobar",
      c: "en_curso",
      d: "por_empezar",
    });
  });

  it("un grupo que nunca se dictó no cuenta (FR-002, SC-003)", () => {
    expect(deAna([cursada({ nuncaDictada: true })])).toEqual([]);
  });

  it("un taller no cuenta (FR-003)", () => {
    expect(deAna([cursada({ courseKind: "taller" })])).toEqual([]);
  });

  it("certificado vigente = aprobó aunque no haya datos", () => {
    const [e] = deAna([cursada({ aprobacion: "sin_datos", certificadoVigente: true })]);
    expect(e?.estado).toBe("aprobo");
  });

  it("terminado sin datos = cursó sin aprobar, marcado sin resultado", () => {
    const [e] = deAna([cursada({ aprobacion: "sin_datos" })]);
    expect(e?.estado).toBe("curso_sin_aprobar");
    expect(e?.sinResultado).toBe(true);
    expect(etiquetaDeEntrada(e!)).toBe("Cursó · sin resultado cargado");
  });

  it("abandonó antes de empezar no cuenta; abandonó a mitad = cursó sin aprobar", () => {
    expect(
      deAna([
        cursada({
          stageKind: "lost",
          startDate: new Date("2026-11-10"),
          endDate: new Date("2027-01-10"),
        }),
      ])
    ).toEqual([]);
    const [e] = deAna([
      cursada({
        stageKind: "lost",
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-12-01"),
        aprobacion: "pendiente",
      }),
    ]);
    expect(e?.estado).toBe("curso_sin_aprobar");
  });

  it("separa por contacto", () => {
    const m = historialesComerciales(
      [cursada({ contactId: "ct_1" }), cursada({ contactId: "ct_2", courseId: "x" })],
      NOW
    );
    expect([...m.keys()].sort()).toEqual(["ct_1", "ct_2"]);
  });
});

describe("historialesComerciales — especialización (FR-003)", () => {
  it("figura una vez, como especialización, con cuántos módulos aprobó", () => {
    const madre = cursada({ courseId: "ebim", courseName: "Especialización BIM", aprobacion: "sin_datos" });
    const h = deAna([
      madre,
      cursada({ parentEnrollmentId: madre.enrollmentId, courseId: "m1", courseKind: "modulo", aprobacion: "aprobado" }),
      cursada({ parentEnrollmentId: madre.enrollmentId, courseId: "m2", courseKind: "modulo", aprobacion: "aprobado" }),
      cursada({ parentEnrollmentId: madre.enrollmentId, courseId: "m3", courseKind: "modulo", aprobacion: "reprobado" }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      courseId: "ebim",
      estado: "curso_sin_aprobar",
      especializacion: { modulosAprobados: 2, modulosTotal: 3 },
    });
  });

  it("todos los módulos aprobados → aprobó (composición de programApprovalState)", () => {
    const madre = cursada({ courseId: "ebim", aprobacion: "sin_datos" });
    const [e] = deAna([
      madre,
      cursada({ parentEnrollmentId: madre.enrollmentId, courseId: "m1", courseKind: "modulo" }),
      cursada({ parentEnrollmentId: madre.enrollmentId, courseId: "m2", courseKind: "modulo" }),
    ]);
    expect(e?.estado).toBe("aprobo");
    expect(e?.sinResultado).toBe(false);
  });
});

describe("historialesComerciales — recursada (edge case)", () => {
  it("una entrada por curso, con el mejor resultado y cuántas veces", () => {
    const h = deAna([
      cursada({ aprobacion: "reprobado", startDate: new Date("2024-03-01"), endDate: new Date("2024-05-01") }),
      cursada({ aprobacion: "aprobado", startDate: new Date("2025-03-01"), endDate: new Date("2025-05-01") }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ estado: "aprobo", veces: 2 });
    expect(h[0]?.primerInicio.toISOString().slice(0, 10)).toBe("2024-03-01");
    expect(h[0]?.ultimoInicioCursado?.toISOString().slice(0, 10)).toBe("2025-03-01");
  });

  it("el historial sale ordenado del más reciente al más viejo", () => {
    const h = deAna([
      cursada({ courseId: "viejo", startDate: new Date("2023-01-01"), endDate: new Date("2023-03-01") }),
      cursada({ courseId: "nuevo", startDate: new Date("2025-01-01"), endDate: new Date("2025-03-01") }),
    ]);
    expect(h.map((e) => e.courseId)).toEqual(["nuevo", "viejo"]);
  });

  it("por empezar no es «cursado»; los otros tres sí", () => {
    expect(esCursado("por_empezar")).toBe(false);
    expect(esCursado("en_curso")).toBe(true);
    expect(esCursado("aprobo")).toBe(true);
    expect(esCursado("curso_sin_aprobar")).toBe(true);
  });
});
