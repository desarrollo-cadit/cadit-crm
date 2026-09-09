import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  contrastRatio,
  resolveAccentSet,
  THEME_SURFACES,
} from "@/lib/branding";

/**
 * 020 (T007/T009, FR-003) — La derivación del acento, en los dos temas.
 *
 * El bug que este archivo existe para impedir: `resolveAccentSet()` derivaba
 * `soft` y `tint` con el blanco **hardcodeado**
 * —`mix(base, WHITE, 0.82)`— porque nació en un sistema que solo tenía tema
 * claro. En tema oscuro eso devuelve el color invertido: los fondos suaves
 * salen MÁS CLAROS que el acento, y cada badge y cada botón quedan como una
 * mancha blanca en medio de una pantalla negra.
 *
 * Por eso esta fase va ANTES del tema oscuro. Construir el oscuro encima de
 * una función atada al claro es construir sobre algo que da el color al revés.
 */

const CLARO = THEME_SURFACES.light.bg;
const OSCURO = THEME_SURFACES.dark.bg;

/** ¿`a` está más cerca del fondo `bg` que `b`? */
function masCercaDelFondo(a: string, b: string, bg: string): boolean {
  return contrastRatio(a, bg) < contrastRatio(b, bg);
}

describe("T007 — los fondos suaves van HACIA el fondo del tema", () => {
  /**
   * La regla, dicha de una manera que vale para los dos temas: `soft` y `tint`
   * son el acento acercándose al fondo. En claro eso significa "más claro"; en
   * oscuro, "más oscuro". Decirlo como "más claro" fue el error original.
   */
  it("en tema claro, `soft` y `tint` se acercan al blanco", () => {
    const s = resolveAccentSet("#3f5972", "light");
    expect(masCercaDelFondo(s.soft, s.accent, CLARO)).toBe(true);
    expect(masCercaDelFondo(s.tint, s.soft, CLARO)).toBe(true);
  });

  it("en tema oscuro, `soft` y `tint` se acercan al NEGRO, no al blanco", () => {
    const s = resolveAccentSet("#3f5972", "dark");
    expect(masCercaDelFondo(s.soft, s.accent, OSCURO)).toBe(true);
    expect(masCercaDelFondo(s.tint, s.soft, OSCURO)).toBe(true);
  });

  /**
   * La comprobación que hace visible el bug viejo: en oscuro, `tint` tiene que
   * ser más oscuro que el acento. Con el blanco hardcodeado era casi blanco.
   */
  it("en oscuro, `tint` NO es casi blanco", () => {
    const s = resolveAccentSet("#3f5972", "dark");
    expect(
      contrastRatio(s.tint, "#ffffff"),
      `tint quedó en ${s.tint}, que es casi blanco`
    ).toBeGreaterThan(2);
  });

  it("`hover` siempre se separa del fondo, en los dos temas", () => {
    for (const [tema, bg] of [
      ["light", CLARO],
      ["dark", OSCURO],
    ] as const) {
      const s = resolveAccentSet("#3f5972", tema);
      expect(
        contrastRatio(s.hover, bg),
        `${tema}: hover ${s.hover} no se separa del fondo`
      ).toBeGreaterThan(contrastRatio(s.accent, bg));
    }
  });
});

describe("T008 — el contraste se mide contra el fondo DEL TEMA", () => {
  it("el acento alcanza 3:1 contra el fondo, en los dos temas", () => {
    for (const [tema, bg] of [
      ["light", CLARO],
      ["dark", OSCURO],
    ] as const) {
      const s = resolveAccentSet("#3f5972", tema);
      expect(contrastRatio(s.accent, bg), `${tema}`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * `accent-text` es el texto que va ENCIMA de `tint` —el chip, el badge de
   * marca— así que su contraste hay que medirlo contra `tint`, no contra el
   * fondo de la página. Antes no había ninguna garantía: los presets pasaban
   * por suerte, no por construcción.
   */
  it("`text` es legible sobre `tint`, en los dos temas", () => {
    for (const tema of ["light", "dark"] as const) {
      const s = resolveAccentSet("#3f5972", tema);
      expect(
        contrastRatio(s.text, s.tint),
        `${tema}: text ${s.text} sobre tint ${s.tint}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("T009 — los acentos extremos no rompen ningún tema", () => {
  /**
   * Lo que protege a una organización que elige un color imposible desde
   * Configuración → Marca. Un amarillo casi blanco en tema claro y un azul
   * casi negro en tema oscuro son los dos casos que revientan una derivación
   * ingenua, cada uno por su lado.
   */
  const EXTREMOS = [
    ["#fffde0", "amarillo casi blanco"],
    ["#050510", "azul casi negro"],
    ["#ffffff", "blanco puro"],
    ["#000000", "negro puro"],
    ["#ff0000", "rojo saturado"],
  ] as const;

  for (const [hex, nombre] of EXTREMOS) {
    for (const tema of ["light", "dark"] as const) {
      it(`${nombre} en tema ${tema}`, () => {
        const bg = THEME_SURFACES[tema].bg;
        const s = resolveAccentSet(hex, tema);

        expect(
          contrastRatio(s.accent, bg),
          `accent ${s.accent} sobre ${bg}`
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(s.text, s.tint),
          `text ${s.text} sobre tint ${s.tint}`
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("un hex inválido cae al acento por defecto y no rompe", () => {
    const s = resolveAccentSet("no-es-un-color", "dark");
    expect(contrastRatio(s.accent, OSCURO)).toBeGreaterThanOrEqual(3);
  });
});

describe("los presets del handoff siguen intactos en tema claro", () => {
  /**
   * La 002 fijó estos valores a mano. Que la derivación nueva no los pise es
   * lo que evita que esta fase le cambie el color a una organización sin que
   * nadie lo haya pedido.
   */
  for (const [hex, preset] of Object.entries(ACCENT_PRESETS)) {
    it(`${preset.label} devuelve los valores exactos`, () => {
      expect(resolveAccentSet(hex, "light")).toEqual(preset.set);
    });
  }

  it("pero en tema oscuro se derivan, porque el handoff no los tenía", () => {
    for (const [hex, preset] of Object.entries(ACCENT_PRESETS)) {
      expect(resolveAccentSet(hex, "dark")).not.toEqual(preset.set);
    }
  });
});
