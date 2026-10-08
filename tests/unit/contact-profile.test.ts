import { describe, expect, it } from "vitest";
import { classifyContactProfile, type ProfileFacts } from "@/server/ai/contact-profile";

/**
 * 029 (DV-002) — Quién escribe lo decide el SERVIDOR, antes del modelo.
 *
 * `classifyContactProfile` es la regla pura; `resolveContactProfile` solo junta
 * los hechos de la base (inscripciones con el estado de su cohorte, acceso
 * offline vigente, ficha de profesor por `wa_identity`) y la llama.
 */

const base = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  contact: { firstName: "Laura Gómez", archivedAt: null, hasStaffData: false },
  cohorts: [],
  hasAnyEnrollment: false,
  offlineCourseNames: [],
  teacherId: null,
  ...over,
});

describe("classifyContactProfile", () => {
  it("inscripción en cohorte en curso → alumno con sus cursos activos", () => {
    const p = classifyContactProfile(
      base({
        cohorts: [{ status: "en_curso", courseName: "Revit 2025" }],
        hasAnyEnrollment: true,
      })
    );
    expect(p.kind).toBe("alumno");
    expect(p.activeCourses).toEqual(["Revit 2025"]);
    expect(p.firstName).toBe("Laura");
  });

  it("cohorte planificada también cuenta (todavía no terminó)", () => {
    const p = classifyContactProfile(
      base({ cohorts: [{ status: "planificada", courseName: "AutoCAD" }], hasAnyEnrollment: true })
    );
    expect(p.kind).toBe("alumno");
  });

  it("ex alumno (cohorte finalizada) → lead", () => {
    const p = classifyContactProfile(
      base({ cohorts: [{ status: "finalizada", courseName: "Revit" }], hasAnyEnrollment: true })
    );
    expect(p.kind).toBe("lead");
    expect(p.activeCourses).toEqual([]);
  });

  it("acceso offline vigente → alumno", () => {
    const p = classifyContactProfile(base({ offlineCourseNames: ["Civil 3D offline"] }));
    expect(p.kind).toBe("alumno");
    expect(p.activeCourses).toEqual(["Civil 3D offline"]);
  });

  it("ficha de profesor con su identidad → profesor", () => {
    const p = classifyContactProfile(base({ teacherId: "tch_1" }));
    expect(p).toMatchObject({ kind: "profesor", teacherId: "tch_1", alsoTeacher: false });
  });

  it("alumno que además es profesor → alumno con alsoTeacher", () => {
    const p = classifyContactProfile(
      base({
        cohorts: [{ status: "en_curso", courseName: "Revit" }],
        hasAnyEnrollment: true,
        teacherId: "tch_1",
      })
    );
    expect(p).toMatchObject({ kind: "alumno", alsoTeacher: true, teacherId: "tch_1" });
  });

  it("contacto archivado nunca es alumno", () => {
    const p = classifyContactProfile(
      base({
        contact: { firstName: "Laura", archivedAt: new Date(), hasStaffData: false },
        cohorts: [{ status: "en_curso", courseName: "Revit" }],
        hasAnyEnrollment: true,
      })
    );
    expect(p.kind).not.toBe("alumno");
  });

  it("sin nada → desconocido", () => {
    expect(classifyContactProfile(base()).kind).toBe("desconocido");
  });

  it("datos cargados por el staff, sin inscripción → lead", () => {
    const p = classifyContactProfile(
      base({ contact: { firstName: "Ana", archivedAt: null, hasStaffData: true } })
    );
    expect(p.kind).toBe("lead");
  });

  it("los cursos activos no se repiten", () => {
    const p = classifyContactProfile(
      base({
        cohorts: [
          { status: "en_curso", courseName: "Revit" },
          { status: "planificada", courseName: "Revit" },
        ],
        hasAnyEnrollment: true,
        offlineCourseNames: ["Revit"],
      })
    );
    expect(p.activeCourses).toEqual(["Revit"]);
  });

  it("el resultado no lleva NADA financiero ni de contacto", () => {
    const p = classifyContactProfile(
      base({ cohorts: [{ status: "en_curso", courseName: "Revit" }], hasAnyEnrollment: true })
    );
    expect(Object.keys(p).sort()).toEqual(
      ["activeCourses", "alsoTeacher", "firstName", "kind", "teacherId"].sort()
    );
  });
});
