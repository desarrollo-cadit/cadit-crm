import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cuposSchema, equipoEdicionSchema, equipoNuevoSchema } from "@/lib/license-team";

/**
 * 0089 — Licencias por equipo. Lo que no se prueba con los mocks de la base:
 * que asignar sin equipo sea 422 en las DOS puertas, que la migración deje
 * todo lo existente en «Sin asignar» sin tocar el stock de nadie, y que las
 * rutas nuevas declaren su capacidad.
 */

const ROOT = process.cwd();
const leer = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

describe("teamId es obligatorio al asignar (422)", () => {
  const rutas = [
    ["src", "app", "api", "enrollments", "[id]", "license", "route.ts"],
    ["src", "app", "api", "cohorts", "[id]", "group-licenses", "route.ts"],
  ];

  it.each(rutas)("%s/%s/%s/%s/%s/%s: el esquema pide teamId no vacío", (...p) => {
    const src = leer(...p);
    expect(src).toMatch(/teamId: z\.string\(\)\.min\(1\)/);
    // Sin `.optional()`: un pedido sin equipo no llega al servidor.
    expect(src).not.toMatch(/teamId: z\.string\(\)[^\n]*optional/);
  });

  it("un cuerpo sin teamId no valida (parseBody lo convierte en 422)", () => {
    const esquema = z.object({ softwareId: z.string().min(1), teamId: z.string().min(1) });
    expect(esquema.safeParse({ softwareId: "sw_1" }).success).toBe(false);
    expect(esquema.safeParse({ softwareId: "sw_1", teamId: "" }).success).toBe(false);
    expect(esquema.safeParse({ softwareId: "sw_1", teamId: "ltm_1" }).success).toBe(true);
  });

  it("el servidor valida que el equipo sea de la organización y esté activo", () => {
    const licenses = leer("src", "server", "licenses.ts");
    const grupo = leer("src", "server", "group-licenses.ts");
    for (const src of [licenses, grupo]) {
      expect(src).toContain("buscarEquipo(organizationId, teamId)");
      expect(src).toContain("MENSAJE_EQUIPO_INEXISTENTE");
    }
    // Antes de tomar el candado del stock: un equipo ajeno no espera en fila.
    expect(licenses.indexOf("buscarEquipo(organizationId, teamId)")).toBeLessThan(
      licenses.indexOf("await bloquearStock(organizationId, [{ teamId, softwareId }])")
    );
  });
});

describe("las rutas de equipos declaran capacidad", () => {
  it("GET con academico.ver; alta, edición y cupos con academico.editar", () => {
    const coleccion = leer("src", "app", "api", "license-teams", "route.ts");
    expect(coleccion).toMatch(/GET = requireCapability\("academico\.ver"/);
    expect(coleccion).toMatch(/POST = requireCapability\("academico\.editar"/);
    expect(leer("src", "app", "api", "license-teams", "[id]", "route.ts")).toMatch(
      /PATCH = requireCapability\(\s*"academico\.editar"/
    );
    expect(leer("src", "app", "api", "license-teams", "[id]", "seats", "route.ts")).toMatch(
      /PUT = requireCapability\(\s*"academico\.editar"/
    );
  });

  it("los esquemas rechazan lo inválido", () => {
    expect(equipoNuevoSchema.safeParse({}).success).toBe(false);
    expect(equipoEdicionSchema.safeParse({ archived: true }).success).toBe(true);
    expect(cuposSchema.safeParse({ seats: [{ softwareId: "sw", total: -3 }] }).success).toBe(false);
  });
});

describe("migración 0089", () => {
  const sql = leer("drizzle", "0089_licencias_por_equipo.sql");

  it("crea «Sin asignar» por organización con programas, solo si no tiene equipos", () => {
    expect(sql).toContain("'Sin asignar'");
    expect(sql).toMatch(/where exists \(select 1 from "software"/);
    expect(sql).toMatch(/not exists \(select 1 from "license_team"/);
  });

  it("el cupo de hoy (software.total_licenses) pasa a ese equipo sin pisar lo editado", () => {
    expect(sql).toMatch(/insert into "license_team_seat"[\s\S]*"total_licenses"/);
    expect(sql).toContain('on conflict ("team_id", "software_id") do nothing');
  });

  it("toda licencia y todo programa de grupo existente queda en el equipo, y recién ahí es NOT NULL", () => {
    const licencias = sql.indexOf('update "license" l');
    const grupos = sql.indexOf('update "cohort_group_software" g');
    const notNull = sql.indexOf('alter table "license" alter column "team_id" set not null');
    expect(licencias).toBeGreaterThan(-1);
    expect(grupos).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(Math.max(licencias, grupos));
    expect(sql).toContain('alter table "cohort_group_software" alter column "team_id" set not null');
  });

  it("las dos tablas nuevas nacen con RLS y tenant_isolation", () => {
    for (const t of ["license_team", "license_team_seat"]) {
      expect(sql).toContain(`alter table "${t}" enable row level security`);
      expect(sql).toMatch(new RegExp(`create policy tenant_isolation on "${t}"`));
    }
  });

  it("es re-ejecutable: sin CREATE sueltos ni ALTER ADD sin guarda", () => {
    expect(sql).not.toMatch(/^create table "/im);
    expect(sql).not.toMatch(/^alter table "[a-z_]+" add column "/im);
    expect(sql).not.toMatch(/^create (unique )?index "/im);
  });
});
