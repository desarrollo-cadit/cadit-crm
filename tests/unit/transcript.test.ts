import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 031 (T038, DV-011) — Las lecturas de la escolaridad.
 *
 * Doble de base por TABLA, igual que `correcciones.test.ts`: cada consulta toma
 * la siguiente respuesta de la tabla de su `from(...)`. El armado y el
 * documento los prueba `escolaridad.test.ts`; acá se mira qué se LEE y qué se
 * le pasa al armado puro.
 */

const colas = new Map<string, unknown[][]>();
const tablasLeidas: string[] = [];

function responder(table: string, filas: unknown[]) {
  colas.set(table, [...(colas.get(table) ?? []), filas]);
}

function cadena(): Record<string, unknown> {
  let tabla = "";
  const chain: Record<string, unknown> = {};
  chain.from = (t: unknown) => {
    tabla = String(t);
    tablasLeidas.push(tabla);
    return chain;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "orderBy", "limit"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(colas.get(tabla)?.shift() ?? []).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => cadena() }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) => {
              if (col === "toString" || col === Symbol.toPrimitive) return () => String(tableName);
              if (typeof col === "symbol") return undefined;
              return `${String(tableName)}.${col}`;
            },
          }
        ),
    }
  ),
}));

const { escolaridadDeContacto } = await import("@/server/transcript");

beforeEach(() => {
  colas.clear();
  tablasLeidas.length = 0;
});

const ORG = "org_1";

const COHORTE = {
  id: "coh_1",
  name: "Revit 2026",
  startDate: new Date("2026-03-01T00:00:00.000Z"),
  endDate: new Date("2026-06-30T00:00:00.000Z"),
  minAttendancePct: 75,
  position: null,
};
const CURSO = { name: "Revit", minAttendancePct: null };
const INSCRIPCION = {
  id: "enr_1",
  parentEnrollmentId: null,
  enrolledAt: new Date("2026-02-20T00:00:00.000Z"),
  attendanceWaiverAt: null,
  attendanceWaiverReason: null,
  attendanceWaiverRevokedAt: null,
};

describe("escolaridadDeContacto", () => {
  it("un contacto que no existe (u otra organización) es null", async () => {
    expect(await escolaridadDeContacto(ORG, "ct_x")).toBeNull();
  });

  it("arma la cursada con el resultado OFICIAL, la nota y la asistencia del legajo", async () => {
    responder("contact", [{ firstName: "Ana", lastName: "Pérez", nationalId: "1.234.567-8" }]);
    responder("organization", [{ name: "CAD IT", timezone: "America/Montevideo" }]);
    responder("enrollment", [
      { enrollment: INSCRIPCION, cohort: COHORTE, course: CURSO, waiverAuthor: null },
    ]);
    responder("attendance", [
      { enrollmentId: "enr_1", classSessionId: "cls_1", status: "presente" },
      { enrollmentId: "enr_1", classSessionId: "cls_2", status: "ausente" },
    ]);
    responder("classSession", [
      { id: "cls_1", cohortId: "coh_1", date: new Date("2026-03-02T00:00:00.000Z"), canceledAt: null },
      { id: "cls_2", cohortId: "coh_1", date: new Date("2026-03-04T00:00:00.000Z"), canceledAt: null },
    ]);
    responder("assessment", [
      { id: "asm_1", cohortId: "coh_1", name: "Trabajo final", required: true, scale: "numeric", position: 0 },
      { id: "asm_2", cohortId: "coh_1", name: "Parcial", required: true, scale: "pass_fail", position: 1 },
    ]);
    responder("assessmentResult", [
      { assessmentId: "asm_1", enrollmentId: "enr_1", passed: true, score: 80 },
    ]);

    const r = await escolaridadDeContacto(ORG, "ct_1");

    expect(r?.timezone).toBe("America/Montevideo");
    expect(r?.escolaridad.alumno).toEqual({ nombre: "Ana Pérez", documento: "1.234.567-8" });
    expect(r?.escolaridad.academia).toBe("CAD IT");
    const c = r!.escolaridad.cursadas[0]!;
    expect(c).toMatchObject({ curso: "Revit", cohorte: "Revit 2026", asistenciaPct: 50 });
    expect(c.evaluaciones).toEqual([
      { nombre: "Trabajo final", obligatoria: true, escala: "numeric", nota: 80, aprobada: true },
      { nombre: "Parcial", obligatoria: true, escala: "pass_fail", nota: null, aprobada: null },
    ]);
    // Asistencia 50% con mínimo 75 → no aprobado; el parcial pendiente no lo salva.
    expect(c.estado).toBe("reprobado");
  });

  it("sin marcas de asistencia el porcentaje es null, no 0%", async () => {
    responder("contact", [{ firstName: "Ana", lastName: null, nationalId: null }]);
    responder("organization", [{ name: "CAD IT", timezone: "America/Montevideo" }]);
    responder("enrollment", [
      { enrollment: INSCRIPCION, cohort: COHORTE, course: CURSO, waiverAuthor: null },
    ]);
    responder("attendance", []);
    responder("classSession", [
      { id: "cls_1", cohortId: "coh_1", date: new Date("2026-03-02T00:00:00.000Z"), canceledAt: null },
    ]);

    const r = await escolaridadDeContacto(ORG, "ct_1");
    expect(r!.escolaridad.cursadas[0]!.asistenciaPct).toBeNull();
    expect(r!.escolaridad.cursadas[0]!.estado).toBe("sin_datos");
  });

  it("no lee cobranza: ni cuotas ni pagos", async () => {
    responder("contact", [{ firstName: "Ana", lastName: null, nationalId: null }]);
    responder("organization", [{ name: "CAD IT", timezone: "UTC" }]);
    responder("enrollment", []);
    await escolaridadDeContacto(ORG, "ct_1");
    for (const t of tablasLeidas) expect(t).not.toMatch(/installment|payment|charge/i);
  });
});

describe("031 — la forma del módulo", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "server", "transcript.ts"), "utf8");

  it("no importa el legajo (trae teléfono y estado de cuenta)", () => {
    expect(src).not.toMatch(/from\s+"@\/server\/student-record"/);
  });

  it("la asistencia sale de la misma función que usa el legajo", () => {
    expect(src).toMatch(/attendancePercentage\(/);
  });

  it("no consulta tablas de cobranza ni columnas de contacto", () => {
    expect(src).not.toMatch(/schema\.(installment|payment)/);
    expect(src).not.toMatch(/contact\.(phone|email)/);
  });

  it("el armado es el puro: no decide estados por su cuenta", () => {
    expect(src).toMatch(/armarEscolaridad\(/);
    expect(src).not.toMatch(/approvalState\(|estadoDeModulo\(/);
  });
});

describe("031 — las dos puertas de la escolaridad (T039/T040)", () => {
  const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", "app", "api", ...p), "utf8");

  it("staff: `academico.ver`, solo GET, HTML del armado común", () => {
    const src = leer("contacts", "[id]", "escolaridad", "print", "route.ts");
    expect(src).toMatch(/requireCapability\(\s*"academico\.ver"/);
    expect(src).not.toContain("requireStudentPortal(");
    expect([...src.matchAll(/export const (\w+)\s*=/g)].map((m) => m[1]).filter((v) => v !== "dynamic")).toEqual(["GET"]);
    expect(src).toContain("escolaridadDeContacto(");
    expect(src).toContain("renderEscolaridadHtml(");
    expect(src).toContain("text/html; charset=utf-8");
  });

  it("alumno: su puerta, solo GET, y el contacto sale de la SESIÓN", () => {
    const src = leer("portal", "me", "escolaridad", "print", "route.ts");
    expect(src).toContain("requireStudentPortal(");
    expect(src).not.toContain("requireCapability(");
    expect(src).not.toContain("requireTeacherPortal(");
    expect([...src.matchAll(/export const (\w+)\s*=/g)].map((m) => m[1]).filter((v) => v !== "dynamic")).toEqual(["GET"]);
    expect(src).toMatch(/escolaridadDeContacto\(\s*ctx\.organizationId,\s*ctx\.contactId\s*\)/);
    expect(src).toContain("renderEscolaridadHtml(");
  });
});

describe("031 — dónde se abre la escolaridad (T041/T042)", () => {
  const leer = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");

  it("el legajo la enlaza, y solo con `academico.ver` (la capacidad de la ruta)", () => {
    expect(leer("components", "contacts", "student-record-client.tsx")).toMatch(
      /`\/api\/contacts\/\$\{contactId\}\/escolaridad\/print`/
    );
    expect(leer("app", "(app)", "contacts", "[id]", "legajo", "page.tsx")).toMatch(
      /caps\.includes\("academico\.ver"\)/
    );
  });

  it("el portal del alumno tiene la tarjeta «Mi escolaridad»", () => {
    const src = leer("components", "portal", "student-dashboard.tsx");
    expect(src).toContain("Mi escolaridad");
    expect(src).toContain('"/api/portal/me/escolaridad/print"');
  });
});
