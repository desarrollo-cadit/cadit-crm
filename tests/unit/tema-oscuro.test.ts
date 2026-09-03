import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accentCssVariables, contrastRatio, THEME_SURFACES } from "@/lib/branding";

/**
 * 020 (T012/T015, FR-002/FR-005) — El tema oscuro, y lo que lo puede arruinar.
 *
 * Un tema oscuro a medias es PEOR que no tenerlo: una sola pantalla con fondo
 * claro adentro de una interfaz oscura se lee como un error, no como una
 * pantalla que quedó sin migrar. Y la manera de que eso pase es trivial —
 * alcanza con un `bg-white` escrito a mano en cualquier componente.
 *
 * Por eso el guard estructural va junto al tema: no son dos cosas.
 */

const CSS = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

/** Los `--nombre: valor;` de un bloque, por su selector. */
function bloque(selector: string): Record<string, string> {
  const i = CSS.indexOf(selector);
  if (i < 0) return {};
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("}", abre);
  const cuerpo = CSS.slice(abre, cierra);
  const out: Record<string, string> = {};
  for (const m of cuerpo.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim().toLowerCase();
  }
  return out;
}

/**
 * Los tokens del acento NO viven en el CSS estático: dependen de la
 * organización y los inyecta el servidor en el `<head>`, con los dos juegos.
 * Se excluyen de la comparación de arriba y se comprueban aparte.
 */
const ACENTO = new Set([
  "accent",
  "accent-hover",
  "accent-soft",
  "accent-tint",
  "accent-text",
]);

const CLARO = bloque(":root");
const OSCURO = bloque('[data-theme="dark"]');

describe("T012 — ningún color escrito a mano", () => {
  /**
   * Lo que este test impide, dicho sin rodeos: que alguien resuelva un color
   * con `bg-[#faf7f0]` porque es más rápido que agregar un token. Empieza así
   * y termina con la mitad de la interfaz sin responder al tema.
   *
   * Al escribirse eran **35 ocurrencias en 9 archivos**, y el peor era
   * `ui/badge.tsx`, que es un primitivo.
   */
  it("los .tsx usan tokens, no hex ni colores de Tailwind", () => {
    const infractores: string[] = [];

    /**
     * Las dos excepciones legítimas, explícitas para que agregar una sea una
     * decisión visible en el diff y no un silencio:
     *
     * - `use-css-var` y quien lo llama necesitan un hex de respaldo para el
     *   primer render, antes de que el navegador pueda leer la variable.
     * - La pantalla de Marca **es** un selector de color: ahí un hex literal
     *   es el contenido, no el estilo.
     */
    const EXCEPCIONES = [
      "src/components/dashboard/finance-panel.tsx",
      "src/components/settings/branding-client.tsx",
      "src/components/use-css-var.ts",
    ];
    /**
     * La primera versión de este patrón solo miraba `bg-gray-*` y compañía, y
     * dejaba pasar **70 usos** de la paleta de Tailwind: `bg-amber-500`,
     * `text-white`, `bg-black/60`, los ocho colores de cohorte del
     * calendario. Todos se ven bien en claro y son manchas en oscuro.
     *
     * Ahora se prohíbe la paleta entera. El nombre del color de Tailwind es la
     * pista: si aparece, es un color que no sabe en qué tema está.
     */
    const PALETA =
      "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
    const prohibido = new RegExp(
      [
        String.raw`\[#[0-9a-fA-F]{3,8}\]`,
        String.raw`\b(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow)-(white|black)\b`,
        String.raw`\b(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|shadow)-(${PALETA})-\d`,
        /**
         * 021 — El tercer agujero del guard: un hex **en una string de
         * JavaScript**, no en una clase. Ahí vivía `fill="#25D366"` —el verde
         * de WhatsApp— en el gráfico del inicio, que es el elemento más
         * visible de la pantalla, desde la 005. Y cinco más en los puntitos
         * de etapa de la bandeja.
         *
         * Cuando una librería pide un color y no una clase (Recharts), el
         * token se lee en runtime con `useCssVar`.
         */
        String.raw`["']#[0-9a-fA-F]{6}["']`,
      ].join("|")
    );

    const recorrer = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) recorrer(full);
        else if (e.name.endsWith(".tsx")) {
          const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
          if (EXCEPCIONES.includes(rel)) continue;
          /**
           * Sin comentarios: ahí los colores viejos aparecen justamente para
           * explicar por qué NO se usan. Un test que se enoja con la prosa
           * termina enseñando a no escribir comentarios — mismo criterio que
           * `route-capabilities.test.ts` con `withAuth`.
           */
          const src = readFileSync(full, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/(^|[^:])\/\/.*$/gm, "$1");
          src.split("\n").forEach((linea, i) => {
            if (prohibido.test(linea)) {
              infractores.push(
                `${path.relative(process.cwd(), full)}:${i + 1}  ${linea.trim()}`
              );
            }
          });
        }
      }
    };
    recorrer(path.join(process.cwd(), "src"));

    expect(
      infractores,
      `colores fuera de tokens:\n${infractores.join("\n")}`
    ).toEqual([]);
  });
});

describe("T013 — el tema oscuro está completo", () => {
  it("declara el bloque [data-theme=dark]", () => {
    expect(Object.keys(OSCURO).length).toBeGreaterThan(10);
  });

  /**
   * **El test que impide el tema a medias.** Cualquier token de color del tema
   * claro que no tenga contraparte oscura se queda con el valor claro, y ahí
   * aparece la mancha blanca. Se comparan las LLAVES, no los valores.
   *
   * Los tokens que no son color (radios, sombras, densidad) quedan afuera a
   * propósito: no dependen del tema.
   */
  it("cada token de color del tema claro tiene su contraparte oscura", () => {
    const esColor = (v: string) => v.startsWith("#") || v.startsWith("rgb");
    const faltan = Object.entries(CLARO)
      .filter(([k, v]) => esColor(v) && !ACENTO.has(k) && !(k in OSCURO))
      .map(([k]) => `--${k}`);

    expect(faltan, `sin versión oscura: ${faltan.join(", ")}`).toEqual([]);
  });

  /**
   * Los tokens de acento son la excepción legítima: **no pueden** vivir en el
   * CSS estático porque dependen de la organización. Los inyecta el servidor.
   *
   * Para que la excepción no sea un agujero, se comprueba que `accentCssVariables()`
   * emita los cinco en el bloque oscuro. Sin esto, "están excluidos del test"
   * sería lo mismo que "nadie los mira".
   */
  it("los del acento los emite el servidor, y los emite todos", () => {
    const css = accentCssVariables("#3f5972");
    const oscuro = css.slice(css.indexOf('[data-theme="dark"]'));
    for (const k of ACENTO) {
      expect(oscuro, `falta --${k} en el bloque oscuro inyectado`).toContain(`--${k}:`);
    }
  });

  /**
   * `THEME_SURFACES` en `src/lib/branding.ts` es la fuente de verdad del color
   * de fondo, porque es contra ese valor que se deriva el acento. Si el CSS se
   * separa, la derivación calcula el contraste contra un fondo que no existe y
   * nadie se entera hasta que un badge queda ilegible.
   */
  it("el fondo oscuro del CSS coincide con el de la derivación", () => {
    expect(OSCURO["bg"]).toBe(THEME_SURFACES.dark.bg);
    expect(CLARO["bg"]).toBe(THEME_SURFACES.light.bg);
  });
});

describe("T015 — el contraste también se cumple en oscuro", () => {
  const FONDOS = ["bg", "bg-subtle", "bg-panel", "bg-hover"] as const;
  const TEXTO = ["text", "text-2", "text-3"] as const;

  for (const t of TEXTO) {
    for (const f of FONDOS) {
      it(`--${t} sobre --${f}`, () => {
        const r = contrastRatio(OSCURO[t]!, OSCURO[f]!);
        expect(
          r,
          `--${t} (${OSCURO[t]}) sobre --${f} (${OSCURO[f]}) da ${r.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("--text-4 alcanza 3:1, su umbral de ícono", () => {
    for (const f of FONDOS) {
      const r = contrastRatio(OSCURO["text-4"]!, OSCURO[f]!);
      expect(r, `sobre --${f}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los estados y sus fondos suaves siguen siendo legibles", () => {
    for (const e of ["success", "warning", "danger"] as const) {
      const r = contrastRatio(OSCURO[e]!, OSCURO[`${e}-soft`]!);
      expect(
        r,
        `--${e} (${OSCURO[e]}) sobre --${e}-soft (${OSCURO[`${e}-soft`]}): ${r.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el borde de los campos se ve", () => {
    const r = contrastRatio(OSCURO["border-strong"]!, OSCURO["bg"]!);
    expect(r, `${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });
});
