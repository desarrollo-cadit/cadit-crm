import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

/**
 * 0067 — montos a centésimos. La migración multiplica por 100: si se
 * re-ejecuta sin guard, los montos quedan ×10.000. El TIPO de la columna es
 * la marca, así que cada `alter` tiene que estar detrás de su propio
 * `data_type = 'integer'`, y todo en un único bloque `do $$` (atómico).
 */
const sql = readFileSync(join(process.cwd(), "drizzle", "0067_montos_en_centesimos.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const COLUMNAS: [tabla: string, columna: string][] = [
  ["teacher", "hourly_rate"],
  ["course", "list_price"],
  ["cohort", "cost"],
  ["enrollment", "amount"],
  ["workshop_registration", "amount"],
  ["installment", "amount"],
  ["payment", "amount"],
];

describe("0067_montos_en_centesimos", () => {
  it("un solo bloque do $$ y ningún alter fuera de él", () => {
    expect(codigo.match(/do \$\$/g)).toHaveLength(1);
    const fuera = codigo.replace(/do \$\$[\s\S]*?end \$\$;/, "");
    expect(fuera).not.toMatch(/alter table/i);
  });

  it.each(COLUMNAS)("%s.%s: guard por tipo y ×100 con cast previo", (tabla, columna) => {
    const bloques = codigo.split(/\n\s*if exists/).slice(1);
    const propios = bloques.filter((b) =>
      b.includes(`table_name = '${tabla}'`) && b.includes(`column_name = '${columna}'`)
    );
    expect(propios).toHaveLength(1);
    const bloque = propios[0]!;
    expect(bloque).toContain("data_type = 'integer'");
    expect(bloque).toContain(
      `alter table "${tabla}" alter column "${columna}" type bigint using "${columna}"::bigint * 100;`
    );
  });

  it("cada alter tiene su guard (no hay alters sueltos)", () => {
    const alters = codigo.match(/alter table/gi) ?? [];
    const guards = codigo.match(/data_type = 'integer'/g) ?? [];
    expect(alters).toHaveLength(COLUMNAS.length);
    expect(guards).toHaveLength(COLUMNAS.length);
  });

  it("el schema declara esas columnas como bigint, y ningún otro monto quedó integer", () => {
    const tablas = Object.values(schema as Record<string, unknown>).filter((t): t is PgTable =>
      is(t, PgTable)
    );
    const porNombre = new Map(tablas.map((t) => [getTableConfig(t).name, getTableConfig(t)]));
    for (const [tabla, columna] of COLUMNAS) {
      const col = porNombre.get(tabla)?.columns.find((c) => c.name === columna);
      expect(col?.getSQLType(), `${tabla}.${columna}`).toBe("bigint");
    }
    const montos = /^(amount|cost|hourly_rate|list_price|price)$/;
    for (const [tabla, cfg] of porNombre) {
      for (const c of cfg.columns) {
        if (montos.test(c.name)) {
          expect(c.getSQLType(), `${tabla}.${c.name}`).toBe("bigint");
        }
      }
    }
  });
});
