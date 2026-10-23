import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-22 — La página de un grupo se "rompía" al bajar del todo: debajo de
 * la tabla del Recorrido quedaba todo en blanco, barra lateral incluida.
 *
 * Causa: los textos para lector de pantalla (`sr-only`) son `position:
 * absolute`. Dentro de un contenedor con scroll SIN `relative`, se ubican
 * contra la página y la estiran por debajo del armazón de alto fijo. Las
 * tablas compactas tienen uno por celda. Todo contenedor con scroll de estas
 * pantallas tiene que ser `relative`.
 */
const casos: [string, RegExp][] = [
  ["src/components/cohorts/cohort-tabs.tsx", /className="relative min-h-0 flex-1 overflow-y-auto"/],
  ["src/components/cohorts/recorrido-grid.tsx", /className="relative max-h-\[calc\(100vh-14rem\)\][^"]*overflow-auto/],
  ["src/components/cohorts/attendance-client.tsx", /className="relative max-h-\[calc\(100vh-16rem\)\][^"]*overflow-auto/],
];

describe("los contenedores con scroll contienen a sus absolutos", () => {
  for (const [archivo, patron] of casos) {
    it(archivo, () => {
      expect(readFileSync(archivo, "utf8")).toMatch(patron);
    });
  }
});
