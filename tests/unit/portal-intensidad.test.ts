import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 020 (T021/T023, DV-003/FR-006/SC-005) — La intensidad "portal", y su
 * barrera.
 *
 * La decisión que ordena la fase: **corrección para todos, personalidad para
 * los portales.** El staff mira el panel ocho horas por día y ahí lo apagado
 * es una virtud; el alumno entra tres minutos dos veces por semana y ahí el
 * mismo silencio se lee como que no pasa nada.
 *
 * Un rediseño que alegra al alumno y le arruina el día al equipo es un
 * rediseño fallido, y este archivo es lo que lo impide.
 */

const CSS = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function bloquePortal(): string {
  const i = CSS.indexOf('[data-surface="portal"]');
  if (i < 0) return "";
  return CSS.slice(CSS.indexOf("{", i), CSS.indexOf("}", i));
}

describe("T021 — la intensidad existe y es un juego de TOKENS", () => {
  it("declara el bloque de portal", () => {
    expect(bloquePortal().length).toBeGreaterThan(20);
  });

  /**
   * **Un sistema con dos intensidades, no dos diseños.** Dos diseños se
   * mantienen por separado y se separan en tres meses: uno recibe un arreglo y
   * el otro no. Por eso lo que cambia son tokens, y el bloque tiene que ser
   * chico.
   */
  it("es un puñado de tokens, no un tema paralelo", () => {
    const tokens = [...bloquePortal().matchAll(/--[\w-]+:/g)].length;
    expect(tokens, "el bloque creció como para ser un segundo tema").toBeLessThan(12);
  });

  it("se enciende con un atributo en el layout del portal", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "src/app/(portal)/layout.tsx"),
      "utf8"
    );
    expect(layout).toContain('data-surface="portal"');
  });
});

describe("T023 — el panel del staff no pierde su herramienta", () => {
  /**
   * **La barrera.** Si la intensidad de portal redefiniera `--bg` o
   * `--bg-panel`, cambiaría la superficie sobre la que cae TODO el texto, y
   * las garantías de contraste —calculadas contra el fondo del tema— dejarían
   * de valer sin que ningún test se entere.
   *
   * Se probó tintar la superficie con `--accent-tint`: el peor caso, un acento
   * casi negro, dejaba `--text-3` en **4.44:1**. Por eso la marca se hace
   * presente en los ELEMENTOS acentuados, no en el fondo bajo el texto.
   */
  it("la intensidad NO redefine ninguna superficie de texto", () => {
    const prohibidos = ["--bg:", "--bg-subtle:", "--bg-panel:", "--text", "--border:"];
    const bloque = bloquePortal();
    for (const p of prohibidos) {
      expect(
        bloque.includes(p),
        `la intensidad de portal redefine ${p}, y eso invalida el contraste`
      ).toBe(false);
    }
  });

  /**
   * FR-006/SC-005 — La densidad del panel no baja. `--row-py` es lo que
   * decide cuántas conversaciones entran sin hacer scroll, y `text-sm` /
   * `text-xs` son el cuerpo de las tablas.
   */
  it("la densidad de las filas no cambió", () => {
    expect(CSS, "--row-py se movió: entran menos conversaciones").toContain(
      "--row-py: 11px"
    );
  });

  it("la escala solo agrandó los pasos de TITULAR", () => {
    const config = readFileSync(
      path.join(process.cwd(), "tailwind.config.ts"),
      "utf8"
    );
    const fontSize = config.slice(config.indexOf("fontSize"));
    const hasta = fontSize.slice(0, fontSize.indexOf("},"));
    for (const cuerpo of ["xs:", "sm:", "base:"]) {
      expect(
        hasta.includes(cuerpo),
        `se remapeó \`text-${cuerpo.replace(":", "")}\`: eso baja la densidad del panel`
      ).toBe(false);
    }
  });

  /**
   * Y la parte que no se puede resolver leyendo CSS: que nadie encienda la
   * intensidad de portal en el PANEL.
   *
   * La lista es explícita para que sumar una superficie sea una decisión
   * visible en el diff, no un silencio. Lo que el test protege no es "solo el
   * portal": es que el panel del staff conserve su densidad (FR-006). Una
   * superficie que no es el panel puede encenderla si corresponde — el bloque
   * `[data-surface="portal"]` no puede redefinir tokens de texto ni de fondo,
   * y de eso se encarga la prueba de arriba.
   */
  const CON_INTENSIDAD_PORTAL: Record<string, string> = {
    "src/app/(portal)/layout.tsx": "el portal, para lo que se creó",
    // 021 — El acceso no es una pantalla de trabajo: es la puerta, y la ve
    // todo el mundo antes de saber de qué lado del producto está.
    "src/app/(auth)/layout.tsx": "la pantalla de acceso",
  };

  it("`data-surface=portal` no se enciende fuera de las superficies declaradas", () => {
    const encendidos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) recorrer(full);
        else if (e.name.endsWith(".tsx")) {
          if (readFileSync(full, "utf8").includes('data-surface="portal"')) {
            encendidos.push(path.relative(process.cwd(), full).replace(/\\/g, "/"));
          }
        }
      }
    };
    recorrer(path.join(process.cwd(), "src"));

    const noDeclarados = encendidos.filter((f) => !(f in CON_INTENSIDAD_PORTAL));
    expect(
      noDeclarados,
      `superficies con intensidad de portal sin declarar:\n${noDeclarados.join("\n")}`
    ).toEqual([]);

    // Una excepción que ya no existe es basura que confunde.
    const fantasmas = Object.keys(CON_INTENSIDAD_PORTAL).filter(
      (f) => !encendidos.includes(f)
    );
    expect(fantasmas, `declaradas sin uso: ${fantasmas.join(", ")}`).toEqual([]);
  });
});
