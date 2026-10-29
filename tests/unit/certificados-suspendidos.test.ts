import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0086 — Decisión del dueño (2026-10-23): la aprobación automática dejó a
 * alumnos sacar certificados que no debían. Desde acá:
 *
 * - no se emite sin el resultado final CONFIRMADO como aprobado;
 * - un certificado ya emitido queda SUSPENDIDO hasta la confirmación: no se
 *   descarga y `/verificar` no lo valida ni dice de quién es.
 */

const selectQueue: unknown[][] = [];
const inserts: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        return {
          returning: async () => [
            { issuedAt: new Date(), revokedAt: null, revokeReason: null, ...(values as object) },
          ],
        };
      },
    }),
  }),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => (typeof col === "symbol" ? undefined : `${String(table)}.${col}`) }) }
  ),
}));

const confirmados = vi.hoisted(() => new Map<string, "aprobado" | "reprobado">());
/** 2026-10-29 — inscripciones cuyo grupo terminó sin la asistencia completa. */
const sinResultado = vi.hoisted(() => new Set<string>());
vi.mock("@/server/resultados-confirmados", async () =>
  (await import("../fixtures/resultados-confirmados-doble")).dobleDeResultados(confirmados, sinResultado)
);

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  confirmados.clear();
  sinResultado.clear();
  vi.resetModules();
});

/* ============================================================ emisión */

function colaDeEmision() {
  selectQueue.push([
    {
      id: "enr_1",
      cohortId: "coh_1",
      grantsCertificate: true,
      cohortEndDate: new Date("2026-01-31T00:00:00.000Z"),
      attendanceWaiverAt: null,
      attendanceWaiverReason: null,
      attendanceWaiverRevokedAt: null,
    },
  ]);
  selectQueue.push([]); // no hay certificado previo
  selectQueue.push([]); // no es madre
  // cohortGrading: cohorte, evaluaciones, roster, resultados, clases, marcas, certificados
  selectQueue.push([{ id: "coh_1", minAttendancePct: null, courseMinPct: null }]);
  selectQueue.push([]);
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
    },
  ]);
  selectQueue.push([]);
  selectQueue.push([]);
  selectQueue.push([]);
  selectQueue.push([]);
}

describe("issueCertificate — exige el resultado final confirmado", () => {
  it("la sugerencia aprobada NO alcanza: 422 resultado_sin_confirmar, sin escribir", async () => {
    colaDeEmision();
    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r).toMatchObject({ ok: false, status: 422, code: "resultado_sin_confirmar" });
    expect(inserts).toHaveLength(0);
  });

  it("confirmado reprobado: 422 not_approved", async () => {
    confirmados.set("enr_1", "reprobado");
    colaDeEmision();
    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r).toMatchObject({ ok: false, status: 422, code: "not_approved" });
    expect(inserts).toHaveLength(0);
  });

  it("confirmado aprobado: emite", async () => {
    confirmados.set("enr_1", "aprobado");
    colaDeEmision();
    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");

    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });

  it("2026-10-29 — grupo terminado sin la asistencia completa: 422 grupo_incompleto, aunque haya un aprobado", async () => {
    confirmados.set("enr_1", "aprobado");
    selectQueue.push([
      {
        id: "enr_1",
        cohortId: "coh_1",
        grantsCertificate: true,
        cohortEndDate: new Date("2026-01-31T00:00:00.000Z"),
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
      },
    ]);
    selectQueue.push([]); // no hay certificado previo
    selectQueue.push([]); // no es madre
    selectQueue.push([
      {
        id: "coh_1",
        minAttendancePct: null,
        courseMinPct: null,
        timezone: "America/Montevideo",
        startDate: new Date("2025-12-01T00:00:00.000Z"),
        endDate: new Date("2026-01-31T00:00:00.000Z"),
      },
    ]);
    selectQueue.push([]); // evaluaciones
    selectQueue.push([{ id: "enr_1", enrolledAt: null, firstName: "Ana", lastName: "Pérez" }]);
    selectQueue.push([]); // resultados
    // Una clase dictada en la que nadie pasó lista.
    selectQueue.push([
      { id: "cs_1", cohortId: "coh_1", date: new Date("2026-01-10T00:00:00.000Z"), endTime: null, canceledAt: null },
    ]);
    selectQueue.push([]); // marcas
    selectQueue.push([]); // certificados

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1");
    expect(r).toMatchObject({ ok: false, status: 422, code: "grupo_incompleto" });
    expect(inserts).toHaveLength(0);
  });

  it("«Emitir a todos» saltea a los que no tienen resultado confirmado y lo informa", () => {
    const src = readFileSync(path.join(process.cwd(), "src/server/certificates.ts"), "utf8");
    expect(src).toContain(`if (r.code === "resultado_sin_confirmar") return { estado: "sin_confirmar"`);
    const ui = readFileSync(path.join(process.cwd(), "src/components/cohorts/issue-all-certificates.tsx"), "utf8");
    expect(ui).toContain(`estado: "sin_confirmar"`);
  });
});

/* ============================================================ verificación pública */

function filaPublica(over: Record<string, unknown> = {}) {
  return {
    certificate: {
      id: "cert_1",
      organizationId: "org_1",
      enrollmentId: "enr_1",
      code: "ABCD-1234-EFGH",
      issuedAt: new Date("2026-09-01T12:00:00.000Z"),
      historical: false,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      ...over,
    },
    contact: { firstName: "Ana", lastName: "Pérez" },
    courseName: "AutoCAD",
    cohortName: "AC-12",
    totalHours: "37.50",
  };
}

describe("verifyCertificate — un suspendido no se valida ni dice de quién es", () => {
  it("sin resultado confirmado: `suspendido`, sin alumno, curso ni fechas", async () => {
    selectQueue.push([filaPublica()]);
    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("abcd-1234-efgh");

    expect(pub).toEqual({ code: "ABCD-1234-EFGH", status: "suspendido", valid: false });
    expect(JSON.stringify(pub)).not.toContain("Ana");
    expect(JSON.stringify(pub)).not.toContain("AutoCAD");
  });

  it("confirmado reprobado y todavía sin anular: tampoco vale", async () => {
    confirmados.set("enr_1", "reprobado");
    selectQueue.push([filaPublica()]);
    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("ABCD-1234-EFGH");
    expect(pub).toMatchObject({ status: "suspendido", valid: false });
  });

  it("confirmado aprobado: válido, con los datos de siempre", async () => {
    confirmados.set("enr_1", "aprobado");
    selectQueue.push([filaPublica()]);
    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("ABCD-1234-EFGH");
    expect(pub).toMatchObject({ status: "valido", valid: true, student: "Ana Pérez", course: "AutoCAD" });
  });

  it("2026-10-29 — la emisión histórica ya no tiene excepción: sin confirmar, suspendida", async () => {
    selectQueue.push([filaPublica({ historical: true })]);
    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("ABCD-1234-EFGH");
    expect(pub).toEqual({ code: "ABCD-1234-EFGH", status: "suspendido", valid: false });
  });

  it("2026-10-29 — grupo terminado sin la asistencia completa: NO válido, sin datos personales", async () => {
    confirmados.set("enr_1", "aprobado");
    sinResultado.add("enr_1");
    selectQueue.push([filaPublica()]);
    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("ABCD-1234-EFGH");
    expect(pub).toEqual({ code: "ABCD-1234-EFGH", status: "no_valido", valid: false });
    expect(JSON.stringify(pub)).not.toContain("Ana");
  });

  it("2026-10-29 — si después se completa la asistencia y se confirma aprobado, vuelve a valer", async () => {
    confirmados.set("enr_1", "aprobado"); // sin `sinResultado`: el grupo ya está completo
    selectQueue.push([filaPublica()]);
    const { verifyCertificate } = await import("@/server/certificates");
    const pub = await verifyCertificate("ABCD-1234-EFGH");
    expect(pub).toMatchObject({ status: "valido", valid: true, student: "Ana Pérez" });
  });

  it("la página pública dice «no disponible» / «no válido» y no muestra datos", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/verificar/[code]/page.tsx"), "utf8");
    expect(src).toContain(`cert.status === "suspendido"`);
    expect(src).toContain("no disponible");
    expect(src).toContain(`cert.status === "no_valido"`);
    expect(src).toContain("Certificado no válido");
  });
});

/* ============================================================ descarga */

describe("la descarga del PDF — un suspendido no se entrega a nadie", () => {
  it("2026-10-29 — tampoco el de un grupo sin la asistencia completa (cuenta como anulado)", async () => {
    confirmados.set("enr_1", "aprobado");
    sinResultado.add("enr_1");
    selectQueue.push([{ code: "ABCD-1234-EFGH", enrollmentId: "enr_1", snapshot: null }]);
    const { certificadoDeInscripcion } = await import("@/server/certificate-pdf");
    expect(await certificadoDeInscripcion("org_1", "enr_1")).toBeNull();
  });

  it("por inscripción (staff) y por código (alumno): null, como si no existiera", async () => {
    selectQueue.push([{ code: "ABCD-1234-EFGH", enrollmentId: "enr_1", snapshot: null }]);
    selectQueue.push([{ code: "ABCD-1234-EFGH", enrollmentId: "enr_1", snapshot: null }]);
    const { certificadoDeInscripcion, certificadoDelAlumno } = await import("@/server/certificate-pdf");

    expect(await certificadoDeInscripcion("org_1", "enr_1")).toBeNull();
    expect(await certificadoDelAlumno("org_1", "ct_1", "ABCD-1234-EFGH")).toBeNull();
  });
});
