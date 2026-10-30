import { describe, expect, it } from "vitest";
import {
  armarVistaDeLicencias,
  contadoresDeLicencias,
  estadoDeLicencia,
  estadoDeLicenciaDeProfesor,
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
  teacherId: null,
  titular: "alumno",
  softwareId: "sw_revit",
  teamId: "team_uy",
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

describe("0089 — la vista por equipo", () => {
  it("cada programa lleva su cupo, asignadas y libres POR EQUIPO", () => {
    const [p] = armarVistaDeLicencias(
      [{ id: "sw_revit", name: "Revit", total: 110 }],
      [
        fila({ licenseId: "a", teamId: "team_uy" }),
        fila({ licenseId: "b", teamId: "team_uy" }),
        fila({ licenseId: "c", teamId: "team_py" }),
        // Una vencida del equipo de Uruguay no ocupa.
        fila({ licenseId: "d", teamId: "team_uy", estado: "vencida" }),
      ],
      [],
      [
        { teamId: "team_uy", softwareId: "sw_revit", total: 50 },
        { teamId: "team_py", softwareId: "sw_revit", total: 60 },
      ]
    );
    expect(p!.porEquipo).toEqual([
      { teamId: "team_uy", total: 50, asignadas: 2, externos: 0, libres: 48 },
      { teamId: "team_py", total: 60, asignadas: 1, externos: 0, libres: 59 },
    ]);
    // El total del programa sigue siendo la suma de los equipos.
    expect([p!.total, p!.asignadas, p!.libres]).toEqual([110, 3, 107]);
  });

  it("el cupo de otro programa no se cuela en este", () => {
    const [p] = armarVistaDeLicencias(
      [{ id: "sw_revit", name: "Revit", total: 5 }],
      [],
      [],
      [{ teamId: "team_uy", softwareId: "sw_navis", total: 9 }]
    );
    expect(p!.porEquipo).toEqual([]);
  });

  it("filtrarFilas por equipo", () => {
    const filas = [
      fila({ licenseId: "a", teamId: "team_uy" }),
      fila({ licenseId: "b", teamId: "team_py" }),
    ];
    expect(filtrarFilas(filas, { teamId: "team_py" }).map((f) => f.licenseId)).toEqual(["b"]);
    expect(filtrarFilas(filas, {})).toHaveLength(2);
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

describe("contadoresDeLicencias (2026-10-30)", () => {
  const filas = [
    { cohortId: "coh_1", source: "grupo" as const, contactName: "Ana Pérez" },
    { cohortId: "coh_1", source: "individual" as const, contactName: "Bruno Núñez" },
    { cohortId: "coh_2", source: "individual" as const, contactName: "Ana Ruiz" },
    { cohortId: null, source: "individual" as const, contactName: "Carla Díaz" },
  ];

  it("sin filtros cuenta todo; una licencia sin grupo no suma a ningún grupo", () => {
    const c = contadoresDeLicencias(filas, {});
    expect(c.todosLosGrupos).toBe(4);
    expect([...c.grupos.entries()]).toEqual([
      ["coh_1", 2],
      ["coh_2", 1],
    ]);
    expect(c.origen).toEqual({ todos: 4, grupo: 1, individual: 3 });
  });

  it("cada desplegable cuenta con los demás filtros y sin el suyo", () => {
    const c = contadoresDeLicencias(filas, { cohortId: "coh_1", source: "individual", q: "" });
    expect(c.todosLosGrupos).toBe(3);
    expect(c.grupos.get("coh_1")).toBe(1);
    expect(c.origen).toEqual({ todos: 2, grupo: 1, individual: 1 });
  });

  it("la búsqueda achica los conteos", () => {
    const c = contadoresDeLicencias(filas, { q: "ana" });
    expect(c.todosLosGrupos).toBe(2);
    expect(c.origen).toEqual({ todos: 2, grupo: 1, individual: 1 });
  });
});

describe("licencias de profesores (0090)", () => {
  const profesor = fila({
    licenseId: "prof_1",
    enrollmentId: null,
    teacherId: "tch_1",
    titular: "profesor",
    contactId: null,
    contactName: "Marcos Díaz",
    cohortId: null,
    cohortName: null,
  });

  it("un profesor no tiene cohorte: en uso mientras no venza, nunca \"curso terminado\"", () => {
    expect(estadoDeLicenciaDeProfesor({ expiresAt: null }, HOY)).toBe("en_uso");
    expect(estadoDeLicenciaDeProfesor({ expiresAt: DESPUES }, HOY)).toBe("en_uso");
    expect(estadoDeLicenciaDeProfesor({ expiresAt: ANTES }, HOY)).toBe("vencida");
  });

  it("cuenta en el cupo de su equipo junto a los alumnos", () => {
    const [p] = armarVistaDeLicencias(
      [{ id: "sw_revit", name: "Revit", total: 3 }],
      [fila({ licenseId: "a" }), profesor],
      [],
      [{ teamId: "team_uy", softwareId: "sw_revit", total: 3 }]
    );
    expect(p).toMatchObject({ asignadas: 2, externos: 0, libres: 1 });
    expect(p!.porEquipo[0]).toMatchObject({ asignadas: 2, externos: 0, libres: 1 });
  });

  it("filtra por Alumnos / Profesores", () => {
    const filas = [fila({ licenseId: "a" }), profesor];
    expect(filtrarFilas(filas, { titular: "profesor" }).map((f) => f.licenseId)).toEqual(["prof_1"]);
    expect(filtrarFilas(filas, { titular: "alumno" }).map((f) => f.licenseId)).toEqual(["a"]);
    expect(filtrarFilas(filas, { titular: null })).toHaveLength(2);
  });

  it("la búsqueda encuentra al profesor por su nombre", () => {
    expect(filtrarFilas([profesor], { q: "diaz" })).toHaveLength(1);
  });

  it("el profesor no figura como faltante del grupo (no tiene inscripción)", () => {
    const out = faltantesDelGrupo(
      [{ cohortId: "coh_1", softwareId: "sw_revit" }],
      [{ enrollmentId: "enr_1", cohortId: "coh_1", contactId: "ct_1", contactName: "Ana", cohortName: "C1" }],
      [profesor]
    );
    expect(out).toHaveLength(1);
  });
});
