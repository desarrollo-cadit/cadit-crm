import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 028 fase 5 — Certificados y dispensa.
 *
 * Las fases 1 a 4 dejaron el modelo, el cómputo, los portales y la pantalla
 * del staff. Todo eso LEE. Lo que falta acá es lo que ESCRIBE, y son dos
 * actos con reglas propias:
 *
 * - **La emisión del certificado.** `certificate.enrollment_id` es UNIQUE y
 *   cada módulo cursado es una inscripción hija, así que "uno por módulo" ya
 *   sale por construcción (FR-019). Lo que faltaba es la CONDICIÓN: el
 *   general sólo con todas las hijas aprobadas (FR-020, FR-038), y —regla
 *   nueva del dueño, 2026-09-09— sólo si el curso de ese módulo otorga
 *   certificado. No todo producto de la academia entrega uno.
 * - **La dispensa de asistencia.** Las seis columnas existen desde la fase 1
 *   y nadie las escribía. La gobierna `evaluacion.editar` (DV-003), exige
 *   motivo (FR-023) y es revocable sin arrastrar el certificado (DV-004).
 *
 * El eje sigue siendo FR-032: un curso sin módulos —AutoCAD, el ejemplo del
 * dueño— se comporta EXACTAMENTE como en el ciclo 010.
 */

/* ============================================================
 * El doble de base: cola posicional, como el resto de tests/unit
 * ============================================================ */

const selectQueue: unknown[][] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];
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

/**
 * `update(tabla).set().where().returning()` — se registra QUÉ TABLA y qué
 * columnas se tocaron. La tabla importa: DV-004 exige probar que revocar la
 * dispensa NO escribe una sola línea sobre `certificate`.
 */
function updateChain(table: string, set: Record<string, unknown>) {
  updates.push({ table, set });
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.returning = async () => [{ id: "enr_1", ...set }];
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
        return {
          returning: async () => [
            {
              issuedAt: new Date("2026-09-09T12:00:00.000Z"),
              revokedAt: null,
              revokeReason: null,
              ...(values as object),
            },
          ],
        };
      },
    }),
    update: (table: unknown) => ({
      set: (s: Record<string, unknown>) => updateChain(String(table), s),
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
              // La tabla tiene que poder convertirse a texto: `update(tabla)`
              // registra CUÁL se tocó, y de eso depende la prueba de DV-004.
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

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
  inserts.length = 0;
  vi.resetModules();
});

/* ============================================================
 * A) El curso que NO otorga certificado (regla del dueño, 2026-09-09)
 * ============================================================ */

/** La fila que `issueCertificate` lee de la inscripción, con su curso. */
function inscripcion(over: Record<string, unknown> = {}) {
  return {
    id: "enr_1",
    cohortId: "coh_1",
    grantsCertificate: true,
    attendanceWaiverAt: null,
    attendanceWaiverReason: null,
    attendanceWaiverRevokedAt: null,
    ...over,
  };
}

/**
 * La cola de `cohortGrading` para UN alumno: cohorte, evaluaciones, roster, y
 * después resultados / clases / marcas / certificados.
 */
function colaDeCohorte(alumno: Record<string, unknown>, evaluaciones: unknown[] = []) {
  selectQueue.push([{ id: "coh_1", minAttendancePct: null, courseMinPct: null }]);
  selectQueue.push(evaluaciones);
  selectQueue.push([
    {
      id: "enr_1",
      enrolledAt: null,
      firstName: "Ana",
      lastName: "Pérez",
      attendanceWaiverAt: null,
      attendanceWaiverReason: null,
      attendanceWaiverRevokedAt: null,
      attendanceWaiverByName: null,
      ...alumno,
    },
  ]);
  selectQueue.push([]); // resultados
  selectQueue.push([]); // clases
  selectQueue.push([]); // marcas
  selectQueue.push([]); // certificados
}

describe("issueCertificate — el curso que no otorga certificado (regla del dueño)", () => {
  /**
   * La regla nueva: el certificado se emite SÓLO SI el curso lo otorga. No
   * todo producto de la academia entrega uno, y hasta hoy el sistema emitía
   * igual porque no tenía cómo saberlo.
   */
  it("un curso que no otorga certificado no emite, y no escribe nada", async () => {
    selectQueue.push([inscripcion({ grantsCertificate: false })]);
    selectQueue.push([]); // no hay certificado previo

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.code).toBe("curso_sin_certificado");
    }
    expect(inserts).toHaveLength(0);
  });

  /**
   * FR-032 — AutoCAD, el ejemplo del dueño: un curso SIN módulos sigue con un
   * único certificado del curso, que es el comportamiento del ciclo 010 y no
   * se toca.
   */
  it("un curso sin módulos que sí otorga emite igual que en el ciclo 010", async () => {
    selectQueue.push([inscripcion()]);
    selectQueue.push([]); // no hay certificado previo
    selectQueue.push([]); // tieneHijas → no es madre
    colaDeCohorte({});

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });

  /**
   * La emisión histórica (010, DV-004) saltea notas y asistencia, no el
   * catálogo: un curso que no entrega certificado tampoco lo entrega para una
   * cohorte anterior al sistema. Lo que la bandera dice es qué vende la
   * academia, no qué se pudo verificar.
   */
  it("la emisión histórica tampoco puede saltear la bandera del curso", async () => {
    selectQueue.push([inscripcion({ grantsCertificate: false })]);
    selectQueue.push([]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1", { historical: true });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("curso_sin_certificado");
    expect(inserts).toHaveLength(0);
  });

  /** FR-007 — la idempotencia del 010 manda: el que ya existe vuelve tal cual. */
  it("un certificado ya emitido vuelve igual, aunque el curso hoy no otorgue", async () => {
    selectQueue.push([inscripcion({ grantsCertificate: false })]);
    selectQueue.push([
      {
        id: "cert_1",
        code: "ABCD-EFGH-JKMN",
        issuedAt: new Date("2026-01-10T00:00:00.000Z"),
        attendancePct: 91,
        historical: false,
        revokedAt: null,
        revokeReason: null,
      },
    ]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.code).toBe("ABCD-EFGH-JKMN");
    expect(inserts).toHaveLength(0);
  });
});

/* ============================================================
 * B) El certificado GENERAL de la especialización — FR-020, FR-038
 * ============================================================ */

function hija(over: Record<string, unknown> = {}) {
  return {
    id: "enr_m1",
    cohortId: "coh_m1",
    courseId: "cur_1",
    enrolledAt: null,
    position: 1,
    parentCohortId: "coh_padre",
    cohortName: "Módulo 1 — Revit Arquitectura",
    courseName: "Revit Arquitectura",
    startDate: null,
    endDate: null,
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
 * La cola completa de una emisión sobre la inscripción MADRE.
 *
 * `evaluaciones` y `resultados` son lo que decide el estado de cada hija: sin
 * evaluaciones y sin mínimo de asistencia, una hija queda `aprobado`.
 */
function colaDeMadre(
  hijas: unknown[],
  evaluaciones: unknown[] = [],
  resultados: unknown[] = []
) {
  selectQueue.push([inscripcion({ id: "enr_madre", cohortId: "coh_padre" })]);
  selectQueue.push([]); // no hay certificado previo
  selectQueue.push([{ id: "enr_m1" }]); // tieneHijas → SÍ es madre
  // programGrading
  selectQueue.push([{ id: "enr_madre", cohortId: "coh_padre" }]);
  selectQueue.push(hijas);
  selectQueue.push([]); // módulos del programa
  selectQueue.push([]); // sesiones
  selectQueue.push([]); // marcas
  selectQueue.push(evaluaciones);
  selectQueue.push(resultados);
}

describe("issueCertificate — el certificado general de la especialización (FR-020, FR-038)", () => {
  /**
   * FR-038, primera mitad. Una hija en `pendiente` —el módulo que todavía no
   * empezó, que sobre ocho meses de cursada es la norma— impide el general.
   * La condición vive en el servidor: no se puede emitir llamando al endpoint
   * directamente.
   */
  it("NO se emite con una hija pendiente", async () => {
    colaDeMadre(
      [hija(), hija({ id: "enr_m2", cohortId: "coh_m2" })],
      [{ id: "as_1", cohortId: "coh_m2", required: true }],
      [] // sin resultado cargado → la hija 2 queda pendiente
    );

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_madre");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.code).toBe("not_approved");
      expect(r.message).toContain("módulo");
    }
    expect(inserts).toHaveLength(0);
  });

  /** FR-038, segunda mitad — con una hija reprobada tampoco. */
  it("NO se emite con una hija reprobada", async () => {
    colaDeMadre(
      [hija(), hija({ id: "enr_m2", cohortId: "coh_m2" })],
      [{ id: "as_1", cohortId: "coh_m2", required: true }],
      [{ assessmentId: "as_1", enrollmentId: "enr_m2", passed: false }]
    );

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_madre");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_approved");
    expect(inserts).toHaveLength(0);
  });

  /**
   * DV-005 — una madre SIN hijas cargadas no es una madre: `tieneHijas`
   * responde por la presencia de filas (FR-033). Cae al camino de siempre.
   */
  it("se emite con TODAS las hijas aprobadas", async () => {
    colaDeMadre([hija(), hija({ id: "enr_m2", cohortId: "coh_m2" })]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_madre");

    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    const fila = inserts[0] as { enrollmentId: string; attendancePct: number | null };
    expect(fila.enrollmentId).toBe("enr_madre");
    /**
     * No existe "la asistencia de la especialización": cada módulo tiene su
     * cronograma y su propio mínimo (regla 5, DV-002). Inventar un promedio
     * sería congelar un número que no se calcula en ningún otro lado.
     */
    expect(fila.attendancePct).toBeNull();
  });

  /**
   * Decisión del dueño (2026-09-09): un módulo que NO otorga certificado
   * propio igual cuenta para el general. Aprobar y certificar son cosas
   * distintas — `grants_certificate` gobierna la EMISIÓN y nada más, no entra
   * en ningún cómputo de aprobación. Si se excluyera del cómputo, alguien que
   * reprobó un módulo del programa recibiría el general.
   */
  it("un módulo que no otorga certificado, REPROBADO, igual impide el general", async () => {
    colaDeMadre(
      [hija(), hija({ id: "enr_m2", cohortId: "coh_m2" })],
      [{ id: "as_1", cohortId: "coh_m2", required: true }],
      [{ assessmentId: "as_1", enrollmentId: "enr_m2", passed: false }]
    );

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_madre");

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_approved");
    expect(inserts).toHaveLength(0);
  });

  /**
   * La otra mitad de la misma decisión: el módulo no certificable APROBADO
   * suma al general como cualquier otro. Su propio certificado no se emite —
   * eso lo prueba el bloque A—, pero el recorrido está completo.
   */
  it("un módulo que no otorga certificado, APROBADO, deja emitir el general", async () => {
    colaDeMadre([hija(), hija({ id: "enr_m2", cohortId: "coh_m2" })]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_madre");

    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });

  /**
   * `programApprovalState` decide el estado del recorrido y NO puede saber
   * nada de certificados: es pura y compone estados ya calculados. Que la
   * bandera no se cuele ahí es lo que mantiene separadas las dos cosas.
   */
  it("la bandera del curso no entra en el cómputo de aprobación", async () => {
    const src = leer("server/grading.ts");
    expect(src.includes("grantsCertificate")).toBe(false);
  });

  /**
   * FR-007 / constitución IV — la unicidad ES la idempotencia. Emitir dos
   * veces devuelve el mismo certificado y no crea otro.
   */
  it("emitir el general dos veces devuelve el mismo, una sola vez", async () => {
    selectQueue.push([inscripcion({ id: "enr_madre", cohortId: "coh_padre" })]);
    selectQueue.push([
      {
        id: "cert_g",
        code: "PQRS-TUVW-XYZ2",
        issuedAt: new Date("2026-09-09T12:00:00.000Z"),
        attendancePct: null,
        historical: false,
        revokedAt: null,
        revokeReason: null,
      },
    ]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_madre");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.code).toBe("PQRS-TUVW-XYZ2");
    expect(inserts).toHaveLength(0);
  });
});

/* ============================================================
 * C) FR-026 — el certificado congela la asistencia REAL
 * ============================================================ */

describe("issueCertificate — la dispensa no infla el porcentaje congelado (FR-026)", () => {
  /**
   * Está prohibido subir el número para que la emisión "cierre": el hecho es
   * que faltó y que alguien lo habilitó igual, y las dos mitades tienen que
   * quedar escritas. El certificado guarda la asistencia REAL; la dispensa
   * viaja al lado, nunca adentro del porcentaje.
   */
  it("congela el porcentaje real de quien aprobó con dispensa", async () => {
    const OTORGADA = new Date("2026-09-07T12:00:00.000Z");
    selectQueue.push([
      inscripcion({
        attendanceWaiverAt: OTORGADA,
        attendanceWaiverReason: "avisó antes de empezar que se iba de viaje",
      }),
    ]);
    selectQueue.push([]); // no hay certificado previo
    selectQueue.push([]); // no es madre
    // Una clase, ausente: 0% real, con mínimo 80% — sin dispensa reprobaría.
    selectQueue.push([{ id: "coh_1", minAttendancePct: 80, courseMinPct: null }]);
    selectQueue.push([]); // evaluaciones
    selectQueue.push([
      {
        id: "enr_1",
        enrolledAt: null,
        firstName: "Ana",
        lastName: "Pérez",
        attendanceWaiverAt: OTORGADA,
        attendanceWaiverReason: "avisó antes de empezar que se iba de viaje",
        attendanceWaiverRevokedAt: null,
        attendanceWaiverByName: "Sergio",
      },
    ]);
    selectQueue.push([]); // resultados
    selectQueue.push([
      { id: "cs_1", cohortId: "coh_1", date: new Date("2026-05-04"), canceledAt: null },
    ]);
    selectQueue.push([
      { attendance: { enrollmentId: "enr_1", classSessionId: "cs_1", status: "ausente" } },
    ]);
    selectQueue.push([]); // certificados

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(true);
    const fila = inserts[0] as { attendancePct: number | null };
    expect(fila.attendancePct).toBe(0);
    // Y la marca viaja al lado del número, para que la pantalla pueda decirlo.
    if (r.ok) expect(r.data.dispensada).toBe(true);
  });
});

/* ============================================================
 * D) La dispensa: el acto de otorgarla y el de revocarla
 * ============================================================ */

describe("otorgarDispensa — FR-022, FR-023, DV-003", () => {
  /** FR-023 — sin motivo no hay dispensa. Es la regla, no una validación de forma. */
  it("sin motivo no escribe nada", async () => {
    const { otorgarDispensa } = await import("@/server/attendance-waiver");
    const r = await otorgarDispensa("org_1", "enr_m1", { motivo: "   ", otorgadaPor: "usr_1" });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.code).toBe("motivo_requerido");
    }
    expect(updates).toHaveLength(0);
  });

  it("una inscripción inexistente no se dispensa", async () => {
    selectQueue.push([]);
    const { otorgarDispensa } = await import("@/server/attendance-waiver");
    const r = await otorgarDispensa("org_1", "enr_fantasma", {
      motivo: "viaje avisado",
      otorgadaPor: "usr_1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  /**
   * Las tres columnas del acto, nunca un booleano (FR-023). Una excepción sin
   * autor ni motivo es indistinguible de un error de cálculo.
   */
  it("escribe quién, cuándo y por qué", async () => {
    selectQueue.push([
      {
        id: "enr_m1",
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
      },
    ]);

    const { otorgarDispensa } = await import("@/server/attendance-waiver");
    const r = await otorgarDispensa("org_1", "enr_m1", {
      motivo: "  avisó antes de empezar que se iba de viaje  ",
      otorgadaPor: "usr_sergio",
    });

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set;
    expect(updates[0]!.table).toBe("enrollment");
    expect(set.attendanceWaiverAt).toBeInstanceOf(Date);
    expect(set.attendanceWaiverBy).toBe("usr_sergio");
    expect(set.attendanceWaiverReason).toBe("avisó antes de empezar que se iba de viaje");
  });

  /**
   * DV-004 — volver a otorgarla después de una revocación LIMPIA el trío de
   * revocación. Si no, la dispensa nueva nacería revocada: `dispensaVigente`
   * exige `revocadaEl === null`, y el dueño habría dicho "la habilito" para
   * que nada cambiara.
   */
  it("re-otorgar después de revocar limpia la revocación", async () => {
    selectQueue.push([
      {
        id: "enr_m1",
        attendanceWaiverAt: new Date("2026-08-01T00:00:00.000Z"),
        attendanceWaiverReason: "viaje",
        attendanceWaiverRevokedAt: new Date("2026-08-20T00:00:00.000Z"),
      },
    ]);

    const { otorgarDispensa } = await import("@/server/attendance-waiver");
    const r = await otorgarDispensa("org_1", "enr_m1", {
      motivo: "el viaje se confirmó con el certificado médico",
      otorgadaPor: "usr_sergio",
    });

    expect(r.ok).toBe(true);
    const set = updates[0]!.set;
    expect(set.attendanceWaiverRevokedAt).toBeNull();
    expect(set.attendanceWaiverRevokedBy).toBeNull();
    expect(set.attendanceWaiverRevokeReason).toBeNull();
  });

  /** Otorgar sobre una dispensa VIGENTE no reescribe el acto original. */
  it("con una dispensa vigente responde 409 y no pisa el acto anterior", async () => {
    selectQueue.push([
      {
        id: "enr_m1",
        attendanceWaiverAt: new Date("2026-08-01T00:00:00.000Z"),
        attendanceWaiverReason: "viaje",
        attendanceWaiverRevokedAt: null,
      },
    ]);

    const { otorgarDispensa } = await import("@/server/attendance-waiver");
    const r = await otorgarDispensa("org_1", "enr_m1", {
      motivo: "otro motivo",
      otorgadaPor: "usr_1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
    expect(updates).toHaveLength(0);
  });
});

describe("revocarDispensa — DV-004", () => {
  it("sin motivo no revoca", async () => {
    const { revocarDispensa } = await import("@/server/attendance-waiver");
    const r = await revocarDispensa("org_1", "enr_m1", { motivo: "", revocadaPor: "usr_1" });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("motivo_requerido");
    expect(updates).toHaveLength(0);
  });

  it("sin dispensa vigente no hay nada que revocar", async () => {
    selectQueue.push([
      {
        id: "enr_m1",
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
      },
    ]);

    const { revocarDispensa } = await import("@/server/attendance-waiver");
    const r = await revocarDispensa("org_1", "enr_m1", {
      motivo: "se comprobó que el viaje no existió",
      revocadaPor: "usr_1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
    expect(updates).toHaveLength(0);
  });

  /**
   * DV-004, el corazón de la regla: revocar la dispensa y revocar el
   * certificado son DOS ACTOS SEPARADOS Y EXPLÍCITOS. Encadenarlos revocaría
   * un certificado ya entregado en la mano de una persona sin que nadie lo
   * haya decidido.
   */
  it("marca la revocación y NO toca el certificado", async () => {
    selectQueue.push([
      {
        id: "enr_m1",
        attendanceWaiverAt: new Date("2026-08-01T00:00:00.000Z"),
        attendanceWaiverReason: "viaje",
        attendanceWaiverRevokedAt: null,
      },
    ]);

    const { revocarDispensa } = await import("@/server/attendance-waiver");
    const r = await revocarDispensa("org_1", "enr_m1", {
      motivo: "se comprobó que el viaje no existió",
      revocadaPor: "usr_sergio",
    });

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe("enrollment");
    const set = updates[0]!.set;
    expect(set.attendanceWaiverRevokedAt).toBeInstanceOf(Date);
    expect(set.attendanceWaiverRevokedBy).toBe("usr_sergio");
    expect(set.attendanceWaiverRevokeReason).toBe("se comprobó que el viaje no existió");
    // El acto original se conserva: borrarlo dejaría un alumno aprobado sin
    // que ningún registro explique por qué lo estuvo.
    expect(set.attendanceWaiverAt).toBeUndefined();
    expect(set.attendanceWaiverReason).toBeUndefined();
    // Y ni una línea sobre `certificate`.
    expect(updates.some((u) => u.table === "certificate")).toBe(false);
  });
});

/* ============================================================
 * E) Guardas estructurales
 * ============================================================ */

const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("guardas estructurales de la fase 5", () => {
  /**
   * FR-023 — la dispensa no puede volver a ser un booleano por la puerta de
   * atrás. El módulo que la ESCRIBE es el único que puede reintroducirla.
   */
  it("el módulo de la dispensa no declara ninguna bandera booleana", async () => {
    const src = leer("server/attendance-waiver.ts");
    expect(/dispensad[oa]\s*[:=]\s*(true|false|boolean)/i.test(src)).toBe(false);
    expect(/attendanceWaiver\w*\s*:\s*(true|false)/.test(src)).toBe(false);
  });

  /**
   * DV-003 — la gobierna `evaluacion.editar`. La lista de capacidades es
   * CERRADA (`src/lib/capabilities.ts`) y esta fase no agrega ninguna: lo que
   * la dispensa cambia es si el alumno aprueba, no quién pasó lista.
   */
  it("la ruta de la dispensa exige evaluacion.editar y ninguna capacidad nueva", async () => {
    const src = leer("app/api/enrollments/[id]/dispensa/route.ts");
    expect(src).toContain('requireCapability(\n  "evaluacion.editar"');
    const { CAPABILITIES } = await import("@/lib/capabilities");
    expect(CAPABILITIES).toContain("evaluacion.editar");
    // Sin capacidad 18: la que se propuso y se descartó, nombrada para que el
    // día que aparezca sea una decisión y no un descuido.
    expect(CAPABILITIES).not.toContain("dispensa.otorgar");
  });

  /**
   * Multi-tenancy (constitución III) — las dos ESCRITURAS de la dispensa
   * pasan por `scoped()`, no sólo la lectura.
   *
   * Que `leerInscripcion` filtre por organización primero y que RLS sea una
   * segunda red no alcanza: eso es una defensa que descansa en el orden de
   * las llamadas dentro de una función. Los tres hermanos que escriben esta
   * misma tabla —`enrollments.ts` dos veces y `program-staff.ts`— la scopean.
   */
  it("las escrituras de la dispensa pasan por scoped()", async () => {
    const src = leer("server/attendance-waiver.ts");
    const escrituras =
      src.match(/\.update\(schema\.enrollment\)[\s\S]*?\.returning\(\)/g) ?? [];
    expect(escrituras).toHaveLength(2);
    for (const u of escrituras) {
      expect(u).toContain("scoped(");
      expect(u).toContain("schema.enrollment.organizationId");
    }
  });

  /**
   * La misma regla, en el hermano: anular un certificado también es una
   * escritura de dominio. La línea venía del ciclo 010 y el test la alcanza
   * ahora porque aplicarle el criterio a `attendance-waiver.ts` y no a
   * `revokeCertificate` sería sostener dos varas para el mismo riesgo.
   */
  it("anular un certificado también pasa por scoped()", async () => {
    const src = leer("server/certificates.ts");
    const escrituras =
      src.match(/\.update\(schema\.certificate\)[\s\S]*?\.returning\(\)/g) ?? [];
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toContain("scoped(");
    expect(escrituras[0]).toContain("schema.certificate.organizationId");
  });

  /**
   * FR-025 — **una dispensa silenciosa está prohibida**, y el requisito no es
   * que el motivo VIAJE: es que se LEA.
   *
   * `moduleApprovalState` compone "asistencia 62% (mínimo 80%) — dispensa
   * otorgada por X el D/M/A: motivo" y lo mete en `reasons`; `program-staff.ts`
   * lo devuelve en cada celda. Si la grilla no lo renderiza, el dato recorre
   * la base, el servidor y la red para morir en el render — y la pantalla
   * queda afirmando un "Aprobado" que nadie puede explicar.
   *
   * Es exactamente lo que el legajo del 013 pagó caro: una afirmación falsa
   * dicha con la confianza de un dato.
   */
  it("la grilla del programa RENDERIZA el motivo de cada módulo", () => {
    const src = leer("components/cohorts/program-client.tsx");
    expect(src).toContain("celda.reasons");
  });

  /**
   * El agujero que el gate NO ve: `CourseDto` promete campos que el `GET
   * /api/courses` nunca manda.
   *
   * La ruta serializa con una lista escrita a mano, y `Response.json()` no se
   * contrasta contra ningún tipo — así que el compilador nunca se entera. El
   * editor de cursos se precarga desde ESE payload, de modo que un campo
   * ausente vuelve al form como `undefined`, cae en su default optimista y se
   * guarda pisado en el próximo Guardar.
   *
   * Costó dos banderas antes de esta fase (`published` desde el 007,
   * `minAttendancePct` desde el 009) y casi se lleva puesta la tercera, que
   * es justamente la que decide si se emite un certificado. Por eso el test
   * exige la lista COMPLETA y no los tres campos que hoy duelen: el próximo
   * campo que alguien agregue a `CourseDto` va a fallar acá y no en
   * producción.
   */
  it("GET /api/courses manda TODOS los campos que CourseDto promete", () => {
    const dto = readFileSync(path.join(SRC, "lib", "types.ts"), "utf8");
    const bloque = dto.slice(
      dto.indexOf("export type CourseDto"),
      dto.indexOf("export type TeacherDto")
    );
    const campos = [...bloque.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!);
    expect(campos).toContain("grantsCertificate");

    const ruta = leer("app/api/courses/route.ts");
    const serializacion = ruta.slice(ruta.indexOf("rows.map("), ruta.indexOf("const createSchema"));
    const faltantes = campos.filter((c) => !new RegExp(`\\b${c}:`).test(serializacion));
    expect(faltantes).toEqual([]);
  });

  /**
   * DV-004 — que los dos actos estén separados se lee en el código: el módulo
   * de la dispensa no IMPORTA nada de certificados y no llama a nada suyo.
   *
   * El test se ancla en el import y en la llamada, no en la palabra: el
   * comentario que explica la separación nombra el certificado, y buscar el
   * sustantivo suelto haría fallar al archivo por documentarse bien. Es la
   * misma trampa que el `src.indexOf("no tiene módulos")` de la fase 4.
   */
  it("el módulo de la dispensa no importa ni llama a certificados", async () => {
    const src = leer("server/attendance-waiver.ts");
    expect(/from\s+"@\/server\/certificates"/.test(src)).toBe(false);
    expect(/schema\.certificate\b/.test(src)).toBe(false);
    expect(src.includes("issueCertificate(")).toBe(false);
    expect(src.includes("revokeCertificate(")).toBe(false);
  });
});
