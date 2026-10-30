import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los puntos de escritura/lectura de evaluaciones y certificados consultan la
 * regla de `src/server/taller-config.ts`. Una superficie nueva que se olvide
 * la ve este test.
 */
const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const EVALUACIONES: Record<string, RegExp> = {
  "src/server/grading.ts": /exigirEvaluacionesDe(Grupo|Evaluacion)\(/,
  "src/server/submissions.ts": /grupoTieneEvaluacionesPorId\(|exigirEvaluacionesDeGrupo\(/,
  "src/server/corrections.ts": /exigirEvaluacionesDeEvaluacion\(|evaluacionEsDeGrupoConEvaluaciones\(/,
  "src/server/extension-requests.ts": /exigirEvaluacionesDeEvaluacion\(|grupoTieneEvaluacionesPorId\(/,
  "src/server/teacher-portal.ts": /grupoTieneEvaluacionesPorId\(/,
  "src/app/api/cohorts/[id]/extension-requests/route.ts": /exigirEvaluacionesDeGrupo\(/,
};

describe("taller sin evaluaciones / sin certificado: validación en el backend", () => {
  for (const [archivo, re] of Object.entries(EVALUACIONES)) {
    it(`${archivo} consulta la regla de evaluaciones`, () => {
      expect(leer(archivo)).toMatch(re);
    });
  }

  it("grading.ts la aplica en crear, plantilla, resultados, copiar, tomar y consigna", () => {
    const src = leer("src/server/grading.ts");
    expect((src.match(/exigirEvaluacionesDe(Grupo|Evaluacion)\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("emitirCertificado rechaza la emisión nueva de un grupo que no emite", () => {
    const src = leer("src/server/certificates.ts");
    expect(src).toMatch(/grupoEmiteCertificado\(enrollment\)/);
    // y va ANTES del certificado ya emitido: lo emitido queda suspendido (no se borra)
    expect(src.indexOf("grupoEmiteCertificado(enrollment)")).toBeLessThan(src.indexOf("if (existing[0])"));
  });

  it("la lectura de certificados suspendidos pasa por la visibilidad de resultado-final (noEmite)", () => {
    expect(leer("src/lib/resultado-final.ts")).toContain("afirmado?.noEmite");
    expect(leer("src/server/resultados-confirmados.ts")).toContain("noEmite: noEmite(id)");
  });

  it("el resultado final se confirma también sin evaluaciones (no hay bloqueo del grupo)", () => {
    for (const f of [
      "src/server/final-results.ts",
      "src/app/api/cohorts/[id]/final-results/route.ts",
      "src/server/resultados-confirmados.ts",
    ]) {
      expect(leer(f), f).not.toMatch(/exigirEvaluacionesDe|grupoTieneEvaluaciones/);
    }
    const tp = leer("src/server/teacher-portal.ts");
    const desde = tp.indexOf("export async function teacherFinalResults");
    expect(tp.slice(desde, desde + 1800)).not.toMatch(/grupoTieneEvaluacionesPorId/);
  });

  it("Tareas de Hoy genera 'resultados' para un taller cursable (solo Marketing queda afuera)", () => {
    const src = leer("src/server/tareas-del-dia.ts");
    const d = src.indexOf("async function gruposSinResultadoFinal");
    expect(src.slice(d, d + 1500)).toContain("cursoNoEsTaller(");
  });

  it("la emisión masiva exige que el grupo emita", () => {
    expect(leer("src/app/api/cohorts/[id]/certificates/route.ts")).toMatch(/exigirCertificadoDeGrupo\(/);
  });

  it("el servidor fuerza 'sí' fuera de los talleres al guardar el grupo", () => {
    expect(leer("src/server/courses.ts")).toMatch(/configAGuardar\(/);
  });
});
