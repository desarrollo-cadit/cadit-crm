import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 024 (SC-004) — Anular un certificado: el acto que faltaba.
 *
 * Las tres columnas (`revoked_at`, `revoked_by`, `revoke_reason`) existían
 * desde el ciclo 010 y ninguna ruta las escribía: la anulación era una
 * capacidad del modelo que ningún humano podía ejercer. Por eso este camino
 * nunca tuvo prueba de comportamiento — no había nada que recorrer.
 *
 * Lo que se fija acá son las tres decisiones que hacen que anular sea un acto
 * REVISABLE y no un borrado disfrazado:
 *
 * 1. **Quién y por qué quedan escritos.** Mismo criterio que la dispensa
 *    (028, FR-023): una excepción sin autor ni motivo no se puede revisar
 *    después.
 * 2. **Anular dos veces no produce una segunda verdad** (constitución IV). La
 *    PRIMERA anulación es la que vale: su fecha, su autor y su motivo no se
 *    pisan con los de quien volvió a apretar el botón.
 * 3. **Emitir después de anular no resucita nada.** `certificate.enrollment_id`
 *    es UNIQUE: la fila anulada es la única que esa inscripción puede tener, y
 *    devolverla como "emitido" le diría a la pantalla que hay un certificado
 *    vigente cuando lo que hay es uno anulado.
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
 * columnas se tocaron. La tabla importa: una anulación no puede escribir sobre
 * la inscripción ni sobre nada que no sea el certificado.
 */
function updateChain(table: string, set: Record<string, unknown>) {
  updates.push({ table, set });
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.returning = async () => [
    {
      id: "cert_1",
      code: "ABCD-1234-EFGH",
      issuedAt: new Date("2026-09-01T12:00:00.000Z"),
      attendancePct: 90,
      historical: false,
      revokedAt: null,
      revokeReason: null,
      ...set,
    },
  ];
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

/** La fila del certificado tal como la lee `revokeCertificate`, con su dispensa. */
function filaDeCertificado(over: Record<string, unknown> = {}) {
  return {
    certificate: {
      id: "cert_1",
      code: "ABCD-1234-EFGH",
      issuedAt: new Date("2026-09-01T12:00:00.000Z"),
      attendancePct: 90,
      historical: false,
      revokedAt: null,
      revokeReason: null,
      ...over,
    },
    attendanceWaiverAt: null,
    attendanceWaiverReason: null,
    attendanceWaiverRevokedAt: null,
  };
}

describe("024 SC-004 — anular el certificado de una inscripción", () => {
  it("deja escritos la fecha, el motivo y QUIÉN lo anuló", async () => {
    selectQueue.push([{ id: "cert_1" }]); // el certificado de la inscripción
    selectQueue.push([filaDeCertificado()]);

    const { revokeEnrollmentCertificate } = await import("@/server/certificates");
    const r = await revokeEnrollmentCertificate("org_1", "enr_1", {
      reason: "Se emitió a la persona equivocada",
      revokedBy: "user_1",
    });

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe("certificate");
    expect(updates[0]!.set.revokedAt).toBeInstanceOf(Date);
    expect(updates[0]!.set.revokedBy).toBe("user_1");
    expect(updates[0]!.set.revokeReason).toBe("Se emitió a la persona equivocada");
  });

  /**
   * Constitución IV — anular no es un estado que se pueda "volver a poner".
   * Si el segundo pedido reescribiera la fila, el motivo y el autor de la
   * anulación real se perderían sin que nadie lo note.
   */
  it("anular dos veces no pisa la primera anulación", async () => {
    selectQueue.push([{ id: "cert_1" }]);
    selectQueue.push([
      filaDeCertificado({
        revokedAt: new Date("2026-09-10T12:00:00.000Z"),
        revokeReason: "El motivo original",
      }),
    ]);

    const { revokeEnrollmentCertificate } = await import("@/server/certificates");
    const r = await revokeEnrollmentCertificate("org_1", "enr_1", {
      reason: "Otro motivo cualquiera",
      revokedBy: "user_2",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.code).toBe("already_revoked");
    }
    expect(updates).toHaveLength(0);
  });

  it("una inscripción sin certificado responde 404 y no escribe nada", async () => {
    selectQueue.push([]); // no hay certificado para esa inscripción

    const { revokeEnrollmentCertificate } = await import("@/server/certificates");
    const r = await revokeEnrollmentCertificate("org_1", "enr_1", {
      reason: "Da igual",
      revokedBy: "user_1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});

describe("024 — emitir después de anular", () => {
  /**
   * `certificate.enrollment_id` es UNIQUE, así que "emitir de nuevo" no puede
   * crear una segunda fila. Quedaban dos salidas y las dos mienten: devolver
   * el anulado como si estuviera vigente —la pantalla diría "emitido" sobre un
   * papel sin validez— o limpiar la anulación, que borra la evidencia de que
   * alguien la decidió. Se elige la tercera: decir que está anulado.
   */
  it("no resucita el anulado ni crea otro: 409 y ninguna escritura", async () => {
    selectQueue.push([
      {
        id: "enr_1",
        cohortId: "coh_1",
        grantsCertificate: true,
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
      },
    ]);
    selectQueue.push([
      {
        id: "cert_1",
        code: "ABCD-1234-EFGH",
        issuedAt: new Date("2026-09-01T12:00:00.000Z"),
        attendancePct: 90,
        historical: false,
        revokedAt: new Date("2026-09-10T12:00:00.000Z"),
        revokeReason: "Se emitió a la persona equivocada",
      },
    ]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.code).toBe("certificado_anulado");
    }
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  /** FR-007 no cambia: sobre un certificado VIGENTE, emitir de nuevo devuelve el mismo. */
  it("sobre uno vigente sigue siendo idempotente", async () => {
    selectQueue.push([
      {
        id: "enr_1",
        cohortId: "coh_1",
        grantsCertificate: true,
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
      },
    ]);
    selectQueue.push([
      {
        id: "cert_1",
        code: "ABCD-1234-EFGH",
        issuedAt: new Date("2026-09-01T12:00:00.000Z"),
        attendancePct: 90,
        historical: false,
        revokedAt: null,
        revokeReason: null,
      },
    ]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.code).toBe("ABCD-1234-EFGH");
    expect(inserts).toHaveLength(0);
  });
});

describe("024 SC-004 — qué dice la verificación PÚBLICA de un anulado", () => {
  /**
   * El verificador es la superficie sin sesión: lo abre un empleador con el
   * código impreso en el papel. Un anulado tiene que APARECER —decir "no
   * existe" sobre algo que sí se emitió es peor que decir "se anuló"— y al
   * mismo tiempo no puede empezar a contar nada que hoy no cuente.
   *
   * El motivo de la anulación es exactamente eso: se escribe para que la
   * academia pueda revisar la decisión, no para que un tercero lea por qué se
   * le anuló el título a una persona.
   */
  it("aparece, dice que está anulado, y NO expone el motivo ni el autor", async () => {
    selectQueue.push([
      {
        certificate: {
          id: "cert_1",
          code: "ABCD-1234-EFGH",
          issuedAt: new Date("2026-09-01T12:00:00.000Z"),
          revokedAt: new Date("2026-09-10T12:00:00.000Z"),
          revokedBy: "user_1",
          revokeReason: "Se emitió a la persona equivocada",
        },
        contact: { firstName: "Ana", lastName: "Pérez" },
        courseName: "AutoCAD",
        cohortName: "AC-12",
        durationWeeks: 10,
        hoursPerWeek: 4,
      },
    ]);

    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("abcd-1234-efgh");

    expect(pub).not.toBeNull();
    expect(pub!.valid).toBe(false);
    expect(pub!.revokedAt).toBe("2026-09-10T12:00:00.000Z");
    expect(Object.keys(pub!).sort()).toEqual(
      ["code", "cohort", "course", "hours", "issuedAt", "revokedAt", "student", "valid"].sort()
    );
    expect(JSON.stringify(pub)).not.toContain("persona equivocada");
    expect(JSON.stringify(pub)).not.toContain("user_1");
  });
});

/* ============================================================
 * La pantalla que ejerce la anulación
 * ============================================================ */

const PLANILLA = readFileSync(
  path.join(process.cwd(), "src/components/cohorts/grading-client.tsx"),
  "utf8"
);

const PLANILLA_SIN_COMENTARIOS = PLANILLA.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /(^|[^:])\/\/.*$/gm,
  "$1"
);

describe("024 — anular desde la planilla de la cohorte", () => {
  /**
   * El motivo es la REGLA, no una validación de forma (SC-004): el servidor lo
   * exige con `z.string().trim().min(3)`. La pantalla no puede ofrecer mandar
   * una anulación sin él y dejar que el 422 explique después.
   */
  it("no deja mandar la anulación sin motivo", () => {
    expect(PLANILLA).toContain("motivoAnulacion.trim().length < 3");
  });

  it("anula con DELETE sobre la inscripción, mandando el motivo", () => {
    expect(PLANILLA).toContain('method: "DELETE"');
    expect(PLANILLA).toContain("motivo: motivoAnulacion.trim()");
  });

  /**
   * Los dos 409 de esta superficie dicen cosas DISTINTAS —`already_revoked`
   * que la primera anulación es la que vale, y `certificado_anulado` que no se
   * re-emite sobre una anulación, con su fecha— y un "no se pudo" genérico las
   * borraría a las dos.
   */
  it("muestra el mensaje del servidor, no un genérico", () => {
    expect(PLANILLA).toContain("body?.error?.message ?? fallback");
    expect(PLANILLA).toContain('readError(res, "No se pudo anular el certificado")');
    expect(PLANILLA).toContain('readError(res, "No se pudo emitir el certificado")');
  });

  /**
   * FR-008 — El anulado no se esconde, y además se explica: sin el autor y el
   * motivo, "anulado" obliga a preguntarle a alguien que quizá ya no esté.
   */
  it("dice quién lo anuló, cuándo y por qué", () => {
    expect(PLANILLA).toContain("revokedByName");
    expect(PLANILLA).toContain("revokeReason");
    expect(PLANILLA).toContain("Anulado el");
  });

  /** Emitir y anular son la MISMA capacidad, y nunca un nombre de rol. */
  it("las dos puntas se dibujan por `certificados.emitir`", () => {
    expect(PLANILLA).toContain("canIssueCertificates");
    expect(PLANILLA_SIN_COMENTARIOS).not.toMatch(/role\s*===/);
  });

  /** 016 — "no pude traerla" no puede leerse como "no tiene evaluaciones". */
  it("un fallo de carga no se disfraza de planilla vacía", () => {
    expect(PLANILLA).toContain("loadError");
    expect(PLANILLA).toContain("Reintentar");
    expect(PLANILLA).not.toContain("setSheet(null)");
  });
});
