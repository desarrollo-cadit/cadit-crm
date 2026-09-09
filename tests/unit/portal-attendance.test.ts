import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 014 (T027, DV-001/DV-005) — La toma de asistencia desde el portal.
 *
 * Dos reglas que tiran para lados opuestos y por eso conviene fijarlas juntas:
 *
 * - El profesor **sí** puede corregir una clase pasada. Un sistema que se
 *   niega a registrar lo que pasó en el aula no hace que el dato sea correcto:
 *   hace que quede mal para siempre. Lo que sí exige es saber **quién** lo
 *   dejó así y **cuándo**.
 * - El profesor **no** puede tocar una cohorte finalizada. Ahí los porcentajes
 *   ya se usaron para decidir quién aprobó.
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

/**
 * `markAttendance` se espía en vez de ejecutarse: lo que este archivo tiene
 * que probar no es que el `insert` funcione —eso ya está cubierto en 009— sino
 * QUÉ se le manda. Sobre todo el autor.
 */
const markAttendance = vi.fn(async () => ({ ok: true as const, data: { marked: 0 } }));
vi.mock("@/server/attendance", () => ({
  markAttendance: (...a: unknown[]) => markAttendance(...(a as [])),
}));

const ORG = "org_1";
const PROFE = "tch_a";
const USUARIO = "usr_profe";
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
  markAttendance.mockClear();
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

describe("T027 — corregir una clase pasada SÍ se puede, y queda el autor", () => {
  /**
   * **El caso que justifica la regla (DV-001).** La clase fue el 15 y el
   * profesor corrige el 20. El sistema no discute con lo que pasó en el aula.
   */
  it("marca una clase de hace días y registra al usuario que la tocó", async () => {
    prepararClase();
    responder("attendance", []);

    const { teacherMarkAttendance } = await import("@/server/teacher-portal");
    const r = await teacherMarkAttendance(ORG, PROFE, USUARIO, CLASE, [
      { enrollmentId: "enr_1", status: "tarde" },
    ]);

    expect(r.ok).toBe(true);
    expect(markAttendance).toHaveBeenCalledWith(
      ORG,
      CLASE,
      [{ enrollmentId: "enr_1", status: "tarde" }],
      // El cuarto argumento es el autor: sin esto, una corrección no se puede
      // revisar después.
      USUARIO
    );
  });

  /**
   * Un `enrollmentId` de otra cohorte no entra. No es paranoia: el cuerpo del
   * pedido lo arma el navegador, y el servidor es el único que sabe quiénes
   * son los alumnos de esta clase.
   */
  it("descarta las inscripciones que no son de esta cohorte", async () => {
    prepararClase();
    responder("attendance", []);

    const { teacherMarkAttendance } = await import("@/server/teacher-portal");
    await teacherMarkAttendance(ORG, PROFE, USUARIO, CLASE, [
      { enrollmentId: "enr_2", status: "presente" },
      { enrollmentId: "enr_de_otra_cohorte", status: "presente" },
    ]);

    expect(markAttendance).toHaveBeenCalledWith(
      ORG,
      CLASE,
      [{ enrollmentId: "enr_2", status: "presente" }],
      USUARIO
    );
  });

  it("una clase que no alcanza responde 404 y no marca nada", async () => {
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

    const { teacherMarkAttendance } = await import("@/server/teacher-portal");
    const r = await teacherMarkAttendance(ORG, PROFE, USUARIO, CLASE, [
      { enrollmentId: "enr_1", status: "presente" },
    ]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
    expect(markAttendance).not.toHaveBeenCalled();
  });
});

describe("T027 — la cohorte finalizada se ve, no se edita (DV-005)", () => {
  it("responde 422 con el motivo y no marca nada", async () => {
    prepararClase({ finalizada: true });
    responder("attendance", []);

    const { teacherMarkAttendance } = await import("@/server/teacher-portal");
    const r = await teacherMarkAttendance(ORG, PROFE, USUARIO, CLASE, [
      { enrollmentId: "enr_1", status: "presente" },
    ]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.code).toBe("cohorte_finalizada");
    expect(r.message).toContain("finalizó");
    expect(markAttendance).not.toHaveBeenCalled();
  });

  /** Pero la planilla se PUEDE ver: la cohorte finalizada no desaparece. */
  it("la planilla igual se ve, marcada como no editable", async () => {
    prepararClase({ finalizada: true });
    responder("attendance", []);

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    const planilla = await teacherAttendanceSheet(ORG, PROFE, CLASE);

    expect(planilla?.cohort.status).toBe("finalizada");
    expect(planilla?.editable).toBe(false);
    expect(planilla?.students).toHaveLength(2);
  });

  /** Una clase cancelada tampoco se edita, aunque la cohorte esté viva. */
  it("una clase cancelada no es editable", async () => {
    prepararClase({ cancelada: true });
    responder("attendance", []);

    const { teacherAttendanceSheet } = await import("@/server/teacher-portal");
    const planilla = await teacherAttendanceSheet(ORG, PROFE, CLASE);

    expect(planilla?.classSession.canceled).toBe(true);
    expect(planilla?.editable).toBe(false);
  });
});
