import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, SYSTEM_ROLES } from "@/lib/capabilities";

/**
 * 012 (T018) — La semilla de roles vive en SQL, y el SQL no tiene compilador.
 *
 * En código, escribir `"cobranza.veer"` no compila: la lista es cerrada y
 * tipada (DV-003). Dentro de un literal `jsonb` de una migración, ese mismo
 * error pasa sin que nadie lo note — y el síntoma no es un fallo, es un rol
 * al que le falta un permiso en silencio, meses después.
 *
 * Este archivo es el compilador que le falta al SQL. **Escribiéndolo apareció
 * el primer error real**: a `soporte` le faltaba `contactos.editar`.
 */

const migracion = (archivo: string) =>
  readFileSync(path.join(process.cwd(), "drizzle", archivo), "utf8");

/**
 * 026 — La semilla ya no vive en un solo archivo.
 *
 * La 0024 sembró los tres roles de DV-006; la 0036 agrega `administracion` a
 * las organizaciones que ya existían. Un rol nuevo NO se agrega editando la
 * 0024: una migración ya aplicada no se vuelve a correr, así que ese cambio
 * no llegaría a ninguna base y el error sería invisible.
 *
 * Se leen las dos juntas porque lo que este archivo verifica es lo mismo de
 * siempre: que lo sembrado en SQL no se desvíe de `SYSTEM_ROLES`.
 */
const SQL = [
  migracion("0024_seed_roles_sistema.sql"),
  migracion("0036_seed_rol_administracion.sql"),
].join("\n");

/** Extrae las listas `jsonb` de las migraciones, en el orden en que aparecen. */
function seededLists(): string[][] {
  return [...SQL.matchAll(/'(\[[^\]]*\])'::jsonb/g)].map(
    (m) => JSON.parse(m[1]!) as string[]
  );
}

describe("la semilla SQL de roles no puede desviarse del código", () => {
  it("siembra exactamente los roles de `SYSTEM_ROLES`", () => {
    expect(seededLists()).toHaveLength(SYSTEM_ROLES.length);
    for (const { key } of SYSTEM_ROLES) {
      expect(SQL).toContain(`'${key}'`);
    }
  });

  /**
   * El caso que caza los errores de tipeo: toda capacidad escrita en el SQL
   * tiene que existir en la lista cerrada. Una inventada no otorga nada y no
   * se queja.
   */
  it("no hay capacidades inventadas ni mal escritas", () => {
    const validas = new Set<string>(CAPABILITIES);
    const desconocidas = seededLists()
      .flat()
      .filter((c) => !validas.has(c));
    expect(desconocidas, `capacidades que no existen: ${desconocidas.join(", ")}`)
      .toEqual([]);
  });

  /**
   * Y el caso que caza las OMISIONES, que es el que falló primero: cada rol
   * sembrado tiene que traer exactamente lo que dice `SYSTEM_ROLES`. Sin esto,
   * a soporte le faltaba `contactos.editar` y nadie se enteraba hasta que
   * alguien de soporte no pudiera editar un contacto.
   */
  it.each(SYSTEM_ROLES.map((r, i) => [r.key, i] as const))(
    "el rol %s sembrado coincide con SYSTEM_ROLES",
    (key, index) => {
      const sembrado = seededLists()[index]!;
      const esperado = SYSTEM_ROLES.find((r) => r.key === key)!.capabilities;
      expect([...sembrado].sort()).toEqual([...esperado].sort());
    }
  );

  /**
   * Idempotencia (constitución IV): la migración tiene que poder correr dos
   * veces. Y no puede PISAR lo que la dueña ya editó desde la pantalla — por
   * eso `do nothing` y no `do update`.
   */
  it("es idempotente y no pisa lo ya configurado", () => {
    expect(SQL).toMatch(/on conflict\s*\(\s*"organization_id"\s*,\s*"key"\s*\)\s*do nothing/i);
    expect(SQL).not.toMatch(/do update/i);
  });

  /** Id determinístico: una segunda corrida ni genera una fila candidata distinta. */
  it("el id se deriva de organización + llave, no es aleatorio", () => {
    expect(SQL).toContain("md5(");
    expect(SQL).not.toMatch(/random\(\)/);
  });
});
