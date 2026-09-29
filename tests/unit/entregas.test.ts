import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  corregirEntrega,
  esTardia,
  estadoDeEntrega,
  estudianteEntregar,
  fechaVigente,
  plazoEditablePorProfesor,
  plazoSchema,
  puedeEntregar,
  reabrirEntrega,
} from "@/server/submissions";

/**
 * Un doble de base con COLA POSICIONAL, para poder probar FR-012 sin base.
 *
 * `estudianteEntregar` hace sus consultas en un orden fijo y conocido
 * —evaluación, inscripción, entregas previas, prórroga— así que la cola
 * posicional dice exactamente lo que el test quiere decir. Es el mismo doble
 * que usan `especializaciones-portales.test.ts` y `especializaciones-computo`.
 *
 * Las funciones puras de más arriba no lo tocan: no consultan nada.
 */
const selectQueue: unknown[][] = [];
let insertado: Record<string, unknown> | null = null;
let actualizado: Record<string, unknown> | null = null;

/**
 * Si esta entrega GANA la carrera contra otra idéntica y simultánea.
 *
 * Con el índice parcial puesto, el segundo POST no inserta nada: el
 * `on conflict do nothing` devuelve CERO filas. Ese vacío es el único aviso
 * que le llega al código, y es exactamente lo que este interruptor reproduce
 * sin levantar una base.
 */
let entregaGanaLaCarrera = true;

/**
 * DV-005 de 014 — El alcance del profesor y el estado de la cohorte salen de
 * `teacher-portal.ts`, que es donde la regla ya vivía. Se doblan acá para poder
 * conducir "cohorte finalizada" sin montar una cohorte entera: lo que este
 * archivo prueba es qué hace 016 con la respuesta, no cómo se calcula.
 */
let detalleDeCohorte: { editable: boolean } | null = { editable: true };
let alcanzaLaCohorte = true;

/** Lo que contesta `recordResults` (010) cuando 016 le pasa el resultado. */
let resultadoDeEvaluacion: unknown = { ok: true, data: { recorded: 1 } };

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
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    selectDistinct: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertado = v;
        const filas = async () =>
          entregaGanaLaCarrera
            ? [
                {
                  ...v,
                  submittedAt: new Date("2026-10-05T12:00:00.000Z"),
                  passed: null,
                  feedback: null,
                  correctedAt: null,
                  reopenedAt: null,
                },
              ]
            : [];
        return {
          returning: filas,
          onConflictDoNothing: () => ({ returning: filas }),
          onConflictDoUpdate: async () => [],
        };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        actualizado = v;
        return { where: async () => [] };
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

vi.mock("@/server/teacher-portal", () => ({
  teacherReachesCohort: async () => alcanzaLaCohorte,
  teacherCohortDetail: async () => detalleDeCohorte,
}));

vi.mock("@/server/grading", () => ({
  recordResults: async () => resultadoDeEvaluacion,
}));

beforeEach(() => {
  selectQueue.length = 0;
  insertado = null;
  actualizado = null;
  entregaGanaLaCarrera = true;
  detalleDeCohorte = { editable: true };
  alcanzaLaCohorte = true;
  resultadoDeEvaluacion = { ok: true, data: { recorded: 1 } };
});

/**
 * 016 — Entregas y corrección: las reglas, puras.
 *
 * Las cuatro funciones de acá abajo son el corazón de la fase y no tocan la
 * base a propósito: lo que deciden —cuál es la fecha vigente de una persona, si
 * una entrega llegó tarde, si puede volver a entregar— es lo que después
 * imprimen tres pantallas distintas. Con la regla repartida, la del profesor y
 * la del alumno se contestan distinto sobre la misma entrega, y esa es
 * exactamente la discusión que la fase vino a cerrar.
 */

const DIA = 86_400_000;
const LIMITE_GRUPO = new Date("2026-10-01T23:59:00.000Z");

describe("FR-005c — la fecha vigente es la MÁS TARDÍA de las dos", () => {
  /**
   * La regla del dueño, dicha al revés para que se entienda por qué: **una
   * prórroga solo puede SUMAR plazo**. Si después se corre la fecha del grupo
   * más allá de la prórroga, el alumno con prórroga no puede quedar POR DETRÁS
   * de sus compañeros — que es lo que pasaría tomando siempre la individual.
   */
  it("con prórroga posterior, manda la prórroga", () => {
    const prorroga = new Date(LIMITE_GRUPO.getTime() + 7 * DIA);
    expect(fechaVigente(LIMITE_GRUPO, prorroga)).toEqual(prorroga);
  });

  it("con la fecha del grupo corrida MÁS ALLÁ de la prórroga, manda el grupo", () => {
    const prorroga = new Date(LIMITE_GRUPO.getTime() + 2 * DIA);
    const grupoCorrido = new Date(LIMITE_GRUPO.getTime() + 10 * DIA);
    expect(fechaVigente(grupoCorrido, prorroga)).toEqual(grupoCorrido);
  });

  it("sin prórroga es la del grupo, y sin grupo es la prórroga", () => {
    expect(fechaVigente(LIMITE_GRUPO, null)).toEqual(LIMITE_GRUPO);
    expect(fechaVigente(null, LIMITE_GRUPO)).toEqual(LIMITE_GRUPO);
  });

  /** DV-001 — se puede entregar sin fecha límite: sin fecha no hay "tardía". */
  it("sin ninguna de las dos no hay fecha vigente", () => {
    expect(fechaVigente(null, null)).toBeNull();
  });
});

describe("FR-005/DV-006 — tarde se marca, nunca se rechaza", () => {
  it("después de la fecha vigente es tardía", () => {
    expect(esTardia(new Date(LIMITE_GRUPO.getTime() + 1000), LIMITE_GRUPO)).toBe(true);
  });

  it("antes o justo en la fecha no lo es", () => {
    expect(esTardia(new Date(LIMITE_GRUPO.getTime() - 1000), LIMITE_GRUPO)).toBe(false);
    expect(esTardia(LIMITE_GRUPO, LIMITE_GRUPO)).toBe(false);
  });

  /** DV-001 — sin fecha vigente ninguna entrega puede llegar tarde. */
  it("sin fecha vigente nunca es tardía", () => {
    expect(esTardia(new Date("2030-01-01T00:00:00.000Z"), null)).toBe(false);
  });

  /**
   * **FR-005d, la regla que obliga a calcular al MOSTRAR y no al entregar.**
   *
   * La misma entrega, con la misma fecha de envío, deja de ser tardía cuando
   * alguien otorga una prórroga después. Por eso "tardía" no se congela en una
   * columna: se deriva cada vez, contra la fecha vigente de ESTE momento.
   */
  it("una prórroga POSTERIOR convierte una entrega tardía en entrega a tiempo", () => {
    const entregada = new Date(LIMITE_GRUPO.getTime() + 2 * DIA);

    expect(esTardia(entregada, fechaVigente(LIMITE_GRUPO, null))).toBe(true);

    const prorroga = new Date(LIMITE_GRUPO.getTime() + 5 * DIA);
    expect(esTardia(entregada, fechaVigente(LIMITE_GRUPO, prorroga))).toBe(false);
  });
});

describe("El estado de la entrega", () => {
  const entrega = (over: Record<string, unknown> = {}) => ({
    submittedAt: new Date(LIMITE_GRUPO.getTime() - DIA),
    correctedAt: null as Date | null,
    reopenedAt: null as Date | null,
    ...over,
  });

  it("sin ninguna entrega el estado lo dice, y no inventa un reprobado", () => {
    expect(estadoDeEntrega(null, LIMITE_GRUPO)).toBe("sin_entrega");
  });

  it("entregada a tiempo y sin corregir", () => {
    expect(estadoDeEntrega(entrega(), LIMITE_GRUPO)).toBe("entregada");
  });

  it("entregada fuera de plazo se distingue (SC-003)", () => {
    const tarde = entrega({ submittedAt: new Date(LIMITE_GRUPO.getTime() + DIA) });
    expect(estadoDeEntrega(tarde, LIMITE_GRUPO)).toBe("tardia");
  });

  /**
   * Corregida gana sobre tardía en el ESTADO —lo que importa saber es que ya
   * tiene devolución—, pero el hecho de que llegó tarde no se borra: viaja en
   * la entrega, que es donde el profesor lo mira para decidir.
   */
  it("corregida gana sobre tardía, sin borrar que llegó tarde", () => {
    const tardeYCorregida = entrega({
      submittedAt: new Date(LIMITE_GRUPO.getTime() + DIA),
      correctedAt: new Date(),
    });
    expect(estadoDeEntrega(tardeYCorregida, LIMITE_GRUPO)).toBe("corregida");
    expect(esTardia(tardeYCorregida.submittedAt, LIMITE_GRUPO)).toBe(true);
  });
});

describe("FR-010/FR-013 — el permiso de reentregar es un ESTADO, no un contador", () => {
  const entrega = (over: Record<string, unknown> = {}) => ({
    submittedAt: new Date(),
    correctedAt: null as Date | null,
    reopenedAt: null as Date | null,
    ...over,
  });

  it("sin ninguna entrega previa, puede entregar", () => {
    expect(puedeEntregar(null)).toBe(true);
  });

  it("con una entrega ya hecha, NO puede volver a entregar solo", () => {
    expect(puedeEntregar(entrega())).toBe(false);
  });

  it("corregida y sin reabrir tampoco (FR-010)", () => {
    expect(puedeEntregar(entrega({ correctedAt: new Date() }))).toBe(false);
  });

  /** DV-003 — sin tope: lo único que habilita es la reapertura del profesor. */
  it("reabierta por el profesor, sí", () => {
    expect(
      puedeEntregar(entrega({ correctedAt: new Date(), reopenedAt: new Date() }))
    ).toBe(true);
  });
});

/* ============================================================
 * Los guards estructurales
 * ============================================================ */

const SUBMISSIONS = readFileSync(
  path.join(process.cwd(), "src", "server", "submissions.ts"),
  "utf8"
);
const sinComentarios = SUBMISSIONS.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("016 — la forma del módulo", () => {
  /**
   * **FR-011 — la devolución NO se escribe en `assessment_result.notes`.**
   *
   * Ese campo hoy lo carga el staff como nota interna, y FR-007 vuelve la
   * devolución visible para el alumno: escribirla ahí filtraría al alumno todo
   * lo que la coordinación anotó sobre él. La devolución tiene columna propia
   * en la entrega, y este test falla si alguien "ahorra" la columna.
   */
  it("la devolución nunca viaja a `assessment_result.notes`", () => {
    expect(sinComentarios).not.toMatch(/notes\s*:/);
    expect(sinComentarios).not.toContain("assessmentResult.notes");
  });

  /** Constitución III — toda consulta declara su organización. */
  it("toda consulta pasa por `scoped()`", () => {
    const wheres = (sinComentarios.match(/\.where\(/g) ?? []).length;
    const scoped = (sinComentarios.match(/scoped\(/g) ?? []).length;
    const porOrgId = (sinComentarios.match(/eq\(schema\.organization\.id,/g) ?? []).length;
    expect(wheres).toBe(scoped + porOrgId);
  });

  /**
   * Ausencia = 404, y quien elige el código es la RUTA. El módulo devuelve
   * `null` o un resultado tipado, igual que los dos portales: un 403 le
   * confirmaría a quien prueba ids ajenos que la entrega existe (FR-009).
   */
  it("no decide códigos de estado de autorización", () => {
    expect(sinComentarios).not.toMatch(/\b403\b/);
  });

  /**
   * FR-005e — la fecha límite se compone con `classInstant()`, el único lugar
   * del repositorio autorizado a armar una fecha con hora de pared. Un
   * `new Date("2026-10-01T23:59")` acá cierra el plazo antes de hora para los
   * 87 alumnos que están fuera de Uruguay.
   */
  it("compone el plazo con `classInstant()` y no a mano", () => {
    expect(sinComentarios).toContain("classInstant(");
    expect(sinComentarios).not.toMatch(/new Date\(\s*`/);
  });
});

/* ============================================================
 * FR-012 — En un programa, la entrega cuelga del MÓDULO
 * ============================================================ */

describe("FR-012 — la entrega cuelga de la inscripción del MÓDULO", () => {
  const ORG = "org_1";
  const CONTACTO = "ct_1";

  /**
   * **El escenario que define FR-012.** La persona tiene la inscripción MADRE
   * en la camada de la especialización (`enr_madre` → `coh_ebim13`) y una HIJA
   * por cada módulo (`enr_m2` → `coh_m2`). La evaluación es del módulo 2.
   *
   * La entrega tiene que quedar contra `enr_m2`, no contra `enr_madre`: la
   * evaluación ya es por cohorte (`assessment.cohort_id`) y la cohorte de
   * módulo es la que tiene profesor, clases y asistencia. Colgarla de la madre
   * la dejaría fuera del alcance del profesor que la tiene que corregir.
   *
   * No hace falta ninguna rama en el código para lograrlo —la inscripción se
   * busca por la cohorte de la evaluación— y por eso hay un test: lo que se
   * cumple solo es exactamente lo que alguien rompe sin enterarse.
   */
  it("la entrega se registra contra la inscripción del módulo, no contra la de la madre", async () => {
    // 1) la evaluación, que es del módulo 2
    selectQueue.push([{ id: "asm_m2", cohortId: "coh_m2", dueAt: null }]);
    // 2) la inscripción de esta persona EN ESA cohorte: la hija
    selectQueue.push([{ id: "enr_m2" }]);
    // 3) sin entregas previas   4) sin prórroga
    selectQueue.push([]);
    selectQueue.push([]);

    const r = await estudianteEntregar(ORG, CONTACTO, {
      assessmentId: "asm_m2",
      url: "https://drive.example.com/mi-entrega",
      title: "Módulo 2",
    });

    expect(r.ok).toBe(true);
    expect(insertado).toMatchObject({
      assessmentId: "asm_m2",
      enrollmentId: "enr_m2",
      organizationId: ORG,
    });
    // La madre no aparece por ningún lado.
    expect(JSON.stringify(insertado)).not.toContain("enr_madre");
  });

  /**
   * Si esta persona NO cursa la cohorte de la evaluación, la respuesta es
   * "no encontrada" (404 en la ruta) y no una entrega colgada de cualquier
   * inscripción suya. Es la misma regla de FR-009: no se confirma que la
   * evaluación exista.
   */
  it("sin inscripción en la cohorte de la evaluación no se entrega nada", async () => {
    selectQueue.push([{ id: "asm_m2", cohortId: "coh_m2", dueAt: null }]);
    selectQueue.push([]); // no cursa ese módulo

    const r = await estudianteEntregar(ORG, CONTACTO, {
      assessmentId: "asm_m2",
      url: "https://drive.example.com/mi-entrega",
    });

    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(insertado).toBeNull();
  });

  /**
   * El guard estructural que sostiene FR-012 hacia adelante: **la inscripción
   * del módulo se encuentra por la COHORTE de la evaluación, nunca caminando
   * el árbol del recorrido.** El día que alguien resuelva la madre acá para
   * "simplificar", la entrega se va a colgar del nodo equivocado.
   */
  it("no camina el árbol del recorrido para encontrar la inscripción", () => {
    expect(sinComentarios).not.toContain("parentEnrollmentId");
    expect(sinComentarios).not.toContain("parentCohortId");
  });
});

describe("016 — las puertas no se mezclan", () => {
  const RUTAS = path.join(process.cwd(), "src", "app", "api");

  /**
   * FR-009 — El alumno escribe por SU puerta. La ruta de entrega del alumno no
   * puede usar la del profesor ni una capacidad de staff: las tres audiencias
   * siguen separadas, igual que en 014 y 015.
   */
  it("la entrega del alumno usa la puerta del alumno", () => {
    const src = readFileSync(path.join(RUTAS, "portal/me/entregas/route.ts"), "utf8");
    expect(src).toContain("requireStudentPortal(");
    expect(src).not.toContain("requireTeacherPortal(");
    expect(src).not.toContain("requireCapability(");
  });

  it("la corrección usa la puerta del profesor", () => {
    const src = readFileSync(path.join(RUTAS, "portal/entregas/[id]/route.ts"), "utf8");
    expect(src).toContain("requireTeacherPortal(");
    expect(src).not.toContain("requireStudentPortal(");
    expect(src).not.toContain("requireCapability(");
  });
});

/* ============================================================
 * DV-005 de 014 — La cohorte finalizada se VE, no se cambia
 * ============================================================
 * La regla ya existía para la asistencia y para los resultados del profesor
 * (`teacherMarkAttendance`, `teacherRecordResult`): una cohorte terminada no se
 * toca, porque sus porcentajes y sus notas YA se usaron para decidir quién
 * aprobó. Corregir por la puerta de las entregas escribía en
 * `assessment_result` esquivándola — la misma escritura, por otro camino.
 *
 * Es la MISMA regla, con el mismo código y la misma forma de mensaje: dos
 * reglas parecidas con códigos distintos obligan a la pantalla a conocer las
 * dos, y a la larga una de las dos se olvida.
 */

const ENTREGA_EN_COHORTE = {
  id: "sub_1",
  assessmentId: "asm_1",
  enrollmentId: "enr_1",
  cohortId: "coh_1",
};

describe("DV-005 — una cohorte finalizada no se corrige por la puerta de las entregas", () => {
  it("corregir responde `cohorte_finalizada` y no escribe la devolución", async () => {
    detalleDeCohorte = { editable: false };
    selectQueue.push([ENTREGA_EN_COHORTE]);

    const r = await corregirEntrega("org_1", "ct_profe", "usr_1", "sub_1", {
      passed: true,
      feedback: "Muy bien",
    });

    expect(r).toMatchObject({ ok: false, status: 422, code: "cohorte_finalizada" });
    // Ni la entrega ni el resultado: la puerta se cierra ANTES de escribir.
    expect(actualizado).toBeNull();
  });

  /**
   * El mensaje es el de la regla que ya existía, no uno nuevo: el profesor lee
   * la misma frase que ya lee en asistencia y en la planilla.
   */
  it("y lo dice con la forma de mensaje que el profesor ya conoce", async () => {
    detalleDeCohorte = { editable: false };
    selectQueue.push([ENTREGA_EN_COHORTE]);

    const r = await corregirEntrega("org_1", "ct_profe", "usr_1", "sub_1", {
      passed: true,
      feedback: "Muy bien",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^Esta cohorte ya terminó, así que /);
  });

  it("reabrir tampoco: la reapertura habilita una entrega que ya no puede entrar", async () => {
    detalleDeCohorte = { editable: false };
    selectQueue.push([ENTREGA_EN_COHORTE]);

    const r = await reabrirEntrega("org_1", "ct_profe", "usr_1", "sub_1");

    expect(r).toMatchObject({ ok: false, status: 422, code: "cohorte_finalizada" });
    expect(actualizado).toBeNull();
  });

  it("y mover el plazo desde el portal del profesor, tampoco", async () => {
    detalleDeCohorte = { editable: false };
    selectQueue.push([{ cohortId: "coh_1" }]);

    const r = await plazoEditablePorProfesor("org_1", "ct_profe", "asm_1");

    expect(r).toMatchObject({ ok: false, status: 422, code: "cohorte_finalizada" });
  });

  /**
   * La cohorte ajena sigue saliendo 404 y no 422: el 422 diría "existe pero
   * terminó", y a un profesor ajeno eso ya le confirma que existe (FR-009).
   */
  it("una cohorte que el profesor no alcanza sigue siendo 404, no `cohorte_finalizada`", async () => {
    detalleDeCohorte = null;
    selectQueue.push([ENTREGA_EN_COHORTE]);

    const r = await corregirEntrega("org_1", "ct_ajeno", "usr_1", "sub_1", {
      passed: true,
      feedback: "no debería poder",
    });

    expect(r).toMatchObject({ ok: false, status: 404, code: "not_found" });
  });

  it("con la cohorte en curso, corregir escribe normalmente", async () => {
    selectQueue.push([ENTREGA_EN_COHORTE]);

    const r = await corregirEntrega("org_1", "ct_profe", "usr_1", "sub_1", {
      passed: false,
      feedback: "Faltan las cotas",
    });

    expect(r).toMatchObject({ ok: true });
    expect(actualizado).toMatchObject({ passed: false, feedback: "Faltan las cotas" });
  });
});

describe("FR-006/DV-002 — corregir escribe las DOS cosas, o ninguna", () => {
  /**
   * **Por qué lanza en vez de devolver un error.**
   *
   * La devolución ya se escribió en la entrega cuando `recordResults` falla.
   * Devolver una `Response` de error NO revierte la transacción del pedido
   * (CLAUDE.md): quedaría la entrega marcada como corregida y la planilla de
   * 010 sin el resultado — media corrección, que es justo el estado que DV-002
   * vino a hacer imposible. Lanzando, `withOrganizationScope` revierte las dos.
   */
  it("si el resultado de la evaluación no se pudo registrar, LANZA y se revierte todo", async () => {
    resultadoDeEvaluacion = {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Evaluación no encontrada",
    };
    selectQueue.push([ENTREGA_EN_COHORTE]);

    await expect(
      corregirEntrega("org_1", "ct_profe", "usr_1", "sub_1", {
        passed: true,
        feedback: "Aprobada",
      })
    ).rejects.toThrow(/not_found/);
  });
});

describe("FR-005e — la hora del plazo se valida en el esquema, no más adentro", () => {
  /**
   * `^\d{1,2}:\d{2}$` aceptaba `99:99` y lo dejaba morir después, en
   * `componerPlazo`, como "la fecha o la hora no se entienden". El esquema es
   * el lugar donde el mensaje puede decir QUÉ está mal.
   */
  it("una hora imposible se rechaza", () => {
    expect(plazoSchema.safeParse({ fecha: "2026-10-01", hora: "99:99" }).success).toBe(false);
    expect(plazoSchema.safeParse({ fecha: "2026-10-01", hora: "24:00" }).success).toBe(false);
    expect(plazoSchema.safeParse({ fecha: "2026-10-01", hora: "18:60" }).success).toBe(false);
  });

  it("y las horas reales pasan, con y sin cero adelante", () => {
    expect(plazoSchema.safeParse({ fecha: "2026-10-01", hora: "23:59" }).success).toBe(true);
    expect(plazoSchema.safeParse({ fecha: "2026-10-01", hora: "9:05" }).success).toBe(true);
    expect(plazoSchema.safeParse({ fecha: "2026-10-01", hora: "00:00" }).success).toBe(true);
  });
});

/* ============================================================
 * Constitución IV — dos entregas simultáneas no entran las dos
 * ============================================================
 * `puedeEntregar()` se consultaba y DESPUÉS se insertaba, con la ventana
 * abierta en el medio: dos POST rápidos leían los dos "sí, puede" y los dos
 * insertaban. El resultado no es una fila de más y ya — es una reentrega que
 * el profesor nunca habilitó, o sea FR-013 roto por la velocidad del dedo.
 *
 * **Lo que NO se puede hacer para cerrarlo**: un único por
 * (`assessment_id`, `enrollment_id`). Ese índice prohíbe la reentrega
 * legítima, que es el historial que FR-008 exige conservar.
 *
 * Lo que sí: un único PARCIAL sobre la entrega ABIERTA — la que todavía no
 * fue corregida ni reabierta. Es la única que el modelo permite tener a la
 * vez, y las corregidas y reabiertas quedan fuera del índice, así que el
 * historial entra sin pelearse con nadie.
 */

const DRIZZLE = path.join(process.cwd(), "drizzle");
const MIGRACIONES = readdirSync(DRIZZLE)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(DRIZZLE, f), "utf8"))
  .join("\n");
const SCHEMA_DB = readFileSync(
  path.join(process.cwd(), "src", "lib", "db", "schema.ts"),
  "utf8"
);

describe("Constitución IV — la carrera entre dos entregas la arbitra la base", () => {
  const ORG = "org_1";
  const CONTACTO = "ct_1";

  /** Evaluación, inscripción, sin entregas previas, sin prórroga. */
  function colaConLaEntregaPermitida() {
    selectQueue.push([{ id: "asm_1", cohortId: "coh_1", dueAt: null }]);
    selectQueue.push([{ id: "enr_1" }]);
    selectQueue.push([]);
    selectQueue.push([]);
  }

  const ENTREGA = {
    assessmentId: "asm_1",
    url: "https://drive.example.com/mi-entrega",
  };

  it("la que llega segunda NO inserta: recibe el mismo 422 que una reentrega sin reapertura", async () => {
    entregaGanaLaCarrera = false;
    colaConLaEntregaPermitida();

    const r = await estudianteEntregar(ORG, CONTACTO, ENTREGA);

    /*
      El MISMO código y el mismo mensaje que la reentrega bloqueada: para el
      alumno los dos casos son el mismo hecho —"tu entrega ya está, para
      cambiarla pedí que la reabran"— y dos códigos distintos obligarían a la
      pantalla a conocer los dos.
    */
    expect(r).toMatchObject({ ok: false, status: 422, code: "entrega_cerrada" });
  });

  it("y la que llega primera entra normalmente", async () => {
    colaConLaEntregaPermitida();

    const r = await estudianteEntregar(ORG, CONTACTO, ENTREGA);

    expect(r.ok).toBe(true);
    expect(insertado).toMatchObject({ assessmentId: "asm_1", enrollmentId: "enr_1" });
  });

  /**
   * El guard que sostiene la garantía: el insert es CONDICIONAL. Sin esto se
   * vuelve a un "leo y después escribo" que ninguna lectura previa puede
   * cerrar, por más cerca del insert que se la ponga.
   */
  it("el insert es condicional, no un chequeo previo con los dedos cruzados", () => {
    expect(sinComentarios).toContain("onConflictDoNothing()");
  });

  it("la base declara el único PARCIAL sobre la entrega abierta", () => {
    expect(SCHEMA_DB).toContain('uniqueIndex("submission_abierta_uq")');
    expect(MIGRACIONES).toContain("submission_abierta_uq");
    // Parcial de verdad: sin el `where` prohibiría la reentrega (FR-008).
    expect(MIGRACIONES).toMatch(
      /create unique index if not exists "submission_abierta_uq"[\s\S]*?where[\s\S]*?corrected_at[\s\S]*?reopened_at/
    );
  });

  /**
   * FR-008 dicho como prohibición: un único PLENO sobre evaluación e
   * inscripción es exactamente lo que impediría el historial, y es el atajo
   * que cualquiera escribiría para cerrar esta carrera.
   */
  it("y NO un único pleno, que prohibiría la reentrega", () => {
    expect(MIGRACIONES).not.toMatch(
      /create unique index[^;]*on "submission"[^;]*\("assessment_id","enrollment_id"\)\s*;/
    );
  });

  /**
   * El snapshot no es burocracia: sin él, el próximo `db:generate` no sabe que
   * este índice ya existe y vuelve a emitir la migración entera. Pasó con la
   * 0039.
   */
  it("la migración deja su snapshot, o el próximo `db:generate` re-emite todo", () => {
    const sqls = readdirSync(DRIZZLE).filter((f) => f.endsWith(".sql"));
    const snapshots = new Set(
      readdirSync(path.join(DRIZZLE, "meta")).filter((f) => f.endsWith("_snapshot.json"))
    );
    for (const sql of sqls) {
      const idx = sql.slice(0, 4);
      expect(snapshots.has(`${idx}_snapshot.json`)).toBe(true);
    }
  });
});

/* ============================================================
 * Lo que encontró la revisión de la 016
 * ============================================================ */

const COMPONENTES = path.join(process.cwd(), "src", "components");
const ENTREGAS_ALUMNO = readFileSync(
  path.join(COMPONENTES, "portal", "student-submissions.tsx"),
  "utf8"
);
const ENTREGAS_PROFE = readFileSync(
  path.join(COMPONENTES, "portal", "portal-submissions.tsx"),
  "utf8"
);
const PLANILLA = readFileSync(
  path.join(COMPONENTES, "cohorts", "grading-client.tsx"),
  "utf8"
);
const CLASES = readFileSync(
  path.join(COMPONENTES, "cohorts", "classes-client.tsx"),
  "utf8"
);

/**
 * **"No hay nada" y "no pude traerlo" son dos frases distintas.**
 *
 * Es la regla que el ciclo 013 ya pagó cara en el legajo y que el 020 volvió a
 * escribir: un default optimista dicho como si fuera un dato. Acá el precio es
 * peor que una pantalla vacía — el alumno lee "Sin entregar" sobre un trabajo
 * que entregó, y el profesor lee "esta cohorte no tiene evaluaciones" sobre
 * una cohorte que las tiene.
 */
describe("016 — un fallo de carga no se disfraza de vacío", () => {
  it("la pantalla del alumno no inventa una lista vacía cuando el fetch falla", () => {
    expect(ENTREGAS_ALUMNO).not.toContain("setDatos([])");
    expect(ENTREGAS_ALUMNO).toContain("Reintentar");
  });

  it("y la del profesor tampoco se cae a un payload vacío", () => {
    expect(ENTREGAS_PROFE).not.toContain("SIN_DATOS");
    expect(ENTREGAS_PROFE).toContain("Reintentar");
  });

  /**
   * FR-013 — Reabrir es un ESTADO, y volver a apretarlo pisaba `reopenedAt`
   * con la fecha de hoy: la reapertura de la semana pasada dejaba de tener
   * autor y momento verificables, que es justo lo que hace revisable una
   * excepción.
   */
  it("«Reabrir» no se puede apretar dos veces sobre una entrega ya abierta", () => {
    expect(ENTREGAS_PROFE).toContain(
      "disabled={ocupado || ultima.reopenedAt !== null}"
    );
  });

  /**
   * FR-010/FR-013 — Reabrir solo significa algo sobre una entrega YA
   * corregida: es lo que devuelve el turno DESPUÉS de una devolución. Sobre
   * una entrega sin corregir no hay nada que reabrir —el profesor todavía no
   * dijo nada— y apretarlo deja registrada una excepción sobre un trabajo que
   * nadie miró.
   */
  it("y no se ofrece siquiera sobre una entrega sin corregir", () => {
    const guarda = ENTREGAS_PROFE.indexOf("{ultima.correctedAt && (");
    expect(guarda).toBeGreaterThan(-1);
    const bloque = ENTREGAS_PROFE.slice(
      guarda,
      ENTREGAS_PROFE.indexOf("Otorgar prórroga", guarda)
    );
    expect(bloque).toContain("void reabrir()");
  });
});

describe("016 — el nombre de la zona se lee entero", () => {
  /**
   * `replace` con un string cambia la PRIMERA aparición y nada más:
   * `America/Port_of_Spain` salía "Port of_Spain" en la planilla. La zona se
   * muestra para que alguien decida a qué hora cierra un plazo; medio nombre
   * es medio dato.
   */
  it("una zona con más de un guión bajo se muestra completa", () => {
    expect("America/Port_of_Spain".replace("_", " ")).toBe("America/Port of_Spain");
    expect("America/Port_of_Spain".replaceAll("_", " ")).toBe("America/Port of Spain");
  });

  /**
   * La planilla no era el único lugar que pinta el nombre de la zona: la
   * pantalla de clases decía la misma frase con el mismo `replace`. Por eso el
   * test recorre las dos y no una — un guard que mira un solo archivo deja
   * entrar la tercera copia.
   */
  it.each([
    ["la planilla de evaluaciones", () => PLANILLA],
    ["la pantalla de clases", () => CLASES],
  ])("y %s la muestra entera", (_nombre, fuente) => {
    expect(fuente()).toContain('replaceAll("_", " ")');
    expect(fuente()).not.toMatch(/timezone\.replace\("_"/);
  });
});

/**
 * 016 (FR-005b) — La fecha que se está editando es la de UNA evaluación.
 *
 * `fecha` era un único estado compartido por todas las filas: se abría
 * "Cambiar" en una, se tipeaba una fecha, se abría otra y la fecha tipeada
 * seguía en el campo, ofrecida como si fuera la de esa evaluación. Guardar sin
 * mirar dos veces ponía el plazo de una entrega en otra. Además el campo nacía
 * vacío sobre una evaluación que YA tenía plazo, así que mover una fecha
 * empezaba por escribirla de nuevo de memoria.
 */
describe("016 — el plazo se edita por fila, con su propia fecha", () => {
  it("abrir una fila siembra los campos con el plazo de ESA evaluación", () => {
    expect(PLANILLA).toContain("function abrirPlazo(");
    expect(PLANILLA).toContain("wallClockInZone(");
  });

  /**
   * El toggle viejo solo tocaba `abierta`: la fecha tipeada en la fila
   * anterior sobrevivía al cambio de fila. Si vuelve, vuelve el defecto.
   */
  it("y cambiar de fila no arrastra lo tipeado en la anterior", () => {
    expect(PLANILLA).not.toContain("setAbierta(abierta === a.id ? null : a.id)");
  });
});
