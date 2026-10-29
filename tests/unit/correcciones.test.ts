import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 (T016/T021, DV-003/DV-005) — La corrección versionada y su ÚNICA puerta
 * de publicación.
 *
 * Doble de base por TABLA (y no una cola posicional única): cada consulta toma
 * la siguiente respuesta de la tabla sobre la que hace `from(...)`. Así el test
 * dice "la corrección en trámite es ésta" sin depender de en qué orden el
 * módulo le pregunta a las demás tablas. Las escrituras se registran en orden,
 * que es justo lo que DV-003 exige mirar: la vigente anterior pasa a
 * `superseded` ANTES de que la nueva sea `published` (el índice único parcial
 * no admite dos vigentes ni por un instante).
 *
 * Es el mismo criterio de los demás tests de servidor del repositorio
 * (`entregas.test.ts`, `plantilla-correccion.test.ts`): sin base real, con la
 * conducta conducida de punta a punta por el arnés E2E (T043).
 */

const colas = new Map<string, unknown[][]>();
type Escritura = { op: "insert" | "update"; table: string; data: Record<string, unknown> };
let escrituras: Escritura[] = [];
/** La fila que devuelve un `update … returning()` (además de lo que se setea). */
let filaDeUpdate: Record<string, unknown> = {};

function responder(table: string, filas: unknown[]) {
  colas.set(table, [...(colas.get(table) ?? []), filas]);
}

function cadena(): Record<string, unknown> {
  let tabla = "";
  const chain: Record<string, unknown> = {};
  chain.from = (t: unknown) => {
    tabla = String(t);
    return chain;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(colas.get(tabla)?.shift() ?? []).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => cadena(),
    selectDistinct: () => cadena(),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        const filas = Array.isArray(v) ? v : [v];
        for (const f of filas) escrituras.push({ op: "insert", table: String(table), data: f });
        const resultado = filas.map((f) => ({
          createdAt: new Date("2026-10-14T12:00:00.000Z"),
          updatedAt: new Date("2026-10-14T12:00:00.000Z"),
          ...f,
        }));
        return {
          returning: async () => resultado,
          onConflictDoUpdate: async (cfg: { set: Record<string, unknown> }) => {
            escrituras.push({ op: "update", table: `${String(table)}:conflicto`, data: cfg.set });
            return [];
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (s: Record<string, unknown>) => {
        escrituras.push({ op: "update", table: String(table), data: s });
        const chain: Record<string, unknown> = {};
        chain.where = () => chain;
        chain.returning = async () => [{ ...filaDeUpdate, ...s }];
        (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
          Promise.resolve([]).then(resolve);
        return chain;
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
            get: (_t2, col) => {
              if (col === "toString" || col === Symbol.toPrimitive) {
                return () => String(tableName);
              }
              if (typeof col === "symbol") return undefined;
              return `${String(tableName)}.${col}`;
            },
          }
        ),
    }
  ),
}));

let alcanzaLaCohorte = true;
let detalleDeCohorte: { editable: boolean } | null = { editable: true };

vi.mock("@/server/teacher-portal", () => ({
  teacherReachesCohort: async () => alcanzaLaCohorte,
  teacherCohortDetail: async () => detalleDeCohorte,
}));

/**
 * `recordResults` se dobla para poder ver QUÉ le llega (nota y aprobado) y
 * para hacerlo fallar. Las pruebas de su propia escritura usan el real, con
 * `vi.importActual`, más abajo.
 */
type LlamadaResultado = {
  assessmentId: string;
  entries: { enrollmentId: string; passed: boolean | null; score?: number | null }[];
  opciones?: { origen?: string };
};
let llamadasAResultados: LlamadaResultado[] = [];
let resultadoDeEvaluacion: unknown = { ok: true, data: { recorded: 1 } };

vi.mock("@/server/grading", async (original) => ({
  ...(await original<typeof import("@/server/grading")>()),
  recordResults: async (
    _org: string,
    assessmentId: string,
    entries: LlamadaResultado["entries"],
    _by: string,
    opciones?: LlamadaResultado["opciones"]
  ) => {
    llamadasAResultados.push({ assessmentId, entries, opciones });
    return resultadoDeEvaluacion;
  },
}));

/**
 * 0084 — El correo "Tu corrección fue publicada" se agenda DESPUÉS del commit
 * (`onAfterCommit`; fuera de un alcance, al instante). Se dobla para ver que
 * se agenda y para que un envío nunca toque las colas de esta base de mentira.
 */
let avisosDePublicacion: { organizationId: string; correctionId: string }[] = [];
vi.mock("@/server/email/assessment-notices", () => ({
  avisarCorreccionPublicada: async (organizationId: string, correctionId: string) => {
    avisosDePublicacion.push({ organizationId, correctionId });
  },
}));

const {
  aprobarCorreccion,
  detalleParaAprobar,
  devolverCorreccion,
  evaluacionesCongeladas,
  listarPendientes,
  guardarCorreccion,
  guardarCorreccionDelProfesor,
  leerCorreccion,
  leerCorreccionDelProfesor,
} = await import("@/server/corrections");
const { corregirEntrega } = await import("@/server/submissions");
const { recordResults: recordResultsReal } =
  await vi.importActual<typeof import("@/server/grading")>("@/server/grading");

beforeEach(() => {
  colas.clear();
  escrituras = [];
  filaDeUpdate = {};
  llamadasAResultados = [];
  avisosDePublicacion = [];
  resultadoDeEvaluacion = { ok: true, data: { recorded: 1 } };
  alcanzaLaCohorte = true;
  detalleDeCohorte = { editable: true };
});

const ORG = "org_1";
const ASM = "asm_1";
const ENR = "enr_1";
const USR = "usr_1";

/** Trabajo final: 40/30/30, aprueba con 60 (el ejemplo del dueño). */
const NUMERICA = {
  assessmentId: ASM,
  cohortId: "coh_1",
  scale: "numeric",
  minScore: 60,
  requiresApproval: false,
  criteria: [
    { id: "c1", name: "Modelado", maxPoints: 40 },
    { id: "c2", name: "Planos", maxPoints: 30 },
    { id: "c3", name: "Render", maxPoints: 30 },
  ],
  textFields: [],
};

const PASS_FAIL = {
  assessmentId: ASM,
  cohortId: "coh_1",
  scale: "pass_fail",
  minScore: null,
  requiresApproval: false,
  criteria: [],
  textFields: [],
};

/** La inscripción ES de la cohorte de la evaluación: el join devuelve fila. */
function contexto(plantilla: Record<string, unknown>) {
  responder("enrollment", [plantilla]);
}

const PUNTAJES_80 = [
  { criterionId: "c1", points: 35 },
  { criterionId: "c2", points: 20 },
  { criterionId: "c3", points: 25 },
];

const escriturasEn = (tabla: string) => escrituras.filter((e) => e.table === tabla);

describe("DV-003 — un borrador no toca el resultado oficial", () => {
  it("guardar borrador inserta una versión `draft` y no escribe resultado ni entrega", async () => {
    contexto(NUMERICA);
    responder("correction", []); // nada en trámite

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, {
      action: "draft",
      criterionScores: [{ criterionId: "c1", points: 35 }],
    }, false);

    expect(r.ok).toBe(true);
    const insert = escriturasEn("correction").find((e) => e.op === "insert");
    expect(insert?.data).toMatchObject({ status: "draft", assessmentId: ASM, enrollmentId: ENR });
    expect(llamadasAResultados).toEqual([]);
    expect(escriturasEn("submission")).toEqual([]);
  });

  it("un borrador existente se actualiza, no se duplica", async () => {
    contexto(NUMERICA);
    responder("correction", [{ id: "cor_1", status: "draft" }]);
    filaDeUpdate = { id: "cor_1", assessmentId: ASM, enrollmentId: ENR, status: "draft" };

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, { action: "draft" }, false);

    expect(r.ok).toBe(true);
    expect(escriturasEn("correction").map((e) => e.op)).toEqual(["update"]);
    expect(llamadasAResultados).toEqual([]);
  });
});

describe("DV-003 — publicar es la ÚNICA escritura del resultado oficial", () => {
  it("35/20/25 → 80, aprobada con mínimo 60: escribe nota y aprobado, y espeja en la entrega", async () => {
    contexto(NUMERICA);
    responder("correction", []); // nada en trámite
    responder("submission", [{ id: "sub_1" }]); // la entrega es de esta evaluación y alumno
    // publicarCorreccion relee la versión que va a publicar
    responder("correction", [
      {
        id: "cor_nueva",
        assessmentId: ASM,
        enrollmentId: ENR,
        submissionId: "sub_1",
        status: "draft",
        score: 80,
        passed: true,
        feedback: "Buen trabajo",
      },
    ]);
    filaDeUpdate = { id: "cor_nueva", assessmentId: ASM, enrollmentId: ENR };

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, {
      action: "publish",
      submissionId: "sub_1",
      criterionScores: PUNTAJES_80,
      feedback: "Buen trabajo",
    }, false);

    expect(r.ok).toBe(true);
    expect(llamadasAResultados).toEqual([
      {
        assessmentId: ASM,
        entries: [{ enrollmentId: ENR, passed: true, score: 80 }],
        opciones: { origen: "correccion" },
      },
    ]);
    const espejo = escriturasEn("submission")[0]?.data;
    expect(espejo).toMatchObject({ passed: true, feedback: "Buen trabajo", correctedBy: USR });
  });

  it("al republicar, la vigente anterior pasa a `superseded` ANTES de publicar la nueva", async () => {
    contexto(NUMERICA);
    responder("correction", []);
    responder("correction", [
      { id: "cor_nueva", assessmentId: ASM, enrollmentId: ENR, submissionId: null, status: "draft", score: 80, passed: true, feedback: null },
    ]);

    await guardarCorreccion(ORG, ASM, ENR, USR, { action: "publish", criterionScores: PUNTAJES_80 }, false);

    const estados = escriturasEn("correction")
      .filter((e) => e.op === "update" && "status" in e.data)
      .map((e) => e.data.status);
    expect(estados).toEqual(["superseded", "published"]);
  });

  it("FR-014 — sin entrega se corrige igual, y no se toca ninguna entrega", async () => {
    contexto(NUMERICA);
    responder("correction", []);
    responder("correction", [
      { id: "cor_nueva", assessmentId: ASM, enrollmentId: ENR, submissionId: null, status: "draft", score: 80, passed: true, feedback: null },
    ]);

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, { action: "publish", criterionScores: PUNTAJES_80 }, false);

    expect(r.ok).toBe(true);
    expect(llamadasAResultados).toHaveLength(1);
    expect(escriturasEn("submission")).toEqual([]);
  });

  it("si el resultado no se pudo registrar, LANZA: la transacción del pedido revierte todo", async () => {
    contexto(NUMERICA);
    responder("correction", []);
    responder("correction", [
      { id: "cor_nueva", assessmentId: ASM, enrollmentId: ENR, submissionId: null, status: "draft", score: 80, passed: true, feedback: null },
    ]);
    resultadoDeEvaluacion = { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };

    await expect(
      guardarCorreccion(ORG, ASM, ENR, USR, { action: "publish", criterionScores: PUNTAJES_80 }, false)
    ).rejects.toThrow(/not_found/);
  });
});

describe("0084 — corregir por nivel y avisar al publicar", () => {
  it("guarda el nivel de cada criterio; sin puntos, toma los del nivel", async () => {
    contexto(NUMERICA);
    responder("correction", []);

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, {
      action: "draft",
      criterionScores: [
        { criterionId: "c1", points: null, level: "bueno", comment: " Bien " },
        { criterionId: "c2", points: 25, level: "excelente" },
      ],
    }, false);

    expect(r.ok).toBe(true);
    const insert = escriturasEn("correction").find((e) => e.op === "insert");
    expect(insert?.data.criterionScores).toEqual([
      { criterionId: "c1", points: 30, comment: "Bien", level: "bueno" },
      { criterionId: "c2", points: 25, comment: null, level: "excelente" },
    ]);
  });

  it("publicar agenda el correo al alumno con la versión publicada", async () => {
    contexto(NUMERICA);
    responder("correction", []);
    responder("correction", [
      { id: "cor_nueva", assessmentId: ASM, enrollmentId: ENR, submissionId: null, status: "draft", score: 80, passed: true, feedback: null },
    ]);

    await guardarCorreccion(ORG, ASM, ENR, USR, { action: "publish", criterionScores: PUNTAJES_80 }, false);

    const insertada = escriturasEn("correction").find((e) => e.op === "insert")?.data.id;
    expect(insertada).toBeTruthy();
    expect(avisosDePublicacion).toEqual([{ organizationId: ORG, correctionId: insertada }]);
  });

  it("un borrador no avisa nada", async () => {
    contexto(NUMERICA);
    responder("correction", []);
    await guardarCorreccion(ORG, ASM, ENR, USR, { action: "draft" }, false);
    expect(avisosDePublicacion).toEqual([]);
  });
});

describe("Lo que no se guarda", () => {
  it("35/30 y el tercero vacío no se publica: falta un ejercicio", async () => {
    contexto(NUMERICA);
    responder("correction", []);

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, {
      action: "publish",
      criterionScores: [
        { criterionId: "c1", points: 35 },
        { criterionId: "c2", points: 30 },
      ],
    }, false);

    expect(r).toMatchObject({ ok: false, status: 422, code: "correccion_incompleta" });
    expect(escrituras).toEqual([]);
  });

  it("una inscripción de otra cohorte es 404, igual que una inexistente", async () => {
    // el join inscripción × evaluación no devuelve fila
    const r = await guardarCorreccion(ORG, ASM, "enr_ajena", USR, { action: "draft" }, false);
    expect(r).toMatchObject({ ok: false, status: 404, code: "not_found" });
    expect(escrituras).toEqual([]);
    expect(await leerCorreccion(ORG, ASM, "enr_ajena", false)).toBeNull();
  });

  it("una entrega que no es de esta evaluación y alumno es 404", async () => {
    contexto(NUMERICA);
    responder("correction", []);
    responder("submission", []);

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, {
      action: "draft",
      submissionId: "sub_de_otro",
    }, false);

    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(escrituras).toEqual([]);
  });
});

describe("DV-014 — el circuito lo decide el servidor", () => {
  const CON_APROBACION = { ...NUMERICA, requiresApproval: true };

  it("publicar sin poder aprobar una evaluación que lo requiere → 422 `requiere_aprobacion`", async () => {
    contexto(CON_APROBACION);
    const r = await guardarCorreccion(ORG, ASM, ENR, USR, { action: "publish", criterionScores: PUNTAJES_80 }, false);
    expect(r).toMatchObject({ ok: false, status: 422, code: "requiere_aprobacion" });
    expect(escrituras).toEqual([]);
  });

  it("enviar deja la versión `pending` y NO toca el resultado oficial", async () => {
    contexto(CON_APROBACION);
    responder("correction", []);

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, { action: "submit", criterionScores: PUNTAJES_80 }, false);

    expect(r.ok).toBe(true);
    const insert = escriturasEn("correction").find((e) => e.op === "insert");
    expect(insert?.data).toMatchObject({ status: "pending", submittedBy: USR });
    expect(llamadasAResultados).toEqual([]);
  });

  it("con una versión `pending` no se edita: 409 `en_aprobacion`", async () => {
    contexto(CON_APROBACION);
    responder("correction", [{ id: "cor_1", status: "pending" }]);

    const r = await guardarCorreccion(ORG, ASM, ENR, USR, { action: "draft" }, false);
    expect(r).toMatchObject({ ok: false, status: 409, code: "en_aprobacion" });
  });

  it("el modo que ve la pantalla: `submit` sin la capacidad, `publish` con ella", async () => {
    contexto(CON_APROBACION);
    responder("correction", []);
    responder("submission", []);
    expect((await leerCorreccion(ORG, ASM, ENR, false))?.mode).toBe("submit");

    contexto(CON_APROBACION);
    responder("correction", []);
    responder("submission", []);
    expect((await leerCorreccion(ORG, ASM, ENR, true))?.mode).toBe("publish");
  });
});

describe("La puerta del profesor", () => {
  it("una cohorte que no alcanza es 404 (lectura y escritura)", async () => {
    alcanzaLaCohorte = false;
    detalleDeCohorte = null;
    contexto(NUMERICA);
    expect(await leerCorreccionDelProfesor(ORG, "tch_ajeno", ASM, ENR)).toBeNull();

    contexto(NUMERICA);
    const r = await guardarCorreccionDelProfesor(ORG, "tch_ajeno", USR, ASM, ENR, { action: "draft" });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(escrituras).toEqual([]);
  });

  it("una cohorte finalizada no se corrige: 422 `cohorte_finalizada`", async () => {
    detalleDeCohorte = { editable: false };
    contexto(NUMERICA);
    const r = await guardarCorreccionDelProfesor(ORG, "tch_1", USR, ASM, ENR, { action: "draft" });
    expect(r).toMatchObject({ ok: false, status: 422, code: "cohorte_finalizada" });
    expect(escrituras).toEqual([]);
  });

  it("el profesor nunca publica una evaluación con aprobación: su modo es `submit`", async () => {
    contexto({ ...NUMERICA, requiresApproval: true });
    responder("correction", []);
    responder("submission", []);
    expect((await leerCorreccionDelProfesor(ORG, "tch_1", ASM, ENR))?.mode).toBe("submit");
  });
});

describe("DV-008 — qué evaluaciones quedaron congeladas", () => {
  it("las que tienen una corrección publicada (o reemplazada)", async () => {
    responder("correction", [{ assessmentId: "asm_1" }, { assessmentId: "asm_3" }]);
    const congeladas = await evaluacionesCongeladas(ORG, "coh_1");
    expect([...congeladas].sort()).toEqual(["asm_1", "asm_3"]);
  });
});

/* ============================================================
 * T021 (DV-005) — Los atajos de carga rápida
 * ============================================================ */

describe("DV-005 — `recordResults` (el real) solo admite el atajo donde no esquiva nada", () => {
  it("numérica por el atajo → 422 `usar_correccion`, sin escribir", async () => {
    responder("assessment", [{ id: ASM, scale: "numeric", requiresApproval: false }]);
    const r = await recordResultsReal(ORG, ASM, [{ enrollmentId: ENR, passed: true }], USR);
    expect(r).toMatchObject({ ok: false, status: 422, code: "usar_correccion" });
    expect(escrituras).toEqual([]);
  });

  it("con aprobación requerida, tampoco", async () => {
    responder("assessment", [{ id: ASM, scale: "pass_fail", requiresApproval: true }]);
    const r = await recordResultsReal(ORG, ASM, [{ enrollmentId: ENR, passed: true }], USR);
    expect(r).toMatchObject({ ok: false, status: 422, code: "usar_correccion" });
  });

  it("aprobado/no aprobado sin aprobación sigue funcionando y no toca la nota", async () => {
    responder("assessment", [{ id: ASM, scale: "pass_fail", requiresApproval: false }]);
    const r = await recordResultsReal(ORG, ASM, [{ enrollmentId: ENR, passed: true }], USR);
    expect(r.ok).toBe(true);
    const conflicto = escrituras.find((e) => e.table === "assessmentResult:conflicto");
    expect(conflicto && "score" in conflicto.data).toBe(false);
  });

  it("T017 — desde la corrección guarda la nota, también en una numérica", async () => {
    responder("assessment", [{ id: ASM, scale: "numeric", requiresApproval: true }]);
    const r = await recordResultsReal(
      ORG,
      ASM,
      [{ enrollmentId: ENR, passed: true, score: 80 }],
      USR,
      { origen: "correccion" }
    );
    expect(r.ok).toBe(true);
    const insert = escrituras.find((e) => e.op === "insert" && e.table === "assessmentResult");
    expect(insert?.data).toMatchObject({ score: 80, passed: true });
    const conflicto = escrituras.find((e) => e.table === "assessmentResult:conflicto");
    expect(conflicto && "score" in conflicto.data).toBe(true);
  });
});

const ENTREGA = {
  id: "sub_1",
  assessmentId: ASM,
  enrollmentId: ENR,
  cohortId: "coh_1",
};

describe("DV-005 — la corrección vieja de la entrega", () => {
  it("en una numérica responde 422 `usar_correccion` y no escribe nada", async () => {
    responder("submission", [{ ...ENTREGA, scale: "numeric", requiresApproval: false }]);

    const r = await corregirEntrega(ORG, "tch_1", USR, "sub_1", { passed: true, feedback: "Bien" });

    expect(r).toMatchObject({ ok: false, status: 422, code: "usar_correccion" });
    expect(escrituras).toEqual([]);
  });

  it("en aprobado/no aprobado delega en `publicarCorreccion`: deja una versión publicada", async () => {
    responder("submission", [{ ...ENTREGA, scale: "pass_fail", requiresApproval: false }]);
    contexto(PASS_FAIL);
    responder("correction", []);
    responder("submission", [{ id: "sub_1" }]);
    responder("correction", [
      { id: "cor_nueva", assessmentId: ASM, enrollmentId: ENR, submissionId: "sub_1", status: "draft", score: null, passed: false, feedback: "Faltan las cotas" },
    ]);

    const r = await corregirEntrega(ORG, "tch_1", USR, "sub_1", {
      passed: false,
      feedback: "Faltan las cotas",
    });

    expect(r).toMatchObject({ ok: true });
    const estados = escriturasEn("correction")
      .filter((e) => "status" in e.data)
      .map((e) => e.data.status);
    expect(estados).toContain("published");
    expect(llamadasAResultados[0]?.entries).toEqual([
      { enrollmentId: ENR, passed: false, score: null },
    ]);
    expect(escriturasEn("submission")[0]?.data).toMatchObject({
      passed: false,
      feedback: "Faltan las cotas",
    });
  });
});

describe("DV-005 — ninguna puerta de atajo se declara corrección", () => {
  const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

  it("las rutas de carga rápida y el portal del profesor llaman al atajo restringido", () => {
    for (const src of [
      leer("src", "app", "api", "assessments", "[id]", "results", "route.ts"),
      leer("src", "app", "api", "portal", "assessments", "[id]", "results", "route.ts"),
      leer("src", "server", "teacher-portal.ts"),
      leer("src", "server", "submissions.ts"),
    ]) {
      expect(src).not.toMatch(/origen:\s*"correccion"/);
    }
  });

  it("solo `corrections.ts` publica con el origen de la corrección", () => {
    expect(leer("src", "server", "corrections.ts")).toMatch(/origen:\s*"correccion"/);
  });
});

/* ============================================================
 * T028 (DV-010) — Lo que ve el alumno
 * ============================================================ */

describe("DV-010 — el alumno ve solo lo publicado, y solo lo suyo", () => {
  const PUBLICADA = {
    id: "cor_1",
    assessmentId: ASM,
    enrollmentId: ENR,
    submissionId: "sub_1",
    status: "published",
    score: 80,
    passed: true,
    feedback: "Buen trabajo",
    criterionScores: [{ criterionId: "c1", points: 35, comment: "Prolijo" }],
    textValues: [{ fieldId: "f1", value: "Las cotas" }],
    correctedBy: "usr_profe",
    submittedBy: "usr_profe",
    submittedAt: new Date("2026-10-10T12:00:00.000Z"),
    reviewedBy: "usr_coord",
    reviewedAt: new Date("2026-10-11T12:00:00.000Z"),
    reviewComment: "Revisá el render",
    publishedAt: new Date("2026-10-11T12:00:00.000Z"),
  };

  it("una cursada que no es del contacto es null (la ruta dice 404)", async () => {
    const { correccionesPublicadasDeCursada } = await import("@/server/corrections");
    // la inscripción no es de este contacto: la consulta no devuelve fila
    expect(await correccionesPublicadasDeCursada(ORG, "ct_otro", ENR)).toBeNull();
  });

  it("trae la corrección publicada completa, sin el circuito de aprobación", async () => {
    const { correccionesPublicadasDeCursada } = await import("@/server/corrections");
    responder("enrollment", [{ id: ENR, cohortId: "coh_1" }]);
    responder("assessment", [
      { id: ASM, ...NUMERICA, textFields: [{ id: "f1", name: "A mejorar", required: true }] },
    ]);
    responder("correction", [PUBLICADA]);
    responder("user", [{ id: "usr_profe", name: "Ana Profe" }]);

    const r = await correccionesPublicadasDeCursada(ORG, "ct_1", ENR);

    expect(r?.assessments).toHaveLength(1);
    const item = r!.assessments[0]!;
    expect(item).toMatchObject({ assessmentId: ASM, scale: "numeric", minScore: 60 });
    expect(item.correction).toEqual({
      id: "cor_1",
      submissionId: "sub_1",
      score: 80,
      passed: true,
      feedback: "Buen trabajo",
      // 0084 — una versión sin nivel (anterior a la rúbrica) lo lee como `null`.
      criterionScores: [{ criterionId: "c1", points: 35, comment: "Prolijo", level: null }],
      textValues: [{ fieldId: "f1", value: "Las cotas" }],
      correctedByName: "Ana Profe",
      publishedAt: "2026-10-11T12:00:00.000Z",
    });
  });

  it("una evaluación sin corrección publicada no aparece (la pantalla dice «Pendiente»)", async () => {
    const { correccionesPublicadasDeCursada } = await import("@/server/corrections");
    responder("enrollment", [{ id: ENR, cohortId: "coh_1" }]);
    responder("assessment", [{ id: ASM, ...NUMERICA }]);
    responder("correction", []);

    const r = await correccionesPublicadasDeCursada(ORG, "ct_1", ENR);
    expect(r).toEqual({ assessments: [] });
  });
});

/* ============================================================
 * T031 (US4, DV-012) — Aprobar o devolver antes de publicar
 * ============================================================ */

describe("US4 — el circuito de aprobación", () => {
  const CON_APROBACION = { ...NUMERICA, requiresApproval: true };

  /** La versión pendiente tal como la lee la bandeja: con la plantilla de su evaluación. */
  const PENDIENTE = {
    id: "cor_p",
    assessmentId: ASM,
    enrollmentId: ENR,
    submissionId: null,
    status: "pending",
    score: 80,
    passed: true,
    feedback: "Bien",
    criterionScores: [
      { criterionId: "c1", points: 35, comment: null },
      { criterionId: "c2", points: 20, comment: null },
      { criterionId: "c3", points: 25, comment: null },
    ],
    textValues: [],
    correctedBy: "usr_profe",
    submittedBy: "usr_profe",
    submittedAt: new Date("2026-10-10T12:00:00.000Z"),
    reviewComment: null,
    scale: "numeric",
    minScore: 60,
    requiresApproval: true,
    criteria: NUMERICA.criteria,
    textFields: [],
  };

  it("la publicada anterior sigue vigente mientras la nueva está en trámite (FR-021)", async () => {
    contexto(CON_APROBACION);
    responder("correction", []); // en trámite: nada (la publicada no cuenta)

    const r = await guardarCorreccion(
      ORG,
      ASM,
      ENR,
      "usr_profe",
      { action: "submit", criterionScores: PUNTAJES_80 },
      false
    );

    expect(r.ok).toBe(true);
    // Nadie tocó la vigente: ni `superseded` ni resultado oficial.
    const estados = escriturasEn("correction").map((e) => e.data.status);
    expect(estados).toEqual(["pending"]);
    expect(llamadasAResultados).toEqual([]);

    // Y la lectura muestra las dos a la vez.
    contexto(CON_APROBACION);
    responder("correction", [
      { id: "cor_vieja", status: "published", score: 70, passed: true },
      { id: "cor_p", status: "pending", score: 80, passed: true },
    ]);
    responder("submission", []);
    const l = await leerCorreccion(ORG, ASM, ENR, false);
    expect(l?.published?.id).toBe("cor_vieja");
    expect(l?.inProgress).toMatchObject({ id: "cor_p", status: "pending" });
  });

  it("aprobar publica por la única puerta y deja quién y cuándo revisó", async () => {
    responder("correction", [PENDIENTE]); // la aprobación la lee
    responder("correction", [{ ...PENDIENTE }]); // publicarCorreccion la relee
    filaDeUpdate = { ...PENDIENTE };

    const r = await aprobarCorreccion(ORG, "cor_p", "usr_coord");

    expect(r.ok).toBe(true);
    const revision = escriturasEn("correction").find((e) => "reviewedBy" in e.data);
    expect(revision?.data).toMatchObject({ reviewedBy: "usr_coord", score: 80, passed: true });
    expect(revision?.data.reviewedAt).toBeInstanceOf(Date);
    const estados = escriturasEn("correction")
      .filter((e) => "status" in e.data)
      .map((e) => e.data.status);
    expect(estados).toEqual(["superseded", "published"]);
    expect(llamadasAResultados).toEqual([
      {
        assessmentId: ASM,
        entries: [{ enrollmentId: ENR, passed: true, score: 80 }],
        opciones: { origen: "correccion" },
      },
    ]);
  });

  it("aprobar recalcula con la plantilla de HOY: si el mínimo subió, la nota ya no aprueba", async () => {
    responder("correction", [{ ...PENDIENTE, minScore: 90 }]);
    responder("correction", [{ ...PENDIENTE, passed: false }]);

    const r = await aprobarCorreccion(ORG, "cor_p", "usr_coord");

    expect(r.ok).toBe(true);
    const revision = escriturasEn("correction").find((e) => "reviewedBy" in e.data);
    expect(revision?.data).toMatchObject({ score: 80, passed: false });
    expect(llamadasAResultados[0]?.entries).toEqual([
      { enrollmentId: ENR, passed: false, score: 80 },
    ]);
  });

  it("una pendiente que ya no cierra con la plantilla de hoy no se publica: 422", async () => {
    responder("correction", [{ ...PENDIENTE, criterionScores: [] }]);
    const r = await aprobarCorreccion(ORG, "cor_p", "usr_coord");
    expect(r).toMatchObject({ ok: false, status: 422, code: "correccion_incompleta" });
    expect(escrituras).toEqual([]);
  });

  it("solo se aprueba lo pendiente: un borrador es 409 `estado_invalido` y no escribe", async () => {
    responder("correction", [{ ...PENDIENTE, status: "draft" }]);
    const r = await aprobarCorreccion(ORG, "cor_p", "usr_coord");
    expect(r).toMatchObject({ ok: false, status: 409, code: "estado_invalido" });
    expect(escrituras).toEqual([]);
    expect(llamadasAResultados).toEqual([]);
  });

  it("una corrección que no existe (u otra organización) es 404", async () => {
    expect(await aprobarCorreccion(ORG, "cor_x", "usr_coord")).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await devolverCorreccion(ORG, "cor_x", "usr_coord", "Revisá")).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("devolver sin comentario → 422 y no escribe", async () => {
    responder("correction", [PENDIENTE]);
    const r = await devolverCorreccion(ORG, "cor_p", "usr_coord", "   ");
    expect(r).toMatchObject({ ok: false, status: 422, code: "comentario_obligatorio" });
    expect(escrituras).toEqual([]);
  });

  it("devolver con comentario vuelve a borrador, con quién, cuándo y por qué; no publica", async () => {
    responder("correction", [PENDIENTE]);
    filaDeUpdate = { ...PENDIENTE };

    const r = await devolverCorreccion(ORG, "cor_p", "usr_coord", "  Revisá el render  ");

    expect(r.ok).toBe(true);
    const upd = escriturasEn("correction")[0]?.data;
    expect(upd).toMatchObject({
      status: "draft",
      reviewComment: "Revisá el render",
      reviewedBy: "usr_coord",
    });
    expect(upd?.reviewedAt).toBeInstanceOf(Date);
    expect(llamadasAResultados).toEqual([]);
    if (r.ok) expect(r.data.status).toBe("draft");
  });

  it("devolver algo que no está pendiente es 409 `estado_invalido`", async () => {
    responder("correction", [{ ...PENDIENTE, status: "published" }]);
    const r = await devolverCorreccion(ORG, "cor_p", "usr_coord", "Revisá");
    expect(r).toMatchObject({ ok: false, status: 409, code: "estado_invalido" });
    expect(escrituras).toEqual([]);
  });

  it("la bandeja lista lo pendiente con alumno, cohorte y quién la corrigió", async () => {
    responder("correction", [
      {
        id: "cor_p",
        assessmentName: "Trabajo final",
        cohortId: "coh_1",
        cohortName: null,
        courseName: "Revit",
        firstName: "Ana",
        lastName: "Pérez",
        correctedBy: "usr_profe",
        submittedAt: new Date("2026-10-10T12:00:00.000Z"),
        score: 80,
        passed: true,
      },
    ]);
    responder("user", [{ id: "usr_profe", name: "Profe Uno" }]);

    const items = await listarPendientes(ORG, { cohortId: null });

    expect(items).toEqual([
      {
        id: "cor_p",
        assessmentName: "Trabajo final",
        cohortId: "coh_1",
        cohortName: "Revit",
        studentName: "Ana Pérez",
        correctedByName: "Profe Uno",
        submittedAt: "2026-10-10T12:00:00.000Z",
        score: 80,
        passed: true,
      },
    ]);
  });

  it("el detalle trae la corrección, su plantilla, la vigente y la entrega", async () => {
    responder("correction", [
      {
        ...PENDIENTE,
        submissionId: "sub_1",
        assessmentName: "Trabajo final",
        cohortName: "Revit 2026",
        courseName: "Revit",
        firstName: "Ana",
        lastName: null,
      },
    ]);
    responder("correction", [{ id: "cor_vieja", status: "published", score: 70, passed: true }]);
    responder("submission", [{ url: "https://ejemplo.uy/tp", title: "TP final" }]);

    const d = await detalleParaAprobar(ORG, "cor_p");

    expect(d).toMatchObject({
      assessmentName: "Trabajo final",
      studentName: "Ana",
      cohortName: "Revit 2026",
      correction: { id: "cor_p", status: "pending", score: 80 },
      template: { scale: "numeric", minScore: 60, requiresApproval: true },
      published: { id: "cor_vieja" },
      submission: { url: "https://ejemplo.uy/tp", title: "TP final" },
    });
    expect(await detalleParaAprobar(ORG, "cor_x")).toBeNull();
  });
});
