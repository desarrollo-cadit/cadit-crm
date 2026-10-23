import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 046 US8 (T064; FR-026, FR-029, FR-030) — La migración 0074: las banderas
 * "Gratuito" y "Excluir de los reportes", y `reportes.ver` solo a Dirección y
 * Coordinación. Re-ejecutable.
 */

const ARCHIVO = path.join(process.cwd(), "drizzle", "0074_reportes.sql");
const leer = () => readFileSync(ARCHIVO, "utf8").replace(/\r\n/g, "\n");

describe("0074 — reportes", () => {
  it("existe", () => {
    expect(existsSync(ARCHIVO), "falta drizzle/0074_reportes.sql").toBe(true);
  });

  it.each([
    ["course", "is_free"],
    ["company", "exclude_from_reports"],
  ])("%s.%s: booleano, NOT NULL, default false, `if not exists`", (tabla, columna) => {
    expect(leer()).toMatch(
      new RegExp(`alter table "${tabla}" add column if not exists "${columna}" boolean default false not null;`)
    );
  });

  it("`reportes.ver` solo a direccion y coordinacion, por llave y sin repetir", () => {
    const updates = [...leer().matchAll(/update "role"[\s\S]*?;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(2);
    const llaves = updates.map((u) => /where "key" = '([a-z]+)'/.exec(u)?.[1]).sort();
    expect(llaves).toEqual(["coordinacion", "direccion"]);
    for (const u of updates) {
      expect(u).toContain(`jsonb_build_array('reportes.ver')`);
      expect(u).toMatch(/not \("capabilities" @> jsonb_build_array\('reportes\.ver'\)\)/);
    }
  });
});
