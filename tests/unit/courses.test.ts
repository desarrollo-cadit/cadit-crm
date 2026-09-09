import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 004 FR-001/FR-002 + 005 FR-005 (T008/T013): createCourse/createCohort
 * insertan scoped por organización; createCohort/updateCohort aceptan los
 * campos nuevos de 005 (teacherId, cost, frequency, classroom, syllabusUrl,
 * softwareIds); listCohorts resuelve teacher/software.
 *
 * Post-revisión (hallazgo del reviewer de pre-commit): createCohort/
 * updateCohort validan que courseId/teacherId/softwareIds pertenezcan a la
 * organización ANTES de insertar/actualizar (validateCohortForeignKeys) —
 * cada test que provee alguno de esos campos ahora tiene que "responder"
 * ese select adicional en `selectQueue`, en el mismo orden en que
 * createCohort/updateCohort las dispara: courseId → teacherId → softwareIds.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const deletes: { table: unknown }[] = [];
const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  // 012 (T024) — `withAuth` abre la transacción del pedido con
  // `getRootDb().transaction()` para declarar `app.current_org`. Sin este
  // doble, cualquier prueba que atraviese el borde de autenticación falla
  // antes de llegar al handler.
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        // 006 — `createCourse` encadena `.returning()` para devolver la fila
        // persistida; el resto de los inserts se sigue await-eando directo.
        const result = Promise.resolve([values]) as Promise<unknown[]> & {
          returning?: () => Promise<unknown[]>;
        };
        result.returning = () =>
          Promise.resolve([
            { createdAt: new Date("2026-08-12"), ...(values as object) },
          ]);
        return result;
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([{ id: "coh_updated", ...(set as object) }]),
          }),
        };
      },
    }),
    delete: (table: unknown) => {
      deletes.push({ table });
      return { where: () => Promise.resolve([]) };
    },
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));

/** Empuja el resultado de una validación de FK exitosa (fila encontrada). */
function pushCourseExists() {
  selectQueue.push([{ id: "crs_revit" }]);
}
function pushTeacherExists(id = "tch_1") {
  selectQueue.push([{ id }]);
}
function pushSoftwareExists(...ids: string[]) {
  selectQueue.push(ids.map((id) => ({ id })));
}

describe("courses: createCourse / createCohort (004)", () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    deletes.length = 0;
    selectQueue.length = 0;
  });

  it("createCourse inserta con organizationId y devuelve el id generado", async () => {
    selectQueue.push([]); // 006 — resolución del slug: ninguno ocupado
    const { createCourse } = await import("@/server/courses");
    const result = await createCourse("org_1", { name: "Revit" });

    if (!result.ok) throw new Error(result.message);
    expect(result.id).toMatch(/^crs_/);
    expect(inserts).toHaveLength(1);
    const values = inserts[0]!.values as { organizationId: string; name: string };
    expect(values.organizationId).toBe("org_1");
    expect(values.name).toBe("Revit");
  });

  it("createCohort inserta con organizationId, courseId y defaults nullables", async () => {
    pushCourseExists();
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
    });

    if (!result.ok) throw new Error(result.message);
    expect(result.id).toMatch(/^coh_/);
    expect(inserts).toHaveLength(1); // sin softwareIds: un solo insert
    const values = inserts[0]!.values as {
      organizationId: string;
      courseId: string;
      teacherId: string | null;
      capacity: number | null;
      cost: number | null;
    };
    expect(values.organizationId).toBe("org_1");
    expect(values.courseId).toBe("crs_revit");
    expect(values.teacherId).toBeNull();
    expect(values.capacity).toBeNull();
    expect(values.cost).toBeNull();
  });

  it("createCohort (005 FR-005) acepta teacherId/cost/frequency/classroom", async () => {
    pushCourseExists();
    pushTeacherExists();
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      teacherId: "tch_1",
      cost: 76000,
      frequency: "lunes y miércoles 18:30-20:30",
      classroom: "Aula 3",
    });

    if (!result.ok) throw new Error(result.message);
    const values = inserts[0]!.values as {
      teacherId: string;
      cost: number;
      frequency: string;
      classroom: string;
    };
    expect(values.teacherId).toBe("tch_1");
    expect(values.cost).toBe(76000);
    expect(values.frequency).toBe("lunes y miércoles 18:30-20:30");
    expect(values.classroom).toBe("Aula 3");
    // 006 — `syllabusUrl` ya no es un campo de la cohorte; ver el test de
    // herencia desde el curso más abajo.
    expect(values).not.toHaveProperty("syllabusUrl");
  });

  it("createCohort (005 DV-004) con softwareIds inserta filas en cohort_software", async () => {
    pushCourseExists();
    pushSoftwareExists("sw_1", "sw_2");
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      softwareIds: ["sw_1", "sw_2"],
    });

    if (!result.ok) throw new Error(result.message);
    expect(inserts).toHaveLength(2); // cohort + cohort_software
    // La organización viaja en cada fila del puente (constitución III): sin
    // ella, `scoped()` no puede filtrar el puente y la seguridad vuelve a
    // depender de que el llamador se acuerde de validar el padre.
    const bridgeValues = inserts[1]!.values as {
      organizationId: string;
      cohortId: string;
      softwareId: string;
    }[];
    expect(bridgeValues).toEqual([
      { organizationId: "org_1", cohortId: result.id, softwareId: "sw_1" },
      { organizationId: "org_1", cohortId: result.id, softwareId: "sw_2" },
    ]);
  });

  it("createCohort rechaza un teacherId que no pertenece a la organización (hallazgo del reviewer)", async () => {
    pushCourseExists();
    selectQueue.push([]); // teacher: ninguna fila → no pertenece a esta org
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      teacherId: "tch_de_otra_org",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber insertado");
    expect(result.code).toBe("invalid_body");
    expect(inserts).toHaveLength(0);
  });

  it("createCohort rechaza un softwareId que no pertenece a la organización (hallazgo del reviewer)", async () => {
    pushCourseExists();
    selectQueue.push([{ id: "sw_1" }]); // pidió sw_1 y sw_2, solo sw_1 pertenece a la org
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      softwareIds: ["sw_1", "sw_de_otra_org"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber insertado");
    expect(result.code).toBe("invalid_body");
    expect(inserts).toHaveLength(0);
  });

  it("updateCohort (005 T008) solo actualiza los campos presentes en el input", async () => {
    const { updateCohort } = await import("@/server/courses");
    const result = await updateCohort("org_1", "coh_1", { cost: 90000 });

    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.cost).toBe(90000);
    expect("frequency" in set).toBe(false);
    expect("teacherId" in set).toBe(false);
  });

  it("updateCohort con softwareIds reemplaza la relación (delete + insert)", async () => {
    pushSoftwareExists("sw_3");
    const { updateCohort } = await import("@/server/courses");
    await updateCohort("org_1", "coh_1", { softwareIds: ["sw_3"] });

    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(1);
    const bridgeValues = inserts[0]!.values as {
      organizationId: string;
      cohortId: string;
      softwareId: string;
    }[];
    expect(bridgeValues).toEqual([
      { organizationId: "org_1", cohortId: "coh_1", softwareId: "sw_3" },
    ]);
  });

  it("updateCohort rechaza un courseId que no pertenece a la organización (hallazgo del reviewer)", async () => {
    selectQueue.push([]); // course: ninguna fila
    const { updateCohort } = await import("@/server/courses");
    const result = await updateCohort("org_1", "coh_1", { courseId: "crs_de_otra_org" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber actualizado");
    expect(result.code).toBe("invalid_body");
    expect(updates).toHaveLength(0);
  });

  it("listCohorts (005 T008) incluye teacher/software resueltos", async () => {
    selectQueue.push(
      [
        {
          cohort: {
            id: "coh_1",
            courseId: "crs_revit",
            startDate: new Date("2026-08-04"),
            endDate: null,
            cost: 76000,
            frequency: null,
            classroom: null,
            capacity: 20,
            whatsappGroupLink: null,
            status: "planificada",
          },
          course: { id: "crs_revit", name: "Revit", syllabusUrl: null },
          teacher: { id: "tch_1", name: "Ing. Paola Suárez" },
        },
      ],
      [{ cohortId: "coh_1", software: { id: "sw_1", name: "Revit" } }]
    );

    const { listCohorts } = await import("@/server/courses");
    const rows = await listCohorts("org_1");

    expect(rows).toHaveLength(1);
    expect(rows[0]!.teacher).toEqual({ id: "tch_1", name: "Ing. Paola Suárez" });
    expect(rows[0]!.software).toEqual([{ id: "sw_1", name: "Revit" }]);
  });

  it("listCohorts (006) hereda el temario del curso, no de la cohorte", async () => {
    selectQueue.push(
      [
        {
          cohort: {
            id: "coh_1",
            courseId: "crs_revit",
            startDate: new Date("2026-08-04"),
            endDate: null,
            cost: null,
            frequency: null,
            classroom: null,
            capacity: null,
            whatsappGroupLink: null,
            status: "planificada",
          },
          course: {
            id: "crs_revit",
            name: "Revit",
            syllabusUrl: "https://example.com/temario-revit.pdf",
          },
          teacher: null,
        },
      ],
      []
    );

    const { listCohorts } = await import("@/server/courses");
    const rows = await listCohorts("org_1");

    expect(rows[0]!.syllabusUrl).toBe("https://example.com/temario-revit.pdf");
  });

  it("createCohort (005 T029, US4, FR-006) calcula licenseWarnings sin bloquear la creación", async () => {
    pushCourseExists();
    pushSoftwareExists("sw_1");
    selectQueue.push(
      [{ name: "Revit", totalLicenses: 5 }], // availableLicenses: software
      /*
        023 — El conteo de ocupadas dejó de ser un : ahora se traen las
        licencias con su cohorte y la ocupación se deriva. Estas cinco son de
        cursos vivos, así que ocupan y dejan  en 0, igual que antes.
      */
      Array.from({ length: 5 }, () => ({
        softwareId: "sw_1",
        assigned: true,
        expiresAt: null,
        startDate: new Date("2020-01-01"),
        endDate: new Date("2030-01-01"),
      }))
    );
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      capacity: 10,
      softwareIds: ["sw_1"],
    });

    if (!result.ok) throw new Error(result.message);
    expect(result.id).toMatch(/^coh_/);
    expect(result.licenseWarnings).toEqual([
      { softwareId: "sw_1", softwareName: "Revit", capacity: 10, available: 0 },
    ]);
  });

  it("createCohort (005, US4) sin capacidad o sin software declarado no genera licenseWarnings", async () => {
    pushCourseExists();
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.licenseWarnings).toEqual([]);
  });

  it("createCohort (005 T034, US5, FR-008) calcula scheduleWarnings sin bloquear la creación", async () => {
    pushCourseExists();
    pushTeacherExists();
    selectQueue.push([
      {
        cohort: {
          id: "coh_other",
          courseId: "crs_1",
          startDate: new Date("2026-08-01"),
          endDate: new Date("2026-09-30"),
        },
        course: { id: "crs_1", name: "Civil3D" },
      },
    ]);
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-09-15"),
      teacherId: "tch_1",
    });

    if (!result.ok) throw new Error(result.message);
    expect(result.id).toMatch(/^coh_/);
    expect(result.scheduleWarnings).toHaveLength(1);
    expect(result.scheduleWarnings[0]!.cohortId).toBe("coh_other");
  });

  it("updateCourse solo actualiza los campos presentes en el input (feedback en vivo: faltaba editar cursos)", async () => {
    const { updateCourse } = await import("@/server/courses");
    const result = await updateCourse("org_1", "crs_1", { name: "Revit Arquitectura" });

    expect(result).not.toBeNull();
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.name).toBe("Revit Arquitectura");
    expect("description" in set).toBe(false);
  });

  it("createCohort (005, US5) sin teacherId no genera scheduleWarnings", async () => {
    pushCourseExists();
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.scheduleWarnings).toEqual([]);
  });

  it("createCohort (iteración 2) acepta name/startTime/endTime para el calendario", async () => {
    pushCourseExists();
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      name: "Revit Arquitectura 4",
      startTime: "18:30",
      endTime: "20:30",
    });

    if (!result.ok) throw new Error(result.message);
    const values = inserts[0]!.values as {
      name: string;
      startTime: string;
      endTime: string;
    };
    expect(values.name).toBe("Revit Arquitectura 4");
    expect(values.startTime).toBe("18:30");
    expect(values.endTime).toBe("20:30");
  });

  it("createCohort (iteración 2) sin name/startTime/endTime usa null (curso queda como nombre principal)", async () => {
    pushCourseExists();
    const { createCohort } = await import("@/server/courses");
    const result = await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
    });

    if (!result.ok) throw new Error(result.message);
    const values = inserts[0]!.values as {
      name: string | null;
      startTime: string | null;
      endTime: string | null;
    };
    expect(values.name).toBeNull();
    expect(values.startTime).toBeNull();
    expect(values.endTime).toBeNull();
  });

  it("updateCohort (iteración 2) solo actualiza name/startTime/endTime cuando vienen en el input", async () => {
    const { updateCohort } = await import("@/server/courses");
    await updateCohort("org_1", "coh_1", { name: "Revit Arquitectura 4" });

    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.name).toBe("Revit Arquitectura 4");
    expect("startTime" in set).toBe(false);
    expect("endTime" in set).toBe(false);
  });

  it("createCohort (iteración 4) acepta daysOfWeek para el calendario semanal", async () => {
    pushCourseExists();
    const { createCohort } = await import("@/server/courses");
    await createCohort("org_1", {
      courseId: "crs_revit",
      startDate: new Date("2026-08-04"),
      daysOfWeek: "0,2",
    });

    const values = inserts[0]!.values as { daysOfWeek: string | null };
    expect(values.daysOfWeek).toBe("0,2");
  });
});

describe("computeCohortStatus (iteración 4, feedback en vivo: status automático por fecha)", () => {
  it("hoy antes de startDate → planificada", async () => {
    const { computeCohortStatus } = await import("@/server/courses");
    const result = computeCohortStatus(
      new Date("2026-09-01"),
      new Date("2026-10-01"),
      new Date("2026-08-01")
    );
    expect(result).toBe("planificada");
  });

  it("hoy entre startDate y endDate → en_curso", async () => {
    const { computeCohortStatus } = await import("@/server/courses");
    const result = computeCohortStatus(
      new Date("2026-08-01"),
      new Date("2026-10-01"),
      new Date("2026-09-01")
    );
    expect(result).toBe("en_curso");
  });

  it("hoy después de endDate → finalizada", async () => {
    const { computeCohortStatus } = await import("@/server/courses");
    const result = computeCohortStatus(
      new Date("2026-01-01"),
      new Date("2026-02-01"),
      new Date("2026-08-01")
    );
    expect(result).toBe("finalizada");
  });

  it("sin endDate y ya empezada → en_curso indefinidamente (mismo criterio que DV-006)", async () => {
    const { computeCohortStatus } = await import("@/server/courses");
    const result = computeCohortStatus(new Date("2026-01-01"), null, new Date("2026-12-31"));
    expect(result).toBe("en_curso");
  });
});
