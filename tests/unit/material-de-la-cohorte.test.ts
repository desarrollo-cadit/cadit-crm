import { describe, expect, it } from "vitest";
import { materialVisibleDeCohorte, type ResourceDto } from "@/server/resources";

/**
 * Lo que ve una cohorte es el programa oficial del CURSO más lo que agregó
 * ESA cohorte. `listResources` pide un alcance por vez a propósito, así que
 * quien muestra el material de una cohorte tiene que unir los dos.
 *
 * El defecto que esto cierra: el profesor publicaba material en su cohorte,
 * el guardado salía bien y la lista recargada no lo mostraba — ni a él ni a
 * sus alumnos —, porque las pantallas pedían solo el material del curso.
 */

function material(id: string, contenedor: Partial<ResourceDto>): ResourceDto {
  return {
    id,
    title: `Material ${id}`,
    url: `https://example.test/${id}`,
    kind: "link",
    position: 0,
    courseId: null,
    cohortId: null,
    classSessionId: null,
    courseModuleId: null,
    ...contenedor,
  } as ResourceDto;
}

describe("materialVisibleDeCohorte", () => {
  it("incluye el material que la cohorte agregó, no solo el del curso", () => {
    const delCurso = [material("r1", { courseId: "crs_1" })];
    const deLaCohorte = [material("r2", { cohortId: "coh_1" })];

    expect(materialVisibleDeCohorte(delCurso, deLaCohorte).map((r) => r.id)).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("el programa oficial va primero y lo de la cohorte después", () => {
    const delCurso = [material("a", { courseId: "crs_1" }), material("b", { courseId: "crs_1" })];
    const deLaCohorte = [material("c", { cohortId: "coh_1" })];

    expect(materialVisibleDeCohorte(delCurso, deLaCohorte).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("una cohorte sin curso asociado igual muestra su propio material", () => {
    const deLaCohorte = [material("r2", { cohortId: "coh_1" })];
    expect(materialVisibleDeCohorte([], deLaCohorte)).toHaveLength(1);
  });

  it("no repite un material aunque llegue por los dos lados", () => {
    const repetido = material("r1", { courseId: "crs_1" });
    expect(materialVisibleDeCohorte([repetido], [repetido])).toHaveLength(1);
  });
});
