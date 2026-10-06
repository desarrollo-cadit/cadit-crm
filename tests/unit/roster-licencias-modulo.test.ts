import { describe, expect, it, vi } from "vitest";

/**
 * 2026-10-05 (decisión del dueño) — Licencias desde el roster de una
 * especialización.
 *
 * La especialización (la cohorte madre) no tiene software a propósito: el
 * software es de cada módulo. Por eso el roster de la madre no ofrecía
 * "Licencia: asignar…", y el equipo tildaba "Software instalado" creyendo
 * que descontaba stock.
 *
 * Ahora cada alumno muestra UNA línea por módulo. La licencia se asigna a la
 * inscripción HIJA de ese módulo —no a la madre— con el software de ESE
 * módulo: alguien puede necesitar Revit en uno y Navisworks en otro, y
 * `license.enrollment_id` es UNIQUE.
 */

vi.mock("@/lib/db", () => ({
  getDb: () => ({}),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));

const MODULOS = [
  { id: "coh_m1", name: "Módulo 1 — Revit", courseId: "crs_1", courseName: "Revit" },
  { id: "coh_m2", name: null, courseId: "crs_2", courseName: "Navisworks" },
  { id: "coh_m3", name: "Módulo 3 — Teoría", courseId: "crs_3", courseName: "Teoría BIM" },
];

const SOFTWARE = new Map([
  ["coh_m1", [{ id: "sw_revit", name: "Revit" }]],
  ["coh_m2", [{ id: "sw_navis", name: "Navisworks" }]],
  ["coh_m2b", [{ id: "sw_navis", name: "Navisworks" }]],
]);

describe("buildModuleLicenseLines", () => {
  it("una línea por módulo, con la hija, su software y su licencia", async () => {
    const { buildModuleLicenseLines } = await import("@/server/enrollments");
    const lineas = buildModuleLicenseLines(
      MODULOS,
      [
        { id: "enr_h1", cohortId: "coh_m1", courseId: "crs_1", cohortName: "Módulo 1 — Revit", courseName: "Revit" },
        { id: "enr_h3", cohortId: "coh_m3", courseId: "crs_3", cohortName: "Módulo 3 — Teoría", courseName: "Teoría BIM" },
      ],
      SOFTWARE,
      new Map([["enr_h1", { assigned: true, softwareId: "sw_revit" }]])
    );

    expect(lineas).toEqual([
      {
        moduleName: "Módulo 1 — Revit",
        enrollmentId: "enr_h1",
        software: [{ id: "sw_revit", name: "Revit" }],
        licenseAssigned: true,
        licenseSoftwareId: "sw_revit",
      },
      // Sin inscripción hija en el módulo: nota neutra, sin select.
      {
        moduleName: "Navisworks",
        enrollmentId: null,
        software: [],
        licenseAssigned: false,
        licenseSoftwareId: null,
      },
      // Inscripto, pero el módulo no declara software: la pantalla lo dice.
      {
        moduleName: "Módulo 3 — Teoría",
        enrollmentId: "enr_h3",
        software: [],
        licenseAssigned: false,
        licenseSoftwareId: null,
      },
    ]);
  });

  it("una licencia liberada (assigned=false) no figura como asignada", async () => {
    const { buildModuleLicenseLines } = await import("@/server/enrollments");
    const [linea] = buildModuleLicenseLines(
      MODULOS.slice(0, 1),
      [{ id: "enr_h1", cohortId: "coh_m1", courseId: "crs_1", cohortName: null, courseName: "Revit" }],
      SOFTWARE,
      new Map([["enr_h1", { assigned: false, softwareId: "sw_revit" }]])
    );
    expect(linea?.licenseAssigned).toBe(false);
    expect(linea?.licenseSoftwareId).toBeNull();
  });

  /**
   * 028 (FR-008): la hija puede estar en la corrida del mismo módulo de OTRA
   * camada (recursada). La línea sale de lo que realmente cursa: su cohorte y
   * el software de esa cohorte.
   */
  it("una recursada en otra camada cuenta para el módulo del mismo curso", async () => {
    const { buildModuleLicenseLines } = await import("@/server/enrollments");
    const lineas = buildModuleLicenseLines(
      MODULOS.slice(0, 2),
      [
        { id: "enr_h2", cohortId: "coh_m2b", courseId: "crs_2", cohortName: "Navisworks (EBIM 14)", courseName: "Navisworks" },
      ],
      SOFTWARE,
      new Map()
    );
    expect(lineas[1]).toEqual({
      moduleName: "Navisworks (EBIM 14)",
      enrollmentId: "enr_h2",
      software: [{ id: "sw_navis", name: "Navisworks" }],
      licenseAssigned: false,
      licenseSoftwareId: null,
    });
  });
});
