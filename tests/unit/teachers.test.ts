import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (T035, US5, DV-006, FR-008): superposición de rango de fechas
 * detectada entre dos cohortes del MISMO profesor; cohortes de profesores
 * distintos no generan advertencia; `endDate` NULL se trata como "en curso".
 */

const selectQueue: unknown[][] = [];
const updates: { table: unknown; set: unknown }[] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const deletes: { table: unknown }[] = [];

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
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "tch_1", ...(set as object) }]),
          }),
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve([values]);
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

const saveMediaFile = vi.fn().mockResolvedValue("org_1/tch-photo-tch_1");
const readMediaFile = vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes"));

vi.mock("@/server/whatsapp/media", () => ({
  MEDIA_LIMITS: {
    image: {
      maxBytes: 5 * 1024 * 1024,
      mimes: /^image\/(jpeg|png|webp)$/,
      label: "imagen (jpeg/png/webp, máx. 5 MB)",
    },
  },
  saveMediaFile: (...args: unknown[]) => saveMediaFile(...args),
  readMediaFile: (...args: unknown[]) => readMediaFile(...args),
}));

function cohortRow(
  id: string,
  startDate: string,
  endDate: string | null,
  courseName = "Revit"
) {
  return {
    cohort: {
      id,
      courseId: "crs_1",
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
    },
    course: { id: "crs_1", name: courseName },
  };
}

describe("findScheduleConflicts (T033, DV-006)", () => {
  it("detecta superposición entre dos cohortes del mismo profesor", async () => {
    const { findScheduleConflicts } = await import("@/server/teachers");
    selectQueue.push([cohortRow("coh_existing", "2026-08-01", "2026-09-30")]);

    const conflicts = await findScheduleConflicts(
      "org_1",
      "tch_1",
      new Date("2026-09-01"),
      new Date("2026-10-15")
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.cohortId).toBe("coh_existing");
  });

  it("sin superposición (fechas no se cruzan) → sin advertencia", async () => {
    const { findScheduleConflicts } = await import("@/server/teachers");
    selectQueue.push([cohortRow("coh_existing", "2026-01-01", "2026-02-01")]);

    const conflicts = await findScheduleConflicts(
      "org_1",
      "tch_1",
      new Date("2026-09-01"),
      new Date("2026-10-15")
    );

    expect(conflicts).toHaveLength(0);
  });

  it("endDate NULL (en curso) se solapa con cualquier fecha posterior al inicio", async () => {
    const { findScheduleConflicts } = await import("@/server/teachers");
    selectQueue.push([cohortRow("coh_ongoing", "2026-01-01", null)]);

    const conflicts = await findScheduleConflicts(
      "org_1",
      "tch_1",
      new Date("2027-01-01"),
      new Date("2027-02-01")
    );

    expect(conflicts).toHaveLength(1);
  });

  it("excluye la propia cohorte (excludeCohortId) al editar", async () => {
    const { findScheduleConflicts } = await import("@/server/teachers");
    selectQueue.push([cohortRow("coh_self", "2026-08-01", "2026-09-30")]);

    const conflicts = await findScheduleConflicts(
      "org_1",
      "tch_1",
      new Date("2026-08-01"),
      new Date("2026-09-30"),
      "coh_self"
    );

    expect(conflicts).toHaveLength(0);
  });
});

/**
 * 005 iteración 2 (feedback en vivo: pestaña "Profesores" en /academico) —
 * `updateTeacher` reemplaza los cursos que dicta (teacher_course) y edita
 * costo por hora; `listTeachers`/`getTeacher` resuelven `courseIds`.
 */
describe("updateTeacher / listTeachers / getTeacher (iteración 2)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    updates.length = 0;
    inserts.length = 0;
    deletes.length = 0;
  });

  it("updateTeacher solo actualiza los campos presentes en el input", async () => {
    const { updateTeacher } = await import("@/server/teachers");
    const result = await updateTeacher("org_1", "tch_1", { hourlyRate: 500 });

    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.hourlyRate).toBe(500);
    expect("name" in set).toBe(false);
  });

  it("updateTeacher con courseIds reemplaza la relación (delete + insert)", async () => {
    selectQueue.push([{ id: "crs_1" }, { id: "crs_2" }]); // validación de FK: ambos cursos pertenecen a la org
    const { updateTeacher } = await import("@/server/teachers");
    const result = await updateTeacher("org_1", "tch_1", {
      courseIds: ["crs_1", "crs_2"],
    });

    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(1);
    // Igual que en `cohort_software`: la organización se escribe explícita.
    const values = inserts[0]!.values as {
      organizationId: string;
      teacherId: string;
      courseId: string;
    }[];
    expect(values).toEqual([
      { organizationId: "org_1", teacherId: "tch_1", courseId: "crs_1" },
      { organizationId: "org_1", teacherId: "tch_1", courseId: "crs_2" },
    ]);
    if (!result.ok) throw new Error(result.message);
    expect(result.teacher.courseIds).toEqual(["crs_1", "crs_2"]);
  });

  it("updateTeacher rechaza un courseId que no pertenece a la organización (hallazgo del reviewer)", async () => {
    selectQueue.push([{ id: "crs_1" }]); // pidió crs_1 y crs_de_otra_org, solo crs_1 pertenece
    const { updateTeacher } = await import("@/server/teachers");
    const result = await updateTeacher("org_1", "tch_1", {
      courseIds: ["crs_1", "crs_de_otra_org"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber actualizado");
    expect(result.code).toBe("invalid_body");
    expect(updates).toHaveLength(0);
  });

  it("updateTeacher con courseIds vacío borra la relación sin insertar", async () => {
    const { updateTeacher } = await import("@/server/teachers");
    await updateTeacher("org_1", "tch_1", { courseIds: [] });

    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });

  it("listTeachers resuelve courseIds por profesor en una sola query extra", async () => {
    selectQueue.push(
      [{ id: "tch_1", name: "Ing. Paola Suárez", hourlyRate: 400, photoMimeType: null }],
      [{ teacherId: "tch_1", courseId: "crs_1" }]
    );

    const { listTeachers } = await import("@/server/teachers");
    const rows = await listTeachers("org_1");

    expect(rows).toEqual([
      {
        id: "tch_1",
        name: "Ing. Paola Suárez",
        hourlyRate: 400,
        courseIds: ["crs_1"],
        hasPhoto: false,
      },
    ]);
  });

  it("getTeacher devuelve null si no existe", async () => {
    selectQueue.push([]);
    const { getTeacher } = await import("@/server/teachers");
    const result = await getTeacher("org_1", "tch_x");
    expect(result).toBeNull();
  });
});

describe("saveTeacherPhoto / getTeacherPhoto (005 iteración 5)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    updates.length = 0;
    saveMediaFile.mockClear();
    readMediaFile.mockClear();
  });

  it("rechaza un mime type no soportado sin tocar disco", async () => {
    const { saveTeacherPhoto } = await import("@/server/teachers");
    const result = await saveTeacherPhoto("org_1", "tch_1", {
      mimeType: "application/pdf",
      sizeBytes: 1000,
      data: Buffer.from("x"),
    });
    expect(result.ok).toBe(false);
    expect(saveMediaFile).not.toHaveBeenCalled();
  });

  it("404 si el profesor no pertenece a la organización", async () => {
    selectQueue.push([]);
    const { saveTeacherPhoto } = await import("@/server/teachers");
    const result = await saveTeacherPhoto("org_1", "tch_ajeno", {
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      data: Buffer.from("x"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("guarda el archivo y marca photoMimeType", async () => {
    selectQueue.push([{ id: "tch_1" }]);
    const { saveTeacherPhoto } = await import("@/server/teachers");
    const result = await saveTeacherPhoto("org_1", "tch_1", {
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      data: Buffer.from("x"),
    });
    expect(result.ok).toBe(true);
    expect(saveMediaFile).toHaveBeenCalledWith("org_1", "tch-photo-tch_1", expect.any(Buffer));
    expect(updates[0]!.set).toMatchObject({ photoMimeType: "image/jpeg" });
  });

  it("getTeacherPhoto devuelve null cuando no hay foto, sin tocar disco", async () => {
    selectQueue.push([{ photoMimeType: null }]);
    const { getTeacherPhoto } = await import("@/server/teachers");
    const result = await getTeacherPhoto("org_1", "tch_1");
    expect(result).toBeNull();
    expect(readMediaFile).not.toHaveBeenCalled();
  });
});
