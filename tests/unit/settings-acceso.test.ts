import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_TABS, primerDestinoDeSettings } from "@/lib/nav";

/**
 * Configuración: la pantalla a la que se entra depende de QUIÉN entra.
 *
 * El bug que estos tests fijan: `/settings` era un `redirect("/settings/whatsapp")`
 * escrito a mano, sin mirar una sola capacidad. Y el layout de la sección deja
 * pasar a quien tenga `configuracion.editar` **o** `accesos.gestionar`, que no
 * son la misma cosa.
 *
 * El resultado, con los roles REALES de la organización: Coordinación tiene
 * `accesos.gestionar` y NO tiene `configuracion.editar`, así que entraba a
 * Configuración y aterrizaba en el asistente de WhatsApp —una pantalla que no
 * puede usar—, mientras la barra lateral le mostraba únicamente "Equipo".
 *
 * Es exactamente lo que `nav.ts` llama "una puerta cerrada con cartel de
 * bienvenida", y lo que el comentario de `settings/carga/page.tsx` ya había
 * advertido para otra pantalla de esta misma sección.
 */

const leer = (rel: string) =>
  readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

describe("primerDestinoDeSettings — a dónde entra cada quien", () => {
  /**
   * LA REGRESIÓN CONCRETA. Coordinación no puede tocar la configuración de
   * WhatsApp; su única pestaña es Equipo. Ahí tiene que aterrizar.
   */
  it("con sólo `accesos.gestionar` entra a Equipo, no a WhatsApp", () => {
    expect(primerDestinoDeSettings(["accesos.gestionar"])).toBe("/settings/team");
  });

  /** Quien sí puede configurar entra a la primera pestaña de la lista. */
  it("con `configuracion.editar` entra a la primera que la exige", () => {
    expect(primerDestinoDeSettings(["configuracion.editar"])).toBe(
      SETTINGS_TABS.find((t) => t.capability === "configuracion.editar")!.href
    );
  });

  /**
   * El orden lo manda `SETTINGS_TABS`, no el orden en que vengan las
   * capacidades: la lista es la que decide qué se ve primero.
   */
  it("con las dos capacidades manda el orden de la lista, no el del argumento", () => {
    const conAmbas = primerDestinoDeSettings([
      "accesos.gestionar",
      "configuracion.editar",
    ]);
    expect(conAmbas).toBe(SETTINGS_TABS[0]!.href);
  });

  /**
   * Sin ninguna capacidad de la sección NO hay destino. Devolver una pestaña
   * igual sería mandar a alguien a un 403; quien llama decide qué hacer con el
   * `null` (hoy, volver al inicio).
   */
  it("sin capacidades de la sección devuelve null", () => {
    expect(primerDestinoDeSettings([])).toBeNull();
    expect(primerDestinoDeSettings(["cobranza.ver"])).toBeNull();
  });
});

describe("guardas estructurales de Configuración", () => {
  /**
   * El índice no puede volver a nombrar una pestaña. Si alguien escribe
   * `redirect("/settings/lo-que-sea")` a mano, este test lo caza: el destino
   * se DERIVA de las capacidades o no se deriva de nada.
   */
  it("`/settings` no redirige a una pestaña escrita a mano", () => {
    const src = leer("src/app/(app)/settings/page.tsx");
    expect(src).toContain("primerDestinoDeSettings");
    const fijos = src.match(/redirect\(\s*"\/settings\/[a-z]+"/g) ?? [];
    expect(fijos, `redirección fija a una pestaña: ${fijos.join(", ")}`).toEqual([]);
  });

  /**
   * Y CADA pantalla de la sección declara su propia capacidad.
   *
   * El gate del layout NO alcanza: acepta dos capacidades distintas, así que
   * deja entrar a alguien que no puede usar la pantalla que le toca. Es la
   * misma lección que ya habían aprendido `roles` y `carga`, y que las otras
   * cinco pantallas no habían aplicado.
   */
  it("toda pantalla de Configuración declara la capacidad que exige", () => {
    const sinGate: string[] = [];
    for (const tab of SETTINGS_TABS) {
      const rel = `src/app/(app)${tab.href}/page.tsx`;
      const src = leer(rel);
      if (!src.includes(tab.capability)) sinGate.push(rel);
    }
    expect(sinGate, `sin gate propio:\n${sinGate.join("\n")}`).toEqual([]);
  });

  /**
   * La barra lateral se DERIVA de la misma lista. Dos listas paralelas se
   * separan en cuanto alguien agrega una pestaña en una sola — que es como
   * nació este bug.
   */
  it("la barra de Configuración sale de SETTINGS_TABS", () => {
    const src = leer("src/components/settings/settings-nav.tsx");
    expect(src).toContain("SETTINGS_TABS");
    expect(
      src.match(/href:\s*"\/settings\//g) ?? [],
      "la barra vuelve a escribir la lista de pestañas"
    ).toEqual([]);
  });
});
