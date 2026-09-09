import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 020 (T017/T018/T019, FR-007/FR-008/FR-009) — Los estados viven en los
 * primitivos.
 *
 * No se prueba que "se vea lindo": eso no se prueba. Se prueba lo que sí es
 * verificable y lo que se rompe en silencio — que los cinco controles que se
 * enfocan traten el foco igual, que el anillo tenga hueco, y que nadie
 * agregue animaciones sin respetar a quien pidió que no las haya.
 */

const UI = path.join(process.cwd(), "src/components/ui");
const leer = (f: string) => readFileSync(path.join(UI, `${f}.tsx`), "utf8");

/** Los cinco que reciben foco por teclado. */
const ENFOCABLES = ["button", "input", "select", "textarea", "checkbox"] as const;

describe("T018 — el foco se ve, y se ve igual en todos lados", () => {
  for (const p of ENFOCABLES) {
    it(`${p} declara el anillo de foco`, () => {
      const src = leer(p);
      expect(src, `${p} no usa focus-visible:ring`).toContain("focus-visible:ring-2");
    });

    /**
     * **El hueco es lo que hace visible el foco de un botón primario.**
     *
     * `ring` es el acento y el fondo de un botón primario también es el
     * acento: sin `ring-offset`, el foco sería el acento dibujado sobre el
     * acento. Invisible justo para quien navega con teclado — o sea, para
     * quien lo necesita.
     */
    it(`${p} separa el anillo del control`, () => {
      const src = leer(p);
      expect(src, `${p} no tiene ring-offset`).toContain(
        "focus-visible:ring-offset-2"
      );
      expect(
        src,
        `${p}: el hueco tiene que ser del color del FONDO, o no separa nada`
      ).toContain("focus-visible:ring-offset-background");
    });
  }

  /**
   * `outline-none` sin un anillo que lo reemplace deja el control sin ninguna
   * marca de foco. Es el error clásico: se saca el contorno feo del navegador
   * y no se pone nada en su lugar.
   */
  /**
   * La cadena completa, para que la garantía no quede a medias:
   *
   *   `ring-ring` → `ring: var(--accent)` (tailwind.config.ts)
   *   → y `acento-tema.test.ts` exige que `--accent` alcance **3:1 contra el
   *     fondo de su tema**, para cualquier acento de organización.
   *
   * Sin este eslabón, "el anillo se ve" sería una afirmación sobre una clase
   * de CSS y no sobre un color.
   */
  it("el anillo usa el acento, que tiene contraste garantizado", () => {
    const config = readFileSync(
      path.join(process.cwd(), "tailwind.config.ts"),
      "utf8"
    );
    expect(config).toMatch(/ring:\s*"var\(--accent\)"/);
  });

  it("nadie apaga el contorno sin poner un anillo", () => {
    for (const p of ENFOCABLES) {
      const src = leer(p);
      if (src.includes("outline-none")) {
        expect(src, `${p} apaga el contorno y no pone anillo`).toContain(
          "focus-visible:ring"
        );
      }
    }
  });
});

describe("T017 — tocar algo se siente", () => {
  it("el botón acusa la pulsación", () => {
    expect(leer("button")).toMatch(/active:/);
  });

  it("el botón tiene estado de carga, con `aria-busy`", () => {
    const src = leer("button");
    expect(src).toContain("loading");
    // Que lo anuncie un lector de pantalla, no solo que gire un ícono.
    expect(src, "el giro sin aria-busy solo sirve a quien puede verlo").toContain(
      "aria-busy"
    );
  });

  /**
   * Un botón que está trabajando no se puede volver a apretar. El doble clic
   * accidental es la forma más común de duplicar una acción, y acá hay
   * acciones que no se pueden deshacer.
   */
  it("mientras carga, el botón está deshabilitado", () => {
    expect(leer("button")).toContain("disabled || loading");
  });

  it("los campos acusan el hover", () => {
    for (const p of ["input", "select", "textarea"] as const) {
      expect(leer(p), `${p} no cambia con el cursor encima`).toContain("hover:");
    }
  });

  it("las filas de tabla también", () => {
    expect(leer("table")).toContain("hover:bg-accent");
  });
});

describe("T019 — se respeta a quien pidió que no haya movimiento", () => {
  /**
   * FR-009. Ya estaba implementado antes de esta fase, y agregar transiciones
   * sin mirarlo sería una regresión de accesibilidad — de las que nadie nota
   * porque a quien afecta no suele reportarlo.
   */
  const CSS = readFileSync(
    path.join(process.cwd(), "src/app/globals.css"),
    "utf8"
  );

  it("globals.css sigue teniendo el bloque de `prefers-reduced-motion`", () => {
    expect(CSS).toContain("prefers-reduced-motion: reduce");
  });

  it("y corta tanto las transiciones como las animaciones", () => {
    const bloque = CSS.slice(CSS.indexOf("prefers-reduced-motion"));
    expect(bloque).toContain("transition-duration");
    expect(bloque).toContain("animation-duration");
  });
});
