import { describe, expect, it } from "vitest";
import {
  cohortesInscribibles,
  etiquetaDeCohorte,
  type CohorteInscribible,
} from "@/lib/cohortes-inscribibles";

/**
 * Inscribir desde el contacto — el selector de cohorte del formulario de
 * inscripción cuando no se abrió desde una cohorte.
 *
 * Qué NO se ofrece:
 * - Las finalizadas: inscribir a alguien en una cursada que ya terminó es,
 *   casi siempre, un clic equivocado.
 * - Los MÓDULOS de una especialización (`parentCohortId`): el servidor
 *   rechaza una inscripción suelta contra un módulo (028, FR-010), así que
 *   ofrecerlos sería ofrecer un 422.
 */

function cohorte(over: Partial<CohorteInscribible> & { id: string }): CohorteInscribible {
  return {
    courseName: "Revit",
    name: null,
    startDate: "2026-10-01T00:00:00.000Z",
    status: "planificada",
    parentCohortId: null,
    ...over,
  };
}

describe("cohortesInscribibles", () => {
  it("deja afuera las cohortes finalizadas", () => {
    const res = cohortesInscribibles([
      cohorte({ id: "a", status: "finalizada" }),
      cohorte({ id: "b", status: "en_curso" }),
      cohorte({ id: "c", status: "planificada" }),
    ]);
    expect(res.map((c) => c.id).sort()).toEqual(["b", "c"]);
  });

  it("deja afuera los módulos de una especialización", () => {
    const res = cohortesInscribibles([
      cohorte({ id: "madre" }),
      cohorte({ id: "modulo", parentCohortId: "madre" }),
    ]);
    expect(res.map((c) => c.id)).toEqual(["madre"]);
  });

  it("ordena por fecha de inicio, la más próxima primero", () => {
    const res = cohortesInscribibles([
      cohorte({ id: "tarde", startDate: "2026-12-01T00:00:00.000Z" }),
      cohorte({ id: "ya", startDate: "2026-08-01T00:00:00.000Z", status: "en_curso" }),
      cohorte({ id: "pronto", startDate: "2026-10-15T00:00:00.000Z" }),
    ]);
    expect(res.map((c) => c.id)).toEqual(["ya", "pronto", "tarde"]);
  });

  it("no muta la lista original", () => {
    const original = [
      cohorte({ id: "b", startDate: "2026-12-01T00:00:00.000Z" }),
      cohorte({ id: "a", startDate: "2026-01-01T00:00:00.000Z" }),
    ];
    cohortesInscribibles(original);
    expect(original.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("etiquetaDeCohorte", () => {
  it("sin nombre propio, usa el nombre del curso", () => {
    expect(etiquetaDeCohorte({ courseName: "Revit", name: null })).toBe("Revit");
  });

  it("con nombre propio, muestra curso y cohorte", () => {
    expect(etiquetaDeCohorte({ courseName: "Revit", name: "Noche" })).toBe("Revit — Noche");
  });

  it("no repite el curso si el nombre de la cohorte ya es ese", () => {
    expect(etiquetaDeCohorte({ courseName: "Revit", name: "Revit" })).toBe("Revit");
  });
});
