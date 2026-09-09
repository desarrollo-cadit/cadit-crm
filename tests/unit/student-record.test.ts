import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, capabilitiesFor } from "@/lib/capabilities";

/**
 * 013 (T027, FR-010) — El legajo respeta las capacidades de 012.
 *
 * La regla: **quien no tiene `cobranza.ver` no recibe el estado de cuenta**, y
 * no porque la pantalla no lo dibuje — porque el objeto no lo trae. Mandar los
 * montos por la red y esconderlos en la UI es exactamente el error que 012
 * corrigió en el roster: el dato ya salió del servidor.
 *
 * Es la misma regla dura que `buildRosterEntry`, aplicada a la pantalla que
 * reúne TODO el recorrido de una persona.
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
  getDb: () => ({ select: () => thenableChain(selectQueue.shift() ?? []) }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const CONTACTO = {
  id: "ct_1",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@x.com",
  phone: "59899111222",
  nationalId: "1.234.567-8",
};

const COHORTE = {
  id: "coh_1",
  name: "Revit MEP 2",
  startDate: new Date("2026-10-19"),
  endDate: new Date("2026-12-02"),
  minAttendancePct: 75,
};

const CURSO = { id: "crs_1", name: "Revit MEP", minAttendancePct: null };

/**
 * La secuencia de consultas de `getStudentRecord`: contacto, inscripciones, y
 * después las cinco piezas en paralelo (asistencia, clases, resultados,
 * evaluaciones, certificados). Con `cobranza.ver` se suman cuotas y pagos.
 */
function colaBase() {
  selectQueue.push([CONTACTO]); // contacto
  selectQueue.push([
    {
      enrollment: {
        id: "enr_1",
        enrolledAt: new Date("2026-10-19"),
        createdAt: new Date("2026-10-01"),
      },
      cohort: COHORTE,
      course: CURSO,
    },
  ]);
  selectQueue.push([]); // asistencia
  selectQueue.push([]); // clases
  selectQueue.push([]); // resultados
  selectQueue.push([]); // evaluaciones
  selectQueue.push([]); // certificados
}

describe("getStudentRecord — el estado de cuenta y las capacidades", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    vi.resetModules();
  });

  /**
   * **El caso que justifica el archivo.** `account` no puede existir en el
   * objeto: no alcanza con que la UI no lo pinte.
   */
  it("SIN `cobranza.ver` la clave `account` NO existe en el objeto", async () => {
    colaBase();
    const { getStudentRecord } = await import("@/server/student-record");

    const r = await getStudentRecord("org_1", "ct_1", capabilitiesFor("soporte"));

    expect(r).not.toBeNull();
    expect("account" in r!).toBe(false);
    // Y el resto del legajo SÍ llega: soporte tiene que poder responder
    // "¿aprobó?" sin ver un peso.
    expect(r!.courses).toHaveLength(1);
    expect(r!.contact.name).toBe("Ana Pérez");
  });

  it("CON `cobranza.ver` la clave existe", async () => {
    colaBase();
    selectQueue.push([]); // cuotas (vacías: no hay plan cargado)
    const { getStudentRecord } = await import("@/server/student-record");

    const r = await getStudentRecord("org_1", "ct_1", CAPABILITIES);

    expect("account" in r!).toBe(true);
    expect(r!.account).toEqual([]);
  });

  /**
   * Saldo por MONEDA. Sumar 57.000 UYU con 1.200 USD da un número que no
   * significa nada — es el bug que se corrigió en el dashboard (007) y que no
   * puede volver por la puerta del legajo.
   */
  it("el saldo NUNCA mezcla monedas", async () => {
    colaBase();
    selectQueue.push([
      // Vencida (fecha pasada) y con pago parcial: cuenta como morosa.
      { id: "inst_1", currency: "UYU", amount: 57000, dueDate: new Date("2020-01-01"), canceledAt: null },
      // A vencer: no cuenta, aunque no esté paga.
      { id: "inst_2", currency: "USD", amount: 1200, dueDate: new Date("2099-01-01"), canceledAt: null },
    ]);
    selectQueue.push([
      { installmentId: "inst_1", amount: 20000, voidedAt: null },
    ]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", CAPABILITIES);

    const uyu = r!.account!.find((a) => a.currency === "UYU");
    const usd = r!.account!.find((a) => a.currency === "USD");
    expect(uyu).toEqual({
      currency: "UYU",
      total: 57000,
      paid: 20000,
      balance: 37000,
      overdueCount: 1,
    });
    expect(usd?.balance).toBe(1200);
    // La de USD no venció: deber no es lo mismo que estar en mora.
    expect(usd?.overdueCount).toBe(0);
    expect(r!.account).toHaveLength(2);
  });

  /** Una cuota anulada no cuenta: refinanciar no puede inflar la deuda. */
  it("las cuotas anuladas no entran en el saldo", async () => {
    colaBase();
    selectQueue.push([
      { id: "inst_1", currency: "UYU", amount: 57000, dueDate: null, canceledAt: new Date() },
    ]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", CAPABILITIES);

    expect(r!.account).toEqual([]);
  });

  /** Un pago anulado tampoco: el saldo vuelve. */
  it("los pagos anulados no descuentan", async () => {
    colaBase();
    selectQueue.push([
      { id: "inst_1", currency: "UYU", amount: 57000, dueDate: null, canceledAt: null },
    ]);
    selectQueue.push([
      { installmentId: "inst_1", amount: 20000, voidedAt: new Date() },
    ]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", CAPABILITIES);

    expect(r!.account![0]!.paid).toBe(0);
    expect(r!.account![0]!.balance).toBe(57000);
  });

  /**
   * 013 (T030) — **Encontrado con datos reales.** Un alumno con 5 cursadas
   * figuraba "Aprobado" en las cinco, sin una sola evaluación ni asistencia
   * cargada: `approvalState([], null, null)` devuelve "aprobado".
   *
   * Para la planilla de la cohorte (010) está bien —el coordinador sabe que
   * todavía no cargó nada—. Para el LEGAJO no: es un documento sobre una
   * persona, y afirmar que aprobó sin ningún dato es inventar un hecho.
   */
  it("sin evaluaciones NI asistencia dice «sin_datos», no «aprobado»", async () => {
    colaBase();
    const { getStudentRecord } = await import("@/server/student-record");

    const r = await getStudentRecord("org_1", "ct_1", capabilitiesFor("soporte"));

    expect(r!.courses[0]!.approval).toBe("sin_datos");
    expect(r!.courses[0]!.approvalReasons.join(" ")).toContain("Todavía no hay");
  });

  /**
   * 013 (T034) — **Lo encontró el arnés E2E, no este archivo.**
   *
   * Con el cronograma generado pero SIN lista tomada, `attendancePercentage`
   * devuelve 0 —no null— así que la condición de "sin datos" no se activaba y
   * el legajo decía "Aprobado con 0% de asistencia". Es una acusación: dice
   * que la persona no fue a ninguna clase cuando el profesor todavía no pasó
   * lista.
   *
   * Es exactamente el estado en que van a quedar las 41 cohortes reales el día
   * que se genere su cronograma.
   */
  it("con clases generadas pero SIN lista tomada, sigue siendo «sin_datos»", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([
      {
        enrollment: { id: "enr_1", enrolledAt: null, createdAt: new Date() },
        cohort: COHORTE,
        course: CURSO,
      },
    ]);
    selectQueue.push([]); // asistencia: NADIE pasó lista
    selectQueue.push([
      // pero las clases SÍ existen
      { id: "cls_1", cohortId: "coh_1", date: new Date("2026-10-20"), canceledAt: null },
      { id: "cls_2", cohortId: "coh_1", date: new Date("2026-10-22"), canceledAt: null },
    ]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", capabilitiesFor("soporte"));

    expect(r!.courses[0]!.approval).toBe("sin_datos");
    // Y el porcentaje va en null, no en 0: no se acusa a quien no faltó.
    expect(r!.courses[0]!.attendancePct).toBeNull();
  });

  /** Con asistencia registrada sí hay algo que afirmar. */
  it("con asistencia registrada vuelve a evaluar de verdad", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([
      {
        enrollment: { id: "enr_1", enrolledAt: null, createdAt: new Date() },
        cohort: COHORTE,
        course: CURSO,
      },
    ]);
    selectQueue.push([
      { enrollmentId: "enr_1", classSessionId: "cls_1", status: "presente" },
    ]);
    selectQueue.push([
      { id: "cls_1", cohortId: "coh_1", date: new Date("2026-10-20"), canceledAt: null },
    ]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", capabilitiesFor("soporte"));

    expect(r!.courses[0]!.approval).not.toBe("sin_datos");
    expect(r!.courses[0]!.attendancePct).toBe(100);
  });

  it("un contacto inexistente devuelve null", async () => {
    selectQueue.push([]);
    const { getStudentRecord } = await import("@/server/student-record");
    expect(await getStudentRecord("org_1", "ct_fantasma", CAPABILITIES)).toBeNull();
  });

  /**
   * DV-004 — El legajo es por CONTACTO: una persona que cursó tres veces trae
   * sus tres cursadas adentro, no tres legajos.
   */
  it("reúne TODAS las cursadas de la persona (DV-004)", async () => {
    selectQueue.push([CONTACTO]);
    selectQueue.push([
      { enrollment: { id: "enr_1", enrolledAt: null, createdAt: new Date("2025-01-01") }, cohort: COHORTE, course: CURSO },
      { enrollment: { id: "enr_2", enrolledAt: null, createdAt: new Date("2026-01-01") }, cohort: { ...COHORTE, id: "coh_2", name: "AutoCAD 2D" }, course: CURSO },
      // Un lead sin cohorte: existe como inscripción pero no cursó nada.
      { enrollment: { id: "enr_3", enrolledAt: null, createdAt: new Date("2026-06-01") }, cohort: null, course: null },
    ]);
    for (let i = 0; i < 5; i++) selectQueue.push([]);

    const { getStudentRecord } = await import("@/server/student-record");
    const r = await getStudentRecord("org_1", "ct_1", capabilitiesFor("soporte"));

    expect(r!.courses).toHaveLength(3);
    expect(r!.courses.map((c) => c.cohortName)).toEqual([
      "Revit MEP 2",
      "AutoCAD 2D",
      "Lead sin cohorte",
    ]);
  });
});
