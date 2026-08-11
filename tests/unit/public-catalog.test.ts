import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (T044, US7, DV-010, FR-020/FR-021/FR-022): `resolveSoleOrganizationId`
 * resuelve la única organización de la instancia (0 o 2+ → null, ambiguo);
 * el DTO de catálogo público nunca expone campos de `contact`/`enrollment`/
 * `license`/`teacher`/`cost`/etc.; 404 en curso inexistente. El filtrado
 * real de "camada ya iniciada" (start_date > now()) se construye en SQL y se
 * verifica en vivo (T047) — acá se verifica la FORMA del DTO, mismo criterio
 * que `enrollment-constraints.test.ts`.
 */

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
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

beforeEach(() => {
  selectQueue.length = 0;
});

describe("resolveSoleOrganizationId (T041, DV-010)", () => {
  it("exactamente una organización → devuelve su id", async () => {
    const { resolveSoleOrganizationId } = await import("@/server/public-catalog");
    selectQueue.push([{ id: "org_1" }]);
    expect(await resolveSoleOrganizationId()).toBe("org_1");
  });

  it("cero organizaciones → null (instancia recién levantada)", async () => {
    const { resolveSoleOrganizationId } = await import("@/server/public-catalog");
    selectQueue.push([]);
    expect(await resolveSoleOrganizationId()).toBeNull();
  });

  it("más de una organización → null (ambiguo, no se adivina)", async () => {
    const { resolveSoleOrganizationId } = await import("@/server/public-catalog");
    selectQueue.push([{ id: "org_1" }, { id: "org_2" }]);
    expect(await resolveSoleOrganizationId()).toBeNull();
  });
});

describe("listPublicCourses (T041, FR-020/FR-021/FR-022)", () => {
  it("el DTO solo trae id/name/description/nextCohorts — nunca datos internos", async () => {
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [{ id: "crs_1", name: "Revit Arquitectura", description: "Curso de BIM" }], // courses
      [{ id: "coh_1", courseId: "crs_1", startDate: new Date("2026-09-15") }] // cohorts futuras
    );
    const { listPublicCourses } = await import("@/server/public-catalog");

    const courses = await listPublicCourses();

    expect(courses).toEqual([
      {
        id: "crs_1",
        name: "Revit Arquitectura",
        description: "Curso de BIM",
        nextCohorts: [{ id: "coh_1", startDate: "2026-09-15T00:00:00.000Z" }],
      },
    ]);
    expect(Object.keys(courses[0]!)).toEqual(["id", "name", "description", "nextCohorts"]);
    expect(Object.keys(courses[0]!.nextCohorts[0]!)).toEqual(["id", "startDate"]);
  });

  it("sin organización resoluble, devuelve lista vacía (no explota ni expone nada)", async () => {
    selectQueue.push([]); // resolveSoleOrganizationId → null
    const { listPublicCourses } = await import("@/server/public-catalog");
    expect(await listPublicCourses()).toEqual([]);
  });

  it("curso sin camadas futuras → nextCohorts vacío, no un error (edge case spec.md)", async () => {
    selectQueue.push([{ id: "org_1" }], [{ id: "crs_1", name: "Revit", description: null }], []);
    const { listPublicCourses } = await import("@/server/public-catalog");
    const courses = await listPublicCourses();
    expect(courses[0]!.nextCohorts).toEqual([]);
  });
});

describe("getPublicCourse (T041, FR-020/FR-021)", () => {
  it("404 (null) si el curso no existe en la organización de la instancia", async () => {
    selectQueue.push([{ id: "org_1" }], []); // resolveSoleOrganizationId, courseRows vacío
    const { getPublicCourse } = await import("@/server/public-catalog");
    expect(await getPublicCourse("crs_x")).toBeNull();
  });

  it("syllabusUrl toma el de la primera camada futura que lo declare; null si ninguna", async () => {
    selectQueue.push(
      [{ id: "org_1" }],
      [{ id: "crs_1", name: "Revit", description: "..." }],
      [
        { id: "coh_1", startDate: new Date("2026-09-01"), syllabusUrl: null },
        { id: "coh_2", startDate: new Date("2026-10-01"), syllabusUrl: "https://x/temario.pdf" },
      ]
    );
    const { getPublicCourse } = await import("@/server/public-catalog");
    const course = await getPublicCourse("crs_1");
    expect(course?.syllabusUrl).toBe("https://x/temario.pdf");
    expect(Object.keys(course!)).toEqual([
      "id",
      "name",
      "description",
      "syllabusUrl",
      "nextCohorts",
    ]);
  });
});
