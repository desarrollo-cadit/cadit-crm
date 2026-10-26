import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 014 (T027, DV-001) — La asistencia de una clase, vista desde el portal.
 *
 * Desde 2026-10-26 pasar lista es de Coordinación: el profesor la CONSULTA.
 * Lo que se fija acá es qué ve —cada alumno con su estado, quién dejó la
 * marca y cuándo— y que sin alcance no ve nada. Que no pueda escribir lo
 * guarda `portal-profesor-solo-lectura.test.ts`.
 */

const colas = new Map<string, unknown[][]>();

function responder(tabla: string, filas: unknown[]) {
  const cola = colas.get(tabla) ?? [];
  cola.push(filas);
  colas.set(tabla, cola);
}

function chain() {
  let tabla = "";
  const obj: Record<string, unknown> = {};
  obj.from = (t: { __table?: string }) => {
    tabla = t?.__table ?? "";
    return obj;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    obj[m] = () => obj;
  }
  (obj as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(colas.get(tabla)?.shift() ?? []).then(resolve);
  return obj;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({ select: () => chain(), selectDistinct: () => chain() }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) =>
              col === "__table"
                ? String(tableName)
                : `${String(tableName)}.${String(col)}`,
          }
        ),
    }
  ),
}));

const ORG = "org_1";
const PROFE = "tch_a";
const CLASE = "cls_3";
const COHORTE = "coh_1";

const ARRANCO = new Date("2026-01-01T00:00:00.000Z");
const TERMINO = new Date("2026-02-01T00:00:00.000Z");

/**
 * Deja lista una cohorte del profesor con una clase y dos alumnos. El orden de
 * las respuestas sigue el de las consultas reales: sesión → alcance → cohorte
 * → inscriptos → lista → marcas.
 */
function prepararClase(opts: { finalizada?: boolean; cancelada?: boolean } = {}) {
  responder("classSession", [
    {
      id: CLASE,
      cohortId: COHORTE,
      number: 3,
      date: new Date("2026-01-15T21:30:00.000Z"),
      topic: "Familias paramétricas",
      canceledAt: opts.cancelada ? new Date("2026-01-14T00:00:00.000Z") : null,
    },
  ]);

  responder("cohort", [{ id: COHORTE }]); // teacherReachesCohort
  responder("cohort", [{ id: COHORTE }]); // resolveTeacherScope: titular
  responder("classSession", []); // resolveTeacherScope: suplencias
  responder("cohort", [
    {
      id: COHORTE,
      name: "Revit MEP 1",
      teacherId: PROFE,
      startDate: ARRANCO,
      endDate: opts.finalizada ? TERMINO : null,
      startTime: "18:30",
      endTime: "21:30",
      classroom: "Aula 2",
      courseName: "Revit MEP",
    },
  ]);
  responder("enrollment", [{ cohortId: COHORTE }, { cohortId: COHORTE }]);
  responder("enrollment", [
    { enrollmentId: "enr_1", firstName: "Ana", lastName: "Pérez" },
    { enrollmentId: "enr_2", firstName: "Luis", lastName: "Gómez" },
  ]);
}

beforeEach(() => {
  colas.clear();
  vi.resetModules();
});

describe("T027 — la planilla dice quién marcó y cuándo", () => {
  it("trae el estado de cada alumno con su autor y su fecha", async () => {
    prepararClase();
    responder("attendance", [
      {
        enrollmentId: "enr_1",
        status: "presente",
        updatedAt: new Date("2026-01-15T22:05:00.000Z"),
        autor: "Ovidio Santos",
      },
    ]);

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    const planilla = await teacherAttendanceSheet(ORG, PROFE, CLASE);

    expect(planilla?.students).toEqual([
      {
        enrollmentId: "enr_1",
        name: "Ana Pérez",
        status: "presente",
        recordedByName: "Ovidio Santos",
        recordedAt: "2026-01-15T22:05:00.000Z",
      },
      {
        // Sin marca: `null` es "todavía nadie pasó lista", que NO es ausente.
        enrollmentId: "enr_2",
        name: "Luis Gómez",
        status: null,
        recordedByName: null,
        recordedAt: null,
      },
    ]);
  });

  /**
   * Las marcas anteriores al portal no tienen autor. Inventarle uno sería peor
   * que admitir que no se sabe, así que viaja `null` y la pantalla lo dice.
   */
  it("una marca vieja sin autor no rompe la planilla", async () => {
    prepararClase();
    responder("attendance", [
      {
        enrollmentId: "enr_1",
        status: "ausente",
        updatedAt: new Date("2026-01-15T22:05:00.000Z"),
        autor: null,
      },
    ]);

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    const planilla = await teacherAttendanceSheet(ORG, PROFE, CLASE);

    expect(planilla?.students[0]?.status).toBe("ausente");
    expect(planilla?.students[0]?.recordedByName).toBeNull();
  });
});

describe("T027 — sin alcance, no hay planilla", () => {
  it("una clase de un grupo ajeno devuelve null (la ruta responde 404)", async () => {
    responder("classSession", [
      {
        id: CLASE,
        cohortId: "coh_ajena",
        number: 1,
        date: ARRANCO,
        topic: null,
        canceledAt: null,
      },
    ]);
    responder("cohort", []); // no la alcanza

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    expect(await teacherAttendanceSheet(ORG, PROFE, CLASE)).toBeNull();
  });
});

describe("T027 — lo cerrado se sigue viendo", () => {
  /** La cohorte finalizada no desaparece del portal. */
  it("la planilla de un grupo finalizado se ve", async () => {
    prepararClase({ finalizada: true });
    responder("attendance", []);

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    const planilla = await teacherAttendanceSheet(ORG, PROFE, CLASE);

    expect(planilla?.cohort.status).toBe("finalizada");
    expect(planilla?.students).toHaveLength(2);
  });

  it("una clase cancelada se ve, marcada como cancelada", async () => {
    prepararClase({ cancelada: true });
    responder("attendance", []);

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    const planilla = await teacherAttendanceSheet(ORG, PROFE, CLASE);

    expect(planilla?.classSession.canceled).toBe(true);
    // Solo consulta: la planilla ya no lleva `editable`.
    expect(planilla).not.toHaveProperty("editable");
  });
});
