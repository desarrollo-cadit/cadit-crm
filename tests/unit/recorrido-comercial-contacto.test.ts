import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 046 (T011; US1, FR-004) — El historial comercial del contacto: viaja con
 * `contactos.ver`, sin plata, y un contacto ajeno es 404.
 */

const selectQueue: unknown[][] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => chain(), selectDistinct: () => chain() }),
  schema: new Proxy(
    {},
    {
      get: (_t, tabla) =>
        new Proxy({}, { get: (_t2, col) => `${String(tabla)}.${String(col)}` }),
    }
  ),
}));

const { historialADto, recorridoComercialDelContacto } = await import("@/server/recorrido-comercial");

beforeEach(() => {
  selectQueue.length = 0;
});

describe("historialADto", () => {
  it("serializa fechas a ISO y solo lleva los campos del contrato (sin plata)", () => {
    const [dto] = historialADto([
      {
        courseId: "crs_arq",
        courseName: "Revit Arquitectura",
        categoryId: "cat_bim",
        estado: "aprobo",
        sinResultado: false,
        cohortId: "coh_1",
        cohortName: "Marzo",
        startDate: new Date("2025-03-01T00:00:00Z"),
        endDate: null,
        primerInicio: new Date("2025-03-01T00:00:00Z"),
        ultimoInicioCursado: new Date("2025-03-01T00:00:00Z"),
        veces: 1,
        activo: false,
        sellerId: null,
        companyId: null,
        especializacion: null,
      },
    ]);
    expect(dto).toEqual({
      courseId: "crs_arq",
      courseName: "Revit Arquitectura",
      estado: "aprobo",
      sinResultado: false,
      cohortId: "coh_1",
      cohortName: "Marzo",
      startDate: "2025-03-01T00:00:00.000Z",
      endDate: null,
      veces: 1,
      especializacion: null,
    });
  });
});

describe("recorridoComercialDelContacto", () => {
  it("contacto ajeno o inexistente → null (la ruta responde 404)", async () => {
    selectQueue.push([]); // el contacto no está en la organización
    expect(await recorridoComercialDelContacto("org_1", "ct_otro")).toBeNull();
  });

  it("contacto sin cursadas → historial vacío y sin sugerencias", async () => {
    selectQueue.push([{ id: "ct_1" }]); // el contacto
    selectQueue.push([]); // sus inscripciones
    expect(await recorridoComercialDelContacto("org_1", "ct_1")).toEqual({ historial: [], sugerencias: [] });
  });

  it("aprobó Arquitectura con ruta → MEP: sugiere MEP con su próximo grupo (US3)", async () => {
    selectQueue.push([{ id: "ct_1" }]); // el contacto
    selectQueue.push([
      {
        id: "enr_1",
        contactId: "ct_1",
        parentEnrollmentId: null,
        enrolledAt: null,
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
        waiverAuthorName: null,
        stageKind: "won",
        cohortId: "coh_arq",
        cohortName: "Marzo",
        startDate: new Date("2025-03-01"),
        endDate: new Date("2025-05-01"),
        confirmedAt: new Date("2025-02-01"),
        parentCohortId: null,
        cohortMinPct: null,
        courseId: "arq",
        courseName: "Revit Arquitectura",
        courseKind: "curso",
        categoryId: null,
        courseMinPct: null,
      },
    ]);
    selectQueue.push([{ timezone: "America/Montevideo" }]); // reloj
    // 2026-10-29 — con la lista tomada: un grupo sin asistencia completa no tiene resultado.
    selectQueue.push([
      { id: "cs_1", cohortId: "coh_arq", date: new Date("2025-03-05T00:00:00Z"), endTime: "21:00", canceledAt: null, tomada: true },
    ]); // clases
    selectQueue.push([]); // asistencias
    selectQueue.push([]); // evaluaciones
    selectQueue.push([]); // resultados
    selectQueue.push([{ enrollmentId: "enr_1", revokedAt: null }]); // certificado
    // 0086 — "aprobó" solo con el resultado final CONFIRMADO (el certificado sin
    // confirmación está suspendido y no cuenta).
    selectQueue.push([{ enrollmentId: "enr_1", result: "aprobado" }]); // resultado final
    selectQueue.push([]); // cursadas históricas (046 US6)
    selectQueue.push([{ fromCourseId: "arq", toCourseId: "mep", position: 0 }]); // rutas
    selectQueue.push([{ id: "mep", name: "Revit MEP", published: true, kind: "curso" }]); // cursos sugeridos
    selectQueue.push([
      {
        id: "coh_mep",
        name: "Noviembre",
        courseId: "mep",
        courseName: "Revit MEP",
        startDate: new Date("2026-11-10"),
        endDate: new Date("2026-12-20"),
        parentCohortId: null,
      },
    ]); // grupos
    const r = await recorridoComercialDelContacto("org_1", "ct_1", new Date("2026-10-23T12:00:00Z"));
    expect(r?.historial.map((e) => [e.courseId, e.estado])).toEqual([["arq", "aprobo"]]);
    expect(r?.sugerencias).toEqual([
      {
        courseId: "mep",
        courseName: "Revit MEP",
        porCursos: ["Revit Arquitectura"],
        proximoGrupo: { cohortId: "coh_mep", name: "Revit MEP — Noviembre", startDate: "2026-11-10" },
      },
    ]);
  });
});

describe("recorridoComercialDelContacto — cursadas históricas (046 US6)", () => {
  it("una cursada de la planilla figura como registro histórico y abre la ruta", async () => {
    selectQueue.push([{ id: "ct_1" }]); // el contacto
    selectQueue.push([]); // sin inscripciones
    selectQueue.push([
      {
        contactId: "ct_1",
        courseId: "arq",
        courseLabel: "Revit Arquitectura",
        catalogName: "Revit Arquitectura",
        categoryId: null,
        takenOn: new Date("2022-05-01T00:00:00Z"),
        edition: "9",
      },
      {
        contactId: "ct_1",
        courseId: null,
        courseLabel: "Dynamo",
        catalogName: null,
        categoryId: null,
        takenOn: new Date("2021-05-01T00:00:00Z"),
        edition: null,
      },
    ]); // cursadas históricas
    selectQueue.push([{ fromCourseId: "arq", toCourseId: "mep", position: 0 }]); // rutas
    selectQueue.push([{ id: "mep", name: "Revit MEP", published: true, kind: "curso" }]); // cursos
    selectQueue.push([]); // grupos
    const r = await recorridoComercialDelContacto("org_1", "ct_1", new Date("2026-10-23T12:00:00Z"));
    expect(r?.historial).toEqual([
      expect.objectContaining({ courseId: "arq", estado: "curso_historico", cohortId: null, cohortName: "Edición 9" }),
      expect.objectContaining({ courseId: "texto:dynamo", courseName: "Dynamo", estado: "curso_historico" }),
    ]);
    expect(r?.sugerencias.map((s) => s.courseId)).toEqual(["mep"]);
  });
});

describe("GET /api/contacts/[id]/recorrido-comercial", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src", "app", "api", "contacts", "[id]", "recorrido-comercial", "route.ts"),
    "utf8"
  );

  it("pide `contactos.ver` y responde 404 si no hay contacto", () => {
    expect(src).toMatch(/export const GET = requireCapability\(\s*"contactos\.ver"/);
    expect(src).toMatch(/apiError\(404, "not_found"/);
    expect(src).toContain("recorridoComercialDelContacto(");
  });
});
