import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 038 — Emisión: la fecha de fin (FR-008), "Emitir a todos" (FR-009/FR-010),
 * los módulos que certifican (FR-014) y las puertas de la descarga
 * (FR-015/FR-016).
 *
 * Mismo doble de base posicional que `especializaciones-certificados.test.ts`.
 */

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
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => (typeof col === "symbol" ? undefined : `${String(tableName)}.${col}`) }),
    }
  ),
}));

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  vi.resetModules();
});

const AHORA = new Date("2026-10-16T15:00:00.000Z");

function inscripcion(over: Record<string, unknown> = {}) {
  return {
    id: "enr_1",
    cohortId: "coh_1",
    grantsCertificate: true,
    cohortEndDate: new Date("2026-11-20T00:00:00.000Z"),
    attendanceWaiverAt: null,
    attendanceWaiverReason: null,
    attendanceWaiverRevokedAt: null,
    ...over,
  };
}

describe("FR-008 — no se emite antes de que la cursada termine", () => {
  it("una cohorte que no terminó responde 422 con la fecha de fin, y no escribe", async () => {
    selectQueue.push([inscripcion()]);
    selectQueue.push([]); // no hay certificado previo
    selectQueue.push([]); // no es madre

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1", { now: AHORA });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.code).toBe("cursada_no_terminada");
      expect(r.message).toContain("20/11/2026");
    }
    expect(inserts).toHaveLength(0);
  });

  it("sin fecha de fin tampoco: no se puede afirmar que terminó", async () => {
    selectQueue.push([inscripcion({ cohortEndDate: null })]);
    selectQueue.push([]);
    selectQueue.push([]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1", { now: AHORA });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("fecha de fin");
    expect(inserts).toHaveLength(0);
  });

  it("la histórica sin fecha de fin pasa (cohortes anteriores al sistema)", async () => {
    selectQueue.push([inscripcion({ cohortEndDate: null })]);
    selectQueue.push([]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1", { now: AHORA, historical: true });

    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
  });

  it("la histórica con fecha FUTURA no pasa: una cohorte en curso no es vieja", async () => {
    selectQueue.push([inscripcion()]);
    selectQueue.push([]);

    const { issueCertificate } = await import("@/server/certificates");
    const r = await issueCertificate("org_1", "enr_1", { now: AHORA, historical: true });

    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe("emitirATodos (FR-009) — una sola acción, con el resultado de cada uno", () => {
  it("lista a cada alumno con su estado: ya emitido o no terminado, sin duplicar", async () => {
    selectQueue.push([{ id: "coh_1", isSpecialization: false }]);
    selectQueue.push([
      { id: "enr_1", firstName: "Ana", lastName: "Pérez", courseName: "Revit", cohortName: "Revit 42" },
      { id: "enr_2", firstName: "Beto", lastName: null, courseName: "Revit", cohortName: "Revit 42" },
    ]);
    // Ana: la cursada no terminó.
    selectQueue.push([inscripcion()]);
    selectQueue.push([]);
    selectQueue.push([]);
    // Beto: ya tenía su certificado (FR-007).
    selectQueue.push([inscripcion({ id: "enr_2", cohortEndDate: new Date("2026-01-01") })]);
    selectQueue.push([
      {
        id: "cert_2",
        code: "ABCD",
        issuedAt: new Date("2026-02-01"),
        attendancePct: 90,
        historical: false,
        revokedAt: null,
        revokeReason: null,
      },
    ]);

    const { emitirATodos } = await import("@/server/certificates");
    const r = await emitirATodos("org_1", "coh_1", { now: AHORA });

    expect(r).toEqual([
      expect.objectContaining({ alumno: "Ana Pérez", certificado: "Revit 42", estado: "no_terminado" }),
      expect.objectContaining({ alumno: "Beto", estado: "ya_emitido", motivo: null }),
    ]);
    expect(inserts).toHaveLength(0);
  });

  it("una cohorte ajena o inexistente es null (la ruta responde 404)", async () => {
    selectQueue.push([]);
    const { emitirATodos } = await import("@/server/certificates");
    expect(await emitirATodos("org_1", "coh_x")).toBeNull();
  });
});

/* ============================================================
 * Guardas estructurales
 * ============================================================ */

const ROOT = process.cwd();
const leer = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
/** Sin comentarios: la regla se rompe con código, no con la prosa que la explica. */
const codigo = (f: string) =>
  leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("FR-014 — los módulos otorgan certificado", () => {
  it("la migración enciende SOLO los cursos de tipo módulo, y es re-ejecutable", () => {
    const sql = leer("drizzle/0059_certificados_pdf.sql").replace(/^--.*$/gm, "");
    expect(sql).toMatch(/update "course" set "grants_certificate" = true/i);
    expect(sql).toMatch(/where "kind" = 'modulo' and "grants_certificate" = false/i);
    expect(sql).not.toMatch(/'curso'|'taller'/);
    expect(sql).toMatch(/add column if not exists "snapshot" jsonb/i);
    expect(sql).toMatch(/add column if not exists "certificate_description" text/i);
  });

  it('"Módulo nuevo" crea el curso otorgando certificado', () => {
    const cuerpo = leer("src/server/courses.ts").split("export async function createModuloConCursoPropio")[1]!;
    expect(cuerpo.slice(0, 1500)).toMatch(/kind: "modulo",\s*grantsCertificate: true,/);
  });
});

describe("FR-015/FR-016 — las puertas de la descarga", () => {
  it("el alumno descarga por su puerta, sin 403, y lo ajeno es 404", () => {
    const ruta = leer("src/app/api/portal/me/certificados/[code]/pdf/route.ts");
    expect(ruta).toContain("requireStudentPortal");
    expect(ruta).not.toContain("requireCapability");
    expect(codigo("src/app/api/portal/me/certificados/[code]/pdf/route.ts")).not.toMatch(/\b403\b/);
    expect(ruta).toContain("ctx.contactId");
  });

  it("el staff descarga con capacidad; la emisión masiva exige certificados.emitir", () => {
    expect(leer("src/app/api/certificates/[code]/pdf/route.ts")).toContain('"contactos.ver"');
    expect(leer("src/app/api/enrollments/[id]/certificate/print/route.ts")).toContain(
      '"evaluacion.ver"'
    );
    expect(leer("src/app/api/cohorts/[id]/certificates/route.ts")).toContain(
      '"certificados.emitir"'
    );
  });

  it("un anulado no se descarga: la lectura filtra revoked_at en el WHERE", () => {
    const srv = leer("src/server/certificate-pdf.ts");
    expect(srv).toContain("isNull(schema.certificate.revokedAt)");
    expect(codigo("src/server/certificate-pdf.ts")).not.toMatch(/\b403\b/);
  });
});
