import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-06 — La migración 0049 cambia a qué apunta `enrollment.seller_id`:
 * de `user.id` a `seller.id`. Producción la aplica SOLA al arrancar el
 * contenedor, como `postgres`, así que lo que se verifica acá es el ORDEN de
 * las operaciones, que es lo único que separa "se conservaron todas las
 * asignaciones" de "se borraron en silencio":
 *
 * - Si la FK vieja sigue puesta al reescribir, el UPDATE choca (los ids nuevos
 *   no son usuarios) y la migración aborta.
 * - Si la FK nueva se pone ANTES de reescribir, choca igual.
 * - Si alguien escribe `set seller_id = null` "para limpiar", se perdió el dato
 *   con el que administración paga comisiones.
 *
 * La verificación de punta a punta —con una asignación real antes de migrar—
 * se corre contra `vocero_e2e`; esto es la red que queda en el repo.
 */

const SQL = readFileSync(
  path.join(process.cwd(), "drizzle", "0049_vendedores.sql"),
  "utf8"
).toLowerCase();

const pos = (needle: string) => {
  const i = SQL.indexOf(needle);
  expect(i, `no se encontró: ${needle}`).toBeGreaterThanOrEqual(0);
  return i;
};

describe("0049 — vendedores", () => {
  it("crea la tabla seller con organization_id NOT NULL", () => {
    expect(SQL).toMatch(/create table if not exists "seller"/);
    expect(SQL).toMatch(/"organization_id" text not null/);
  });

  it("RLS a mano: enable + tenant_isolation", () => {
    expect(SQL).toMatch(/alter table "seller" enable row level security/);
    expect(SQL).toMatch(/create policy tenant_isolation on "seller"/);
  });

  it("orden: tabla → vendedores desde usuarios → soltar FK vieja → reescribir → FK nueva", () => {
    const tabla = pos('create table if not exists "seller"');
    const sembrar = pos('insert into "seller"');
    const soltar = pos('drop constraint if exists "enrollment_seller_id_user_id_fk"');
    const reescribir = pos('update "enrollment"');
    const nueva = pos("enrollment_seller_id_seller_id_fk");
    expect(tabla).toBeLessThan(sembrar);
    expect(sembrar).toBeLessThan(soltar);
    expect(soltar).toBeLessThan(reescribir);
    expect(reescribir).toBeLessThan(nueva);
  });

  it("siembra SÓLO usuarios que ya figuran como vendedores (no todo el equipo)", () => {
    const insert = SQL.slice(pos('insert into "seller"'), pos('drop constraint if exists'));
    expect(insert).toMatch(/from "enrollment"/);
    expect(insert).not.toMatch(/from "member"/);
  });

  it("re-ejecutable: ids deterministas y on conflict do nothing", () => {
    expect(SQL).toMatch(/md5\(/);
    expect(SQL).toMatch(/on conflict do nothing/);
    expect(SQL).toMatch(/if not exists \(select 1 from pg_constraint where conname = 'enrollment_seller_id_seller_id_fk'\)/);
  });

  it("nunca anula una asignación existente", () => {
    expect(SQL).not.toMatch(/seller_id"?\s*=\s*null/);
  });
});
