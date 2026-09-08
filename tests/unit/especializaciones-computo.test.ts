import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 028 fase 2 — La capa de cómputo aprende a caminar el árbol.
 *
 * La fase 1 dejó el modelo (dos auto-referencias, la dispensa y sus guardas) y
 * `programApprovalState`, que es PURA y no consulta nada. Acá se la conecta a
 * datos reales, y se agregan las tres reglas que el árbol obliga a escribir:
 *
 * - la **dispensa de asistencia** metida adentro de la aprobación por módulo,
 *   salteando SÓLO la compuerta de asistencia (FR-024);
 * - la asistencia **por módulo**, nunca agregada en un número solo (regla 5);
 * - la camada padre **sin clases propias** (DV-009).
 *
 * El eje que atraviesa todo el archivo es FR-032: una inscripción sin madre y
 * sin hijas, contra una cohorte sin padre y sin módulos, tiene que dar
 * EXACTAMENTE lo de hoy. Por eso casi cada bloque tiene su caso "sin nada".
 */

/* ============================================================
 * El doble de base: cola posicional, como el resto de tests/unit
 * ============================================================ */

const selectQueue: unknown[][] = [];
const inserts: unknown[] = [];

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
    insert: () => ({
      values: async (values: unknown) => {
        inserts.push(values);
      },
    }),
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
  inserts.length = 0;
  vi.resetModules();
});

/* ============================================================
 * La dispensa de asistencia — FR-024, FR-025, FR-039
 * ============================================================ */

const OTORGADA = new Date("2026-09-07T12:00:00.000Z");

const DISPENSA = {
  otorgadaEl: OTORGADA,
  otorgadaPor: "Sergio",
  motivo: "avisó antes de empezar que se iba de viaje",
};

describe("moduleApprovalState — la dispensa, adentro de la aprobación por módulo", () => {
  /**
   * FR-032 — el camino de las 33 cohortes simples. Sin dispensa la función
   * tiene que devolver el MISMO objeto que `approvalState`, no uno parecido:
   * si algún día alguien le agrega un motivo "de más", este caso lo caza.
   */
  it("SIN dispensa devuelve exactamente lo mismo que approvalState", async () => {
    const { approvalState, moduleApprovalState } = await import("@/server/grading");
    const casos: [(boolean | null)[], number | null, number | null][] = [
      [[true, true], 90, 75],
      [[true, null], 90, 75],
      [[true, false], 100, 75],
      [[true, true], 50, 75],
      [[false, null], 90, 75],
      [[true, true], null, null],
      [[], 80, 80],
      [[true, true], null, 75],
    ];
    for (const [r, pct, min] of casos) {
      expect(moduleApprovalState(r, pct, min, null)).toEqual(approvalState(r, pct, min));
    }
  });

  /** US6 — 62% con mínimo de 80% es `reprobado` mientras no haya dispensa. */
  it("sin dispensa, por debajo del mínimo, reprueba", async () => {
    const { moduleApprovalState } = await import("@/server/grading");
    const r = moduleApprovalState([true], 62, 80, null);
    expect(r.state).toBe("reprobado");
    expect(r.reasons.join(" ")).toContain("Asistencia 62%");
  });

  /**
   * FR-025 / SC-011 — el motivo VIAJA en `approvalReasons`, con autor y fecha.
   * Una dispensa silenciosa produce una aprobación que nadie puede explicar
   * mirando la pantalla, y a los seis meses es indistinguible de un error de
   * cálculo.
   */
  it("con dispensa vigente aprueba, y el motivo dice quién y cuándo", async () => {
    const { moduleApprovalState } = await import("@/server/grading");
    const r = moduleApprovalState([true], 62, 80, DISPENSA);

    expect(r.state).toBe("aprobado");
    const texto = r.reasons.join(" ");
    // La asistencia REAL sigue a la vista: no se infla el número (FR-026).
    expect(texto).toContain("62%");
    expect(texto).toContain("mínimo 80%");
    expect(texto).toContain("Sergio");
    expect(texto).toContain("7/9/2026");
    expect(texto).toContain("avisó antes de empezar que se iba de viaje");
  });

  /**
   * FR-024 — **el contraejemplo**. La dispensa perdona faltas, no trabajos.
   * Es el caso que separa "saltear una compuerta" de "aprobar por decreto".
   */
  it("con dispensa Y una evaluación obligatoria desaprobada SIGUE reprobado", async () => {
    const { moduleApprovalState } = await import("@/server/grading");
    const r = moduleApprovalState([true, false], 62, 80, DISPENSA);

    expect(r.state).toBe("reprobado");
    expect(r.reasons.join(" ")).toContain("Desaprobó");
  });

  /** FR-017 — un `null` nunca es `reprobado`, tampoco con dispensa. */
  it("con dispensa y una evaluación sin corregir queda pendiente", async () => {
    const { moduleApprovalState } = await import("@/server/grading");
    expect(moduleApprovalState([true, null], 62, 80, DISPENSA).state).toBe("pendiente");
  });

  /**
   * La compuerta que saltea es la de asistencia, y también la mitad "todavía
   * no hay asistencia registrada": con mínimo exigido y sin una sola marca, el
   * módulo quedaba `pendiente` para siempre aunque el dueño ya lo habilitó.
   */
  it("con dispensa y sin asistencia registrada, aprueba igual", async () => {
    const { moduleApprovalState } = await import("@/server/grading");
    expect(moduleApprovalState([true], null, 80, DISPENSA).state).toBe("aprobado");
  });

  /**
   * Una dispensa que no tenía nada que perdonar no ensucia la pantalla: quien
   * cumplió la asistencia no necesita que le expliquen por qué aprobó.
   */
  it("con dispensa y la asistencia CUMPLIDA no agrega ningún motivo", async () => {
    const { approvalState, moduleApprovalState } = await import("@/server/grading");
    expect(moduleApprovalState([true], 90, 80, DISPENSA)).toEqual(
      approvalState([true], 90, 80)
    );
  });
});

/**
 * DV-004 — revocar es un acto, no un borrado. `dispensaVigente` (fase 1) es
 * la única que decide si una dispensa cuenta, y acá se verifica que la
 * aprobación la respete en vez de mirar las columnas por su cuenta.
 */
describe("dispensaVigente gobierna la aprobación (DV-004, FR-023)", () => {
  const columnas = {
    attendanceWaiverAt: OTORGADA,
    attendanceWaiverReason: "viaje avisado",
    attendanceWaiverRevokedAt: null as Date | null,
  };

  it("una dispensa revocada NO aplica", async () => {
    const { dispensaVigente } = await import("@/server/program-modules");
    expect(
      dispensaVigente({ ...columnas, attendanceWaiverRevokedAt: new Date("2026-09-20") })
    ).toBe(false);
  });

  it("una dispensa sin motivo NO aplica: sin motivo no hay dispensa", async () => {
    const { dispensaVigente } = await import("@/server/program-modules");
    expect(dispensaVigente({ ...columnas, attendanceWaiverReason: "   " })).toBe(false);
  });

  it("una dispensa otorgada y no revocada aplica", async () => {
    const { dispensaVigente } = await import("@/server/program-modules");
    expect(dispensaVigente(columnas)).toBe(true);
  });
});

/* ============================================================
 * La asistencia POR MÓDULO — FR-030, regla 5
 * ============================================================ */

describe("attendanceByModule — un porcentaje por módulo, nunca uno solo", () => {
  const HIJAS = [
    { enrollmentId: "enr_m1", cohortId: "coh_m1", enrolledAt: null },
    { enrollmentId: "enr_m2", cohortId: "coh_m2", enrolledAt: null },
  ];

  const SESIONES = [
    { id: "cls_1", cohortId: "coh_m1", date: new Date("2026-04-01"), canceledAt: null },
    { id: "cls_2", cohortId: "coh_m1", date: new Date("2026-04-08"), canceledAt: null },
    { id: "cls_3", cohortId: "coh_m2", date: new Date("2026-06-01"), canceledAt: null },
    { id: "cls_4", cohortId: "coh_m2", date: new Date("2026-06-08"), canceledAt: null },
  ];

  /**
   * La cadena que la base NO protege (decisión 3): `class_session.cohort_id`
   * apunta a la cohorte del MÓDULO y `attendance.enrollment_id` a la
   * inscripción hija. No hay clave foránea que obligue a que coincidan, así
   * que lo fija un test (FR-037).
   */
  it("cada módulo cuenta sólo SUS clases y SUS marcas", async () => {
    const { attendanceByModule } = await import("@/server/attendance");
    const pct = attendanceByModule(HIJAS, SESIONES, [
      { enrollmentId: "enr_m1", classSessionId: "cls_1", status: "presente" },
      { enrollmentId: "enr_m1", classSessionId: "cls_2", status: "ausente" },
      { enrollmentId: "enr_m2", classSessionId: "cls_3", status: "presente" },
      { enrollmentId: "enr_m2", classSessionId: "cls_4", status: "presente" },
    ]);

    expect(pct.get("enr_m1")).toBe(50);
    expect(pct.get("enr_m2")).toBe(100);
    // Y NO existe ningún "75% de la especialización": el promedio de los dos
    // módulos no es un dato que esta función sepa producir.
    expect(pct.size).toBe(2);
  });

  /** DV-009 — una clase colgada de la camada padre no pertenece a ningún módulo. */
  it("una sesión de la camada PADRE no aporta a ningún módulo", async () => {
    const { attendanceByModule } = await import("@/server/attendance");
    const pct = attendanceByModule(
      HIJAS,
      [
        ...SESIONES,
        {
          id: "cls_padre",
          cohortId: "coh_padre",
          date: new Date("2026-04-02"),
          canceledAt: null,
        },
      ],
      [
        { enrollmentId: "enr_m1", classSessionId: "cls_1", status: "presente" },
        { enrollmentId: "enr_m1", classSessionId: "cls_2", status: "presente" },
        { enrollmentId: "enr_m2", classSessionId: "cls_3", status: "presente" },
        { enrollmentId: "enr_m2", classSessionId: "cls_4", status: "presente" },
      ]
    );
    // Si la clase del padre entrara al denominador de alguno, bajaría de 100.
    expect(pct.get("enr_m1")).toBe(100);
    expect(pct.get("enr_m2")).toBe(100);
  });

  /**
   * **0% porque nadie pasó lista NO es 0% porque no vino** (CLAUDE.md, 013).
   * Sobre el recorrido de una persona el 0 es una acusación.
   */
  it("un módulo con clases y sin una sola marca da null, jamás 0", async () => {
    const { attendanceByModule } = await import("@/server/attendance");
    const pct = attendanceByModule(HIJAS, SESIONES, [
      { enrollmentId: "enr_m1", classSessionId: "cls_1", status: "presente" },
    ]);
    expect(pct.get("enr_m1")).toBe(50);
    expect(pct.get("enr_m2")).toBeNull();
  });

  it("un módulo sin cohorte resuelta da null y no rompe el recorrido", async () => {
    const { attendanceByModule } = await import("@/server/attendance");
    const pct = attendanceByModule(
      [{ enrollmentId: "enr_x", cohortId: null, enrolledAt: null }],
      SESIONES,
      []
    );
    expect(pct.get("enr_x")).toBeNull();
  });
});

/* ============================================================
 * La camada padre NO tiene clases — DV-009
 * ============================================================ */

describe("cannotGenerateReason — una camada con módulos no tiene cronograma", () => {
  it("sin módulos se comporta igual que siempre (FR-032)", async () => {
    const { cannotGenerateReason } = await import("@/server/classes");
    expect(
      cannotGenerateReason({ endDate: new Date("2026-12-01"), daysOfWeek: "0,2" })
    ).toBeNull();
    expect(
      cannotGenerateReason({ endDate: null, daysOfWeek: "0,2" })
    ).toContain("fecha de fin");
    expect(
      cannotGenerateReason({ endDate: new Date("2026-12-01"), daysOfWeek: null })
    ).toContain("días de cursada");
  });

  /**
   * DV-009 — "¿de qué módulo es esta clase?" es LA pregunta que el ciclo
   * viene a contestar, y una clase colgada del padre no la puede contestar.
   * El motivo se dice antes que el de fechas o días: aunque la camada tenga
   * los dos datos cargados, sigue sin poder tener clases propias.
   */
  it("con módulos se rechaza, y el motivo gana sobre los demás", async () => {
    const { cannotGenerateReason } = await import("@/server/classes");
    const motivo = cannotGenerateReason({
      endDate: new Date("2026-12-01"),
      daysOfWeek: "0,2",
      tieneModulos: true,
    });
    expect(motivo).not.toBeNull();
    expect(motivo).toContain("módulo");
  });
});

describe("generateSchedule — la camada padre se rechaza con un motivo (DV-009)", () => {
  it("una camada con módulos no genera cronograma", async () => {
    selectQueue.push([
      {
        id: "coh_padre",
        startDate: new Date("2026-04-22"),
        endDate: new Date("2026-12-20"),
        daysOfWeek: "0,2",
        startTime: "18:30",
        endTime: "20:30",
        teacherId: null,
      },
    ]);
    selectQueue.push([{ id: "coh_m1" }]); // tiene módulos

    const { generateSchedule } = await import("@/server/attendance");
    const r = await generateSchedule("org_1", "coh_padre");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.message).toContain("módulo");
    }
  });

  /** FR-032 — la cohorte simple sigue generando igual que hoy. */
  it("una cohorte simple sigue llegando al cronograma", async () => {
    selectQueue.push([
      {
        id: "coh_1",
        startDate: new Date("2026-10-05"),
        endDate: new Date("2026-10-12"),
        daysOfWeek: "0",
        startTime: "18:30",
        endTime: "20:30",
        teacherId: null,
      },
    ]);
    selectQueue.push([]); // sin módulos
    selectQueue.push([]); // sin cronograma previo
    selectQueue.push([]); // listSessions, ya insertado

    const { generateSchedule } = await import("@/server/attendance");
    const r = await generateSchedule("org_1", "coh_1");

    // Ningún motivo nuevo la frenó: llegó a insertar el cronograma.
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });
});

/* ============================================================
 * Las clases de una especialización — FR-030, DV-009
 * ============================================================ */

const ORG_ROW = { timezone: "America/Montevideo", before: 15, after: 30 };

function moduloCohorte(over: Record<string, unknown> = {}) {
  return {
    id: "coh_m1",
    name: "Módulo 1 — Revit Arquitectura",
    position: 1,
    parentCohortId: "coh_padre",
    courseId: "crs_1",
    teacherId: "tch_1",
    startDate: new Date("2026-04-22"),
    endDate: new Date("2026-05-30"),
    daysOfWeek: "0",
    startTime: "18:30",
    endTime: "20:30",
    meetingUrl: null,
    minAttendancePct: 80,
    ...over,
  };
}

describe("listProgramClasses — las clases de una especialización son las de sus módulos", () => {
  it("devuelve los módulos en orden de position, con sus clases", async () => {
    selectQueue.push([ORG_ROW]);
    selectQueue.push([
      moduloCohorte(),
      moduloCohorte({
        id: "coh_m2",
        name: "Módulo 2 — Revit Estructura",
        position: 2,
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-07-15"),
      }),
    ]);
    selectQueue.push([
      {
        id: "cls_1",
        cohortId: "coh_m1",
        number: 1,
        date: new Date("2026-04-27"),
        startTime: "18:30",
        endTime: "20:30",
        topic: "Interfaz",
        canceledAt: null,
        cancelReason: null,
        meetingUrl: null,
        recordingUrl: null,
      },
      {
        id: "cls_9",
        cohortId: "coh_m2",
        number: 1,
        date: new Date("2026-06-01"),
        startTime: "18:30",
        endTime: "20:30",
        topic: "Muros",
        canceledAt: null,
        cancelReason: null,
        meetingUrl: null,
        recordingUrl: null,
      },
    ]);

    const { listProgramClasses } = await import("@/server/classes");
    const r = await listProgramClasses("org_1", "coh_padre", new Date("2026-04-01"));

    expect(r).not.toBeNull();
    expect(r!.modules.map((m) => m.cohortId)).toEqual(["coh_m1", "coh_m2"]);
    expect(r!.modules.map((m) => m.position)).toEqual([1, 2]);
    // Cada clase queda atribuida a SU módulo: es la pregunta del ciclo.
    expect(r!.modules[0]!.classes.map((c) => c.id)).toEqual(["cls_1"]);
    expect(r!.modules[1]!.classes.map((c) => c.id)).toEqual(["cls_9"]);
    expect(r!.modules.every((m) => m.projected === false)).toBe(true);
  });

  /**
   * US3 — un módulo sin cronograma **se muestra igual**, declarando que
   * todavía no tiene clases. Ocultarlo es exactamente de dónde salieron los
   * 0 `class_session` de las 9 camadas de programa.
   */
  it("un módulo sin cronograma se muestra proyectado, no se oculta", async () => {
    selectQueue.push([ORG_ROW]);
    selectQueue.push([moduloCohorte()]);
    selectQueue.push([]); // ninguna clase real

    const { listProgramClasses } = await import("@/server/classes");
    const r = await listProgramClasses("org_1", "coh_padre", new Date("2026-04-01"));

    expect(r!.modules).toHaveLength(1);
    expect(r!.modules[0]!.projected).toBe(true);
    expect(r!.modules[0]!.classes.length).toBeGreaterThan(0);
    expect(r!.modules[0]!.classes.every((c) => c.id === null)).toBe(true);
  });

  it("una camada sin módulos devuelve una lista vacía, no un error", async () => {
    selectQueue.push([ORG_ROW]);
    selectQueue.push([]);

    const { listProgramClasses } = await import("@/server/classes");
    const r = await listProgramClasses("org_1", "coh_suelta", new Date("2026-04-01"));
    expect(r!.modules).toEqual([]);
  });
});

/* ============================================================
 * La composición del estado de la especialización — FR-016
 * ============================================================ */

function hija(over: Record<string, unknown> = {}) {
  return {
    id: "enr_m1",
    cohortId: "coh_m1",
    enrolledAt: null,
    position: 1,
    parentCohortId: "coh_padre",
    cohortName: "Módulo 1 — Revit Arquitectura",
    courseName: "Revit Arquitectura",
    startDate: new Date("2026-04-22"),
    endDate: new Date("2026-05-30"),
    cohortMinAttendancePct: null,
    courseMinAttendancePct: null,
    attendanceWaiverAt: null,
    attendanceWaiverReason: null,
    attendanceWaiverRevokedAt: null,
    attendanceWaiverByName: null,
    ...over,
  };
}

/** madre, hijas, y después clases / marcas / evaluaciones / resultados. */
function colaDePrograma(hijas: unknown[], resto: unknown[][] = [[], [], [], []]) {
  selectQueue.push([{ id: "enr_madre", cohortId: "coh_padre" }]);
  selectQueue.push(hijas);
  for (const r of resto) selectQueue.push(r);
}

describe("programGrading — el estado de la madre, compuesto sobre sus hijas (FR-016)", () => {
  /** DV-005 — la trampa del default optimista, ahora contra datos reales. */
  it("una madre SIN hijas queda pendiente, jamás aprobado", async () => {
    colaDePrograma([], []);
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    expect(r!.state).toBe("pendiente");
    expect(r!.modules).toEqual([]);
    expect(r!.reasons.join(" ")).toContain("módulo");
  });

  it("aprobado sólo con TODAS las hijas aprobadas", async () => {
    colaDePrograma(
      [hija(), hija({ id: "enr_m2", cohortId: "coh_m2", position: 2 })],
      [[], [], [], []]
    );
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    // Sin evaluaciones cargadas y sin mínimo de asistencia, cada módulo
    // aprueba por el default de `approvalState` — la planilla de cohorte.
    expect(r!.modules.map((m) => m.state)).toEqual(["aprobado", "aprobado"]);
    expect(r!.state).toBe("aprobado");
  });

  /** FR-017 / SC-010 — el módulo que no empezó deja pendiente, no reprobado. */
  it("una hija pendiente deja la especialización pendiente, y la razón la nombra", async () => {
    colaDePrograma(
      [hija(), hija({ id: "enr_m2", cohortId: "coh_m2", position: 2 })],
      [
        [], // clases
        [], // marcas
        [{ id: "as_1", cohortId: "coh_m2", name: "Entrega final", required: true, position: 0 }],
        [], // sin resultado cargado
      ]
    );
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    expect(r!.state).toBe("pendiente");
    expect(r!.reasons.join(" ")).toContain("Módulo 2");
  });

  /** Regla 2 — reprobar un módulo no bloquea, pero sí define el estado del programa. */
  it("una hija reprobada reprueba la especialización, nombrando el módulo", async () => {
    colaDePrograma(
      [hija(), hija({ id: "enr_m2", cohortId: "coh_m2", position: 2 })],
      [
        [],
        [],
        [{ id: "as_1", cohortId: "coh_m2", name: "Entrega final", required: true, position: 0 }],
        [{ assessmentId: "as_1", enrollmentId: "enr_m2", passed: false }],
      ]
    );
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    expect(r!.state).toBe("reprobado");
    expect(r!.reasons.join(" ")).toContain("Módulo 2");
    expect(r!.modules.find((m) => m.enrollmentId === "enr_m2")!.state).toBe("reprobado");
    // Y el módulo 1 sigue aprobado: reprobar uno no arrastra a los demás.
    expect(r!.modules.find((m) => m.enrollmentId === "enr_m1")!.state).toBe("aprobado");
  });

  /**
   * US4 / FR-008 — la hija puede apuntar al módulo de OTRA camada. Es el
   * escenario que ninguna otra forma del modelo puede representar.
   */
  it("un módulo cursado en otra camada se reporta como tal", async () => {
    colaDePrograma(
      [
        hija(),
        hija({
          id: "enr_m2",
          cohortId: "coh_m2_ebim14",
          position: 2,
          parentCohortId: "coh_padre_ebim14",
          cohortName: "Módulo 2 — EBIM 14",
        }),
      ],
      [[], [], [], []]
    );
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    const recursado = r!.modules.find((m) => m.enrollmentId === "enr_m2")!;
    expect(recursado.otraCamada).toBe(true);
    expect(recursado.camadaId).toBe("coh_padre_ebim14");
    expect(r!.modules.find((m) => m.enrollmentId === "enr_m1")!.otraCamada).toBe(false);
  });

  /**
   * FR-039 en su versión con datos: la dispensa vive en la hija, salta sólo
   * la asistencia, y su motivo llega al recorrido.
   */
  it("la dispensa de una hija la aprueba, y el motivo llega en las razones", async () => {
    colaDePrograma(
      [
        hija({
          cohortMinAttendancePct: 80,
          attendanceWaiverAt: OTORGADA,
          attendanceWaiverReason: "viaje avisado antes de empezar",
          attendanceWaiverByName: "Sergio",
        }),
      ],
      [
        [
          { id: "cls_1", cohortId: "coh_m1", date: new Date("2026-04-27"), canceledAt: null },
          { id: "cls_2", cohortId: "coh_m1", date: new Date("2026-05-04"), canceledAt: null },
        ],
        [
          { enrollmentId: "enr_m1", classSessionId: "cls_1", status: "presente" },
          { enrollmentId: "enr_m1", classSessionId: "cls_2", status: "ausente" },
        ],
        [],
        [],
      ]
    );
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    const modulo = r!.modules[0]!;
    expect(modulo.attendancePct).toBe(50); // el número REAL, sin inflar
    expect(modulo.state).toBe("aprobado");
    expect(modulo.reasons.join(" ")).toContain("Sergio");
    expect(r!.state).toBe("aprobado");
  });

  /** La dispensa es POR MÓDULO: no es un salvoconducto para los ocho meses. */
  it("la dispensa de un módulo no alcanza a sus hermanos", async () => {
    colaDePrograma(
      [
        hija({
          cohortMinAttendancePct: 80,
          attendanceWaiverAt: OTORGADA,
          attendanceWaiverReason: "viaje avisado",
          attendanceWaiverByName: "Sergio",
        }),
        hija({ id: "enr_m2", cohortId: "coh_m2", position: 2, cohortMinAttendancePct: 80 }),
      ],
      [
        [
          { id: "cls_1", cohortId: "coh_m1", date: new Date("2026-04-27"), canceledAt: null },
          { id: "cls_2", cohortId: "coh_m1", date: new Date("2026-05-04"), canceledAt: null },
          { id: "cls_3", cohortId: "coh_m2", date: new Date("2026-06-01"), canceledAt: null },
          { id: "cls_4", cohortId: "coh_m2", date: new Date("2026-06-08"), canceledAt: null },
        ],
        [
          { enrollmentId: "enr_m1", classSessionId: "cls_1", status: "presente" },
          { enrollmentId: "enr_m1", classSessionId: "cls_2", status: "ausente" },
          { enrollmentId: "enr_m2", classSessionId: "cls_3", status: "presente" },
          { enrollmentId: "enr_m2", classSessionId: "cls_4", status: "ausente" },
        ],
        [],
        [],
      ]
    );
    const { programGrading } = await import("@/server/grading");
    const r = await programGrading("org_1", "enr_madre");

    expect(r!.modules.find((m) => m.enrollmentId === "enr_m1")!.state).toBe("aprobado");
    expect(r!.modules.find((m) => m.enrollmentId === "enr_m2")!.state).toBe("reprobado");
    expect(r!.state).toBe("reprobado");
  });

  it("una madre inexistente devuelve null, no un estado inventado", async () => {
    selectQueue.push([]);
    const { programGrading } = await import("@/server/grading");
    expect(await programGrading("org_1", "enr_fantasma")).toBeNull();
  });
});

/* ============================================================
 * El legajo del staff — FR-031
 * ============================================================ */

const CONTACTO = {
  id: "ct_1",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@x.com",
  phone: "59899111222",
  nationalId: "1.234.567-8",
};

function filaLegajo(over: {
  enrollment?: Record<string, unknown>;
  cohort?: Record<string, unknown> | null;
  course?: Record<string, unknown> | null;
}) {
  return {
    enrollment: {
      id: "enr_1",
      parentEnrollmentId: null,
      enrolledAt: null,
      createdAt: new Date("2026-04-01"),
      attendanceWaiverAt: null,
      attendanceWaiverReason: null,
      attendanceWaiverRevokedAt: null,
      ...over.enrollment,
    },
    cohort:
      over.cohort === null
        ? null
        : {
            id: "coh_1",
            name: "Camada",
            parentCohortId: null,
            position: null,
            startDate: new Date("2026-04-22"),
            endDate: new Date("2026-12-20"),
            minAttendancePct: null,
            ...over.cohort,
          },
    course:
      over.course === null
        ? null
        : { id: "crs_1", name: "Curso", minAttendancePct: null, ...over.course },
    waiverAuthor: null,
  };
}

describe("getStudentRecord — la especialización con sus módulos (FR-031)", () => {
  /**
   * FR-032 — el caso de todos los días: una inscripción simple a una cohorte
   * simple. Ni una clave nueva, ni un estado distinto.
   */
  it("una inscripción simple sigue dando exactamente lo de hoy", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([filaLegajo({})]);
    selectQueue.push([]); // asistencia
    selectQueue.push([]); // clases
    selectQueue.push([]); // resultados
    selectQueue.push([]); // evaluaciones
    selectQueue.push([]); // certificados

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", []);

    expect(r!.courses).toHaveLength(1);
    expect(r!.courses[0]!.approval).toBe("sin_datos");
    expect(r!.courses[0]!.modules).toBeUndefined();
  });

  /**
   * FR-031 — la madre se ve UNA vez, con sus módulos adentro. Las hijas no
   * vuelven a aparecer sueltas: cinco filas donde hubo una venta es el mismo
   * número inflado que FR-014 persigue en el tablero.
   */
  it("la madre aparece una vez, con sus hijas adentro y no sueltas", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([
      filaLegajo({
        enrollment: { id: "enr_madre" },
        cohort: { id: "coh_padre", name: "EBIM 13" },
        course: { name: "Especialización en Proyectos BIM" },
      }),
      filaLegajo({
        enrollment: { id: "enr_m1", parentEnrollmentId: "enr_madre" },
        cohort: {
          id: "coh_m1",
          name: "Módulo 1 — Revit Arq",
          parentCohortId: "coh_padre",
          position: 1,
        },
        course: { name: "Revit Arquitectura" },
      }),
      filaLegajo({
        enrollment: { id: "enr_m2", parentEnrollmentId: "enr_madre" },
        cohort: {
          id: "coh_m2",
          name: "Módulo 2 — Revit Estructura",
          parentCohortId: "coh_padre",
          position: 2,
        },
        course: { name: "Revit Estructura" },
      }),
    ]);
    selectQueue.push([]); // asistencia
    selectQueue.push([]); // clases
    selectQueue.push([]); // resultados
    selectQueue.push([]); // evaluaciones
    selectQueue.push([]); // certificados

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", []);

    expect(r!.courses).toHaveLength(1);
    const madre = r!.courses[0]!;
    expect(madre.enrollmentId).toBe("enr_madre");
    expect(madre.modules?.map((m) => m.enrollmentId)).toEqual(["enr_m1", "enr_m2"]);
    expect(madre.modules?.map((m) => m.position)).toEqual([1, 2]);
    // La madre NO agrega asistencia: no existe "la asistencia de la
    // especialización", existe la de cada módulo (regla 5).
    expect(madre.attendancePct).toBeNull();
  });

  /**
   * US4 / FR-031 — el módulo cursado en OTRA camada aparece en el recorrido,
   * en su posición, diciendo con qué camada lo cursó.
   */
  it("un módulo cursado en otra camada dice en cuál", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([
      filaLegajo({
        enrollment: { id: "enr_madre" },
        cohort: { id: "coh_padre", name: "EBIM 13" },
        course: { name: "Especialización en Proyectos BIM" },
      }),
      filaLegajo({
        enrollment: { id: "enr_m3", parentEnrollmentId: "enr_madre" },
        cohort: {
          id: "coh_m3_ebim14",
          name: "Módulo 3",
          parentCohortId: "coh_padre_ebim14",
          position: 3,
        },
        course: { name: "Revit MEP" },
      }),
    ]);
    selectQueue.push([]); // asistencia
    selectQueue.push([]); // clases
    selectQueue.push([]); // resultados
    selectQueue.push([]); // evaluaciones
    selectQueue.push([]); // certificados
    selectQueue.push([{ id: "coh_padre_ebim14", name: "EBIM 14" }]); // camadas ajenas

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", []);

    const modulo = r!.courses[0]!.modules![0]!;
    expect(modulo.otraCamada).toBe(true);
    expect(modulo.camadaName).toBe("EBIM 14");
  });

  /**
   * La trampa que CLAUDE.md deja anotada, aplicada al nivel de arriba: una
   * madre sin un solo módulo cargado no puede figurar aprobada.
   */
  it("una madre sin hijas nunca figura aprobada", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([
      filaLegajo({
        enrollment: { id: "enr_madre" },
        cohort: { id: "coh_padre", name: "EBIM 13" },
      }),
    ]);
    for (let i = 0; i < 5; i++) selectQueue.push([]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", []);
    expect(r!.courses[0]!.approval).not.toBe("aprobado");
  });
});
