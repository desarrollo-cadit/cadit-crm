import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0090 — Licencias de PROFESORES. `license` cuelga de una inscripción O de un
 * profesor; la de un profesor descuenta del cupo de su equipo, no la libera
 * ninguna fecha de curso, y los flujos del grupo (que solo conocen
 * inscripciones) ni la ven. El portal del profesor no la muestra.
 */

const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
const updates: { table: unknown; set: Record<string, unknown> }[] = [];
const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
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
    execute: async () => [],
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { returning: () => Promise.resolve([{ ...values }]) };
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "lic_updated", ...set }]),
          }),
        };
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
  inserts.length = 0;
  updates.length = 0;
  selectQueue.length = 0;
});

const TERMINADA = new Date("2020-01-01T00:00:00.000Z");
const VIVA = new Date("2099-12-31T00:00:00.000Z");

/** Una licencia de un alumno en un curso EN CURSO: ocupa. */
const alumno = (softwareId = "sw_1") => ({
  softwareId,
  teamId: "team_uy",
  teacherId: null,
  assigned: true,
  expiresAt: null,
  startDate: TERMINADA,
  endDate: VIVA,
});
/** Una licencia de profesor: sin inscripción ni cohorte (el leftJoin trae fechas nulas). */
const profesor = (over: Record<string, unknown> = {}) => ({
  softwareId: "sw_1",
  teamId: "team_uy",
  teacherId: "tch_1",
  assigned: true,
  expiresAt: null,
  startDate: null,
  endDate: null,
  ...over,
});

describe("el stock cuenta las licencias de profesores", () => {
  it("una de profesor, sin fechas de curso, ocupa un asiento del equipo", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    selectQueue.push([{ name: "Revit", total: 5 }], [alumno(), profesor(), profesor({ teacherId: "tch_2" })]);
    expect(await availableLicenses("org_1", "sw_1", "team_uy")).toMatchObject({
      total: 5,
      assignedCount: 3,
      available: 2,
    });
  });

  it("nunca la libera la falta de fechas: solo desasignarla o que venza", async () => {
    const { contarOcupadas } = await import("@/server/licenses");
    selectQueue.push([
      profesor(),
      profesor({ teacherId: "tch_2", assigned: false }),
      profesor({ teacherId: "tch_3", expiresAt: new Date("2020-06-01T00:00:00.000Z") }),
    ]);
    expect((await contarOcupadas("org_1", "sw_1")).get("sw_1")).toBe(1);
  });

  it("la de un alumno de un curso terminado sigue liberándose (la regla no cambió)", async () => {
    const { contarOcupadas } = await import("@/server/licenses");
    selectQueue.push([{ ...alumno(), endDate: TERMINADA }, profesor()]);
    expect((await contarOcupadas("org_1", "sw_1")).get("sw_1")).toBe(1);
  });
});

describe("assignTeacherLicense", () => {
  const equipo = { id: "team_uy", name: "Uruguay ATC", archivedAt: null };

  it("descuenta del equipo elegido y no guarda inscripción", async () => {
    const { assignTeacherLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "tch_1" }], // profesor
      [equipo], // equipo
      [{ name: "Revit", total: 3 }], // cupo del equipo
      [alumno()], // ocupadas
      [] // sin licencia previa del profesor
    );
    const result = await assignTeacherLicense("org_1", "tch_1", "sw_1", "team_uy");
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({
      teacherId: "tch_1",
      softwareId: "sw_1",
      teamId: "team_uy",
      assigned: true,
      source: "individual",
    });
    expect(inserts[0]!.values).not.toHaveProperty("enrollmentId");
  });

  it("sin cupo libre en ESE equipo: 409 no_stock que nombra el equipo", async () => {
    const { assignTeacherLicense } = await import("@/server/licenses");
    selectQueue.push([{ id: "tch_1" }], [equipo], [{ name: "Revit", total: 2 }], [alumno(), profesor()], []);
    const result = await assignTeacherLicense("org_1", "tch_1", "sw_1", "team_uy");
    expect(result).toMatchObject({ ok: false, status: 409, code: "no_stock" });
    expect(result.ok ? "" : result.message).toContain("Uruguay ATC");
    expect(inserts).toHaveLength(0);
  });

  it("el mismo programa desde el mismo equipo es idempotente: no descuenta de nuevo", async () => {
    const { assignTeacherLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "tch_1" }],
      [equipo],
      [{ name: "Revit", total: 1 }],
      [profesor()],
      [{ id: "lic_1", teacherId: "tch_1", softwareId: "sw_1", teamId: "team_uy", assigned: true }]
    );
    const result = await assignTeacherLicense("org_1", "tch_1", "sw_1", "team_uy");
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("profesor inexistente → 404; equipo archivado → 422", async () => {
    const { assignTeacherLicense } = await import("@/server/licenses");
    selectQueue.push([]);
    expect(await assignTeacherLicense("org_1", "tch_x", "sw_1", "team_uy")).toMatchObject({
      ok: false,
      status: 404,
    });
    selectQueue.push([{ id: "tch_1" }], [{ ...equipo, archivedAt: new Date() }]);
    expect(await assignTeacherLicense("org_1", "tch_1", "sw_1", "team_uy")).toMatchObject({
      ok: false,
      status: 422,
    });
  });

  it("un profesor sin correo la puede tener igual (el correo solo sirve para conciliar)", async () => {
    const { assignTeacherLicense } = await import("@/server/licenses");
    // La función no lee el correo del profesor: solo que exista.
    selectQueue.push([{ id: "tch_1" }], [equipo], [{ name: "Revit", total: 1 }], [], []);
    expect((await assignTeacherLicense("org_1", "tch_1", "sw_1", "team_uy")).ok).toBe(true);
  });
});

describe("unassignTeacherLicense", () => {
  it("libera la asignada (vuelve al stock) y es idempotente", async () => {
    const { unassignTeacherLicense } = await import("@/server/licenses");
    const result = await unassignTeacherLicense("org_1", "tch_1", "sw_1");
    expect(result.ok).toBe(true);
    expect(updates[0]!.set).toMatchObject({ assigned: false, assignedAt: null });
  });
});

/* ---------------------------------------------------------------- */
/* Estructura: lo que los mocks de la base no prueban                */
/* ---------------------------------------------------------------- */

const ROOT = process.cwd();
const leer = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

describe("migración 0090 y esquema", () => {
  const sql = leer("drizzle", "0090_licencias_de_profesores.sql");

  it("la licencia cuelga de una inscripción O de un profesor, exactamente uno", () => {
    expect(sql).toContain('alter column "enrollment_id" drop not null');
    expect(sql).toContain('num_nonnulls("license"."enrollment_id", "license"."teacher_id") = 1');
    expect(sql).toContain('"license_teacher_software_uq"');
    expect(leer("src", "lib", "db", "schema.ts")).toContain("license_un_titular");
  });

  it("es re-ejecutable", () => {
    expect(sql).toContain('add column if not exists "teacher_id"');
    expect(sql).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'license_un_titular'\)/);
    expect(sql).toMatch(/create unique index if not exists "license_teacher_software_uq"/);
    expect(sql).not.toMatch(/\bdrop (table|column)\b/i);
  });

  it("no toca RLS: la tabla ya tenía tenant_isolation", () => {
    expect(sql).not.toMatch(/row level security|create policy/i);
  });
});

describe("las rutas declaran su capacidad", () => {
  const ruta = leer("src", "app", "api", "teachers", "[id]", "license", "route.ts");

  it("leer es academico.ver; asignar y quitar, licencias.gestionar", () => {
    expect(ruta).toMatch(/GET = requireCapability\(\s*"academico\.ver"/);
    expect(ruta).toMatch(/PUT = requireCapability\(\s*"licencias\.gestionar"/);
    expect(ruta).toMatch(/DELETE = requireCapability\(\s*"licencias\.gestionar"/);
  });

  it("asignar pide el equipo (teamId obligatorio)", () => {
    expect(ruta).toMatch(/teamId: z\.string\(\)\.min\(1\)/);
  });

  it("mover de equipo: el programa es academico.editar, una licencia suelta licencias.gestionar", () => {
    expect(leer("src", "app", "api", "license-teams", "[id]", "move-program", "route.ts")).toMatch(
      /POST = requireCapability\(\s*"academico\.editar"/
    );
    expect(leer("src", "app", "api", "licenses", "[id]", "team", "route.ts")).toMatch(
      /PUT = requireCapability\(\s*"licencias\.gestionar"/
    );
  });
});

describe("las licencias de profesores no llegan donde no deben", () => {
  it("el portal del profesor no importa ni nombra nada de licencias", () => {
    const portal = [
      path.join(ROOT, "src", "server", "teacher-portal.ts"),
      path.join(ROOT, "src", "lib", "portal-api.ts"),
      ...archivos(path.join(ROOT, "src", "app", "api", "portal")),
    ];
    for (const f of portal) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/@\/server\/licenses|listTeacherLicenses|schema\.license\b/);
    }
  });

  it("los flujos del grupo solo leen licencias de inscripciones (join con la inscripción)", () => {
    const grupo = leer("src", "server", "group-licenses.ts");
    expect(grupo).toMatch(
      /\.from\(schema\.license\)\s*\.innerJoin\(schema\.enrollment, eq\(schema\.license\.enrollmentId, schema\.enrollment\.id\)\)/
    );
    expect(grupo).not.toContain("teacherId");
  });
});
