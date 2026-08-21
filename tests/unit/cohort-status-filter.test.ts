import { describe, expect, it } from "vitest";
import { nextStatusFilter } from "@/components/academic/academic-client";

type Status = "planificada" | "en_curso" | "finalizada";
const ALL: Status[] = ["planificada", "en_curso", "finalizada"];
const set = (...s: Status[]) => new Set<Status>(s);
const sorted = (s: Set<Status>) => [...s].sort();

/**
 * 007 — La PRIMERA versión de este filtro invertía la selección: con los tres
 * estados activos, tocar "Planificada" dejaba "En curso" y "Finalizada". El
 * usuario lo reportó como "funciona mal mal", y ni typecheck ni build lo
 * podían ver porque era lógica de interacción. Estos casos existen para que
 * no vuelva a pasar.
 */
describe("nextStatusFilter", () => {
  it("desde TODAS, tocar un estado deja SOLO ese (el bug reportado)", () => {
    expect(sorted(nextStatusFilter(set(...ALL), "planificada"))).toEqual(["planificada"]);
    expect(sorted(nextStatusFilter(set(...ALL), "finalizada"))).toEqual(["finalizada"]);
  });

  it("suma estados de a uno", () => {
    const uno = nextStatusFilter(set(...ALL), "planificada");
    const dos = nextStatusFilter(uno, "en_curso");
    expect(sorted(dos)).toEqual(["en_curso", "planificada"]);
  });

  it("saca un estado ya seleccionado", () => {
    expect(sorted(nextStatusFilter(set("planificada", "en_curso"), "en_curso"))).toEqual([
      "planificada",
    ]);
  });

  it("quedarse sin ninguno equivale a no filtrar: vuelve a todas", () => {
    expect(sorted(nextStatusFilter(set("planificada"), "planificada"))).toEqual(sorted(set(...ALL)));
  });

  it("no muta el conjunto original", () => {
    const original = set("planificada", "en_curso");
    nextStatusFilter(original, "finalizada");
    expect(sorted(original)).toEqual(["en_curso", "planificada"]);
  });
});
