import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 012 (T028, corrección) — Las superficies SIN sesión también tienen que
 * declarar su organización.
 *
 * **El bug que este archivo existe para que no vuelva.** Cuando la 012 encendió
 * RLS, la app pasó a conectarse como `cadit_app`, un rol SUJETO a las
 * políticas. Desde entonces, toda consulta que no declare `app.current_org`
 * ve **cero filas** — y lo hace en silencio: no hay error, no hay log, la
 * respuesta es sintácticamente correcta y viene vacía.
 *
 * Las cinco rutas públicas quedaron así durante todo ese tiempo. El catálogo
 * del sitio comercial devolvía `{"courses":[],"categories":[]}` con 21 cursos
 * publicados en la base, y la verificación de certificados decía "no
 * encontrado" para certificados que existían.
 *
 * No lo detectó nada porque **una lista vacía por RLS es indistinguible de una
 * lista vacía de verdad**. Lo reportó el dueño: "el endpoint de cursos está
 * devolviendo vacío en mi web".
 *
 * `CLAUDE.md` ya decía que había que envolverlas. Este test lo hace cumplir.
 */

const PUBLIC_DIR = path.join(process.cwd(), "src", "app", "api", "public");

function rutas(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...rutas(full));
    else if (e.name === "route.ts") out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(PUBLIC_DIR, f).replace(/\\/g, "/");

describe("las rutas públicas declaran su organización", () => {
  const archivos = rutas(PUBLIC_DIR);

  it("encuentra las rutas públicas", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(5);
  });

  /**
   * `withOrganization` abre la transacción y ejecuta el `SET LOCAL
   * app.current_org` que las políticas necesitan. Sin él, la ruta corre fuera
   * de todo alcance y RLS le devuelve la nada.
   */
  it("todas usan withOrganization", () => {
    const sinAlcance: string[] = [];
    for (const f of archivos) {
      const src = readFileSync(f, "utf8");
      // Las que solo hacen preflight de CORS no tocan datos.
      const tocaDatos = /@\/server\//.test(src);
      if (tocaDatos && !src.includes("withOrganization(")) sinAlcance.push(rel(f));
    }
    expect(
      sinAlcance,
      `rutas públicas que consultan datos SIN declarar la organización — RLS les va a devolver 0 filas en silencio:\n${sinAlcance.join("\n")}`
    ).toEqual([]);
  });

  /**
   * El error que hace invisible al bug: devolver 200 con una lista vacía
   * cuando no se pudo determinar la organización. Desde afuera es idéntico a
   * "no hay cursos", y por eso pasó desapercibido tanto tiempo.
   */
  it("ninguna resuelve la organización a mano dentro del handler", () => {
    const sospechosas: string[] = [];
    for (const f of archivos) {
      const src = readFileSync(f, "utf8");
      if (src.includes("resolveSoleOrganizationId") && !src.includes("withOrganization(")) {
        sospechosas.push(rel(f));
      }
    }
    expect(sospechosas, sospechosas.join("\n")).toEqual([]);
  });
});
