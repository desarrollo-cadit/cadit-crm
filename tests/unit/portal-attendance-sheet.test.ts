import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La planilla de asistencia del profesor: si la clase no carga (borrada,
 * reprogramada, 404, sin red), la pantalla tiene que DECIRLO y dar la vuelta.
 *
 * Antes `if (!sheet)` pintaba el esqueleto ANTES de mirar el error: la carga
 * fallida quedaba como un "cargando" eterno, sin mensaje y sin botón para
 * volver.
 */
const PLANILLA = readFileSync(
  path.join(process.cwd(), "src", "components", "portal", "portal-attendance-sheet.tsx"),
  "utf8"
);

describe("planilla de asistencia — la carga fallida no es un esqueleto eterno", () => {
  const ramaSinPlanilla = () => {
    const desde = PLANILLA.indexOf("if (!sheet)");
    expect(desde).toBeGreaterThan(-1);
    return PLANILLA.slice(desde, PLANILLA.indexOf("const sinMarcar", desde));
  };

  it("sin planilla, el error se evalúa ANTES que el esqueleto", () => {
    const rama = ramaSinPlanilla();
    const error = rama.indexOf("if (error)");
    const esqueleto = rama.indexOf("<Skeleton");
    expect(error).toBeGreaterThan(-1);
    expect(esqueleto).toBeGreaterThan(error);
  });

  it("el estado de error muestra el mensaje, vuelve a las clases y deja reintentar", () => {
    const rama = ramaSinPlanilla();
    const bloque = rama.slice(rama.indexOf("if (error)"), rama.indexOf("<Skeleton"));
    expect(bloque).toContain("{error}");
    expect(bloque).toContain("onClick={onBack}");
    expect(bloque).toContain("Volver a las clases");
    expect(bloque).toContain("Reintentar");
  });

  it("una clase que ya no existe (404) lo dice con su propio mensaje", () => {
    expect(PLANILLA).toContain("res?.status === 404");
  });
});
