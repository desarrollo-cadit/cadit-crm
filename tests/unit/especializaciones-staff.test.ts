import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 028 fase 4 — La superficie del STAFF.
 *
 * La fase 1 dejó el modelo y sus guardas, la fase 2 le enseñó a la capa de
 * cómputo a caminar el árbol y la fase 3 armó los dos portales. Falta la
 * pantalla desde la que la academia **opera** el programa, y son dos cosas:
 *
 * - **US3, mitad staff** — la camada padre muestra sus módulos ordenados por
 *   `position`, cada uno con su profesor, sus fechas, su avance de clases y el
 *   estado de aprobación de cada alumno POR MÓDULO. Un módulo sin cronograma
 *   se muestra igual, declarándolo: un módulo invisible es un módulo que nadie
 *   carga, y de ahí salieron los 0 `class_session` de las 9 camadas reales.
 * - **US4** — recursar un módulo en otra camada, por los dos caminos del
 *   dueño, que son el MISMO mecanismo y se distinguen sólo por la plata.
 *
 * El eje que atraviesa el archivo sigue siendo FR-032: las 33 cohortes simples
 * no se pueden mover ni un milímetro.
 */

/* ============================================================
 * El doble de base: cola posicional, como el resto de tests/unit
 * ============================================================ */

const selectQueue: unknown[][] = [];
const updates: { set: Record<string, unknown> }[] = [];
const inserts: unknown[] = [];
const deletes: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

/** `update().set().where().returning()` — se registra QUÉ columnas se tocaron. */
function updateChain(set: Record<string, unknown>) {
  updates.push({ set });
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.returning = async () => [{ id: "enr_hija_m3", cohortId: set.cohortId }];
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        // `createdAt` lo pone el DEFAULT de la base, así que la fila que
        // vuelve del `returning()` lo trae aunque el INSERT no lo mande.
        return {
          returning: async () => [{ createdAt: new Date("2026-09-08T12:00:00.000Z"), ...(values as object) }],
        };
      },
    }),
    update: () => ({ set: (s: Record<string, unknown>) => updateChain(s) }),
    delete: () => {
      deletes.push(true);
      return { where: async () => [] };
    },
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
  inserts.length = 0;
  deletes.length = 0;
  vi.resetModules();
});

const ORG = "org_1";
const AHORA = new Date("2026-09-08T12:00:00.000Z");

/* ============================================================
 * A — `position` es una CLAVE DE ORDEN, no una etiqueta
 * ============================================================ */

describe("la etiqueta del módulo sale del orden, nunca del número guardado", () => {
  /**
   * La trampa, dicha entera: alguien carga 10, 20 y 30 para poder insertar un
   * módulo en el medio sin renumerar. Es una decisión legítima y frecuente. Si
   * la pantalla imprime el número crudo, ese día la especialización pasa a
   * tener "Módulo 10, Módulo 20 y Módulo 30" y nadie entiende qué pasó.
   *
   * `position` ordena; el nombre propio de la cohorte de módulo rotula; y el
   * ordinal, cuando hace falta, sale del LUGAR en la lista ya ordenada.
   */
  it("con posiciones 10/20/30 los ordinales son 1, 2 y 3", async () => {
    const { etiquetaDeModulo } = await import("@/server/program-modules");
    const modulos = [
      { position: 10, cohortName: "Revit Arquitectura" },
      { position: 20, cohortName: "Revit Estructura" },
      { position: 30, cohortName: "Revit MEP" },
    ];
    const etiquetas = modulos.map((m, i) => etiquetaDeModulo(i + 1, m.cohortName));

    expect(etiquetas).toEqual([
      "Módulo 1 — Revit Arquitectura",
      "Módulo 2 — Revit Estructura",
      "Módulo 3 — Revit MEP",
    ]);
    expect(etiquetas.join(" ")).not.toContain("Módulo 10");
    expect(etiquetas.join(" ")).not.toContain("Módulo 30");
  });

  /** Sin orden que declarar, el nombre solo. Inventar un ordinal sería mentir. */
  it("sin ordinal, la etiqueta es el nombre pelado", async () => {
    const { etiquetaDeModulo } = await import("@/server/program-modules");
    expect(etiquetaDeModulo(null, "Revit MEP")).toBe("Revit MEP");
  });

  /**
   * Un guard estructural, porque la regla se rompe sola: escribir
   * `Módulo ${m.position}` es lo primero que sale al teclear.
   */
  it("ningún archivo de src/server/ imprime `Módulo ${position}`", () => {
    const dir = path.join(process.cwd(), "src", "server");
    const infractores: string[] = [];
    const stack = [dir];
    while (stack.length) {
      const actual = stack.pop()!;
      for (const entrada of readdirSync(actual, { withFileTypes: true })) {
        const full = path.join(actual, entrada.name);
        if (entrada.isDirectory()) stack.push(full);
        else if (entrada.name.endsWith(".ts")) {
          const src = readFileSync(full, "utf8");
          if (/Módulo \$\{[^}]*position/.test(src)) {
            infractores.push(path.relative(process.cwd(), full));
          }
        }
      }
    }
    expect(infractores, infractores.join("\n")).toEqual([]);
  });
});

/* ============================================================
 * B — Los módulos de la camada, armados (función PURA)
 * ============================================================ */

const CLASES_VACIAS = { classes: [], projected: true, cannotGenerateReason: null };

describe("armarModulosDeCamada — el orden, la etiqueta y el avance", () => {
  const base = {
    courseId: "cur_1",
    teacherId: null,
    startDate: null,
    endDate: null,
    minAttendancePct: null,
  };

  it("ordena por position aunque lleguen desordenados, y numera por el lugar", async () => {
    const { armarModulosDeCamada } = await import("@/server/program-staff");
    const out = armarModulosDeCamada(
      [
        { ...base, id: "coh_c", name: "Revit MEP", position: 30 },
        { ...base, id: "coh_a", name: "Revit Arquitectura", position: 10 },
        { ...base, id: "coh_b", name: "Revit Estructura", position: 20 },
      ],
      new Map(),
      new Map(),
      new Map(),
      AHORA
    );

    expect(out.map((m) => m.cohortId)).toEqual(["coh_a", "coh_b", "coh_c"]);
    expect(out.map((m) => m.ordinal)).toEqual([1, 2, 3]);
    // La clave de orden viaja para poder EDITARLA, no para mostrarla.
    expect(out.map((m) => m.position)).toEqual([10, 20, 30]);
    expect(out.map((m) => m.label)).toEqual([
      "Módulo 1 — Revit Arquitectura",
      "Módulo 2 — Revit Estructura",
      "Módulo 3 — Revit MEP",
    ]);
  });

  /** Un módulo sin `position` es un dato a medias: va al final y no se numera. */
  it("los módulos sin position van al final y no reciben ordinal", async () => {
    const { armarModulosDeCamada } = await import("@/server/program-staff");
    const out = armarModulosDeCamada(
      [
        { ...base, id: "coh_x", name: "Sin ubicar", position: null },
        { ...base, id: "coh_a", name: "Revit Arquitectura", position: 1 },
      ],
      new Map(),
      new Map(),
      new Map(),
      AHORA
    );

    expect(out.map((m) => m.cohortId)).toEqual(["coh_a", "coh_x"]);
    expect(out[1]!.ordinal).toBeNull();
    expect(out[1]!.label).toBe("Sin ubicar");
  });

  /** El nombre propio es opcional: sin él rotula el curso, como en el roster. */
  it("sin nombre propio rotula con el nombre del curso", async () => {
    const { armarModulosDeCamada } = await import("@/server/program-staff");
    const out = armarModulosDeCamada(
      [{ ...base, id: "coh_a", name: null, position: 1 }],
      new Map([["cur_1", "Revit Arquitectura"]]),
      new Map(),
      new Map(),
      AHORA
    );
    expect(out[0]!.name).toBe("Revit Arquitectura");
  });

  /**
   * US3 — **el módulo sin cronograma NO se oculta**. Es la regla que más pesa
   * de toda la pantalla: los 0 `class_session` de las 9 camadas reales salen
   * exactamente de que hoy no hay dónde ver que falta cargarlo.
   */
  it("un módulo sin cronograma se muestra igual, declarándolo", async () => {
    const { armarModulosDeCamada } = await import("@/server/program-staff");
    const out = armarModulosDeCamada(
      [
        { ...base, id: "coh_a", name: "Revit Arq", position: 1 },
        { ...base, id: "coh_b", name: "Revit MEP", position: 2 },
      ],
      new Map(),
      new Map(),
      new Map([
        [
          "coh_a",
          {
            projected: false,
            cannotGenerateReason: null,
            classes: [
              { id: "cs_1", projected: false, date: "2026-04-22T00:00:00.000Z", canceled: false },
              { id: "cs_2", projected: false, date: "2026-04-29T00:00:00.000Z", canceled: true },
              { id: "cs_3", projected: false, date: "2026-12-01T00:00:00.000Z", canceled: false },
            ],
          },
        ],
        [
          "coh_b",
          {
            projected: true,
            cannotGenerateReason: null,
            classes: [
              { id: null, projected: true, date: "2026-10-01T00:00:00.000Z", canceled: false },
              { id: null, projected: true, date: "2026-10-08T00:00:00.000Z", canceled: false },
            ],
          },
        ],
      ]),
      AHORA
    );

    expect(out).toHaveLength(2);
    const conCronograma = out[0]!.clases;
    expect(conCronograma.sinCronograma).toBe(false);
    expect(conCronograma.total).toBe(3);
    // Dictada = real, no cancelada y con fecha ya pasada.
    expect(conCronograma.dictadas).toBe(1);
    expect(conCronograma.canceladas).toBe(1);

    const sinCronograma = out[1]!.clases;
    expect(sinCronograma.sinCronograma).toBe(true);
    expect(sinCronograma.total).toBe(2);
    expect(sinCronograma.dictadas).toBe(0);
  });

  /** Un módulo que ni siquiera puede proyectar: el motivo viaja tal cual. */
  it("un módulo que no puede generar cronograma dice por qué", async () => {
    const { armarModulosDeCamada } = await import("@/server/program-staff");
    const out = armarModulosDeCamada(
      [{ ...base, id: "coh_a", name: "Revit Arq", position: 1 }],
      new Map(),
      new Map(),
      new Map([
        [
          "coh_a",
          {
            projected: true,
            classes: [],
            cannotGenerateReason: "La cohorte no declara días de cursada.",
          },
        ],
      ]),
      AHORA
    );
    expect(out[0]!.clases.sinCronograma).toBe(true);
    expect(out[0]!.clases.cannotGenerateReason).toContain("días de cursada");
  });

  it("el profesor de cada módulo sale de su propia cohorte", async () => {
    const { armarModulosDeCamada } = await import("@/server/program-staff");
    const out = armarModulosDeCamada(
      [
        { ...base, id: "coh_a", name: "Revit Arq", position: 1, teacherId: "tea_1" },
        { ...base, id: "coh_b", name: "Revit MEP", position: 2, teacherId: null },
      ],
      new Map(),
      new Map([["tea_1", "Ana"]]),
      new Map([["coh_a", CLASES_VACIAS], ["coh_b", CLASES_VACIAS]]),
      AHORA
    );
    expect(out[0]!.teacher).toEqual({ id: "tea_1", name: "Ana" });
    expect(out[1]!.teacher).toBeNull();
  });
});

/* ============================================================
 * C — La camada de especialización, contra la base
 * ============================================================ */

const CAMADA = {
  id: "coh_padre",
  name: "EBIM 13",
  courseName: "Especialización en Proyectos BIM",
  parentCohortId: null,
};

function modulo(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "coh_m1",
    name: "Revit Arquitectura",
    position: 1,
    courseId: "cur_m1",
    teacherId: "tea_1",
    startDate: new Date("2026-04-22T00:00:00.000Z"),
    endDate: new Date("2026-06-30T00:00:00.000Z"),
    minAttendancePct: 80,
    daysOfWeek: "1,3",
    startTime: "19:00",
    endTime: "22:00",
    meetingUrl: null,
    ...over,
  };
}

function hija(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "enr_hija_m1",
    parentEnrollmentId: "enr_madre",
    cohortId: "coh_m1",
    courseId: "cur_m1",
    enrolledAt: new Date("2026-04-01T00:00:00.000Z"),
    position: 1,
    parentCohortId: "coh_padre",
    cohortName: "Revit Arquitectura",
    courseName: "Revit Arquitectura",
    startDate: new Date("2026-04-22T00:00:00.000Z"),
    endDate: new Date("2026-06-30T00:00:00.000Z"),
    cohortMinAttendancePct: null,
    courseMinAttendancePct: null,
    attendanceWaiverAt: null,
    attendanceWaiverReason: null,
    attendanceWaiverRevokedAt: null,
    attendanceWaiverByName: null,
    ...over,
  };
}

/**
 * La cola en el ORDEN exacto en que `camadaDeEspecializacion` consulta.
 * Escrita una vez acá para que cada caso diga sólo lo suyo.
 */
function colaDeCamada(input: {
  modulos: unknown[];
  clases?: unknown[];
  profesores?: unknown[];
  cursos?: unknown[];
  madres?: unknown[];
  hijas?: unknown[];
  sesiones?: unknown[];
  marcas?: unknown[];
  evaluaciones?: unknown[];
  resultados?: unknown[];
  camadasAjenas?: unknown[];
}) {
  selectQueue.push([CAMADA]); // 1 — la camada
  selectQueue.push(input.modulos); // 2 — listarModulos
  selectQueue.push([{ timezone: "America/Montevideo", before: 15, after: 30 }]); // 3
  selectQueue.push(input.modulos); // 4 — listarModulos, dentro de listProgramClasses
  selectQueue.push(input.clases ?? []); // 5 — class_session de los módulos
  selectQueue.push(input.profesores ?? []); // 6
  selectQueue.push(input.cursos ?? []); // 7
  selectQueue.push(input.madres ?? []); // 8 — las inscripciones madre
  if ((input.madres ?? []).length === 0) return;
  selectQueue.push(input.hijas ?? []); // 9 — listarHijasDeVarias
  if ((input.hijas ?? []).length === 0) return;
  selectQueue.push(input.sesiones ?? []); // 10
  selectQueue.push(input.marcas ?? []); // 11
  selectQueue.push(input.evaluaciones ?? []); // 12
  selectQueue.push(input.resultados ?? []); // 13
  if (input.camadasAjenas) selectQueue.push(input.camadasAjenas); // 14
}

const TODAS_LAS_CAPS = ["academico.ver", "evaluacion.ver"] as const;

describe("camadaDeEspecializacion — la especialización se ve entera", () => {
  it("devuelve los módulos en orden, con profesor, fechas y avance", async () => {
    colaDeCamada({
      modulos: [
        modulo({ id: "coh_m2", name: "Revit Estructura", position: 20, teacherId: "tea_2" }),
        modulo({ id: "coh_m1", name: "Revit Arquitectura", position: 10, teacherId: "tea_1" }),
      ],
      clases: [
        { id: "cs_1", cohortId: "coh_m1", number: 1, date: new Date("2026-04-22T00:00:00.000Z"), startTime: "19:00", endTime: "22:00", topic: null, canceledAt: null, cancelReason: null, meetingUrl: null, recordingUrl: null },
      ],
      profesores: [
        { id: "tea_1", name: "Ana" },
        { id: "tea_2", name: "Bruno" },
      ],
      cursos: [{ id: "cur_m1", name: "Revit" }],
      madres: [],
    });

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", TODAS_LAS_CAPS, AHORA);

    expect(r).not.toBeNull();
    expect(r!.name).toBe("EBIM 13");
    expect(r!.modules.map((m) => m.cohortId)).toEqual(["coh_m1", "coh_m2"]);
    expect(r!.modules.map((m) => m.ordinal)).toEqual([1, 2]);
    expect(r!.modules.map((m) => m.teacher?.name)).toEqual(["Ana", "Bruno"]);
    expect(r!.modules[0]!.clases.sinCronograma).toBe(false);
    // El módulo 2 no tiene ninguna clase y aparece IGUAL (US3).
    expect(r!.modules[1]!.clases.sinCronograma).toBe(true);
  });

  /**
   * FR-032 — Una camada SIN módulos no es una especialización y no entra al
   * camino nuevo. Se corta antes de leer una sola inscripción: la condición es
   * un dato (FR-033), no una bandera.
   */
  it("una camada simple devuelve cero módulos y no consulta alumnos", async () => {
    selectQueue.push([CAMADA]);
    selectQueue.push([]); // sin módulos
    selectQueue.push([{ jamas: "se lee" }]);

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", TODAS_LAS_CAPS, AHORA);

    expect(r!.modules).toEqual([]);
    expect(r!.students).toEqual([]);
    // Quedó una entrada sin consumir: el corte fue antes de mirar el roster.
    expect(selectQueue).toHaveLength(1);
  });

  it("una camada inexistente devuelve null", async () => {
    selectQueue.push([]);
    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    expect(await camadaDeEspecializacion(ORG, "coh_x", TODAS_LAS_CAPS, AHORA)).toBeNull();
  });

  /** El estado por MÓDULO de cada alumno, que es el pedido literal de US3. */
  it("cada alumno trae su estado por módulo y el compuesto de la madre", async () => {
    colaDeCamada({
      modulos: [modulo(), modulo({ id: "coh_m2", name: "Revit Estructura", position: 2 })],
      profesores: [{ id: "tea_1", name: "Ana" }],
      cursos: [{ id: "cur_m1", name: "Revit" }],
      madres: [
        {
          id: "enr_madre",
          contactId: "ct_1",
          firstName: "Lucía",
          lastName: "Pérez",
        },
      ],
      hijas: [
        hija(),
        hija({ id: "enr_hija_m2", cohortId: "coh_m2", position: 2, cohortName: "Revit Estructura" }),
      ],
      evaluaciones: [{ id: "as_1", cohortId: "coh_m2", required: true }],
      resultados: [{ assessmentId: "as_1", enrollmentId: "enr_hija_m2", passed: false }],
    });

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", TODAS_LAS_CAPS, AHORA);

    expect(r!.students).toHaveLength(1);
    const alumna = r!.students![0]!;
    expect(alumna.contact.name).toBe("Lucía Pérez");
    expect(alumna.modules.map((m) => m.state)).toEqual(["aprobado", "reprobado"]);
    // Regla 2 — reprobar un módulo no arrastra a los demás, pero sí define el
    // estado del programa.
    expect(alumna.state).toBe("reprobado");
    // SC-010 — la razón NOMBRA el módulo, y lo hace por su ordinal derivado.
    expect(alumna.reasons.join(" ")).toContain("Módulo 2 — Revit Estructura");
  });

  /**
   * US4 / FR-008 — el módulo cursado con OTRA camada. Es el escenario que
   * ninguna otra forma del modelo puede representar, y en la pantalla del
   * staff tiene que decirse con el nombre de la camada, no con un asterisco.
   */
  it("un módulo cursado en otra camada se declara, con el nombre de esa camada", async () => {
    colaDeCamada({
      modulos: [modulo(), modulo({ id: "coh_m2", name: "Revit Estructura", position: 2 })],
      profesores: [{ id: "tea_1", name: "Ana" }],
      cursos: [{ id: "cur_m1", name: "Revit" }],
      madres: [{ id: "enr_madre", contactId: "ct_1", firstName: "Lucía", lastName: null }],
      hijas: [
        hija(),
        hija({
          id: "enr_hija_m2",
          cohortId: "coh_m2_ebim14",
          position: 2,
          parentCohortId: "coh_padre_ebim14",
          cohortName: "Revit Estructura (EBIM 14)",
        }),
      ],
      camadasAjenas: [{ id: "coh_padre_ebim14", name: "EBIM 14" }],
    });

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", TODAS_LAS_CAPS, AHORA);

    const recursado = r!.students![0]!.modules[1]!;
    expect(recursado.otraCamada).toBe(true);
    expect(recursado.camadaName).toBe("EBIM 14");
    // El módulo cursado con la propia camada no se marca.
    expect(r!.students![0]!.modules[0]!.otraCamada).toBe(false);
  });

  /**
   * El ordinal de una celda sale del orden del PROGRAMA, no del lugar que ese
   * módulo ocupa en la lista de esa persona.
   *
   * La diferencia muerde en el caso que la fase existe para representar: acá
   * la alumna todavía no tiene cargado el módulo 1 y sólo cursa el 2. Contar
   * sobre su propia lista lo rotularía "Módulo 1" y lo pondría debajo de la
   * columna equivocada.
   */
  it("el ordinal de una celda sale del programa, no de la lista del alumno", async () => {
    colaDeCamada({
      modulos: [
        modulo(),
        modulo({ id: "coh_m2", courseId: "cur_m2", name: "Revit Estructura", position: 20 }),
      ],
      profesores: [{ id: "tea_1", name: "Ana" }],
      cursos: [{ id: "cur_m1", name: "Revit" }],
      madres: [{ id: "enr_madre", contactId: "ct_1", firstName: "Lucía", lastName: null }],
      // Sólo cursa el segundo módulo: el primero todavía no se le cargó.
      hijas: [
        hija({
          id: "enr_hija_m2",
          cohortId: "coh_m2",
          courseId: "cur_m2",
          position: 20,
          cohortName: "Revit Estructura",
        }),
      ],
    });

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", TODAS_LAS_CAPS, AHORA);

    const unica = r!.students![0]!.modules[0]!;
    expect(unica.ordinal).toBe(2);
    expect(unica.label).toBe("Módulo 2 — Revit Estructura");
  });

  /**
   * Y la contracara: el módulo recursado en OTRA camada es otra cohorte pero
   * el MISMO módulo, así que conserva su lugar en el programa.
   */
  it("el módulo recursado en otra camada conserva su ordinal del programa", async () => {
    colaDeCamada({
      modulos: [
        modulo(),
        modulo({ id: "coh_m2", courseId: "cur_m2", name: "Revit Estructura", position: 20 }),
      ],
      profesores: [{ id: "tea_1", name: "Ana" }],
      cursos: [{ id: "cur_m1", name: "Revit" }],
      madres: [{ id: "enr_madre", contactId: "ct_1", firstName: "Lucía", lastName: null }],
      hijas: [
        hija({
          id: "enr_hija_m2",
          cohortId: "coh_m2_ebim14",
          courseId: "cur_m2",
          position: 20,
          parentCohortId: "coh_padre_ebim14",
          cohortName: "Revit Estructura (EBIM 14)",
        }),
      ],
      camadasAjenas: [{ id: "coh_padre_ebim14", name: "EBIM 14" }],
    });

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", TODAS_LAS_CAPS, AHORA);

    const recursado = r!.students![0]!.modules[0]!;
    expect(recursado.ordinal).toBe(2);
    expect(recursado.otraCamada).toBe(true);
  });

  /**
   * 012/013 — El front oculta, el servidor NO ARMA. Sin `evaluacion.ver` la
   * clave `students` no existe en la respuesta: esconder la grilla en la UI
   * sería mandar por la red el estado de aprobación de cada persona a quien no
   * puede verlo, que es el mismo error que 012 corrigió en el roster.
   */
  it("sin `evaluacion.ver` la grilla de alumnos ni se arma", async () => {
    colaDeCamada({
      modulos: [modulo()],
      profesores: [{ id: "tea_1", name: "Ana" }],
      cursos: [{ id: "cur_m1", name: "Revit" }],
      madres: [],
    });

    const { camadaDeEspecializacion } = await import("@/server/program-staff");
    const r = await camadaDeEspecializacion(ORG, "coh_padre", ["academico.ver"], AHORA);

    expect(r!.modules).toHaveLength(1);
    expect("students" in r!).toBe(false);
  });
});

/* ============================================================
 * D — US4, camino 1: la BAJA VOLUNTARIA
 * ============================================================ */

describe("moverModuloDeRecorrido — la baja voluntaria (regla 3)", () => {
  const HIJA = {
    id: "enr_hija_m3",
    cohortId: "coh_m3",
    parentEnrollmentId: "enr_madre",
    amount: null,
    installments: null,
  };

  /**
   * La inscripción hija pasa a apuntar al mismo módulo de la camada siguiente.
   * **La madre no se toca y el plan de cuotas del paquete no se toca**: ya
   * está pago. Por eso el test no mira sólo que el `cohort_id` cambió — mira
   * QUÉ MÁS se escribió, que es donde estaría el daño.
   */
  it("repunta la hija y no toca ni el monto ni las cuotas ni la madre", async () => {
    selectQueue.push([HIJA]); // la inscripción
    selectQueue.push([{ id: "coh_m3_ebim14", parentCohortId: "coh_padre_ebim14" }]); // destino
    selectQueue.push([{ parentEnrollmentId: null }]); // la madre, para el guarda
    selectQueue.push([]); // hijas propias de la hija: ninguna

    const { moverModuloDeRecorrido } = await import("@/server/program-staff");
    const r = await moverModuloDeRecorrido(ORG, "enr_hija_m3", "coh_m3_ebim14");

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const tocadas = Object.keys(updates[0]!.set).sort();
    expect(tocadas).toEqual(["cohortId", "updatedAt"]);
    expect(updates[0]!.set.cohortId).toBe("coh_m3_ebim14");
    // El intento anterior no se borra por este camino, y la madre tampoco.
    expect(deletes).toHaveLength(0);
  });

  /**
   * LA TRAMPA de la fase, y viene del guarda de la fase 1: una inscripción
   * DIRECTA —sin madre— jamás puede apuntar a una cohorte de módulo. Acá no se
   * escribe una segunda validación: se llama a la que ya existe.
   */
  it("una inscripción directa no puede apuntar a una cohorte de módulo", async () => {
    selectQueue.push([{ ...HIJA, parentEnrollmentId: null }]);

    const { moverModuloDeRecorrido } = await import("@/server/program-staff");
    const r = await moverModuloDeRecorrido(ORG, "enr_suelta", "coh_m3_ebim14");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(updates).toHaveLength(0);
  });

  /** La otra mitad de FR-010: una hija tiene que caer en un MÓDULO. */
  it("una hija no puede mudarse a una camada suelta", async () => {
    selectQueue.push([HIJA]);
    selectQueue.push([{ id: "coh_simple", parentCohortId: null }]); // destino sin padre
    selectQueue.push([{ parentEnrollmentId: null }]);
    selectQueue.push([]);

    const { moverModuloDeRecorrido } = await import("@/server/program-staff");
    const r = await moverModuloDeRecorrido(ORG, "enr_hija_m3", "coh_simple");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.message).toContain("módulo");
    expect(updates).toHaveLength(0);
  });

  it("una inscripción inexistente es 404", async () => {
    selectQueue.push([]);
    const { moverModuloDeRecorrido } = await import("@/server/program-staff");
    const r = await moverModuloDeRecorrido(ORG, "enr_x", "coh_m3_ebim14");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });

  it("una cohorte destino inexistente es 422 y no escribe nada", async () => {
    selectQueue.push([HIJA]);
    selectQueue.push([]);
    const { moverModuloDeRecorrido } = await import("@/server/program-staff");
    const r = await moverModuloDeRecorrido(ORG, "enr_hija_m3", "coh_x");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(updates).toHaveLength(0);
  });
});

/* ============================================================
 * E — US4, camino 2: la RECURSADA, con su propia plata
 * ============================================================ */

describe("la recursada tras reprobar — una hija NUEVA con su propio monto", () => {
  /**
   * Regla 4 — se crea una inscripción hija NUEVA contra el módulo de la otra
   * camada, con su propio monto y su propio plan de cuotas. El intento
   * anterior NO se borra: quedó reprobado y esa es la evidencia de por qué hay
   * que recursar (FR-021).
   */
  it("createEnrollment cuelga la hija nueva de la madre, con su monto", async () => {
    selectQueue.push([{ id: "coh_m2_ebim14", parentCohortId: "coh_padre_ebim14" }]); // cohorte
    selectQueue.push([{ parentEnrollmentId: null }]); // la madre, guarda
    selectQueue.push([{ id: "ct_1", nationalId: "1234567-8" }]); // contacto
    selectQueue.push([{ id: "stg_1" }]); // etapa

    const { createEnrollment } = await import("@/server/enrollments");
    const r = await createEnrollment(ORG, {
      cohortId: "coh_m2_ebim14",
      contactId: "ct_1",
      parentEnrollmentId: "enr_madre",
      amount: 9000,
      currency: "UYU",
      installments: 3,
    });

    expect(r.ok).toBe(true);
    const fila = inserts[0] as Record<string, unknown>;
    expect(fila.parentEnrollmentId).toBe("enr_madre");
    expect(fila.cohortId).toBe("coh_m2_ebim14");
    // Su propia plata (regla 4): la madre lleva el paquete, la recursada lo suyo.
    expect(fila.amount).toBe(9000);
    expect(fila.installments).toBe(3);
    // FR-021 — el intento reprobado se conserva.
    expect(deletes).toHaveLength(0);
  });

  /** La ruta tiene que ACEPTAR el campo: sin esto el alta no llega al servidor. */
  it("POST /api/enrollments valida `parentEnrollmentId`", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/enrollments/route.ts"),
      "utf8"
    );
    expect(src).toContain("parentEnrollmentId");
  });
});

/* ============================================================
 * F — La plata de la recursada entra a la Caja de la 026 sin categoría nueva
 * ============================================================ */

describe("SC-006 — el pago de una recursada es un cobro como cualquier otro", () => {
  /**
   * La verificación pedida es doble y las dos mitades importan:
   *
   * 1. El pago de una hija entra a la Caja del mes exactamente como el de una
   *    inscripción suelta — mismo bloque, mismo total, misma moneda.
   * 2. **No hace falta ninguna categoría nueva**, y agregarla sería el error:
   *    partiría la Caja en dos vocabularios y obligaría a mantenerlos.
   */
  it("entra a la Caja junto a los demás, sin ninguna clave de categoría", async () => {
    const { armarCaja } = await import("@/server/finanzas-periodo");
    const base = {
      voidedAt: null,
      voidReason: null,
      currency: "UYU" as const,
      method: "transferencia" as const,
      receiptNumber: null,
    };
    const bloques = armarCaja([
      {
        ...base,
        id: "pay_normal",
        paidAt: new Date("2026-09-02T10:00:00.000Z"),
        amount: 12000,
        alumno: "Marta",
        cohorte: "Revit Full",
        curso: "Revit",
      },
      {
        ...base,
        id: "pay_recursada",
        paidAt: new Date("2026-09-03T10:00:00.000Z"),
        amount: 9000,
        alumno: "Lucía",
        cohorte: "Revit Estructura (EBIM 14)",
        curso: "Revit Estructura",
      },
    ]);

    expect(bloques).toHaveLength(1);
    expect(bloques[0]!.total).toBe(21000);
    expect(bloques[0]!.filas.map((f) => f.id)).toEqual(["pay_normal", "pay_recursada"]);
    for (const fila of bloques[0]!.filas) {
      expect(Object.keys(fila)).not.toContain("categoria");
      expect(Object.keys(fila)).not.toContain("category");
    }
  });

  /**
   * Y el guard estructural: la 026 no se entera del árbol. Si algún día
   * alguien filtra la Caja por `parent_enrollment_id`, la plata de las
   * recursadas desaparece del mes sin que nadie lo note.
   */
  it("finanzas-periodo.ts no conoce el árbol ni inventa categorías", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/server/finanzas-periodo.ts"),
      "utf8"
    );
    expect(src).not.toContain("parentEnrollmentId");
    expect(src).not.toContain("parent_enrollment_id");
  });
});

/* ============================================================
 * G — Las capacidades: el front oculta, el servidor prohíbe
 * ============================================================ */

function mockRole(role: string) {
  vi.doMock("@/lib/auth/session", () => {
    class UnauthorizedError extends Error {}
    return {
      UnauthorizedError,
      requireSession: vi
        .fn()
        .mockResolvedValue({ userId: "usr_1", organizationId: ORG, role }),
    };
  });
}

const CTX = { params: Promise.resolve({ id: "coh_padre" }) };

describe("las rutas nuevas declaran su capacidad, y la hacen valer", () => {
  it("GET /api/cohorts/[id]/program exige `academico.ver`", async () => {
    mockRole("sin_permisos");
    const mod = (await import("@/app/api/cohorts/[id]/program/route")) as {
      GET: (req: Request, ctx: typeof CTX) => Promise<Response>;
    };
    const res = await mod.GET(
      new Request("http://localhost/api/cohorts/coh_padre/program"),
      CTX
    );

    expect(res.status).toBe(403);
    // Un 403 devuelto DESPUÉS de leer ya expuso el dato al proceso.
    expect(selectQueue).toHaveLength(0);
  });

  /** Un 403 para todo el mundo pasaría el caso de arriba sin proteger nada. */
  it("GET /api/cohorts/[id]/program deja entrar a quien sí puede", async () => {
    mockRole("owner");
    selectQueue.push([CAMADA]);
    selectQueue.push([]); // sin módulos: camada simple

    const mod = (await import("@/app/api/cohorts/[id]/program/route")) as {
      GET: (req: Request, ctx: typeof CTX) => Promise<Response>;
    };
    const res = await mod.GET(
      new Request("http://localhost/api/cohorts/coh_padre/program"),
      CTX
    );
    expect(res.status).toBe(200);
  });

  /**
   * Mover una inscripción es una operación de INSCRIPCIONES, no académica:
   * cambia de qué corrida cursa una persona y, en el otro camino, arrastra
   * plata. Soporte no la tiene (FINANCIAL_CAPABILITIES).
   */
  it("PUT /api/enrollments/[id]/cohort exige `inscripciones.editar`", async () => {
    mockRole("soporte");
    const ctx: typeof CTX = { params: Promise.resolve({ id: "enr_hija_m3" }) };
    const mod = (await import("@/app/api/enrollments/[id]/cohort/route")) as {
      PUT: (req: Request, ctx: typeof CTX) => Promise<Response>;
    };
    const res = await mod.PUT(
      new Request("http://localhost/api/enrollments/enr_hija_m3/cohort", {
        method: "PUT",
        body: JSON.stringify({ cohortId: "coh_m3_ebim14" }),
        headers: { "content-type": "application/json" },
      }),
      ctx
    );

    expect(res.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });

  it("PATCH /api/cohorts/[id] —armar el programa— exige `academico.editar`", async () => {
    mockRole("sin_permisos");
    const mod = (await import("@/app/api/cohorts/[id]/route")) as {
      PATCH: (req: Request, ctx: typeof CTX) => Promise<Response>;
    };
    const res = await mod.PATCH(
      new Request("http://localhost/api/cohorts/coh_m1", {
        method: "PATCH",
        body: JSON.stringify({ parentCohortId: "coh_padre", position: 10 }),
        headers: { "content-type": "application/json" },
      }),
      CTX
    );
    expect(res.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });
});

/* ============================================================
 * H — Armar el programa pasa por el guarda de la fase 1, no por uno nuevo
 * ============================================================ */

describe("armar y desarmar el programa (US3, mitad estructura)", () => {
  /**
   * El campo tiene que estar en el esquema COMPARTIDO por el POST y el PATCH.
   * Cuando cada ruta tenía el suyo, agregar un campo en una y olvidarlo en la
   * otra hacía que Zod lo descartara en silencio.
   */
  it("`cohortInputSchema` acepta parentCohortId y position", async () => {
    const { cohortInputSchema } = await import("@/server/courses");
    expect(Object.keys(cohortInputSchema)).toContain("parentCohortId");
    expect(Object.keys(cohortInputSchema)).toContain("position");
  });

  /** Colgar un módulo: el PATCH llega al servidor con el padre y la posición. */
  it("el PATCH manda parentCohortId y position a updateCohort", async () => {
    const { cohortInputSchema } = await import("@/server/courses");
    const { z } = await import("zod");
    const schema = z.object({ ...cohortInputSchema });

    const colgar = schema.safeParse({ parentCohortId: "coh_padre", position: 20 });
    expect(colgar.success).toBe(true);

    // Descolgar es mandar null explícito, no omitirlo: omitirlo no toca nada.
    const descolgar = schema.safeParse({ parentCohortId: null });
    expect(descolgar.success).toBe(true);
    expect(descolgar.success && descolgar.data.parentCohortId).toBeNull();
  });

  /**
   * FR-005 — La regla del árbol vive en UN solo lugar. Ni la superficie del
   * staff ni sus rutas pueden traer una segunda copia: dos validaciones de lo
   * mismo divergen, y la que diverge es siempre la que nadie mira.
   */
  it("la fase 4 no reimplementa el guarda del árbol", () => {
    const archivos = [
      "src/server/program-staff.ts",
      "src/app/api/enrollments/[id]/cohort/route.ts",
      "src/app/api/cohorts/[id]/program/route.ts",
    ];
    for (const rel of archivos) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src, `${rel} vuelve a decidir el anidamiento`).not.toContain(
        "anidamiento_de_dos_niveles"
      );
    }
    const staff = readFileSync(
      path.join(process.cwd(), "src/server/program-staff.ts"),
      "utf8"
    );
    expect(staff).toContain("verificarVinculoDeInscripcion");
  });
});

/* ============================================================
 * I — Sin regresión: las 33 cohortes simples no se mueven
 * ============================================================ */

describe("FR-032 — la cohorte simple, byte por byte como estaba", () => {
  /**
   * La pestaña nueva se agrega SÓLO cuando la camada tiene módulos. Una
   * pestaña de más en las 33 cohortes simples ya es un cambio de pantalla, y
   * FR-032 es un requisito duro, no una aspiración.
   */
  it("la pestaña de especialización es condicional", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/cohorts/cohort-tabs.tsx"),
      "utf8"
    );
    expect(src).toContain("esEspecializacion");
  });

  /**
   * Y el roster, la planilla, la asistencia y las clases de una cohorte suelta
   * siguen colgando de las mismas rutas de siempre: la fase 4 no reemplaza
   * ninguna, agrega una.
   */
  it("las rutas de la cohorte simple siguen siendo las mismas", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/cohorts/cohort-tabs.tsx"),
      "utf8"
    );
    for (const clave of ["roster", "classes", "attendance", "grading", "announcements"]) {
      expect(src).toContain(`"${clave}"`);
    }
  });
});

/* ============================================================
 * J — Los tres defectos encontrados revisando la fase 4
 * ============================================================ */

describe("verificarPadreDeCohorte — descolgar un módulo con alumnos (FR-010)", () => {
  /**
   * El hecho nuevo lo tiene que averiguar el guarda, no quien lo llama: si la
   * consulta viviera en la pantalla que descuelga, la regla y el dato podrían
   * separarse el día que aparezca una segunda pantalla que descuelgue.
   */
  it("consulta las cursadas colgantes y rechaza el descuelgue", async () => {
    selectQueue.push([{ id: "enr_hija_m2" }]); // hay alguien cursando el módulo
    const { getDb } = await import("@/lib/db");
    const { verificarPadreDeCohorte } = await import("@/server/program-modules");

    const error = await verificarPadreDeCohorte(getDb(), ORG, "coh_m2", null);

    expect(error?.code).toBe("modulo_con_alumnos_cursandolo");
    expect(selectQueue).toHaveLength(0); // la consulta se hizo
  });

  /** Sin nadie colgando no hay a quién dejar a mitad de camino. */
  it("sin cursadas colgantes, descolgar se permite", async () => {
    selectQueue.push([]);
    const { getDb } = await import("@/lib/db");
    const { verificarPadreDeCohorte } = await import("@/server/program-modules");

    expect(await verificarPadreDeCohorte(getDb(), ORG, "coh_m2", null)).toBeNull();
  });

  /**
   * FR-032 — El alta de una cohorte suelta no paga ninguna consulta nueva: una
   * cohorte que todavía no existe no puede tener alumnos cursándola, y ese
   * hecho lo sabe quien la está insertando.
   */
  it("el alta de una cohorte suelta no consulta nada", async () => {
    selectQueue.push([{ id: "enr_de_otra_cohorte" }]); // si consultara, rechazaría
    const { getDb } = await import("@/lib/db");
    const { verificarPadreDeCohorte } = await import("@/server/program-modules");

    expect(await verificarPadreDeCohorte(getDb(), ORG, "coh_nueva", null, true)).toBeNull();
    expect(selectQueue).toHaveLength(1); // intacta: no se consultó
  });
});

describe("`position` tampoco se imprime en las pantallas (.tsx)", () => {
  /**
   * El mismo guard estructural que ya cuida `src/server/`, del lado del
   * cliente: `Módulo ${position}` es lo primero que sale al teclear, y en una
   * especialización cargada 10/20/30 esa pantalla miente.
   */
  it("ningún componente imprime `Módulo ${position}`", () => {
    const dir = path.join(process.cwd(), "src", "components");
    const infractores: string[] = [];
    const stack = [dir];
    while (stack.length) {
      const actual = stack.pop()!;
      for (const entrada of readdirSync(actual, { withFileTypes: true })) {
        const full = path.join(actual, entrada.name);
        if (entrada.isDirectory()) stack.push(full);
        else if (entrada.name.endsWith(".tsx") || entrada.name.endsWith(".ts")) {
          const src = readFileSync(full, "utf8");
          if (/Módulo \$\{[^}]*position/.test(src)) {
            infractores.push(path.relative(process.cwd(), full));
          }
        }
      }
    }
    expect(infractores, infractores.join("\n")).toEqual([]);
  });
});
