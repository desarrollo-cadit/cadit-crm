import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmacionParaMostrar } from "@/lib/marca-de-confirmacion";

/**
 * 2026-10-27 — Decisión del dueño: "si la especialización está confirmada, el
 * módulo también". NO se escribe `confirmed_at` en los módulos (duplicaría
 * los avisos de facturación T-7/T-2); se LEE la confirmación efectiva
 * (`confirmacionEfectiva`: la propia, o la de la madre) en todo lo que la
 * muestra. Quitar la confirmación de la madre arrastra a los módulos sola,
 * porque no hay nada escrito en ellos.
 */

const madre = {
  id: "coh_madre",
  name: "Especialización BIM 2026",
  confirmedAt: new Date("2026-10-20T12:00:00Z"),
  confirmedBy: { id: "usr_1", name: "Ana" },
};

describe("confirmacionParaMostrar", () => {
  it("un grupo común: la suya, sin especialización", () => {
    const at = new Date("2026-10-21T12:00:00Z");
    expect(confirmacionParaMostrar({ confirmedAt: at, confirmedBy: { id: "u", name: "B" } }, null)).toEqual({
      confirmedAt: at,
      confirmedBy: { id: "u", name: "B" },
      deLaEspecializacion: null,
    });
    expect(confirmacionParaMostrar({ confirmedAt: null, confirmedBy: null }, null)).toEqual({
      confirmedAt: null,
      confirmedBy: null,
      deLaEspecializacion: null,
    });
  });

  it("un módulo sin confirmación propia con la madre confirmada: la de la madre, y se dice de dónde viene", () => {
    expect(confirmacionParaMostrar({ confirmedAt: null, confirmedBy: null }, madre)).toEqual({
      confirmedAt: madre.confirmedAt,
      confirmedBy: madre.confirmedBy,
      deLaEspecializacion: { id: madre.id, name: madre.name },
    });
  });

  it("la madre sin confirmar (o desconfirmada): el módulo tampoco", () => {
    expect(
      confirmacionParaMostrar({ confirmedAt: null, confirmedBy: null }, { ...madre, confirmedAt: null, confirmedBy: null })
    ).toEqual({ confirmedAt: null, confirmedBy: null, deLaEspecializacion: null });
  });

  it("un módulo con confirmación propia (de antes): manda la suya", () => {
    const at = new Date("2026-10-01T12:00:00Z");
    expect(confirmacionParaMostrar({ confirmedAt: at, confirmedBy: null }, madre)).toEqual({
      confirmedAt: at,
      confirmedBy: null,
      deLaEspecializacion: null,
    });
  });
});

describe("dónde se usa", () => {
  const servidor = readFileSync("src/server/cohort-confirmation.ts", "utf8");
  const cursos = readFileSync("src/server/courses.ts", "utf8");
  const ui = readFileSync("src/components/cohorts/cohort-confirmation.tsx", "utf8");

  it("el encabezado del grupo lee la confirmación efectiva", () => {
    expect(servidor).toMatch(/confirmacionParaMostrar\(/);
  });

  it("el listado de Académico y el grupo (DTO) también", () => {
    expect(cursos).toMatch(/confirmacionEfectiva\(cohort\.confirmedAt, confirmacionDeLaMadre\)/);
  });

  it("un módulo no se confirma por separado: el servidor lo rechaza y la pantalla no ofrece el botón", () => {
    expect(servidor).toMatch(/code: "se_confirma_la_especializacion"/);
    expect(ui).toMatch(/estado\.esModulo/);
    expect(ui).toMatch(/deLaEspecializacion/);
  });

  it("no se escribe confirmación en los módulos", () => {
    expect(servidor).not.toMatch(/parentCohortId, cohortId\)[\s\S]{0,200}confirmedAt: now/);
  });
});
