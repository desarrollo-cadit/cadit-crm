import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 028 fase 3 — Los dos portales.
 *
 * La fase 1 dejó el modelo y sus guardas; la fase 2 le enseñó a la capa de
 * cómputo a caminar el árbol. Acá se conectan las dos superficies que una
 * persona abre todos los días, y son deliberadamente ASIMÉTRICAS:
 *
 * - **El alumno** ve la especialización ENTERA: una cursada con sus módulos
 *   adentro, en orden de `position`, diciendo dónde está y qué le falta.
 * - **El profesor** no ve nada nuevo salvo el NOMBRE de su programa. Su regla
 *   de alcance no cambia: `resolveTeacherScope()` devuelve ids de cohorte, y
 *   la cohorte del módulo 2 no es la del módulo 3.
 *
 * La trampa que este archivo existe para frenar está escrita en US2: el día
 * que alguien reuse el armado de "la especialización entera" en el portal del
 * profesor "para que vea el contexto", el profesor del módulo 2 empieza a ver
 * los alumnos y las notas de los módulos 1, 3 y 4. Hay un test estructural que
 * lo frena antes de que se escriba.
 */

/* ============================================================
 * Un doble de base con COLA POSICIONAL, para el portal del alumno
 * ============================================================
 * `student-portal.ts` hace sus consultas en un orden fijo y conocido, así que
 * la cola posicional dice exactamente lo que el test quiere decir. Es el mismo
 * doble que usa `especializaciones-computo.test.ts`.
 */

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    selectDistinct: () => thenableChain(selectQueue.shift() ?? []),
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
  vi.resetModules();
});

const ORG = "org_1";
const CONTACTO = "ct_1";
const AHORA = new Date("2026-09-08T12:00:00.000Z");

const CONTACT_ROW = { firstName: "Ana", lastName: "Pérez", email: "ana@example.com" };
const ORG_ROW = { timezone: "America/Montevideo", before: 15, after: 30 };

function inscripcion(over: Record<string, unknown> = {}) {
  return {
    id: "enr_madre",
    contactId: CONTACTO,
    cohortId: "coh_ebim13",
    parentEnrollmentId: null,
    enrolledAt: new Date("2026-03-01T00:00:00.000Z"),
    currency: "UYU",
    companyId: null,
    attendanceWaiverAt: null,
    attendanceWaiverReason: null,
    attendanceWaiverRevokedAt: null,
    ...over,
  };
}

function camada(over: Record<string, unknown> = {}) {
  return {
    id: "coh_ebim13",
    name: "EBIM 13",
    status: "en_curso" as const,
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-12-01T00:00:00.000Z"),
    frequency: null,
    classroom: null,
    meetingUrl: null,
    minAttendancePct: null,
    parentCohortId: null,
    position: null,
    ...over,
  };
}

function fila(
  enrollment: Record<string, unknown>,
  cohort: Record<string, unknown> | null,
  courseName: string,
  over: Record<string, unknown> = {}
) {
  return {
    enrollment,
    cohort,
    course: courseName ? { id: `crs_${courseName}`, name: courseName, minAttendancePct: null } : null,
    teacherName: null,
    waiverAuthorName: null,
    ...over,
  };
}

/**
 * El recorrido completo: la madre `EBIM 13` y cuatro módulos, cargados A
 * PROPÓSITO en desorden — la `position` manda, no el orden de carga ni la
 * fecha de inicio (US3).
 */
function recorridoEbim13() {
  const madre = fila(inscripcion(), camada(), "Especialización en Proyectos BIM");

  const modulo = (n: number, over: Record<string, unknown> = {}) =>
    fila(
      inscripcion({
        id: `enr_m${n}`,
        cohortId: `coh_m${n}`,
        parentEnrollmentId: "enr_madre",
      }),
      camada({
        id: `coh_m${n}`,
        name: `Módulo ${n}`,
        parentCohortId: "coh_ebim13",
        position: n,
        ...((over.cohort as Record<string, unknown>) ?? {}),
      }),
      `Revit ${n}`,
      (over.fila as Record<string, unknown>) ?? {}
    );

  return { madre, modulo };
}

/** madre + módulos, en el orden en que los devolvería la base (por fecha). */
function colaDeOverview(
  enrollments: unknown[],
  cruce: {
    sesiones?: unknown[];
    marcas?: unknown[];
    evaluaciones?: unknown[];
    resultados?: unknown[];
    certificados?: unknown[];
    licencias?: unknown[];
    camadas?: unknown[];
  } = {}
) {
  selectQueue.push([CONTACT_ROW]);
  selectQueue.push([ORG_ROW]);
  selectQueue.push(enrollments);
  selectQueue.push(cruce.sesiones ?? []);
  selectQueue.push(cruce.marcas ?? []);
  selectQueue.push(cruce.evaluaciones ?? []);
  selectQueue.push(cruce.resultados ?? []);
  selectQueue.push(cruce.certificados ?? []);
  selectQueue.push(cruce.licencias ?? []);
  // Sólo se consulta cuando un módulo se cursó con una camada que no está
  // entre las del alumno: el caso de la recursada (US4).
  if (cruce.camadas) selectQueue.push(cruce.camadas);
  // `studentBalances`: cuotas (y pagos sólo si hay cuotas vigentes).
  selectQueue.push([]);
}

/* ============================================================
 * PARTE A — El alumno ve la especialización entera (US3, FR-028)
 * ============================================================ */

describe("028 — la cursada de una especialización en el portal del alumno", () => {
  /**
   * **El escenario que define la parte A.** Un alumno con la madre y cuatro
   * hijas ve UNA cursada con sus módulos adentro, no cinco cursadas sueltas.
   */
  it("una madre con hijas es UNA cursada con sus módulos adentro", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(3), modulo(1), modulo(4), modulo(2)]);

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);

    expect(r!.courses).toHaveLength(1);
    expect(r!.courses[0]!.enrollmentId).toBe("enr_madre");
    expect(r!.courses[0]!.modules).toHaveLength(4);
  });

  /** US3 — el orden es el de `position`, no el de carga ni el de `start_date`. */
  it("los módulos salen en orden de position, no en el de carga", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(3), modulo(1), modulo(4), modulo(2)]);

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);

    expect(r!.courses[0]!.modules!.map((m) => m.position)).toEqual([1, 2, 3, 4]);
  });

  /**
   * US3 — **un módulo sin evaluaciones cargadas figura como tal, no como
   * aprobado.** `approvalState([], null, null)` devuelve "aprobado" y en la
   * planilla de cohorte está bien; afirmado sobre una PERSONA es falso. Es la
   * distinción que el legajo tomó en la 013 (`sin_datos`) y acá se respeta.
   */
  it("un módulo sin evaluaciones ni asistencia queda en sin_datos, jamás aprobado", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(1)]);

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);

    expect(r!.courses[0]!.modules![0]!.approval).toBe("sin_datos");
    // Y la madre no puede quedar aprobada por un módulo del que no se sabe nada.
    expect(r!.courses[0]!.approval).not.toBe("aprobado");
  });

  /**
   * US3 — un módulo SIN cronograma generado **se muestra igual**, declarando
   * que todavía no tiene clases. Ocultarlo es de donde vienen los 0
   * `class_session` de las camadas reales: un módulo invisible es un módulo
   * que nadie carga.
   */
  it("un módulo sin cronograma se muestra igual, declarándolo", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(1), modulo(2)], {
      sesiones: [
        {
          id: "cls_1",
          cohortId: "coh_m1",
          number: 1,
          date: new Date("2026-04-10T00:00:00.000Z"),
          canceledAt: null,
          startTime: null,
          endTime: null,
          topic: null,
          cancelReason: null,
          meetingUrl: null,
          recordingUrl: null,
        },
      ],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);
    const [m1, m2] = r!.courses[0]!.modules!;

    expect(m1!.sinCronograma).toBe(false);
    expect(m2!.sinCronograma).toBe(true);
    // No se oculta: sigue en la lista, en su posición.
    expect(r!.courses[0]!.modules!.map((m) => m.position)).toEqual([1, 2]);
  });

  /**
   * US4 — el módulo cursado en OTRA camada aparece en su `position`, diciendo
   * con qué camada lo cursó. Es el hecho que el ciclo existe para poder
   * representar; esconderlo lo desperdicia.
   */
  it("un módulo recursado con otra camada lo dice, y en su posición", async () => {
    const { madre, modulo } = recorridoEbim13();
    const recursado = modulo(3, { cohort: { parentCohortId: "coh_ebim14" } });

    colaDeOverview([madre, modulo(1), recursado, modulo(2)], {
      camadas: [{ id: "coh_ebim14", name: "EBIM 14" }],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);
    const modulos = r!.courses[0]!.modules!;

    expect(modulos.map((m) => m.position)).toEqual([1, 2, 3]);
    const tres = modulos.find((m) => m.position === 3)!;
    expect(tres.otraCamada).toBe(true);
    expect(tres.camadaName).toBe("EBIM 14");
    expect(modulos.find((m) => m.position === 1)!.otraCamada).toBe(false);
  });

  /**
   * FR-037 — el invariante que la base NO protege: la asistencia y el
   * resultado del módulo se leen contra la inscripción HIJA, aunque la cohorte
   * de ese módulo pertenezca a otra especialización.
   */
  it("la nota y la asistencia del módulo recursado se leen contra la hija", async () => {
    const { madre, modulo } = recorridoEbim13();
    const recursado = modulo(2, {
      cohort: { parentCohortId: "coh_ebim14", minAttendancePct: 80 },
    });

    colaDeOverview([madre, recursado], {
      sesiones: [1, 2, 3, 4].map((n) => ({
        id: `cls_${n}`,
        cohortId: "coh_m2",
        number: n,
        date: new Date(`2026-05-0${n}T00:00:00.000Z`),
        canceledAt: null,
        startTime: null,
        endTime: null,
        topic: null,
        cancelReason: null,
        meetingUrl: null,
        recordingUrl: null,
      })),
      marcas: [1, 2, 3, 4].map((n) => ({
        enrollmentId: "enr_m2",
        classSessionId: `cls_${n}`,
        status: "presente",
      })),
      evaluaciones: [
        { id: "as_1", cohortId: "coh_m2", name: "Entrega final", required: true, createdAt: AHORA },
      ],
      resultados: [{ assessmentId: "as_1", enrollmentId: "enr_m2", passed: true }],
      camadas: [{ id: "coh_ebim14", name: "EBIM 14" }],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);
    const m2 = r!.courses[0]!.modules![0]!;

    expect(m2.attendancePct).toBe(100);
    expect(m2.assessments).toEqual([
      { name: "Entrega final", required: true, passed: true },
    ]);
    expect(m2.approval).toBe("aprobado");
  });

  /** US5 — el alumno ve QUÉ CERTIFICADOS ya tiene, módulo por módulo. */
  it("el certificado de cada módulo viaja en su módulo", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(1), modulo(2)], {
      certificados: [
        {
          enrollmentId: "enr_m1",
          code: "ABCD-EFGH-JKMN",
          issuedAt: new Date("2026-06-01T00:00:00.000Z"),
          revokedAt: null,
        },
      ],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);
    const [m1, m2] = r!.courses[0]!.modules!;

    expect(m1!.certificate?.code).toBe("ABCD-EFGH-JKMN");
    expect(m2!.certificate).toBeNull();
    // El general es de la MADRE y todavía no está.
    expect(r!.courses[0]!.certificate).toBeNull();
  });

  /**
   * Regla 5 — no existe "la asistencia de la especialización". Cada módulo
   * tiene su cronograma y su propio mínimo; promediarlos inventaría un
   * criterio que nadie decidió.
   */
  it("la madre no publica un porcentaje de asistencia agregado", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(1)], {
      sesiones: [
        {
          id: "cls_1",
          cohortId: "coh_m1",
          number: 1,
          date: new Date("2026-04-10T00:00:00.000Z"),
          canceledAt: null,
          startTime: null,
          endTime: null,
          topic: null,
          cancelReason: null,
          meetingUrl: null,
          recordingUrl: null,
        },
      ],
      marcas: [{ enrollmentId: "enr_m1", classSessionId: "cls_1", status: "presente" }],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);

    expect(r!.courses[0]!.attendancePct).toBeNull();
    expect(r!.courses[0]!.minAttendancePct).toBeNull();
    expect(r!.courses[0]!.modules![0]!.attendancePct).toBe(100);
  });

  /** SC-010 — las razones de la madre NOMBRAN el módulo que las causó. */
  it("la razón de la madre nombra el módulo culpable", async () => {
    const { madre, modulo } = recorridoEbim13();
    colaDeOverview([madre, modulo(1), modulo(2)], {
      evaluaciones: [
        { id: "as_1", cohortId: "coh_m2", name: "Entrega final", required: true, createdAt: AHORA },
        { id: "as_0", cohortId: "coh_m1", name: "Entrega 1", required: true, createdAt: AHORA },
      ],
      resultados: [
        { assessmentId: "as_1", enrollmentId: "enr_m2", passed: false },
        { assessmentId: "as_0", enrollmentId: "enr_m1", passed: true },
      ],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);

    expect(r!.courses[0]!.approval).toBe("reprobado");
    expect(r!.courses[0]!.approvalReasons.join(" ")).toContain("Módulo 2");
  });
});

/* ============================================================
 * El menú lateral: UNA línea por especialización (FR-028)
 * ============================================================ */

describe("028 — studentNavCourses colapsa la especialización en una línea", () => {
  function colaDeNav(rows: unknown[]) {
    selectQueue.push(rows);
  }

  const navRow = (over: Record<string, unknown> = {}) => ({
    enrollmentId: "enr_madre",
    parentEnrollmentId: null,
    cohortName: "EBIM 13",
    courseName: "Especialización en Proyectos BIM",
    status: "en_curso",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    ...over,
  });

  /**
   * **Cinco entradas en el menú lateral para una sola cursada es exactamente
   * lo que la 024 vino a evitar.** Con la madre y cuatro hijas el alumno ve
   * UNA línea.
   */
  it("una madre con cuatro hijas produce UNA sola entrada", async () => {
    colaDeNav([
      navRow(),
      ...[1, 2, 3, 4].map((n) =>
        navRow({
          enrollmentId: `enr_m${n}`,
          parentEnrollmentId: "enr_madre",
          cohortName: `Módulo ${n}`,
          courseName: `Revit ${n}`,
        })
      ),
    ]);

    const { studentNavCourses } = await import("@/server/student-portal");
    const menu = await studentNavCourses(ORG, CONTACTO);

    expect(menu).toHaveLength(1);
    expect(menu[0]!.enrollmentId).toBe("enr_madre");
    expect(menu[0]!.label).toBe("Especialización en Proyectos BIM");
    expect(menu[0]!.moduleCount).toBe(4);
  });

  /**
   * FR-032 — el alumno de siempre, sin madre ni hijas, ve EXACTAMENTE lo de
   * hoy: una línea por cursada, con la etiqueta del curso.
   */
  it("sin especialización, el menú es el de siempre", async () => {
    colaDeNav([
      navRow({ enrollmentId: "enr_1", cohortName: "Revit MEP 1", courseName: "Revit MEP" }),
      navRow({
        enrollmentId: "enr_2",
        cohortName: "Civil 3D 4",
        courseName: "Civil 3D",
        status: "finalizada",
      }),
    ]);

    const { studentNavCourses } = await import("@/server/student-portal");
    const menu = await studentNavCourses(ORG, CONTACTO);

    expect(menu).toEqual([
      { enrollmentId: "enr_1", label: "Revit MEP", active: true, moduleCount: 0 },
      { enrollmentId: "enr_2", label: "Civil 3D", active: false, moduleCount: 0 },
    ]);
  });
});

/* ============================================================
 * Los hitos, un nivel más arriba (024 + US3)
 * ============================================================ */

describe("028 — el recorrido de la especialización", () => {
  const modulo = (over: Record<string, unknown> = {}) => ({
    name: "Módulo 1 — Revit Arquitectura",
    approval: "aprobado" as const,
    otraCamada: false,
    camadaName: null as string | null,
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    certificate: null as { issuedAt: Date; revokedAt: Date | null } | null,
    ...over,
  });

  const base = {
    enrolledAt: new Date("2026-03-01T00:00:00.000Z"),
    classes: [] as { date: Date; number: number }[],
    attendancePct: null,
    minAttendancePct: null,
    assessments: [] as {
      name: string;
      required: boolean;
      passed: boolean | null;
      at: Date | null;
    }[],
    certificate: null as { issuedAt: Date; revokedAt: Date | null } | null,
    now: AHORA,
  };

  it("hay un hito por módulo, en el orden recibido, con su nombre real", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const hitos = buildMilestones({
      ...base,
      modules: [
        modulo({ name: "Módulo 1 — Revit Arquitectura" }),
        modulo({ name: "Módulo 2 — Revit Estructura", approval: "pendiente" }),
      ],
    });

    expect(hitos.map((h) => h.label)).toEqual([
      "Te inscribiste",
      "Módulo 1 — Revit Arquitectura",
      "Módulo 2 — Revit Estructura",
      "Certificado",
    ]);
  });

  /**
   * 024, un nivel más arriba — **un hito sólo se marca cumplido si el sistema
   * tiene con qué probarlo.** Un módulo sin nada cargado NO es un logro y
   * tampoco es un fracaso: es `sin_datos`.
   */
  it("un módulo sin datos no se marca cumplido ni no alcanzado", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const hitos = buildMilestones({
      ...base,
      modules: [modulo({ approval: "sin_datos" })],
    });

    expect(hitos.find((h) => h.key === "modulo-0")!.state).toBe("sin_datos");
  });

  it("un módulo reprobado sí se dice: ahí el dato existe", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const hitos = buildMilestones({
      ...base,
      modules: [modulo({ approval: "reprobado" })],
    });

    expect(hitos.find((h) => h.key === "modulo-0")!.state).toBe("no_alcanzado");
  });

  /** "Acá estás" es el primer módulo pendiente: la misma regla de la 024. */
  it("marca en curso el primer módulo pendiente, y uno solo", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const hitos = buildMilestones({
      ...base,
      modules: [
        modulo({ name: "M1" }),
        modulo({ name: "M2", approval: "pendiente" }),
        modulo({ name: "M3", approval: "pendiente" }),
      ],
    });

    expect(hitos.filter((h) => h.state === "en_curso")).toHaveLength(1);
    expect(hitos.find((h) => h.state === "en_curso")!.label).toBe("M2");
  });

  /** US4 — el módulo de otra camada lo declara en el propio recorrido. */
  it("el módulo cursado con otra camada lo dice en su detalle", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const hitos = buildMilestones({
      ...base,
      modules: [modulo({ otraCamada: true, camadaName: "EBIM 14" })],
    });

    expect(hitos.find((h) => h.key === "modulo-0")!.detail).toContain("EBIM 14");
  });

  /** El certificado general explica su condición: todos los módulos aprobados. */
  it("el certificado general dice qué hace falta para emitirlo", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const hitos = buildMilestones({ ...base, modules: [modulo()] });
    const cert = hitos.find((h) => h.key === "certificado")!;

    expect(cert.state).toBe("pendiente");
    expect(cert.detail).toContain("módulos");
  });

  /**
   * FR-032 — **sin `modules` el recorrido es el de la 024, sin una coma de
   * diferencia.** Es el camino de las 33 cohortes simples.
   */
  it("sin módulos, los hitos son exactamente los de la 024", async () => {
    const { buildMilestones } = await import("@/server/student-portal");
    const clases = [1, 2, 3, 4, 5, 6].map((n) => ({
      number: n,
      date: new Date(`2026-0${n}-01T00:00:00.000Z`),
    }));

    const hitos = buildMilestones({
      ...base,
      classes: clases,
      attendancePct: 90,
      minAttendancePct: 75,
      assessments: [{ name: "Entrega 1", required: true, passed: true, at: AHORA }],
    });

    expect(hitos.map((h) => h.key)).toEqual([
      "inscripcion",
      "primera-clase",
      "mitad",
      "evaluacion-0",
      "asistencia",
      "ultima-clase",
      "certificado",
    ]);
  });
});

/* ============================================================
 * FR-032 — sin regresión para el alumno de siempre
 * ============================================================ */

describe("FR-032 — la cursada simple del alumno no cambia", () => {
  function alumnoSimple() {
    return fila(
      inscripcion({ id: "enr_1", cohortId: "coh_1", parentEnrollmentId: null }),
      camada({ id: "coh_1", name: "Revit MEP 1", minAttendancePct: 75 }),
      "Revit MEP"
    );
  }

  it("una inscripción sin madre y sin hijas no declara módulos", async () => {
    colaDeOverview([alumnoSimple()], {
      sesiones: [1, 2].map((n) => ({
        id: `cls_${n}`,
        cohortId: "coh_1",
        number: n,
        date: new Date(`2026-05-0${n}T00:00:00.000Z`),
        canceledAt: null,
        startTime: null,
        endTime: null,
        topic: null,
        cancelReason: null,
        meetingUrl: null,
        recordingUrl: null,
      })),
      marcas: [
        { enrollmentId: "enr_1", classSessionId: "cls_1", status: "presente" },
        { enrollmentId: "enr_1", classSessionId: "cls_2", status: "ausente" },
      ],
    });

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);
    const curso = r!.courses[0]!;

    expect(r!.courses).toHaveLength(1);
    expect(curso.modules).toBeUndefined();
    expect(curso.attendancePct).toBe(50);
    expect(curso.minAttendancePct).toBe(75);
    expect(curso.approval).toBe("reprobado");
    expect(curso.totalClasses).toBe(2);
  });

  /**
   * El caso más común de las 41 cohortes importadas: cronograma sin asistencia
   * cargada. **0% porque nadie pasó lista no es 0% porque no vino.**
   */
  it("sin marcas de asistencia sigue diciendo sin_datos, no 0%", async () => {
    colaDeOverview([alumnoSimple()]);

    const { studentOverview } = await import("@/server/student-portal");
    const r = await studentOverview(ORG, CONTACTO, AHORA);

    expect(r!.courses[0]!.attendancePct).toBeNull();
    expect(r!.courses[0]!.approval).toBe("sin_datos");
  });
});

/* ============================================================
 * PARTE B — El portal del profesor: casi nada, y ése es el punto
 * ============================================================ */

/**
 * El doble de acá es POR TABLA y no posicional: las funciones del profesor
 * encadenan varias consultas y contar cuántas van se rompe con cualquier
 * refactor. Es el mismo doble de `teacher-scope.test.ts`.
 */
const colas = new Map<string, unknown[][]>();

function responder(tabla: string, filas: unknown[]) {
  const cola = colas.get(tabla) ?? [];
  cola.push(filas);
  colas.set(tabla, cola);
}

function chainPorTabla() {
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

const PROFE_M2 = "tch_m2";

const MODULO_2 = {
  id: "coh_m2",
  name: "Módulo 2 — Revit Estructura",
  teacherId: PROFE_M2,
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: null,
  startTime: "18:30",
  endTime: "21:30",
  classroom: "Aula 2",
  courseName: "Revit Estructura",
  parentCohortId: "coh_ebim13",
  position: 2,
};

describe("028 — el portal del profesor sigue siendo POR COHORTE (US2, FR-029)", () => {
  beforeEach(() => {
    colas.clear();
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      getRootDb: () => ({
        transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
      }),
      getDb: () => ({ select: () => chainPorTabla(), selectDistinct: () => chainPorTabla() }),
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
  });

  /** El profesor del módulo 2 abre su portal → ve UNA cohorte: la suya. */
  it("el profesor del módulo 2 ve UNA cohorte: la suya", async () => {
    responder("cohort", [{ id: "coh_m2" }]); // titular del módulo 2
    responder("classSession", []); // sin suplencias
    responder("cohort", [MODULO_2]); // la fila de la cohorte
    responder("cohort", [
      { id: "coh_ebim13", name: "EBIM 13", courseName: "Especialización en Proyectos BIM" },
    ]);
    responder("enrollment", [{ cohortId: "coh_m2" }]);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    const cohortes = await listTeacherCohorts(ORG, PROFE_M2);

    expect(cohortes).toHaveLength(1);
    expect(cohortes[0]!.id).toBe("coh_m2");
  });

  /**
   * **FR-029, lo único que se le agrega**: saber que su cohorte tiene padre,
   * para nombrarla bien en pantalla. Nada más.
   */
  it("el módulo sabe nombrar su programa", async () => {
    responder("cohort", [{ id: "coh_m2" }]);
    responder("classSession", []);
    responder("cohort", [MODULO_2]);
    responder("cohort", [
      { id: "coh_ebim13", name: "EBIM 13", courseName: "Especialización en Proyectos BIM" },
    ]);
    responder("enrollment", []);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    const [cohorte] = await listTeacherCohorts(ORG, PROFE_M2);

    expect(cohorte!.program).toEqual({
      name: "Especialización en Proyectos BIM",
      position: 2,
    });
  });

  /** Una cohorte suelta no inventa un programa: `null`, y sin consulta extra. */
  it("una cohorte sin padre no declara programa", async () => {
    responder("cohort", [{ id: "coh_1" }]);
    responder("classSession", []);
    responder("cohort", [{ ...MODULO_2, id: "coh_1", parentCohortId: null, position: null }]);
    responder("enrollment", []);

    const { listTeacherCohorts } = await import("@/server/teacher-portal");
    const [cohorte] = await listTeacherCohorts(ORG, PROFE_M2);

    expect(cohorte!.program).toBeNull();
  });

  /** Pide por id la cohorte del módulo 3 → 404. No es suya y no existe para él. */
  it("el módulo hermano devuelve null: 404, no 403", async () => {
    responder("cohort", []); // `teacherReachesCohort` no encuentra nada

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    expect(await teacherCohortDetail(ORG, PROFE_M2, "coh_m3")).toBeNull();
  });

  /**
   * **El caso que más se olvida**: la camada PADRE tampoco se alcanza. El
   * padre no es "el contexto de todos": es una cohorte más, y el profesor del
   * módulo 2 no es profesor de ella.
   */
  it("la camada PADRE también devuelve null: no es el contexto de todos", async () => {
    responder("cohort", []);

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    expect(await teacherCohortDetail(ORG, PROFE_M2, "coh_ebim13")).toBeNull();
  });

  /**
   * US4 — quien recursa ese módulo viniendo de otra EBIM aparece en el roster
   * como una alumna más, porque para ESE módulo lo es. Lo que el profesor no
   * ve es su recorrido en la especialización de origen.
   */
  it("quien recursa aparece en el roster como una alumna más, sin su recorrido", async () => {
    responder("cohort", [{ id: "coh_m2" }]); // teacherReachesCohort
    responder("cohort", [{ id: "coh_m2" }]); // resolveTeacherScope: titular
    responder("classSession", []);
    responder("cohort", [MODULO_2]);
    responder("cohort", [
      { id: "coh_ebim13", name: "EBIM 13", courseName: "Especialización en Proyectos BIM" },
    ]);
    responder("enrollment", []); // conteo de inscriptos
    responder("enrollment", [
      { enrollmentId: "enr_propia", firstName: "Ana", lastName: "Pérez" },
      { enrollmentId: "enr_recursa", firstName: "Luis", lastName: "Gómez" },
    ]);

    const { teacherCohortDetail } = await import("@/server/teacher-portal");
    const detalle = await teacherCohortDetail(ORG, PROFE_M2, "coh_m2");

    expect(detalle!.students).toEqual([
      { enrollmentId: "enr_propia", name: "Ana Pérez" },
      { enrollmentId: "enr_recursa", name: "Luis Gómez" },
    ]);
    // Ni una palabra de la especialización de origen de quien recursa.
    expect(JSON.stringify(detalle)).not.toContain("EBIM 14");
    for (const alumno of detalle!.students) {
      expect(Object.keys(alumno).sort()).toEqual(["enrollmentId", "name"]);
    }
  });
});

/* ============================================================
 * El guard que impide la regresión que US2 nombra por su nombre
 * ============================================================ */

describe("US2 — el armado de la especialización NO entra al portal del profesor", () => {
  const codigo = readFileSync(
    path.join(process.cwd(), "src", "server", "teacher-portal.ts"),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  /**
   * **La tentación concreta, escrita en la spec**: cuando exista el armado "la
   * especialización entera" (US3), alguien va a querer reusarlo en el portal
   * del profesor "para que vea el contexto". Ese día el profesor del módulo 2
   * empieza a ver los alumnos y las notas de los otros tres, y nadie se entera
   * hasta que un profesor lo comenta.
   *
   * Por eso el guard es estructural y no de comportamiento: el fallo no se ve
   * en ninguna pantalla hasta que ya pasó.
   */
  it("no importa el armado de la especialización ni el portal del alumno", () => {
    expect(codigo).not.toMatch(/from\s+"@\/server\/student-portal"/);
    expect(codigo).not.toMatch(/from\s+"@\/server\/student-record"/);
    for (const prohibido of [
      "programGrading",
      "programApprovalState",
      "listProgramClasses",
      "listarHijas",
      "listarModulos",
      "parentEnrollmentId",
    ]) {
      expect(codigo, `el portal del profesor nombra ${prohibido}`).not.toContain(prohibido);
    }
  });

  /** La regla de alcance no cambió: sigue siendo una unión de ids de cohorte. */
  it("el alcance sigue resolviéndose por cohorte, sin mirar el árbol", () => {
    const alcance = codigo.slice(
      codigo.indexOf("export async function resolveTeacherScope"),
      codigo.indexOf("export async function teacherReachesCohort")
    );
    expect(alcance).not.toContain("parentCohortId");
    expect(alcance.length).toBeGreaterThan(100);
  });

  /** Ausencia = 404, nunca 403. La regla de la 014, repetida acá a propósito. */
  it("sigue sin haber un solo 403", () => {
    expect(codigo).not.toMatch(/\b403\b/);
  });
});
