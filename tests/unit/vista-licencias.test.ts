import { describe, expect, it } from "vitest";
import {
  armarVistaDeLicencias,
  estadoDeLicencia,
  faltantesDelGrupo,
  filtrarFilas,
  type FilaDeLicenciaVista,
} from "@/lib/license-view";
import { licenciaOcupada } from "@/lib/license-rules";

/**
 * 035 (US3, FR-013..FR-016) — La vista de Licencias por programa. Pura: el
 * server le da filas; los contadores tienen que dar lo MISMO que el stock
 * (`contarOcupadas` aplica `licenciaOcupada`, y esta vista también).
 */

const HOY = new Date("2026-10-16T12:00:00.000Z");
const ANTES = new Date("2026-01-01T00:00:00.000Z");
const DESPUES = new Date("2027-06-30T00:00:00.000Z");

const fila = (over: Partial<FilaDeLicenciaVista>): FilaDeLicenciaVista => ({
  licenseId: "lic_1",
  enrollmentId: "enr_1",
  softwareId: "sw_revit",
  contactId: "ct_1",
  contactName: "Ana Pérez",
  cohortId: "coh_1",
  cohortName: "Revit — Octubre",
  source: "individual",
  assignedAt: "2026-10-01T00:00:00.000Z",
  expiresAt: null,
  estado: "en_uso",
  ...over,
});

describe("estadoDeLicencia — la misma regla que el stock", () => {
  const vigente = { startDate: ANTES, endDate: DESPUES };

  it("en uso cuando ocupa", () => {
    expect(estadoDeLicencia({ expiresAt: null }, vigente, HOY)).toBe("en_uso");
    expect(licenciaOcupada({ assigned: true, expiresAt: null }, vigente, HOY)).toBe(true);
  });

  it("vencida gana sobre todo", () => {
    expect(estadoDeLicencia({ expiresAt: ANTES }, vigente, HOY)).toBe("vencida");
  });

  it("curso terminado no ocupa", () => {
    expect(estadoDeLicencia({ expiresAt: null }, { startDate: ANTES, endDate: ANTES }, HOY)).toBe(
      "curso_terminado"
    );
  });

  it("fechas desconocidas = en uso (no terminó)", () => {
    expect(estadoDeLicencia({ expiresAt: null }, null, HOY)).toBe("en_uso");
  });
});

describe("armarVistaDeLicencias (FR-013)", () => {
  it("total, asignadas y libres por programa; sólo cuentan las que ocupan", () => {
    const vista = armarVistaDeLicencias(
      [
        { id: "sw_revit", name: "Revit", total: 20 },
        { id: "sw_navis", name: "Navisworks", total: 5 },
      ],
      [
        fila({ licenseId: "a" }),
        fila({ licenseId: "b", source: "grupo" }),
        fila({ licenseId: "c", estado: "vencida" }),
        fila({ licenseId: "d", estado: "curso_terminado" }),
      ],
      []
    );
    expect(vista.map((p) => [p.name, p.total, p.asignadas, p.libres])).toEqual([
      ["Revit", 20, 2, 18],
      ["Navisworks", 5, 0, 5],
    ]);
    // La lista trae TODAS las asignadas, también las que ya no ocupan.
    expect(vista[0]!.filas.map((f) => f.licenseId)).toEqual(["a", "b", "c", "d"]);
  });

  it("la foto del programa viaja con él; sin dato, no tiene foto", () => {
    const vista = armarVistaDeLicencias(
      [
        { id: "sw_revit", name: "Revit", total: 2, hasPhoto: true },
        { id: "sw_navis", name: "Navisworks", total: 1 },
      ],
      [],
      []
    );
    expect(vista.map((p) => p.hasPhoto)).toEqual([true, false]);
  });

  it("libres puede ser negativo si se bajó el total: se muestra tal cual", () => {
    const [p] = armarVistaDeLicencias(
      [{ id: "sw_revit", name: "Revit", total: 1 }],
      [fila({ licenseId: "a" }), fila({ licenseId: "b" })],
      []
    );
    expect(p!.libres).toBe(-1);
  });

  it("los faltantes del grupo van con su programa (FR-016)", () => {
    const [p] = armarVistaDeLicencias(
      [{ id: "sw_revit", name: "Revit", total: 1 }],
      [],
      [
        {
          softwareId: "sw_revit",
          enrollmentId: "enr_9",
          contactId: "ct_9",
          contactName: "Luis",
          cohortId: "coh_1",
          cohortName: "Revit — Octubre",
        },
      ]
    );
    expect(p!.faltantes).toHaveLength(1);
  });
});

describe("faltantesDelGrupo (FR-004/FR-016)", () => {
  it("miembro de un grupo con el programa y sin licencia asignada = faltante", () => {
    const out = faltantesDelGrupo(
      [{ cohortId: "coh_1", softwareId: "sw_revit" }],
      [
        { enrollmentId: "enr_1", cohortId: "coh_1", contactId: "ct_1", contactName: "Ana", cohortName: "C1" },
        { enrollmentId: "enr_2", cohortId: "coh_1", contactId: "ct_2", contactName: "Luis", cohortName: "C1" },
        { enrollmentId: "enr_3", cohortId: "coh_2", contactId: "ct_3", contactName: "Eva", cohortName: "C2" },
      ],
      [{ enrollmentId: "enr_1", softwareId: "sw_revit" }]
    );
    expect(out.map((f) => f.enrollmentId)).toEqual(["enr_2"]);
    expect(out[0]).toMatchObject({ softwareId: "sw_revit", contactName: "Luis", cohortName: "C1" });
  });

  it("una licencia de OTRO programa no cubre el faltante", () => {
    const out = faltantesDelGrupo(
      [{ cohortId: "coh_1", softwareId: "sw_revit" }],
      [{ enrollmentId: "enr_1", cohortId: "coh_1", contactId: "ct_1", contactName: "Ana", cohortName: "C1" }],
      [{ enrollmentId: "enr_1", softwareId: "sw_navis" }]
    );
    expect(out).toHaveLength(1);
  });
});

describe("filtrarFilas (FR-014)", () => {
  const filas = [
    fila({ licenseId: "a", contactName: "Ana Pérez", cohortId: "coh_1", source: "grupo" }),
    fila({ licenseId: "b", contactName: "José Núñez", cohortId: "coh_2", source: "individual" }),
    fila({ licenseId: "c", contactName: "Lucía Gómez", cohortId: null, cohortName: null }),
  ];

  it("sin filtros, todo", () => {
    expect(filtrarFilas(filas, {})).toHaveLength(3);
  });

  it("por cohorte", () => {
    expect(filtrarFilas(filas, { cohortId: "coh_2" }).map((f) => f.licenseId)).toEqual(["b"]);
  });

  it("por origen", () => {
    expect(filtrarFilas(filas, { source: "grupo" }).map((f) => f.licenseId)).toEqual(["a"]);
  });

  it("búsqueda por alumno, sin mayúsculas ni tildes", () => {
    expect(filtrarFilas(filas, { q: "nunez" }).map((f) => f.licenseId)).toEqual(["b"]);
    expect(filtrarFilas(filas, { q: "  LUCIA " }).map((f) => f.licenseId)).toEqual(["c"]);
  });

  it("apellido y nombre en cualquier orden (regla de contact-search)", () => {
    expect(filtrarFilas(filas, { q: "nunez jose" }).map((f) => f.licenseId)).toEqual(["b"]);
  });

  it("los filtros se combinan", () => {
    expect(filtrarFilas(filas, { source: "individual", q: "ana" })).toEqual([]);
  });
});
