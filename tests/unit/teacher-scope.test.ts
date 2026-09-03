import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 014 (T019, T020, T021) — El alcance del profesor.
 *
 * Las tres cosas que este archivo sostiene, y que si se rompen no se notan
 * mirando la pantalla:
 *
 * 1. Un profesor **no alcanza** las cohortes de otro, y cuando no las alcanza
 *    recibe **404, no 403**.
 * 2. La suplencia SÍ da acceso: quien cubrió una clase tiene que poder cargar
 *    su asistencia.
 * 3. Ningún DTO del portal lleva plata ni datos de contacto.
 */

/* ============================================================
 * Un doble de base de datos indexado por TABLA
 * ============================================================
 * Las funciones del portal hacen varias consultas seguidas, así que una cola
 * global obligaría a contar cuántas van — y ese conteo se rompe con cualquier
 * refactor. Indexar por tabla dice lo que el test quiere decir: "cuando
 * pregunte por cohortes, contestá esto".
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

/** El módulo SIN comentarios: los comentarios explican por qué algo no está. */
function codigoDelPortal(): string {
  return readFileSync(path.join(process.cwd(), "src/server/teacher-portal.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const ORG = "org_1";
const PROFE_A = "tch_a";
const PROFE_B = "tch_b";

const HOY = new Date("2026-06-01T00:00:00.000Z");
const AYER = new Date("2026-01-01T00:00:00.000Z");

function filaCohorte(over: Record<string, unknown> = {}) {
  return {
    id: "coh_1",
    name: "Revit MEP 1",
    teacherId: PROFE_A,
    startDate: AYER,
    endDate: null,
    startTime: "18:30",
    endTime: "21:30",
    classroom: "Aula 2",
    courseName: "Revit MEP",
    ...over,
  };
}

beforeEach(() => {
  colas.clear();
  vi.resetModules();
});

describe("T018 — el alcance: titular O suplente", () => {
  it("junta las cohortes propias y las que suplió, sin repetir", async () => {
    responder("cohort", [{ id: "coh_1" }, { id: "coh_2" }]);
    // `coh_2` aparece por los dos lados: es titular Y además dictó clases.
    responder("classSession", [{ id: "coh_2" }, { id: "coh_9" }]);

    const { resolveTeacherScope } = await import("@/server/teacher-portal");
    const alcance = await resolveTeacherScope(ORG, PROFE_A);

    expect([...alcance].sort()).toEqual(["coh_1", "coh_2", "coh_9"]);
  });

  it("sin cohortes propias ni suplencias, el alcance es vacío", async () => {
    responder("cohort", []);
    responder("classSession", []);

    const { resolveTeacherScope } = await import("@/server/teacher-portal");
    expect(await resolveTeacherScope(ORG, PROFE_B)).toEqual([]);
  });

  /**
   * Con el alcance vacío no se puede armar el `in (...)` de la consulta
   * siguiente, y en SQL un `in ()` vacío es un error. Cortar antes no es una
   * optimización: es lo que evita el 500.
   */
  it("con alcance vacío devuelve la lista vacía sin consultar más", async () => {
    responder("cohort", []);
    responder("classSession", []);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    expect(await listTeacherCohorts(ORG, PROFE_B)).toEqual([]);
  });
});

describe("T020 — la suplencia da acceso", () => {
  /**
   * El caso: un profesor cubrió UNA clase de una cohorte que no es suya. Si el
   * sistema mirara solo `cohort.teacher_id` no podría cargar la asistencia de
   * la clase que él mismo dictó.
   */
  it("una sola clase dictada alcanza la cohorte entera", async () => {
    responder("cohort", []); // no es titular de ninguna
    responder("classSession", [{ id: "coh_ajena" }]);

    const { resolveTeacherScope } = await import("@/server/teacher-portal");
    expect(await resolveTeacherScope(ORG, PROFE_B)).toEqual(["coh_ajena"]);
  });

  /** Y la pantalla lo dice: aparece como **suplente**, no como titular. */
  it("la cohorte suplida se marca `suplente`, no `titular`", async () => {
    responder("cohort", []);
    responder("classSession", [{ id: "coh_1" }]);
    responder("cohort", [filaCohorte({ teacherId: PROFE_A })]);
    responder("enrollment", [{ cohortId: "coh_1" }, { cohortId: "coh_1" }]);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    const [cohorte] = await listTeacherCohorts(ORG, PROFE_B);

    expect(cohorte?.role).toBe("suplente");
    expect(cohorte?.students).toBe(2);
  });

  it("la cohorte propia se marca `titular`", async () => {
    responder("cohort", [{ id: "coh_1" }]);
    responder("classSession", []);
    responder("cohort", [filaCohorte({ teacherId: PROFE_A })]);
    responder("enrollment", []);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    const [cohorte] = await listTeacherCohorts(ORG, PROFE_A);

    expect(cohorte?.role).toBe("titular");
  });
});

describe("T019 — el profesor ajeno recibe 404, no 403", () => {
  /**
   * **El caso que justifica la fase (SC-002).** Un 403 diría "existe, pero no
   * es tuya", y eso ya es información: confirma que esa cohorte existe. El
   * profesor ajeno tiene que ver exactamente lo mismo que vería pidiendo una
   * cohorte inventada.
   */
  it("una cohorte ajena devuelve null, igual que una inexistente", async () => {
    responder("cohort", []); // `teacherReachesCohort` no encuentra nada

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    const ajena = await teacherCohortDetail(ORG, PROFE_B, "coh_de_A");

    expect(ajena).toBeNull();
  });

  it("`teacherReachesCohort` contesta booleano, no un error con estado", async () => {
    responder("cohort", []);

    const { teacherReachesCohort } = await import("@/server/teacher-portal");
    const r = await teacherReachesCohort(ORG, PROFE_B, "coh_de_A");

    expect(r).toBe(false);
  });

  /**
   * La regla se rompe con cualquier `if (!puede) return 403` bien
   * intencionado. Como el módulo del alcance no tiene ningún 403 que copiar,
   * quien agregue uno tiene que escribirlo a mano y este test lo frena.
   */
  it("el módulo del portal no contiene ningún 403", () => {
    // Sin los comentarios: ahí el 403 aparece justamente para explicar por qué
    // NO se usa, y prohibirlo en la prosa borraría la explicación.
    expect(codigoDelPortal()).not.toMatch(/\b403\b/);
  });

  it("la cohorte propia SÍ se resuelve", async () => {
    responder("cohort", [{ id: "coh_1" }]); // teacherReachesCohort: la alcanza
    responder("cohort", [{ id: "coh_1" }]); // resolveTeacherScope: titular
    responder("classSession", []);
    responder("cohort", [filaCohorte()]);
    responder("enrollment", []);
    responder("enrollment", [{ enrollmentId: "enr_1", firstName: "Ana", lastName: "Pérez" }]);

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    const detalle = await teacherCohortDetail(ORG, PROFE_A, "coh_1");

    expect(detalle?.cohort.id).toBe("coh_1");
    expect(detalle?.students).toEqual([{ enrollmentId: "enr_1", name: "Ana Pérez" }]);
  });
});

describe("DV-005 — una cohorte finalizada se ve, no se edita", () => {
  it("marca `editable: false` cuando ya terminó", async () => {
    const terminada = filaCohorte({ startDate: AYER, endDate: AYER });
    responder("cohort", [{ id: "coh_1" }]);
    responder("cohort", [{ id: "coh_1" }]);
    responder("classSession", []);
    responder("cohort", [terminada]);
    responder("enrollment", []);
    responder("enrollment", []);

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    const detalle = await teacherCohortDetail(ORG, PROFE_A, "coh_1");

    expect(detalle?.cohort.status).toBe("finalizada");
    expect(detalle?.editable).toBe(false);
  });

  it("una cohorte en curso es editable", async () => {
    const enCurso = filaCohorte({ startDate: AYER, endDate: null });
    responder("cohort", [{ id: "coh_1" }]);
    responder("cohort", [{ id: "coh_1" }]);
    responder("classSession", []);
    responder("cohort", [enCurso]);
    responder("enrollment", []);
    responder("enrollment", []);

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    const detalle = await teacherCohortDetail(ORG, PROFE_A, "coh_1");

    expect(detalle?.editable).toBe(true);
    expect(HOY > AYER).toBe(true); // la cohorte arrancó y no tiene fin
  });
});

describe("T021 — ni plata ni datos de contacto salen del portal", () => {
  /**
   * Verificado sobre la FORMA DEL OBJETO, no sobre la UI: esconder un campo en
   * la pantalla lo deja igual en la respuesta HTTP, donde cualquiera lo lee.
   */
  it("la cohorte del profesor no trae costo ni moneda", async () => {
    responder("cohort", [{ id: "coh_1" }]);
    responder("classSession", []);
    responder("cohort", [filaCohorte()]);
    responder("enrollment", []);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    const [cohorte] = await listTeacherCohorts(ORG, PROFE_A);

    expect(Object.keys(cohorte ?? {}).sort()).toEqual([
      "classroom",
      "courseName",
      "endDate",
      "endTime",
      "id",
      "name",
      "role",
      "startDate",
      "startTime",
      "status",
      "students",
    ]);
  });

  /** El alumno es un nombre. Ni correo, ni teléfono, ni identidad de WhatsApp. */
  it("el alumno del portal es solo `enrollmentId` y `name`", async () => {
    responder("cohort", [{ id: "coh_1" }]);
    responder("cohort", [{ id: "coh_1" }]);
    responder("classSession", []);
    responder("cohort", [filaCohorte()]);
    responder("enrollment", []);
    responder("enrollment", [
      { enrollmentId: "enr_1", firstName: "Ana", lastName: "Pérez" },
    ]);

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    const detalle = await teacherCohortDetail(ORG, PROFE_A, "coh_1");

    expect(Object.keys(detalle?.students[0] ?? {}).sort()).toEqual([
      "enrollmentId",
      "name",
    ]);
  });

  /** US5/FR-010: horas sí, tarifa no. Ni la suya. */
  it("las horas dictadas no llevan tarifa", async () => {
    responder("classSession", [
      { cohortId: "coh_1", cohortName: "Revit MEP 1", hours: 3 },
      { cohortId: "coh_1", cohortName: "Revit MEP 1", hours: 3 },
      { cohortId: "coh_2", cohortName: "Revit MEP 2", hours: 2 },
    ]);

    const { teacherOwnHours } = await import("@/server/teacher-portal");
    const horas = await teacherOwnHours(ORG, PROFE_A);

    expect(horas.sessions).toBe(3);
    expect(horas.hours).toBe(8);
    expect(Object.keys(horas).sort()).toEqual(["byCohort", "hours", "sessions"]);
    expect(Object.keys(horas.byCohort[0] ?? {}).sort()).toEqual([
      "cohortId",
      "cohortName",
      "hours",
      "sessions",
    ]);
  });

  /** Una clase sin horas cargadas cuenta como clase, pero suma 0 horas. */
  it("una clase sin `hours` no rompe la suma", async () => {
    responder("classSession", [
      { cohortId: "coh_1", cohortName: "Revit MEP 1", hours: null },
    ]);

    const { teacherOwnHours } = await import("@/server/teacher-portal");
    const horas = await teacherOwnHours(ORG, PROFE_A);

    expect(horas.sessions).toBe(1);
    expect(horas.hours).toBe(0);
  });

  /**
   * El guard estructural: el módulo del portal **no nombra** ninguna columna
   * financiera ni de contacto. Si mañana alguien agrega el correo del alumno
   * "para avisarle que faltó", esto falla y lo obliga a hablarlo.
   */
  it("el módulo no menciona columnas de plata ni de contacto", () => {
    const codigo = codigoDelPortal();

    for (const prohibido of [
      "\\.email",
      "\\.phone",
      "waIdentity",
      "\\.cost",
      "currency",
      "installment",
      "payment",
      "hourlyRate",
      "invoice",
    ]) {
      expect(codigo, `aparece ${prohibido}`).not.toMatch(new RegExp(prohibido, "i"));
    }
  });
});
