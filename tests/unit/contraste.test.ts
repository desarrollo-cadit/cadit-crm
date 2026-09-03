import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/branding";

/**
 * 020 (T002, FR-001) — El contraste se CALCULA, no se mira.
 *
 * El problema de un cambio visual es que no falla: se ve mal. Un test no puede
 * decidir si algo es lindo, pero sí puede sostener lo que no es opinable — y
 * la legibilidad no es opinable.
 *
 * Este archivo nació en ROJO, con dos tokens reprobando:
 *
 *     --text-3  #8c8c95  3.33:1   ← y es `text-muted-foreground`,
 *                                    234 usos en 45 archivos
 *     --text-4  #aeaeb6  2.20:1
 *
 * O sea: más de la mitad del texto secundario de la plataforma estaba por
 * debajo del mínimo legible. Esa es la causa mecánica de que la interfaz se
 * viera lavada — antes que cualquier discusión de paleta.
 *
 * Los valores se leen de `globals.css`, no se declaran acá. Un test que
 * repite los colores a mano deja de hablar del producto en cuanto alguien
 * toca el CSS y se olvida del test.
 */

const CSS = readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8"
);

/**
 * Los `--nombre: #hex;` del bloque `:root` — **solo del claro**.
 *
 * El acotado no es cosmético: la primera versión recorría el archivo entero,
 * y en cuanto se agregó el bloque `[data-theme="dark"]` las declaraciones
 * oscuras pisaron a las claras. El test pasó a comparar texto de un tema
 * contra fondos del otro, y avisó del problema por el lado equivocado
 * (`--accent`, que el bloque oscuro ni siquiera declara).
 *
 * El contraste de los tokens oscuros se verifica en `tema-oscuro.test.ts`.
 */
function tokens(): Record<string, string> {
  const inicio = CSS.indexOf(":root");
  const fin = CSS.indexOf("}", inicio);
  const claro = CSS.slice(inicio, fin);

  const out: Record<string, string> = {};
  for (const m of claro.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]!] = m[2]!.toLowerCase();
  }
  return out;
}

const T = tokens();

/** Todos los fondos sobre los que puede caer texto en el tema claro. */
const FONDOS = ["bg", "bg-subtle", "bg-panel", "bg-hover"] as const;

/**
 * Texto normal: 4.5:1. Se comprueba contra **todos** los fondos, no solo
 * contra el blanco — el caso difícil es `--bg-hover` (`#f4f4f5`), que es el
 * más oscuro de los claros y el que aparece justo cuando el cursor está
 * encima, o sea cuando la persona está leyendo.
 */
const TEXTO_NORMAL = ["text", "text-2", "text-3", "accent"] as const;

/**
 * `--text-4` NO está en la lista de arriba, y la razón es una decisión de
 * diseño, no una excepción de conveniencia.
 *
 * Llevarlo a 4.5:1 lo volvería indistinguible de `--text-3` —quedan a 1.05×
 * uno del otro— y la escala de cuatro niveles se colapsaría en tres. Así que
 * se redefinió por su ROL: dejó de ser un token de texto y pasó a ser de
 * ícono y decoración, donde WCAG 1.4.11 pide **3:1**.
 *
 * Para que eso sea verdad y no una excusa, el único texto que lo usaba —la
 * hora del mensaje, 10.5px— se migró a `--text-3`, y el test de abajo exige
 * que no vuelva.
 */
const NO_TEXTUAL = ["text-4"] as const;

describe("T002 — el texto del sistema alcanza 4.5:1 sobre cualquier fondo", () => {
  it("los tokens existen en globals.css", () => {
    for (const t of [...TEXTO_NORMAL, ...FONDOS]) {
      expect(T[t], `falta --${t}`).toBeTruthy();
    }
  });

  for (const texto of TEXTO_NORMAL) {
    for (const fondo of FONDOS) {
      it(`--${texto} sobre --${fondo}`, () => {
        const r = contrastRatio(T[texto]!, T[fondo]!);
        expect(
          r,
          `--${texto} (${T[texto]}) sobre --${fondo} (${T[fondo]}) da ${r.toFixed(2)}:1, y el mínimo es 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("T003 — --text-4 es de ícono, y se sostiene que lo sea", () => {
  for (const t of NO_TEXTUAL) {
    for (const fondo of FONDOS) {
      it(`--${t} alcanza 3:1 sobre --${fondo}`, () => {
        const r = contrastRatio(T[t]!, T[fondo]!);
        expect(
          r,
          `--${t} (${T[t]}) sobre --${fondo} da ${r.toFixed(2)}:1, y el mínimo no textual es 3:1`
        ).toBeGreaterThanOrEqual(3);
      });
    }
  }

  /**
   * La parte que hace honesta a la excepción: si `--text-4` vuelve a usarse
   * para texto, deja de ser un token de ícono y el 3:1 pasa a ser una
   * concesión. Se mira que ningún `.tsx` lo combine con un tamaño de fuente.
   */
  it("ningún componente lo usa junto a un tamaño de texto", () => {
    const dir = path.join(process.cwd(), "src");
    const sospechosos: string[] = [];

    const recorrer = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) recorrer(full);
        else if (e.name.endsWith(".tsx")) {
          const src = readFileSync(full, "utf8");
          for (const linea of src.split("\n")) {
            if (
              linea.includes("text-text-4") &&
              /text-\[|text-xs|text-sm|text-base|text-lg/.test(linea)
            ) {
              sospechosos.push(`${path.relative(process.cwd(), full)}: ${linea.trim()}`);
            }
          }
        }
      }
    };
    recorrer(dir);

    expect(sospechosos, sospechosos.join("\n")).toEqual([]);
  });
});

/**
 * Los estados. `--success` y `--warning` se usan como TEXTO (`text-success`),
 * no como fondo, así que les corresponde el mismo 4.5:1 que a cualquier otro
 * texto — no el 3:1 de los elementos no textuales.
 */
describe("T004 — los colores de estado también son texto", () => {
  for (const estado of ["success", "warning", "danger"] as const) {
    it(`--${estado} sobre --bg y sobre --bg-panel`, () => {
      for (const fondo of ["bg", "bg-panel"] as const) {
        const r = contrastRatio(T[estado]!, T[fondo]!);
        expect(
          r,
          `--${estado} (${T[estado]}) sobre --${fondo} da ${r.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

/**
 * Los bordes no son texto: les alcanza 3:1 (WCAG 1.4.11, contraste no
 * textual). Exigirles 4.5 los volvería líneas negras y arruinaría la
 * sobriedad que la 002 buscó a propósito.
 *
 * `--border` es decorativo —separa bloques que ya se distinguen por fondo— así
 * que solo se le exige a `--border-strong`, que es el que dibuja los campos de
 * formulario y ahí sí comunica dónde se escribe.
 */
/**
 * El badge, que es donde `--success` y `--warning` viven de verdad. Su texto
 * no cae sobre el fondo de la página sino sobre su propio fondo suave, así que
 * es ESE par el que hay que medir.
 */
describe("T004 — el texto del badge sobre su fondo suave", () => {
  for (const estado of ["success", "warning", "danger"] as const) {
    it(`--${estado} sobre --${estado}-soft`, () => {
      const r = contrastRatio(T[estado]!, T[`${estado}-soft`]!);
      expect(
        r,
        `--${estado} (${T[estado]}) sobre --${estado}-soft (${T[`${estado}-soft`]}) da ${r.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("el badge ya no trae colores escritos a mano", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/ui/badge.tsx"),
      "utf8"
    );
    const hex = src.match(/\[#[0-9a-fA-F]{3,8}\]/g) ?? [];
    expect(hex, `hex hardcodeados en el badge: ${hex.join(", ")}`).toEqual([]);
  });
});

describe("T002 — el borde que delimita un control se ve", () => {
  it("--border-strong alcanza 3:1 sobre el fondo", () => {
    const r = contrastRatio(T["border-strong"]!, T["bg"]!);
    expect(r, `--border-strong da ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});

/**
 * La escala tipográfica (T005). No es contraste, pero es lo otro que aplana la
 * jerarquía: si un título y un texto secundario miden casi lo mismo, la
 * pantalla se lee como una lista de cosas del mismo peso.
 */
describe("T005 — la escala tiene saltos, no matices", () => {
  it("declara los pasos de la escala", () => {
    for (const paso of ["step-1", "step-2", "step-3"]) {
      expect(CSS, `falta --text-${paso} en globals.css`).toContain(`--text-${paso}`);
    }
  });
});
