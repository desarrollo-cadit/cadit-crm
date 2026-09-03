import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 012/013 — Toda tabla de dominio nueva tiene que nacer con RLS.
 *
 * El riesgo que cubre, y que casi pasa en la fase 3 de la 013: `db:generate`
 * produce las tablas y los índices, **no las políticas**. Si nadie las agrega
 * a mano, la tabla nueva queda sin la red que la migración 0025 le puso a las
 * otras 31 — y no se nota, porque con una sola organización todo funciona
 * igual. El día que haya dos, esa tabla es la que filtra.
 *
 * Este test lee el schema, saca las tablas con `organization_id` y verifica
 * que alguna migración las habilite. Es el compilador que le falta al SQL.
 */

const SCHEMA = readFileSync(
  path.join(process.cwd(), "src", "lib", "db", "schema.ts"),
  "utf8"
);

const DRIZZLE_DIR = path.join(process.cwd(), "drizzle");

const TODAS_LAS_MIGRACIONES = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(DRIZZLE_DIR, f), "utf8"))
  .join("\n");

/**
 * Las cinco tablas que quedan fuera A PROPÓSITO, con su motivo.
 *
 * No es una lista de conveniencia: son las que responden "¿de quién es esto?"
 * y por lo tanto se leen ANTES de que exista una organización que declarar.
 * Ponerles la política crea un huevo-y-gallina del que no se sale: la sesión
 * no resuelve y no entra nadie.
 */
const SIN_RLS: Record<string, string> = {
  member: "resolveMembership() la consulta para AVERIGUAR la organización",
  account_link: "resolvePortalSession() hace lo mismo para alumnos y profesores",
  role: "viaja en el mismo leftJoin que member, antes de saber la organización",
  invitation: "la maneja Better Auth por token, sin contexto de organización",
  meta_credentials:
    "el webhook la lee por phone_number_id para saber de qué organización es el mensaje",
};

/**
 * Las tablas que la migración 0025 habilita **en bucle**.
 *
 * Esa migración no escribe `alter table "contact" ...` treinta y una veces:
 * recorre un `text[]` con `format(%I)`. Buscar solo sentencias literales daría
 * 31 falsos positivos — que es exactamente lo que pasó al escribir este test.
 */
function tablasDelBucle(): Set<string> {
  const bloque = /tablas text\[\]\s*:=\s*array\[([\s\S]*?)\]/.exec(TODAS_LAS_MIGRACIONES);
  if (!bloque?.[1]) return new Set();
  return new Set(
    [...bloque[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
  );
}

/** Nombres de tabla declarados en el schema que llevan `organization_id`. */
function tablasDeDominio(): string[] {
  const out: string[] = [];
  // `pgTable("nombre", { ... organizationId ... })`
  const re = /pgTable\(\s*"([a-z_]+)"\s*,\s*\{([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SCHEMA)) !== null) {
    const [, nombre, cuerpo] = m;
    if (!nombre || !cuerpo) continue;
    if (/organizationId:\s*text\("organization_id"\)/.test(cuerpo)) out.push(nombre);
  }
  return out;
}

describe("cobertura de RLS sobre las tablas de dominio", () => {
  const tablas = tablasDeDominio();

  it("encuentra las tablas del schema", () => {
    expect(tablas.length).toBeGreaterThan(30);
    // Un par de anclas: si el parser deja de andar, esto lo dice.
    expect(tablas).toContain("contact");
    expect(tablas).toContain("enrollment");
  });

  /**
   * El caso que justifica el archivo: una tabla nueva con `organization_id`
   * que nadie habilitó. Falla acá, no en producción con dos inquilinos.
   */
  it("toda tabla con organization_id tiene RLS habilitada, o está en la lista de excepciones", () => {
    const enBucle = tablasDelBucle();
    const sinPolitica = tablas.filter((t) => {
      if (t in SIN_RLS) return false;
      if (enBucle.has(t)) return false;
      return !new RegExp(
        `alter table\\s+"?${t}"?\\s+enable row level security`,
        "i"
      ).test(TODAS_LAS_MIGRACIONES);
    });

    expect(
      sinPolitica,
      `tablas de dominio sin RLS:\n${sinPolitica.join("\n")}\n` +
        "Agregá `alter table ... enable row level security` + la política " +
        "`tenant_isolation` a la migración: `db:generate` NO las genera."
    ).toEqual([]);
  });

  /**
   * Habilitar RLS sin política deja la tabla INACCESIBLE para el rol de
   * aplicación —Postgres niega todo por defecto—, que es un fallo distinto y
   * mucho más ruidoso. Igual conviene que no pase.
   */
  it("toda tabla con RLS habilitada tiene su política tenant_isolation", () => {
    const habilitadas = [
      ...TODAS_LAS_MIGRACIONES.matchAll(
        /alter table\s+"?([a-z_]+)"?\s+enable row level security/gi
      ),
    ].map((m) => m[1]!);

    const sinPolitica = [...new Set(habilitadas)].filter(
      (t) =>
        !new RegExp(`create policy tenant_isolation on\\s+"?${t}"?`, "i").test(
          TODAS_LAS_MIGRACIONES
        ) &&
        // La 0025 las crea en bucle con `format(%I)`, no con el nombre literal.
        !/foreach t in array tablas/i.test(TODAS_LAS_MIGRACIONES)
    );

    expect(sinPolitica, `RLS sin política: ${sinPolitica.join(", ")}`).toEqual([]);
  });

  /** Una excepción que ya no existe confunde: alguien la lee y se confía. */
  it("no hay excepciones que apunten a tablas inexistentes", () => {
    const fantasmas = Object.keys(SIN_RLS).filter((t) => !tablas.includes(t));
    expect(fantasmas, `excepciones sin tabla: ${fantasmas.join(", ")}`).toEqual([]);
  });
});
