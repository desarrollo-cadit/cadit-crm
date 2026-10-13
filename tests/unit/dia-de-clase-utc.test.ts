import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un día de clase (`class_session.date`, `cohort.start_date`) es la medianoche
 * UTC de ese día. Formateado con la zona del navegador, en Montevideo (UTC-3)
 * se lee como las 21:00 del día ANTERIOR: una cohorte de lunes, miércoles y
 * viernes aparecía martes, jueves y domingo.
 *
 * Las pantallas que pintan días de clase tienen que fijar `timeZone: "UTC"`.
 */
const PANTALLAS_DE_CLASES = [
  "src/components/cohorts/classes-client.tsx",
  "src/components/cohorts/program-classes-client.tsx",
  "src/components/cohorts/attendance-client.tsx",
];

describe("los días de clase se formatean en UTC", () => {
  for (const archivo of PANTALLAS_DE_CLASES) {
    it(archivo, () => {
      const fuente = readFileSync(join(process.cwd(), archivo), "utf8");
      const llamadas = [...fuente.matchAll(/toLocaleDateString\([^)]*\)/gs)].map((m) => m[0]);
      expect(llamadas.length).toBeGreaterThan(0);
      for (const llamada of llamadas) {
        expect(llamada, `${archivo}: ${llamada}`).toContain('timeZone: "UTC"');
      }
    });
  }
});
