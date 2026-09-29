import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/branding";
import { isStudentWorldPath } from "@/components/portal/portal-world";

/**
 * El mundo "campus" del portal del alumno.
 *
 * Es deliberadamente chico: NO redefine los tokens de texto ni `--bg` (la
 * tarjeta), para que valgan tal cual las garantías de contraste de Atlas y la
 * derivación del acento de la organización, que se calcula contra `--bg`. Lo
 * único propio es `--bg-page`, el gris sobre el que apoyan las tarjetas, y
 * sobre él también cae texto (el encabezado, las migas, los títulos de
 * sección). Este archivo exige que ese texto se lea.
 */

const CSS = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function bloque(selector: string): Record<string, string> {
  const i = CSS.indexOf(`${selector} {`);
  if (i < 0) return {};
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("}", abre);
  const out: Record<string, string> = {};
  for (const m of CSS.slice(abre, cierra).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim().toLowerCase();
  }
  return out;
}

const ATLAS = { claro: bloque(":root"), oscuro: bloque(':root[data-theme="dark"]') };
const CAMPUS = {
  claro: bloque('[data-world="campus"]'),
  oscuro: bloque(':root[data-theme="dark"] [data-world="campus"]'),
};

describe("el mundo campus no toca lo que garantiza el contraste", () => {
  it("declara los dos temas", () => {
    expect(CAMPUS.claro["bg-page"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(CAMPUS.oscuro["bg-page"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("no redefine la tarjeta, el texto ni el acento", () => {
    const prohibidos = ["bg", "bg-subtle", "bg-panel", "bg-hover", "text", "text-2", "text-3", "text-4", "accent"];
    for (const tema of Object.values(CAMPUS)) {
      for (const t of prohibidos) {
        expect(t in tema, `el mundo campus redefine --${t}`).toBe(false);
      }
    }
  });
});

for (const nombre of ["claro", "oscuro"] as const) {
  describe(`el texto se lee sobre el fondo de página (${nombre})`, () => {
    const fondo = CAMPUS[nombre]["bg-page"]!;
    for (const texto of ["text", "text-2", "text-3"]) {
      it(`--${texto} sobre --bg-page alcanza 4.5:1`, () => {
        expect(contrastRatio(ATLAS[nombre][texto]!, fondo)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it("--text-4 (íconos) alcanza 3:1 sobre --bg-page", () => {
      expect(contrastRatio(ATLAS[nombre]["text-4"]!, fondo)).toBeGreaterThanOrEqual(3);
    });
  });
}

/**
 * La barra lateral en el navy de la marca, en los dos temas. Adentro todo es
 * tinta blanca, y el ítem activo aclara el navy con un velo blanco: el caso
 * más exigente es ese, texto blanco sobre el navy aclarado.
 */
describe("la barra lateral se lee", () => {
  const sobre = (hex: string, alfa: number) => {
    const canal = (i: number) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - alfa) + 255 * alfa)
        .toString(16)
        .padStart(2, "0");
    return `#${canal(1)}${canal(3)}${canal(5)}`;
  };
  const barra = bloque(".barra-marca");
  const velo = (token: string) => {
    const m = barra[token]?.match(/rgba\(255,\s*255,\s*255,\s*([\d.]+)\)/);
    if (!m) throw new Error(`--${token} de la barra no es un velo blanco`);
    return Number(m[1]);
  };

  for (const nombre of ["claro", "oscuro"] as const) {
    const fondo = ATLAS[nombre]["barra-fondo"]!;
    const tinta = ATLAS[nombre]["barra-tinta"]!;

    it(`texto blanco sobre el navy (${nombre})`, () => {
      expect(contrastRatio(tinta, fondo)).toBeGreaterThanOrEqual(4.5);
    });

    it(`texto blanco sobre el ítem activo y el hover (${nombre})`, () => {
      expect(contrastRatio(tinta, sobre(fondo, velo("accent-tint")))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tinta, sobre(fondo, velo("bg-hover")))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

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
