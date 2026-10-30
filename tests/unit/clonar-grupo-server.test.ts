import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Basar en un grupo existente" — el servidor: qué escribe y por dónde.
 *
 * - El grupo nace por `createCohort` con los datos del FORMULARIO; cada
 *   módulo, con su configuración y las fechas elegidas.
 * - Las evaluaciones van por `copyAssessments` —el único camino de copia—
 *   con los plazos ya corridos.
 * - Lo ÚNICO que se inserta directo es material (el de las clases, como del
 *   grupo con su clase de origen): nunca inscripciones, asistencia, clases,
 *   entregas ni nada de las personas.
 * - Fechas inválidas: 422 sin escribir nada.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve([values]);
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) =>
              col === "__tabla" ? String(tableName) : `${String(tableName)}.${String(col)}`,
          }
        ),
    }
  ),
}));

const createCohort = vi.fn();
vi.mock("@/server/courses", () => ({ createCohort: (...a: unknown[]) => createCohort(...a) }));

const copyAssessments = vi.fn();
const listAssessments = vi.fn();
vi.mock("@/server/grading", () => ({
  copyAssessments: (...a: unknown[]) => copyAssessments(...a),
  listAssessments: (...a: unknown[]) => listAssessments(...a),
}));

vi.mock("@/server/access-expiry", () => ({
  zonaDeLaOrganizacion: async () => "America/Montevideo",
}));

function grupo(over: Record<string, unknown> = {}) {
  return {
    id: "coh_old",
    courseId: "crs_1",
    courseName: "Revit",
    name: "Revit 2025",
    parentCohortId: null,
    position: null,
    isSpecialization: false,
    registrationStatus: null,
    startDate: new Date("2025-08-04T00:00:00Z"),
    endDate: new Date("2025-11-28T00:00:00Z"),
    deliveryDeadline: new Date("2025-12-15T00:00:00Z"),
    teacherId: "tch_1",
    cost: 1_500_000,
    currency: "UYU",
    minAttendancePct: 75,
    frequency: "lun y mié",
    startTime: "18:30",
    endTime: "20:30",
    daysOfWeek: "0,2",
    classroom: "Aula 1",
    capacity: 20,
    virtualRoomId: "room_1",
    virtualRoomArchivedAt: null,
    ...over,
  };
}

let seq = 0;

beforeEach(() => {
  inserts.length = 0;
  selectQueue.length = 0;
  seq = 0;
  createCohort.mockReset();
  createCohort.mockImplementation(async () => ({
    ok: true,
    id: `coh_new_${++seq}`,
    licenseWarnings: [],
    scheduleWarnings: [],
    autoEnrolled: 0,
  }));
  copyAssessments.mockReset();
  copyAssessments.mockResolvedValue({
    ok: true,
    data: { copiadas: 1, omitidas: [], aviso: null, assessments: [] },
  });
  listAssessments.mockReset();
  listAssessments.mockResolvedValue([
    { id: "as_1", name: "TP 1", position: 0, required: true, dueAt: "2025-09-01T02:59:00.000Z" },
  ]);
});

/** Lo que manda el formulario: precargado del origen, con el profesor cambiado. */
function formulario(over: Record<string, unknown> = {}) {
  return {
    courseId: "crs_1",
    name: "Revit 2026",
    startDate: new Date("2026-03-02T00:00:00Z"),
    endDate: new Date("2026-06-26T00:00:00Z"),
    deliveryDeadline: new Date("2026-07-13T00:00:00Z"),
    teacherId: "tch_2",
    daysOfWeek: "0,2",
    softwareIds: ["sw_1"],
    isSpecialization: false,
    ...over,
  };
}

const materialDelGrupo = [
  { title: "Guía", url: "https://x.uy/g", kind: "enlace", position: 0, courseModuleId: null },
];
const materialDeClase = [
  {
    title: "Ejercicio muros",
    url: "https://x.uy/m",
    kind: "ejemplo",
    courseModuleId: null,
    classNumber: 3,
    classDate: new Date("2025-08-13T00:00:00Z"),
    classTopic: "Muros",
  },
];

describe("crearGrupoBasadoEn", () => {
  it("crea el grupo con los datos del FORMULARIO y copia material y evaluaciones", async () => {
    selectQueue.push([grupo()], [], materialDelGrupo, materialDeClase);
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const r = await crearGrupoBasadoEn("org_1", formulario(), { cohortId: "coh_old", modules: [] });
    if (!r.ok) throw new Error(r.message);
    expect(r.id).toBe("coh_new_1");

    // El alta es la del formulario, tal cual (el profesor cambiado incluido).
    expect(createCohort).toHaveBeenCalledTimes(1);
    expect(createCohort.mock.calls[0]).toEqual(["org_1", formulario()]);

    // Evaluaciones: por el ÚNICO camino de copia, con el plazo corrido.
    const [, desde, hacia, opciones] = copyAssessments.mock.calls[0]!;
    expect([desde, hacia]).toEqual(["coh_old", "coh_new_1"]);
    expect((opciones as { plazos: Map<string, string | null> }).plazos.get("as_1")).toBe(
      "2026-03-30T02:59:00.000Z"
    );

    // Lo único que se inserta directo es material: el del grupo, y el de las
    // clases como material del grupo que recuerda su clase.
    expect(inserts.map((i) => (i.table as { __tabla: string }).__tabla)).toEqual(["resource"]);
    const filas = inserts[0]!.values as Record<string, unknown>[];
    expect(filas).toEqual([
      expect.objectContaining({ cohortId: "coh_new_1", title: "Guía", organizationId: "org_1" }),
      expect.objectContaining({
        cohortId: "coh_new_1",
        title: "Ejercicio muros",
        position: 1,
        originClassNumber: 3,
        originClassLabel: "Clase 3 · 13/08 · Muros",
      }),
    ]);
    expect(filas.some((f) => "classSessionId" in f)).toBe(false);
  });

  it("un plazo que pasa la entrega final ELEGIDA queda vacío, con aviso", async () => {
    selectQueue.push([grupo()], [], [], []);
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const r = await crearGrupoBasadoEn(
      "org_1",
      formulario({
        endDate: new Date("2026-03-20T00:00:00Z"),
        deliveryDeadline: new Date("2026-03-25T00:00:00Z"),
      }),
      { cohortId: "coh_old", modules: [] }
    );
    if (!r.ok) throw new Error(r.message);
    const plazos = (copyAssessments.mock.calls[0]![3] as { plazos: Map<string, string | null> }).plazos;
    expect(plazos.get("as_1")).toBeNull();
    expect(r.avisos).toEqual(["El plazo de «TP 1» quedó sin fecha: pasaba la entrega final."]);
  });

  it("una especialización clona cada módulo colgado de la nueva, en su orden y con sus fechas", async () => {
    selectQueue.push(
      [grupo({ isSpecialization: true, name: "BIM 2025" })],
      [
        grupo({
          id: "mod_1",
          name: null,
          courseName: "Módulo Revit",
          parentCohortId: "coh_old",
          position: 10,
          deliveryDeadline: null,
        }),
        grupo({ id: "mod_2", name: "Módulo 2", parentCohortId: "coh_old", position: 20, deliveryDeadline: null }),
      ],
      [], // material de la madre
      [], // material de clases de la madre
      [], // mod_1: software
      [], // mod_1: material
      [], // mod_1: material de clases
      [], // mod_2: software
      [], // mod_2: material
      [] // mod_2: material de clases
    );
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const r = await crearGrupoBasadoEn(
      "org_1",
      formulario({
        isSpecialization: true,
        name: "BIM 2026",
        endDate: new Date("2026-12-15T00:00:00Z"),
        deliveryDeadline: null,
      }),
      {
        cohortId: "coh_old",
        modules: [
          { sourceCohortId: "mod_2", startDate: "2026-07-01", endDate: "2026-11-30" },
          { sourceCohortId: "mod_1", startDate: "2026-03-02", endDate: "2026-06-30" },
        ],
      }
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.moduleIds).toEqual(["coh_new_2", "coh_new_3"]);

    const llamadas = createCohort.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(llamadas[1]).toMatchObject({
      parentCohortId: "coh_new_1",
      position: 10,
      name: null,
      teacherId: "tch_1",
      startDate: new Date("2026-03-02T00:00:00Z"),
      endDate: new Date("2026-06-30T00:00:00Z"),
      isSpecialization: false,
    });
    expect(llamadas[1]).not.toHaveProperty("meetingUrl");
    expect(llamadas[1]).not.toHaveProperty("whatsappGroupLink");
    expect(llamadas[2]).toMatchObject({ parentCohortId: "coh_new_1", position: 20, name: "Módulo 2" });
    expect(copyAssessments.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ["coh_old", "coh_new_1"],
      ["mod_1", "coh_new_2"],
      ["mod_2", "coh_new_3"],
    ]);
    expect(inserts).toEqual([]);
  });

  it("con módulos, el grupo nuevo tiene que ser especialización: 422 sin escribir", async () => {
    selectQueue.push(
      [grupo({ isSpecialization: true })],
      [grupo({ id: "mod_1", parentCohortId: "coh_old" })]
    );
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const r = await crearGrupoBasadoEn("org_1", formulario(), {
      cohortId: "coh_old",
      modules: [{ sourceCohortId: "mod_1", startDate: "2026-03-02", endDate: null }],
    });
    expect(r).toMatchObject({ ok: false, status: 422, code: "clonar_necesita_especializacion" });
    expect(createCohort).not.toHaveBeenCalled();
  });

  it("fechas de módulo inválidas: 422 sin escribir nada", async () => {
    selectQueue.push(
      [grupo({ isSpecialization: true })],
      [grupo({ id: "mod_1", parentCohortId: "coh_old" })]
    );
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const r = await crearGrupoBasadoEn("org_1", formulario({ isSpecialization: true }), {
      cohortId: "coh_old",
      modules: [{ sourceCohortId: "mod_1", startDate: "2026-05-02", endDate: "2026-04-01" }],
    });
    expect(r).toMatchObject({ ok: false, status: 422, code: "fechas_invalidas" });
    expect(createCohort).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("un módulo suelto, una edición de taller o un grupo inexistente no sirven de base", async () => {
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const base = { cohortId: "coh_old", modules: [] };
    selectQueue.push([grupo({ parentCohortId: "coh_madre" })]);
    expect(await crearGrupoBasadoEn("org_1", formulario(), base)).toMatchObject({
      ok: false,
      code: "clonar_modulo",
    });
    selectQueue.push([grupo({ registrationStatus: "abierta" })]);
    expect(await crearGrupoBasadoEn("org_1", formulario(), base)).toMatchObject({
      ok: false,
      code: "clonar_taller",
    });
    selectQueue.push([]);
    expect(await crearGrupoBasadoEn("org_1", formulario(), base)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(createCohort).not.toHaveBeenCalled();
  });

  it("si algo falla después de la primera escritura, LANZA (revierte el pedido)", async () => {
    selectQueue.push([grupo()], [], [], []);
    copyAssessments.mockResolvedValue({ ok: false, status: 404, code: "not_found", message: "x" });
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    await expect(
      crearGrupoBasadoEn("org_1", formulario(), { cohortId: "coh_old", modules: [] })
    ).rejects.toThrow(/evaluaciones/);
  });

  it("si el alta del grupo da 422, se devuelve tal cual y no se copia nada", async () => {
    selectQueue.push([grupo()], []);
    createCohort.mockResolvedValueOnce({
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "Profesor inexistente",
    });
    const { crearGrupoBasadoEn } = await import("@/server/clonar-grupo");
    const r = await crearGrupoBasadoEn("org_1", formulario(), { cohortId: "coh_old", modules: [] });
    expect(r).toMatchObject({ ok: false, code: "invalid_body" });
    expect(copyAssessments).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });
});
