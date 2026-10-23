import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 046 US6 (T038; FR-019, FR-022) — La migración 0073: importaciones de
 * historial y cursadas históricas, con RLS a mano y re-ejecutable.
 */

const ARCHIVO = path.join(process.cwd(), "drizzle", "0073_historial_importado.sql");
const leer = () => readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");
const TABLAS = ["historical_import_batch", "historical_course_taking"] as const;

describe("0073 — historial importado", () => {
  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0073_historial_importado.sql").toBe(true);
  });

  it.each(TABLAS)("crea «%s» con `if not exists`, RLS y `tenant_isolation`", (tabla) => {
    const sql = leer();
    expect(sql).toMatch(new RegExp(`create table if not exists "${tabla}"`));
    expect(sql).toContain(`alter table "${tabla}" enable row level security;`);
    expect(sql).toContain(`drop policy if exists tenant_isolation on "${tabla}";`);
    expect(sql).toMatch(
      new RegExp(
        `create policy tenant_isolation on "${tabla}"\\s+using \\(organization_id = current_setting\\('app\\.current_org', true\\)\\)\\s+with check \\(organization_id = current_setting\\('app\\.current_org', true\\)\\)`
      )
    );
  });

  it("toda FK y todo CHECK van dentro de `do $$` contra `pg_constraint`", () => {
    const sql = leer();
    const constraints = [...sql.matchAll(/add constraint "([a-z0-9_]+)"/g)].map((m) => m[1]!);
    expect(constraints.length).toBeGreaterThanOrEqual(10);
    for (const nombre of constraints) expect(sql).toContain(`conname = '${nombre}'`);
    expect(sql.replace(/do \$\$[\s\S]*?end \$\$;/g, "")).not.toMatch(/add constraint/);
  });

  it("el estado de la importación es cerrado", () => {
    expect(leer()).toMatch(/"status" in \('aplicando', 'aplicada', 'deshecha'\)/);
  });

  it("una cursada histórica no se repite (dedup por organización)", () => {
    expect(leer()).toMatch(
      /create unique index if not exists "historical_course_taking_org_dedup_uq"\s+on "historical_course_taking"[^;]*\("organization_id", "dedup_key"\)/
    );
  });

  it("todo índice lleva `if not exists`", () => {
    const indices = [...leer().matchAll(/create (unique )?index (if not exists )?"/g)];
    expect(indices.length).toBeGreaterThanOrEqual(4);
    expect(indices.every((m) => m[2])).toBe(true);
  });

  it.each([
    ["historical_course_taking", "contact_id", "contact", "cascade"],
    ["historical_course_taking", "course_id", "course", "set null"],
    ["historical_course_taking", "company_id", "company", "set null"],
    ["historical_course_taking", "seller_id", "seller", "set null"],
    ["historical_course_taking", "batch_id", "historical_import_batch", "cascade"],
    ["historical_import_batch", "imported_by", "user", "set null"],
  ])("FK %s.%s → %s con `on delete %s`", (tabla, columna, destino, accion) => {
    expect(leer()).toMatch(
      new RegExp(
        `alter table "${tabla}" add constraint "[a-z0-9_]+"\\s+foreign key \\("${columna}"\\) references "public"\\."${destino}"\\("id"\\) on delete ${accion}`
      )
    );
  });

  it("`historial.importar` solo a Dirección, por llave y sin repetir", () => {
    const sql = leer();
    const updates = [...sql.matchAll(/update "role"[\s\S]*?;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain(`jsonb_build_array('historial.importar')`);
    expect(updates[0]).toContain(`where "key" = 'direccion'`);
    expect(updates[0]).toMatch(/not \("capabilities" @> jsonb_build_array\('historial\.importar'\)\)/);
  });
});
