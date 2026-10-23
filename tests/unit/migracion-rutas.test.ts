import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 046 (T001; FR-005, FR-013) — La migración 0072: la tabla de rutas entre
 * cursos, con su RLS escrita a mano y re-ejecutable (constitución IV).
 */

const ARCHIVO = path.join(process.cwd(), "drizzle", "0072_rutas_entre_cursos.sql");
const leer = () => readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");

describe("0072 — rutas entre cursos", () => {
  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0072_rutas_entre_cursos.sql").toBe(true);
  });

  it("crea `course_route` con `if not exists`", () => {
    expect(leer()).toMatch(/create table if not exists "course_route"/);
    expect(leer()).not.toMatch(/create table "course_route"/);
  });

  it("nace con RLS y `tenant_isolation`", () => {
    const sql = leer();
    expect(sql).toContain(`alter table "course_route" enable row level security;`);
    expect(sql).toContain(`drop policy if exists tenant_isolation on "course_route";`);
    expect(sql).toMatch(
      /create policy tenant_isolation on "course_route"\s+using \(organization_id = current_setting\('app\.current_org', true\)\)\s+with check \(organization_id = current_setting\('app\.current_org', true\)\)/
    );
  });

  it("un curso no se sigue a sí mismo (CHECK)", () => {
    expect(leer()).toMatch(
      /add constraint "course_route_no_self"\s+check \("from_course_id" <> "to_course_id"\)/
    );
  });

  it("toda FK y todo CHECK van dentro de `do $$` contra `pg_constraint`", () => {
    const sql = leer();
    const constraints = [...sql.matchAll(/add constraint "([a-z0-9_]+)"/g)].map((m) => m[1]!);
    expect(constraints.length).toBeGreaterThanOrEqual(5);
    for (const nombre of constraints) {
      expect(sql, `«${nombre}» sin guarda`).toContain(`conname = '${nombre}'`);
    }
    const fuera = sql.replace(/do \$\$[\s\S]*?end \$\$;/g, "");
    expect(fuera).not.toMatch(/add constraint/);
  });

  it.each([
    ["from_course_id", "course", "cascade"],
    ["to_course_id", "course", "cascade"],
    ["organization_id", "organization", "cascade"],
    ["created_by", "user", "set null"],
  ])("FK %s → %s con `on delete %s`", (columna, destino, accion) => {
    expect(leer()).toMatch(
      new RegExp(
        `alter table "course_route" add constraint "[a-z0-9_]+"\\s+foreign key \\("${columna}"\\) references "public"\\."${destino}"\\("id"\\) on delete ${accion}`
      )
    );
  });

  it("índices org-first con `if not exists`, y sin repetidos por origen", () => {
    const sql = leer();
    const indices = [...sql.matchAll(/create (unique )?index (if not exists )?"/g)];
    expect(indices.length).toBeGreaterThanOrEqual(2);
    expect(indices.every((m) => m[2])).toBe(true);
    expect(sql).toMatch(
      /create unique index if not exists "course_route_org_from_to_uq"\s+on "course_route"[^;]*\("organization_id", "from_course_id", "to_course_id"\)/
    );
    expect(sql).toMatch(
      /create index if not exists "course_route_org_from_pos_idx"\s+on "course_route"[^;]*\("organization_id", "from_course_id", "position"\)/
    );
  });
});
