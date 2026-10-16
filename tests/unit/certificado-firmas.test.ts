import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { describe, expect, it } from "vitest";
import {
  DESCENDENTE_POPPINS,
  MAX_DESCRIPCION_CERTIFICADO,
  TOPE_DE_FIRMAS,
  acomodarDescripcion,
  diagramaDe,
  ultimaLineaDeBase,
  type Medidor,
} from "@/lib/certificado";

/**
 * 038 — El párrafo NUNCA llega a las firmas.
 *
 * Pasó en la primera muestra: la cuarta línea de la descripción del módulo II
 * de Luis quedaba atravesada por el trazo de la firma del Coordinador. Se mide
 * con la fuente REAL (Poppins Regular, del repo) —la misma con la que dibuja
 * el PDF y valida la carga del curso— y con los textos más largos posibles.
 */

const fuente = fontkit.create(
  readFileSync(path.join(process.cwd(), "assets/certificados/fonts/poppins/Poppins-Regular.ttf"))
);
const medir: Medidor = (t, size) => (fuente.layout(t).advanceWidth / fuente.unitsPerEm) * size;

/** 400 caracteres de texto corriente, como los párrafos del ejemplo. */
const LARGO_PERMITIDO = (
  "El alumno está apto para entender el trabajo de un proyecto desde cero, leer e interpretar un " +
  "modelo para su uso posterior, o para dirigir el management y la implementación en un equipo de " +
  "trabajo. Se utilizaron 2 softwares diferentes que abarcan las especialidades de Arquitectura " +
  "(Autodesk REVIT), Estructura (Autodesk REVIT) e Infraestructura (Autodesk Civil), con prácticas " +
  "semanales y un proyecto final integrador."
).slice(0, MAX_DESCRIPCION_CERTIFICADO);

const TEXTOS = {
  "el de Luis (módulo II, 4 líneas)":
    "El alumno está apto para entender el trabajo de un proyecto desde cero, leer e interpretar un modelo para su uso posterior, o para dirigir el management y la implementación en un equipo de trabajo. Se utilizaron 2 softwares diferentes que abarcan las especialidades de Arquitectura (Autodesk REVIT), Estructura (Autodesk REVIT) e Infraestructura (Autodesk Civil).",
  "el más largo permitido (400 caracteres)": LARGO_PERMITIDO,
  "400 letras anchas, que no entran": "MMMMMMMMM ".repeat(40),
};

describe("la descripción queda por encima del trazo más alto de las firmas", () => {
  it("el descendente declarado es el de la fuente", () => {
    expect(DESCENDENTE_POPPINS).toBeCloseTo(-fuente.descent / fuente.unitsPerEm, 3);
  });

  for (const formato of ["modulo", "curso"] as const) {
    for (const [nombre, texto] of Object.entries(TEXTOS)) {
      it(`${formato}: ${nombre}`, () => {
        const caja = diagramaDe(formato).descripcion!;
        const a = acomodarDescripcion(texto, medir, caja);
        const piso = ultimaLineaDeBase(a) - DESCENDENTE_POPPINS * a.size;
        expect(piso).toBeGreaterThan(TOPE_DE_FIRMAS[formato]);
        expect(a.size).toBeGreaterThanOrEqual(caja.minSize);
        // Y no sube hasta la raya.
        expect(a.primeraLinea).toBeLessThanOrEqual(caja.techo);
        for (const l of a.lineas) expect(medir(l, a.size)).toBeLessThanOrEqual(caja.ancho + 0.01);
      });
    }
  }

  it("el texto más largo permitido entra entero (la carga no lo rechaza)", () => {
    expect(acomodarDescripcion(LARGO_PERMITIDO, medir, diagramaDe("modulo").descripcion!).entra).toBe(true);
  });
});
