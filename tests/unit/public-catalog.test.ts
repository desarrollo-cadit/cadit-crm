import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (T044, US7, DV-010, FR-020/FR-021/FR-022): `resolveSoleOrganizationId`
 * resuelve la única organización de la instancia (0 o 2+ → null, ambiguo);
 * el DTO de catálogo público nunca expone campos de `contact`/`enrollment`/
 * `license`/`teacher`/`cost`/etc.; 404 en curso inexistente. El filtrado
 * real de "cohorte ya iniciada" (start_date > now()) se construye en SQL y se
 * verifica en vivo (T047) — acá se verifica la FORMA del DTO, mismo criterio
 * que `enrollment-constraints.test.ts`.
 *
 * 006 — el DTO crece con la ficha comercial (tagline, categoría, nivel,
 * modalidad, duración, imagen) y el detalle suma temario estructurado. La
 * garantía FR-022 no se relaja: los tests de abajo verifican explícitamente
 * que ningún campo de alumno/dinero se cuele en el DTO nuevo.
 */

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "where", "orderBy", "limit"]) {
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

/** Fila tal como la devuelve `publicCourseColumns` (curso + join de categoría). */
function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "crs_1",
    slug: "revit-arquitectura",
    name: "Revit Arquitectura",
    tagline: null,
    description: "Curso de BIM",
    imageUrl: null,
    level: null,
    modality: null,
    durationWeeks: null,
    hoursPerWeek: null,
    classCount: null,
    hoursPerClass: null,
    totalHours: null,
    learningObjectives: null,
    targetAudience: null,
    syllabusUrl: null,
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    ...overrides,
  };
}

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

describe("listPublicCourses (T041/006, FR-020/FR-021/FR-022)", () => {
  it("expone la ficha comercial y NADA más (FR-022)", async () => {
    selectQueue.push(
      [{ id: "org_1" }],
      [
        courseRow({
          tagline: "Modelá en BIM desde cero",
          level: "inicial",
          modality: "en_vivo",
          durationWeeks: 12,
          hoursPerWeek: 4,
          classCount: 15,
          hoursPerClass: "2.50",
          totalHours: "37.50",
          imageUrl: "https://x/portada.jpg",
          categoryId: "cat_1",
          categoryName: "BIM",
          categorySlug: "bim",
        }),
      ],
      [
        {
          id: "coh_1",
          courseId: "crs_1",
          startDate: new Date("2026-09-15"),
          endDate: new Date("2026-11-20"),
          // Contrato interno: 0 = lunes … 6 = domingo.
          daysOfWeek: "1,3",
          startTime: "18:30",
          endTime: "21:00",
          timeZone: "America/Montevideo",
        },
      ]
    );
    const { listPublicCourses } = await import("@/server/public-catalog");

    const courses = await listPublicCourses();

    expect(courses).toEqual([
      {
        id: "crs_1",
        slug: "revit-arquitectura",
        name: "Revit Arquitectura",
        tagline: "Modelá en BIM desde cero",
        imageUrl: "https://x/portada.jpg",
        category: { id: "cat_1", name: "BIM", slug: "bim" },
        level: "inicial",
        modality: "en_vivo",
        // Nuevos: numeric llega como texto y sale como número (horas, no plata).
        classCount: 15,
        hoursPerClass: 2.5,
        totalHours: 37.5,
        // Deprecados: lo guardado, de solo lectura, para no romper la web.
        durationWeeks: 12,
        hoursPerWeek: 4,
        nextCohorts: [
          {
            id: "coh_1",
            startDate: "2026-09-15T00:00:00.000Z",
            // Público: ISO 8601, 1 = lunes … 7 = domingo (martes y jueves).
            daysOfWeek: [2, 4],
            startTime: "18:30",
            endTime: "21:00",
            timeZone: "America/Montevideo",
            teacher: null,
          },
        ],
      },
    ]);
    /**
     * 023 — La cohorte pública ahora SÍ expone al profesor, por pedido del
     * dueño: quien mira una cohorte en la web quiere saber quién se la dicta.
     *
     * Lo que sigue sin salir es lo que importa: **ni costo, ni cupo, ni el
     * correo del profesor, ni su tarifa por hora**. Es catálogo comercial, no
     * la ficha interna.
     */
    expect(Object.keys(courses[0]!.nextCohorts[0]!)).toEqual([
      "id",
      "startDate",
      "daysOfWeek",
      "startTime",
      "endTime",
      "timeZone",
      "teacher",
    ]);
    const crudo = JSON.stringify(courses);
    // 2026-10-27 — La fecha de fin tampoco sale (decisión del dueño), aunque la fila la traiga.
    for (const prohibido of ["cost", "capacity", "email", "hourlyRate", "endDate"]) {
      expect(crudo, `el catálogo público filtró ${prohibido}`).not.toContain(prohibido);
    }
  });

  it("un curso sin categoría asignada devuelve category: null, no un objeto a medias", async () => {
    selectQueue.push([{ id: "org_1" }], [courseRow()], []);
    const { listPublicCourses } = await import("@/server/public-catalog");
    const courses = await listPublicCourses();
    expect(courses[0]!.category).toBeNull();
  });

  it("sin organización resoluble, devuelve lista vacía (no explota ni expone nada)", async () => {
    selectQueue.push([]); // resolveSoleOrganizationId → null
    const { listPublicCourses } = await import("@/server/public-catalog");
    expect(await listPublicCourses()).toEqual([]);
  });

  /**
   * El doble de la base ignora los joins, así que se mira el código: el
   * profesor se resuelve con `organization_id` además de la FK, igual que la
   * categoría. Sin eso, una cohorte apuntada a un profesor ajeno publica su
   * nombre y su foto en un endpoint sin sesión.
   */
  it("el profesor se une con organization_id explícito, no solo por la FK", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/server/public-catalog.ts", "utf8");
    expect(src).toMatch(
      /eq\(schema\.cohort\.teacherId, schema\.teacher\.id\),\s*eq\(schema\.teacher\.organizationId, organizationId\)/
    );
  });

  it("cohorte sin días ni horario: null y [] en vez de inventar datos", async () => {
    selectQueue.push(
      [{ id: "org_1" }],
      [courseRow()],
      [
        {
          id: "coh_1",
          courseId: "crs_1",
          startDate: new Date("2026-09-15"),
          endDate: null,
          daysOfWeek: null,
          startTime: null,
          endTime: null,
          timeZone: null,
        },
      ]
    );
    const { listPublicCourses } = await import("@/server/public-catalog");
    const [cohorte] = (await listPublicCourses())[0]!.nextCohorts;
    expect(cohorte).toMatchObject({
      daysOfWeek: [],
      startTime: null,
      endTime: null,
      timeZone: "America/Montevideo",
    });
  });

  it("días guardados con basura o repetidos: solo los válidos, en orden y sin repetir", async () => {
    selectQueue.push(
      [{ id: "org_1" }],
      [courseRow()],
      [{ id: "coh_1", courseId: "crs_1", startDate: new Date("2026-09-15"), daysOfWeek: "6, 0,x,0,9" }]
    );
    const { listPublicCourses } = await import("@/server/public-catalog");
    const [cohorte] = (await listPublicCourses())[0]!.nextCohorts;
    expect(cohorte!.daysOfWeek).toEqual([1, 7]);
  });

  it("curso sin cohortes futuras → nextCohorts vacío, no un error (edge case spec.md)", async () => {
    selectQueue.push([{ id: "org_1" }], [courseRow()], []);
    const { listPublicCourses } = await import("@/server/public-catalog");
    const courses = await listPublicCourses();
    expect(courses[0]!.nextCohorts).toEqual([]);
  });
});

describe("getPublicCourse (T041/006, FR-020/FR-021/FR-022)", () => {
  it("404 (null) si el curso no existe en la organización de la instancia", async () => {
    selectQueue.push([{ id: "org_1" }], []); // resolveSoleOrganizationId, courseRows vacío
    const { getPublicCourse } = await import("@/server/public-catalog");
    expect(await getPublicCourse("crs_x")).toBeNull();
  });

  it("006 — el temario sale del curso (módulos ordenados), no de la cohorte", async () => {
    selectQueue.push(
      [{ id: "org_1" }],
      [
        courseRow({
          syllabusUrl: "https://x/temario.pdf",
          learningObjectives: ["Modelar en Revit", "Documentar un proyecto"],
          targetAudience: "Arquitectos y estudiantes",
        }),
      ],
      [{ id: "coh_1", courseId: "crs_1", startDate: new Date("2026-10-01") }],
      [
        { title: "Fundamentos", topics: ["Interfaz", "Niveles"] },
        { title: "Documentación", topics: ["Planos"] },
      ]
    );
    const { getPublicCourse } = await import("@/server/public-catalog");

    const course = await getPublicCourse("revit-arquitectura");

    expect(course?.syllabusUrl).toBe("https://x/temario.pdf");
    expect(course?.modules).toEqual([
      { title: "Fundamentos", topics: ["Interfaz", "Niveles"] },
      { title: "Documentación", topics: ["Planos"] },
    ]);
    expect(course?.learningObjectives).toEqual([
      "Modelar en Revit",
      "Documentar un proyecto",
    ]);
    expect(course?.targetAudience).toBe("Arquitectos y estudiantes");
  });

  it("curso sin objetivos ni temario cargados devuelve arrays vacíos, no null", async () => {
    selectQueue.push([{ id: "org_1" }], [courseRow()], [], []);
    const { getPublicCourse } = await import("@/server/public-catalog");
    const course = await getPublicCourse("crs_1");
    expect(course?.learningObjectives).toEqual([]);
    expect(course?.modules).toEqual([]);
  });

  it("FR-022 — el detalle nunca incluye costo, cupo, profesor ni datos de alumnos", async () => {
    selectQueue.push([{ id: "org_1" }], [courseRow()], [], []);
    const { getPublicCourse } = await import("@/server/public-catalog");
    const course = await getPublicCourse("crs_1");

    const serialized = JSON.stringify(course);
    for (const forbidden of [
      "cost",
      "capacity",
      "teacher",
      "contact",
      "enrollment",
      "license",
      "amount",
      "invoice",
      "classroom",
      "whatsapp",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});
