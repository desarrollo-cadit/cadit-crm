import { describe, expect, it } from "vitest";
import {
  controlIndividualDeCurso,
  courseStatesFor,
  overrideIndividualPermitido,
  type CourseState,
} from "@/server/offline-courses/logic";

/**
 * 035 (US2, FR-009/FR-011/FR-012) — Un curso offline asignado al grupo no se
 * otorga ni se quita por alumno. Las quitas de antes se conservan como
 * "Excepción anterior" y sólo se pueden borrar.
 */

const curso = (over: Partial<CourseState>): CourseState => ({
  courseId: "oc_1",
  title: "Fundamentos BIM",
  state: "none",
  cohortHas: false,
  override: null,
  ...over,
});

describe("overrideIndividualPermitido (FR-009)", () => {
  it("con el curso en el grupo, ni otorgar ni quitar", () => {
    expect(overrideIndividualPermitido(true, "grant")).toBe(false);
    expect(overrideIndividualPermitido(true, "revoke")).toBe(false);
  });

  it("con el curso en el grupo, BORRAR una excepción anterior sí", () => {
    expect(overrideIndividualPermitido(true, "clear")).toBe(true);
  });

  it("un curso que el grupo no tiene se maneja por alumno como siempre", () => {
    expect(overrideIndividualPermitido(false, "grant")).toBe(true);
    expect(overrideIndividualPermitido(false, "revoke")).toBe(true);
    expect(overrideIndividualPermitido(false, "clear")).toBe(true);
  });
});

describe("controlIndividualDeCurso (FR-012)", () => {
  it("heredado del grupo → 'Asignado al grupo', sin control", () => {
    expect(controlIndividualDeCurso(curso({ state: "inherited", cohortHas: true }))).toEqual({
      kind: "grupo",
    });
  });

  it("quitado antes de la 035 sobre un curso del grupo → excepción anterior", () => {
    expect(
      controlIndividualDeCurso(curso({ state: "revoked", cohortHas: true, override: "revoke" }))
    ).toEqual({ kind: "excepcion_anterior" });
  });

  it("un otorgamiento redundante (no debería quedar ninguno) se muestra como del grupo", () => {
    expect(
      controlIndividualDeCurso(curso({ state: "granted", cohortHas: true, override: "grant" }))
    ).toEqual({ kind: "grupo" });
  });

  it("sin el curso en el grupo: agregar o quitar individualmente", () => {
    expect(controlIndividualDeCurso(curso({ state: "none" }))).toEqual({
      kind: "individual",
      label: "Agregar",
      action: "grant",
    });
    expect(controlIndividualDeCurso(curso({ state: "granted", override: "grant" }))).toEqual({
      kind: "individual",
      label: "Quitar",
      action: "clear",
    });
  });

  it("una revocación sobre un curso que la cohorte NO tiene no es excepción: es nada", () => {
    expect(controlIndividualDeCurso(curso({ state: "none", override: "revoke" }))).toEqual({
      kind: "individual",
      label: "Agregar",
      action: "grant",
    });
  });

  it("encaja con courseStatesFor", () => {
    const [estado] = courseStatesFor([{ id: "oc_1", title: "BIM" }], {
      cohortCourseIds: ["oc_1"],
      overrides: [],
    });
    expect(controlIndividualDeCurso(estado!)).toEqual({ kind: "grupo" });
  });
});
