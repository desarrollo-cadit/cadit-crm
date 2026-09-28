import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/branding";
import { isStudentWorldPath } from "@/components/portal/portal-world";

/**
 * El mundo "Cianotipo de obra" del portal del alumno.
 *
 * A diferencia de la intensidad de portal —que tiene PROHIBIDO tocar fondos y
 * texto (`portal-intensidad.test.ts`)—, este mundo los redefine todos: es un
 * mundo propio, por decisión del dueño del producto. El precio de esa
 * libertad es este archivo, que le exige a cada par texto/fondo los mismos
 * umbrales que `contraste.test.ts` le exige a Atlas, en los dos temas.
 *
 * Los valores se LEEN de `globals.css`. Un test que repite los colores a
 * mano deja de hablar del producto en cuanto alguien toca el CSS.
 */

const CSS = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function bloque(selector: string): Record<string, string> {
  const i = CSS.indexOf(`${selector} {`);
  if (i < 0) return {};
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("}", abre);
  const out: Record<string, string> = {};
  for (const m of CSS.slice(abre, cierra).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

const TEMAS = {
  claro: bloque('[data-world="cianotipo"]'),
  oscuro: bloque(':root[data-theme="dark"] [data-world="cianotipo"]'),
};

const FONDOS = ["bg", "bg-subtle", "bg-panel", "bg-hover"];

function ratio(tema: Record<string, string>, a: string, b: string): number {
  const x = tema[a];
  const y = tema[b];
  if (!x || !y) throw new Error(`falta --${!x ? a : b}`);
  return contrastRatio(x, y);
}

describe("el mundo existe y está completo", () => {
  it("declara los dos temas", () => {
    expect(Object.keys(TEMAS.claro).length).toBeGreaterThan(20);
    expect(Object.keys(TEMAS.oscuro).length).toBeGreaterThan(20);
  });

  it("cada color del tema claro tiene su versión oscura", () => {
    const faltan = Object.keys(TEMAS.claro).filter((k) => !(k in TEMAS.oscuro));
    expect(faltan, `sin versión oscura: ${faltan.join(", ")}`).toEqual([]);
  });
});

for (const [nombre, tema] of Object.entries(TEMAS)) {
  describe(`contraste en el tema ${nombre}`, () => {
    for (const texto of ["text", "text-2", "text-3", "accent", "revision"]) {
      for (const fondo of FONDOS) {
        it(`--${texto} sobre --${fondo} alcanza 4.5:1`, () => {
          expect(ratio(tema, texto, fondo)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }

    it("--text-4 (ícono) y --border-strong (borde de campo) alcanzan 3:1", () => {
      for (const fondo of FONDOS) {
        expect(ratio(tema, "text-4", fondo)).toBeGreaterThanOrEqual(3);
      }
      expect(ratio(tema, "border-strong", "bg")).toBeGreaterThanOrEqual(3);
    });

    for (const estado of ["success", "warning", "danger"]) {
      it(`--${estado} se lee sobre la hoja y sobre su fondo suave`, () => {
        expect(ratio(tema, estado, "bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(tema, estado, "bg-panel")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(tema, estado, `${estado}-soft`)).toBeGreaterThanOrEqual(4.5);
      });
    }

    it("el texto sobre el acento y sobre un estado sólido se lee", () => {
      expect(ratio(tema, "on-accent", "accent")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tema, "on-state", "success")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(tema, "on-state", "danger")).toBeGreaterThanOrEqual(4.5);
    });

    /**
     * La lámina es azul de Prusia en los dos temas, y sobre ella va texto
     * chico (las notas del rótulo, los números de la cadena). Se mide contra
     * la lámina y contra su versión profunda, que es el hover de sus botones.
     */
    for (const tinta of ["sheet-ink", "sheet-ink-2", "sheet-ink-3", "revision-on-sheet"]) {
      it(`--${tinta} sobre la lámina alcanza 4.5:1`, () => {
        expect(ratio(tema, tinta, "sheet")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(tema, tinta, "sheet-deep")).toBeGreaterThanOrEqual(4.5);
      });
    }

    it("las líneas del rótulo se ven sobre la lámina (3:1)", () => {
      expect(ratio(tema, "sheet-line", "sheet")).toBeGreaterThanOrEqual(3);
    });
  });
}

describe("el mundo es del ALUMNO", () => {
  it("se enciende en las pantallas del alumno", () => {
    for (const ruta of [
      "/portal",
      "/portal/cursadas/enr_1",
      "/portal/cuenta",
      "/portal/certificados",
      "/portal/cursos-offline",
    ]) {
      expect(isStudentWorldPath(ruta), ruta).toBe(true);
    }
  });

  it("no se enciende en las pantallas del profesor", () => {
    for (const ruta of ["/portal/dictado", "/portal/cohortes/coh_1", "/portal/horas"]) {
      expect(isStudentWorldPath(ruta), ruta).toBe(false);
    }
  });

  /**
   * Lo que este test protege es lo mismo que protege `portal-intensidad`: que
   * el panel del staff no pierda su herramienta. El mundo solo existe adentro
   * de `PortalWorld`, y `PortalWorld` solo vive en el layout del portal.
   */
  it("solo el layout del portal monta el mundo", () => {
    const usos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) recorrer(full);
        else if (e.name.endsWith(".tsx") && /<PortalWorld\b|data-world=/.test(readFileSync(full, "utf8"))) {
          usos.push(path.relative(process.cwd(), full).replace(/\\/g, "/"));
        }
      }
    };
    recorrer(path.join(process.cwd(), "src"));
    expect(usos.sort()).toEqual([
      "src/app/(portal)/layout.tsx",
      "src/components/portal/portal-world.tsx",
    ]);
  });
});
