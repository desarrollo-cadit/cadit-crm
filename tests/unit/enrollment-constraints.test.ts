import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@/lib/db";

/**
 * 004 — FR-004: sin DB de test disponible en `tests/unit/` (convención del
 * repo: el comportamiento contra Postgres se verifica en vivo, no mockeado —
 * ver quickstart.md), así que acá se verifica la FORMA de los dos índices
 * únicos parciales que implementan la regla de "sin duplicados", igual que
 * `tenant.test.ts` verifica el SQL de `scoped()` sin tocar una DB real.
 */
describe("enrollment: índices únicos parciales (FR-004)", () => {
  const { indexes } = getTableConfig(schema.enrollment);
  const dialect = new PgDialect();

  it("enrollment_contact_cohort_uq es único, sobre (contact_id, cohort_id), solo cuando cohort_id no es null", () => {
    const idx = indexes.find((i) => i.config.name === "enrollment_contact_cohort_uq");
    expect(idx).toBeDefined();
    expect(idx?.config.unique).toBe(true);
    const columnNames = idx?.config.columns.map((c) =>
      "name" in c ? c.name : undefined
    );
    expect(columnNames).toEqual(["contact_id", "cohort_id"]);
    const where = dialect.sqlToQuery(idx!.config.where!);
    expect(where.sql).toContain("IS NOT NULL");
  });

  it("enrollment_contact_general_uq es único, sobre (contact_id), solo cuando cohort_id es null", () => {
    const idx = indexes.find((i) => i.config.name === "enrollment_contact_general_uq");
    expect(idx).toBeDefined();
    expect(idx?.config.unique).toBe(true);
    const columnNames = idx?.config.columns.map((c) =>
      "name" in c ? c.name : undefined
    );
    expect(columnNames).toEqual(["contact_id"]);
    const where = dialect.sqlToQuery(idx!.config.where!);
    expect(where.sql).toContain("IS NULL");
    expect(where.sql).not.toContain("NOT NULL");
  });

  it("cohort_id NO es NOT NULL — un enrollment puede existir sin camada (lead general)", () => {
    const { columns } = getTableConfig(schema.enrollment);
    const cohortIdColumn = columns.find((c) => c.name === "cohort_id");
    expect(cohortIdColumn?.notNull).toBe(false);
  });
});
