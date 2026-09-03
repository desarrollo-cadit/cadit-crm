import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  capabilitiesFor,
  CAPABILITIES,
  SYSTEM_ROLES,
  type Capability,
} from "@/lib/capabilities";

/**
 * 012 (T030, DV-006) — Las 4 cuentas entran y operan igual que antes.
 *
 * Este archivo compara, capacidad por capacidad, lo que cada cuenta PODÍA
 * antes de todo el ciclo contra lo que va a poder después de la migración
 * 0028. La única diferencia admitida es la que el dueño resolvió en DV-006 y
 * que la fase 1 dejó anotada para más adelante.
 *
 * No es ceremonia: son 4 personas reales que mañana abren el sistema.
 */

/**
 * El punto de partida: cómo se comportaba el CRM ANTES de la fase 1, cuando
 * la única verificación de permisos en todo el código era `role === "soporte"`.
 * `owner` y `member` eran indistinguibles y podían todo.
 */
const ANTES: Record<string, readonly Capability[]> = {
  owner: CAPABILITIES,
  member: CAPABILITIES,
  soporte: capabilitiesFor("soporte"),
};

/** El destino de cada cuenta según la migración 0028. */
const MIGRACION: Record<string, string> = {
  owner: "direccion",
  member: "coordinacion",
  soporte: "soporte",
};

function capacidadesDelRolNuevo(key: string): readonly Capability[] {
  const rol = SYSTEM_ROLES.find((r) => r.key === key);
  if (!rol) throw new Error(`rol de sistema no encontrado: ${key}`);
  return rol.capabilities;
}

describe("T030 — las 4 cuentas después de migrar", () => {
  it("owner → direccion: no pierde NADA", () => {
    const perdidas = ANTES.owner!.filter(
      (c) => !capacidadesDelRolNuevo(MIGRACION.owner!).includes(c)
    );
    expect(perdidas, `el propietario perdería: ${perdidas.join(", ")}`).toEqual([]);
  });

  it("soporte → soporte: no pierde NADA (son 2 cuentas)", () => {
    const perdidas = ANTES.soporte!.filter(
      (c) => !capacidadesDelRolNuevo(MIGRACION.soporte!).includes(c)
    );
    expect(perdidas, `soporte perdería: ${perdidas.join(", ")}`).toEqual([]);
  });

  /**
   * **El único cambio de permisos de todo el ciclo, y es deliberado.**
   *
   * La fase 1 lo dejó escrito en `capabilities.ts`: aplicar la proyección de
   * coordinación en ese momento le habría quitado configuración a un usuario
   * existente EN SILENCIO. Se pospuso hasta tener la pantalla de roles, que es
   * lo que permite devolvérsela con un tilde si el dueño se arrepiente.
   *
   * El test fija que la diferencia sea EXACTAMENTE esa capacidad y ninguna
   * más. Si mañana alguien recorta coordinación de más, esto falla.
   */
  it("member → coordinacion: pierde configuracion.editar y NADA MÁS", () => {
    const perdidas = ANTES.member!.filter(
      (c) => !capacidadesDelRolNuevo(MIGRACION.member!).includes(c)
    );
    expect(perdidas).toEqual(["configuracion.editar"]);
  });

  it("coordinación conserva lo que usa todos los días", () => {
    const coord = capacidadesDelRolNuevo("coordinacion");
    for (const c of [
      "academico.editar",
      "inscripciones.editar",
      "cobranza.ver",
      "cobranza.editar",
      "inbox.responder",
      "accesos.gestionar",
    ] as const) {
      expect(coord, `coordinación necesita ${c}`).toContain(c);
    }
  });
});

/**
 * La migración toca la base; el código de arriba solo describe la intención.
 * Estos casos leen el SQL para que las dos cosas no se separen.
 */
describe("T029 — la migración SQL hace lo que dice", () => {
  const SQL = readFileSync(
    path.join(process.cwd(), "drizzle", "0028_migrar_cuentas_a_roles_nuevos.sql"),
    "utf8"
  );

  it("mapea owner→direccion y member→coordinacion", () => {
    expect(SQL).toMatch(/set "role" = 'direccion'[\s\S]*?where "role" = 'owner'/);
    expect(SQL).toMatch(/set "role" = 'coordinacion'[\s\S]*?where "role" = 'member'/);
  });

  /** `soporte` ya coincide con una llave sembrada: tocarlo sería ruido. */
  it("NO toca las cuentas de soporte", () => {
    expect(SQL).not.toMatch(/where "role" = 'soporte'/);
  });

  /**
   * El `exists` no es decoración: sin él, la migración renombraría cuentas a
   * un rol que quizá no está sembrado, y esas cuentas caerían al respaldo de
   * código — que le da TODO a un rol desconocido de otra organización.
   */
  it("solo migra si el rol destino existe en esa organización", () => {
    const exists = SQL.match(/exists \(/g) ?? [];
    expect(exists.length).toBe(2);
  });
});

/**
 * 012 (T029) — La red que evita el peor error posible de esta fase.
 *
 * Si quedara una comparación por NOMBRE de rol en el código, renombrar las
 * cuentas la rompe sin que falle nada visible. Ya pasó dos veces mientras se
 * implementaba: `settings/branding` y `settings/team` chequeaban
 * `session.role !== "owner"` y habrían dejado al dueño afuera de su propia
 * configuración con un 403.
 */
describe("T029 — no quedan comparaciones por nombre de rol", () => {
  const RAIZ = path.join(process.cwd(), "src");

  function archivos(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) out.push(...archivos(full));
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
    return out;
  }

  it("ningún archivo compara `role` contra un nombre literal", () => {
    // `capabilities.ts` es la excepción legítima: ahí VIVEN los nombres.
    const exentos = ["capabilities.ts"];
    const culpables: string[] = [];

    for (const f of archivos(RAIZ)) {
      if (exentos.some((e) => f.endsWith(e))) continue;
      const src = readFileSync(f, "utf8");
      // Solo código: se ignoran los comentarios, que citan roles al explicar.
      const sinComentarios = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (/role\s*[!=]==\s*["'](owner|member|soporte)["']/.test(sinComentarios)) {
        culpables.push(path.relative(RAIZ, f).replace(/\\/g, "/"));
      }
    }

    expect(culpables, `comparan por nombre de rol:\n${culpables.join("\n")}`)
      .toEqual([]);
  });
});
