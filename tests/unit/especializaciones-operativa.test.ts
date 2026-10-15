import { describe, expect, it } from "vitest";
import { decidirSalidaDeModulo } from "@/lib/module-auto-enroll";
import { licenciasRepetidasEnRecorrido, resumirLicencias } from "@/lib/license-rules";

/**
 * 034 — Las dos reglas puras que quedan entre US1 y US5: sacar a alguien de
 * un módulo (FR-004) y la advertencia del mismo programa en el paquete y en
 * el módulo (edge case de licencias).
 */

const SIN_HISTORIA = {
  esHija: true,
  asistencias: 0,
  resultados: 0,
  entregas: 0,
  certificados: 0,
  cuotas: 0,
  licencias: 0,
};

describe("decidirSalidaDeModulo (FR-004)", () => {
  it("una hija sin historia se borra, sin tocar la madre", () => {
    expect(decidirSalidaDeModulo(SIN_HISTORIA)).toEqual({ ok: true, licenciasLiberadas: 0 });
  });

  it("dice cuántas licencias del módulo se liberan", () => {
    expect(decidirSalidaDeModulo({ ...SIN_HISTORIA, licencias: 2 })).toEqual({
      ok: true,
      licenciasLiberadas: 2,
    });
  });

  it("una inscripción que NO es hija no se saca con esta acción", () => {
    expect(decidirSalidaDeModulo({ ...SIN_HISTORIA, esHija: false })).toEqual(
      expect.objectContaining({ ok: false, code: "no_es_una_cursada_de_modulo" })
    );
  });

  it("con historia no se borra: se nombra qué hay y se ofrece mudarla", () => {
    const r = decidirSalidaDeModulo({ ...SIN_HISTORIA, asistencias: 3, resultados: 1 });
    expect(r).toEqual(expect.objectContaining({ ok: false, code: "modulo_con_historia" }));
    if (!r.ok) {
      expect(r.message).toMatch(/3 asistencias/);
      expect(r.message).toMatch(/1 nota/);
    }
  });

  it("una cuota (recursada paga) también es historia: la plata no se borra", () => {
    expect(decidirSalidaDeModulo({ ...SIN_HISTORIA, cuotas: 1 }).ok).toBe(false);
    expect(decidirSalidaDeModulo({ ...SIN_HISTORIA, certificados: 1 }).ok).toBe(false);
    expect(decidirSalidaDeModulo({ ...SIN_HISTORIA, entregas: 1 }).ok).toBe(false);
  });
});

describe("licenciasRepetidasEnRecorrido", () => {
  it("avisa del programa que está en el paquete Y en el módulo", () => {
    expect(
      licenciasRepetidasEnRecorrido(
        [
          { softwareId: "sw_revit", softwareName: "Revit" },
          { softwareId: "sw_acad", softwareName: "AutoCAD" },
        ],
        [{ softwareId: "sw_revit", softwareName: "Revit" }]
      )
    ).toEqual(["Revit"]);
  });

  it("sin coincidencias no hay nada que advertir", () => {
    expect(
      licenciasRepetidasEnRecorrido(
        [{ softwareId: "sw_acad", softwareName: "AutoCAD" }],
        [{ softwareId: "sw_revit", softwareName: "Revit" }]
      )
    ).toEqual([]);
  });
});

describe("resumirLicencias", () => {
  it("cuenta sólo las asignadas y conserva el primer software para la forma vieja", () => {
    expect(
      resumirLicencias([
        { softwareId: "sw_a", assigned: false },
        { softwareId: "sw_b", assigned: true },
        { softwareId: "sw_c", assigned: true },
      ])
    ).toEqual({
      licenseAssigned: true,
      licenseSoftwareId: "sw_b",
      licenseSoftwareIds: ["sw_b", "sw_c"],
    });
  });

  it("sin licencias asignadas queda como antes: false y null", () => {
    expect(resumirLicencias([])).toEqual({
      licenseAssigned: false,
      licenseSoftwareId: null,
      licenseSoftwareIds: [],
    });
  });
});
